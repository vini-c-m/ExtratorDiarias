"""Modo Complemento de Diárias (RN-14/RN-16) e o histórico do e-Fisco —
esclarecimento do usuário (2026-08-07): NÃO existe um segundo modelo de
texto. `montar_historico` (RN-13) é o único template; o modo Complemento só
passa uma quantidade de diária parcial diferente do padrão (`1`, RN-04)."""

from datetime import date

from app.domain.rules.historico_efisco import montar_historico


def test_complemento_so_integrais_gera_01_diaria_integral_sem_mencionar_parcial() -> None:
    """Exemplo do usuário: complemento de 1 diária integral, sem parcial."""
    texto = montar_historico(
        sei="19.20.0001.0004758/2026-36",
        nome_servidor="Roberto Alves Ferreira",
        periodo_inicial=date(2026, 4, 12),
        periodo_final=date(2026, 4, 13),
        destino="Recife",
        quantidade_diaria_parcial=0,
    )
    assert "01 (UMA) DIÁRIA INTEGRAL," in texto
    assert "PARCIAL" not in texto


def test_complemento_duas_integrais_gera_02_diarias_integrais_sem_mencionar_parcial() -> None:
    """Exemplo do usuário: complemento de 2 diárias integrais, sem parcial —
    reprodução fiel do caso real (SEI 19.20.0001.0004758/2026-36, Validação
    de Diária complementar 9500001: INTEGRAL=2, PARCIAL="-")."""
    texto = montar_historico(
        sei="19.20.0001.0004758/2026-36",
        nome_servidor="Roberto Alves Ferreira",
        periodo_inicial=date(2026, 3, 17),
        periodo_final=date(2026, 3, 19),
        destino="Recife",
        quantidade_diaria_parcial=0,
    )
    assert texto == (
        "19.20.0001.0004758/2026-36 ROBERTO ALVES FERREIRA "
        "02 (DUAS) DIÁRIAS INTEGRAIS, DEST. RECIFE, NO PERÍODO DE 17/03/2026 A 19/03/2026."
    )


def test_complemento_quantidade_diaria_integral_explicita_sobrescreve_periodo() -> None:
    """Histórico e-Fisco de Membro no Complemento: período de 1 dia (que
    resultaria em 0 integrais pelo cálculo automático), mas a quantidade
    concedida informada manualmente é 1 integral — `contexto_complemento`
    continua `True`, mesmo texto de Complemento já homologado."""
    texto = montar_historico(
        sei="19.20.0000.0000000/2026-00",
        nome_servidor="Fulano de Tal",
        periodo_inicial=date(2026, 8, 1),
        periodo_final=date(2026, 8, 1),
        destino="Recife",
        quantidade_diaria_parcial=0,
        quantidade_diaria_integral=1,
        contexto_complemento=True,
    )
    assert "01 (UMA) DIÁRIA INTEGRAL," in texto
    assert "PARCIAL" not in texto
    assert "NO PERÍODO DE 01/08/2026 A 01/08/2026." in texto


def test_complemento_com_parcial_documentada_inclui_e_uma_parcial() -> None:
    """Regra do usuário: não é regra absoluta — se o documento comprovar
    parcial, o sistema respeita o documento."""
    texto = montar_historico(
        sei="19.20.0001.0004758/2026-36",
        nome_servidor="Roberto Alves Ferreira",
        periodo_inicial=date(2026, 3, 17),
        periodo_final=date(2026, 3, 19),
        destino="Recife",
        quantidade_diaria_parcial=1,
    )
    assert "02 (DUAS) DIÁRIAS INTEGRAIS E UMA PARCIAL," in texto


def test_complemento_default_do_service_e_zero_sem_evidencia() -> None:
    """`gerar_historico_complemento` (Central de Conferência) não lê PDF —
    quando quem chama não informa a quantidade, o padrão institucional (0)
    é aplicado no próprio service, nunca inventado aqui."""
    import inspect

    from app.services.conferencia_service import gerar_historico_complemento

    parametros = inspect.signature(gerar_historico_complemento).parameters
    assert parametros["quantidade_diaria_parcial"].default == 0


