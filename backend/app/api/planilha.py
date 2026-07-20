from fastapi import APIRouter, HTTPException

from app.domain.entities.diaria import Diaria
from app.domain.entities.processo import Processo, StatusProcesso
from app.planilha.relatorio import ItemAviso, ItemErro
from app.schemas.planilha import (
    ItemResultadoResposta,
    RequisicaoPreenchimento,
    ResultadoPreenchimentoResposta,
)
from app.services.planilha_service import ErroPreenchimentoPlanilha, preencher_planilha

router = APIRouter(prefix="/api/v1", tags=["planilha"])


@router.post("/planilha/preencher", response_model=ResultadoPreenchimentoResposta)
def preencher(requisicao: RequisicaoPreenchimento) -> ResultadoPreenchimentoResposta:
    processos = [
        Processo(
            arquivo_origem=item.arquivo_origem,
            status=StatusProcesso.SUCESSO,
            diaria=Diaria(**item.diaria.model_dump()),
        )
        for item in requisicao.itens
    ]
    erros = [
        ItemErro(arquivo_origem=erro.arquivo_origem, motivos=erro.motivos)
        for erro in requisicao.erros
    ]
    avisos = [
        ItemAviso(arquivo_origem=aviso.arquivo_origem, mensagens=aviso.mensagens)
        for aviso in requisicao.avisos
    ]

    try:
        resultado, arquivos_gerados = preencher_planilha(
            requisicao.caminho_planilha,
            processos,
            erros,
            avisos,
            tempo_processamento_ms=requisicao.tempo_processamento_ms,
        )
    except ErroPreenchimentoPlanilha as erro:
        raise HTTPException(status_code=422, detail=str(erro)) from erro

    return ResultadoPreenchimentoResposta(
        total_gravado=resultado.total_gravado,
        duplicadas_ignoradas=resultado.duplicadas_ignoradas,
        linha_inicial=resultado.linha_inicial,
        linha_final=resultado.linha_final,
        itens=[
            ItemResultadoResposta(
                arquivo_origem=item.arquivo_origem,
                sei=item.sei,
                categoria=item.categoria.value,
                linha=item.linha,
            )
            for item in resultado.itens
        ],
        pasta_resultados=arquivos_gerados.pasta_resultados,
        caminho_planilha_gerada=arquivos_gerados.caminho_planilha_gerada,
        caminho_relatorio=arquivos_gerados.caminho_relatorio,
        caminho_log=arquivos_gerados.caminho_log,
    )
