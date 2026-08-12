"""Micro-sprint B ("Central de Regularização de DH", SOMENTE LEITURA) —
quarta central do aplicativo. Responsabilidade desta Sprint: localizar,
listar e apresentar o detalhe de diárias JÁ CADASTRADAS que estão aguardando
Documento Hábil — nunca gravar nada (a escrita fica para a Micro-sprint D).

**Regra absoluta desta Sprint (confirmada com o usuário): NÃO existe uma
segunda regra de detecção de DH pendente.** As duas funções deste módulo
reaproveitam, sem nenhuma alteração de comportamento, a mesma orquestração
já homologada da Central Analítica:
- `app.services.analitica_service.listar_documentos_habeis_pendentes` (a
  mesma função por trás de `GET /analitica/documentos-habeis-pendentes`);
- `app.domain.analitica.documentos_habeis_pendentes.listar_documentos_habeis_pendentes`
  (a função pura que decide, célula a célula, quem está pendente).

O único trabalho genuinamente novo aqui é de APRESENTAÇÃO: a resposta de
`GET /analitica/documentos-habeis-pendentes` não expõe `categoria_funcional`/
`cidade_origem`/CPF completo (decisão de contrato da Central Analítica, não
alterada por esta Sprint) — esses campos já estão no mesmo
`RegistroAnalitico` que a própria detecção já consultou, então são lidos de
volta por SEI (`repositorio_analitico.listar_para_diagnostico`, a MESMA
função que `analitica_service.listar_documentos_habeis_pendentes` já chama
internamente) e cruzados em memória, nunca uma segunda decisão sobre quem
está pendente.

Micro-sprint C ("Histórico e-Fisco + Valor na Central de Regularização de
DH") acrescenta, só no detalhe (`obter_detalhe_processo_aguardando_dh`),
duas composições sobre o MESMO `RegistroAnalitico` já buscado — nenhuma
segunda fonte, nenhum segundo cálculo:

- **Histórico**: `app.domain.rules.historico_efisco.montar_historico`, a
  mesma função pura já usada pela Central de Conferência (RN-13), chamada
  com `contexto_complemento=False` e o default institucional de parcial
  (RN-04, "sempre 1") — a diária com DH pendente é sempre uma diária
  NORMAL já cadastrada, nunca um Complemento (item 4 do pedido). Nunca
  passa por `conferencia_service.gerar_historico`/`conferir_cpf` — aquele
  caminho existe para uma diária que ainda NÃO está na Planilha (RN-02,
  bloqueio de duplicidade); aqui o SEI já existir é o comportamento
  esperado (item 6 do pedido), então essa regra nunca é sequer invocada.
- **Valor**: leitura direta de `RegistroAnalitico.valor_total_diarias` —
  o mesmo campo já materializado pela Base Local (fórmula do Excel
  cacheada para Servidor, extração do despacho GABPGJ para Membro; ver
  auditoria financeira de 2026-08-12). Nunca chama
  `calcular_valor_diaria_servidor`, nunca consulta a Tabela Valores, nunca
  resolve UF — a diária já existe, então a "verdade financeira" já está
  registrada, não precisa ser reconstruída (item 7 do pedido).

Micro-sprint D ("Escrita Exclusiva do DH") acrescenta a única capacidade de
escrita desta Central: `registrar_dh`. Localiza a linha pelo
`linha_planilha` já conhecido (nunca busca textual por SEI — RN de
segurança contra SEI duplicado, ex. Complemento de Diárias), revalida
contra a Planilha Oficial real antes de gravar, escreve SOMENTE a coluna
DH (reuso de `app.planilha.regularizacao_dh`) e sincroniza reaproveitando
`app.consulta.base_local.sincronizar` — mesmo mecanismo de save/cache de
fórmula/sincronização já homologado em `escritor_planilha`/
`finalizacao_service`, nenhum mecanismo paralelo."""

import logging
import sqlite3
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Literal

from openpyxl import load_workbook

