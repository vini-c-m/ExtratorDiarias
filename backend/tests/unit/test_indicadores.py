from datetime import date

from app.domain.analitica.indicadores import calcular_indicadores
from app.domain.entities.registro_analitico import RegistroAnalitico
from app.domain.entities.servidor import Servidor

_SERVIDOR = Servidor(cpf="11111111111", nome="Maria Souza", cargo="Analista", previdencia="RPPS")


def _registro(cpf, valor, *, sei="19.20.0001.0000001/2026-01", servidor=None):
    return RegistroAnalitico(
        sei=sei,
        doc_origem="processo.pdf",
        cpf=cpf,
        periodo_inicial=date(2026, 1, 8),
        periodo_final=date(2026, 1, 10),
        cidade_origem="RECIFE",
        cidade_destino="GARANHUNS",
        motivo="Reunião",
        transporte="CARRO",
        valor_total_diarias=valor,
        linha_planilha=2,
        servidor=servidor,
    )


def test_recorte_vazio_zera_contagens_e_devolve_none_para_valor() -> None:
    resultado = calcular_indicadores([])

    assert resultado.total_diarias == 0
    assert resultado.total_servidores == 0
    assert resultado.valor_total is None
    assert resultado.valor_medio is None


def test_total_diarias_conta_cada_registro_do_recorte() -> None:
    registros = [
        _registro("11111111111", 100.0, sei="19.20.0001.0000001/2026-01"),
        _registro("22222222222", 200.0, sei="19.20.0001.0000002/2026-02"),
        _registro("33333333333", 300.0, sei="19.20.0001.0000003/2026-03"),
    ]

    resultado = calcular_indicadores(registros)

    assert resultado.total_diarias == 3


def test_total_servidores_conta_cpfs_distintos_mesmo_com_diarias_repetidas_do_mesmo_cpf() -> None:
    registros = [
        _registro("11111111111", 100.0, sei="19.20.0001.0000001/2026-01"),
        _registro("11111111111", 150.0, sei="19.20.0001.0000002/2026-02"),
        _registro("22222222222", 200.0, sei="19.20.0001.0000003/2026-03"),
    ]

    resultado = calcular_indicadores(registros)

    assert resultado.total_diarias == 3
    assert resultado.total_servidores == 2


def test_total_servidores_conta_cpf_da_diaria_mesmo_sem_cadastro_do_servidor() -> None:
    # RN-01 já documentada — `servidor is None` (CPF sem cadastro em
    # `Dados`) não impede a diária de contar para "total de servidores":
    # o KPI é sobre o CPF da diária, não sobre ter ou não um `Servidor`
    # resolvido.
    registros = [_registro("99999999999", 100.0, servidor=None)]

    resultado = calcular_indicadores(registros)

    assert resultado.total_servidores == 1


def test_valor_total_soma_e_valor_medio_tira_a_media_ignorando_nulos() -> None:
    registros = [
        _registro("11111111111", 100.0, sei="19.20.0001.0000001/2026-01"),
        _registro("22222222222", None, sei="19.20.0001.0000002/2026-02"),
        _registro("33333333333", 300.0, sei="19.20.0001.0000003/2026-03"),
    ]

    resultado = calcular_indicadores(registros)

    # Diária com valor None é ignorada do somatório/média (mesmo critério
    # de SUM/AVG do SQL) — nunca tratada como zero.
    assert resultado.valor_total == 400.0
    assert resultado.valor_medio == 200.0


def test_todas_as_diarias_sem_valor_devolve_none_nunca_zero() -> None:
    registros = [
        _registro("11111111111", None, sei="19.20.0001.0000001/2026-01"),
        _registro("22222222222", None, sei="19.20.0001.0000002/2026-02"),
    ]

    resultado = calcular_indicadores(registros)

    assert resultado.total_diarias == 2
    assert resultado.valor_total is None
    assert resultado.valor_medio is None
