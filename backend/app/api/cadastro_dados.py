from fastapi import APIRouter, HTTPException

from app.schemas.cadastro_dados import (
    OpcoesCadastroServidorResposta,
    RequisicaoCadastroServidor,
    RespostaCadastroServidor,
)
from app.schemas.conferencia import ServidorResposta
from app.services.cadastro_dados_service import cadastrar_servidor_membro, obter_opcoes_cadastro
from app.services.conferencia_service import BaseLocalIndisponivel  # noqa: PLC2701 — reuso deliberado

# RN-11 — módulo INTENCIONALMENTE separado de `app/api/conferencia.py` (que
# permanece só-leitura): este é o único endpoint de escrita desta feature,
# nunca misturado às rotas de consulta. `GET /dados/opcoes-cadastro` abaixo
# é a exceção óbvia — só leitura, mas fica aqui por ser exclusivo desta
# feature de cadastro (nunca usado por `conferencia.py`).
router = APIRouter(prefix="/api/v1", tags=["cadastro-dados"])


@router.get("/dados/opcoes-cadastro", response_model=OpcoesCadastroServidorResposta)
def consultar_opcoes_cadastro() -> OpcoesCadastroServidorResposta:
    """Nome deliberadamente distinto de `cadastro_dados_service.obter_opcoes_cadastro`
    (importado acima) — mesmo padrão de `consultar_opcoes_filtro`/`obter_opcoes_filtro`
    em `app/api/analitica.py`: verbo da rota HTTP nunca repete o verbo da função de
    orquestração que ela chama."""
    try:
        opcoes = obter_opcoes_cadastro()
    except BaseLocalIndisponivel as erro:
        raise HTTPException(status_code=503, detail=str(erro)) from erro

    return OpcoesCadastroServidorResposta(
        cargos=opcoes.cargos,
        orgaos_origem=opcoes.orgaos_origem,
        previdencias=opcoes.previdencias,
        regimes_previdencia=opcoes.regimes_previdencia,
        situacoes=opcoes.situacoes,
    )


@router.post("/dados/servidores", response_model=RespostaCadastroServidor)
def cadastrar_servidor(requisicao: RequisicaoCadastroServidor) -> RespostaCadastroServidor:
    resultado = cadastrar_servidor_membro(
        cpf=requisicao.cpf,
        nome=requisicao.nome,
        matricula=requisicao.matricula,
        cargo=requisicao.cargo,
        previdencia=requisicao.previdencia,
        orgao_origem=requisicao.orgao_origem,
        regime_previdencia=requisicao.regime_previdencia,
        situacao=requisicao.situacao,
    )
    return RespostaCadastroServidor(
        estado=resultado.estado.value,
        mensagem=resultado.mensagem,
        servidor=(
            ServidorResposta(
                nome=resultado.servidor.nome,
                cargo=resultado.servidor.cargo,
                previdencia=resultado.servidor.previdencia,
            )
            if resultado.servidor
            else None
        ),
    )
