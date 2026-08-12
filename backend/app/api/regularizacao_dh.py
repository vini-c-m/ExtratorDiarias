from fastapi import APIRouter, HTTPException

from app.infra.config import configuracao_app
from app.schemas.regularizacao_dh import (
    DetalheProcessoAguardandoDHResposta,
    HistoricoEFiscoResposta,
    ListaProcessosAguardandoDHResposta,
    PeriodoResposta,
    ProcessoAguardandoDHResposta,
    RequisicaoRegistrarDH,
    RespostaRegistrarDH,
    TrechoResposta,
    ValorDiariaResposta,
)
from app.services.analitica_service import BaseAnaliticaIndisponivel, RegistroNaoEncontrado
from app.services.regularizacao_dh_service import (
    FalhaEscritaDH,
    listar_processos_aguardando_dh,
    obter_detalhe_processo_aguardando_dh,
    registrar_dh,
)

# Micro-sprint B ("Central de Regularização de DH", SOMENTE LEITURA) — quarta
# central do aplicativo. `GET` (lista/detalhe) só consultam a mesma fonte já
# homologada da Central Analítica, nunca decidem nem gravam nada.
#
# Micro-sprint D ("Escrita Exclusiva do DH") acrescenta a única rota de
# escrita desta Central (`POST .../dh`) — todo o resto do router continua
# somente leitura.
router = APIRouter(prefix="/api/v1/regularizacao-dh", tags=["regularizacao-dh"])


@router.get("", response_model=ListaProcessosAguardandoDHResposta)
def listar() -> ListaProcessosAguardandoDHResposta:
    try:
        resultado = listar_processos_aguardando_dh()
    except BaseAnaliticaIndisponivel as erro:
        raise HTTPException(status_code=503, detail=str(erro)) from erro

    return ListaProcessosAguardandoDHResposta(
        total=resultado.total,
        processos=[
            ProcessoAguardandoDHResposta(
                sei=processo.sei,
                servidor_nome=processo.servidor_nome,
                cpf_mascarado=processo.cpf_mascarado,
                categoria_funcional=processo.categoria_funcional,
                periodo=PeriodoResposta(inicial=processo.periodo.inicial, final=processo.periodo.final),
                trecho=TrechoResposta(origem=processo.trecho.origem, destino=processo.trecho.destino),
                situacao=processo.situacao,
                mensagem=processo.mensagem,
                data_liberacao_prevista=processo.data_liberacao_prevista,
                dias_restantes=processo.dias_restantes,
                dias_atraso=processo.dias_atraso,
                texto_contagem=processo.texto_contagem,
            )
            for processo in resultado.processos
        ],
    )


@router.get("/{sei:path}", response_model=DetalheProcessoAguardandoDHResposta)
def detalhar(sei: str) -> DetalheProcessoAguardandoDHResposta:
    """`{sei:path}` — mesma necessidade já resolvida em `GET
    /analitica/diarias/{sei}`: o número SEI contém barras."""
    try:
        detalhe = obter_detalhe_processo_aguardando_dh(sei)
    except RegistroNaoEncontrado as erro:
        raise HTTPException(status_code=404, detail=str(erro)) from erro
    except BaseAnaliticaIndisponivel as erro:
        raise HTTPException(status_code=503, detail=str(erro)) from erro

    return DetalheProcessoAguardandoDHResposta(
        sei=detalhe.sei,
        servidor_nome=detalhe.servidor_nome,
        cpf_mascarado=detalhe.cpf_mascarado,
        categoria_funcional=detalhe.categoria_funcional,
        periodo=PeriodoResposta(inicial=detalhe.periodo.inicial, final=detalhe.periodo.final),
        trecho=TrechoResposta(origem=detalhe.trecho.origem, destino=detalhe.trecho.destino),
        ainda_aguardando_dh=detalhe.ainda_aguardando_dh,
        situacao=detalhe.situacao,
        mensagem=detalhe.mensagem,
        data_liberacao_prevista=detalhe.data_liberacao_prevista,
        dias_restantes=detalhe.dias_restantes,
        dias_atraso=detalhe.dias_atraso,
        texto_contagem=detalhe.texto_contagem,
        historico=HistoricoEFiscoResposta(
            situacao=detalhe.historico.situacao, texto=detalhe.historico.texto, motivo=detalhe.historico.motivo
        ),
        valor=ValorDiariaResposta(
            situacao=detalhe.valor.situacao, valor=detalhe.valor.valor, motivo=detalhe.valor.motivo
        ),
    )


@router.post("/{sei:path}/dh", response_model=RespostaRegistrarDH)
def registrar_dh_endpoint(sei: str, requisicao: RequisicaoRegistrarDH) -> RespostaRegistrarDH:
    """Micro-sprint D — única rota de escrita da Central de Regularização
    de DH. `situacao` diferente de `"concluido"` nunca é uma exceção HTTP
    (é sempre um estado de negócio conhecido — linha desatualizada ou DH
    conflitante); só falhas técnicas genuínas (SEI inexistente, Base Local/
    Planilha Oficial indisponível, falha de leitura/escrita) viram
    exceção."""
    try:
        resultado = registrar_dh(sei, requisicao.dh)
    except RegistroNaoEncontrado as erro:
        raise HTTPException(status_code=404, detail=str(erro)) from erro
    except BaseAnaliticaIndisponivel as erro:
        raise HTTPException(status_code=503, detail=str(erro)) from erro
    except configuracao_app.PlanilhaOficialIndisponivel as erro:
        raise HTTPException(status_code=422, detail=str(erro)) from erro
    except FalhaEscritaDH as erro:
        raise HTTPException(status_code=503, detail=str(erro)) from erro

    return RespostaRegistrarDH(
        situacao=resultado.situacao, sei=resultado.sei, dh=resultado.dh, mensagem=resultado.mensagem
    )
