from datetime import date

from app.domain.entities.registro_controle import ClassificacaoSei, RegistroControle
from app.domain.relatorio_transparencia.quantidade_diarias import (
    QuantidadeDiarias,
    resolver_quantidade_diarias,
)


def _registro(*, linha=2, integral=None, parcial=None):
    return RegistroControle(
        linha=linha,
        dh="2026DH000001",
        sei=None,
        sei_classificacao=ClassificacaoSei.AUSENTE,
        doc_origem=None,
        cpf=None,
        periodo_inicial=date(2026, 1, 8),
        periodo_final=date(2026, 1, 10),
        cidade_origem=None,
        cidade_destino=None,
        trecho=None,
        motivo=None,
        transporte=None,
        valor_total_diarias=None,
        quantidade_diaria_integral=integral,
        quantidade_diaria_parcial=parcial,
    )


def test_sem_nenhum_registro_devolve_none():
    assert resolver_quantidade_diarias([]) is None


def test_um_unico_registro_e_o_caso_trivial():
    resultado = resolver_quantidade_diarias([_registro(integral=2, parcial=1)])
    assert resultado == QuantidadeDiarias(integral=2, parcial=1)


def test_zero_e_um_valor_legitimo_nunca_vira_none_sozinho():
    resultado = resolver_quantidade_diarias([_registro(integral=0, parcial=1)])
    assert resultado == QuantidadeDiarias(integral=0, parcial=1)


def test_multiplos_registros_concordando_resolve_normalmente():
    resultado = resolver_quantidade_diarias(
        [_registro(linha=2, integral=2, parcial=0), _registro(linha=3, integral=2, parcial=0)]
    )
    assert resultado == QuantidadeDiarias(integral=2, parcial=0)


def test_multiplos_registros_divergentes_devolve_none_nunca_escolhe_um():
    resultado = resolver_quantidade_diarias(
        [_registro(linha=2, integral=1, parcial=1), _registro(linha=3, integral=1, parcial=0)]
    )
    assert resultado is None


def test_todos_os_registros_sem_quantidade_devolve_none_integral_e_parcial():
    resultado = resolver_quantidade_diarias([_registro(integral=None, parcial=None)])
    assert resultado == QuantidadeDiarias(integral=None, parcial=None)
