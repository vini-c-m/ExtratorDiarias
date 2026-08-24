"""Micro-sprint 3F — testes do gerador do XLSX final do Relatório de
Diárias — Portal da Transparência. Fixtures 100% sintéticas (nenhum
CPF/nome/OB/SEI real) — nunca reimplementa RN01-RN07 aqui: `ResultadoRevisado`
é construído diretamente pelos campos do dataclass, exatamente como o
backend homologado (Micro-sprint 3C) já entrega."""

import glob
import os
from datetime import date, datetime

import openpyxl
import pytest

from app.domain.entities.ordem_bancaria import OrdemBancaria
from app.domain.entities.registro_controle import ClassificacaoSei, RegistroControle
from app.domain.relatorio_transparencia.decisao import (
    AcaoDecisao,
    DecisaoHumana,
    EstadoRevisao,
    OcorrenciaNaoPublicavel,
    ResultadoRevisado,
    RevisaoComEstado,
)
from app.domain.relatorio_transparencia.motor_decisao import (
    CandidatoNormal,
    OcorrenciaFinanceira,
    RevisaoNecessaria,
)
from app.planilha.escritor_relatorio_transparencia import (
    DestinoJaExiste,
    RelatorioBloqueadoPorPendencias,
    TemplateEstruturalmenteInvalido,
    _NOME_ABA_DADOS,
    _PRIMEIRA_LINHA_DADOS,
    gerar_xlsx_relatorio_transparencia,
)
from tests.fixtures.template_relatorio_transparencia_sintetico import construir_template_sintetico


# --- Helpers de fixture (nunca reimplementam RN) --------------------------


def _ordem(
    *,
    ob="2026OB000001",
    dh="2026DH000001",
    linha=2,
    nome="FULANO DE TAL",
    cargo="Cargo de Teste",
    periodo_inicial=date(2026, 1, 10),
    periodo_final=date(2026, 1, 10),
    trecho="RECIFE-GARANHUNS",
    transporte="CARRO",
    motivo="Motivo de teste",
    valor=154.09,
    data_pagamento=datetime(2026, 1, 15, 9, 0, 0),
) -> OrdemBancaria:
    return OrdemBancaria(
        linha=linha,
        dh=dh,
        ob=ob,
        credor=nome,
        situacao="Paga",
        data_pagamento=data_pagamento,
        sei="19.20.0001.0000001/2026-01",
        cpf="11111111111",
        nome=nome,
        cargo=cargo,
        periodo_inicial=periodo_inicial,
        periodo_final=periodo_final,
        cidade_origem=None,
        cidade_destino=None,
        transporte=transporte,
        motivo=motivo,
        valor=valor,
        valor_bruto_sem_formula=valor,
        restituicao=None,
        duplicidade="Único",
        item_de_gasto="33901401",
        trecho=trecho,
    )


def _registro(*, dh="2026DH000001", linha=2, integral=0, parcial=1) -> RegistroControle:
    return RegistroControle(
        linha=linha,
        dh=dh,
        sei="19.20.0001.0000001/2026-01",
        sei_classificacao=ClassificacaoSei.VALIDO,
        doc_origem="PJTESTE",
        cpf="11111111111",
        periodo_inicial=date(2026, 1, 10),
        periodo_final=date(2026, 1, 10),
        cidade_origem="RECIFE",
        cidade_destino="GARANHUNS",
        trecho="RECIFE-GARANHUNS",
        motivo="Motivo de teste",
        transporte="CARRO",
        valor_total_diarias=154.09,
        quantidade_diaria_integral=integral,
        quantidade_diaria_parcial=parcial,
    )


def _candidato(*, registros_controle=None, **kwargs_ordem) -> CandidatoNormal:
    ordem = _ordem(**kwargs_ordem)
    registros = registros_controle if registros_controle is not None else [_registro(dh=ordem.dh, integral=0, parcial=1)]
    ocorrencia = OcorrenciaFinanceira(dh=ordem.dh, ordem_bancaria=ordem, registros_controle=registros)
    return CandidatoNormal(ocorrencia=ocorrencia, registros_controle=registros)


