from math import ceil
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query

from app.infra.config import configuracao_app
from app.schemas.analitica import (
    AvisoSincronizacaoResposta,
    CasoDiagnosticoResposta,
    DiagnosticoResposta,
    DiariaCompletaResposta,
    DiariaResumoResposta,
    DistribuicaoResposta,
    EstadoSincronizacaoResposta,
    EstadoSincronizacaoResumidoResposta,
    ExecucaoSincronizacaoResposta,
    FiltrosRelatorioQuery,
    IndicadoresResposta,
    OpcoesFiltroResposta,
    PaginaAvisosResposta,
    PaginacaoResposta,
    ParametrosDiagnosticoQuery,
    ParametrosDistribuicaoQuery,
    ParametrosIndicadoresQuery,
    ParametrosPesquisaDiariasQuery,
    ParametrosRelatorioQuery,
    PeriodoResposta,
    PontoDistribuicaoResposta,
    ReferenciaAdministrativaResposta,
    RegistroDiagnosticadoResposta,
    RelatorioGeradoResposta,
    ResultadoPesquisaResposta,
    ResumoDiagnosticoResposta,
    ServidorCompletoResposta,
    ServidorResumoResposta,
    TrechoResposta,
)
from app.services.analitica_service import (
    BaseAnaliticaIndisponivel,
    FiltrosDiaria,
    ParametrosOrdenacao,
    ParametrosPaginacao,
    ParametrosRelatorio,
    RegistroNaoEncontrado,
    SincronizacaoEmAndamento,
    TipoRelatorioIndisponivel,
    calcular_distribuicoes,
    calcular_indicadores,
    detalhar_diaria,
    estado_sincronizacao,
    executar_diagnostico,
    executar_sincronizacao_manual,
    gerar_relatorio,
    listar_avisos_sincronizacao,
    mascarar_cpf,
    obter_opcoes_filtro,
    pesquisar_diarias,
)

# Sprint 17.4.3 — GET /diarias. Sprint 17.4.4 — GET /diarias/{sei}.
# Sprint 17.4.5 — GET /opcoes-filtro. Sprint 17.4.6 — GET/POST
# /sincronizacao + GET /sincronizacao/avisos. Sprint 19.6.2 — GET
# /indicadores. Sprint 19.6.3 — GET /distribuicoes. Sprint 19.7.2 — POST
# /relatorios. Sprint 19.8.2 — GET /diagnostico.
router = APIRouter(prefix="/api/v1/analitica", tags=["analitica"])


def _filtros_da_query(
    parametros: ParametrosPesquisaDiariasQuery
    | ParametrosIndicadoresQuery
    | ParametrosDistribuicaoQuery
    | FiltrosRelatorioQuery
    | ParametrosDiagnosticoQuery,
) -> FiltrosDiaria:
    """Sprint 19.6.2 — extraído do corpo de `listar_diarias` para ser
    compartilhado com `obter_indicadores` (Sprint 19.6.3 — também com
    `obter_distribuicoes`; Sprint 19.7.2 — também com `gerar_relatorio`,
    via `ParametrosRelatorioQuery.filtros`; Sprint 19.8.2 — também com
    `obter_diagnostico`): as cinco rotas usam exatamente os mesmos 15
    campos de filtro (`ParametrosPesquisaDiariasQuery`/
    `ParametrosIndicadoresQuery`/`ParametrosDistribuicaoQuery`/
    `FiltrosRelatorioQuery`/`ParametrosDiagnosticoQuery` só diferem em
    paginação/ordenação/`dimensao`, que esta função nunca lê). Um único
    ponto de tradução elimina o risco de as rotas divergirem
    silenciosamente se um filtro novo for adicionado só numa delas —
    mesmo espírito da regra já aplicada a
    `repositorio_analitico._montar_where` (nunca duas definições da mesma
    coisa)."""
    return FiltrosDiaria(
        q=parametros.q,
        sei=parametros.sei,
        cpf=parametros.cpf,
        servidor_nome=parametros.servidor_nome,
        servidor_matricula=parametros.servidor_matricula,
        municipio=parametros.municipio,
        motivo=parametros.motivo,
        situacao=parametros.situacao,
        periodo_inicial=parametros.periodo_inicial,
        periodo_final=parametros.periodo_final,
        origem=parametros.origem,
        destino=parametros.destino,
        trecho=parametros.trecho,
        valor_minimo=parametros.valor_minimo,
        valor_maximo=parametros.valor_maximo,
    )


