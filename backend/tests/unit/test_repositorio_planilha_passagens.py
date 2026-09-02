"""Sprint 1 (plano "Valor da Passagem no XLSX Oficial + Não Publicadas") — testes
do leitor isolado da Planilha de Passagens. Todas as planilhas de teste são
sintéticas, construídas via `odfpy` diretamente no teste — nenhuma dependência de
arquivo real em disco (o leitor já foi validado manualmente contra o arquivo real
de referência antes deste módulo de testes existir; ver relatório do Sprint 1).

`table:covered-table-cell` (célula coberta por mesclagem/colspan) é reproduzida
deliberadamente em alguns testes porque foi exatamente essa mecânica do ODF —
não modelada na primeira exploração — que causava desalinhamento entre o índice
de coluna do cabeçalho (que tem uma célula mesclada real, "Período", no arquivo
de referência) e das linhas de dado (sem mesclagem)."""

import pytest
from odf.opendocument import OpenDocumentSpreadsheet
from odf.table import CoveredTableCell, Table, TableCell, TableRow
from odf.text import P

from app.consulta import repositorio_planilha_passagens as repo
from app.consulta.repositorio_planilha_passagens import EstadoPassagem


def _celula_texto(texto: str | None) -> TableCell:
    celula = TableCell()
    if texto is not None:
        celula.addElement(P(text=texto))
    return celula


def _celula_numero(valor: float) -> TableCell:
    celula = TableCell(valuetype="float", value=valor)
    celula.addElement(P(text=str(valor)))
    return celula


def _linha(valores: list) -> TableRow:
    tr = TableRow()
    for valor in valores:
        if isinstance(valor, (int, float)):
            tr.addElement(_celula_numero(float(valor)))
        else:
            tr.addElement(_celula_texto(valor))
    return tr


def _criar_ods(
    caminho: str,
    linhas_dados: list[list],
    *,
    cabecalho: tuple[str, ...] = ("Ordem Bancária", "Transporte", "Valor da Passagem"),
    nome_aba: str = "Controle de Diárias",
    linhas_antes_cabecalho: list[list] | None = None,
    abas_extra: list[tuple[str, list[list]]] | None = None,
) -> None:
    """Constrói um `.ods` sintético mínimo: cabeçalho simples (sem mesclagem) nas
    3 colunas exigidas por `RUBRICAS_OBRIGATORIAS`, mais quaisquer linhas de
    título opcionais antes dele (para testar que o cabeçalho não precisa estar
    na linha 1) e abas extra opcionais (para testar seleção de aba)."""
    documento = OpenDocumentSpreadsheet()
    tabela = Table(name=nome_aba)
    for linha_titulo in linhas_antes_cabecalho or []:
        tabela.addElement(_linha(linha_titulo))
    tabela.addElement(_linha(list(cabecalho)))
    for linha_dado in linhas_dados:
        tabela.addElement(_linha(linha_dado))
    documento.spreadsheet.addElement(tabela)

    for nome_extra, linhas_extra in abas_extra or []:
        tabela_extra = Table(name=nome_extra)
        for linha_extra in linhas_extra:
            tabela_extra.addElement(_linha(linha_extra))
        documento.spreadsheet.addElement(tabela_extra)

    documento.save(caminho)


# --- Estados A-D (o "E", OB sem correspondência, só existe no cruzamento com a
# Base OB — fora do escopo deste leitor) ---