def _resultado(*, candidatos=None, nao_publicaveis=None, revisoes=None) -> ResultadoRevisado:
    return ResultadoRevisado(
        candidatos_publicaveis=candidatos or [],
        ocorrencias_nao_publicaveis=nao_publicaveis or [],
        revisoes=revisoes or [],
        diagnosticos_repeticao_fisica=[],
    )


@pytest.fixture()
def template(tmp_path):
    caminho = str(tmp_path / "template_sintetico.xlsx")
    construir_template_sintetico(caminho)
    return caminho


def _gerar(resultado, template, destino, **overrides):
    parametros = {
        "caminho_template": template,
        "caminho_destino": destino,
        "ano_exercicio": 2026,
        "mes_referencia": 1,
        "hoje": date(2026, 2, 1),
    }
    parametros.update(overrides)
    return gerar_xlsx_relatorio_transparencia(resultado, **parametros)


# --- Bloqueio (item 21, obrigatório) ---------------------------------------


def test_bloqueia_geracao_quando_ha_revisao_pendente_mesmo_chamado_direto(tmp_path, template):
    revisao = RevisaoNecessaria(regra="RN07", motivo="Motivo de teste", ocorrencias=[])
    resultado = _resultado(revisoes=[RevisaoComEstado(revisao=revisao, estado=EstadoRevisao.PENDENTE)])
    destino = str(tmp_path / "saida.xlsx")

    with pytest.raises(RelatorioBloqueadoPorPendencias):
        _gerar(resultado, template, destino)

    assert not os.path.exists(destino)


def test_bloqueia_geracao_quando_decisao_esta_adiada(tmp_path, template):
    revisao = RevisaoNecessaria(regra="RN07", motivo="Motivo de teste", ocorrencias=[])
    resultado = _resultado(revisoes=[RevisaoComEstado(revisao=revisao, estado=EstadoRevisao.ADIADA)])
    destino = str(tmp_path / "saida.xlsx")

    with pytest.raises(RelatorioBloqueadoPorPendencias):
        _gerar(resultado, template, destino)


def test_permite_geracao_quando_todas_as_revisoes_estao_decididas(tmp_path, template):
    revisao = RevisaoNecessaria(regra="RN07", motivo="Motivo de teste", ocorrencias=[])
    decisao = DecisaoHumana(
        identidade_grupo="g1",
        regra="RN07",
        obs_envolvidas=frozenset({"2026OB000001"}),
        fingerprint_evidencias="fp1",
        acao=AcaoDecisao.PUBLICAR,
        autor="teste@teste.com",
        decidido_em=datetime(2026, 1, 20),
    )
    resultado = _resultado(
        candidatos=[_candidato()],
        revisoes=[RevisaoComEstado(revisao=revisao, estado=EstadoRevisao.DECIDIDA, decisao=decisao)],
    )
    destino = str(tmp_path / "saida.xlsx")

    resultado_gerado = _gerar(resultado, template, destino)

    assert os.path.exists(destino)
    assert resultado_gerado.total_ocorrencias == 1


# --- Proteção de destino / template (item 17) ------------------------------


def test_nunca_sobrescreve_destino_existente(tmp_path, template):
    destino = str(tmp_path / "saida.xlsx")
    with open(destino, "wb") as f:
        f.write(b"conteudo previo")

    with pytest.raises(DestinoJaExiste):
        _gerar(_resultado(), template, destino)

    with open(destino, "rb") as f:
        assert f.read() == b"conteudo previo"


def test_template_inexistente_gera_erro_explicito(tmp_path):
    destino = str(tmp_path / "saida.xlsx")
    with pytest.raises(TemplateEstruturalmenteInvalido):
        _gerar(_resultado(), str(tmp_path / "nao_existe.xlsx"), destino)


def test_template_sem_aba_obrigatoria_gera_erro_explicito(tmp_path):
    caminho_template = str(tmp_path / "template_invalido.xlsx")
    wb = openpyxl.Workbook()
    wb.active.title = "Aba Qualquer"
    wb.save(caminho_template)
    destino = str(tmp_path / "saida.xlsx")

    with pytest.raises(TemplateEstruturalmenteInvalido):
        _gerar(_resultado(), caminho_template, destino)


