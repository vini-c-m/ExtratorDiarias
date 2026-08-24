from typing import Annotated

from fastapi import APIRouter, HTTPException, Query

from app.consulta.persistencia_decisoes import PersistenciaDecisoesCorrompida, VersaoEsquemaIncompativel
from app.domain.relatorio_transparencia.decisao import AcaoDecisao
from app.schemas.relatorio_transparencia import (
    ListaRevisoesResposta,
    OcorrenciaResposta,
    ParametrosRelatorioQuery,
    RequisicaoPrepararRelatorio,
    RequisicaoRegistrarDecisao,
    ResumoRelatorioResposta,
    RevisaoResposta,
)
from app.services.relatorio_transparencia_service import (
    BaseOBNaoEncontrada,
    ControleDimcacNaoEncontrado,
    DecisaoInvalida,
    EstruturaBaseOBInvalida,
    EstruturaControleInvalida,
    OcorrenciaResumo,
    ResumoRelatorio,
    RevisaoNaoEncontrada,
    RevisaoResumo,
    listar_revisoes,
    preparar_relatorio,
    registrar_decisao_revisao,
)

# Micro-sprint 3D — camada de integração backend do Relatório de Diárias —
# Portal da Transparência. Router só traduz HTTP <-> service; nenhuma regra
# de negócio aqui (RN01-RN07 continuam exclusivas de
# `app/domain/relatorio_transparencia/motor_decisao.py`). Módulo aditivo e
# isolado — nenhuma rota existente é alterada por este arquivo.
router = APIRouter(prefix="/api/v1/relatorio-transparencia", tags=["relatorio-transparencia"])


def _ocorrencia_resposta(oc: OcorrenciaResumo) -> OcorrenciaResposta:
    return OcorrenciaResposta(
        ob=oc.ob,
        dh=oc.dh,
        beneficiario=oc.beneficiario,
        sei=oc.sei,
        data_ob=oc.data_ob,
        periodo_inicial=oc.periodo_inicial,
        periodo_final=oc.periodo_final,
        trecho=oc.trecho,
        valor=oc.valor,
        motivo=oc.motivo,
        restituicao=oc.restituicao,
    )


def _revisao_resposta(r: RevisaoResumo) -> RevisaoResposta:
    return RevisaoResposta(
        identidade_grupo=r.identidade_grupo,
        regra=r.regra,
        estado=r.estado,
        explicacao=r.explicacao,
        campos_iguais=r.campos_iguais,
        campos_diferentes=r.campos_diferentes,
        ocorrencias=[_ocorrencia_resposta(oc) for oc in r.ocorrencias],
    )


def _resumo_resposta(resumo: ResumoRelatorio) -> ResumoRelatorioResposta:
    return ResumoRelatorioResposta(
        total_candidatos_normais=resumo.total_candidatos_normais,
        total_revisoes=resumo.total_revisoes,
        total_pendentes=resumo.total_pendentes,
        total_decididas=resumo.total_decididas,
        total_adiadas=resumo.total_adiadas,
        total_desatualizadas=resumo.total_desatualizadas,
        total_ocorrencias_nao_publicaveis=resumo.total_ocorrencias_nao_publicaveis,
        pode_gerar_relatorio=resumo.pode_gerar_relatorio,
        revisoes=[_revisao_resposta(r) for r in resumo.revisoes],
    )


def _levantar_erro_de_fontes(erro: Exception) -> None:
    """Mapeamento de exceção compartilhado pelas três rotas — mesmo padrão
    de `app/api/regularizacao_dh.py`/`app/api/analitica.py` (cada exceção
    de domínio/serviço vira um `HTTPException` com status semanticamente
    específico, nunca um 500 genérico escondendo a causa)."""
    if isinstance(erro, (BaseOBNaoEncontrada, ControleDimcacNaoEncontrado)):
        raise HTTPException(status_code=404, detail=str(erro)) from erro
    if isinstance(erro, (EstruturaBaseOBInvalida, EstruturaControleInvalida)):
        raise HTTPException(status_code=422, detail=str(erro)) from erro
    if isinstance(erro, VersaoEsquemaIncompativel):
        raise HTTPException(status_code=503, detail=str(erro)) from erro
    if isinstance(erro, PersistenciaDecisoesCorrompida):
        raise HTTPException(status_code=503, detail=str(erro)) from erro
    raise erro


