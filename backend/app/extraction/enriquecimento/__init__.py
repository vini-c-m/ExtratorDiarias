from dataclasses import replace

from app.domain.entities.fonte_transporte import FonteTransporte
from app.domain.entities.processo import Processo
from app.domain.entities.tipo_processo import TipoProcesso
from app.extraction.enriquecimento.documento_habil import extrair_documento_habil
from app.extraction.enriquecimento.local_destino import (
    identificar_estado_destino,
    identificar_municipio_final_destino,
)
from app.extraction.enriquecimento.tipo_processo import identificar_tipo_processo
from app.extraction.enriquecimento.transporte import (
    AVISO_TRANSPORTE_NAO_IDENTIFICADO,
    identificar_transporte,
)
from app.extraction.enriquecimento.transporte_regra_operacional import aplicar_regra_operacional
from app.extraction.enriquecimento.valor_diarias_membro import extrair_valor_diarias_membro


def enriquecer_processo(processo: Processo, texto: str) -> Processo:
    """Acrescenta Documento Hábil, transporte, estado do destino e tipo do
    processo a uma Diária já validada — sem alterar SEI, CPF, datas ou
    qualquer campo já validado nas Sprints anteriores. Cada campo só é
    preenchido quando há evidência segura; caso contrário fica vazio e gera
    um aviso de revisão manual, devolvido em `Processo.avisos`.

    O valor das diárias (coluna P) só é buscado para processos identificados
    como Diária de Membro — para todos os demais tipos (inclusive o fluxo
    Padrão já homologado), este campo permanece None e nenhum aviso extra é
    gerado, preservando o comportamento já validado.

    Transporte (Sprint 04.1): a evidência textual continua tendo prioridade
    absoluta — a regra operacional de fallback só entra em jogo quando
    `identificar_transporte` não encontrou NENHUMA evidência (não quando ela
    é conflitante ou fora de CARRO/AVIÃO, casos em que o processo continua
    sinalizado para revisão manual, como sempre)."""
    assert processo.diaria is not None

    documento_habil, aviso_dh = extrair_documento_habil(texto)
    estado_destino, aviso_estado = identificar_estado_destino(
        processo.diaria.cidade_destino, processo.diaria.cidade_origem
    )
    tipo_processo = identificar_tipo_processo(texto)

    transporte, aviso_transporte = identificar_transporte(texto)
    transporte_fonte: FonteTransporte | None = None
    if transporte:
        transporte_fonte = FonteTransporte.EVIDENCIA_DOCUMENTAL
    elif aviso_transporte == AVISO_TRANSPORTE_NAO_IDENTIFICADO:
        municipio_destino, _ = identificar_municipio_final_destino(
            processo.diaria.cidade_destino, processo.diaria.cidade_origem
        )
        transporte_por_regra = aplicar_regra_operacional(estado_destino, municipio_destino)
        if transporte_por_regra:
            transporte = transporte_por_regra
            transporte_fonte = FonteTransporte.REGRA_OPERACIONAL
            aviso_transporte = None

    avisos = [aviso for aviso in (aviso_dh, aviso_transporte, aviso_estado) if aviso]

    valor_total_diarias: str | None = None
    if tipo_processo is TipoProcesso.DIARIA_MEMBRO:
        valor_total_diarias, aviso_valor = extrair_valor_diarias_membro(texto)
        if aviso_valor:
            avisos.append(aviso_valor)

    diaria_enriquecida = replace(
        processo.diaria,
        documento_habil=documento_habil,
        transporte=transporte,
        transporte_fonte=transporte_fonte,
        estado_destino=estado_destino,
        tipo_processo=tipo_processo,
        valor_total_diarias=valor_total_diarias,
    )
    return replace(processo, diaria=diaria_enriquecida, avisos=avisos)
