"""Modo Complemento de Diárias (RN-14) em `app.domain.rules.conferencia.conferir`
— duplicidade deixa de bloquear o veredito `apto`, mas continua no
checklist/`duplicidade` normalmente. Modo Padrão permanece byte-a-byte o
já homologado (ver `tests/unit/test_conferencia.py`)."""

from datetime import date

from app.domain.entities.modo_processamento import ModoProcessamento
from app.domain.entities.registro_diaria_existente import RegistroDiariaExistente
from app.domain.entities.resultado_conferencia import Veredito
from app.domain.entities.servidor import Servidor
from app.domain.rules.conferencia import conferir

_SERVIDOR = Servidor(
    cpf="12345678901", nome="Maria Aparecida Souza", cargo="Analista Judiciário", previdencia="FUNAFIN"
)
_REGISTRO_EXISTENTE = RegistroDiariaExistente(
    linha=547,
    sei="19.20.0902.0004521/2026-11",
    cpf="12345678901",
    periodo_inicial=date(2026, 7, 21),
    periodo_final=date(2026, 7, 23),
    trecho="RECIFE - GARANHUNS",
)


def test_modo_complemento_duplicidade_nao_impede_apto() -> None:
    resultado = conferir(
        cpf="12345678901",
        periodo_inicial=date(2026, 7, 21),
        periodo_final=date(2026, 7, 23),
        servidor=_SERVIDOR,
        registros_do_cpf=[_REGISTRO_EXISTENTE],
        hoje=date(2026, 7, 21),
        modo=ModoProcessamento.COMPLEMENTO,
    )

    assert resultado.veredito is Veredito.APTO_PARA_PROCESSAMENTO


def test_modo_complemento_duplicidade_continua_no_checklist_e_no_campo_duplicidade() -> None:
    resultado = conferir(
        cpf="12345678901",
        periodo_inicial=date(2026, 7, 21),
        periodo_final=date(2026, 7, 23),
        servidor=_SERVIDOR,
        registros_do_cpf=[_REGISTRO_EXISTENTE],
        hoje=date(2026, 7, 21),
        modo=ModoProcessamento.COMPLEMENTO,
    )

    item_duplicidade = next(item for item in resultado.checklist if item.item == "duplicidade")
    assert item_duplicidade.ok is False
    assert resultado.duplicidade == _REGISTRO_EXISTENTE


def test_modo_complemento_providencia_menciona_continuidade_processual() -> None:
    resultado = conferir(
        cpf="12345678901",
        periodo_inicial=date(2026, 7, 21),
        periodo_final=date(2026, 7, 23),
        servidor=_SERVIDOR,
        registros_do_cpf=[_REGISTRO_EXISTENTE],
        hoje=date(2026, 7, 21),
        modo=ModoProcessamento.COMPLEMENTO,
    )

    assert "Continuidade Processual" in resultado.providencia


def test_modo_padrao_continua_bloqueando_duplicidade_exatamente_como_hoje() -> None:
    """Zero regressão: sem passar `modo` (default PADRAO), o comportamento
    já homologado não muda em nada."""
    resultado = conferir(
        cpf="12345678901",
        periodo_inicial=date(2026, 7, 21),
        periodo_final=date(2026, 7, 23),
        servidor=_SERVIDOR,
        registros_do_cpf=[_REGISTRO_EXISTENTE],
        hoje=date(2026, 7, 21),
    )

    assert resultado.veredito is Veredito.REVISAR
    assert "complemento de diária" in resultado.providencia.lower()


def test_modo_complemento_ainda_bloqueia_por_cadastro_nao_localizado() -> None:
    """Só a duplicidade deixa de bloquear — cadastro ausente e janela
    fechada continuam gerando REVISAR normalmente."""
    resultado = conferir(
        cpf="99999999999",
        periodo_inicial=date(2026, 7, 21),
        periodo_final=date(2026, 7, 23),
        servidor=None,
        registros_do_cpf=[],
        hoje=date(2026, 7, 21),
        modo=ModoProcessamento.COMPLEMENTO,
    )

    assert resultado.veredito is Veredito.REVISAR


def test_modo_complemento_sem_duplicidade_fica_apto_normalmente() -> None:
    resultado = conferir(
        cpf="12345678901",
        periodo_inicial=date(2026, 7, 21),
        periodo_final=date(2026, 7, 23),
        servidor=_SERVIDOR,
        registros_do_cpf=[],
        hoje=date(2026, 7, 21),
        modo=ModoProcessamento.COMPLEMENTO,
    )

    assert resultado.veredito is Veredito.APTO_PARA_PROCESSAMENTO
    assert resultado.providencia == "Nenhuma — pronto para seguir"