def test_nao_deixa_arquivo_temporario_apos_sucesso(tmp_path, template):
    destino = str(tmp_path / "saida.xlsx")
    _gerar(_resultado(candidatos=[_candidato()]), template, destino)
    temporarios = glob.glob(str(tmp_path / "tmp*.xlsx"))
    assert temporarios == []


def test_nao_deixa_arquivo_temporario_apos_falha_de_bloqueio(tmp_path, template):
    revisao = RevisaoNecessaria(regra="RN07", motivo="Motivo de teste", ocorrencias=[])
    resultado = _resultado(revisoes=[RevisaoComEstado(revisao=revisao, estado=EstadoRevisao.PENDENTE)])
    destino = str(tmp_path / "saida.xlsx")

    with pytest.raises(RelatorioBloqueadoPorPendencias):
        _gerar(resultado, template, destino)

    temporarios = glob.glob(str(tmp_path / "tmp*.xlsx"))
    assert temporarios == []


# --- Conteúdo ---------------------------------------------------------------


def test_zero_ocorrencias_gera_planilha_sem_linhas_de_dados(tmp_path, template):
    destino = str(tmp_path / "saida.xlsx")
    resultado_gerado = _gerar(_resultado(), template, destino)

    assert resultado_gerado.total_ocorrencias == 0
    wb = openpyxl.load_workbook(destino)
    ws = wb[_NOME_ABA_DADOS]
    assert ws[f"A{_PRIMEIRA_LINHA_DADOS}"].value.startswith("Total")
    assert ws[f"J{_PRIMEIRA_LINHA_DADOS}"].value == 0
    assert ws[f"M{_PRIMEIRA_LINHA_DADOS}"].value == 0


def test_uma_ocorrencia_e_escrita_corretamente(tmp_path, template):
    destino = str(tmp_path / "saida.xlsx")
    candidato = _candidato(ob="2026OB000042", valor=321.55)
    resultado_gerado = _gerar(_resultado(candidatos=[candidato]), template, destino)

    wb = openpyxl.load_workbook(destino)
    ws = wb[_NOME_ABA_DADOS]
    linha = _PRIMEIRA_LINHA_DADOS
    assert ws[f"A{linha}"].value == "2026OB000042"
    assert ws[f"M{linha}"].value == 321.55
    assert ws[f"J{linha}"].value == "-"
    assert resultado_gerado.total_valor_diarias == 321.55
    assert ws[f"A{linha + 1}"].value.startswith("Total")


def test_varias_ocorrencias_uma_linha_por_ob_nunca_agregada(tmp_path, template):
    candidatos = [
        _candidato(ob="2026OB000001", dh="2026DH000001", valor=100.0),
        _candidato(ob="2026OB000002", dh="2026DH000002", valor=200.0),
        _candidato(ob="2026OB000003", dh="2026DH000003", valor=300.0),
    ]
    destino = str(tmp_path / "saida.xlsx")
    resultado_gerado = _gerar(_resultado(candidatos=candidatos), template, destino)

    assert resultado_gerado.total_ocorrencias == 3
    wb = openpyxl.load_workbook(destino)
    ws = wb[_NOME_ABA_DADOS]
    obs_escritas = [ws[f"A{_PRIMEIRA_LINHA_DADOS + i}"].value for i in range(3)]
    assert obs_escritas == ["2026OB000001", "2026OB000002", "2026OB000003"]


def test_um_dh_com_multiplas_obs_gera_uma_linha_por_ob(tmp_path, template):
    registros = [_registro(dh="2026DH000009", integral=1, parcial=0)]
    candidatos = [
        _candidato(ob="2026OB000010", dh="2026DH000009", registros_controle=registros, valor=50.0),
        _candidato(ob="2026OB000011", dh="2026DH000009", registros_controle=registros, valor=60.0),
    ]
    destino = str(tmp_path / "saida.xlsx")
    resultado_gerado = _gerar(_resultado(candidatos=candidatos), template, destino)

    assert resultado_gerado.total_ocorrencias == 2
    wb = openpyxl.load_workbook(destino)
    ws = wb[_NOME_ABA_DADOS]
    assert ws[f"A{_PRIMEIRA_LINHA_DADOS}"].value == "2026OB000010"
    assert ws[f"A{_PRIMEIRA_LINHA_DADOS + 1}"].value == "2026OB000011"
    # Mesmo Controle DIMCAC do DH — K/L idênticos nas duas linhas, nunca somados.
    assert ws[f"K{_PRIMEIRA_LINHA_DADOS}"].value == 1
    assert ws[f"K{_PRIMEIRA_LINHA_DADOS + 1}"].value == 1