def test_le_todos_os_estados_de_valor_da_passagem(tmp_path):
    caminho = str(tmp_path / "passagens.ods")
    _criar_ods(
        caminho,
        [
            ["2026OB000001", "AVIÃO", 1657.76],  # float nativo -> NUMERICO
            ["2026OB000002", "AVIÃO", "R$ 2.225,98"],  # moeda BRL -> NUMERICO
            ["2026OB000003", "CARRO", "-"],  # traço -> AUSENTE
            ["2026OB000004", "CARRO", None],  # vazio -> AUSENTE
            ["2026OB000005", "CARRO", " "],  # só espaço -> AUSENTE (achado real)
            ["2026OB000006", "AVIÃO", "NÃO SE APLICA"],  # -> NAO_SE_APLICA
            ["2026OB000007", "CARRO", "#VALOR!"],  # erro de fórmula -> INVALIDO
            ["2026OB000008", "CARRO", "texto qualquer"],  # -> INVALIDO
        ],
    )

    tabela = repo.abrir_planilha_passagens(caminho)
    resultado = repo.linhas_passagens_por_ob(tabela)

    assert len(resultado.por_ob) == 8
    assert resultado.por_ob["2026OB000001"].estado == EstadoPassagem.NUMERICO
    assert resultado.por_ob["2026OB000001"].valor == 1657.76
    assert resultado.por_ob["2026OB000002"].estado == EstadoPassagem.NUMERICO
    assert resultado.por_ob["2026OB000002"].valor == 2225.98
    assert resultado.por_ob["2026OB000003"].estado == EstadoPassagem.AUSENTE
    assert resultado.por_ob["2026OB000003"].valor is None
    assert resultado.por_ob["2026OB000004"].estado == EstadoPassagem.AUSENTE
    assert resultado.por_ob["2026OB000005"].estado == EstadoPassagem.AUSENTE
    assert resultado.por_ob["2026OB000006"].estado == EstadoPassagem.NAO_SE_APLICA
    assert resultado.por_ob["2026OB000007"].estado == EstadoPassagem.INVALIDO
    assert resultado.por_ob["2026OB000007"].bruto == "#VALOR!"
    assert resultado.por_ob["2026OB000008"].estado == EstadoPassagem.INVALIDO


def test_nunca_transforma_ausencia_ou_ambiguidade_em_zero(tmp_path):
    """Regra permanente do plano: o leitor nunca infere/arredonda/substitui um
    valor ausente ou ambíguo por zero."""
    caminho = str(tmp_path / "passagens.ods")
    _criar_ods(
        caminho,
        [
            ["2026OB000001", "CARRO", "-"],
            ["2026OB000002", "AVIÃO", "NÃO SE APLICA"],
            ["2026OB000003", "CARRO", "#VALOR!"],
        ],
    )

    resultado = repo.linhas_passagens_por_ob(repo.abrir_planilha_passagens(caminho))

    for linha in resultado.por_ob.values():
        assert linha.valor != 0
        assert linha.estado != EstadoPassagem.NUMERICO


def test_transporte_e_preservado_para_diagnostico(tmp_path):
    caminho = str(tmp_path / "passagens.ods")
    _criar_ods(caminho, [["2026OB000001", "AVIÃO", 100.0], ["2026OB000002", "CARRO", "-"]])

    resultado = repo.linhas_passagens_por_ob(repo.abrir_planilha_passagens(caminho))

    assert resultado.por_ob["2026OB000001"].transporte == "AVIÃO"
    assert resultado.por_ob["2026OB000002"].transporte == "CARRO"


# --- Cabeçalho fora da linha 1 e com célula mesclada (achado real do arquivo
# de referência: título/subtítulo antes, "Período" ocupando 2 colunas) ---


def test_cabecalho_nao_precisa_estar_na_primeira_linha(tmp_path):
    caminho = str(tmp_path / "passagens.ods")
    _criar_ods(
        caminho,
        [["2026OB000001", "AVIÃO", 500.0]],
        linhas_antes_cabecalho=[
            ["6.1.8 Diárias e Passagens"],
            ["PAGAS ATÉ JULHO/2026"],
        ],
    )

    tabela = repo.abrir_planilha_passagens(caminho)
    resultado = repo.linhas_passagens_por_ob(tabela)

    assert resultado.por_ob["2026OB000001"].valor == 500.0


def test_cabecalho_com_celula_mesclada_nao_desalinha_colunas(tmp_path):
    """Reproduz o achado real: o cabeçalho tem uma célula "Período" mesclada
    ocupando 2 colunas (`table:covered-table-cell` na 2ª) ENTRE "Cargo" e
    "Trecho" — sem expandir a célula coberta, o índice de "Transporte"/"Valor
    da Passagem" no cabeçalho fica desalinhado em relação aos dados (que não
    têm mesclagem)."""
    caminho = str(tmp_path / "passagens.ods")
    documento = OpenDocumentSpreadsheet()
    tabela = Table(name="Controle de Diárias")

    linha_cabecalho = TableRow()
    for rotulo in ("Ordem Bancária", "Data de Pagamento", "Nome", "Cargo"):
        linha_cabecalho.addElement(_celula_texto(rotulo))
    celula_periodo = TableCell(numbercolumnsspanned="2")
    celula_periodo.addElement(P(text="Período"))
    linha_cabecalho.addElement(celula_periodo)
    linha_cabecalho.addElement(CoveredTableCell())
    for rotulo in ("Trecho", "Transporte", "Motivo", "Valor da Passagem"):
        linha_cabecalho.addElement(_celula_texto(rotulo))
    tabela.addElement(linha_cabecalho)

    tabela.addElement(
        _linha(
            [
                "2026OB000001",
                "21/01/2026",
                "FULANO DE TAL",
                "Promotor",
                "16/01/2026",
                "17/01/2026",
                "RECIFE-FORTALEZA",
                "AVIÃO",
                "Motivo qualquer",
                1657.76,
            ]
        )
    )
    documento.spreadsheet.addElement(tabela)
    documento.save(caminho)

    resultado = repo.linhas_passagens_por_ob(repo.abrir_planilha_passagens(caminho))

    linha_lida = resultado.por_ob["2026OB000001"]
    assert linha_lida.transporte == "AVIÃO"
    assert linha_lida.estado == EstadoPassagem.NUMERICO
    assert linha_lida.valor == 1657.76


