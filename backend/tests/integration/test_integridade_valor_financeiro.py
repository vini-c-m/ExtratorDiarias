"""URGENTE — Central Analítica (2026-08-06): regressão do achado real de
que ~80% das diárias de SERVIDOR (1.419 de 1.446, Planilha Oficial real)
apareciam com valor financeiro vazio no Dashboard/Modo Executivo/PDF,
enquanto MEMBRO praticamente não era afetado.

Causa raiz: a coluna P (`VALOR TOTAL DAS DIÁRIAS`) de `Controle de
Diárias` é fórmula (`=R+S`) na maioria das linhas históricas — sobretudo
as de SERVIDOR — enquanto as linhas de MEMBRO (escritas pelo próprio
Extrator, `escritor_planilha.py`) quase sempre têm um número puro.
`base_local.sincronizar` abria a Planilha Oficial com `load_workbook(...)`
sem `data_only=True`: openpyxl devolvia o texto da fórmula (`"=R123+S123"`),
que `repositorio_diarias._valor_como_numero` não sabe interpretar como
número e descartava como `None` — mesmo quando o Excel já tinha calculado
e guardado em cache o valor real (100% das 2.217 linhas de fórmula da
Planilha Oficial real tinham cache). Corrigido em `app/consulta/
base_local.py` (`data_only=True`) e em `app/consulta/repositorio_diarias.
_valor_como_numero` (prefixo `R$` em valor digitado como texto, outro
achado real da mesma auditoria).

Estes testes reproduzem a estrutura real do arquivo (fórmula + `<v>` de
cache, exatamente como o Excel grava — nunca como `openpyxl` sozinho
gravaria) via a fixture `injetar_cache_formula`, e cobrem ponta a ponta:
Planilha Oficial → `base_local.sincronizar` → SQLite → `repositorio_
analitico` → `RegistroAnalitico.valor_total_diarias`."""

from datetime import date

from openpyxl import Workbook

from app.consulta import base_local, base_local_sqlite, repositorio_analitico
from app.consulta.repositorio_analitico import FiltrosDiaria
from app.domain.analitica.indicadores import calcular_indicadores
from app.domain.entities.diaria import Diaria
from app.domain.entities.modo_processamento import ModoProcessamento
from app.domain.entities.processo import Processo, StatusProcesso
from app.planilha.escritor_planilha import preencher

_CABECALHO_CONTROLE = [
    "DH", "SEI", "DOC ORIGEM", "CPF", "PREVIDÊNCIA", "NOME", "CARGO",
    "PERÍODO INICIAL", "PERÍODO FINAL", "TRECHO", "TRANSPORTE", "MOTIVO",
    "VALOR DA PASSAGEM", "QUANT. DIÁRIA INTEGRAL", "QUANT. DIÁRIA PARCIAL",
    "VALOR TOTAL DAS DIÁRIAS", "LOCAL",
    "VALOR DAS DIÁRIAS INTEGRAIS", "VALOR DAS DIÁRIAS PARCIAIS",
]
_CABECALHO_DADOS = [
    "SEI", "MATRÍCULA", "NOME", "PREVIDÊNCIA", "CARGO",
    "ÓRGÃO DE ORIGEM", "REGIME DE PREVIDÊNCIA", "SITUAÇÃO DO SERVIDOR",
]

_CARGO_MEMBRO = "Promotor de Justiça de 1a. Entrancia"
_CARGO_SERVIDOR = "Técnico Judiciário"


def _linha_controle(
    *, dh, sei, cpf, periodo_inicial, periodo_final, valor_p, valor_r=None, valor_s=None
):
    return [
        dh, sei, "PJTESTE", cpf, "FUNAFIN", "Nome Teste", "Cargo Teste",
        periodo_inicial, periodo_final, "RECIFE - GARANHUNS", "CARRO", "Motivo de teste",
        None, 1, 0, valor_p, "GARANHUNS", valor_r, valor_s,
    ]