def test_valor_zero_e_legitimo_e_nunca_vira_branco_ou_none(tmp_path, template):
    destino = str(tmp_path / "saida.xlsx")
    candidato = _candidato(valor=0.0)
    _gerar(_resultado(candidatos=[candidato]), template, destino)

    wb = openpyxl.load_workbook(destino)
    ws = wb[_NOME_ABA_DADOS]
    assert ws[f"M{_PRIMEIRA_LINHA_DADOS}"].value == 0.0


def test_campos_ausentes_ficam_em_branco_nunca_inventados(tmp_path, template):
    destino = str(tmp_path / "saida.xlsx")
    candidato = _candidato(cargo=None)
    _gerar(_resultado(candidatos=[candidato]), template, destino)

    wb = openpyxl.load_workbook(destino)
    ws = wb[_NOME_ABA_DADOS]
    assert ws[f"D{_PRIMEIRA_LINHA_DADOS}"].value is None


def test_quantidade_diarias_ausente_por_conflito_fica_em_branco(tmp_path, template):
    registros_conflitantes = [
        _registro(dh="2026DH000005", linha=2, integral=1, parcial=1),
        _registro(dh="2026DH000005", linha=3, integral=1, parcial=0),
    ]
    destino = str(tmp_path / "saida.xlsx")
    candidato = _candidato(dh="2026DH000005", registros_controle=registros_conflitantes)
    _gerar(_resultado(candidatos=[candidato]), template, destino)

    wb = openpyxl.load_workbook(destino)
    ws = wb[_NOME_ABA_DADOS]
    assert ws[f"K{_PRIMEIRA_LINHA_DADOS}"].value is None
    assert ws[f"L{_PRIMEIRA_LINHA_DADOS}"].value is None


def test_trecho_publicado_e_sempre_o_original_nunca_normalizado(tmp_path, template):
    destino = str(tmp_path / "saida.xlsx")
    candidato = _candidato(trecho="RECIFE - GARANHUNS (viagem oficial)")
    _gerar(_resultado(candidatos=[candidato]), template, destino)

    wb = openpyxl.load_workbook(destino)
    ws = wb[_NOME_ABA_DADOS]
    assert ws[f"G{_PRIMEIRA_LINHA_DADOS}"].value == "RECIFE - GARANHUNS (viagem oficial)"


def test_datas_sao_preservadas_como_objetos_data(tmp_path, template):
    destino = str(tmp_path / "saida.xlsx")
    candidato = _candidato(
        data_pagamento=datetime(2026, 1, 22, 10, 30, 0),
        periodo_inicial=date(2026, 1, 20),
        periodo_final=date(2026, 1, 21),
    )
    _gerar(_resultado(candidatos=[candidato]), template, destino)

    wb = openpyxl.load_workbook(destino)
    ws = wb[_NOME_ABA_DADOS]
    # Micro-sprint 3F.1 — o modelo oficial real armazena a coluna B como
    # TEXTO literal "DD/MM/YYYY HH:MM:SS" em 100% das linhas (investigação
    # célula a célula), nunca como data/serial Excel — reproduzido aqui.
    assert ws[f"B{_PRIMEIRA_LINHA_DADOS}"].value == "22/01/2026 10:30:00"
    # openpyxl sempre devolve `datetime.datetime` ao reabrir um XLSX salvo em
    # disco (a distinção `date` vs `datetime` não sobrevive ao round-trip,
    # mesmo com number_format só de data) — E/F continuam datas reais,
    # comparamos por data, não por tipo.
    assert ws[f"E{_PRIMEIRA_LINHA_DADOS}"].value == datetime(2026, 1, 20)