# --- Seleção de aba (achado real: 2ª aba de rascunho sem cabeçalho válido) ---


def test_ignora_aba_sem_cabecalho_valido(tmp_path):
    caminho = str(tmp_path / "passagens.ods")
    _criar_ods(
        caminho,
        [["2026OB000001", "AVIÃO", 500.0]],
        abas_extra=[("Planilha1", [[123.0, 456.0]])],
    )

    tabela = repo.abrir_planilha_passagens(caminho)
    assert tabela.getAttribute("name") == "Controle de Diárias"


# --- Estrutura inválida / arquivo inválido ---


def test_estrutura_invalida_sem_coluna_obrigatoria(tmp_path):
    caminho = str(tmp_path / "passagens.ods")
    _criar_ods(caminho, [["2026OB000001", "AVIÃO"]], cabecalho=("Ordem Bancária", "Transporte"))

    with pytest.raises(repo.EstruturaPlanilhaPassagensInvalida):
        repo.abrir_planilha_passagens(caminho)


def test_arquivo_nao_encontrado(tmp_path):
    with pytest.raises(repo.PlanilhaPassagensNaoEncontrada):
        repo.abrir_planilha_passagens(str(tmp_path / "nao_existe.ods"))


def test_formato_nao_suportado_recusa_xlsx(tmp_path):
    caminho = tmp_path / "passagens.xlsx"
    caminho.write_bytes(b"nao importa o conteudo")

    with pytest.raises(repo.PlanilhaPassagensNaoEncontrada):
        repo.abrir_planilha_passagens(str(caminho))


def test_arquivo_corrompido(tmp_path):
    caminho = tmp_path / "passagens.ods"
    caminho.write_bytes(b"isto nao e um zip/ODS valido")

    with pytest.raises(repo.PlanilhaPassagensNaoEncontrada):
        repo.abrir_planilha_passagens(str(caminho))


# --- OB duplicada dentro da própria Planilha de Passagens — recusa estrutural
# da fonte inteira, nunca escolha silenciosa de qual linha usar (evita repetir
# a classe de bug do HOMO-RT-03, agora do lado da leitura). ---


def test_ob_duplicada_recusa_a_fonte_inteira(tmp_path):
    caminho = str(tmp_path / "passagens.ods")
    _criar_ods(
        caminho,
        [
            ["2026OB000001", "AVIÃO", 100.0],
            ["2026OB000001", "CARRO", "-"],
        ],
    )

    with pytest.raises(repo.EstruturaPlanilhaPassagensInvalida, match="2026OB000001"):
        repo.linhas_passagens_por_ob(repo.abrir_planilha_passagens(caminho))


def test_linhas_que_nao_parecem_ob_sao_ignoradas_sem_erro(tmp_path):
    """Linhas de título/legenda/rodapé (ex.: "Total (j)", texto de fundamento
    legal) não têm o formato de OB — descartadas em silêncio, mesmo critério
    de "moldura da planilha", não dado."""
    caminho = str(tmp_path / "passagens.ods")
    _criar_ods(
        caminho,
        [
            ["2026OB000001", "AVIÃO", 100.0],
            ["Total (j)", None, None],
            ["Fonte de Informação: DIMOT", None, None],
        ],
    )

    resultado = repo.linhas_passagens_por_ob(repo.abrir_planilha_passagens(caminho))

    assert len(resultado.por_ob) == 1
    assert "2026OB000001" in resultado.por_ob