@router.get("/diarias", response_model=ResultadoPesquisaResposta)
def listar_diarias(
    parametros: Annotated[ParametrosPesquisaDiariasQuery, Query()],
) -> ResultadoPesquisaResposta:
    filtros = _filtros_da_query(parametros)
    paginacao = ParametrosPaginacao(pagina=parametros.pagina, tamanho_pagina=parametros.tamanho_pagina)
    ordenacao = ParametrosOrdenacao(campo=parametros.ordenar_por, ordem=parametros.ordem)

    try:
        resultado = pesquisar_diarias(filtros, paginacao, ordenacao)
    except BaseAnaliticaIndisponivel as erro:
        raise HTTPException(status_code=503, detail=str(erro)) from erro

    total_itens = resultado.pagina.total_itens
    total_paginas = ceil(total_itens / paginacao.tamanho_pagina) if total_itens else 0

    return ResultadoPesquisaResposta(
        itens=[
            DiariaResumoResposta(
                sei=registro.sei,
                periodo=PeriodoResposta(inicial=registro.periodo_inicial, final=registro.periodo_final),
                destino=registro.cidade_destino,
                servidor=(
                    ServidorResumoResposta(
                        nome=registro.servidor.nome,
                        matricula=registro.servidor.matricula,
                        situacao=registro.servidor.situacao,
                    )
                    if registro.servidor
                    else None
                ),
                motivo=registro.motivo,
                valor_total_diarias=registro.valor_total_diarias,
                # Sprint 19.5.7.1 — `registro.cpf` (o CPF completo) nunca é
                # lido diretamente aqui; só o resultado de `mascarar_cpf`
                # entra na resposta.
                origem=registro.cidade_origem,
                doc_origem=registro.doc_origem,
                transporte=registro.transporte,
                cpf_mascarado=mascarar_cpf(registro.cpf),
            )
            for registro in resultado.pagina.itens
        ],
        paginacao=PaginacaoResposta(
            pagina_atual=paginacao.pagina,
            tamanho_pagina=paginacao.tamanho_pagina,
            total_itens=total_itens,
            total_paginas=total_paginas,
        ),
        sincronizacao=EstadoSincronizacaoResumidoResposta(
            sincronizado_em=resultado.sincronizacao.sincronizado_em,
            total_avisos=resultado.sincronizacao.total_avisos,
        ),
    )


@router.get("/indicadores", response_model=IndicadoresResposta)
def obter_indicadores(
    parametros: Annotated[ParametrosIndicadoresQuery, Query()],
) -> IndicadoresResposta:
    """Sprint 19.6.2 — só os 4 KPIs sem decisão pendente (19.6.1). Nome da
    rota deliberadamente distinto de `analitica_service.calcular_indicadores`
    (importado abaixo), mesmo padrão já usado em `consultar_opcoes_filtro`/
    `obter_opcoes_filtro`: verbo da rota HTTP nunca repete o verbo da
    função de orquestração que ela chama."""
    filtros = _filtros_da_query(parametros)

    try:
        resultado = calcular_indicadores(filtros)
    except BaseAnaliticaIndisponivel as erro:
        raise HTTPException(status_code=503, detail=str(erro)) from erro

    return IndicadoresResposta(
        total_diarias=resultado.indicadores.total_diarias,
        total_servidores=resultado.indicadores.total_servidores,
        valor_total=resultado.indicadores.valor_total,
        valor_medio=resultado.indicadores.valor_medio,
        sincronizacao=EstadoSincronizacaoResumidoResposta(
            sincronizado_em=resultado.sincronizacao.sincronizado_em,
            total_avisos=resultado.sincronizacao.total_avisos,
        ),
    )


@router.get("/distribuicoes", response_model=DistribuicaoResposta)
def obter_distribuicoes(
    parametros: Annotated[ParametrosDistribuicaoQuery, Query()],
) -> DistribuicaoResposta:
    """Sprint 19.6.3 — só as 6 dimensões cujo comportamento já está
    integralmente definido nos documentos homologados (`dimensao` no
    schema não aceita `"completude"` ainda — ver
    `app/domain/analitica/distribuicoes.py`). Nome da rota
    deliberadamente distinto de `analitica_service.calcular_distribuicoes`
    (importado abaixo), mesmo padrão já usado em `obter_indicadores`/
    `calcular_indicadores`."""
    filtros = _filtros_da_query(parametros)

    try:
        resultado = calcular_distribuicoes(filtros, parametros.dimensao)
    except BaseAnaliticaIndisponivel as erro:
        raise HTTPException(status_code=503, detail=str(erro)) from erro

    return DistribuicaoResposta(
        dimensao=resultado.distribuicao.dimensao,
        pontos=[
            PontoDistribuicaoResposta(rotulo=ponto.rotulo, contagem=ponto.contagem, valor=ponto.valor)
            for ponto in resultado.distribuicao.pontos
        ],
    )