def test_data_pagamento_e_texto_nunca_datetime_ou_serial(tmp_path, template):
    destino = str(tmp_path / "saida.xlsx")
    candidato = _candidato(data_pagamento=datetime(2026, 3, 5, 8, 7, 6))
    _gerar(_resultado(candidatos=[candidato]), template, destino)

    wb = openpyxl.load_workbook(destino)
    ws = wb[_NOME_ABA_DADOS]
    celula = ws[f"B{_PRIMEIRA_LINHA_DADOS}"]
    assert celula.data_type == "s"
    assert isinstance(celula.value, str)
    assert celula.value == "05/03/2026 08:07:06"


def test_data_pagamento_ausente_fica_none(tmp_path, template):
    destino = str(tmp_path / "saida.xlsx")
    candidato = _candidato(data_pagamento=None)
    _gerar(_resultado(candidatos=[candidato]), template, destino)

    wb = openpyxl.load_workbook(destino)
    ws = wb[_NOME_ABA_DADOS]
    assert ws[f"B{_PRIMEIRA_LINHA_DADOS}"].value is None


def test_decisao_de_excluir_ocorrencia_nao_a_publica(tmp_path, template):
    ocorrencia_excluida = OcorrenciaFinanceira(
        dh="2026DH000099", ordem_bancaria=_ordem(ob="2026OB000099", dh="2026DH000099"), registros_controle=[]
    )
    decisao = DecisaoHumana(
        identidade_grupo="g2",
        regra="RN07",
        obs_envolvidas=frozenset({"2026OB000099"}),
        fingerprint_evidencias="fp2",
        acao=AcaoDecisao.PUBLICAR,
        obs_publicaveis=frozenset(),  # decisão real: publicar nenhuma das OBs envolvidas
        autor="teste@teste.com",
        decidido_em=datetime(2026, 1, 20),
    )
    resultado = _resultado(
        candidatos=[_candidato(ob="2026OB000001")],
        nao_publicaveis=[OcorrenciaNaoPublicavel(ocorrencia=ocorrencia_excluida, decisao=decisao)],
    )
    destino = str(tmp_path / "saida.xlsx")
    resultado_gerado = _gerar(resultado, template, destino)

    assert resultado_gerado.total_ocorrencias == 1
    wb = openpyxl.load_workbook(destino)
    ws = wb[_NOME_ABA_DADOS]
    assert ws[f"A{_PRIMEIRA_LINHA_DADOS}"].value == "2026OB000001"
    assert ws[f"A{_PRIMEIRA_LINHA_DADOS + 1}"].value.startswith("Total")


def test_titulo_reflete_competencia_informada_nunca_derivada_dos_dados(tmp_path, template):
    destino = str(tmp_path / "saida.xlsx")
    _gerar(_resultado(candidatos=[_candidato()]), template, destino, ano_exercicio=2026, mes_referencia=7)

    wb = openpyxl.load_workbook(destino)
    ws = wb[_NOME_ABA_DADOS]
    assert ws["A3"].value == "PAGAS ATÉ JULHO/2026"


def test_data_de_atualizacao_reflete_data_de_geracao(tmp_path, template):
    destino = str(tmp_path / "saida.xlsx")
    resultado_gerado = _gerar(
        _resultado(candidatos=[_candidato()]), template, destino, hoje=date(2026, 3, 5)
    )

    wb = openpyxl.load_workbook(destino)
    ws = wb[_NOME_ABA_DADOS]
    celula = ws[f"A{resultado_gerado.linha_total + 2}"]
    assert celula.value == "Data da última atualização: 05.03.2026"


# --- Determinismo (item 22) -------------------------------------------------


def test_mesma_entrada_gera_o_mesmo_conteudo_logico(tmp_path, template):
    candidatos = [_candidato(ob="2026OB000001", valor=154.09), _candidato(ob="2026OB000002", valor=200.0)]
    destino_a = str(tmp_path / "saida_a.xlsx")
    destino_b = str(tmp_path / "saida_b.xlsx")

    _gerar(_resultado(candidatos=list(candidatos)), template, destino_a, hoje=date(2026, 2, 1))
    _gerar(_resultado(candidatos=list(candidatos)), template, destino_b, hoje=date(2026, 2, 1))

    wb_a = openpyxl.load_workbook(destino_a)
    wb_b = openpyxl.load_workbook(destino_b)
    ws_a, ws_b = wb_a[_NOME_ABA_DADOS], wb_b[_NOME_ABA_DADOS]
    for linha in range(_PRIMEIRA_LINHA_DADOS, _PRIMEIRA_LINHA_DADOS + 2):
        for coluna in "ABCDEFGHIJKLM":
            assert ws_a[f"{coluna}{linha}"].value == ws_b[f"{coluna}{linha}"].value


