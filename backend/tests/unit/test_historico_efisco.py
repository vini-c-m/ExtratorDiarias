from datetime import date

from app.domain.rules.historico_efisco import montar_historico


def test_historico_zero_diarias_integrais_omite_mencao_a_integrais() -> None:
    """RN-13, caso confirmado pelo DIMCAC: viagem no mesmo dia nunca menciona
    "diárias integrais" — nem "00 (ZERO)..."."""
    texto = montar_historico(
        sei="19.20.0903.0030720/2024-36",
        nome_servidor="João da Silva",
        periodo_inicial=date(2026, 7, 21),
        periodo_final=date(2026, 7, 21),
        origem="Recife",
        destino="Caruaru",
    )
    assert texto == (
        "19.20.0903.0030720/2024-36 JOÃO DA SILVA UMA DIÁRIA PARCIAL, "
        "DEST. RECIFE - CARUARU, NO PERÍODO DE 21/07/2026 A 21/07/2026."
    )
    assert "INTEGRAL" not in texto


def test_historico_uma_diaria_integral_singular() -> None:
    texto = montar_historico(
        sei="19.20.0903.0030721/2024-11",
        nome_servidor="Maria Aparecida Souza",
        periodo_inicial=date(2026, 7, 21),
        periodo_final=date(2026, 7, 22),
        origem="Recife",
        destino="Garanhuns",
    )
    assert "01 (UMA) DIÁRIA INTEGRAL E UMA PARCIAL," in texto
    assert "DIÁRIAS INTEGRAIS" not in texto


def test_historico_duas_ou_mais_diarias_integrais_plural_com_extenso() -> None:
    texto = montar_historico(
        sei="19.20.0902.0004521/2026-11",
        nome_servidor="Maria Aparecida Souza",
        periodo_inicial=date(2026, 7, 21),
        periodo_final=date(2026, 7, 23),
        origem="Recife",
        destino="Garanhuns",
    )
    assert texto == (
        "19.20.0902.0004521/2026-11 MARIA APARECIDA SOUZA "
        "02 (DUAS) DIÁRIAS INTEGRAIS E UMA PARCIAL, DEST. RECIFE - GARANHUNS, "
        "NO PERÍODO DE 21/07/2026 A 23/07/2026."
    )


def test_historico_dois_digitos_com_zero_padding() -> None:
    texto = montar_historico(
        sei="19.20.0000.0000000/2026-00",
        nome_servidor="Fulano de Tal",
        periodo_inicial=date(2026, 1, 1),
        periodo_final=date(2026, 1, 16),
        origem="Recife",
        destino="Petrolina",
    )
    assert "15 (QUINZE) DIÁRIAS INTEGRAIS E UMA PARCIAL," in texto


def test_historico_sei_preservado_exatamente_como_informado() -> None:
    """RN-12 — pontos, barra e hífen nunca são removidos ou normalizados."""
    sei_original = "19.20.0903.0030720/2024-36"
    texto = montar_historico(
        sei=sei_original,
        nome_servidor="João da Silva",
        periodo_inicial=date(2026, 7, 21),
        periodo_final=date(2026, 7, 21),
        origem="Recife",
        destino="Caruaru",
    )
    assert texto.startswith(sei_original + " ")


def test_historico_nome_sempre_em_maiusculas() -> None:
    texto = montar_historico(
        sei="19.20.0000.0000000/2026-00",
        nome_servidor="joão da silva",
        periodo_inicial=date(2026, 7, 21),
        periodo_final=date(2026, 7, 21),
        origem="Recife",
        destino="Caruaru",
    )
    assert "JOÃO DA SILVA" in texto
