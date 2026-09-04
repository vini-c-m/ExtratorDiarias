import os
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query

from app.consulta.configuracao_fontes_relatorio_transparencia import (
    ConfiguracaoFontesCorrompida,
    ConfiguracaoFontesEmUso,
    carregar_configuracao_fontes,
    persistir_configuracao_fontes,
)
from app.consulta.configuracao_template_relatorio_transparencia import (
    ConfiguracaoTemplateCorrompida,
    ConfiguracaoTemplateEmUso,
    TemplateOficialInvalido,
    carregar_configuracao_template,
    persistir_configuracao_template,
)
from app.consulta.persistencia_decisoes import (
    PersistenciaDecisoesCorrompida,
    PersistenciaDecisoesEmUso,
    VersaoEsquemaIncompativel,
)
from app.domain.relatorio_transparencia.decisao import AcaoDecisao
from app.schemas.relatorio_transparencia import (
    ListaRevisoesResposta,
    OcorrenciaResposta,
    ParametrosConfiguracaoFontesQuery,
    ParametrosConfiguracaoTemplateQuery,
    ParametrosRelatorioQuery,
    RelatorioGeradoResposta,
    RequisicaoConfigurarFontes,
    RequisicaoConfigurarTemplate,
    RequisicaoGerarRelatorio,
    RequisicaoPrepararRelatorio,
    RequisicaoRegistrarDecisao,
    ResumoRelatorioResposta,
    RevisaoResposta,
    StatusArquivoFonteResposta,
    StatusFontesResposta,
    StatusTemplateResposta,
)
from app.services.relatorio_transparencia_service import (
    BaseEfiscoNaoEncontrada,
    CoberturaInsuficienteEfisco,
    ControleDimcacNaoEncontrado,
    DecisaoInvalida,
    DestinoInacessivel,
    DestinoJaExiste,
    EstruturaBaseEfiscoInvalida,
    EstruturaControleInvalida,
    EstruturaPlanilhaPassagensInvalida,
    GeracaoConcorrenteEmAndamento,
    OcorrenciaResumo,
    PlanilhaPassagensNaoEncontrada,
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
        reaplicada_de_execucao_anterior=r.reaplicada_de_execucao_anterior,
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
        avisos_qualidade_fonte=resumo.avisos_qualidade_fonte,
        diagnosticos_qualidade_fonte=resumo.diagnosticos_qualidade_fonte,
        total_decisoes_reaproveitadas=resumo.total_decisoes_reaproveitadas,
        cobertura_parcial=resumo.cobertura_parcial,
        cobertura_efisco_ate=resumo.cobertura_efisco_ate,
    )


def _levantar_erro_de_fontes(erro: Exception) -> None:
    """Mapeamento de exceção compartilhado pelas três rotas — mesmo padrão
    de `app/api/regularizacao_dh.py`/`app/api/analitica.py` (cada exceção
    de domínio/serviço vira um `HTTPException` com status semanticamente
    específico, nunca um 500 genérico escondendo a causa)."""
    if isinstance(erro, (BaseEfiscoNaoEncontrada, ControleDimcacNaoEncontrado, PlanilhaPassagensNaoEncontrada)):
        raise HTTPException(status_code=404, detail=str(erro)) from erro
    if isinstance(erro, (EstruturaBaseEfiscoInvalida, EstruturaControleInvalida, EstruturaPlanilhaPassagensInvalida)):
        raise HTTPException(status_code=422, detail=str(erro)) from erro
    if isinstance(erro, CoberturaInsuficienteEfisco):
        # Sprint D.1 (P2, cobertura parcial) — `detail` estruturado (não só
        # texto) para o frontend oferecer "gerar com cobertura parcial" sem
        # reparsear a mensagem; `tipo` é o discriminador estável (a
        # mensagem em si pode mudar de texto no futuro sem quebrar quem lê
        # `tipo`). `cobertura_paga_ate` é `None` só quando não há NENHUM
        # pagamento confirmado na fonte inteira — aí não há "cobertura
        # parcial" possível de oferecer, só o erro.
        raise HTTPException(
            status_code=422,
            detail={
                "tipo": "cobertura_efisco_insuficiente",
                "mensagem": str(erro),
                "cobertura_paga_ate": erro.cobertura_paga_ate.isoformat() if erro.cobertura_paga_ate else None,
            },
        ) from erro
    if isinstance(erro, VersaoEsquemaIncompativel):
        raise HTTPException(status_code=503, detail=str(erro)) from erro
    if isinstance(erro, (PersistenciaDecisoesCorrompida, PersistenciaDecisoesEmUso)):
        raise HTTPException(status_code=503, detail=str(erro)) from erro
    if isinstance(erro, TemplateOficialIndisponivel):
        raise HTTPException(status_code=404, detail=str(erro)) from erro
    if isinstance(erro, ConfiguracaoTemplateCorrompida):
        raise HTTPException(status_code=503, detail=str(erro)) from erro
    if isinstance(erro, ConfiguracaoFontesCorrompida):
        raise HTTPException(status_code=503, detail=str(erro)) from erro
    raise erro


