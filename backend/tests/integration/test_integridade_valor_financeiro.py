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
