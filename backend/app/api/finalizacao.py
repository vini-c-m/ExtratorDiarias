from fastapi import APIRouter, HTTPException

from app.infra.config import configuracao_app
from app.schemas.finalizacao import (
    AvaliacaoElegibilidadeResposta,
    CandidatoLinhaResposta,
    ItemAnaliseFinalizacaoResposta,
    ItemResultadoConfirmacaoResposta,
    RequisicaoAnaliseFinalizacao,
    RequisicaoConfirmacaoFinalizacao,
    RespostaAnaliseFinalizacao,
    RespostaConfirmacaoFinalizacao,
)
from app.services.finalizacao_service import (
    ErroFinalizacaoDiarias,
    ItemConfirmacao,
    analisar_lote,
    confirmar,
)

router = APIRouter(prefix="/api/v1", tags=["finalizacao"])


def _resolver_caminho_planilha() -> str:
    try:
        return configuracao_app.resolver_caminho_para_preenchimento()
    except configuracao_app.PlanilhaOficialIndisponivel as erro:
        raise HTTPException(status_code=422, detail=str(erro)) from erro


@router.post("/finalizacao/analisar", response_model=RespostaAnaliseFinalizacao)
def analisar(requisicao: RequisicaoAnaliseFinalizacao) -> RespostaAnaliseFinalizacao:
    caminho_planilha = _resolver_caminho_planilha()
    try:
        itens = analisar_lote(requisicao.arquivos, caminho_planilha)
    except ErroFinalizacaoDiarias as erro:
        raise HTTPException(status_code=422, detail=str(erro)) from erro

    return RespostaAnaliseFinalizacao(
        itens=[
            ItemAnaliseFinalizacaoResposta(
                arquivo_origem=item.arquivo_origem,
                sei=item.sei,
                status=item.status.value,
                motivo=item.motivo,
                avaliacao=(
                    AvaliacaoElegibilidadeResposta(
                        confirmacao_encontrada=item.avaliacao.confirmacao_encontrada,
                        confirmacao_valida=item.avaliacao.confirmacao_valida,
                        comprovante_encontrado=item.avaliacao.comprovante_encontrado,
                        situacao_comprovante=item.avaliacao.situacao_comprovante.value,
                        ordem_bancaria_encontrada=item.avaliacao.ordem_bancaria_encontrada,
                        apto=item.avaliacao.apto,
                        pendente_analitico=item.avaliacao.pendente_analitico,
                        alertas=list(item.avaliacao.alertas),
                    )
                    if item.avaliacao
                    else None
                ),
                candidatos=[
                    CandidatoLinhaResposta(
                        linha=candidato.linha,
                        cpf=candidato.cpf,
                        periodo_inicial=candidato.periodo_inicial,
                        periodo_final=candidato.periodo_final,
                        trecho=candidato.trecho,
                        dh=candidato.dh,
                        aviso=candidato.aviso,
                        x_atual=candidato.x_atual,
                        y_atual=candidato.y_atual,
                        estado=candidato.estado.value,
                    )
                    for candidato in item.candidatos
                ],
            )
            for item in itens
        ]
    )


@router.post("/finalizacao/confirmar", response_model=RespostaConfirmacaoFinalizacao)
def confirmar_rota(requisicao: RequisicaoConfirmacaoFinalizacao) -> RespostaConfirmacaoFinalizacao:
    caminho_planilha = _resolver_caminho_planilha()
    try:
        resultado = confirmar(
            [
                ItemConfirmacao(arquivo_origem=item.arquivo_origem, sei=item.sei)
                for item in requisicao.itens
            ],
            caminho_planilha,
        )
    except ErroFinalizacaoDiarias as erro:
        raise HTTPException(status_code=422, detail=str(erro)) from erro

    return RespostaConfirmacaoFinalizacao(
        total_finalizado=resultado.total_finalizado,
        total_ja_confirmado=resultado.total_ja_confirmado,
        total_ignorado=resultado.total_ignorado,
        sincronizacao_analitica_falhou=resultado.sincronizacao_analitica_falhou,
        itens=[
            ItemResultadoConfirmacaoResposta(
                arquivo_origem=item.arquivo_origem,
                sei=item.sei,
                categoria=item.categoria.value,
                linhas_atualizadas=item.linhas_atualizadas,
                linhas_mantidas=item.linhas_mantidas,
                motivo=item.motivo,
            )
            for item in resultado.itens
        ],
    )
