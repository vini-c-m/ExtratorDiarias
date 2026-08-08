"""Fonte Secundária de Evidência #1 (2026-08-05) — "CMFC - Validação de
Diária - Servidores". Caso real que motivou a arquitetura: SEI
19.20.0001.0014476/2026-35 — ver `tests/integration/test_fontes_secundarias_integracao.py`
para a reprodução sintética completa do processo."""

from app.extraction.enriquecimento.fontes_secundarias.validacao_cmfc import (
    ValidacaoCmfcFonteSecundaria,
)

_FONTE = ValidacaoCmfcFonteSecundaria()

_CABECALHO_VALIDACAO = "CMFC - Validação de Diária - Servidores - 1521949"


def _segmento_validacao(dentro_do_estado: str = "-", fora_do_estado: str = "-") -> str:
    """Reproduz só a estrutura da seção "DAS DIÁRIAS" do formulário real —
    o suficiente para exercitar a fonte, sem precisar do documento inteiro."""
    return (
        f"{_CABECALHO_VALIDACAO}\n"
        "DAS DIÁRIAS\n"
        "MODALIDADES - Dentro do Estado:\n"
        f"{dentro_do_estado}\n"
        "MODALIDADES - Fora do Estado:\n"
        f"{fora_do_estado}\n"
        "VALOR TOTAL GERAL:\n"
        "154,09\n"
    )


def test_declara_nome_e_campos_suportados():
    assert _FONTE.nome == "CMFC - Validação de Diária - Servidores"
    assert _FONTE.campos_suportados == frozenset({"estado_destino"})


def test_dentro_do_estado_preenchida_e_fora_vazia_comprova_pernambuco():
    texto = _segmento_validacao(dentro_do_estado="Dentro do Estado - De 100KM ou mais")

    evidencias = _FONTE.buscar_evidencias(texto)

    assert "estado_destino" in evidencias
    assert evidencias["estado_destino"].valor == "PERNAMBUCO"
    assert _FONTE.nome in evidencias["estado_destino"].justificativa
    assert "Dentro do Estado" in evidencias["estado_destino"].justificativa


def test_ambas_as_modalidades_vazias_nao_comprova_nada():
    texto = _segmento_validacao()  # os dois "-" (padrão de campo vazio do formulário)

    assert _FONTE.buscar_evidencias(texto) == {}


def test_fora_do_estado_preenchida_nao_comprova_pernambuco():
    """Sabemos que NÃO é Pernambuco, mas o documento não diz qual estado —
    nunca adivinhar: sem evidência suficiente, o campo continua sem valor."""
    texto = _segmento_validacao(fora_do_estado="Fora do Estado - Grupo I")

    assert _FONTE.buscar_evidencias(texto) == {}


def test_ambas_as_modalidades_preenchidas_nao_comprova_nada():
    """Situação inconsistente (não deveria ocorrer num processo real) — na
    dúvida, esta fonte nunca escolhe uma das duas por conta própria."""
    texto = _segmento_validacao(
        dentro_do_estado="Dentro do Estado - De 100KM ou mais",
        fora_do_estado="Fora do Estado - Grupo I",
    )

    assert _FONTE.buscar_evidencias(texto) == {}


def test_processo_sem_validacao_de_diaria_nao_comprova_nada():
    texto = "CMFC - Solicitação de Diária - Servidor - 1521129\nFINALIDADE DA VIAGEM:\nInspeção"

    assert _FONTE.buscar_evidencias(texto) == {}


def test_reconhece_variacao_de_caixa_e_acentuacao_no_titulo_e_na_modalidade():
    """"CMFC" em maiúsculas é constante fixa do timbre do órgão em todo
    documento real (não varia) — `segmentacao_documentos._TITULO_DOCUMENTO_CMFC`,
    módulo já homologado e não alterado por esta Sprint, é case-sensitive
    só para esse prefixo. O resto do título ("Validação de Diária") e as
    linhas de modalidade são o que esta fonte precisa tolerar em caixa
    baixa/mista e sem acento — e toleram, via `re.IGNORECASE`."""
    texto = (
        "CMFC - validacao de diaria - servidores - 1521949\n"
        "DAS DIÁRIAS\n"
        "modalidades - dentro do estado:\n"
        "Dentro do Estado - De 100KM ou mais\n"
        "MODALIDADES - Fora do Estado:\n"
        "-\n"
    )

    evidencias = _FONTE.buscar_evidencias(texto)

    assert evidencias["estado_destino"].valor == "PERNAMBUCO"


def test_usa_apenas_o_ultimo_segmento_de_validacao_quando_ha_mais_de_um():
    """Mesma regra já usada por `documento_habil.py` (`ultimo_segmento`) —
    se a Validação de Diária foi corrigida e reanexada, só a mais recente
    vale."""
    texto = (
        _segmento_validacao(fora_do_estado="Fora do Estado - Grupo I")  # versão substituída
        + _segmento_validacao(dentro_do_estado="Dentro do Estado - De 100KM ou mais")  # vigente
    )

    evidencias = _FONTE.buscar_evidencias(texto)

    assert evidencias["estado_destino"].valor == "PERNAMBUCO"
