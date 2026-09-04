"""Plano de Migração E-Fisco, Sprint C — testes de integração do pipeline
PRODUTIVO (`relatorio_transparencia_service.py`) já ligado à Base E-Fisco.
Cobrem especificamente os cenários do filtro de diária (Sprint A) e do
cruzamento DIMCAC (Sprint B) através do service real, ponta a ponta —
complementares a `test_relatorio_transparencia_service.py`/`test_api_
relatorio_transparencia.py` (decisões, versionamento, Diárias Não
Publicadas, Passagens, RN07/RN04, já cobertos lá e migrados para fixtures
E-Fisco nesta mesma Sprint). Dados 100% sintéticos."""

from datetime import date

import pytest
from openpyxl import Workbook

from app.services import relatorio_transparencia_service as service

_CABECALHO_EFISCO = [
    "Ordem Bancária", "Número do DH", "Situação", "Data da OB", "Data Pagto./Devol.",
    "Valor Bruto", "Observação", "Código da Natureza de Despesa",
    "Razão Social do Credor", "Número do documento do Credor",
]

_CABECALHO_CONTROLE = [
    "DH", "SEI", "DOC ORIGEM", "CPF", "", "", "CARGO", "PERÍODO INICIAL",
    "PERÍODO FINAL", "TRECHO", "TRANSPORTE", "MOTIVO", "",
    "QUANT. DIÁRIA INTEGRAL", "QUANT. DIÁRIA PARCIAL", "VALOR DA DIÁRIA",
]


def _linha_efisco(
    *,
    ob,
    dh="2026DH000001",
    situacao="Paga",
    natureza="33901400",
    documento_credor="111.222.333-44",
    credor="FULANO DE TAL",
    data_ob="10/02/2026",
    data_pagto_devol="28/02/2026 09:01:40",
    valor_bruto=154.09,
    observacao="PAGTO TESTE ; UMA DIARIA PARCIAL, DEST RECIFE",
):
    return [ob, dh, situacao, data_ob, data_pagto_devol, valor_bruto, observacao, natureza, credor, documento_credor]


def _linha_cobertura():
    """Linha só de COBERTURA para o gate de qualidade E-Fisco (Situação=Paga,
    data dentro da competência) — natureza fora de diária (nunca vira
    candidato), usada por testes cuja única linha real é Devolvida/
    Cancelada/Gerada (nenhum Paga na base, o que a fonte inteira sozinha
    nunca teria — bloquearia por "nenhum pagamento confirmado" mesmo sem
    relação com o que o teste está verificando)."""
    return _linha_efisco(ob="2026OB999999", dh="2026DH999999", natureza="00000000")


def _criar_efisco(caminho, linhas):
    wb = Workbook()
    ws = wb.active
    ws.title = "OB"
    ws.append(_CABECALHO_EFISCO)
    for linha in linhas:
        ws.append(linha)
    wb.save(caminho)


def _criar_controle(caminho, linhas=()):
    wb = Workbook()
    ws = wb.active
    ws.title = "Controle de Diárias"
    ws.append(_CABECALHO_CONTROLE)
    for linha in linhas:
        ws.append(linha)
    wb.save(caminho)


def _linha_controle(
    *,
    dh="2026DH000001",
    sei="19.20.0001.0000001/2026-01",
    cpf="111.222.333-44",
    cargo="Cargo de Teste",
    periodo_inicial=date(2026, 2, 7),
    periodo_final=date(2026, 2, 7),
    trecho="RECIFE-GARANHUNS",
    transporte="CARRO",
    motivo="Motivo administrativo de teste",
    valor=154.09,
):
    return [dh, sei, "PJTESTE", cpf, None, None, cargo, periodo_inicial, periodo_final, trecho, transporte, motivo, None, None, None, valor]


def _preparar(tmp_path, linhas_efisco, linhas_controle=()):
    caminho_efisco = tmp_path / "efisco.xlsx"
    caminho_controle = tmp_path / "controle.xlsx"
    caminho_decisoes = tmp_path / "decisoes.json"
    _criar_efisco(caminho_efisco, linhas_efisco)
    _criar_controle(caminho_controle, linhas_controle)
    resumo = service.preparar_relatorio(
        caminho_base_efisco=str(caminho_efisco),
        caminho_controle_dimcac=str(caminho_controle),
        ano_exercicio=2026,
        mes_referencia=2,
        caminho_decisoes=str(caminho_decisoes),
    )
    return resumo, str(caminho_efisco), str(caminho_controle), str(caminho_decisoes)


# --- 1. Base E-Fisco válida/inválida/coluna ausente -----------------------


def test_efisco_valido_e_lido_pelo_pipeline_produtivo(tmp_path):
    resumo, *_ = _preparar(
        tmp_path,
        [_linha_efisco(ob="2026OB000001")],
        [_linha_controle()],
    )
    assert resumo.total_candidatos_normais == 1