def _montar_planilha(tmp_path, nome_arquivo, linhas_controle, linhas_dados):
    workbook = Workbook()
    controle = workbook.active
    controle.title = "Controle de Diárias"
    controle.append(_CABECALHO_CONTROLE)
    for linha in linhas_controle:
        controle.append(linha)

    dados = workbook.create_sheet("Dados")
    dados.append(_CABECALHO_DADOS)
    for linha in linhas_dados:
        dados.append(linha)

    workbook.create_sheet("Tabela Valores")

    caminho = tmp_path / nome_arquivo
    workbook.save(caminho)
    return str(caminho)


def _sincronizar_e_buscar_registros(caminho_planilha, tmp_path):
    destino_base = tmp_path / "dados_usuario"
    base_local.sincronizar(str(caminho_planilha), diretorio_base=destino_base, origem="manual")
    caminho_sqlite = base_local_sqlite.caminho_base_local_sqlite(diretorio_base=destino_base)
    filtros = FiltrosDiaria(periodo_inicial=date(2020, 1, 1), periodo_final=date(2030, 12, 31))
    return repositorio_analitico.agregar_indicadores(caminho_sqlite, filtros)


def test_valor_formula_com_cache_calculado_pelo_excel_e_lido_corretamente(
    tmp_path, injetar_cache_formula
):
    """O caso real predominante nas diárias de SERVIDOR: `P2` = `=R2+S2`,
    já calculado pelo Excel (`<v>462.28</v>` gravado junto da fórmula)."""
    caminho = _montar_planilha(
        tmp_path,
        "planilha_formula_com_cache.xlsx",
        [
            _linha_controle(
                dh=None, sei="19.20.0001.0000001/2026-01", cpf=11111111111,
                periodo_inicial=date(2026, 1, 8), periodo_final=date(2026, 1, 10),
                valor_p="=R2+S2", valor_r=300.00, valor_s=162.28,
            )
        ],
        [[11111111111, 1001, "Servidor Teste", "INSS", _CARGO_SERVIDOR, None, "RGPS", "Em exercício"]],
    )
    injetar_cache_formula(caminho, "P2", 462.28)

    registros = _sincronizar_e_buscar_registros(caminho, tmp_path)

    assert len(registros) == 1
    assert registros[0].valor_total_diarias == 462.28
    assert registros[0].categoria_funcional == "SERVIDOR"


def test_valor_formula_sem_cache_calculado_permanece_none_nunca_estimado(
    tmp_path, injetar_cache_formula
):
    """Contraponto do teste anterior: fórmula genuinamente sem cache (Excel
    nunca recalculou) — mesmo com R/S preenchidos e a soma sendo trivial
    de calcular, o sistema NUNCA deve inventar esse cálculo por conta
    própria (só confia no que o Excel já calculou); o valor correto
    permanece `None`, nunca `0` nem uma estimativa."""
    caminho = _montar_planilha(
        tmp_path,
        "planilha_formula_sem_cache.xlsx",
        [
            _linha_controle(
                dh=None, sei="19.20.0001.0000002/2026-01", cpf=22222222222,
                periodo_inicial=date(2026, 1, 8), periodo_final=date(2026, 1, 10),
                valor_p="=R2+S2", valor_r=300.00, valor_s=162.28,
            )
        ],
        [[22222222222, 1002, "Servidor Sem Cache", "INSS", _CARGO_SERVIDOR, None, "RGPS", "Em exercício"]],
    )
    # nenhuma chamada a injetar_cache_formula — `<v />` permanece vazio, exatamente
    # como uma fórmula que o Excel nunca recalculou.

    registros = _sincronizar_e_buscar_registros(caminho, tmp_path)

    assert len(registros) == 1
    assert registros[0].valor_total_diarias is None


def test_valor_texto_com_prefixo_moeda_e_lido_corretamente(tmp_path):
    """Achado real da mesma auditoria: 3 linhas da Planilha Oficial têm a
    coluna P digitada manualmente como texto com o símbolo da moeda
    (`"R$ 154,09"`), não só o formato brasileiro puro (`"154,09"`) já
    coberto antes desta correção."""
    caminho = _montar_planilha(
        tmp_path,
        "planilha_valor_texto_moeda.xlsx",
        [
            _linha_controle(
                dh=None, sei="19.20.0001.0000003/2026-01", cpf=33333333333,
                periodo_inicial=date(2026, 1, 8), periodo_final=date(2026, 1, 10),
                valor_p="R$ 154,09",
            )
        ],
        [[33333333333, 1003, "Servidor Texto Moeda", "INSS", _CARGO_SERVIDOR, None, "RGPS", "Em exercício"]],
    )

    registros = _sincronizar_e_buscar_registros(caminho, tmp_path)

    assert len(registros) == 1
    assert registros[0].valor_total_diarias == 154.09


