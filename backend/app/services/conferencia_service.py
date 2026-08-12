import sqlite3
from dataclasses import dataclass, replace
from datetime import date
from decimal import Decimal
from typing import Literal

from openpyxl import load_workbook

from app.consulta import base_local, base_local_sqlite, repositorio_analitico, repositorio_tabela_valores
from app.consulta.repositorio_diarias import NOME_ABA as NOME_ABA_DIARIAS
from app.consulta.repositorio_diarias import diarias_por_cpf
from app.consulta.repositorio_servidores import NOME_ABA as NOME_ABA_SERVIDORES
from app.consulta.repositorio_servidores import servidores_por_cpf
from app.domain.analitica.categoria_funcional import classificar_categoria_funcional
from app.domain.continuidade_processual import (
    ConsultaComplemento,
    localizar_candidatos_diaria_original,
)
from app.domain.entities.candidato_diaria_original import CandidatoDiariaOriginal
from app.domain.entities.modo_processamento import ModoProcessamento
from app.domain.entities.resultado_conferencia import ResultadoConferencia
from app.domain.rules.conferencia import conferir
from app.domain.rules.historico_efisco import montar_historico
from app.domain.rules.valor_diaria_servidor import UfForaDaTabelaValores, calcular_valor_diaria_servidor
from app.extraction.enriquecimento.local_destino import identificar_estado_destino
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


class TabelaValoresIndisponivel(ErroConferenciaServico):
    """Micro-sprint A — falha técnica ao ler a aba `Tabela Valores` da Base
    Local (aba ausente da Planilha configurada, ou estruturalmente inválida
    — nenhuma linha de UF/região reconhecível, ou um valor unitário
    ilegível). Mesma família de `BaseLocalIndisponivel`: nunca um veredito
    de negócio, sempre mapeada para HTTP 503. Endpoint independente do
    Histórico e-Fisco (`POST /conferencia/historico`) — esta falha nunca
    impede o Histórico de ser gerado (P0 da Micro-sprint A)."""


SituacaoValorDiaria = Literal[
    "calculado", "indisponivel_para_categoria", "uf_nao_resolvida", "uf_fora_da_tabela"
]

_MOTIVO_VALOR_MEMBRO = (
    "Valor automático disponível apenas para diárias de Servidor nesta consulta — a "
    "Central de Conferência não lê o processo (despacho do GABPGJ) usado para "
    "determinar o valor de Membro. Informe o valor manualmente."
)
_MOTIVO_VALOR_NAO_IDENTIFICADO = (
    "Não foi possível classificar o tipo de diária (cargo não identificado no "
    "cadastro) — valor automático indisponível para esta consulta."
)
_MOTIVO_UF_NAO_RESOLVIDA_PADRAO = "Não foi possível determinar a UF de destino automaticamente."


@dataclass(frozen=True)
class ResultadoValorDiaria:
    """Micro-sprint A — resultado de `calcular_valor_diaria`. `situacao`
    diferente de `"calculado"` NUNCA é um erro técnico (por isso não é uma
    exceção) — é um estado de negócio conhecido, mesmo espírito de
    `AvaliacaoElegibilidade`/`DocumentoHabilPendente`: a Central nunca
    decide sozinha (RN-08/RN-11), só informa a pendência. `ufs_disponiveis`
    só é populado quando `situacao` é `"uf_nao_resolvida"` ou
    `"uf_fora_da_tabela"` — exatamente as UFs/regiões que a Tabela Valores
    real tem agora, para o servidor confirmar manualmente sem o backend
    precisar de um segundo catálogo geográfico."""

    situacao: SituacaoValorDiaria
    categoria_funcional: str
    uf_destino: str | None
    valor_integral: Decimal | None
    valor_parcial: Decimal | None
    valor_total: Decimal | None
    motivo: str | None
    ufs_disponiveis: tuple[str, ...] | None = None


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
        contexto_complemento=True,
    )