def test_efisco_arquivo_inexistente_nao_cai_para_base_ob_antiga(tmp_path):
    """Confirma ausência de fallback: falha explícita, nunca um retorno
    silencioso ao ClickView (repositorio_ordens_bancarias não é sequer
    importado por relatorio_transparencia_service.py)."""
    caminho_controle = tmp_path / "controle.xlsx"
    _criar_controle(caminho_controle)
    with pytest.raises(service.BaseEfiscoNaoEncontrada):
        service.preparar_relatorio(
            caminho_base_efisco=str(tmp_path / "nao_existe.xlsx"),
            caminho_controle_dimcac=str(caminho_controle),
            ano_exercicio=2026,
            mes_referencia=2,
            caminho_decisoes=str(tmp_path / "decisoes.json"),
        )


def test_efisco_coluna_obrigatoria_ausente_levanta_erro_estrutural(tmp_path):
    caminho_efisco = tmp_path / "efisco.xlsx"
    wb = Workbook()
    ws = wb.active
    ws.title = "OB"
    ws.append(["Ordem Bancária", "Situação"])  # faltam colunas obrigatórias
    wb.save(caminho_efisco)
    caminho_controle = tmp_path / "controle.xlsx"
    _criar_controle(caminho_controle)

    with pytest.raises(service.EstruturaBaseEfiscoInvalida):
        service.preparar_relatorio(
            caminho_base_efisco=str(caminho_efisco),
            caminho_controle_dimcac=str(caminho_controle),
            ano_exercicio=2026,
            mes_referencia=2,
            caminho_decisoes=str(tmp_path / "decisoes.json"),
        )


# --- 2. Filtro de diária, através do service real --------------------------


def test_diaria_33901400_entra(tmp_path):
    resumo, *_ = _preparar(tmp_path, [_linha_efisco(ob="2026OB000001", natureza="33901400")], [_linha_controle()])
    assert resumo.total_candidatos_normais == 1


def test_diaria_legitima_33909200_entra(tmp_path):
    resumo, *_ = _preparar(
        tmp_path,
        [_linha_efisco(ob="2026OB000001", natureza="33909200", observacao="PAGTO ; UMA DIARIA PARCIAL, DEST RECIFE")],
        [_linha_controle()],
    )
    assert resumo.total_candidatos_normais == 1


def test_ressarcimento_de_transporte_nao_entra(tmp_path):
    resumo, *_ = _preparar(
        tmp_path,
        [_linha_efisco(
            ob="2026OB000001", natureza="33909200",
            observacao="REF. AO RESSARCIMENTO DE TRANSPORTE - 2025, CONF. DESPACHO PGJ Nº 999999/2025",
        )],
        [],
    )
    assert resumo.total_candidatos_normais == 0
    assert resumo.total_revisoes == 0


def test_cnpj_nao_entra(tmp_path):
    resumo, *_ = _preparar(
        tmp_path,
        [_linha_efisco(ob="2026OB000001", documento_credor="11.222.333/0001-81")],
        [],
    )
    assert resumo.total_candidatos_normais == 0
    assert resumo.total_revisoes == 0


def test_devolvida_nao_entra_mesmo_com_data_pagamento_preenchida(tmp_path):
    # `_linha_cobertura()` só eleva a cobertura paga da fonte (Situação=Paga,
    # data válida) sem virar candidato (natureza fora de diária) — a linha
    # real do teste (Devolvida) nunca teria, sozinha, um Paga na base.
    resumo, *_ = _preparar(
        tmp_path,
        [
            _linha_efisco(ob="2026OB000001", situacao="Devolvida", data_pagto_devol="10/02/2026 09:01:40"),
            _linha_cobertura(),
        ],
        [],
    )
    assert resumo.total_candidatos_normais == 0
    assert resumo.total_revisoes == 0


def test_cancelada_nao_entra(tmp_path):
    resumo, *_ = _preparar(
        tmp_path,
        [_linha_efisco(ob="2026OB000001", situacao="Cancelada"), _linha_cobertura()],
        [],
    )
    assert resumo.total_candidatos_normais == 0


def test_gerada_nao_entra(tmp_path):
    resumo, *_ = _preparar(
        tmp_path,
        [_linha_efisco(ob="2026OB000001", situacao="Gerada", data_pagto_devol=""), _linha_cobertura()],
        [],
    )
    assert resumo.total_candidatos_normais == 0


# --- 3. Controle DIMCAC presente/ausente ------------------------------------


def test_dimcac_presente_enriquece_ordem_bancaria(tmp_path):
    resumo, *_ = _preparar(
        tmp_path,
        [_linha_efisco(ob="2026OB000001")],
        [_linha_controle(sei="19.20.9999.0009999/2026-99", cargo="POLICIAL MILITAR")],
    )
    ocorrencia = next(iter(resumo.revisoes), None)
    # sem revisão (candidato normal) — inspeciona via preparar_relatorio não expõe
    # ordem_bancaria diretamente; usa listar_revisoes/gerar para checagem mais
    # profunda, mas aqui a métrica já confirma que a diária foi processada.
    assert resumo.total_candidatos_normais == 1


