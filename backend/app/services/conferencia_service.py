import sqlite3
from dataclasses import replace
from datetime import date

from openpyxl import load_workbook

from app.consulta import base_local, base_local_sqlite, repositorio_analitico
from app.consulta.repositorio_diarias import NOME_ABA as NOME_ABA_DIARIAS
from app.consulta.repositorio_diarias import diarias_por_cpf
from app.consulta.repositorio_servidores import NOME_ABA as NOME_ABA_SERVIDORES
from app.consulta.repositorio_servidores import servidores_por_cpf
from app.domain.continuidade_processual import (
    ConsultaComplemento,
    localizar_candidatos_diaria_original,
)
from app.domain.entities.candidato_diaria_original import CandidatoDiariaOriginal
from app.domain.entities.modo_processamento import ModoProcessamento
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
    modo: ModoProcessamento = ModoProcessamento.PADRAO,
) -> ResultadoConferencia:
    """Orquestra a Etapa 1: abre a Base Local, resolve cadastro (RN-01) e
    duplicidade (RN-02) por CPF, e delega o diagnóstico para a regra pura
    `app.domain.rules.conferencia.conferir`. `modo` (RN-14) só muda se a
    duplicidade bloqueia o veredito `apto` — a leitura da Base Local é
    idêntica nos dois modos."""
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
        modo=modo,
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
    destino: str,
) -> str:
    """Etapa 2 — RN-11 exige que o nome do servidor venha sempre de uma
    fonte única de verdade (a Base Local), nunca de um valor ecoado pelo
    frontend desde a resposta da Etapa 1: busca o servidor de novo antes de
    montar o histórico.

    Correção de 2026-08-05: a Etapa 2 deixou de pedir Origem — o histórico
    do e-Fisco usa apenas o destino (ver `app.domain.rules.historico_efisco.montar_historico`)."""
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
        destino=destino,
    )


def gerar_historico_complemento(
    cpf: str,
    periodo_inicial: date,
    periodo_final: date,
    sei: str,
    destino: str,
    quantidade_diaria_parcial: int = 0,
) -> str:
    """GERAR HISTÓRICO DE COMPLEMENTO (RN-14/RN-16) — mesma disciplina de
    `gerar_historico` (nome do servidor sempre vindo de uma nova consulta
    à Base Local, nunca ecoado pelo frontend), delegando para o MESMO
    `montar_historico` (RN-13) — não existe um segundo modelo de texto,
    só a quantidade de parcial varia (esclarecimento do usuário,
    2026-08-07).

    `quantidade_diaria_parcial` tem default `0` (padrão institucional do
    modo Complemento) porque a Central de Conferência, diferente do
    Processamento de PDFs, não lê o texto do processo — não tem como
    resolver essa quantidade a partir de evidência documental (ver
    `app.extraction.enriquecimento.quantidade_complementar`). Quando o
    Processamento já resolveu um valor diferente de 0 para este mesmo
    complemento, quem chama pode informá-lo aqui explicitamente."""
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
        destino=destino,
        quantidade_diaria_parcial=quantidade_diaria_parcial,
    )


def localizar_candidatos_complemento(
    cpf: str,
    periodo_inicial: date,
    periodo_final: date,
    cidade_destino: str | None,
    sei: str | None,
    texto_processo: str,
) -> list[CandidatoDiariaOriginal]:
    """Continuidade Processual (modo Complemento de Diárias) — busca
    candidatos a "diária original" entre as diárias já lançadas do mesmo
    CPF. Usa a Base Local em SQLite (`repositorio_analitico`), não a via
    `.xlsx` de `conferir_cpf` — é a única fonte com DH e nome do servidor
    já denormalizados (mesma base que a Central Analítica consulta).
    Somente leitura — RN-11 continua valendo, nada é gravado."""
    cpf_normalizado = _cpf_normalizado(cpf)
    caminho_sqlite = base_local_sqlite.caminho_base_local_sqlite()
    try:
        registros = repositorio_analitico.agregar_indicadores(
            caminho_sqlite, repositorio_analitico.FiltrosDiaria(cpf=cpf_normalizado)
        )
    except sqlite3.Error as erro:
        raise BaseLocalIndisponivel(_MENSAGEM_BASE_LOCAL_INDISPONIVEL) from erro

    consulta = ConsultaComplemento(
        cpf=cpf_normalizado,
        periodo_inicial=periodo_inicial,
        periodo_final=periodo_final,
        cidade_destino=cidade_destino,
        sei=sei,
        texto_processo=texto_processo,
    )
    return localizar_candidatos_diaria_original(consulta, registros_do_cpf=registros)