# --- Estrutura / formatação (itens 18-19) -----------------------------------


def test_abas_preservadas_mesmo_nome_e_ordem(tmp_path, template):
    destino = str(tmp_path / "saida.xlsx")
    _gerar(_resultado(candidatos=[_candidato()]), template, destino)

    wb_template = openpyxl.load_workbook(template)
    wb_gerado = openpyxl.load_workbook(destino)
    assert wb_gerado.sheetnames == wb_template.sheetnames


def test_cabecalho_e_subcabecalho_preservados(tmp_path, template):
    destino = str(tmp_path / "saida.xlsx")
    _gerar(_resultado(candidatos=[_candidato()]), template, destino)

    wb_template = openpyxl.load_workbook(template)
    wb_gerado = openpyxl.load_workbook(destino)
    ws_t, ws_g = wb_template[_NOME_ABA_DADOS], wb_gerado[_NOME_ABA_DADOS]
    for coluna in "ABCDEFGHIJKLM":
        assert ws_g[f"{coluna}5"].value == ws_t[f"{coluna}5"].value
        assert ws_g[f"{coluna}6"].value == ws_t[f"{coluna}6"].value


def test_larguras_de_coluna_preservadas(tmp_path, template):
    destino = str(tmp_path / "saida.xlsx")
    _gerar(_resultado(candidatos=[_candidato()]), template, destino)

    wb_template = openpyxl.load_workbook(template)
    wb_gerado = openpyxl.load_workbook(destino)
    ws_t, ws_g = wb_template[_NOME_ABA_DADOS], wb_gerado[_NOME_ABA_DADOS]
    for coluna in "ABCDEFGHIJKLM":
        assert ws_g.column_dimensions[coluna].width == ws_t.column_dimensions[coluna].width


def test_freeze_panes_e_page_setup_preservados(tmp_path, template):
    destino = str(tmp_path / "saida.xlsx")
    _gerar(_resultado(candidatos=[_candidato()]), template, destino)

    wb_template = openpyxl.load_workbook(template)
    wb_gerado = openpyxl.load_workbook(destino)
    ws_t, ws_g = wb_template[_NOME_ABA_DADOS], wb_gerado[_NOME_ABA_DADOS]
    assert ws_g.freeze_panes == ws_t.freeze_panes
    assert ws_g.page_setup.orientation == ws_t.page_setup.orientation
    assert ws_g.page_setup.paperSize == ws_t.page_setup.paperSize
    assert ws_g.page_margins.left == ws_t.page_margins.left
    assert ws_g.page_margins.right == ws_t.page_margins.right


def test_merges_estruturais_de_titulo_preservados(tmp_path, template):
    destino = str(tmp_path / "saida.xlsx")
    _gerar(_resultado(candidatos=[_candidato()]), template, destino)

    wb_gerado = openpyxl.load_workbook(destino)
    ws_g = wb_gerado[_NOME_ABA_DADOS]
    intervalos = {str(r) for r in ws_g.merged_cells.ranges}
    assert "A2:C2" in intervalos
    assert "E5:F5" in intervalos
    assert "K5:L5" in intervalos


def test_notas_de_rodape_preservadas_sem_alteracao(tmp_path, template):
    destino = str(tmp_path / "saida.xlsx")
    resultado_gerado = _gerar(_resultado(candidatos=[_candidato()]), template, destino)

    wb_template = openpyxl.load_workbook(template)
    wb_gerado = openpyxl.load_workbook(destino)
    ws_t, ws_g = wb_template[_NOME_ABA_DADOS], wb_gerado[_NOME_ABA_DADOS]
    # As notas no template sintético começam 4 linhas abaixo do total original
    # (linha 10) — no gerado, a linha de total pode ter mudado; procuramos o
    # texto da 1ª nota em ambos e comparamos o conteúdo, não a posição.
    textos_template = [c.value for row in ws_t.iter_rows() for c in row if isinstance(c.value, str) and c.value.startswith("(a)")]
    textos_gerado = [c.value for row in ws_g.iter_rows() for c in row if isinstance(c.value, str) and c.value.startswith("(a)")]
    assert textos_template == textos_gerado