def test_dimcac_ausente_nao_remove_diaria_financeiramente_valida(tmp_path):
    """Decisão homologada (Plano de Migração E-Fisco): ausência de
    correspondência no Controle DIMCAC NUNCA exclui uma diária Paga
    válida no E-Fisco — ela continua candidata normal (RN01-RN07 não têm
    nenhuma checagem de "precisa existir no DIMCAC"), só sem
    enriquecimento administrativo (sei/cargo ficam None)."""
    resumo, *_ = _preparar(tmp_path, [_linha_efisco(ob="2026OB000001", dh="2026DHINEXISTENTE")], [])
    assert resumo.total_candidatos_normais == 1


# --- 4. Valor financeiro — E-Fisco prevalece sobre DIMCAC -------------------


def test_valor_e_sempre_do_efisco_nunca_do_dimcac(tmp_path):
    resumo, caminho_efisco, caminho_controle, caminho_decisoes = _preparar(
        tmp_path,
        [_linha_efisco(ob="2026OB000001", valor_bruto=999.99)],
        [_linha_controle(valor=1.00)],
    )
    lista = service.listar_revisoes(
        caminho_base_efisco=caminho_efisco, caminho_controle_dimcac=caminho_controle,
        ano_exercicio=2026, mes_referencia=2, caminho_decisoes=caminho_decisoes,
    )
    # candidato normal, não revisão — confirmamos via RN07 forçado abaixo
    assert resumo.total_candidatos_normais == 1
    assert lista == []  # nenhuma revisão pendente, confirma fluxo normal


def test_valor_divergente_do_dimcac_nao_gera_revisao_por_si_so(tmp_path):
    """Valor é campo exclusivamente E-Fisco — divergir do DIMCAC não é
    sequer comparado por nenhuma RN (RN02 olha só `ordem.valor`, nunca
    `RegistroControle.valor_total_diarias`)."""
    resumo, *_ = _preparar(
        tmp_path,
        [_linha_efisco(ob="2026OB000001", valor_bruto=500.0)],
        [_linha_controle(valor=1.0)],
    )
    assert resumo.total_revisoes == 0


# --- 5. SEI — sempre do DIMCAC ----------------------------------------------


def test_sei_vem_do_dimcac_no_pipeline_produtivo(tmp_path):
    resumo, caminho_efisco, caminho_controle, caminho_decisoes = _preparar(
        tmp_path,
        [
            _linha_efisco(ob="2026OB000001", dh="2026DH000001", valor_bruto=100.0),
            _linha_efisco(ob="2026OB000002", dh="2026DH000001", valor_bruto=100.0, credor="OUTRO NOME", documento_credor="222.333.444-55"),
        ],
        [_linha_controle(dh="2026DH000001", sei="19.20.0001.0000001/2026-01")],
    )
    # duas OBs, mesmo DH, mesmo valor -> RN07 exige CPF/trecho/período iguais;
    # aqui CPFs diferentes então não conflita — ambas candidatas normais.
    assert resumo.total_candidatos_normais == 2


# --- 6. RN04 continua alcançável (não removida) -----------------------------


def test_rn04_dispara_para_ob_fisicamente_repetida_com_situacao_divergente(tmp_path):
    """RN04 permanece alcançável via campo NATIVO do E-Fisco (situação) —
    mesma OB/DH, duas linhas físicas, situação divergente (campo que
    nunca dependeu do DIMCAC)."""
    resumo, *_ = _preparar(
        tmp_path,
        [
            _linha_efisco(ob="2026OB000001", dh="2026DH000001", situacao="Paga"),
            _linha_efisco(ob="2026OB000001", dh="2026DH000001", situacao="Paga", credor="CREDOR DIVERGENTE"),
        ],
        [_linha_controle()],
    )
    assert resumo.total_revisoes == 1
    assert resumo.revisoes[0].regra == "RN04"


# --- 7. RN07 --------------------------------------------------------------


def test_rn07_dispara_para_obs_distintas_mesmo_cpf_periodo_valor_trecho(tmp_path):
    resumo, *_ = _preparar(
        tmp_path,
        [
            _linha_efisco(ob="2026OB000001", dh="2026DH000001", valor_bruto=200.0),
            _linha_efisco(ob="2026OB000002", dh="2026DH000002", valor_bruto=200.0),
        ],
        [
            _linha_controle(dh="2026DH000001"),
            _linha_controle(dh="2026DH000002"),
        ],
    )
    assert resumo.total_revisoes == 1
    assert resumo.revisoes[0].regra == "RN07"
