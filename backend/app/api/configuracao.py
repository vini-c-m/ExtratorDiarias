import logging

from fastapi import APIRouter, HTTPException

from app.consulta import base_local
from app.infra.config import configuracao_app
from app.infra.config.configuracao_app import (
    Configuracao,
    ConfiguracaoAppEmUso,
    PastaInvalida,
    PlanilhaInvalida,
    ProntidaoFuncionalidade,
)
from app.schemas.configuracao import RequisicaoConfiguracao, RequisicaoPastasOperacionais

router = APIRouter(prefix="/api/v1", tags=["configuracao"])

_logger = logging.getLogger(__name__)


def _prontidao_resposta(prontidao: ProntidaoFuncionalidade | None) -> dict | None:
    if prontidao is None:
        return None
    return {
        "processamento_padrao": {
            "liberado": prontidao.processamento_padrao.liberado,
            "pastas_faltando": prontidao.processamento_padrao.pastas_faltando,
        },
        "complemento": {
            "liberado": prontidao.complemento.liberado,
            "pastas_faltando": prontidao.complemento.pastas_faltando,
        },
        "finalizacao": {
            "liberado": prontidao.finalizacao.liberado,
            "pastas_faltando": prontidao.finalizacao.pastas_faltando,
        },
    }


def _campos_pastas(configuracao: Configuracao) -> dict:
    return {
        "caminho_pdfs_a_processar": configuracao.caminho_pdfs_a_processar,
        "caminho_pdfs_complemento_a_processar": configuracao.caminho_pdfs_complemento_a_processar,
        "caminho_pdfs_processados": configuracao.caminho_pdfs_processados,
        "caminho_pdfs_diarias_a_confirmar": configuracao.caminho_pdfs_diarias_a_confirmar,
    }


def _resposta_configurada(
    configuracao: Configuracao,
    *,
    planilha_acessivel: bool,
    requer_revalidacao: bool,
    prontidao_pastas: ProntidaoFuncionalidade | None = None,
) -> dict:
    return {
        "configurado": True,
        "planilha_acessivel": planilha_acessivel,
        "requer_revalidacao": requer_revalidacao,
        "caminho_planilha_oficial": configuracao.caminho_planilha_oficial,
        "configurado_em": configuracao.configurado_em,
        **_campos_pastas(configuracao),
        "prontidao_pastas": _prontidao_resposta(prontidao_pastas),
    }


def _resposta_planilha_inacessivel(
    configuracao: Configuracao, *, prontidao_pastas: ProntidaoFuncionalidade | None
) -> dict:
    return {
        "configurado": True,
        "planilha_acessivel": False,
        **_campos_pastas(configuracao),
        "prontidao_pastas": _prontidao_resposta(prontidao_pastas),
    }


@router.get("/configuracao")
def obter_configuracao() -> dict:
    estado = configuracao_app.avaliar_estado_atual()

    if not estado.configurado:
        return {"configurado": False}

    assert estado.configuracao is not None

    if not estado.planilha_acessivel:
        return _resposta_planilha_inacessivel(estado.configuracao, prontidao_pastas=estado.prontidao_pastas)

    return _resposta_configurada(
        estado.configuracao,
        planilha_acessivel=True,
        requer_revalidacao=estado.requer_revalidacao,
        prontidao_pastas=estado.prontidao_pastas,
    )


@router.post("/configuracao")
def definir_configuracao(requisicao: RequisicaoConfiguracao) -> dict:
    try:
        fingerprint = configuracao_app.validar_planilha(requisicao.caminho_planilha_oficial)
    except PlanilhaInvalida as erro:
        raise HTTPException(status_code=422, detail=str(erro)) from erro

    try:
        configuracao = configuracao_app.persistir(requisicao.caminho_planilha_oficial, fingerprint)
    except ConfiguracaoAppEmUso as erro:
        raise HTTPException(status_code=503, detail=str(erro)) from erro

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

    return _resposta_configurada(
        configuracao,
        planilha_acessivel=True,
        requer_revalidacao=False,
        prontidao_pastas=configuracao_app.calcular_prontidao_pastas(configuracao),
    )


@router.post("/configuracao/pastas")
def definir_pastas_operacionais(requisicao: RequisicaoPastasOperacionais) -> dict:
    valores = {
        campo: caminho for campo, caminho in requisicao.model_dump().items() if caminho is not None
    }
    if not valores:
        raise HTTPException(status_code=422, detail="Nenhuma pasta informada.")

    try:
        configuracao_app.persistir_pastas_operacionais(valores)
    except PastaInvalida as erro:
        raise HTTPException(status_code=422, detail=str(erro)) from erro
    except ConfiguracaoAppEmUso as erro:
        raise HTTPException(status_code=503, detail=str(erro)) from erro

    # Reaproveita a mesma leitura autoritativa do GET (§ "Revalidar caminhos
    # a cada GET /configuracao") em vez de montar a resposta a partir da
    # `Configuracao` recém-persistida — garante que `planilha_acessivel`/
    # `requer_revalidacao` continuem corretos mesmo que a planilha oficial
    # tenha mudado de estado por outro motivo entre as duas chamadas.
    estado = configuracao_app.avaliar_estado_atual()
    assert estado.configurado and estado.configuracao is not None

    if not estado.planilha_acessivel:
        return _resposta_planilha_inacessivel(estado.configuracao, prontidao_pastas=estado.prontidao_pastas)

    return _resposta_configurada(
        estado.configuracao,
        planilha_acessivel=True,
        requer_revalidacao=estado.requer_revalidacao,
        prontidao_pastas=estado.prontidao_pastas,
    )