def test_valor_texto_nao_numerico_permanece_none_nunca_e_inventado(tmp_path):
    """Achado real da mesma auditoria: uma linha com texto sem relação
    nenhuma com valor monetário (`"DIMOT"`, aparentemente colado por
    engano de outra coluna) — nunca deve virar `0` nem qualquer número."""
    caminho = _montar_planilha(
        tmp_path,
        "planilha_valor_texto_invalido.xlsx",
        [
            _linha_controle(
                dh=None, sei="19.20.0001.0000004/2026-01", cpf=44444444444,
                periodo_inicial=date(2026, 1, 8), periodo_final=date(2026, 1, 10),
                valor_p="DIMOT",
            )
        ],
        [[44444444444, 1004, "Servidor Texto Invalido", "INSS", _CARGO_SERVIDOR, None, "RGPS", "Em exercício"]],
    )

    registros = _sincronizar_e_buscar_registros(caminho, tmp_path)

    assert len(registros) == 1
    assert registros[0].valor_total_diarias is None


def test_celula_realmente_vazia_permanece_none(tmp_path):
    caminho = _montar_planilha(
        tmp_path,
        "planilha_valor_vazio.xlsx",
        [
            _linha_controle(
                dh=None, sei="19.20.0001.0000005/2026-01", cpf=55555555555,
                periodo_inicial=date(2026, 1, 8), periodo_final=date(2026, 1, 10),
                valor_p=None,
            )
        ],
        [[55555555555, 1005, "Servidor Sem Valor", "INSS", _CARGO_SERVIDOR, None, "RGPS", "Em exercício"]],
    )

    registros = _sincronizar_e_buscar_registros(caminho, tmp_path)

    assert len(registros) == 1
    assert registros[0].valor_total_diarias is None


def test_valor_numerico_puro_de_linha_membro_continua_correto(tmp_path):
    """Regressão negativa: o caminho de MEMBRO (número puro, escrito pelo
    próprio Extrator) já funcionava antes desta correção — precisa
    continuar funcionando exatamente igual depois dela."""
    caminho = _montar_planilha(
        tmp_path,
        "planilha_valor_membro.xlsx",
        [
            _linha_controle(
                dh=None, sei="19.20.0001.0000006/2026-01", cpf=66666666666,
                periodo_inicial=date(2026, 1, 8), periodo_final=date(2026, 1, 10),
                valor_p=652.96,
            )
        ],
        [[66666666666, 1006, "Membro Teste", None, _CARGO_MEMBRO, None, "RPPS", "Em exercício"]],
    )

    registros = _sincronizar_e_buscar_registros(caminho, tmp_path)

    assert len(registros) == 1
    assert registros[0].valor_total_diarias == 652.96
    assert registros[0].categoria_funcional == "MEMBRO"


