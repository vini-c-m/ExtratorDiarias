from fastapi import APIRouter, HTTPException

from app.domain.entities.modo_processamento import ModoProcessamento
from app.schemas.conferencia import (
    CandidatoDiariaOriginalResposta,
    DuplicidadeResposta,
    ItemChecklistResposta,
    JanelaProcessamentoResposta,
    RegistroCandidatoResposta,
    RequisicaoCandidatosComplemento,
    RequisicaoConferencia,
    RequisicaoHistorico,
    RequisicaoValorDiaria,
    RespostaCandidatosComplemento,
    RespostaHistorico,
    RespostaValorDiaria,
    ResultadoConferenciaResposta,
    ServidorResposta,
)
from app.services.conferencia_service import (
    BaseLocalIndisponivel,
    ServidorNaoEncontrado,
    TabelaValoresIndisponivel,
    calcular_valor_diaria,
    conferir_cpf,
    gerar_historico,
    gerar_historico_complemento,
    localizar_candidatos_complemento,
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
            requisicao.cpf,
            requisicao.periodo_inicial,
            requisicao.periodo_final,
            modo=ModoProcessamento(requisicao.modo),
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
            requisicao.destino,
        )
    except BaseLocalIndisponivel as erro:
        raise HTTPException(status_code=503, detail=str(erro)) from erro
    except ServidorNaoEncontrado as erro:
        raise HTTPException(status_code=404, detail=str(erro)) from erro

    return RespostaHistorico(texto=texto)


@router.post("/conferencia/historico-complemento", response_model=RespostaHistorico)
def historico_complemento(requisicao: RequisicaoHistorico) -> RespostaHistorico:
    """GERAR HISTÓRICO DE COMPLEMENTO (RN-14/RN-16) — mesmo modelo
    institucional de `POST /conferencia/historico` (RN-13); só a
    quantidade de diária parcial varia (esclarecimento do usuário,
    2026-08-07, RN-16 — não existe um segundo template). Central de
    Conferência continua só consultiva: este endpoint nunca grava nada."""
    try:
        texto = gerar_historico_complemento(
            requisicao.cpf,
            requisicao.periodo_inicial,
            requisicao.periodo_final,
            requisicao.sei,
            requisicao.destino,
            requisicao.quantidade_diaria_parcial
            if requisicao.quantidade_diaria_parcial is not None
            else 0,
        )
    except BaseLocalIndisponivel as erro:
        raise HTTPException(status_code=503, detail=str(erro)) from erro
    except ServidorNaoEncontrado as erro:
        raise HTTPException(status_code=404, detail=str(erro)) from erro

    return RespostaHistorico(texto=texto)


@router.post(
    "/conferencia/complemento/candidatos", response_model=RespostaCandidatosComplemento
)
def candidatos_complemento(
    requisicao: RequisicaoCandidatosComplemento,
) -> RespostaCandidatosComplemento:
    """Continuidade Processual (modo Complemento de Diárias) — só
    encontra e explica candidatos a "diária original"; nunca vincula
    nem grava nada (RN-11 inalterado). Usado tanto pela Central de
    Conferência quanto, antes de gravar, pelo Processamento de PDFs."""
    try:
        candidatos = localizar_candidatos_complemento(
            requisicao.cpf,
            requisicao.periodo_inicial,
            requisicao.periodo_final,
            requisicao.cidade_destino,
            requisicao.sei,
            requisicao.texto_processo,
        )
    except BaseLocalIndisponivel as erro:
        raise HTTPException(status_code=503, detail=str(erro)) from erro

    return RespostaCandidatosComplemento(
        candidatos=[
            CandidatoDiariaOriginalResposta(
                registro=RegistroCandidatoResposta(
                    sei=candidato.registro.sei,
                    dh=candidato.registro.dh,
                    periodo_inicial=candidato.registro.periodo_inicial,
                    periodo_final=candidato.registro.periodo_final,
                    cidade_origem=candidato.registro.cidade_origem,
                    cidade_destino=candidato.registro.cidade_destino,
                    motivo=candidato.registro.motivo,
                    valor_total_diarias=candidato.registro.valor_total_diarias,
                    linha_planilha=candidato.registro.linha_planilha,
                    servidor_nome=(
                        candidato.registro.servidor.nome if candidato.registro.servidor else None
                    ),
                ),
                evidencias=candidato.evidencias,
            )
            for candidato in candidatos
        ]
    )


@router.post("/conferencia/valor", response_model=RespostaValorDiaria)
def valor_diaria(requisicao: RequisicaoValorDiaria) -> RespostaValorDiaria:
    """Micro-sprint A ("Valor Automático da Diária na Central de
    Conferência") — endpoint independente de `POST /conferencia/historico`
    de propósito: uma falha de leitura da Tabela Valores (503) nunca deve
    impedir o Histórico e-Fisco de ser gerado normalmente (P0 da
    Micro-sprint A). RN-11 inalterado — nunca grava nada."""
    try:
        resultado = calcular_valor_diaria(
            requisicao.cpf,
            requisicao.periodo_inicial,
            requisicao.periodo_final,
            requisicao.destino,
            uf_confirmada=requisicao.uf_confirmada,
            modo=ModoProcessamento(requisicao.modo),
            quantidade_diaria_parcial=requisicao.quantidade_diaria_parcial,
        )
    except BaseLocalIndisponivel as erro:
        raise HTTPException(status_code=503, detail=str(erro)) from erro
    except ServidorNaoEncontrado as erro:
        raise HTTPException(status_code=404, detail=str(erro)) from erro
    except TabelaValoresIndisponivel as erro:
        raise HTTPException(status_code=503, detail=str(erro)) from erro

    return RespostaValorDiaria(
        situacao=resultado.situacao,
        categoria_funcional=resultado.categoria_funcional,
        uf_destino=resultado.uf_destino,
        valor_integral=resultado.valor_integral,
        valor_parcial=resultado.valor_parcial,
        valor_total=resultado.valor_total,
        motivo=resultado.motivo,
        ufs_disponiveis=list(resultado.ufs_disponiveis) if resultado.ufs_disponiveis else None,
    )
