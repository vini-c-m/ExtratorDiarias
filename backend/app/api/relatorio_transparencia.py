import os
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query

from app.consulta.configuracao_template_relatorio_transparencia import (
    ConfiguracaoTemplateCorrompida,
    TemplateOficialInvalido,
    carregar_configuracao_template,
    persistir_configuracao_template,
)
from app.consulta.persistencia_decisoes import PersistenciaDecisoesCorrompida, VersaoEsquemaIncompativel
from app.domain.relatorio_transparencia.decisao import AcaoDecisao
from app.schemas.relatorio_transparencia import (
    ListaRevisoesResposta,
    OcorrenciaResposta,
    ParametrosConfiguracaoTemplateQuery,
    ParametrosRelatorioQuery,
    RelatorioGeradoResposta,
    RequisicaoConfigurarTemplate,
    RequisicaoGerarRelatorio,
    RequisicaoPrepararRelatorio,
    RequisicaoRegistrarDecisao,
    ResumoRelatorioResposta,
    RevisaoResposta,
    StatusTemplateResposta,
)
from app.services.relatorio_transparencia_service import (
    BaseOBNaoEncontrada,
    ControleDimcacNaoEncontrado,
    DecisaoInvalida,
    DestinoJaExiste,
    EstruturaBaseOBInvalida,
    EstruturaControleInvalida,
    GeracaoConcorrenteEmAndamento,
    OcorrenciaResumo,
    RelatorioBloqueadoPorPendencias,
    ResumoRelatorio,
    RevisaoNaoEncontrada,
    RevisaoResumo,
    TemplateEstruturalmenteInvalido,
    TemplateOficialIndisponivel,
    gerar_relatorio_xlsx,
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
        identidade=oc.identidade,
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
        autor=r.autor,
        decidido_em=r.decidido_em,
        observacao=r.observacao,
        obs_publicaveis=r.obs_publicaveis,
    )


def _resumo_resposta(resumo: ResumoRelatorio) -> ResumoRelatorioResposta:
    return ResumoRelatorioResposta(
        total_candidatos_normais=resumo.total_candidatos_normais,
        total_revisoes=resumo.total_revisoes,
        total_pendentes=resumo.total_pendentes,
        total_decididas=resumo.total_decididas,
        total_adiadas=resumo.total_adiadas,
        total_desatualizadas=resumo.total_desatualizadas,
        total_requer_nova_decisao=resumo.total_requer_nova_decisao,
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
    if isinstance(erro, TemplateOficialIndisponivel):
        raise HTTPException(status_code=404, detail=str(erro)) from erro
    if isinstance(erro, ConfiguracaoTemplateCorrompida):
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


@router.post("/gerar", response_model=RelatorioGeradoResposta)
def gerar(requisicao: RequisicaoGerarRelatorio) -> RelatorioGeradoResposta:
    """Micro-sprint 3F, conectado ao frontend na 3H. Só aceita "gerar esta
    competência"; todo o conteúdo é reconstruído no backend
    (`gerar_relatorio_xlsx`), nunca confiado ao corpo da requisição."""
    try:
        resultado = gerar_relatorio_xlsx(
            caminho_base_ordens_bancarias=requisicao.caminho_base_ordens_bancarias,
            caminho_controle_dimcac=requisicao.caminho_controle_dimcac,
            ano_exercicio=requisicao.ano_exercicio,
            mes_referencia=requisicao.mes_referencia,
            caminho_decisoes=requisicao.caminho_decisoes,
            caminho_configuracao_template=requisicao.caminho_configuracao_template,
            caminho_destino=requisicao.caminho_destino,
        )
    except RelatorioBloqueadoPorPendencias as erro:
        raise HTTPException(status_code=409, detail=str(erro)) from erro
    except DestinoJaExiste as erro:
        raise HTTPException(status_code=409, detail=str(erro)) from erro
    except GeracaoConcorrenteEmAndamento as erro:
        raise HTTPException(status_code=409, detail=str(erro)) from erro
    except TemplateEstruturalmenteInvalido as erro:
        raise HTTPException(status_code=422, detail=str(erro)) from erro
    except (
        BaseOBNaoEncontrada,
        ControleDimcacNaoEncontrado,
        EstruturaBaseOBInvalida,
        EstruturaControleInvalida,
        VersaoEsquemaIncompativel,
        PersistenciaDecisoesCorrompida,
        TemplateOficialIndisponivel,
        ConfiguracaoTemplateCorrompida,
    ) as erro:
        _levantar_erro_de_fontes(erro)

    return RelatorioGeradoResposta(
        caminho_arquivo=resultado.caminho_arquivo,
        total_ocorrencias=resultado.total_ocorrencias,
        total_valor_diarias=resultado.total_valor_diarias,
        primeira_linha_dados=resultado.primeira_linha_dados,
        ultima_linha_dados=resultado.ultima_linha_dados,
        linha_total=resultado.linha_total,
    )


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


# --- Micro-sprint 3H: Template Oficial — configuração exclusiva do módulo,
# uma vez por instalação (ver `app/consulta/
# configuracao_template_relatorio_transparencia.py`). `caminho_configuracao_
# template` é infraestrutura interna (resolvida pelo Electron via IPC,
# mesmo padrão de `caminho_decisoes`) — nunca um campo que o usuário digita.


def _status_template_resposta(configuracao) -> StatusTemplateResposta:
    if configuracao is None:
        return StatusTemplateResposta(configurado=False, disponivel=False, caminho_template=None)
    disponivel = os.path.isfile(configuracao.caminho_template)
    return StatusTemplateResposta(
        configurado=True,
        disponivel=disponivel,
        caminho_template=configuracao.caminho_template if disponivel else None,
    )


@router.get("/template", response_model=StatusTemplateResposta)
def obter_status_template(
    parametros: Annotated[ParametrosConfiguracaoTemplateQuery, Query()],
) -> StatusTemplateResposta:
    try:
        configuracao = carregar_configuracao_template(parametros.caminho_configuracao_template)
    except ConfiguracaoTemplateCorrompida as erro:
        raise HTTPException(status_code=503, detail=str(erro)) from erro
    return _status_template_resposta(configuracao)


@router.post("/template", response_model=StatusTemplateResposta)
def configurar_template(requisicao: RequisicaoConfigurarTemplate) -> StatusTemplateResposta:
    try:
        configuracao = persistir_configuracao_template(
            requisicao.caminho_configuracao_template, requisicao.caminho_template
        )
    except TemplateOficialInvalido as erro:
        raise HTTPException(status_code=422, detail=str(erro)) from erro

    return _status_template_resposta(configuracao)