from app.consulta import base_local, base_local_sqlite, repositorio_analitico
from app.domain.analitica import documentos_habeis_pendentes as documentos_habeis_pendentes_dominio
from app.domain.entities.registro_analitico import RegistroAnalitico
from app.domain.rules.historico_efisco import montar_historico
from app.infra.config import configuracao_app
from app.planilha import regularizacao_dh as regularizacao_dh_planilha
from app.planilha.escritor_planilha import (
    NOME_ABA,
    _capturar_cache_formulas,  # noqa: PLC2701 — mesmo reuso já praticado em finalizacao_service.py
    _reinjetar_cache_formulas,  # noqa: PLC2701 — evita duplicar a correção da ETAPA 1 (Auditoria P0)
)
from app.services import analitica_service
from app.services.analitica_service import (
    _MENSAGEM_BASE_INDISPONIVEL,  # noqa: PLC2701 — reuso deliberado, mesma mensagem/exceção de falha técnica
    BaseAnaliticaIndisponivel,
    FiltrosDiaria,
    RegistroNaoEncontrado,
)

_logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class Periodo:
    inicial: date
    final: date


@dataclass(frozen=True)
class Trecho:
    origem: str | None
    destino: str | None


@dataclass(frozen=True)
class ProcessoAguardandoDH:
    """Um item da listagem — mesmos campos de `DocumentoHabilPendente`
    (situação/mensagem/contagem, RN-06/RN-10, intocados), mais
    `categoria_funcional`/`cpf_mascarado`/`trecho`, lidos do mesmo
    `RegistroAnalitico` que a detecção já usou."""

    sei: str
    servidor_nome: str | None
    cpf_mascarado: str | None
    categoria_funcional: str
    periodo: Periodo
    trecho: Trecho
    situacao: str
    mensagem: str
    data_liberacao_prevista: date
    dias_restantes: int | None
    dias_atraso: int | None
    texto_contagem: str | None


@dataclass(frozen=True)
class ResultadoProcessosAguardandoDH:
    total: int
    processos: list[ProcessoAguardandoDH]


@dataclass(frozen=True)
class HistoricoEFisco:
    """Micro-sprint C — item 13 do pedido: independente de `ValorDiaria`,
    nunca some o restante da tela quando indisponível (item 11/12)."""

    situacao: Literal["gerado", "indisponivel"]
    texto: str | None
    motivo: str | None


@dataclass(frozen=True)
class ValorDiaria:
    """Micro-sprint C — leitura pura de `RegistroAnalitico.valor_total_diarias`,
    nunca um recálculo (item 7/8 do pedido)."""

    situacao: Literal["disponivel", "indisponivel"]
    valor: Decimal | None
    motivo: str | None


@dataclass(frozen=True)
class DetalheProcessoAguardandoDH:
    """Item 11 D do pedido da Micro-sprint B ("registro deixa de ser
    pendente entre uma consulta e outra") — `ainda_aguardando_dh=False` é
    um estado de negócio legítimo, não um erro: o SEI existe e foi
    encontrado, só não está mais na situação que motivou o clique a partir
    da lista. `historico`/`valor` (Micro-sprint C) são independentes entre
    si e do resto do detalhe — uma falha em qualquer um dos dois nunca
    esconde o processo nem o outro campo."""

    sei: str
    servidor_nome: str | None
    cpf_mascarado: str | None
    categoria_funcional: str
    periodo: Periodo
    trecho: Trecho
    ainda_aguardando_dh: bool
    situacao: str | None
    mensagem: str
    data_liberacao_prevista: date | None
    dias_restantes: int | None
    dias_atraso: int | None
    texto_contagem: str | None
    historico: HistoricoEFisco
    valor: ValorDiaria


class FalhaEscritaDH(Exception):
    """Micro-sprint D ("Escrita Exclusiva do DH") — falha TÉCNICA ao abrir
    ou gravar a Planilha Oficial (arquivo corrompido, permissão, etc.) —
    nunca um veredito de negócio (esse é sempre `situacao` no resultado,
    nunca uma exceção). Mapeada pela API para HTTP 503, mesma família de
    `BaseAnaliticaIndisponivel`."""


SituacaoRegistroDH = Literal["concluido", "salvo_sync_pendente", "nao_salvo"]


@dataclass(frozen=True)
class ResultadoRegistroDH:
    """Os três (e só três) resultados possíveis já definidos desde a
    auditoria original — nunca uma exceção para um estado de negócio
    conhecido: `"nao_salvo"` cobre tanto a linha desatualizada quanto o
    conflito de DH já existente com valor diferente, sempre com `mensagem`
    explicando exatamente qual dos dois foi."""

    situacao: SituacaoRegistroDH
    sei: str
    dh: str
    mensagem: str


_MENSAGEM_JA_POSSUI_DH = (
    "Este processo já possui Documento Hábil — a lista pode estar desatualizada. "
    "Atualize a Central de Regularização de DH."
)