@router.post("/preparar", response_model=ResumoRelatorioResposta)
def preparar(requisicao: RequisicaoPrepararRelatorio) -> ResumoRelatorioResposta:
    try:
        resumo = preparar_relatorio(
            caminho_base_efisco=requisicao.caminho_base_efisco,
            caminho_controle_dimcac=requisicao.caminho_controle_dimcac,
            ano_exercicio=requisicao.ano_exercicio,
            mes_referencia=requisicao.mes_referencia,
            caminho_decisoes=requisicao.caminho_decisoes,
            caminho_planilha_passagens=requisicao.caminho_planilha_passagens,
            aceitar_cobertura_parcial=requisicao.aceitar_cobertura_parcial,
        )
    except (
        BaseEfiscoNaoEncontrada,
        ControleDimcacNaoEncontrado,
        PlanilhaPassagensNaoEncontrada,
        EstruturaBaseEfiscoInvalida,
        EstruturaControleInvalida,
        EstruturaPlanilhaPassagensInvalida,
        VersaoEsquemaIncompativel,
        PersistenciaDecisoesCorrompida,
        CoberturaInsuficienteEfisco,
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
            caminho_base_efisco=requisicao.caminho_base_efisco,
            caminho_controle_dimcac=requisicao.caminho_controle_dimcac,
            ano_exercicio=requisicao.ano_exercicio,
            mes_referencia=requisicao.mes_referencia,
            caminho_decisoes=requisicao.caminho_decisoes,
            caminho_configuracao_template=requisicao.caminho_configuracao_template,
            caminho_destino=requisicao.caminho_destino,
            caminho_planilha_passagens=requisicao.caminho_planilha_passagens,
        )
    except RelatorioBloqueadoPorPendencias as erro:
        raise HTTPException(status_code=409, detail=str(erro)) from erro
    except DestinoJaExiste as erro:
        raise HTTPException(status_code=409, detail=str(erro)) from erro
    except GeracaoConcorrenteEmAndamento as erro:
        raise HTTPException(status_code=409, detail=str(erro)) from erro
    except DestinoInacessivel as erro:
        raise HTTPException(status_code=503, detail=str(erro)) from erro
    except TemplateEstruturalmenteInvalido as erro:
        raise HTTPException(status_code=422, detail=str(erro)) from erro
    except (
        BaseEfiscoNaoEncontrada,
        ControleDimcacNaoEncontrado,
        PlanilhaPassagensNaoEncontrada,
        EstruturaBaseEfiscoInvalida,
        EstruturaControleInvalida,
        EstruturaPlanilhaPassagensInvalida,
        VersaoEsquemaIncompativel,
        PersistenciaDecisoesCorrompida,
        TemplateOficialIndisponivel,
        ConfiguracaoTemplateCorrompida,
        CoberturaInsuficienteEfisco,
    ) as erro:
        _levantar_erro_de_fontes(erro)

    return RelatorioGeradoResposta(
        caminho_arquivo=resultado.oficial.caminho_arquivo,
        total_ocorrencias=resultado.oficial.total_ocorrencias,
        total_valor_diarias=resultado.oficial.total_valor_diarias,
        primeira_linha_dados=resultado.oficial.primeira_linha_dados,
        ultima_linha_dados=resultado.oficial.ultima_linha_dados,
        linha_total=resultado.oficial.linha_total,
        caminho_arquivo_nao_publicadas=resultado.caminho_arquivo_nao_publicadas,
        total_nao_publicadas=resultado.total_nao_publicadas,
        total_categoria_a=resultado.total_categoria_a,
        total_categoria_b=resultado.total_categoria_b,
        nao_publicadas_gerado=resultado.nao_publicadas_gerado,
        erro_nao_publicadas=resultado.erro_nao_publicadas,
    )


@router.get("/revisoes", response_model=ListaRevisoesResposta)
def revisoes(parametros: Annotated[ParametrosRelatorioQuery, Query()]) -> ListaRevisoesResposta:
    try:
        lista = listar_revisoes(
            caminho_base_efisco=parametros.caminho_base_efisco,
            caminho_controle_dimcac=parametros.caminho_controle_dimcac,
            ano_exercicio=parametros.ano_exercicio,
            mes_referencia=parametros.mes_referencia,
            caminho_decisoes=parametros.caminho_decisoes,
            caminho_planilha_passagens=parametros.caminho_planilha_passagens,
        )
    except (
        BaseEfiscoNaoEncontrada,
        ControleDimcacNaoEncontrado,
        PlanilhaPassagensNaoEncontrada,
        EstruturaBaseEfiscoInvalida,
        EstruturaControleInvalida,
        EstruturaPlanilhaPassagensInvalida,
        VersaoEsquemaIncompativel,
        PersistenciaDecisoesCorrompida,
        CoberturaInsuficienteEfisco,
    ) as erro:
        _levantar_erro_de_fontes(erro)

    return ListaRevisoesResposta(total=len(lista), revisoes=[_revisao_resposta(r) for r in lista])


