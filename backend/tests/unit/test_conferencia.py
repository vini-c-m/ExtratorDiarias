from datetime import date

from app.domain.entities.registro_diaria_existente import RegistroDiariaExistente
from app.domain.entities.resultado_conferencia import Veredito
from app.domain.entities.servidor import Servidor
from app.domain.rules.conferencia import conferir

_SERVIDOR = Servidor(cpf="12345678901", nome="Maria Aparecida Souza", cargo="Analista Judiciário", previdencia="FUNAFIN")


def test_apto_quando_cadastro_ok_sem_duplicidade_e_janela_liberada() -> None:
    resultado = conferir(
        cpf="12345678901",
        periodo_inicial=date(2026, 7, 21),
        periodo_final=date(2026, 7, 23),
        servidor=_SERVIDOR,
        registros_do_cpf=[],
        hoje=date(2026, 7, 21),
    )
    assert resultado.veredito is Veredito.APTO_PARA_PROCESSAMENTO
    assert resultado.providencia == "Nenhuma — pronto para seguir"
    assert all(item.ok for item in resultado.checklist)


def test_cadastro_nao_encontrado() -> None:
    resultado = conferir(
        cpf="99999999999",
        periodo_inicial=date(2026, 7, 21),
        periodo_final=date(2026, 7, 23),
        servidor=None,
        registros_do_cpf=[],
        hoje=date(2026, 7, 21),
    )
    assert resultado.veredito is Veredito.REVISAR
    item_cadastro = next(item for item in resultado.checklist if item.item == "cadastro_localizado")
    assert item_cadastro.ok is False
    item_nome = next(item for item in resultado.checklist if item.item == "nome")
    assert item_nome.valor is None
    assert "cadastro" in resultado.providencia.lower()


def test_duplicidade_exata_cpf_periodo_inicial_e_final() -> None:
    registro = RegistroDiariaExistente(
        linha=547,
        sei="19.20.0902.0004521/2026-11",
        cpf="12345678901",
        periodo_inicial=date(2026, 7, 21),
        periodo_final=date(2026, 7, 23),
        trecho="RECIFE - GARANHUNS",
    )
    resultado = conferir(
        cpf="12345678901",
        periodo_inicial=date(2026, 7, 21),
        periodo_final=date(2026, 7, 23),
        servidor=_SERVIDOR,
        registros_do_cpf=[registro],
        hoje=date(2026, 7, 21),
    )
    assert resultado.veredito is Veredito.REVISAR
    assert resultado.duplicidade == registro


def test_mesmo_cpf_periodo_diferente_nao_e_duplicidade() -> None:
    """RN-02 — a chave é exata nas 3 partes; um único limite de período
    diferente já não é considerado duplicidade."""
    registro = RegistroDiariaExistente(
        linha=547,
        sei="19.20.0902.0004521/2026-11",
        cpf="12345678901",
        periodo_inicial=date(2026, 7, 21),
        periodo_final=date(2026, 7, 23),
        trecho="RECIFE - GARANHUNS",
    )
    resultado = conferir(
        cpf="12345678901",
        periodo_inicial=date(2026, 7, 21),
        periodo_final=date(2026, 7, 24),  # período final diferente
        servidor=_SERVIDOR,
        registros_do_cpf=[registro],
        hoje=date(2026, 7, 21),
    )
    assert resultado.duplicidade is None
    assert resultado.veredito is Veredito.APTO_PARA_PROCESSAMENTO


def test_janela_ainda_nao_liberada() -> None:
    resultado = conferir(
        cpf="12345678901",
        periodo_inicial=date(2026, 8, 15),
        periodo_final=date(2026, 8, 17),
        servidor=_SERVIDOR,
        registros_do_cpf=[],
        hoje=date(2026, 7, 21),
    )
    assert resultado.data_liberacao == date(2026, 7, 31)
    assert resultado.janela_liberada is False
    assert resultado.veredito is Veredito.REVISAR
    assert "31/07/2026" in resultado.providencia


def test_janela_liberada_no_limite_exato() -> None:
    """RN-06/RN-10 — limite inclusivo: no próprio dia da data calculada, já
    está liberado."""
    resultado = conferir(
        cpf="12345678901",
        periodo_inicial=date(2026, 8, 15),
        periodo_final=date(2026, 8, 17),
        servidor=_SERVIDOR,
        registros_do_cpf=[],
        hoje=date(2026, 7, 31),  # exatamente a data de liberação
    )
    assert resultado.janela_liberada is True
    assert resultado.veredito is Veredito.APTO_PARA_PROCESSAMENTO


def test_combinacao_de_pendencias_concatena_providencias() -> None:
    resultado = conferir(
        cpf="99999999999",
        periodo_inicial=date(2026, 8, 15),
        periodo_final=date(2026, 8, 17),
        servidor=None,
        registros_do_cpf=[],
        hoje=date(2026, 7, 21),
    )
    assert resultado.veredito is Veredito.REVISAR
    assert "cadastro" in resultado.providencia.lower()
    assert "31/07/2026" in resultado.providencia
