"""Resolvedor de quantidade parcial complementar (modo Complemento de
Diárias) — caso real que fundamenta a regra: SEI 19.20.0001.0004758/2026-36,
Validação de Diária complementar (1439057): "Dentro do Estado" ativa,
INTEGRAL QUANTIDADE=2, PARCIAL QUANTIDADE="-" (padrão institucional: 0)."""

from app.extraction.enriquecimento.quantidade_complementar import (
    resolver_quantidade_parcial_complementar,
)

_CABECALHO_VALIDACAO = "CMFC - Validação de Diária - Servidores - 1439057"


def _segmento_validacao(
    dentro_do_estado: str = "-",
    fora_do_estado: str = "-",
    parcial_dentro: str = "-",
    parcial_fora: str = "-",
) -> str:
    """Reproduz a estrutura real do formulário "CMFC - Validação de Diária -
    Servidores" (seção "DAS DIÁRIAS", com as subseções INTEGRAL/PARCIAL de
    cada modalidade) — mesmo padrão de texto confirmado no PDF real."""
    return (
        f"{_CABECALHO_VALIDACAO}\n"
        "DAS DIÁRIAS\n"
        "MODALIDADES - Dentro do Estado:\n"
        f"{dentro_do_estado}\n"
        "INTEGRAL\n"
        "QUANTIDADE:\n"
        "-\n"
        "VALOR UNITÁRIO:\n"
        "-\n"
        "VALOR TOTAL:\n"
        "-\n"
        "PARCIAL\n"
        "QUANTIDADE :\n"
        f"{parcial_dentro}\n"
        "VALOR UNITÁRIO :\n"
        "-\n"
        "VALOR TOTAL :\n"
        "-\n"
        "MODALIDADES - Fora do Estado:\n"
        f"{fora_do_estado}\n"
        "INTEGRAL\n"
        "QUANTIDADE :\n"
        "-\n"
        "VALOR UNITÁRIO :\n"
        "-\n"
        "VALOR TOTAL :\n"
        "-\n"
        "PARCIAL\n"
        "QUANTIDADE :\n"
        f"{parcial_fora}\n"
        "VALOR UNITÁRIO :\n"
        "-\n"
        "VALOR TOTAL :\n"
        "-\n"
        "VALOR TOTAL GERAL:\n"
        "616,38\n"
    )


def test_caso_real_dentro_do_estado_sem_parcial_devolve_padrao_institucional_zero():
    texto = _segmento_validacao(
        dentro_do_estado="Dentro do Estado - De 100KM ou mais", parcial_dentro="-"
    )

    quantidade, justificativa = resolver_quantidade_parcial_complementar(texto)

    assert quantidade == 0
    assert "Validação de Diária" in justificativa


def test_dentro_do_estado_com_parcial_explicita_devolve_quantidade_documentada():
    texto = _segmento_validacao(
        dentro_do_estado="Dentro do Estado - De 100KM ou mais", parcial_dentro="1"
    )

    quantidade, justificativa = resolver_quantidade_parcial_complementar(texto)

    assert quantidade == 1
    assert "Validação de Diária" in justificativa


def test_fora_do_estado_ativa_le_parcial_da_secao_fora_nunca_da_dentro():
    """Isolamento por bloco de modalidade — a seção "Dentro do Estado" (que
    fica inativa, sempre com PARCIAL "-") nunca deve vazar para o resultado
    quando é "Fora do Estado" que está ativa com uma parcial real."""
    texto = _segmento_validacao(
        fora_do_estado="Fora do Estado - Grupo I", parcial_dentro="-", parcial_fora="2"
    )

    quantidade, _ = resolver_quantidade_parcial_complementar(texto)

    assert quantidade == 2


def test_ambas_as_modalidades_preenchidas_devolve_padrao_institucional():
    """Situação ambígua (não deveria ocorrer num processo real) — na dúvida,
    o resolvedor nunca escolhe uma modalidade por conta própria; cai no
    padrão institucional."""
    texto = _segmento_validacao(
        dentro_do_estado="Dentro do Estado - De 100KM ou mais",
        fora_do_estado="Fora do Estado - Grupo I",
        parcial_dentro="-",
        parcial_fora="3",
    )

    quantidade, justificativa = resolver_quantidade_parcial_complementar(texto)

    assert quantidade == 0
    assert "institucional" in justificativa


def test_nenhuma_modalidade_preenchida_devolve_padrao_institucional():
    texto = _segmento_validacao()

    quantidade, justificativa = resolver_quantidade_parcial_complementar(texto)

    assert quantidade == 0
    assert "institucional" in justificativa


def test_processo_sem_validacao_de_diaria_devolve_padrao_institucional():
    texto = "CMFC - Solicitação de Diária - Servidor - 1417813\nFINALIDADE DA VIAGEM:\nInspeção"

    quantidade, justificativa = resolver_quantidade_parcial_complementar(texto)

    assert quantidade == 0
    assert "institucional" in justificativa


def test_valor_de_quantidade_nao_numerico_e_diferente_de_traco_devolve_padrao_institucional():
    """Texto inesperado na célula (nunca deveria acontecer num formulário
    real) não deve virar um valor inventado — cai no padrão institucional
    em vez de tentar adivinhar."""
    texto = _segmento_validacao(
        dentro_do_estado="Dentro do Estado - De 100KM ou mais", parcial_dentro="a confirmar"
    )

    quantidade, justificativa = resolver_quantidade_parcial_complementar(texto)

    assert quantidade == 0
    assert "institucional" in justificativa


def test_usa_apenas_o_ultimo_segmento_de_validacao_quando_ha_mais_de_uma():
    """Mesma regra já usada por `ultimo_segmento` em toda a Sprint de
    Fontes Secundárias — se há mais de uma Validação de Diária anexada
    (ex.: uma original e uma complementar), só a mais recente vale."""
    texto = _segmento_validacao(
        dentro_do_estado="Dentro do Estado - De 100KM ou mais", parcial_dentro="1"
    ) + _segmento_validacao(
        dentro_do_estado="Dentro do Estado - De 100KM ou mais", parcial_dentro="-"
    )

    quantidade, _ = resolver_quantidade_parcial_complementar(texto)

    assert quantidade == 0
