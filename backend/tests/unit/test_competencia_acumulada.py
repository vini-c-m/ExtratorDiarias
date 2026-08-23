from datetime import date

import pytest

from app.domain.relatorio_transparencia.competencia import intervalo_acumulado


def test_julho_acumula_desde_janeiro():
    intervalo = intervalo_acumulado(2026, 7)
    assert intervalo.data_inicio == date(2026, 1, 1)
    assert intervalo.data_fim == date(2026, 7, 31)


def test_agosto_acumula_desde_janeiro_nao_so_a_partir_de_julho():
    """O ponto central da regra: agosto não é "julho até agosto", é
    "janeiro até agosto" — o mês de referência nunca é um filtro exclusivo."""
    intervalo = intervalo_acumulado(2026, 8)
    assert intervalo.data_inicio == date(2026, 1, 1)
    assert intervalo.data_fim == date(2026, 8, 31)


def test_setembro_acumula_desde_janeiro():
    intervalo = intervalo_acumulado(2026, 9)
    assert intervalo.data_inicio == date(2026, 1, 1)
    assert intervalo.data_fim == date(2026, 9, 30)


def test_fevereiro_em_ano_bissexto_usa_29_dias():
    intervalo = intervalo_acumulado(2028, 2)
    assert intervalo.data_fim == date(2028, 2, 29)


def test_fevereiro_em_ano_nao_bissexto_usa_28_dias():
    intervalo = intervalo_acumulado(2026, 2)
    assert intervalo.data_fim == date(2026, 2, 28)


def test_mes_referencia_invalido_levanta_value_error():
    with pytest.raises(ValueError, match="mes_referencia"):
        intervalo_acumulado(2026, 13)
    with pytest.raises(ValueError, match="mes_referencia"):
        intervalo_acumulado(2026, 0)


def test_contem_e_inclusivo_nas_duas_pontas():
    intervalo = intervalo_acumulado(2026, 8)
    assert intervalo.contem(date(2026, 1, 1))
    assert intervalo.contem(date(2026, 8, 31))
    assert intervalo.contem(date(2026, 5, 15))


def test_contem_exclui_fora_do_intervalo():
    intervalo = intervalo_acumulado(2026, 8)
    assert not intervalo.contem(date(2025, 12, 31))
    assert not intervalo.contem(date(2026, 9, 1))
