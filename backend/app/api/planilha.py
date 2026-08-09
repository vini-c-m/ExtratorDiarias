from fastapi import APIRouter, HTTPException

from app.domain.entities.diaria import Diaria
from app.domain.entities.modo_processamento import ModoProcessamento
from app.domain.entities.processo import Processo, StatusProcesso
from app.infra.config import configuracao_app
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
    # Sprint 15 — o backend é a única autoridade sobre o caminho da planilha
    # oficial (§7.1 do doc arquitetural). Esta rota não sabe (e não deveria
    # saber) que existe um `configuracao.json`, qual sua estrutura ou como a
    # validação/fingerprint funcionam — tudo isso fica encapsulado em
    # `configuracao_app`, que expõe só esta função e esta exceção.
    try:
        caminho_planilha = configuracao_app.resolver_caminho_para_preenchimento()
    except configuracao_app.PlanilhaOficialIndisponivel as erro:
        raise HTTPException(status_code=422, detail=str(erro)) from erro

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
            caminho_planilha,
            processos,
            erros,
            avisos,
            tempo_processamento_ms=requisicao.tempo_processamento_ms,
            modo=ModoProcessamento(requisicao.modo),
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
                sei_ja_existente_em_linha=item.sei_ja_existente_em_linha,
            )
            for item in resultado.itens
        ],
        pasta_resultados=arquivos_gerados.pasta_resultados,
        caminho_planilha_gerada=arquivos_gerados.caminho_planilha_gerada,
        caminho_relatorio=arquivos_gerados.caminho_relatorio,
        caminho_log=arquivos_gerados.caminho_log,
        sincronizacao_analitica_falhou=resultado.sincronizacao_analitica_falhou,
    )