_MENSAGEM_SERVIDOR_INDISPONIVEL_PARA_HISTORICO = (
    "Nome do servidor/membro não disponível no registro — não foi possível gerar o Histórico e-Fisco."
)
_MENSAGEM_DESTINO_INDISPONIVEL_PARA_HISTORICO = (
    "Destino não disponível no registro (trecho histórico não separável em origem/destino) — "
    "não foi possível gerar o Histórico e-Fisco."
)
_MENSAGEM_HISTORICO_FALHA_INESPERADA = "Não foi possível gerar automaticamente o Histórico e-Fisco para este processo."
_MENSAGEM_VALOR_INDISPONIVEL = "Valor da diária não disponível no registro."


def _montar_historico_normal(registro: RegistroAnalitico) -> HistoricoEFisco:
    """Micro-sprint C, item 4 do pedido: SEMPRE o contexto NORMAL
    (`contexto_complemento=False`, o default da própria função) — DH
    pendente nunca é motivo para tratar a diária como Complemento. Item 6:
    nunca passa por `conferir`/RN-02 (a checagem de duplicidade não existe
    neste caminho, de propósito — o SEI já existir é o comportamento
    esperado desta Central)."""
    if registro.servidor is None or not registro.servidor.nome.strip():
        return HistoricoEFisco(
            situacao="indisponivel", texto=None, motivo=_MENSAGEM_SERVIDOR_INDISPONIVEL_PARA_HISTORICO
        )
    if not registro.cidade_destino or not registro.cidade_destino.strip():
        return HistoricoEFisco(
            situacao="indisponivel", texto=None, motivo=_MENSAGEM_DESTINO_INDISPONIVEL_PARA_HISTORICO
        )

    try:
        texto = montar_historico(
            sei=registro.sei,
            nome_servidor=registro.servidor.nome,
            periodo_inicial=registro.periodo_inicial,
            periodo_final=registro.periodo_final,
            destino=registro.cidade_destino,
        )
    except Exception:  # noqa: BLE001 — item 12 do pedido: o processo NUNCA some da Central
        # por causa de uma falha de enriquecimento; qualquer exceção aqui
        # vira só um estado "indisponível", nunca propaga para o chamador.
        return HistoricoEFisco(situacao="indisponivel", texto=None, motivo=_MENSAGEM_HISTORICO_FALHA_INESPERADA)

    return HistoricoEFisco(situacao="gerado", texto=texto, motivo=None)


def _obter_valor_existente(registro: RegistroAnalitico) -> ValorDiaria:
    """Micro-sprint C, item 7/8/9 do pedido — só leitura, nunca cálculo.
    `None` é a única condição de "indisponível" já homologada pelo
    contrato existente de `RegistroAnalitico.valor_total_diarias`
    (`repositorio_diarias._valor_como_numero`, nunca inventa `0`); `0.0`
    (se algum dia ocorrer) é um valor válido como qualquer outro, nunca
    tratado como ausência."""
    if registro.valor_total_diarias is None:
        return ValorDiaria(situacao="indisponivel", valor=None, motivo=_MENSAGEM_VALOR_INDISPONIVEL)

    # Só formatação de apresentação (2 casas, nunca arredondamento de
    # cálculo) sobre um número que já é a verdade financeira consolidada —
    # nenhuma aritmética acontece aqui.
    return ValorDiaria(
        situacao="disponivel", valor=Decimal(f"{registro.valor_total_diarias:.2f}"), motivo=None
    )


