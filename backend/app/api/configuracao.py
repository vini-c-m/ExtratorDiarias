import logging

from fastapi import APIRouter, HTTPException

from app.consulta import base_local
from app.infra.config import configuracao_app
from app.infra.config.configuracao_app import Configuracao, PlanilhaInvalida
from app.schemas.configuracao import RequisicaoConfiguracao

router = APIRouter(prefix="/api/v1", tags=["configuracao"])

_logger = logging.getLogger(__name__)


def _resposta_configurada(configuracao: Configuracao, *, planilha_acessivel: bool, requer_revalidacao: bool) -> dict:
    return {
        "configurado": True,
        "planilha_acessivel": planilha_acessivel,
        "requer_revalidacao": requer_revalidacao,
        "caminho_planilha_oficial": configuracao.caminho_planilha_oficial,
        "configurado_em": configuracao.configurado_em,
    }


@router.get("/configuracao")
def obter_configuracao() -> dict:
    estado = configuracao_app.avaliar_estado_atual()

    if not estado.configurado:
        return {"configurado": False}

    if not estado.planilha_acessivel:
        return {"configurado": True, "planilha_acessivel": False}

    assert estado.configuracao is not None
    return _resposta_configurada(
        estado.configuracao,
        planilha_acessivel=True,
        requer_revalidacao=estado.requer_revalidacao,
    )


@router.post("/configuracao")
def definir_configuracao(requisicao: RequisicaoConfiguracao) -> dict:
    try:
        fingerprint = configuracao_app.validar_planilha(requisicao.caminho_planilha_oficial)
    except PlanilhaInvalida as erro:
        raise HTTPException(status_code=422, detail=str(erro)) from erro

    configuracao = configuracao_app.persistir(requisicao.caminho_planilha_oficial, fingerprint)

    # Sprint 18.7 — hook aditivo, mesmo padrão de `planilha_service.py`: a
    # Central Analítica não pode mais depender de um processamento de PDF
    # ou de um clique manual em "Sincronizar agora" para ficar disponível
    # (defeito reportado nesta Sprint). Síncrono (não background) porque
    # "disponível imediatamente" significa que a Base Local já existe
    # quando esta resposta retorna — e best-effort: uma falha aqui nunca
    # pode impedir a Configuração Inicial (ou "Alterar Planilha Oficial",
    # que reusa esta mesma rota) de ser salva com sucesso.
    try:
        base_local.sincronizar(configuracao.caminho_planilha_oficial, origem="configuracao_inicial")
    except Exception:
        _logger.exception("Falha ao reconstruir a Base Local após salvar a Configuração Inicial")

    return _resposta_configurada(configuracao, planilha_acessivel=True, requer_revalidacao=False)
