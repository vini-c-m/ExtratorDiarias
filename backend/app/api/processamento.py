from dataclasses import asdict

from fastapi import APIRouter

from app.domain.entities.modo_processamento import ModoProcessamento
from app.schemas.processamento import (
    DiariaResposta,
    ErroExtracaoResposta,
    LoteProcessamentoResposta,
    ProcessoResposta,
    RequisicaoProcessamento,
)
from app.services.processamento_service import processar_lote

router = APIRouter(prefix="/api/v1", tags=["processamento"])


@router.post("/processamento", response_model=LoteProcessamentoResposta)
def iniciar_processamento(requisicao: RequisicaoProcessamento) -> LoteProcessamentoResposta:
    lote = processar_lote(requisicao.arquivos, ModoProcessamento(requisicao.modo))

    return LoteProcessamentoResposta(
        id=lote.id,
        total=lote.total,
        sucesso=lote.sucesso,
        erro=lote.erro,
        processos=[
            ProcessoResposta(
                id=processo.id,
                arquivo_origem=processo.arquivo_origem,
                status=processo.status.value,
                diaria=DiariaResposta(**asdict(processo.diaria)) if processo.diaria else None,
                erro=ErroExtracaoResposta(motivos=processo.erro.motivos)
                if processo.erro
                else None,
                avisos=processo.avisos,
            )
            for processo in lote.processos
        ],
    )