def listar_processos_aguardando_dh(*, hoje: date | None = None) -> ResultadoProcessosAguardandoDH:
    """Sempre sobre o recorte inteiro (sem filtro) — mesma base de
    comparação que o teste de invariante desta Sprint usa contra a Central
    Analítica (`GET /analitica/documentos-habeis-pendentes` sem filtro
    nenhum aplicado)."""
    resultado_pendentes = analitica_service.listar_documentos_habeis_pendentes(FiltrosDiaria(), hoje=hoje)

    caminho_sqlite = base_local_sqlite.caminho_base_local_sqlite()
    try:
        registros = repositorio_analitico.listar_para_diagnostico(
            caminho_sqlite, repositorio_analitico.FiltrosDiaria()
        )
    except sqlite3.Error as erro:
        raise BaseAnaliticaIndisponivel(_MENSAGEM_BASE_INDISPONIVEL) from erro

    registros_por_sei = {registro.sei: registro for registro in registros}

    processos = [
        ProcessoAguardandoDH(
            sei=pendente.sei,
            servidor_nome=pendente.servidor_nome,
            cpf_mascarado=analitica_service.mascarar_cpf(
                registros_por_sei[pendente.sei].cpf if pendente.sei in registros_por_sei else None
            ),
            categoria_funcional=(
                registros_por_sei[pendente.sei].categoria_funcional
                if pendente.sei in registros_por_sei
                else "NAO_IDENTIFICADO"
            ),
            periodo=Periodo(inicial=pendente.periodo_inicial, final=pendente.periodo_final),
            trecho=Trecho(
                origem=(
                    registros_por_sei[pendente.sei].cidade_origem
                    if pendente.sei in registros_por_sei
                    else None
                ),
                destino=pendente.cidade_destino,
            ),
            situacao=pendente.situacao,
            mensagem=pendente.mensagem,
            data_liberacao_prevista=pendente.data_liberacao_prevista,
            dias_restantes=pendente.dias_restantes,
            dias_atraso=pendente.dias_atraso,
            texto_contagem=pendente.texto_contagem,
        )
        for pendente in resultado_pendentes.registros
    ]

    return ResultadoProcessosAguardandoDH(total=len(processos), processos=processos)


def obter_detalhe_processo_aguardando_dh(
    sei: str, *, hoje: date | None = None
) -> DetalheProcessoAguardandoDH:
    """`sei` trafega exatamente como recebido (RN-12) — mesmo critério de
    `repositorio_analitico.buscar_por_sei`, usado aqui sem alteração."""
    caminho_sqlite = base_local_sqlite.caminho_base_local_sqlite()
    try:
        registro = repositorio_analitico.buscar_por_sei(caminho_sqlite, sei)
    except sqlite3.Error as erro:
        raise BaseAnaliticaIndisponivel(_MENSAGEM_BASE_INDISPONIVEL) from erro
    if registro is None:
        raise RegistroNaoEncontrado(f'Diária com SEI "{sei}" não encontrada.')

    # Mesma função pura da listagem, aplicada a um único registro — se ele
    # já tiver `dh` preenchido, ela devolve lista vazia (nunca uma segunda
    # regra: é o mesmo critério `registro.dh is None` de sempre).
    pendentes = documentos_habeis_pendentes_dominio.listar_documentos_habeis_pendentes(
        [registro], hoje if hoje is not None else date.today()
    )
    pendente = pendentes[0] if pendentes else None

    return DetalheProcessoAguardandoDH(
        sei=registro.sei,
        servidor_nome=registro.servidor.nome if registro.servidor else None,
        cpf_mascarado=analitica_service.mascarar_cpf(registro.cpf),
        categoria_funcional=registro.categoria_funcional,
        periodo=Periodo(inicial=registro.periodo_inicial, final=registro.periodo_final),
        trecho=Trecho(origem=registro.cidade_origem, destino=registro.cidade_destino),
        ainda_aguardando_dh=pendente is not None,
        situacao=pendente.situacao if pendente else None,
        mensagem=pendente.mensagem if pendente else _MENSAGEM_JA_POSSUI_DH,
        data_liberacao_prevista=pendente.data_liberacao_prevista if pendente else None,
        dias_restantes=pendente.dias_restantes if pendente else None,
        dias_atraso=pendente.dias_atraso if pendente else None,
        texto_contagem=pendente.texto_contagem if pendente else None,
        # Micro-sprint C — independentes entre si (item 13 do pedido): uma
        # falha em qualquer um dos dois nunca impede o outro nem o resto
        # do detalhe de ser devolvido.
        historico=_montar_historico_normal(registro),
        valor=_obter_valor_existente(registro),
    )


