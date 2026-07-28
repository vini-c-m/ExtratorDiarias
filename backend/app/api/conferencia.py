from fastapi import APIRouter, HTTPException

from app.schemas.conferencia import (
    DuplicidadeResposta,
    ItemChecklistResposta,
    JanelaProcessamentoResposta,
    RequisicaoConferencia,
    RequisicaoHistorico,
    RespostaHistorico,
    ResultadoConferenciaResposta,
    ServidorResposta,
)
from app.services.conferencia_service import (
    BaseLocalIndisponivel,
    ServidorNaoEncontrado,
    conferir_cpf,
    gerar_historico,
)

# RN-11 — só rotas de leitura/consulta. Nenhum verbo de escrita: a Central
# nunca altera a planilha oficial nem a Base Local (só o hook de
# sincronização em `planilha_service.py` escreve na Base Local, fora desta
# API).
router = APIRouter(prefix="/api/v1", tags=["conferencia"])


@router.post("/conferencia", response_model=ResultadoConferenciaResposta)
def conferir(requisicao: RequisicaoConferencia) -> ResultadoConferenciaResposta:
    try:
        resultado = conferir_cpf(
            requisicao.cpf, requisicao.periodo_inicial, requisicao.periodo_final
        )
    except BaseLocalIndisponivel as erro:
        raise HTTPException(status_code=503, detail=str(erro)) from erro

    return ResultadoConferenciaResposta(
        veredito=resultado.veredito.value,
        providencia=resultado.providencia,
        checklist=[
            ItemChecklistResposta(item=item.item, ok=item.ok, valor=item.valor)
            for item in resultado.checklist
        ],
        servidor=(
            ServidorResposta(
                nome=resultado.servidor.nome,
                cargo=resultado.servidor.cargo,
                previdencia=resultado.servidor.previdencia,
            )
            if resultado.servidor
            else None
        ),
        duplicidade=(
            DuplicidadeResposta(
                linha=resultado.duplicidade.linha,
                sei=resultado.duplicidade.sei,
                trecho=resultado.duplicidade.trecho,
                periodo_inicial=resultado.duplicidade.periodo_inicial,
                periodo_final=resultado.duplicidade.periodo_final,
            )
            if resultado.duplicidade
            else None
        ),
        janela_processamento=JanelaProcessamentoResposta(
            liberado=resultado.janela_liberada,
            data_liberacao=resultado.data_liberacao,
        ),
    )


@router.post("/conferencia/historico", response_model=RespostaHistorico)
def historico(requisicao: RequisicaoHistorico) -> RespostaHistorico:
    try:
        texto = gerar_historico(
            requisicao.cpf,
            requisicao.periodo_inicial,
            requisicao.periodo_final,
            requisicao.sei,
            requisicao.origem,
            requisicao.destino,
        )
    except BaseLocalIndisponivel as erro:
        raise HTTPException(status_code=503, detail=str(erro)) from erro
    except ServidorNaoEncontrado as erro:
        raise HTTPException(status_code=404, detail=str(erro)) from erro

    return RespostaHistorico(texto=texto)