def test_fixture_sintetica_diferenca_estrutural_membro_x_servidor_soma_correta(
    tmp_path, injetar_cache_formula
):
    """Fixture sintética pedida pela auditoria: reproduz a diferença
    estrutural real entre MEMBRO (valor como número puro) e SERVIDOR
    (valor como fórmula com cache) na mesma planilha, sem dado pessoal
    real — e confirma a invariante final: soma por categoria funcional =
    valor total geral, nunca perde nem duplica um valor."""
    linhas_controle = [
        _linha_controle(
            dh=None, sei="19.20.0001.0001001/2026-01", cpf=10000000001,
            periodo_inicial=date(2026, 3, 1), periodo_final=date(2026, 3, 2),
            valor_p=368.50,  # MEMBRO — número puro
        ),
        _linha_controle(
            dh=None, sei="19.20.0001.0001002/2026-01", cpf=10000000002,
            periodo_inicial=date(2026, 3, 5), periodo_final=date(2026, 3, 6),
            valor_p="=R3+S3", valor_r=400.00, valor_s=200.00,  # SERVIDOR — fórmula com cache
        ),
    ]
    linhas_dados = [
        [10000000001, 2001, "Membro Sintetico", None, _CARGO_MEMBRO, None, "RPPS", "Em exercício"],
        [10000000002, 2002, "Servidor Sintetico", "INSS", _CARGO_SERVIDOR, None, "RGPS", "Em exercício"],
    ]
    caminho = _montar_planilha(tmp_path, "planilha_membro_x_servidor.xlsx", linhas_controle, linhas_dados)
    injetar_cache_formula(caminho, "P3", 600.00)

    registros = _sincronizar_e_buscar_registros(caminho, tmp_path)
    assert len(registros) == 2

    por_categoria = {r.categoria_funcional: r.valor_total_diarias for r in registros}
    assert por_categoria == {"MEMBRO": 368.50, "SERVIDOR": 600.00}

    indicadores = calcular_indicadores(registros)
    assert indicadores.valor_total == 968.50
    assert indicadores.valor_medio == 484.25


# --- P0 (2026-08-09) — regressão da causa raiz confirmada por reprodução --
# executável: `escritor_planilha.preencher()` abria a Planilha Oficial sem
# `data_only=True` (necessário para preservar fórmulas que não toca) e, ao
# salvar o workbook inteiro, apagava o cache de TODA fórmula pré-existente —
# não só das linhas novas gravadas por ele. Diferente do resto deste
# arquivo (que testa só `sincronizar()` isoladamente, sobre uma planilha já
# pronta), estes dois testes chamam o `preencher()` REAL, reproduzindo a
# sequência de produção ponta a ponta: cache válido -> `preencher()` ->
# `sincronizar()` -> SQLite -> indicador. -----------------------------------


def test_preencher_real_preserva_valor_historico_com_cache_de_formula(tmp_path, injetar_cache_formula):
    """Processamento normal (modo Padrão): gravar uma diária nova não pode
    apagar o valor financeiro de uma diária histórica de SERVIDOR."""
    caminho = _montar_planilha(
        tmp_path,
        "planilha_preservacao_padrao.xlsx",
        [
            _linha_controle(
                dh=None, sei="19.20.0001.0009001/2025-01", cpf=77777777777,
                periodo_inicial=date(2025, 1, 8), periodo_final=date(2025, 1, 10),
                valor_p="=R2+S2", valor_r=300.00, valor_s=162.28,
            )
        ],
        [[77777777777, 1007, "Servidor Histórico", "INSS", _CARGO_SERVIDOR, None, "RGPS", "Em exercício"]],
    )
    injetar_cache_formula(caminho, "P2", 462.28)

    registros_antes = _sincronizar_e_buscar_registros(caminho, tmp_path)
    assert registros_antes[0].valor_total_diarias == 462.28

    nova_diaria = Diaria(
        sei="19.20.0002.0009002/2026-01", doc_origem="PJNOVO", cpf="88888888888",
        periodo_inicial=date(2026, 2, 1), periodo_final=date(2026, 2, 3),
        cidade_origem="RECIFE", cidade_destino="CARUARU", motivo="Diligência nova",
    )
    processo = Processo(arquivo_origem="novo.pdf", status=StatusProcesso.SUCESSO, diaria=nova_diaria)
    resultado = preencher(caminho, [processo])
    assert resultado.total_gravado == 1

    registros_depois = _sincronizar_e_buscar_registros(caminho, tmp_path)
    por_sei = {registro.sei: registro for registro in registros_depois}
    assert por_sei["19.20.0001.0009001/2025-01"].valor_total_diarias == 462.28

    indicadores = calcular_indicadores(registros_depois)
    assert indicadores.valor_total == 462.28