def test_nao_existe_mais_montar_historico_complemento() -> None:
    """Confirma que o segundo modelo foi removido — só resta `montar_historico`,
    generalizado (esclarecimento do usuário, 2026-08-07)."""
    import app.domain.rules.historico_efisco as modulo

    assert not hasattr(modulo, "montar_historico_complemento")


# --- P1 (Sprint pré-build, 2026-08-11) — parcial isolada -------------------


def test_complemento_parcial_isolada_gera_uma_parcial() -> None:
    """Cenário do usuário: simulação de Complemento representando
    EXATAMENTE uma parcial isolada (mesmo dia, sem nenhuma integral) — o
    texto precisa ser "UMA PARCIAL", nunca "UMA DIÁRIA PARCIAL" (esse é o
    texto do fluxo Padrão, RN-04, um caminho totalmente diferente)."""
    texto = montar_historico(
        sei="19.20.0001.0004758/2026-36",
        nome_servidor="Roberto Alves Ferreira",
        periodo_inicial=date(2026, 4, 12),
        periodo_final=date(2026, 4, 12),
        destino="Recife",
        quantidade_diaria_parcial=1,
        contexto_complemento=True,
    )
    assert "UMA PARCIAL," in texto
    assert "UMA DIÁRIA PARCIAL" not in texto
    assert "INTEGRAL" not in texto


def test_complemento_intervalo_com_integrais_e_parcial_nao_isolada_preserva_e_uma_parcial() -> None:
    """Quando NÃO é isolada (já existem integrais no período), o texto
    continua "E UMA PARCIAL" — o ajuste de P1 nunca toca esse branch."""
    texto = montar_historico(
        sei="19.20.0001.0004758/2026-36",
        nome_servidor="Roberto Alves Ferreira",
        periodo_inicial=date(2026, 3, 17),
        periodo_final=date(2026, 3, 19),
        destino="Recife",
        quantidade_diaria_parcial=1,
        contexto_complemento=True,
    )
    assert "02 (DUAS) DIÁRIAS INTEGRAIS E UMA PARCIAL," in texto


def test_complemento_intervalo_com_integrais_sem_parcial_continua_so_integrais() -> None:
    """Comportamento a preservar (pedido explícito do usuário): intervalo
    com integrais e SEM marcação de parcial nunca ganha "E UMA PARCIAL" —
    default institucional (0) do modo Complemento, intocado por P1."""
    texto = montar_historico(
        sei="19.20.0001.0004758/2026-36",
        nome_servidor="Roberto Alves Ferreira",
        periodo_inicial=date(2026, 3, 17),
        periodo_final=date(2026, 3, 19),
        destino="Recife",
        quantidade_diaria_parcial=0,
        contexto_complemento=True,
    )
    assert "02 (DUAS) DIÁRIAS INTEGRAIS," in texto
    assert "PARCIAL" not in texto


def test_gerar_historico_complemento_sempre_passa_contexto_complemento() -> None:
    """`gerar_historico_complemento` (Central de Conferência) precisa
    sempre marcar `contexto_complemento=True` ao delegar para
    `montar_historico` — é o único jeito de `_trecho_diarias` saber que
    está no fluxo de Complemento, não no Padrão."""
    import inspect

    from app.services import conferencia_service

    codigo_fonte = inspect.getsource(conferencia_service.gerar_historico_complemento)
    assert "contexto_complemento=True" in codigo_fonte


def test_gerar_historico_padrao_nunca_passa_contexto_complemento() -> None:
    """RN-04 preservada: o fluxo Padrão nunca marca `contexto_complemento`
    — continua produzindo "UMA DIÁRIA PARCIAL" para o caso de zero
    integrais, exatamente como já testado em `test_historico_efisco.py`."""
    import inspect

    from app.services import conferencia_service

    codigo_fonte = inspect.getsource(conferencia_service.gerar_historico)
    assert "contexto_complemento" not in codigo_fonte
