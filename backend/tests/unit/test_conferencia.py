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


_REGISTRO_EXISTENTE = RegistroDiariaExistente(
    linha=547,
    sei="19.20.0902.0004521/2026-11",
    cpf="12345678901",
    periodo_inicial=date(2026, 7, 21),
    periodo_final=date(2026, 7, 23),
    trecho="RECIFE - GARANHUNS",
)


def test_duplicidade_quando_as_duas_datas_coincidem() -> None:
    resultado = conferir(
        cpf="12345678901",
        periodo_inicial=date(2026, 7, 21),
        periodo_final=date(2026, 7, 23),
        servidor=_SERVIDOR,
        registros_do_cpf=[_REGISTRO_EXISTENTE],
        hoje=date(2026, 7, 21),
    )
    assert resultado.veredito is Veredito.REVISAR
    assert resultado.duplicidade == _REGISTRO_EXISTENTE


def test_duplicidade_quando_apenas_a_data_inicial_coincide() -> None:
    """RN-02 (correção de 2026-08-05) — caso real que motivou a correção:
    diária existente 21/07 a 23/07; consulta usa a mesma data inicial mas um
    período final totalmente diferente. Antes da correção isso não era
    sinalizado (exigia as duas datas simultâneas); agora precisa ser."""
    resultado = conferir(
        cpf="12345678901",
        periodo_inicial=date(2026, 7, 21),  # coincide com o período inicial existente
        periodo_final=date(2026, 8, 1),
        servidor=_SERVIDOR,
        registros_do_cpf=[_REGISTRO_EXISTENTE],
        hoje=date(2026, 7, 21),
    )
    assert resultado.veredito is Veredito.REVISAR
    assert resultado.duplicidade == _REGISTRO_EXISTENTE


def test_duplicidade_quando_apenas_a_data_final_coincide() -> None:
    resultado = conferir(
        cpf="12345678901",
        periodo_inicial=date(2026, 7, 18),
        periodo_final=date(2026, 7, 23),  # coincide com o período final existente
        servidor=_SERVIDOR,
        registros_do_cpf=[_REGISTRO_EXISTENTE],
        hoje=date(2026, 7, 18),
    )
    assert resultado.veredito is Veredito.REVISAR
    assert resultado.duplicidade == _REGISTRO_EXISTENTE


def test_nenhuma_data_coincide_nao_e_duplicidade() -> None:
    resultado = conferir(
        cpf="12345678901",
        periodo_inicial=date(2026, 8, 10),
        periodo_final=date(2026, 8, 12),
        servidor=_SERVIDOR,
        registros_do_cpf=[_REGISTRO_EXISTENTE],
        hoje=date(2026, 8, 10),
    )
    assert resultado.duplicidade is None
    assert resultado.veredito is Veredito.APTO_PARA_PROCESSAMENTO


def test_data_coincidente_mas_cpf_diferente_nao_e_duplicidade() -> None:
    """A checagem de data isolada continua exigindo o mesmo CPF —
    `registros_do_cpf` já chega filtrado pelo CPF consultado (ver
    `app/services/conferencia_service.py`); um registro de outro CPF nunca
    deveria estar nesta lista, mas o teste documenta explicitamente que,
    mesmo que estivesse, esta função não teria como saber — a garantia real
    de isolamento por CPF vive na indexação (`repositorio_diarias.diarias_por_cpf`),
    coberta em `tests/integration/test_repositorio_diarias.py`. Aqui,
    simplesmente, a lista de registros não contém o outro CPF."""
    resultado = conferir(
        cpf="99999999999",
        periodo_inicial=date(2026, 7, 21),  # mesma data do registro do OUTRO cpf
        periodo_final=date(2026, 7, 23),
        servidor=_SERVIDOR,
        registros_do_cpf=[],  # nada indexado para este CPF
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