@router.get("/diagnostico", response_model=DiagnosticoResposta)
def obter_diagnostico(
    parametros: Annotated[ParametrosDiagnosticoQuery, Query()],
) -> DiagnosticoResposta:
    """Sprint 19.8.2 — roda só sobre o recorte filtrado (§ 8.3, mesma
    regra das demais ações). Nome da rota deliberadamente distinto de
    `analitica_service.executar_diagnostico` (importado abaixo), mesmo
    padrão já usado em todas as outras rotas deste arquivo."""
    filtros = _filtros_da_query(parametros)

    try:
        resultado = executar_diagnostico(filtros)
    except BaseAnaliticaIndisponivel as erro:
        raise HTTPException(status_code=503, detail=str(erro)) from erro

    return DiagnosticoResposta(
        resumo=ResumoDiagnosticoResposta(
            esperado=resultado.resumo.esperado,
            atencao=resultado.resumo.atencao,
            inconsistencia=resultado.resumo.inconsistencia,
        ),
        registros=[
            RegistroDiagnosticadoResposta(
                sei=registro.sei,
                classificacao=registro.classificacao,
                casos=[
                    CasoDiagnosticoResposta(
                        campo=caso.campo,
                        titulo=caso.titulo,
                        motivo=caso.motivo,
                        acao_recomendada=caso.acao_recomendada,
                    )
                    for caso in registro.casos
                ],
            )
            for registro in resultado.registros
        ],
    )


@router.post("/relatorios", response_model=RelatorioGeradoResposta)
def gerar_relatorio_endpoint(parametros: ParametrosRelatorioQuery) -> RelatorioGeradoResposta:
    """Sprint 19.7.2 — corpo JSON (`POST`), não query string: gerar um
    relatório grava um arquivo físico, não é uma consulta idempotente por
    URL. Nome da função deliberadamente distinto de
    `analitica_service.gerar_relatorio` (importado abaixo), mesmo padrão
    já usado em todas as outras rotas deste arquivo."""
    filtros = _filtros_da_query(parametros.filtros)
    parametros_relatorio = ParametrosRelatorio(
        tipo=parametros.tipo,
        formato=parametros.formato,
        incluir_indicadores=parametros.incluir_indicadores,
        incluir_graficos=parametros.incluir_graficos,
        incluir_tabela=parametros.incluir_tabela,
        incluir_inconsistencias=parametros.incluir_inconsistencias,
        modo=parametros.modo,
    )

    try:
        resultado = gerar_relatorio(filtros, parametros_relatorio)
    except TipoRelatorioIndisponivel as erro:
        raise HTTPException(status_code=422, detail=str(erro)) from erro
    except BaseAnaliticaIndisponivel as erro:
        raise HTTPException(status_code=503, detail=str(erro)) from erro

    return RelatorioGeradoResposta(
        caminho_arquivo_temporario=resultado.caminho_arquivo_temporario,
        nome_sugerido=resultado.nome_sugerido,
        sincronizado_em=resultado.sincronizado_em,
    )


@router.get("/opcoes-filtro", response_model=OpcoesFiltroResposta)
def consultar_opcoes_filtro() -> OpcoesFiltroResposta:
    """Sprint 17.4.5.1 — nome deliberadamente distinto de
    `analitica_service.obter_opcoes_filtro` (importado abaixo), mesmo
    padrão já usado nas outras duas rotas (`listar_diarias`/
    `pesquisar_diarias`, `obter_diaria`/`detalhar_diaria`): verbo da rota
    HTTP nunca repete o verbo da função de orquestração que ela chama."""
    try:
        opcoes = obter_opcoes_filtro()
    except BaseAnaliticaIndisponivel as erro:
        raise HTTPException(status_code=503, detail=str(erro)) from erro

    return OpcoesFiltroResposta(
        motivos=opcoes.motivos, situacoes=opcoes.situacoes, municipios=opcoes.municipios
    )


