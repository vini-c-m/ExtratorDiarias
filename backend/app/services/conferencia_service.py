from dataclasses import replace
from datetime import date

from openpyxl import load_workbook

from app.consulta import base_local
from app.consulta.repositorio_diarias import NOME_ABA as NOME_ABA_DIARIAS
from app.consulta.repositorio_diarias import diarias_por_cpf
from app.consulta.repositorio_servidores import NOME_ABA as NOME_ABA_SERVIDORES
from app.consulta.repositorio_servidores import servidores_por_cpf
from app.domain.entities.resultado_conferencia import ResultadoConferencia
from app.domain.rules.conferencia import conferir
from app.domain.rules.historico_efisco import montar_historico
from app.planilha.escritor_planilha import _cpf_normalizado  # noqa: PLC2701 — reuso deliberado

_MENSAGEM_BASE_LOCAL_INDISPONIVEL = (
    "Não foi possível acessar os registros administrativos agora. Tente novamente em instantes."
)


class ErroConferenciaServico(Exception):
    pass


class BaseLocalIndisponivel(ErroConferenciaServico):
    """Falha técnica da própria Central (RN-11/§ 0 item 3 do doc
    arquitetural) — nunca um resultado de negócio. Mapeada para HTTP 503,
    nunca para um veredito."""


class ServidorNaoEncontrado(ErroConferenciaServico):
    """Só pode ocorrer na Etapa 2 (geração de histórico): o servidor foi
    encontrado na Etapa 1, mas a Base Local mudou entre as duas chamadas —
    caso raro, mapeado para HTTP 404."""


def _abrir_base_local():
    if not base_local.base_local_disponivel():
        raise BaseLocalIndisponivel(_MENSAGEM_BASE_LOCAL_INDISPONIVEL)
    try:
        return load_workbook(base_local.caminho_base_local())
    except Exception as erro:  # abrangente de propósito — qualquer falha de
        # leitura (arquivo corrompido, aba ausente, permissão) vira a mesma
        # mensagem de falha técnica, nunca um veredito de negócio.
        raise BaseLocalIndisponivel(_MENSAGEM_BASE_LOCAL_INDISPONIVEL) from erro


def conferir_cpf(
    cpf: str,
    periodo_inicial: date,
    periodo_final: date,
    *,
    hoje: date | None = None,
) -> ResultadoConferencia:
    """Orquestra a Etapa 1: abre a Base Local, resolve cadastro (RN-01) e
    duplicidade (RN-02) por CPF, e delega o diagnóstico para a regra pura
    `app.domain.rules.conferencia.conferir`."""
    workbook = _abrir_base_local()
    cpf_normalizado = _cpf_normalizado(cpf)

    servidores = servidores_por_cpf(workbook[NOME_ABA_SERVIDORES])
    indexacao_diarias = diarias_por_cpf(workbook[NOME_ABA_DIARIAS])

    resultado = conferir(
        cpf=cpf_normalizado,
        periodo_inicial=periodo_inicial,
        periodo_final=periodo_final,
        servidor=servidores.get(cpf_normalizado),
        registros_do_cpf=indexacao_diarias.diarias.get(cpf_normalizado, []),
        hoje=hoje if hoje is not None else date.today(),
    )
    # Anexado depois de `conferir` (regra pura, sem I/O) devolver o
    # diagnóstico — os avisos são um efeito colateral da leitura da Base
    # Local, não uma decisão de negócio (RN-08/RN-11), então não fazem
    # parte da assinatura da regra pura.
    return replace(resultado, avisos_indexacao=indexacao_diarias.avisos)


def gerar_historico(
    cpf: str,
    periodo_inicial: date,
    periodo_final: date,
    sei: str,
    origem: str,
    destino: str,
) -> str:
    """Etapa 2 — RN-11 exige que o nome do servidor venha sempre de uma
    fonte única de verdade (a Base Local), nunca de um valor ecoado pelo
    frontend desde a resposta da Etapa 1: busca o servidor de novo antes de
    montar o histórico."""
    workbook = _abrir_base_local()
    cpf_normalizado = _cpf_normalizado(cpf)
    servidores = servidores_por_cpf(workbook[NOME_ABA_SERVIDORES])
    servidor = servidores.get(cpf_normalizado)
    if servidor is None:
        raise ServidorNaoEncontrado(
            f"Servidor com CPF {cpf} não foi localizado na Base Local de Consulta."
        )

    return montar_historico(
        sei=sei,
        nome_servidor=servidor.nome,
        periodo_inicial=periodo_inicial,
        periodo_final=periodo_final,
        origem=origem,
        destino=destino,
    )