@router.post("/revisoes/{identidade}/decisao", response_model=ResumoRelatorioResposta)
def decidir(identidade: str, requisicao: RequisicaoRegistrarDecisao) -> ResumoRelatorioResposta:
    try:
        resumo = registrar_decisao_revisao(
            caminho_base_efisco=requisicao.caminho_base_efisco,
            caminho_controle_dimcac=requisicao.caminho_controle_dimcac,
            ano_exercicio=requisicao.ano_exercicio,
            mes_referencia=requisicao.mes_referencia,
            caminho_decisoes=requisicao.caminho_decisoes,
            identidade_grupo=identidade,
            acao=AcaoDecisao(requisicao.acao),
            obs_selecionadas=requisicao.obs_selecionadas,
            autor=requisicao.autor,
            observacao=requisicao.observacao,
            caminho_planilha_passagens=requisicao.caminho_planilha_passagens,
        )
    except RevisaoNaoEncontrada as erro:
        raise HTTPException(status_code=404, detail=str(erro)) from erro
    except DecisaoInvalida as erro:
        raise HTTPException(status_code=422, detail=str(erro)) from erro
    except (
        BaseEfiscoNaoEncontrada,
        ControleDimcacNaoEncontrado,
        PlanilhaPassagensNaoEncontrada,
        EstruturaBaseEfiscoInvalida,
        EstruturaControleInvalida,
        EstruturaPlanilhaPassagensInvalida,
        VersaoEsquemaIncompativel,
        PersistenciaDecisoesCorrompida,
        PersistenciaDecisoesEmUso,
        CoberturaInsuficienteEfisco,
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
    except ConfiguracaoTemplateEmUso as erro:
        raise HTTPException(status_code=503, detail=str(erro)) from erro

    return _status_template_resposta(configuracao)


# --- Micro-sprint UX operacional: persistência dos caminhos de Base de
# Ordens Bancárias e Controle DIMCAC (ver `app/consulta/
# configuracao_fontes_relatorio_transparencia.py`). `caminho_configuracao_
# fontes` é infraestrutura interna (resolvida pelo Electron via IPC, mesmo
# padrão de `caminho_decisoes`/`caminho_configuracao_template`) — nunca um
# campo que o usuário digita. Ao contrário do Template Oficial, nenhuma
# validação de conteúdo é feita aqui: só se lembra do caminho escolhido; a
# validação de verdade continua acontecendo em `preparar_relatorio`.


def _status_arquivo_fonte_resposta(caminho: str | None) -> StatusArquivoFonteResposta:
    if caminho is None:
        return StatusArquivoFonteResposta(configurado=False, disponivel=False, caminho=None)
    disponivel = os.path.isfile(caminho)
    return StatusArquivoFonteResposta(configurado=True, disponivel=disponivel, caminho=caminho if disponivel else None)


@router.get("/fontes", response_model=StatusFontesResposta)
def obter_status_fontes(parametros: Annotated[ParametrosConfiguracaoFontesQuery, Query()]) -> StatusFontesResposta:
    try:
        configuracao = carregar_configuracao_fontes(parametros.caminho_configuracao_fontes)
    except ConfiguracaoFontesCorrompida as erro:
        raise HTTPException(status_code=503, detail=str(erro)) from erro

    return StatusFontesResposta(
        base_efisco=_status_arquivo_fonte_resposta(
            configuracao.caminho_base_efisco if configuracao else None
        ),
        controle_dimcac=_status_arquivo_fonte_resposta(
            configuracao.caminho_controle_dimcac if configuracao else None
        ),
        planilha_passagens=_status_arquivo_fonte_resposta(
            configuracao.caminho_planilha_passagens if configuracao else None
        ),
    )


@router.post("/fontes", response_model=StatusFontesResposta)
def configurar_fontes(requisicao: RequisicaoConfigurarFontes) -> StatusFontesResposta:
    try:
        configuracao = persistir_configuracao_fontes(
            requisicao.caminho_configuracao_fontes,
            caminho_base_efisco=requisicao.caminho_base_efisco,
            caminho_controle_dimcac=requisicao.caminho_controle_dimcac,
            caminho_planilha_passagens=requisicao.caminho_planilha_passagens,
        )
    except ConfiguracaoFontesCorrompida as erro:
        raise HTTPException(status_code=503, detail=str(erro)) from erro
    except ConfiguracaoFontesEmUso as erro:
        raise HTTPException(status_code=503, detail=str(erro)) from erro

    return StatusFontesResposta(
        base_efisco=_status_arquivo_fonte_resposta(configuracao.caminho_base_efisco),
        controle_dimcac=_status_arquivo_fonte_resposta(configuracao.caminho_controle_dimcac),
        planilha_passagens=_status_arquivo_fonte_resposta(configuracao.caminho_planilha_passagens),
    )