@router.get("/diarias/{sei:path}", response_model=DiariaCompletaResposta)
def obter_diaria(sei: str) -> DiariaCompletaResposta:
    """`{sei:path}` (não `{sei}`) é necessário porque o número SEI contém
    barras (`19.20.0001.0000001/2026-01`) — o conversor padrão do
    FastAPI/Starlette só casa um único segmento de path, sem `/`."""
    try:
        resultado = detalhar_diaria(sei)
    except RegistroNaoEncontrado as erro:
        raise HTTPException(status_code=404, detail=str(erro)) from erro
    except BaseAnaliticaIndisponivel as erro:
        raise HTTPException(status_code=503, detail=str(erro)) from erro

    registro = resultado.registro
    return DiariaCompletaResposta(
        sei=registro.sei,
        periodo=PeriodoResposta(inicial=registro.periodo_inicial, final=registro.periodo_final),
        destino=registro.cidade_destino,
        servidor=(
            ServidorCompletoResposta(
                nome=registro.servidor.nome,
                cargo=registro.servidor.cargo,
                previdencia=registro.servidor.previdencia,
                matricula=registro.servidor.matricula,
                situacao=registro.servidor.situacao,
            )
            if registro.servidor
            else None
        ),
        motivo=registro.motivo,
        valor_total_diarias=registro.valor_total_diarias,
        doc_origem=registro.doc_origem,
        cpf=registro.cpf,
        trecho=TrechoResposta(origem=registro.cidade_origem, destino=registro.cidade_destino),
        transporte=registro.transporte,
        referencia_administrativa=ReferenciaAdministrativaResposta(
            linha_planilha=registro.linha_planilha
        ),
        sincronizacao=EstadoSincronizacaoResumidoResposta(
            sincronizado_em=resultado.sincronizacao.sincronizado_em,
            total_avisos=resultado.sincronizacao.total_avisos,
        ),
        diagnosticos=[
            CasoDiagnosticoResposta(
                campo=caso.campo, titulo=caso.titulo, motivo=caso.motivo, acao_recomendada=caso.acao_recomendada
            )
            for caso in resultado.diagnosticos
        ],
    )


@router.get("/sincronizacao", response_model=EstadoSincronizacaoResposta)
def consultar_estado_sincronizacao() -> EstadoSincronizacaoResposta:
    try:
        estado = estado_sincronizacao()
    except BaseAnaliticaIndisponivel as erro:
        raise HTTPException(status_code=503, detail=str(erro)) from erro

    return EstadoSincronizacaoResposta(
        sincronizado_em=estado.sincronizado_em,
        origem=estado.origem,
        possivelmente_desatualizado=estado.possivelmente_desatualizado,
        total_avisos=estado.total_avisos,
        status=estado.status,
    )


@router.post("/sincronizacao", response_model=ExecucaoSincronizacaoResposta)
def disparar_sincronizacao_manual() -> ExecucaoSincronizacaoResposta:
    try:
        resumo = executar_sincronizacao_manual()
    except SincronizacaoEmAndamento as erro:
        raise HTTPException(status_code=409, detail=str(erro)) from erro
    except configuracao_app.PlanilhaOficialIndisponivel as erro:
        raise HTTPException(status_code=422, detail=str(erro)) from erro
    except BaseAnaliticaIndisponivel as erro:
        raise HTTPException(status_code=503, detail=str(erro)) from erro

    return ExecucaoSincronizacaoResposta(
        status=resumo.status,
        sincronizado_em=resumo.sincronizado_em,
        linhas_diarias=resumo.linhas_diarias,
        linhas_servidores_lidos=resumo.linhas_servidores_lidos,
        linhas_ignoradas=resumo.linhas_ignoradas,
        total_avisos=resumo.total_avisos,
    )


@router.get("/sincronizacao/avisos", response_model=PaginaAvisosResposta)
def consultar_avisos_de_sincronizacao(
    pagina: Annotated[int, Query(ge=1)] = 1,
    tamanho_pagina: Annotated[int, Query(ge=1, le=100)] = 25,
) -> PaginaAvisosResposta:
    """Sprint 17.4.7.1 — renomeada de `listar_avisos_de_sincronizacao`
    para `consultar_avisos_de_sincronizacao`: mesmo padrão já usado em
    `consultar_opcoes_filtro`/`obter_opcoes_filtro` e
    `consultar_estado_sincronizacao`/`estado_sincronizacao` — verbo da
    rota HTTP nunca repete o verbo da função de orquestração que ela
    chama (aqui, `listar_avisos_sincronizacao`, importada abaixo). Só o
    nome da função Python muda — mesma rota (`GET
    /sincronizacao/avisos`), mesmo comportamento."""
    paginacao = ParametrosPaginacao(pagina=pagina, tamanho_pagina=tamanho_pagina)
    try:
        pagina_avisos = listar_avisos_sincronizacao(paginacao)
    except BaseAnaliticaIndisponivel as erro:
        raise HTTPException(status_code=503, detail=str(erro)) from erro

    total_itens = pagina_avisos.total_itens
    total_paginas = ceil(total_itens / tamanho_pagina) if total_itens else 0

    return PaginaAvisosResposta(
        itens=[
            AvisoSincronizacaoResposta(aba=aviso.aba, linha=aviso.linha, motivo=aviso.motivo)
            for aviso in pagina_avisos.itens
        ],
        paginacao=PaginacaoResposta(
            pagina_atual=pagina, tamanho_pagina=tamanho_pagina, total_itens=total_itens, total_paginas=total_paginas
        ),
    )