def test_estilo_da_primeira_linha_de_dados_bate_com_o_template(tmp_path, template):
    destino = str(tmp_path / "saida.xlsx")
    _gerar(_resultado(candidatos=[_candidato()]), template, destino)

    wb_template = openpyxl.load_workbook(template)
    wb_gerado = openpyxl.load_workbook(destino)
    ws_t, ws_g = wb_template[_NOME_ABA_DADOS], wb_gerado[_NOME_ABA_DADOS]
    linha = _PRIMEIRA_LINHA_DADOS
    for coluna in "ABCDEFGHIJKLM":
        cel_t, cel_g = ws_t[f"{coluna}{linha}"], ws_g[f"{coluna}{linha}"]
        assert cel_g.font.name == cel_t.font.name
        assert cel_g.font.size == cel_t.font.size
        assert cel_g.border.left.style == cel_t.border.left.style
        assert cel_g.alignment.horizontal == cel_t.alignment.horizontal
    assert ws_g[f"M{linha}"].number_format == ws_t[f"M{linha}"].number_format


def test_estilo_de_linha_nova_alem_do_tamanho_original_do_template_e_copiado(tmp_path, template):
    # Template sintético tem só 3 linhas de dados (7-9) — 5 candidatos força
    # a inserção de 2 linhas novas (10 e 11) além do tamanho original.
    candidatos = [_candidato(ob=f"2026OB{i:06d}", dh=f"2026DH{i:06d}") for i in range(1, 6)]
    destino = str(tmp_path / "saida.xlsx")
    _gerar(_resultado(candidatos=candidatos), template, destino)

    wb_template = openpyxl.load_workbook(template)
    wb_gerado = openpyxl.load_workbook(destino)
    ws_t, ws_g = wb_template[_NOME_ABA_DADOS], wb_gerado[_NOME_ABA_DADOS]
    linha_modelo = _PRIMEIRA_LINHA_DADOS
    linha_nova = _PRIMEIRA_LINHA_DADOS + 4  # 5ª linha de dados, além do template original
    for coluna in "ABCDEFGHIJKLM":
        cel_modelo, cel_nova = ws_t[f"{coluna}{linha_modelo}"], ws_g[f"{coluna}{linha_nova}"]
        assert cel_nova.font.name == cel_modelo.font.name
        assert cel_nova.font.size == cel_modelo.font.size
        assert cel_nova.border.left.style == cel_modelo.border.left.style
        assert cel_nova.alignment.horizontal == cel_modelo.alignment.horizontal


def test_menos_ocorrencias_que_o_template_original_remove_linhas_extras(tmp_path, template):
    # Template sintético tem 3 linhas de dados; só 1 candidato deve deixar a
    # planilha final com 1 linha de dados, nunca 2 linhas históricas residuais.
    destino = str(tmp_path / "saida.xlsx")
    resultado_gerado = _gerar(_resultado(candidatos=[_candidato(ob="2026OB000001")]), template, destino)

    wb_gerado = openpyxl.load_workbook(destino)
    ws_g = wb_gerado[_NOME_ABA_DADOS]
    assert resultado_gerado.linha_total == _PRIMEIRA_LINHA_DADOS + 1
    assert ws_g[f"A{_PRIMEIRA_LINHA_DADOS + 1}"].value.startswith("Total")


def test_formula_de_total_e_recalculada_para_a_faixa_real_nunca_herda_faixa_velha(tmp_path, template):
    candidatos = [_candidato(ob="2026OB000001", valor=100.0), _candidato(ob="2026OB000002", valor=50.0)]
    destino = str(tmp_path / "saida.xlsx")
    resultado_gerado = _gerar(_resultado(candidatos=candidatos), template, destino)

    wb_gerado = openpyxl.load_workbook(destino)
    ws_g = wb_gerado[_NOME_ABA_DADOS]
    formula = ws_g[f"M{resultado_gerado.linha_total}"].value
    assert formula == f"=SUM(M{_PRIMEIRA_LINHA_DADOS}:M{_PRIMEIRA_LINHA_DADOS + 1})"