def calcular_valor_diaria(
    cpf: str,
    periodo_inicial: date,
    periodo_final: date,
    destino: str,
    *,
    uf_confirmada: str | None = None,
    modo: ModoProcessamento = ModoProcessamento.PADRAO,
    quantidade_diaria_parcial: int | None = None,
) -> ResultadoValorDiaria:
    """Micro-sprint A ("Valor Automático da Diária na Central de
    Conferência") — RN-05, homologada por auditoria financeira real contra a
    Planilha Oficial do DIMCAC (2026-08-12, 99,60% de reprodução exata sobre
    1.486 diárias reais de Servidor comparáveis).

    Só SERVIDOR usa esta regra (decisão institucional confirmada na
    auditoria): Membro nunca é calculado por tabela — o valor de Membro vem
    do despacho do GABPGJ, extraído só durante o Processamento de PDFs
    (`app.extraction.enriquecimento.valor_diarias_membro`), texto que a
    Central de Conferência nunca lê nesta etapa. Retornar
    `"indisponivel_para_categoria"` para Membro/Não identificado é o
    comportamento correto — nunca aplicar a fórmula de Servidor "só para
    mostrar algum número" (proibição explícita da Micro-sprint A).

    A Tabela Valores nunca é copiada/hardcoded aqui — é sempre lida
    dinamicamente da MESMA Base Local `.xlsx` já sincronizada e aberta por
    `_abrir_base_local()` (reuso, `app.consulta.repositorio_tabela_valores`),
    então um reajuste de valores pelo DIMCAC se propaga automaticamente na
    próxima sincronização, sem uma segunda fonte financeira no código.

    `uf_confirmada` (RN de segurança, item 5 do pedido da Micro-sprint A) —
    quando o servidor já confirmou manualmente a UF (depois de um retorno
    anterior `"uf_nao_resolvida"`/`"uf_fora_da_tabela"`), ela tem prioridade
    sobre a resolução automática — a Central nunca decide sozinha quando já
    existe uma decisão humana explícita para aquele mesmo campo.

    `modo`/`quantidade_diaria_parcial` (RN-04/RN-16) espelham exatamente o
    mesmo default institucional já usado por `gerar_historico`/
    `gerar_historico_complemento`: sempre `1` no modo Padrão (nunca
    alterável — RN-04), e `quantidade_diaria_parcial` (ou `0`, padrão
    institucional do Complemento) só no modo Complemento — nenhuma regra
    nova, mesma decisão já homologada para o texto do Histórico."""
    workbook = _abrir_base_local()
    cpf_normalizado = _cpf_normalizado(cpf)
    servidores = servidores_por_cpf(workbook[NOME_ABA_SERVIDORES])
    servidor = servidores.get(cpf_normalizado)
    if servidor is None:
        raise ServidorNaoEncontrado(
            f"Servidor com CPF {cpf} não foi localizado na Base Local de Consulta."
        )

    categoria = classificar_categoria_funcional(servidor.cargo)
    if categoria != "SERVIDOR":
        motivo = _MOTIVO_VALOR_MEMBRO if categoria == "MEMBRO" else _MOTIVO_VALOR_NAO_IDENTIFICADO
        return ResultadoValorDiaria(
            situacao="indisponivel_para_categoria",
            categoria_funcional=categoria,
            uf_destino=None,
            valor_integral=None,
            valor_parcial=None,
            valor_total=None,
            motivo=motivo,
        )

    try:
        tabela = repositorio_tabela_valores.carregar_tabela_valores(
            workbook[repositorio_tabela_valores.NOME_ABA]
        )
    except KeyError as erro:
        raise TabelaValoresIndisponivel(
            "A aba 'Tabela Valores' não foi encontrada na Planilha Oficial configurada."
        ) from erro
    except repositorio_tabela_valores.TabelaValoresEstruturalmenteInvalida as erro:
        raise TabelaValoresIndisponivel(str(erro)) from erro

    ufs_disponiveis = tuple(sorted(tabela.keys()))

    uf_destino = uf_confirmada.strip() if uf_confirmada and uf_confirmada.strip() else None
    motivo_resolucao: str | None = None
    if uf_destino is None:
        uf_destino, motivo_resolucao = identificar_estado_destino(destino)
    if uf_destino is None:
        return ResultadoValorDiaria(
            situacao="uf_nao_resolvida",
            categoria_funcional=categoria,
            uf_destino=None,
            valor_integral=None,
            valor_parcial=None,
            valor_total=None,
            motivo=motivo_resolucao or _MOTIVO_UF_NAO_RESOLVIDA_PADRAO,
            ufs_disponiveis=ufs_disponiveis,
        )

    # RN-04/RN-16 — mesmo default institucional já homologado para o
    # Histórico (`gerar_historico`/`gerar_historico_complemento`): nunca
    # um terceiro critério novo.
    quantidade_parcial = (
        1
        if modo is ModoProcessamento.PADRAO
        else (quantidade_diaria_parcial if quantidade_diaria_parcial is not None else 0)
    )
    quantidade_integral = (periodo_final - periodo_inicial).days  # RN-03

    try:
        resultado = calcular_valor_diaria_servidor(
            uf_destino=uf_destino,
            quantidade_diaria_integral=quantidade_integral,
            quantidade_diaria_parcial=quantidade_parcial,
            tabela=tabela,
        )
    except UfForaDaTabelaValores:
        return ResultadoValorDiaria(
            situacao="uf_fora_da_tabela",
            categoria_funcional=categoria,
            uf_destino=uf_destino,
            valor_integral=None,
            valor_parcial=None,
            valor_total=None,
            motivo=f"A UF/região '{uf_destino}' não foi encontrada na Tabela Valores oficial.",
            ufs_disponiveis=ufs_disponiveis,
        )

    return ResultadoValorDiaria(
        situacao="calculado",
        categoria_funcional=categoria,
        uf_destino=uf_destino,
        valor_integral=resultado.valor_integral,
        valor_parcial=resultado.valor_parcial,
        valor_total=resultado.valor_total,
        motivo=None,
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
