"""Continuidade Processual — localização de candidatos a "diária original"
de um Complemento de Diárias. Caso real que fundamenta as evidências:
SEI 19.20.0001.0004758/2026-36 (mesmo CPF, mesmo período, mesmo SEI, DH
original "2026DH900453" citado na Validação de Diária complementar)."""

from datetime import date

from app.domain.continuidade_processual import (
    ConsultaComplemento,
    localizar_candidatos_diaria_original,
)
from app.domain.entities.registro_analitico import RegistroAnalitico
from app.domain.entities.servidor import Servidor

_CPF = "11111111111"


def _consulta(**overrides) -> ConsultaComplemento:
    base = dict(
        cpf=_CPF,
        periodo_inicial=date(2026, 3, 17),
        periodo_final=date(2026, 3, 19),
        cidade_destino="Recife",
        sei="19.20.0001.0004758/2026-36",
        texto_processo="",
    )
    base.update(overrides)
    return ConsultaComplemento(**base)


def _registro(**overrides) -> RegistroAnalitico:
    base = dict(
        sei="19.20.0001.0004758/2026-36",
        doc_origem="Solicitação de Diária",
        cpf=_CPF,
        periodo_inicial=date(2026, 3, 17),
        periodo_final=date(2026, 3, 19),
        cidade_origem="Ouricuri",
        cidade_destino="Recife",
        motivo="Recolhimento de material de expediente",
        transporte=None,
        valor_total_diarias=154.09,
        linha_planilha=457,
        servidor=Servidor(
            cpf=_CPF, nome="Roberto Alves Ferreira", cargo="Motorista", previdencia="RGPS"
        ),
        dh="2026DH900453",
    )
    base.update(overrides)
    return RegistroAnalitico(**base)


def test_mesmo_sei_mesmo_periodo_gera_candidato_com_evidencias_de_periodo_e_sei():
    consulta = _consulta()
    original = _registro()

    candidatos = localizar_candidatos_diaria_original(consulta, registros_do_cpf=[original])

    assert len(candidatos) == 1
    evidencias = " ".join(candidatos[0].evidencias)
    assert "Período coincide" in evidencias
    assert "Mesmo número de SEI" in evidencias


def test_sei_diferente_mas_periodo_e_destino_iguais_ainda_gera_candidato():
    """Achado real: SEI nunca é chave obrigatória — um complemento legítimo
    pode ter um SEI totalmente diferente do processo original."""
    consulta = _consulta(sei="19.20.0001.0009999/2026-01")
    original = _registro(sei="19.20.0001.0004758/2026-36")

    candidatos = localizar_candidatos_diaria_original(consulta, registros_do_cpf=[original])

    assert len(candidatos) == 1
    evidencias = " ".join(candidatos[0].evidencias)
    assert "Mesmo número de SEI" not in evidencias
    assert "Período coincide" in evidencias
    assert "Mesmo destino" in evidencias


def test_mesmo_cpf_sem_nenhum_outro_sinal_nao_gera_candidato():
    """Mesmo CPF sozinho não é suficiente — uma pessoa pode ter dezenas de
    diárias não relacionadas ao complemento em questão."""
    consulta = _consulta(
        periodo_inicial=date(2027, 1, 10), periodo_final=date(2027, 1, 12), cidade_destino="Petrolina"
    )
    original = _registro(
        sei="19.20.0001.0001111/2026-11",
        periodo_inicial=date(2026, 1, 5),
        periodo_final=date(2026, 1, 7),
        cidade_destino="Salvador",
        dh=None,
    )

    candidatos = localizar_candidatos_diaria_original(consulta, registros_do_cpf=[original])

    assert candidatos == []


def test_periodo_proximo_mas_nao_sobreposto_ainda_gera_candidato():
    consulta = _consulta(periodo_inicial=date(2026, 4, 10), periodo_final=date(2026, 4, 10))
    original = _registro(periodo_inicial=date(2026, 3, 17), periodo_final=date(2026, 3, 19))

    candidatos = localizar_candidatos_diaria_original(consulta, registros_do_cpf=[original])

    assert len(candidatos) == 1
    assert "Período coincide ou é próximo" in candidatos[0].evidencias[0]


def test_periodo_muito_distante_e_sem_outro_sinal_nao_gera_candidato():
    consulta = _consulta(periodo_inicial=date(2027, 6, 1), periodo_final=date(2027, 6, 3))
    original = _registro(sei="19.20.0001.0001111/2026-11", cidade_destino="Petrolina", dh=None)

    candidatos = localizar_candidatos_diaria_original(consulta, registros_do_cpf=[original])

    assert candidatos == []


def test_dh_original_citado_no_texto_do_processo_de_complemento_gera_candidato():
    consulta = _consulta(
        periodo_inicial=date(2027, 1, 1),
        periodo_final=date(2027, 1, 1),
        cidade_destino="Caruaru",
        sei="19.20.0001.0009999/2026-01",
        texto_processo="OBSERVAÇÕES: 2026DH900453. PAGAMENTO DE VALOR FALTANTE",
    )
    original = _registro(sei="19.20.0001.0001111/2026-11", dh="2026DH900453", cidade_destino="Petrolina")

    candidatos = localizar_candidatos_diaria_original(consulta, registros_do_cpf=[original])

    assert len(candidatos) == 1
    assert any("Documento Hábil" in evidencia for evidencia in candidatos[0].evidencias)


def test_pista_textual_so_reforca_candidato_ja_com_evidencia_estrutural():
    consulta = _consulta(texto_processo="2026DH900453. PAGAMENTO DE VALOR FALTANTE")
    original = _registro()

    candidatos = localizar_candidatos_diaria_original(consulta, registros_do_cpf=[original])

    assert len(candidatos) == 1
    assert any("valor faltante" in evidencia for evidencia in candidatos[0].evidencias)


def test_pista_textual_sozinha_sem_evidencia_estrutural_nao_gera_candidato():
    consulta = _consulta(
        periodo_inicial=date(2027, 1, 1),
        periodo_final=date(2027, 1, 1),
        cidade_destino="Caruaru",
        sei="19.20.0001.0009999/2026-01",
        texto_processo="Trata-se de um pedido de complemento de diária.",
    )
    original = _registro(sei="19.20.0001.0001111/2026-11", cidade_destino="Petrolina", dh=None)

    candidatos = localizar_candidatos_diaria_original(consulta, registros_do_cpf=[original])

    assert candidatos == []


def test_nenhum_registro_do_cpf_devolve_lista_vazia():
    consulta = _consulta()

    candidatos = localizar_candidatos_diaria_original(consulta, registros_do_cpf=[])

    assert candidatos == []
