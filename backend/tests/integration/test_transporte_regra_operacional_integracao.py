"""Sprint 04.1 — Regra operacional de transporte (fallback).

Cobre o critério de aceite ponta a ponta via `enriquecer_processo`: sem
nenhuma evidência textual de transporte no processo, o sistema aplica a
regra operacional consolidada do setor a partir do estado (e, no caso de
Pernambuco, do município final) de destino já resolvido."""

from datetime import date

from app.domain.entities.diaria import Diaria
from app.domain.entities.fonte_transporte import FonteTransporte
from app.domain.entities.processo import Processo, StatusProcesso
from app.extraction.enriquecimento import enriquecer_processo

_TEXTO_SEM_EVIDENCIA_DE_TRANSPORTE = "FINALIDADE DA VIAGEM: De acordo com a requisição."


def _processo(cidade_destino: str, cidade_origem: str = "Recife") -> Processo:
    diaria = Diaria(
        sei="19.20.0000.0000001/2025-99",
        doc_origem="UNIDADE TESTE",
        cpf="99999999999",
        periodo_inicial=date(2025, 3, 1),
        periodo_final=date(2025, 3, 1),
        cidade_origem=cidade_origem,
        cidade_destino=cidade_destino,
        motivo="De acordo com a requisição.",
    )
    return Processo(arquivo_origem="arquivo.pdf", status=StatusProcesso.SUCESSO, diaria=diaria)


def test_pernambuco_petrolina_resulta_em_aviao_por_regra_operacional():
    processo = _processo("Petrolina")

    enriquecido = enriquecer_processo(processo, _TEXTO_SEM_EVIDENCIA_DE_TRANSPORTE)

    assert enriquecido.diaria.estado_destino == "PERNAMBUCO"
    assert enriquecido.diaria.transporte == "AVIÃO"
    assert enriquecido.diaria.transporte_fonte is FonteTransporte.REGRA_OPERACIONAL
    assert not any("transporte" in aviso.lower() for aviso in enriquecido.avisos)


def test_pernambuco_outro_municipio_resulta_em_carro_por_regra_operacional():
    processo = _processo("Garanhuns")

    enriquecido = enriquecer_processo(processo, _TEXTO_SEM_EVIDENCIA_DE_TRANSPORTE)

    assert enriquecido.diaria.estado_destino == "PERNAMBUCO"
    assert enriquecido.diaria.transporte == "CARRO"
    assert enriquecido.diaria.transporte_fonte is FonteTransporte.REGRA_OPERACIONAL


def test_paraiba_resulta_em_carro_por_regra_operacional():
    processo = _processo("João Pessoa/PB")

    enriquecido = enriquecer_processo(processo, _TEXTO_SEM_EVIDENCIA_DE_TRANSPORTE)

    assert enriquecido.diaria.estado_destino == "PARAÍBA"
    assert enriquecido.diaria.transporte == "CARRO"
    assert enriquecido.diaria.transporte_fonte is FonteTransporte.REGRA_OPERACIONAL


def test_bahia_resulta_em_aviao_por_regra_operacional():
    processo = _processo("Salvador/BA")

    enriquecido = enriquecer_processo(processo, _TEXTO_SEM_EVIDENCIA_DE_TRANSPORTE)

    assert enriquecido.diaria.estado_destino == "BAHIA"
    assert enriquecido.diaria.transporte == "AVIÃO"
    assert enriquecido.diaria.transporte_fonte is FonteTransporte.REGRA_OPERACIONAL


def test_sao_paulo_resulta_em_aviao_por_regra_operacional():
    processo = _processo("São Paulo/SP")

    enriquecido = enriquecer_processo(processo, _TEXTO_SEM_EVIDENCIA_DE_TRANSPORTE)

    assert enriquecido.diaria.estado_destino == "SÃO PAULO"
    assert enriquecido.diaria.transporte == "AVIÃO"
    assert enriquecido.diaria.transporte_fonte is FonteTransporte.REGRA_OPERACIONAL


def test_amazonas_resulta_em_aviao_por_regra_operacional():
    processo = _processo("Manaus/AM")

    enriquecido = enriquecer_processo(processo, _TEXTO_SEM_EVIDENCIA_DE_TRANSPORTE)

    assert enriquecido.diaria.estado_destino == "AMAZONAS"
    assert enriquecido.diaria.transporte == "AVIÃO"
    assert enriquecido.diaria.transporte_fonte is FonteTransporte.REGRA_OPERACIONAL


def test_evidencia_textual_tem_prioridade_sobre_a_regra_operacional():
    """Mesmo indo para Petrolina (que a regra mandaria de AVIÃO), evidência
    textual explícita de CARRO no processo continua prevalecendo — a regra
    operacional nunca substitui a lógica baseada em evidência."""
    processo = _processo("Petrolina")
    texto = "Viagem realizada em VEÍCULO OFICIAL da Coordenadoria."

    enriquecido = enriquecer_processo(processo, texto)

    assert enriquecido.diaria.transporte == "CARRO"
    assert enriquecido.diaria.transporte_fonte is FonteTransporte.EVIDENCIA_DOCUMENTAL


def test_evidencia_conflitante_nao_e_substituida_pela_regra_operacional():
    """Evidência conflitante (carro E avião no mesmo processo) continua sem
    preenchimento e com aviso — a regra operacional só entra quando NÃO há
    evidência nenhuma, não quando ela existe mas é ambígua."""
    processo = _processo("Garanhuns")
    texto = "PASSAGEM AÉREA emitida, mas depois usado VEÍCULO OFICIAL para o trecho final."

    enriquecido = enriquecer_processo(processo, texto)

    assert enriquecido.diaria.transporte is None
    assert enriquecido.diaria.transporte_fonte is None
    assert any("conflitantes" in aviso for aviso in enriquecido.avisos)


def test_evidencia_fora_de_carro_aviao_nao_e_substituida_pela_regra_operacional():
    processo = _processo("Garanhuns")
    texto = "Anexo o comprovante da PASSAGEM RODOVIÁRIA utilizada na viagem."

    enriquecido = enriquecer_processo(processo, texto)

    assert enriquecido.diaria.transporte is None
    assert enriquecido.diaria.transporte_fonte is None
    assert any("fora de CARRO/AVIÃO" in aviso for aviso in enriquecido.avisos)


def test_estado_de_destino_nao_resolvido_deixa_transporte_em_branco():
    """Sem conseguir nem resolver o estado de destino, a regra operacional
    não tem base para decidir — comportamento anterior a esta Sprint
    permanece intocado nesse caso."""
    processo = _processo("Cidade Que Nao Existe De Verdade")

    enriquecido = enriquecer_processo(processo, _TEXTO_SEM_EVIDENCIA_DE_TRANSPORTE)

    assert enriquecido.diaria.estado_destino is None
    assert enriquecido.diaria.transporte is None
    assert enriquecido.diaria.transporte_fonte is None
    assert any("necessita revisão manual" in aviso.lower() for aviso in enriquecido.avisos)