@router.post("/preparar", response_model=ResumoRelatorioResposta)
def preparar(requisicao: RequisicaoPrepararRelatorio) -> ResumoRelatorioResposta:
    try:
        resumo = preparar_relatorio(
            caminho_base_ordens_bancarias=requisicao.caminho_base_ordens_bancarias,
            caminho_controle_dimcac=requisicao.caminho_controle_dimcac,
            ano_exercicio=requisicao.ano_exercicio,
            mes_referencia=requisicao.mes_referencia,
            caminho_decisoes=requisicao.caminho_decisoes,
        )
    except (
        BaseOBNaoEncontrada,
        ControleDimcacNaoEncontrado,
        EstruturaBaseOBInvalida,
        EstruturaControleInvalida,
        VersaoEsquemaIncompativel,
        PersistenciaDecisoesCorrompida,
    ) as erro:
        _levantar_erro_de_fontes(erro)

    return _resumo_resposta(resumo)


@router.get("/revisoes", response_model=ListaRevisoesResposta)
def revisoes(parametros: Annotated[ParametrosRelatorioQuery, Query()]) -> ListaRevisoesResposta:
    try:
        lista = listar_revisoes(
            caminho_base_ordens_bancarias=parametros.caminho_base_ordens_bancarias,
            caminho_controle_dimcac=parametros.caminho_controle_dimcac,
            ano_exercicio=parametros.ano_exercicio,
            mes_referencia=parametros.mes_referencia,
            caminho_decisoes=parametros.caminho_decisoes,
        )
    except (
        BaseOBNaoEncontrada,
        ControleDimcacNaoEncontrado,
        EstruturaBaseOBInvalida,
        EstruturaControleInvalida,
        VersaoEsquemaIncompativel,
        PersistenciaDecisoesCorrompida,
    ) as erro:
        _levantar_erro_de_fontes(erro)

    return ListaRevisoesResposta(total=len(lista), revisoes=[_revisao_resposta(r) for r in lista])


@router.post("/revisoes/{identidade}/decisao", response_model=ResumoRelatorioResposta)
def decidir(identidade: str, requisicao: RequisicaoRegistrarDecisao) -> ResumoRelatorioResposta:
    try:
        resumo = registrar_decisao_revisao(
            caminho_base_ordens_bancarias=requisicao.caminho_base_ordens_bancarias,
            caminho_controle_dimcac=requisicao.caminho_controle_dimcac,
            ano_exercicio=requisicao.ano_exercicio,
            mes_referencia=requisicao.mes_referencia,
            caminho_decisoes=requisicao.caminho_decisoes,
            identidade_grupo=identidade,
            acao=AcaoDecisao(requisicao.acao),
            obs_selecionadas=requisicao.obs_selecionadas,
            autor=requisicao.autor,
            observacao=requisicao.observacao,
        )
    except RevisaoNaoEncontrada as erro:
        raise HTTPException(status_code=404, detail=str(erro)) from erro
    except DecisaoInvalida as erro:
        raise HTTPException(status_code=422, detail=str(erro)) from erro
    except (
        BaseOBNaoEncontrada,
        ControleDimcacNaoEncontrado,
        EstruturaBaseOBInvalida,
        EstruturaControleInvalida,
        VersaoEsquemaIncompativel,
        PersistenciaDecisoesCorrompida,
    ) as erro:
        _levantar_erro_de_fontes(erro)

    return _resumo_resposta(resumo)