def test_preencher_real_preserva_valor_historico_com_cache_de_formula_modo_complemento(
    tmp_path, injetar_cache_formula
):
    """Mesmo achado, no modo Complemento de Diárias (RN-14) — a auditoria
    obrigatória de `_linha_possui_formulas_necessarias` exige colunas
    extras (N/V/Z/AA) pré-copiadas na linha livre, então a planilha
    sintética aqui é mais larga que `_montar_planilha` (mesma estrutura já
    usada por `tests/integration/test_complemento_diarias.py`)."""
    caminho = tmp_path / "planilha_preservacao_complemento.xlsx"
    workbook = Workbook()
    controle = workbook.active
    controle.title = "Controle de Diárias"
    controle.append([
        "DH", "SEI", "DOC ORIGEM", "CPF", "PREVIDÊNCIA", "NOME", "CARGO",
        "PERÍODO INICIAL", "PERÍODO FINAL", "TRECHO", "TRANSPORTE", "MOTIVO",
        "VALOR DA PASSAGEM", "QUANT. DIÁRIA INTEGRAL", "QUANT. DIÁRIA PARCIAL",
        "VALOR TOTAL DAS DIÁRIAS", "LOCAL", "VALOR DAS DIÁRIAS INTEGRAIS",
        "VALOR DAS DIÁRIAS PARCIAIS", "DMTC", "DMOF", "PASSAR DIA",
        "RESTITUIÇÃO", "COMPROVANTES", "CONFIRMAÇÃO DE DIÁRIAS", "CONCATENAÇÃO",
        "AVISO ", "AVISO AUXILIAR",
    ])
    controle.append([
        None, "19.20.0001.0009101/2025-01", "PJTESTE", 99999999999,
        None, None, None, date(2025, 1, 8), date(2025, 1, 10), "OURICURI-RECIFE", "CARRO",
        "Motivo original", None, "=I2-H2", 1, "=R2+S2", "PERNAMBUCO",
        "=(VLOOKUP(Q2,'Tabela Valores'!A:C,2,FALSE()))*N2",
        "=(VLOOKUP(Q2,'Tabela Valores'!A:C,3,FALSE()))*O2",
        None, None, "=H2-15", None, None, None,
        "=CONCATENATE(D2,H2,I2)", "=VLOOKUP(Z2,Z$1:AB1,3,0)", None,
    ])
    controle.append([
        None, None, None, None, None, None, None, None, None, None, None, None,
        None, "=I3-H3", None, "=R3+S3", None,
        "=(VLOOKUP(Q3,'Tabela Valores'!A:C,2,FALSE()))*N3",
        "=(VLOOKUP(Q3,'Tabela Valores'!A:C,3,FALSE()))*O3",
        None, None, "=H3-15", None, None, None,
        "=CONCATENATE(D3,H3,I3)", "=VLOOKUP(Z3,Z$1:AB2,3,0)", None,
    ])
    dados = workbook.create_sheet("Dados")
    dados.append(_CABECALHO_DADOS)
    dados.append([99999999999, 1009, "Servidor Histórico Complemento", "INSS", _CARGO_SERVIDOR, None, "RGPS", "Em exercício"])
    tabela_valores = workbook.create_sheet("Tabela Valores")
    tabela_valores.append(["PERNAMBUCO", 308.19, 154.09])
    workbook.save(caminho)
    injetar_cache_formula(str(caminho), "P2", 462.28)

    registros_antes = _sincronizar_e_buscar_registros(str(caminho), tmp_path)
    assert registros_antes[0].valor_total_diarias == 462.28

    nova_diaria = Diaria(
        sei="19.20.0002.0009102/2026-01", doc_origem="PJNOVO", cpf="10101010101",
        periodo_inicial=date(2026, 2, 1), periodo_final=date(2026, 2, 3),
        cidade_origem="RECIFE", cidade_destino="CARUARU", motivo="Complemento novo",
    )
    processo = Processo(arquivo_origem="novo.pdf", status=StatusProcesso.SUCESSO, diaria=nova_diaria)
    resultado = preencher(str(caminho), [processo], modo=ModoProcessamento.COMPLEMENTO)
    assert resultado.total_gravado == 1

    registros_depois = _sincronizar_e_buscar_registros(str(caminho), tmp_path)
    por_sei = {registro.sei: registro for registro in registros_depois}
    assert por_sei["19.20.0001.0009101/2025-01"].valor_total_diarias == 462.28
