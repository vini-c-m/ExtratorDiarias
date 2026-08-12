"""Micro-sprint A — regra pura `calcular_valor_diaria_servidor` (RN-05).
Casos A-F/M do pedido: PE sem/com parcial, outra faixa sem/com parcial,
múltiplas integrais, parcial isolada, precisão/arredondamento — mais UF
ausente da tabela (K)."""

from decimal import Decimal

import pytest

from app.domain.rules.valor_diaria_servidor import (
    TarifaUF,
    UfForaDaTabelaValores,
    calcular_valor_diaria_servidor,
)

_TABELA = {
    "PERNAMBUCO": TarifaUF(integral=Decimal("308.19"), parcial=Decimal("154.09")),
    "CEARÁ": TarifaUF(integral=Decimal("539.33"), parcial=Decimal("308.19")),
    "SÃO PAULO": TarifaUF(integral=Decimal("770.47"), parcial=Decimal("385.24")),
}


def test_a_servidor_pe_sem_parcial():
    resultado = calcular_valor_diaria_servidor(
        uf_destino="PERNAMBUCO",
        quantidade_diaria_integral=1,
        quantidade_diaria_parcial=0,
        tabela=_TABELA,
    )
    assert resultado.valor_integral == Decimal("308.19")
    assert resultado.valor_parcial == Decimal("0")
    assert resultado.valor_total == Decimal("308.19")


def test_b_servidor_pe_com_parcial():
    resultado = calcular_valor_diaria_servidor(
        uf_destino="PERNAMBUCO",
        quantidade_diaria_integral=1,
        quantidade_diaria_parcial=1,
        tabela=_TABELA,
    )
    assert resultado.valor_integral == Decimal("308.19")
    assert resultado.valor_parcial == Decimal("154.09")
    assert resultado.valor_total == Decimal("462.28")


def test_c_servidor_outra_faixa_sem_parcial():
    resultado = calcular_valor_diaria_servidor(
        uf_destino="CEARÁ",
        quantidade_diaria_integral=2,
        quantidade_diaria_parcial=0,
        tabela=_TABELA,
    )
    assert resultado.valor_integral == Decimal("1078.66")
    assert resultado.valor_parcial == Decimal("0")
    assert resultado.valor_total == Decimal("1078.66")


def test_d_servidor_outra_faixa_com_parcial():
    resultado = calcular_valor_diaria_servidor(
        uf_destino="SÃO PAULO",
        quantidade_diaria_integral=1,
        quantidade_diaria_parcial=1,
        tabela=_TABELA,
    )
    assert resultado.valor_total == Decimal("1155.71")


def test_e_parcial_isolada_sem_nenhuma_integral():
    """N=0, O=1 — mesmo caso real confirmado na auditoria (viagem sem
    pernoite, RN-04): só a parcial entra na conta."""
    resultado = calcular_valor_diaria_servidor(
        uf_destino="PERNAMBUCO",
        quantidade_diaria_integral=0,
        quantidade_diaria_parcial=1,
        tabela=_TABELA,
    )
    assert resultado.valor_integral == Decimal("0")
    assert resultado.valor_parcial == Decimal("154.09")
    assert resultado.valor_total == Decimal("154.09")


def test_f_multiplas_integrais():
    resultado = calcular_valor_diaria_servidor(
        uf_destino="PERNAMBUCO",
        quantidade_diaria_integral=5,
        quantidade_diaria_parcial=1,
        tabela=_TABELA,
    )
    assert resultado.valor_integral == Decimal("1540.95")
    assert resultado.valor_parcial == Decimal("154.09")
    assert resultado.valor_total == Decimal("1695.04")


def test_k_uf_ausente_da_tabela_levanta_excecao_nunca_calcula_com_fallback():
    with pytest.raises(UfForaDaTabelaValores):
        calcular_valor_diaria_servidor(
            uf_destino="AMAZONAS",
            quantidade_diaria_integral=1,
            quantidade_diaria_parcial=1,
            tabela=_TABELA,
        )


def test_m_precisao_decimal_sem_ruido_de_ponto_flutuante():
    """3 diárias integrais em Pernambuco: 308.19 * 3 = 924.57 exatamente —
    sem `Decimal`, `0.1 + 0.2 != 0.3` mostra o tipo de ruído binário que
    esta regra precisa evitar (auditoria real: nenhuma das fórmulas
    encontradas na Planilha Oficial aplica `ROUND()`, então a implementação
    também não pode inventar uma)."""
    resultado = calcular_valor_diaria_servidor(
        uf_destino="PERNAMBUCO",
        quantidade_diaria_integral=3,
        quantidade_diaria_parcial=0,
        tabela=_TABELA,
    )
    assert resultado.valor_integral == Decimal("924.57")
    assert str(resultado.valor_integral) == "924.57"


def test_uf_normalizada_por_caixa_e_espacos_na_chave_de_busca():
    """`uf_destino` pode chegar com variação de caixa/espaço (ex.: vindo de
    `identificar_estado_destino`); a chave da tabela em si nunca é alterada
    (RORAIMA na Planilha Oficial real tem espaço final gravado na própria
    célula — normalizar do lado da BUSCA, nunca do dado, é o que evita essa
    armadilha)."""
    resultado = calcular_valor_diaria_servidor(
        uf_destino="  pernambuco ",
        quantidade_diaria_integral=1,
        quantidade_diaria_parcial=1,
        tabela=_TABELA,
    )
    assert resultado.valor_total == Decimal("462.28")