def registrar_dh(sei: str, dh: str) -> ResultadoRegistroDH:
    """Micro-sprint D ("Escrita Exclusiva do DH") — a ÚNICA capacidade de
    escrita desta Central. P0 (confirmado em todas as auditorias
    anteriores): nunca altera nenhuma outra célula além da coluna DH da
    linha exata do processo.

    Localização por `linha_planilha` (já conhecida via `RegistroAnalitico`,
    nunca uma busca textual por SEI — elimina a ambiguidade de SEI
    duplicado que o modo Complemento pode produzir na Planilha real),
    revalidada contra a Planilha Oficial REAL (não a cópia da Base Local)
    imediatamente antes de gravar — se a coluna B daquela linha não bater
    mais com o SEI esperado, a Base Local está desatualizada e a operação
    é recusada (`"nao_salvo"`), nunca escreve no lugar errado.

    Idempotente: se a célula DH já tiver exatamente o valor pedido, a
    gravação em si é pulada (nunca reescreve à toa) mas a sincronização
    ainda roda — cobre o caso de um retry depois de uma falha de
    sincronização anterior. Se já tiver um valor DIFERENTE, a operação é
    recusada — nunca sobrescreve um DH existente automaticamente."""
    dh_normalizado = dh.strip()

    caminho_sqlite = base_local_sqlite.caminho_base_local_sqlite()
    try:
        registro = repositorio_analitico.buscar_por_sei(caminho_sqlite, sei)
    except sqlite3.Error as erro:
        raise BaseAnaliticaIndisponivel(_MENSAGEM_BASE_INDISPONIVEL) from erro
    if registro is None:
        raise RegistroNaoEncontrado(f'Diária com SEI "{sei}" não encontrada.')

    # `resolver_caminho_para_preenchimento` (reuso — mesmo ponto de entrada
    # já usado por Processamento/Complemento/Finalização) levanta
    # `PlanilhaOficialIndisponivel` se não houver Planilha configurada —
    # nunca capturada aqui, propaga para a API mapear 422.
    caminho_planilha = configuracao_app.resolver_caminho_para_preenchimento()

    try:
        workbook = load_workbook(caminho_planilha)
    except Exception as erro:  # noqa: BLE001 — qualquer falha de leitura vira a mesma falha técnica
        raise FalhaEscritaDH(f"Não foi possível abrir a Planilha Oficial: {erro}") from erro

    try:
        planilha = workbook[NOME_ABA]
        linha = registro.linha_planilha

        sei_real = regularizacao_dh_planilha.sei_na_linha(planilha, linha)
        if sei_real != sei:
            return ResultadoRegistroDH(
                situacao="nao_salvo",
                sei=sei,
                dh=dh_normalizado,
                mensagem=(
                    f'A linha {linha} da Planilha Oficial não corresponde mais ao SEI "{sei}" '
                    "(Base Local desatualizada) — sincronize novamente antes de tentar."
                ),
            )

        dh_atual = regularizacao_dh_planilha.dh_na_linha(planilha, linha)
        if dh_atual is not None and dh_atual != dh_normalizado:
            return ResultadoRegistroDH(
                situacao="nao_salvo",
                sei=sei,
                dh=dh_normalizado,
                mensagem=(
                    f'Este processo já possui um Documento Hábil diferente registrado ("{dh_atual}") '
                    "— nunca sobrescrito automaticamente."
                ),
            )

        ja_gravado = dh_atual == dh_normalizado
        if not ja_gravado:
            try:
                cache_formulas = _capturar_cache_formulas(workbook, caminho_planilha)
                regularizacao_dh_planilha.gravar_dh(planilha, linha, dh_normalizado)
                workbook.save(caminho_planilha)
                _reinjetar_cache_formulas(caminho_planilha, cache_formulas)
            except Exception as erro:  # noqa: BLE001 — falha técnica de gravação, nunca um veredito de negócio
                raise FalhaEscritaDH(f"Não foi possível gravar o Documento Hábil: {erro}") from erro
    finally:
        workbook.close()

    sincronizacao_falhou = False

    def _marcar_falha_sincronizacao(erro: Exception) -> None:
        nonlocal sincronizacao_falhou
        sincronizacao_falhou = True

    try:
        base_local.sincronizar(
            caminho_planilha, origem="regularizacao_dh", ao_falhar_sqlite=_marcar_falha_sincronizacao
        )
    except Exception:  # noqa: BLE001 — mesmo contrato de finalizacao_service.confirmar: uma falha de
        # sincronização nunca desfaz a gravação já concluída, só sinaliza.
        _logger.exception("Falha ao sincronizar a Base Local de Consulta após registrar DH")
        sincronizacao_falhou = True

    if sincronizacao_falhou:
        return ResultadoRegistroDH(
            situacao="salvo_sync_pendente",
            sei=sei,
            dh=dh_normalizado,
            mensagem=(
                "O Documento Hábil foi gravado na Planilha Oficial, mas a Base Local não pôde ser "
                "atualizada agora — esta Central pode continuar mostrando o processo como pendente "
                "até a próxima sincronização."
            ),
        )

    return ResultadoRegistroDH(
        situacao="concluido", sei=sei, dh=dh_normalizado, mensagem="Documento Hábil registrado com sucesso."
    )
