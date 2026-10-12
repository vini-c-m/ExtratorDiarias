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
        destino="Caruaru",
    )
    assert texto == (
        "19.20.0903.0030720/2024-36 JOÃO DA SILVA UMA DIÁRIA PARCIAL, "
        "DEST. CARUARU, NO PERÍODO DE 21/07/2026 A 21/07/2026."
    )
    assert "INTEGRAL" not in texto


def test_historico_uma_diaria_integral_singular() -> None:
    texto = montar_historico(
        sei="19.20.0903.0030721/2024-11",
        nome_servidor="Maria Aparecida Souza",
        periodo_inicial=date(2026, 7, 21),
        periodo_final=date(2026, 7, 22),
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
        destino="Garanhuns",
    )
    assert texto == (
        "19.20.0902.0004521/2026-11 MARIA APARECIDA SOUZA "
        "02 (DUAS) DIÁRIAS INTEGRAIS E UMA PARCIAL, DEST. GARANHUNS, "
        "NO PERÍODO DE 21/07/2026 A 23/07/2026."
    )


def test_historico_dois_digitos_com_zero_padding() -> None:
    texto = montar_historico(
        sei="19.20.0000.0000000/2026-00",
        nome_servidor="Fulano de Tal",
        periodo_inicial=date(2026, 1, 1),
        periodo_final=date(2026, 1, 16),
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
        destino="Caruaru",
    )
    assert texto.startswith(sei_original + " ")


def test_historico_nome_sempre_em_maiusculas() -> None:
    texto = montar_historico(
        sei="19.20.0000.0000000/2026-00",
        nome_servidor="joão da silva",
        periodo_inicial=date(2026, 7, 21),
        periodo_final=date(2026, 7, 21),
        destino="Caruaru",
    )
    assert "JOÃO DA SILVA" in texto


def test_historico_nao_pede_mais_origem() -> None:
    """Correção de 2026-08-05 — a Etapa 2 deixou de pedir Origem; o
    histórico usa apenas o destino, sem concatenar "ORIGEM - DESTINO"."""
    import inspect

    parametros = inspect.signature(montar_historico).parameters
    assert "origem" not in parametros
    assert "destino" in parametros


def test_historico_texto_final_integralmente_em_caixa_alta_com_entradas_minusculas() -> None:
    """Regra de negócio: o e-Fisco só aceita texto em caixa alta — todo o
    texto final precisa estar em maiúsculas, inclusive nome do servidor e
    destino digitados originalmente em minúsculas/mistas pelo usuário."""
    texto = montar_historico(
        sei="19.20.0000.0000000/2026-00",
        nome_servidor="maria aparecida de souza",
        periodo_inicial=date(2026, 7, 21),
        periodo_final=date(2026, 7, 23),
        destino="garanhuns",
    )
    assert texto == texto.upper()
    assert "MARIA APARECIDA DE SOUZA" in texto
    assert "GARANHUNS" in texto


def test_historico_quantidade_diaria_parcial_default_preserva_rn04() -> None:
    """RN-16 (2026-08-07) generalizou `montar_historico` para aceitar
    `quantidade_diaria_parcial` explícita (usado pelo modo Complemento) —
    o default precisa continuar `1`, preservando RN-04 ("sempre 1") para
    todo chamador já existente sem nenhuma mudança de comportamento."""
    import inspect

    parametros = inspect.signature(montar_historico).parameters
    assert parametros["quantidade_diaria_parcial"].default == 1


def test_historico_quantidade_diaria_integral_omitida_preserva_calculo_por_periodo() -> None:
    """Regressão comportamental (não de assinatura): para qualquer chamador
    que não informe `quantidade_diaria_integral` (todo caller de Servidor
    hoje), a saída precisa continuar idêntica ao cálculo por período (RN-03),
    mesmo texto de antes da generalização para Membro."""
    kwargs = dict(
        sei="19.20.0902.0004521/2026-11",
        nome_servidor="Maria Aparecida Souza",
        periodo_inicial=date(2026, 7, 21),
        periodo_final=date(2026, 7, 23),
        destino="Garanhuns",
    )
    texto_sem_override = montar_historico(**kwargs)
    texto_com_none_explicito = montar_historico(quantidade_diaria_integral=None, **kwargs)
    assert texto_sem_override == texto_com_none_explicito == (
        "19.20.0902.0004521/2026-11 MARIA APARECIDA SOUZA "
        "02 (DUAS) DIÁRIAS INTEGRAIS E UMA PARCIAL, DEST. GARANHUNS, "
        "NO PERÍODO DE 21/07/2026 A 23/07/2026."
    )


def test_historico_quantidade_diaria_integral_explicita_sobrescreve_calculo_por_periodo() -> None:
    """Caso Membro: período de 1 dia (que resultaria em 0 integrais pelo
    cálculo automático) mas o GABPGJ concedeu 1 integral — o texto precisa
    refletir a quantidade concedida, preservando o período exatamente como
    consultado."""
    texto = montar_historico(
        sei="19.20.0000.0000000/2026-00",
        nome_servidor="Fulano de Tal",
        periodo_inicial=date(2026, 8, 1),
        periodo_final=date(2026, 8, 1),
        destino="Recife",
        quantidade_diaria_parcial=0,
        quantidade_diaria_integral=1,
    )
    assert texto == (
        "19.20.0000.0000000/2026-00 FULANO DE TAL "
        "01 (UMA) DIÁRIA INTEGRAL, DEST. RECIFE, "
        "NO PERÍODO DE 01/08/2026 A 01/08/2026."
    )
    assert "PARCIAL" not in texto


def test_historico_caixa_alta_preserva_acentuacao() -> None:
    """`str.upper()` do Python é ciente de Unicode — acentos e caracteres
    válidos (ex. "Ç", "Ã") precisam ser preservados, nunca removidos."""
    texto = montar_historico(
        sei="19.20.0000.0000000/2026-00",
        nome_servidor="joão conceição",
        periodo_inicial=date(2026, 7, 21),
        periodo_final=date(2026, 7, 21),
        destino="conceição do araguaia",
    )
    assert "JOÃO CONCEIÇÃO" in texto
    assert "CONCEIÇÃO DO ARAGUAIA" in texto
