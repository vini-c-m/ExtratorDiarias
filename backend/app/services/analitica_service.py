"""Orquestração da Central Analítica — `pesquisar_diarias` (Sprint 17.4.3),
`detalhar_diaria` (Sprint 17.4.4), `obter_opcoes_filtro` (Sprint 17.4.5),
`estado_sincronizacao`/`executar_sincronizacao_manual`/
`listar_avisos_sincronizacao` (Sprint 17.4.6) e `calcular_indicadores`
(Sprint 19.6.1, ainda sem endpoint — chega na 19.6.2). Mesmo papel de
`app/services/conferencia_service.py`, mas exclusiva desta feature.
Nunca importa `conferencia_service` nem
`app/domain/rules/conferencia.py` (decisão 9,
`docs/central-analitica/README.md § 0.1` — único ponto de compartilhamento
entre os dois módulos é `app/consulta/`). `app/api/analitica.py` nunca
importa de `app.consulta.*` — só deste módulo.

**Regra de posse de tipos (revisão pós-auditoria da 17.4.3, mantida nas
etapas seguintes):**
- **Tipos de parâmetro** que a API constrói e passa para o service
  (`FiltrosDiaria`, `ParametrosPaginacao`, `ParametrosOrdenacao`) são
  **donos deste módulo**, não de `repositorio_analitico.py` — os tipos
  homônimos do repositório continuam existindo, mas como detalhe interno
  da camada SQL. `pesquisar_diarias` traduz de um para o outro na
  fronteira, sem alterar nenhum comportamento (mesmos campos, mesmos
  valores); é o único ponto de tradução, porque é o único endpoint com
  parâmetros de entrada não triviais.
- **Tipos de resultado**, que só a API lê (nunca constrói), são
  **reaproveitados diretamente** do repositório, sem duplicata:
  `ResultadoPesquisa`/`ResultadoDetalhamento` (donos deste módulo, mas
  compostos por `PaginaDeRegistros`/`InfoSincronizacaoResumida`/
  `RegistroAnalitico`, todos importados); `obter_opcoes_filtro` e
  `listar_avisos_sincronizacao` devolvem `repositorio_analitico.OpcoesFiltro`/
  `PaginaDeAvisos` sem nenhum wrapper, porque nenhum dos dois endpoints
  tem parâmetro de entrada complexo — não há fronteira a proteger de um
  tipo que a API nunca constrói.
- **3º padrão (Sprint 17.4.6):** `EstadoSincronizacao`/`ResumoExecucao`
  são dataclasses **novas, de propriedade deste módulo** — nem tradução
  de um tipo homônimo do repositório (não há `FiltrosDiaria`-like a
  traduzir, pois `estado_sincronizacao`/`executar_sincronizacao_manual`
  não recebem parâmetro de entrada complexo), nem reaproveitamento
  direto de um tipo já existente no repositório (não há um
  `EstadoSincronizacao`/`ResumoExecucao` em `repositorio_analitico.py`
  para reaproveitar). Cada uma é montada a partir de
  `InfoSincronizacaoCompleta` (repositório) combinada com dados que só
  este módulo conhece (sinal físico do `.sqlite`, comparação ao vivo
  contra a Planilha Oficial via `configuracao_app`) — daí a razão de
  serem tipos genuinamente novos, não uma tradução nem um passthrough."""

import csv
import logging
import os
import re
import sqlite3
import tempfile
import uuid
from dataclasses import dataclass, field
from datetime import date, datetime
from pathlib import Path
from typing import Literal, cast

from xml.sax.saxutils import escape as _escapar_xml

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.table import Table as TabelaExcelEstruturada
from openpyxl.worksheet.table import TableStyleInfo
from openpyxl.worksheet.worksheet import Worksheet
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.pdfgen.canvas import Canvas
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.consulta import base_local, base_local_sqlite, repositorio_analitico
from app.consulta.repositorio_analitico import InfoSincronizacaoResumida, OpcoesFiltro, PaginaDeAvisos, PaginaDeRegistros
from app.domain.analitica import diagnostico as diagnostico_dominio
from app.domain.analitica import distribuicoes as distribuicoes_dominio
from app.domain.analitica import documentos_habeis_pendentes as documentos_habeis_pendentes_dominio
from app.domain.analitica import indicadores as indicadores_dominio
from app.domain.analitica import relatorios as relatorios_dominio
from app.domain.analitica.diagnostico import CasoDiagnostico, Classificacao
from app.domain.analitica.distribuicoes import Distribuicao, DimensaoDistribuicao
from app.domain.analitica.documentos_habeis_pendentes import DocumentoHabilPendente
from app.domain.analitica.indicadores import Indicadores
from app.domain.analitica.relatorios import TIPOS_COM_TABELA, ConteudoRelatorio
from app.domain.entities.registro_analitico import RegistroAnalitico
from app.infra.config import configuracao_app

_MENSAGEM_BASE_INDISPONIVEL = (
    "Não foi possível acessar os registros da Central Analítica agora. Tente novamente em instantes."
)
_MENSAGEM_SINCRONIZACAO_EM_ANDAMENTO = (
    "Uma sincronização já está em andamento. Aguarde a conclusão antes de tentar novamente."
)

_logger = logging.getLogger(__name__)


class ErroAnaliticaServico(Exception):
    pass


class BaseAnaliticaIndisponivel(ErroAnaliticaServico):
    """Base Local em SQLite ausente (nunca sincronizada) ou corrompida —
    falha técnica, nunca um resultado de negócio. Mapeada para HTTP 503,
    mesmo padrão de `BaseLocalIndisponivel` em `conferencia_service.py`
    (classe própria, não reaproveitada — decisão 9)."""


class RegistroNaoEncontrado(ErroAnaliticaServico):
    """SEI sem diária correspondente na Base Local — resultado de negócio
    válido (não uma falha técnica), mapeado para HTTP 404. Mesmo padrão de
    `ServidorNaoEncontrado` em `conferencia_service.py` (classe própria,
    não reaproveitada — decisão 9)."""


class SincronizacaoEmAndamento(ErroAnaliticaServico):
    """Uma segunda chamada a `POST /sincronizacao` enquanto outra já está
    em andamento — recusada, nunca enfileirada (RN-A, decisão oficial da
    Sprint 17.4.1). Mapeada para HTTP 409."""


class TipoRelatorioIndisponivel(ErroAnaliticaServico):
    """`tipo` é um dos 8 valores aceitos pelo contrato (`schemas.analitica.
    TipoRelatorio`), mas `"inconsistencias"`/`"qualidade_dados"` dependem
    do catálogo de diagnósticos (`app/domain/analitica/diagnostico.py`,
    Sprint 19.8), que ainda não existe — mesmo risco já registrado na
    19.7.1. Recusada aqui com uma mensagem explícita, nunca uma composição
    inventada nem um erro técnico genérico. Mapeada para HTTP 422 (mesmo
    padrão de `configuracao_app.PlanilhaOficialIndisponivel` em
    `executar_sincronizacao_manual`: o contrato aceita o valor, o backend
    não pode atendê-lo ainda)."""


def mascarar_cpf(cpf: str | None) -> str | None:
    """Sprint 19.5.7.1 — usada exclusivamente para `DiariaResumoResposta.
    cpf_mascarado` (`GET /diarias`, listagem). Mesma regra de formato de
    `frontend/src/lib/mascararCpf.ts` (11 dígitos → `***.***.***-DD`,
    últimos 2 visíveis; nunca lança, mesmo com entrada vazia, `None` ou com
    qualquer quantidade de dígitos diferente de 11) — só o valor de saída
    para entrada malformada diverge deliberadamente: o par do frontend
    devolve o valor original nesse caso (correto lá, porque o CPF completo
    já trafega de qualquer forma em `DiariaCompletaResposta`, e a máscara é
    só apresentação); aqui, devolver o valor original vazaria o CPF
    completo para dentro do único campo que a Sprint 19.5.7.1 existe para
    manter sempre mascarado (decisão vinculante — CPF completo nunca sai
    de `GET /diarias`, § 0.7 herdada da Sprint 18.1). `None` é o resultado
    seguro para essa entrada — já é um valor legítimo do tipo
    `cpf_mascarado: str | None`, não um estado inventado.

    Sprint 19.5.7.1.1 — correção defensiva (achado da Auditoria Técnica):
    a assinatura antes declarava `cpf: str`, mas nada impede, em runtime,
    que um valor `None` chegue aqui (Python não aplica type hints);
    `re.sub` sobre `None` levantava `TypeError`, transformando uma
    entrada "impossível hoje" (a coluna `cpf` do SQLite é `NOT NULL`) numa
    falha real caso essa garantia mude no futuro. `None` agora está no
    próprio tipo aceito e é tratado antes de qualquer normalização —
    mesma resposta segura (`None`) que qualquer outra entrada malformada,
    nunca uma exceção."""
    if cpf is None:
        return None
    digitos = re.sub(r"\D", "", cpf)
    if len(digitos) != 11:
        return None
    return f"***.***.***-{digitos[-2:]}"


@dataclass(frozen=True)
class FiltrosDiaria:
    q: str | None = None
    sei: str | None = None
    cpf: str | None = None
    servidor_nome: str | None = None
    servidor_matricula: str | None = None
    municipio: str | None = None
    motivo: str | None = None
    situacao: str | None = None
    periodo_inicial: date | None = None
    periodo_final: date | None = None
    origem: str | None = None
    destino: str | None = None
    trecho: str | None = None
    valor_minimo: float | None = None
    valor_maximo: float | None = None
    # Sprint 20 (2026-08-05) — filtro primário "Todos | Membros |
    # Servidores" do Recorte Analítico; `None`/ausente é "Todos".
    categoria_funcional: str | None = None


@dataclass(frozen=True)
class ParametrosPaginacao:
    pagina: int
    tamanho_pagina: int


@dataclass(frozen=True)
class ParametrosOrdenacao:
    campo: str
    ordem: str


@dataclass(frozen=True)
class ResultadoPesquisa:
    pagina: PaginaDeRegistros
    sincronizacao: InfoSincronizacaoResumida


@dataclass(frozen=True)
class ResultadoDetalhamento:
    registro: RegistroAnalitico
    sincronizacao: InfoSincronizacaoResumida
    diagnosticos: list[CasoDiagnostico]


@dataclass(frozen=True)
class ResultadoIndicadores:
    """Sprint 19.6.1 — mesmo padrão de `ResultadoPesquisa`/
    `ResultadoDetalhamento`: embute o carimbo mínimo de sincronização
    (regra vinculante já herdada, obrigatória em toda resposta desta
    Central), mesmo sem endpoint ainda para expor isso (chega na 19.6.2)."""

    indicadores: Indicadores
    sincronizacao: InfoSincronizacaoResumida


@dataclass(frozen=True)
class ResultadoDistribuicao:
    """Sprint 19.6.3 — diferente de `ResultadoPesquisa`/`ResultadoIndicadores`,
    não embute `sincronizacao`: o contrato aprovado (`v2-plano-tecnico.md
    § 12.3`) declara só `dimensao`/`pontos` na resposta de `GET
    /distribuicoes` — decisão já tomada no plano técnico, não uma omissão
    desta implementação. Nenhuma consulta a `ultima_sincronizacao` é feita
    para este endpoint (nada no contrato usaria o resultado)."""

    distribuicao: Distribuicao


@dataclass(frozen=True)
class RegistroDiagnosticado:
    """Sprint 19.8.2 — agregado por SEI (`v2-plano-tecnico.md § 12.4`):
    `classificacao` é a pior entre `casos` (`diagnostico_dominio.
    classificar`, nunca recalculada aqui). `casos` reaproveita
    `CasoDiagnostico` do domínio diretamente (mesmo padrão de
    `ResultadoDistribuicao.distribuicao` — tipo de resultado só lido pela
    API, nunca traduzido)."""

    sei: str
    classificacao: Classificacao
    casos: list[CasoDiagnostico]


@dataclass(frozen=True)
class ResumoDiagnostico:
    esperado: int
    atencao: int
    inconsistencia: int


@dataclass(frozen=True)
class ResultadoDiagnostico:
    """Mesmo critério de `ResultadoDistribuicao`: contrato aprovado
    (§ 12.4) não inclui `sincronizacao` na resposta de `GET /diagnostico`."""

    resumo: ResumoDiagnostico
    registros: list[RegistroDiagnosticado]


@dataclass(frozen=True)
class ResumoDocumentosHabeisPendentes:
    aguardando_liberacao: int
    revisao_manual_necessaria: int


@dataclass(frozen=True)
class ResultadoDocumentosHabeisPendentes:
    """"Documentos Hábeis Pendentes" (correção de foco, 2026-08-05,
    substitui a experiência antes exposta pelo botão "Análise Rápida
    (Diagnóstico)") — mesmo critério de `ResultadoDiagnostico`: sem
    `sincronizacao` embutida. `registros` reaproveita `DocumentoHabilPendente`
    do domínio diretamente (mesmo padrão de `ResultadoDistribuicao.distribuicao`
    — tipo de resultado só lido pela API, nunca traduzido)."""

    resumo: ResumoDocumentosHabeisPendentes
    registros: list[DocumentoHabilPendente]


@dataclass(frozen=True)
class ParametrosRelatorio:
    """Sprint 19.7.2 — tradução de `schemas.analitica.ParametrosRelatorioQuery`
    (sem o campo `filtros`, que segue o mesmo caminho de tradução de
    `FiltrosDiaria` já usado por todo o resto deste módulo). `tipo` aceita
    os 8 valores do contrato (`schemas.analitica.TipoRelatorio`) — mais
    amplo que `relatorios_dominio.TipoRelatorio` (só 6) de propósito:
    `gerar_relatorio` é quem decide, em runtime, se recusa os 2 ainda
    indisponíveis (`TipoRelatorioIndisponivel`), nunca a assinatura desta
    dataclass."""

    tipo: str
    formato: Literal["pdf", "excel", "csv"]
    incluir_indicadores: bool
    incluir_graficos: bool
    incluir_tabela: bool
    incluir_inconsistencias: bool
    modo: Literal["previsualizacao", "final"]
    # Sprint 21.9 (Modo Executivo) — texto já pronto do cliente, incluído
    # verbatim só no PDF de `tipo="visao_executiva"` (`_escrever_pdf`);
    # `default_factory` para não quebrar nenhum `ParametrosRelatorio(...)`
    # já existente em teste/produção que não passa este campo.
    insights: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class RelatorioGerado:
    """Sprint 19.7.2 — `sincronizado_em` é `str` aqui (mesmo formato bruto
    de `InfoSincronizacaoResumida`, ISO vindo direto do SQLite) — a
    conversão para `datetime` acontece na fronteira da API
    (`RelatorioGeradoResposta`), mesmo padrão já usado em todo o resto
    deste módulo (`ResultadoPesquisa`, `ResultadoIndicadores`, ...)."""

    caminho_arquivo_temporario: str
    nome_sugerido: str
    sincronizado_em: str


@dataclass(frozen=True)
class EstadoSincronizacao:
    sincronizado_em: str | None
    origem: str | None
    possivelmente_desatualizado: bool
    total_avisos: int
    status: Literal["nunca_sincronizado", "atualizado", "possivelmente_desatualizado"]


@dataclass(frozen=True)
class ResumoExecucao:
    status: Literal["sucesso", "falha"]
    sincronizado_em: str | None
    linhas_diarias: int | None
    linhas_servidores_lidos: int | None
    linhas_ignoradas: int | None
    total_avisos: int | None


# ETAPA 2 (Auditoria P0, 2026-08-09) — reaproveita o MESMO lock que
# `base_local.sincronizar()` agora adquire internamente para a etapa
# SQLite (`base_local.LOCK_SINCRONIZACAO`), em vez de um `Lock` próprio
# deste módulo: antes, só este caminho (manual) tinha proteção — dois
# chamadores automáticos (processamento/complemento/configuração) podiam
# colidir entre si sem nenhuma coordenação, reproduzido gerando
# `PermissionError`/`WinError 32` real. É um `RLock` (não `Lock`) de
# propósito: esta função adquire aqui embaixo (`acquire(blocking=False)`,
# não-bloqueante — devolve "sincronização já em andamento" na hora se
# outra chamada, de QUALQUER origem, já segura o lock) e a chamada
# síncrona a `base_local.sincronizar()` logo abaixo adquire de novo, na
# MESMA thread — só um `RLock` permite isso sem deadlock.
_lock_sincronizacao = base_local.LOCK_SINCRONIZACAO
"""Nível de módulo — protege `executar_sincronizacao_manual` contra
chamadas concorrentes (RN-A) E agora contra qualquer sincronização
automática concorrente também (ETAPA 2). Suficiente porque o backend roda
como processo único (Uvicorn local, subido pelo Electron) — premissa
explícita, não uma garantia universal (§ 5 do plano técnico); deixaria de
proteger se o backend passasse a rodar com múltiplos workers."""


def pesquisar_diarias(
    filtros: FiltrosDiaria,
    paginacao: ParametrosPaginacao,
    ordenacao: ParametrosOrdenacao,
) -> ResultadoPesquisa:
    """Etapa única desta Sprint: resolve o caminho da Base Local em
    SQLite, consulta e embute o carimbo mínimo de sincronização — toda
    falha de leitura (arquivo ausente, corrompido, sem registro de
    sincronização) vira a mesma mensagem de falha técnica.

    Traduz os tipos de parâmetro (públicos deste serviço) para os tipos
    homônimos de `repositorio_analitico` (internos à camada SQL) antes de
    chamar o repositório — mesmos campos, mesma ordem, nenhuma mudança de
    valor ou de regra."""
    filtros_repositorio = repositorio_analitico.FiltrosDiaria(
        q=filtros.q,
        sei=filtros.sei,
        cpf=filtros.cpf,
        servidor_nome=filtros.servidor_nome,
        servidor_matricula=filtros.servidor_matricula,
        municipio=filtros.municipio,
        motivo=filtros.motivo,
        situacao=filtros.situacao,
        periodo_inicial=filtros.periodo_inicial,
        periodo_final=filtros.periodo_final,
        origem=filtros.origem,
        destino=filtros.destino,
        trecho=filtros.trecho,
        valor_minimo=filtros.valor_minimo,
        valor_maximo=filtros.valor_maximo,
        categoria_funcional=filtros.categoria_funcional,
    )
    paginacao_repositorio = repositorio_analitico.ParametrosPaginacao(
        pagina=paginacao.pagina, tamanho_pagina=paginacao.tamanho_pagina
    )
    ordenacao_repositorio = repositorio_analitico.ParametrosOrdenacao(
        campo=ordenacao.campo, ordem=ordenacao.ordem
    )

    caminho_sqlite = base_local_sqlite.caminho_base_local_sqlite()
    try:
        pagina = repositorio_analitico.listar_diarias(
            caminho_sqlite, filtros_repositorio, paginacao_repositorio, ordenacao_repositorio
        )
        sincronizacao = repositorio_analitico.ultima_sincronizacao(caminho_sqlite)
    except sqlite3.Error as erro:
        raise BaseAnaliticaIndisponivel(_MENSAGEM_BASE_INDISPONIVEL) from erro

    return ResultadoPesquisa(pagina=pagina, sincronizacao=sincronizacao)


def detalhar_diaria(sei: str, *, hoje: date | None = None) -> ResultadoDetalhamento:
    """Sprint 17.4.4 — resolve o caminho da Base Local em SQLite, busca o
    registro pelo SEI (literal, nunca normalizado — RN-12) e embute o
    mesmo carimbo mínimo de sincronização de `pesquisar_diarias`. SEI
    inexistente vira `RegistroNaoEncontrado` (404) antes de qualquer
    consulta de sincronização — não há sentido em pagar essa segunda
    consulta para um recurso que não existe.

    Sprint 19.8.3 — `diagnosticos` reaproveita `diagnostico_dominio.
    diagnosticar_registro` (mesmas funções de caso da 19.8.1/19.8.2, nunca
    uma segunda implementação): só os casos que dependem só deste
    registro — nunca duplicidade (`_casos_duplicidade`), que exige
    comparar contra outros registros de um recorte que este endpoint não
    tem (é um único SEI, não um recorte filtrado); mesmo critério de
    `GET /diagnostico` rodar só sobre um recorte explícito, nunca a base
    inteira por trás das cortinas."""
    caminho_sqlite = base_local_sqlite.caminho_base_local_sqlite()
    try:
        registro = repositorio_analitico.buscar_por_sei(caminho_sqlite, sei)
        if registro is None:
            raise RegistroNaoEncontrado(f'Diária com SEI "{sei}" não encontrada.')
        sincronizacao = repositorio_analitico.ultima_sincronizacao(caminho_sqlite)
    except sqlite3.Error as erro:
        raise BaseAnaliticaIndisponivel(_MENSAGEM_BASE_INDISPONIVEL) from erro

    diagnosticos = diagnostico_dominio.diagnosticar_registro(registro, hoje if hoje is not None else date.today())

    return ResultadoDetalhamento(registro=registro, sincronizacao=sincronizacao, diagnosticos=diagnosticos)


def calcular_indicadores(filtros: FiltrosDiaria) -> ResultadoIndicadores:
    """Sprint 19.6.1 — sem endpoint ainda (chega na 19.6.2). Mesma tradução
    de `FiltrosDiaria` já usada por `pesquisar_diarias` (nenhum campo novo,
    nenhuma regra de filtragem alterada): busca o recorte inteiro via
    `repositorio_analitico.agregar_indicadores` e delega o cálculo dos
    KPIs para a função pura de `app/domain/analitica/indicadores.py` —
    esta função nunca calcula KPI nenhum diretamente, só orquestra."""
    filtros_repositorio = repositorio_analitico.FiltrosDiaria(
        q=filtros.q,
        sei=filtros.sei,
        cpf=filtros.cpf,
        servidor_nome=filtros.servidor_nome,
        servidor_matricula=filtros.servidor_matricula,
        municipio=filtros.municipio,
        motivo=filtros.motivo,
        situacao=filtros.situacao,
        periodo_inicial=filtros.periodo_inicial,
        periodo_final=filtros.periodo_final,
        origem=filtros.origem,
        destino=filtros.destino,
        trecho=filtros.trecho,
        valor_minimo=filtros.valor_minimo,
        valor_maximo=filtros.valor_maximo,
        categoria_funcional=filtros.categoria_funcional,
    )

    caminho_sqlite = base_local_sqlite.caminho_base_local_sqlite()
    try:
        registros = repositorio_analitico.agregar_indicadores(caminho_sqlite, filtros_repositorio)
        sincronizacao = repositorio_analitico.ultima_sincronizacao(caminho_sqlite)
    except sqlite3.Error as erro:
        raise BaseAnaliticaIndisponivel(_MENSAGEM_BASE_INDISPONIVEL) from erro

    return ResultadoIndicadores(
        indicadores=indicadores_dominio.calcular_indicadores(registros),
        sincronizacao=sincronizacao,
    )


def calcular_distribuicoes(filtros: FiltrosDiaria, dimensao: DimensaoDistribuicao) -> ResultadoDistribuicao:
    """Sprint 19.6.3 — mesma tradução de `FiltrosDiaria` já usada por
    `pesquisar_diarias`/`calcular_indicadores` (nenhum campo novo, nenhuma
    regra de filtragem alterada): busca o recorte inteiro via
    `repositorio_analitico.agregar_distribuicao` (que, por sua vez,
    reaproveita `agregar_indicadores` — mesma consulta, nunca duplicada) e
    delega a agregação por dimensão para a função pura de
    `app/domain/analitica/distribuicoes.py` — esta função nunca agrega
    nada diretamente, só orquestra."""
    filtros_repositorio = repositorio_analitico.FiltrosDiaria(
        q=filtros.q,
        sei=filtros.sei,
        cpf=filtros.cpf,
        servidor_nome=filtros.servidor_nome,
        servidor_matricula=filtros.servidor_matricula,
        municipio=filtros.municipio,
        motivo=filtros.motivo,
        situacao=filtros.situacao,
        periodo_inicial=filtros.periodo_inicial,
        periodo_final=filtros.periodo_final,
        origem=filtros.origem,
        destino=filtros.destino,
        trecho=filtros.trecho,
        valor_minimo=filtros.valor_minimo,
        valor_maximo=filtros.valor_maximo,
        categoria_funcional=filtros.categoria_funcional,
    )

    caminho_sqlite = base_local_sqlite.caminho_base_local_sqlite()
    try:
        registros = repositorio_analitico.agregar_distribuicao(caminho_sqlite, filtros_repositorio)
    except sqlite3.Error as erro:
        raise BaseAnaliticaIndisponivel(_MENSAGEM_BASE_INDISPONIVEL) from erro

    return ResultadoDistribuicao(
        distribuicao=distribuicoes_dominio.calcular_distribuicao(registros, dimensao),
    )


def executar_diagnostico(filtros: FiltrosDiaria, *, hoje: date | None = None) -> ResultadoDiagnostico:
    """`GET /diagnostico` (Sprint 19.8.2, `v2-plano-tecnico.md § 12.4`) —
    mesma tradução de `FiltrosDiaria` já usada por `calcular_indicadores`/
    `calcular_distribuicoes` (nenhum campo novo, nenhuma regra de
    filtragem alterada): busca o recorte inteiro via
    `repositorio_analitico.listar_para_diagnostico` (que, por sua vez,
    reaproveita `agregar_indicadores` — mesma consulta, nunca duplicada) e
    delega a classificação para as funções puras de `app/domain/analitica/
    diagnostico.py` — esta função nunca decide caso nenhum diretamente,
    só orquestra e soma o resumo.

    `hoje` segue o mesmo padrão já usado em `conferencia_service.
    conferir_cpf` (`hoje: date | None = None`, produção nunca passa,
    testes fixam um valor) — nunca `date.today()` dentro do domínio puro,
    só aqui, na fronteira de orquestração."""
    filtros_repositorio = repositorio_analitico.FiltrosDiaria(
        q=filtros.q,
        sei=filtros.sei,
        cpf=filtros.cpf,
        servidor_nome=filtros.servidor_nome,
        servidor_matricula=filtros.servidor_matricula,
        municipio=filtros.municipio,
        motivo=filtros.motivo,
        situacao=filtros.situacao,
        periodo_inicial=filtros.periodo_inicial,
        periodo_final=filtros.periodo_final,
        origem=filtros.origem,
        destino=filtros.destino,
        trecho=filtros.trecho,
        valor_minimo=filtros.valor_minimo,
        valor_maximo=filtros.valor_maximo,
        categoria_funcional=filtros.categoria_funcional,
    )

    caminho_sqlite = base_local_sqlite.caminho_base_local_sqlite()
    try:
        registros = repositorio_analitico.listar_para_diagnostico(caminho_sqlite, filtros_repositorio)
    except sqlite3.Error as erro:
        raise BaseAnaliticaIndisponivel(_MENSAGEM_BASE_INDISPONIVEL) from erro

    casos_por_sei = diagnostico_dominio.diagnosticar_recorte(registros, hoje if hoje is not None else date.today())

    contagens = {"esperado": 0, "atencao": 0, "inconsistencia": 0}
    registros_diagnosticados: list[RegistroDiagnosticado] = []
    for registro in registros:
        casos = casos_por_sei[registro.sei]
        classificacao = diagnostico_dominio.classificar(casos)
        contagens[classificacao] += 1
        registros_diagnosticados.append(
            RegistroDiagnosticado(sei=registro.sei, classificacao=classificacao, casos=casos)
        )
    resumo = ResumoDiagnostico(**contagens)

    return ResultadoDiagnostico(resumo=resumo, registros=registros_diagnosticados)


def listar_documentos_habeis_pendentes(
    filtros: FiltrosDiaria, *, hoje: date | None = None
) -> ResultadoDocumentosHabeisPendentes:
    """`GET /documentos-habeis-pendentes` (correção de foco, 2026-08-05) —
    mesma tradução de `FiltrosDiaria` e mesma consulta de recorte inteiro
    (`repositorio_analitico.listar_para_diagnostico`, reaproveitada sem
    duplicar SQL) já usadas por `executar_diagnostico`; delega a
    classificação/ordenação para a função pura de `app/domain/analitica/
    documentos_habeis_pendentes.py` — esta função nunca decide caso nenhum
    diretamente, só orquestra e soma o resumo.

    Diferente de `executar_diagnostico`: aqui só os registros com `dh`
    vazio chegam ao resultado — nunca o catálogo geral de anomalias
    (`diagnostico_dominio` nem é chamado aqui). `hoje` segue o mesmo padrão
    de orquestração (`date | None = None`, produção nunca passa, testes
    fixam um valor) — nunca `date.today()` dentro do domínio puro."""
    filtros_repositorio = repositorio_analitico.FiltrosDiaria(
        q=filtros.q,
        sei=filtros.sei,
        cpf=filtros.cpf,
        servidor_nome=filtros.servidor_nome,
        servidor_matricula=filtros.servidor_matricula,
        municipio=filtros.municipio,
        motivo=filtros.motivo,
        situacao=filtros.situacao,
        periodo_inicial=filtros.periodo_inicial,
        periodo_final=filtros.periodo_final,
        origem=filtros.origem,
        destino=filtros.destino,
        trecho=filtros.trecho,
        valor_minimo=filtros.valor_minimo,
        valor_maximo=filtros.valor_maximo,
        categoria_funcional=filtros.categoria_funcional,
    )

    caminho_sqlite = base_local_sqlite.caminho_base_local_sqlite()
    try:
        registros = repositorio_analitico.listar_para_diagnostico(caminho_sqlite, filtros_repositorio)
    except sqlite3.Error as erro:
        raise BaseAnaliticaIndisponivel(_MENSAGEM_BASE_INDISPONIVEL) from erro

    pendentes = documentos_habeis_pendentes_dominio.listar_documentos_habeis_pendentes(
        registros, hoje if hoje is not None else date.today()
    )

    resumo = ResumoDocumentosHabeisPendentes(
        aguardando_liberacao=sum(1 for p in pendentes if p.situacao == "aguardando_liberacao"),
        revisao_manual_necessaria=sum(1 for p in pendentes if p.situacao == "revisao_manual_necessaria"),
    )

    return ResultadoDocumentosHabeisPendentes(resumo=resumo, registros=pendentes)


# --- Sprint 19.7.2 — POST /relatorios ----------------------------------

_TIPOS_RELATORIO_INDISPONIVEIS: frozenset[str] = frozenset({"inconsistencias", "qualidade_dados"})

_TIPO_ROTULO: dict[str, str] = {
    "executivo": "Executivo",
    "detalhado": "Detalhado",
    "financeiro": "Financeiro",
    "por_servidor": "Por servidor",
    "por_municipio": "Por município",
    "por_situacao": "Por situação",
    "visao_executiva": "Visão Executiva",
}

_EXTENSAO_POR_FORMATO: dict[str, str] = {"pdf": "pdf", "excel": "xlsx", "csv": "csv"}

# Mesmos títulos de cartão já usados em `DashboardRecorte.tsx` (19.6.4) —
# nenhum vocabulário novo para a mesma dimensão entre Dashboard e Relatório.
# As 3 últimas entradas (Sprint 21.9) usam os mesmos títulos já homologados
# em `GradeGraficosExecutivos.tsx` (Sprint 21.1/21.3) — "Unidade
# solicitante (documento de origem)" preserva o rótulo completo obrigatório
# (decisão de fechamento 9 do Modo Executivo).
_ROTULO_DIMENSAO: dict[str, str] = {
    "periodo": "Evolução por período",
    "servidor": "Ranking de servidores",
    "municipio": "Ranking de municípios",
    "motivo": "Distribuição por motivo",
    "situacao": "Distribuição por situação do servidor",
    "origem_destino": "Origem × Destino",
    "categoria_funcional": "Membros × Servidores",
    "doc_origem": "Unidade solicitante (documento de origem)",
    "transporte": "Meio de transporte",
}

_ROTULO_CAMPO_FILTRO: dict[str, str] = {
    "q": "Busca",
    "sei": "SEI",
    "cpf": "CPF",
    "servidor_nome": "Servidor",
    "servidor_matricula": "Matrícula",
    "municipio": "Município",
    "motivo": "Motivo",
    "situacao": "Situação",
    "periodo_inicial": "A partir de",
    "periodo_final": "Até",
    "origem": "Origem",
    "destino": "Destino",
    "trecho": "Trecho",
    "valor_minimo": "Valor mínimo",
    "valor_maximo": "Valor máximo",
}

_MESES_ABREV = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]

_NOME_PASTA_TEMPORARIA_RELATORIOS = "extrator_diarias_relatorios"


def _pasta_temporaria_relatorios() -> Path:
    pasta = Path(tempfile.gettempdir()) / _NOME_PASTA_TEMPORARIA_RELATORIOS
    pasta.mkdir(parents=True, exist_ok=True)
    return pasta


def _nome_sugerido(tipo: str, formato: str, agora: datetime) -> str:
    """Mesmo padrão já usado pelo relatório de Processamento
    (`electron/ipc/relatorio.ts::nomeRelatorioSugerido`): "Relatório
    {Tipo} - DD-MM-AAAA.{extensão}"."""
    extensao = _EXTENSAO_POR_FORMATO[formato]
    return f"Relatório {_TIPO_ROTULO[tipo]} - {agora.strftime('%d-%m-%Y')}.{extensao}"


def _formatar_inteiro(valor: int) -> str:
    return f"{valor:,}".replace(",", ".")


def _formatar_moeda(valor: float | None) -> str:
    """`None` nunca vira "R$ 0,00" — mesmo critério já usado em
    `indicadores.py`/`distribuicoes.py`/`DashboardRecorte.tsx`."""
    if valor is None:
        return "—"
    inteiro, decimal = f"{valor:,.2f}".split(".")
    return f"R$ {inteiro.replace(',', '.')},{decimal}"


def _formatar_data(valor: date) -> str:
    """`dd/mm/aaaa` — padrão brasileiro, sempre inequívoco (dia antes do
    mês), usado em toda apresentação de relatório (Bloco de Refinamento,
    2026-08-05). Nunca usado para comparação/ordenação — só exibição."""
    return valor.strftime("%d/%m/%Y")


def _formatar_periodo_registro(periodo_inicial: date, periodo_final: date) -> str:
    return f"{_formatar_data(periodo_inicial)} a {_formatar_data(periodo_final)}"


def _formatar_periodo(chave_periodo: str) -> str:
    """`YYYY-MM` → `"jan/2026"` — mesma lógica de
    `DashboardRecorte.tsx::formatarPeriodo` (duplicação inevitável entre
    Python/TypeScript, não entre duas camadas do mesmo lado)."""
    ano, mes = chave_periodo.split("-")
    indice = int(mes) - 1
    rotulo_mes = _MESES_ABREV[indice] if 0 <= indice < 12 else mes
    return f"{rotulo_mes}/{ano}"


def _resumo_filtros(filtros: FiltrosDiaria) -> str:
    """§ 7.3: "Filtros aplicados... nunca omitido — transparência do
    recorte". CPF, se usado como filtro, também nunca aparece cru aqui
    (mesma regra vinculante de qualquer outro artefato desta Central)."""
    partes = []
    for campo, rotulo in _ROTULO_CAMPO_FILTRO.items():
        valor = getattr(filtros, campo)
        if valor is None or valor == "":
            continue
        if campo == "cpf":
            valor = mascarar_cpf(str(valor)) or valor
        partes.append(f"{rotulo}: {valor}")
    return "Filtros aplicados: " + ("; ".join(partes) if partes else "nenhum (recorte = base inteira)")


@dataclass(frozen=True)
class _SecaoRelatorio:
    titulo: str
    cabecalho: list[str]
    linhas: list[list[str]]


def _linhas_indicadores(indicadores: Indicadores) -> list[list[str]]:
    return [
        ["Total de diárias", _formatar_inteiro(indicadores.total_diarias)],
        ["Total de servidores", _formatar_inteiro(indicadores.total_servidores)],
        ["Valor total", _formatar_moeda(indicadores.valor_total)],
        ["Valor médio", _formatar_moeda(indicadores.valor_medio)],
    ]


def _linhas_distribuicao(distribuicao: Distribuicao) -> list[list[str]]:
    return [
        [
            _formatar_periodo(ponto.rotulo) if distribuicao.dimensao == "periodo" else ponto.rotulo,
            _formatar_inteiro(ponto.contagem),
            _formatar_moeda(ponto.valor),
        ]
        for ponto in distribuicao.pontos
    ]


def _linhas_registros(registros: list[RegistroAnalitico]) -> list[list[str]]:
    """`cpf` sempre mascarado (`mascarar_cpf`, já definido acima neste
    módulo) — nenhum artefato exportado desta Central carrega CPF cru,
    mesma regra vinculante de `GET /diarias`."""
    linhas = []
    for registro in registros:
        periodo = _formatar_periodo_registro(registro.periodo_inicial, registro.periodo_final)
        servidor_nome = registro.servidor.nome if registro.servidor is not None else "Servidor sem cadastro"
        linhas.append(
            [
                registro.sei,
                periodo,
                servidor_nome,
                mascarar_cpf(registro.cpf) or "—",
                registro.cidade_destino or "—",
                registro.motivo,
                _formatar_moeda(registro.valor_total_diarias),
            ]
        )
    return linhas


def _construir_secoes(conteudo: ConteudoRelatorio, parametros: ParametrosRelatorio) -> list[_SecaoRelatorio]:
    """Cada `incluir_*` do request (independente de `tipo`) decide só o
    que aparece no artefato final — `relatorios_dominio.compor_relatorio`
    (19.7.1) nunca sabe desses flags, só decide o que é **relevante** por
    tipo (nenhum recálculo duplicado, auditoria de contrato da 19.7.1).
    `incluir_inconsistencias` é aceito pelo contrato mas sem efeito
    nenhum ainda — `diagnostico.py` (19.8) não existe, então nunca há uma
    seção "Inconsistências" para incluir ou omitir; omissão honesta, não
    um "0 inconsistências" inventado."""
    secoes: list[_SecaoRelatorio] = []

    if parametros.incluir_indicadores:
        secoes.append(
            _SecaoRelatorio(
                titulo="Indicadores", cabecalho=["Indicador", "Valor"], linhas=_linhas_indicadores(conteudo.indicadores)
            )
        )

    if parametros.incluir_graficos:
        for distribuicao in conteudo.distribuicoes:
            secoes.append(
                _SecaoRelatorio(
                    titulo=_ROTULO_DIMENSAO[distribuicao.dimensao],
                    cabecalho=["Categoria", "Diárias", "Valor"],
                    linhas=_linhas_distribuicao(distribuicao),
                )
            )

    if parametros.incluir_tabela and conteudo.registros:
        secoes.append(
            _SecaoRelatorio(
                titulo="Tabela do recorte",
                cabecalho=["SEI", "Período", "Servidor", "CPF", "Destino", "Motivo", "Valor"],
                linhas=_linhas_registros(conteudo.registros),
            )
        )

    return secoes


def _escrever_csv(caminho: Path, secoes: list[_SecaoRelatorio], sincronizado_em: str, agora: datetime) -> None:
    # `utf-8-sig` (BOM) — Excel no Windows só detecta UTF-8 corretamente
    # com o BOM; sem ele, acentos ("á", "ã"...) aparecem corrompidos ao
    # abrir o CSV diretamente no Excel (uso real esperado deste formato).
    with open(caminho, "w", newline="", encoding="utf-8-sig") as arquivo:
        escritor = csv.writer(arquivo)
        for secao in secoes:
            escritor.writerow([secao.titulo])
            escritor.writerow(secao.cabecalho)
            for linha in secao.linhas:
                escritor.writerow(linha)
            escritor.writerow([])
        escritor.writerow(["Gerado em", agora.strftime("%d/%m/%Y %H:%M:%S")])
        escritor.writerow(["Última sincronização", sincronizado_em])


_COR_PRIMARIA_HEX = "0F172A"
_COR_LINHA_ALTERNADA_HEX = "F1F5F9"
_COR_BORDA_HEX = "CBD5E1"
_FORMATO_MOEDA_BR = '"R$" #,##0.00'
_FORMATO_INTEIRO_BR = "#,##0"
_FORMATO_DATA_BR = "DD/MM/YYYY"
_LARGURA_MAXIMA_COLUNA_EXCEL = 60
_LARGURA_MINIMA_COLUNA_EXCEL = 10
_CARACTERES_POR_LINHA_ALTURA = 45  # heurística de quebra p/ altura de linha


def _nome_aba_excel(bruto: str, usados: set[str]) -> str:
    """Nomes de aba do Excel: no máximo 31 caracteres, sem `: \\ / ? * [ ]`,
    e únicos na pasta de trabalho (2+ distribuições com o mesmo rótulo
    nunca deveriam colidir hoje, mas a função nunca confia nisso
    silenciosamente — sufixa com um número em vez de sobrescrever)."""
    sanitizado = re.sub(r"[:\\/?*\[\]]", "-", bruto).strip() or "Aba"
    base = sanitizado[:31]
    nome = base
    contador = 2
    while nome.casefold() in usados:
        sufixo = f" ({contador})"
        nome = base[: 31 - len(sufixo)] + sufixo
        contador += 1
    usados.add(nome.casefold())
    return nome


def _estilizar_cabecalho_excel(planilha: Worksheet, linha: int, num_colunas: int) -> None:
    preenchimento = PatternFill(start_color=_COR_PRIMARIA_HEX, end_color=_COR_PRIMARIA_HEX, fill_type="solid")
    fonte = Font(color="FFFFFF", bold=True)
    for coluna in range(1, num_colunas + 1):
        celula = planilha.cell(row=linha, column=coluna)
        celula.fill = preenchimento
        celula.font = fonte
        celula.alignment = Alignment(vertical="center", wrap_text=True)


def _ajustar_larguras_e_wrap_excel(
    planilha: Worksheet, num_colunas: int, primeira_linha: int, ultima_linha: int
) -> None:
    """Largura por conteúdo real (nunca o padrão do Excel, ~8.43 — a causa
    direta do truncamento visual relatado), com teto de
    `_LARGURA_MAXIMA_COLUNA_EXCEL` — colunas com texto mais longo que isso
    quebram linha (`wrap_text`) em vez de alargar sem limite, e a altura
    da linha é ajustada para acomodar o texto quebrado (openpyxl nunca
    calcula altura de linha automaticamente a partir de `wrap_text` —
    sem isso, o texto continuaria visualmente cortado dentro da célula,
    mesmo com a largura correta)."""
    maior_texto_por_coluna: dict[int, int] = {}
    for linha_idx in range(primeira_linha, ultima_linha + 1):
        maior_da_linha = 0
        for coluna in range(1, num_colunas + 1):
            valor = planilha.cell(row=linha_idx, column=coluna).value
            comprimento = len(str(valor)) if valor is not None else 0
            maior_texto_por_coluna[coluna] = max(maior_texto_por_coluna.get(coluna, 0), comprimento)
            maior_da_linha = max(maior_da_linha, comprimento)
        if maior_da_linha > _LARGURA_MAXIMA_COLUNA_EXCEL:
            linhas_estimadas = -(-maior_da_linha // _CARACTERES_POR_LINHA_ALTURA)  # ceil
            planilha.row_dimensions[linha_idx].height = max(15, 15 * linhas_estimadas)

    for coluna, maior in maior_texto_por_coluna.items():
        letra = get_column_letter(coluna)
        largura = max(_LARGURA_MINIMA_COLUNA_EXCEL, min(maior + 2, _LARGURA_MAXIMA_COLUNA_EXCEL))
        planilha.column_dimensions[letra].width = largura
        if maior > _LARGURA_MAXIMA_COLUNA_EXCEL:
            for linha_idx in range(primeira_linha, ultima_linha + 1):
                planilha.cell(row=linha_idx, column=coluna).alignment = Alignment(
                    wrap_text=True, vertical="top", horizontal="left"
                )


def _escrever_titulo_e_resumo_excel(
    planilha: Worksheet, tipo: str, filtros: FiltrosDiaria, indicadores: Indicadores, agora: datetime, sincronizado_em: str
) -> int:
    planilha.cell(row=1, column=1, value=f"Relatório {_TIPO_ROTULO[tipo]} — Central Analítica").font = Font(
        bold=True, size=14, color=_COR_PRIMARIA_HEX
    )
    planilha.cell(row=2, column=1, value=_resumo_filtros(filtros))
    planilha.cell(
        row=3,
        column=1,
        value=(
            f"Recorte: {_formatar_inteiro(indicadores.total_diarias)} diária(s), "
            f"{_formatar_inteiro(indicadores.total_servidores)} servidor(es)"
        ),
    )
    planilha.cell(row=4, column=1, value=f"Gerado em {agora.strftime('%d/%m/%Y %H:%M:%S')}")
    planilha.cell(row=5, column=1, value=f"Última sincronização: {sincronizado_em}")
    for linha in range(2, 6):
        planilha.cell(row=linha, column=1).font = Font(size=9, color="475569")
    return 7  # próxima linha livre, com uma linha em branco de respiro


def _escrever_indicadores_excel(planilha: Worksheet, indicadores: Indicadores, linha_inicial: int) -> None:
    planilha.cell(row=linha_inicial, column=1, value="Indicadores").font = Font(bold=True, size=12)
    linha = linha_inicial + 1
    itens: list[tuple[str, object, str | None]] = [
        ("Total de diárias", indicadores.total_diarias, _FORMATO_INTEIRO_BR),
        ("Total de servidores", indicadores.total_servidores, _FORMATO_INTEIRO_BR),
        ("Valor total", indicadores.valor_total, _FORMATO_MOEDA_BR),
        ("Valor médio", indicadores.valor_medio, _FORMATO_MOEDA_BR),
    ]
    _estilizar_cabecalho_excel(planilha, linha, 2)
    planilha.cell(row=linha, column=1, value="Indicador")
    planilha.cell(row=linha, column=2, value="Valor")
    for rotulo, valor, formato in itens:
        linha += 1
        planilha.cell(row=linha, column=1, value=rotulo)
        celula_valor = planilha.cell(row=linha, column=2, value=valor)
        if valor is None:
            celula_valor.value = "—"
        elif formato:
            celula_valor.number_format = formato
        celula_valor.alignment = Alignment(horizontal="right")
    _ajustar_larguras_e_wrap_excel(planilha, 2, linha_inicial + 1, linha)


def _escrever_distribuicao_excel(planilha: Worksheet, distribuicao: Distribuicao) -> None:
    cabecalho = ["Categoria", "Diárias", "Valor"]
    linha_cabecalho = 1
    for coluna, texto in enumerate(cabecalho, start=1):
        planilha.cell(row=linha_cabecalho, column=coluna, value=texto)
    _estilizar_cabecalho_excel(planilha, linha_cabecalho, len(cabecalho))

    linha = linha_cabecalho
    for ponto in distribuicao.pontos:
        linha += 1
        rotulo = _formatar_periodo(ponto.rotulo) if distribuicao.dimensao == "periodo" else ponto.rotulo
        planilha.cell(row=linha, column=1, value=rotulo)
        celula_contagem = planilha.cell(row=linha, column=2, value=ponto.contagem)
        celula_contagem.number_format = _FORMATO_INTEIRO_BR
        celula_contagem.alignment = Alignment(horizontal="right")
        celula_valor = planilha.cell(row=linha, column=3, value=ponto.valor if ponto.valor is not None else "—")
        if ponto.valor is not None:
            celula_valor.number_format = _FORMATO_MOEDA_BR
        celula_valor.alignment = Alignment(horizontal="right")

    if linha > linha_cabecalho:
        _criar_tabela_estruturada(planilha, "Distribuicao", len(cabecalho), linha_cabecalho, linha)
    _ajustar_larguras_e_wrap_excel(planilha, len(cabecalho), linha_cabecalho + 1, max(linha, linha_cabecalho + 1))
    planilha.freeze_panes = planilha.cell(row=linha_cabecalho + 1, column=1).coordinate


def _criar_tabela_estruturada(planilha: Worksheet, nome_base: str, num_colunas: int, linha_cabecalho: int, ultima_linha: int) -> None:
    """`openpyxl.worksheet.table.Table` — "tabela estruturada" real do
    Excel: dá autofiltro E linhas alternadas (bandas) de uma vez só, sem
    precisar aplicar `PatternFill` linha a linha manualmente. Nome precisa
    ser único na pasta de trabalho inteira (não só na aba) e sem espaços —
    por isso o sufixo com `id(planilha)`."""
    referencia = f"A{linha_cabecalho}:{get_column_letter(num_colunas)}{ultima_linha}"
    tabela = TabelaExcelEstruturada(displayName=f"{nome_base}{abs(id(planilha)) % 100000}", ref=referencia)
    tabela.tableStyleInfo = TableStyleInfo(
        name="TableStyleMedium2", showRowStripes=True, showFirstColumn=False, showLastColumn=False
    )
    planilha.add_table(tabela)


def _escrever_tabela_registros_excel(planilha: Worksheet, registros: list[RegistroAnalitico]) -> None:
    cabecalho = ["SEI", "Período Inicial", "Período Final", "Servidor", "CPF", "Destino", "Motivo", "Valor"]
    for coluna, texto in enumerate(cabecalho, start=1):
        planilha.cell(row=1, column=coluna, value=texto)
    _estilizar_cabecalho_excel(planilha, 1, len(cabecalho))

    linha = 1
    for registro in registros:
        linha += 1
        servidor_nome = registro.servidor.nome if registro.servidor is not None else "Servidor sem cadastro"
        valores = [
            registro.sei,
            registro.periodo_inicial,
            registro.periodo_final,
            servidor_nome,
            mascarar_cpf(registro.cpf) or "—",
            registro.cidade_destino or "—",
            registro.motivo,
            registro.valor_total_diarias if registro.valor_total_diarias is not None else "—",
        ]
        for coluna, valor in enumerate(valores, start=1):
            celula = planilha.cell(row=linha, column=coluna, value=valor)
            if coluna in (2, 3):
                celula.number_format = _FORMATO_DATA_BR
                celula.alignment = Alignment(horizontal="center")
            elif coluna == 8 and registro.valor_total_diarias is not None:
                celula.number_format = _FORMATO_MOEDA_BR
                celula.alignment = Alignment(horizontal="right")

    if linha > 1:
        _criar_tabela_estruturada(planilha, "Registros", len(cabecalho), 1, linha)
    _ajustar_larguras_e_wrap_excel(planilha, len(cabecalho), 2, max(linha, 2))
    planilha.freeze_panes = "A2"
    planilha.column_dimensions[get_column_letter(2)].width = max(
        planilha.column_dimensions[get_column_letter(2)].width or 0, 14
    )
    planilha.column_dimensions[get_column_letter(3)].width = max(
        planilha.column_dimensions[get_column_letter(3)].width or 0, 14
    )


def _escrever_excel(
    caminho: Path,
    conteudo: ConteudoRelatorio,
    parametros: ParametrosRelatorio,
    filtros: FiltrosDiaria,
    sincronizado_em: str,
    agora: datetime,
) -> None:
    """Correção de 2026-08-05 (Bloco de Refinamento): uma aba por seção
    (Resumo/Indicadores, uma por distribuição, Tabela do recorte) — nunca
    tudo empilhado numa aba só. `freeze_panes`/autofiltro/congelamento só
    fazem sentido por aba (congelar o cabeçalho da 1ª tabela não deveria
    continuar fixo ao rolar até uma tabela completamente diferente mais
    abaixo). Valores nativos (número/data), nunca texto pré-formatado —
    a planilha continua somável/filtrável sem o usuário precisar converter
    nada manualmente. Não altera nenhum dado nem cálculo: os mesmos
    `Indicadores`/`Distribuicao`/`RegistroAnalitico` já calculados por
    `compor_relatorio`, só a apresentação muda."""
    workbook = Workbook()
    nomes_usados: set[str] = set()

    aba_resumo = workbook.active
    aba_resumo.title = _nome_aba_excel("Resumo", nomes_usados)
    proxima_linha = _escrever_titulo_e_resumo_excel(
        aba_resumo, conteudo.tipo, filtros, conteudo.indicadores, agora, sincronizado_em
    )
    if parametros.incluir_indicadores:
        _escrever_indicadores_excel(aba_resumo, conteudo.indicadores, proxima_linha)
    aba_resumo.column_dimensions["A"].width = 70
    aba_resumo.sheet_view.showGridLines = False

    if parametros.incluir_graficos:
        for distribuicao in conteudo.distribuicoes:
            aba = workbook.create_sheet(_nome_aba_excel(_ROTULO_DIMENSAO[distribuicao.dimensao], nomes_usados))
            _escrever_distribuicao_excel(aba, distribuicao)

    if parametros.incluir_tabela and conteudo.tipo in TIPOS_COM_TABELA:
        aba = workbook.create_sheet(_nome_aba_excel("Tabela do recorte", nomes_usados))
        _escrever_tabela_registros_excel(aba, conteudo.registros)

    workbook.save(caminho)


_MARGEM_PDF = 2 * cm
_MARGEM_INFERIOR_PDF = 2.4 * cm  # espaço extra para o rodapé não colidir com o conteúdo
_LARGURA_UTIL_PDF = A4[0] - 2 * _MARGEM_PDF

# Larguras por seção — somam exatamente `_LARGURA_UTIL_PDF` (17cm em A4 com
# margens de 2cm), calibradas para o conteúdo real de cada tipo de tabela.
# CPF mascarado ("***.***.***-NN") e Valor ("R$ X.XXX,XX") são formatos
# curtos e de tamanho previsível — recebem largura suficiente para nunca
# quebrar linha (quebrar um valor monetário ou um CPF no meio é mais
# confuso do que quebrar texto livre). Servidor/Destino/Motivo são texto
# livre e QUEBRAM via `Paragraph` normalmente — nunca vazam para fora da
# página. "Tabela do recorte" mostra o período como um único intervalo
# textual ("dd/mm/aaaa a dd/mm/aaaa"), diferente do Excel (que usa datas
# nativas em duas colunas separadas para permitir ordenar/filtrar por
# data no próprio Excel).
_LARGURAS_TABELA_REGISTROS_CM = [3.0, 2.2, 2.6, 2.6, 2.0, 2.4, 2.2]
_LARGURAS_DISTRIBUICAO_CM = [9.0, 3.0, 5.0]
_LARGURAS_DISTRIBUICAO_SEM_VALOR_CM = [12.0, 5.0]


def _estilos_pdf() -> dict[str, ParagraphStyle]:
    """Nova folha de estilos a cada chamada (`getSampleStyleSheet()` já
    devolve uma instância nova) — nunca reaproveitada entre chamadas, para
    não haver risco de registrar o mesmo nome de estilo duas vezes."""
    base = getSampleStyleSheet()
    estilos = {
        "titulo": ParagraphStyle(
            "TituloRelatorio", parent=base["Title"], textColor=colors.HexColor(f"#{_COR_PRIMARIA_HEX}"),
            fontSize=18, spaceAfter=2, keepWithNext=True,
        ),
        "subtitulo": ParagraphStyle(
            "SubtituloRelatorio", parent=base["Normal"], textColor=colors.HexColor("#475569"), fontSize=9,
        ),
        "secao": ParagraphStyle(
            "TituloSecao", parent=base["Heading2"], textColor=colors.HexColor(f"#{_COR_PRIMARIA_HEX}"),
            fontSize=12, spaceBefore=4, spaceAfter=6, keepWithNext=True,
        ),
        "celula_cabecalho": ParagraphStyle(
            "CelulaCabecalho", parent=base["Normal"], textColor=colors.white, fontSize=8.5, leading=10.5,
        ),
        "celula": ParagraphStyle("Celula", parent=base["Normal"], fontSize=8.5, leading=10.5),
        "celula_direita": ParagraphStyle(
            "CelulaDireita", parent=base["Normal"], fontSize=8.5, leading=10.5, alignment=TA_RIGHT,
        ),
        "kpi_valor": ParagraphStyle(
            "KpiValor", parent=base["Normal"], fontSize=15, leading=18,
            alignment=TA_CENTER, textColor=colors.HexColor(f"#{_COR_PRIMARIA_HEX}"),
        ),
        "kpi_rotulo": ParagraphStyle(
            "KpiRotulo", parent=base["Normal"], fontSize=8, leading=10, alignment=TA_CENTER,
            textColor=colors.HexColor("#475569"),
        ),
        "vazio": ParagraphStyle("SemDados", parent=base["Normal"], fontSize=9, textColor=colors.HexColor("#64748B")),
        # Sprint 21.9 — linha de insight (texto corrido, não célula de
        # tabela nem legenda cinza) — usada só na seção "Insights" do PDF
        # de `tipo="visao_executiva"`.
        "insight": ParagraphStyle(
            "Insight", parent=base["Normal"], fontSize=9.5, leading=13,
            textColor=colors.HexColor("#1E293B"), spaceAfter=4,
        ),
    }
    return estilos


def _cel(texto: object, estilo: ParagraphStyle) -> Paragraph:
    """Toda célula de tabela do PDF vira `Paragraph` (nunca string crua) —
    é o que faz o reportlab quebrar texto longo dentro da largura da
    coluna em vez de estourar a página (causa raiz confirmada do "conteúdo
    cortado": `Table` com células de texto puro nunca quebra linha,
    só encolhe a fonte até caber ou deixa vazar). `escape` evita que um
    caractere como `&`/`<` dentro de um Motivo real quebre o parser XML
    interno do reportlab."""
    return Paragraph(_escapar_xml(str(texto)), estilo)


def _tabela_pdf(
    cabecalho: list[str],
    linhas: list[list[object]],
    larguras_cm: list[float],
    estilos: dict,
    colunas_direita: frozenset[int] = frozenset(),
) -> Table:
    """`colunas_direita` (índices 0-based) alinha à direita — convenção
    padrão para colunas numéricas/monetárias (`Diárias`/`Valor`), nunca
    aplicada a texto livre."""
    larguras = [c * cm for c in larguras_cm]
    linha_cabecalho = [_cel(texto, estilos["celula_cabecalho"]) for texto in cabecalho]
    corpo = [
        [
            _cel(valor, estilos["celula_direita"] if indice in colunas_direita else estilos["celula"])
            for indice, valor in enumerate(linha)
        ]
        for linha in linhas
    ]
    tabela = Table([linha_cabecalho] + corpo, colWidths=larguras, repeatRows=1)
    tabela.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(f"#{_COR_PRIMARIA_HEX}")),
                ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor(f"#{_COR_BORDA_HEX}")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor(f"#{_COR_LINHA_ALTERNADA_HEX}")]),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("LEFTPADDING", (0, 0), (-1, -1), 5),
                ("RIGHTPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    return tabela


def _cartoes_kpi_pdf(indicadores: Indicadores, estilos: dict) -> Table:
    """"Indicadores em destaque" — 4 cartões lado a lado (valor grande +
    rótulo pequeno), em vez da antiga tabela de 2 colunas genérica, igual
    a qualquer outra tabela do relatório."""
    itens = [
        ("Total de diárias", _formatar_inteiro(indicadores.total_diarias)),
        ("Total de servidores", _formatar_inteiro(indicadores.total_servidores)),
        ("Valor total", _formatar_moeda(indicadores.valor_total)),
        ("Valor médio", _formatar_moeda(indicadores.valor_medio)),
    ]
    largura_cartao = _LARGURA_UTIL_PDF / len(itens)
    linha_valor = [_cel(valor, estilos["kpi_valor"]) for _, valor in itens]
    linha_rotulo = [_cel(rotulo, estilos["kpi_rotulo"]) for rotulo, _ in itens]
    tabela = Table([linha_valor, linha_rotulo], colWidths=[largura_cartao] * len(itens))
    tabela.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#E2E8F0")),
                ("BOX", (0, 0), (-1, -1), 0.6, colors.HexColor(f"#{_COR_BORDA_HEX}")),
                ("INNERGRID", (0, 0), (-1, -1), 0.6, colors.white),
                ("TOPPADDING", (0, 0), (-1, 0), 10),
                ("BOTTOMPADDING", (0, 0), (-1, 0), 2),
                ("TOPPADDING", (0, 1), (-1, 1), 0),
                ("BOTTOMPADDING", (0, 1), (-1, 1), 10),
            ]
        )
    )
    return tabela


class _CanvasComRodape(Canvas):
    """Recipe padrão do reportlab para rodapé com "Página N de M" — precisa
    de duas passadas (só se sabe o total de páginas depois que o documento
    inteiro já foi montado), por isso os estados de página ficam em buffer
    (`_paginas_pendentes`) e o rodapé só é desenhado em `save()`."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._paginas_pendentes: list[dict] = []

    def showPage(self) -> None:
        self._paginas_pendentes.append(dict(self.__dict__))
        self._startPage()

    def save(self) -> None:
        total = len(self._paginas_pendentes)
        for estado in self._paginas_pendentes:
            self.__dict__.update(estado)
            self._desenhar_rodape(total)
            super().showPage()
        super().save()

    def _desenhar_rodape(self, total_paginas: int) -> None:
        largura_pagina, _ = A4
        self.setStrokeColor(colors.HexColor(f"#{_COR_BORDA_HEX}"))
        self.setLineWidth(0.5)
        self.line(_MARGEM_PDF, 1.5 * cm, largura_pagina - _MARGEM_PDF, 1.5 * cm)
        self.setFont("Helvetica", 8)
        self.setFillColor(colors.HexColor("#64748B"))
        self.drawString(_MARGEM_PDF, 1.0 * cm, "Automatizador de Diárias — Central Analítica")
        self.drawRightString(
            largura_pagina - _MARGEM_PDF, 1.0 * cm, f"Página {self.getPageNumber()} de {total_paginas}"
        )


def _escrever_pdf(
    caminho: Path,
    tipo: str,
    conteudo: ConteudoRelatorio,
    parametros: ParametrosRelatorio,
    filtros: FiltrosDiaria,
    sincronizado_em: str,
    agora: datetime,
) -> None:
    """Correção de 2026-08-05 (Bloco de Refinamento) — reescrita completa
    da apresentação, sem alterar nenhum dado/cálculo (mesmos `Indicadores`/
    `Distribuicao`/`RegistroAnalitico` de `compor_relatorio`):

    - Cada tabela usa `colWidths` explícitos que somam exatamente a largura
      útil da página A4 (`_LARGURA_UTIL_PDF`) e células `Paragraph` (nunca
      texto cru) — a causa raiz confirmada do "conteúdo cortado"/"tabela
      maior que a página" era a ausência total de largura de coluna:
      reportlab desenhava a tabela no tamanho natural do texto (que para 7
      colunas com nomes/motivos longos passava de 990pt, quase o dobro dos
      ~482pt úteis de uma página A4), sem quebrar linha nenhuma.
    - `repeatRows=1` (já existia) continua repetindo o cabeçalho em cada
      página nova.
    - Indicadores viram cartões em destaque (`_cartoes_kpi_pdf`), não mais
      uma tabela genérica de 2 colunas igual às demais.
    - Rodapé com "Página N de M" via `_CanvasComRodape` (não existia antes).
    - Ainda sem seção "Gráficos" (regra já homologada, `schemas.analitica.
      ParametrosRelatorioQuery._graficos_apenas_em_pdf`) — cada distribuição
      continua virando uma tabela, equivalente textual obrigatório
      (`v2-demonstracao-visual.md § 6`)."""
    documento = SimpleDocTemplate(
        str(caminho),
        pagesize=A4,
        leftMargin=_MARGEM_PDF,
        rightMargin=_MARGEM_PDF,
        topMargin=_MARGEM_PDF,
        bottomMargin=_MARGEM_INFERIOR_PDF,
        title=f"Relatório {_TIPO_ROTULO[tipo]} — Central Analítica",
    )
    estilos = _estilos_pdf()
    elementos: list = [
        Paragraph(f"Relatório {_TIPO_ROTULO[tipo]} — Central Analítica", estilos["titulo"]),
        Paragraph(_escapar_xml(_resumo_filtros(filtros)), estilos["subtitulo"]),
        Paragraph(
            _escapar_xml(
                f"Recorte: {_formatar_inteiro(conteudo.indicadores.total_diarias)} diária(s), "
                f"{_formatar_inteiro(conteudo.indicadores.total_servidores)} servidor(es) — "
                f"gerado em {agora.strftime('%d/%m/%Y %H:%M:%S')}"
            ),
            estilos["subtitulo"],
        ),
        Spacer(1, 0.5 * cm),
    ]

    if parametros.incluir_indicadores:
        elementos.append(Paragraph("Indicadores", estilos["secao"]))
        elementos.append(_cartoes_kpi_pdf(conteudo.indicadores, estilos))
        elementos.append(Spacer(1, 0.6 * cm))

    if parametros.incluir_graficos:
        for distribuicao in conteudo.distribuicoes:
            elementos.append(Paragraph(_ROTULO_DIMENSAO[distribuicao.dimensao], estilos["secao"]))
            if not distribuicao.pontos:
                elementos.append(Paragraph("Sem dados para este recorte.", estilos["vazio"]))
            else:
                tem_valor = any(ponto.valor is not None for ponto in distribuicao.pontos)
                cabecalho = ["Categoria", "Diárias", "Valor"] if tem_valor else ["Categoria", "Diárias"]
                larguras = _LARGURAS_DISTRIBUICAO_CM if tem_valor else _LARGURAS_DISTRIBUICAO_SEM_VALOR_CM
                linhas = _linhas_distribuicao(distribuicao)
                if not tem_valor:
                    linhas = [linha[:2] for linha in linhas]
                colunas_direita = frozenset({1, 2}) if tem_valor else frozenset({1})
                elementos.append(_tabela_pdf(cabecalho, linhas, larguras, estilos, colunas_direita))
            elementos.append(Spacer(1, 0.5 * cm))

    incluir_secao_tabela = parametros.incluir_tabela and conteudo.tipo in TIPOS_COM_TABELA
    if incluir_secao_tabela:
        elementos.append(Paragraph("Tabela do recorte", estilos["secao"]))
        if not conteudo.registros:
            elementos.append(Paragraph("Sem dados para este recorte.", estilos["vazio"]))
        else:
            cabecalho = ["SEI", "Período", "Servidor", "CPF", "Destino", "Motivo", "Valor"]
            elementos.append(
                _tabela_pdf(
                    cabecalho,
                    _linhas_registros(conteudo.registros),
                    _LARGURAS_TABELA_REGISTROS_CM,
                    estilos,
                    frozenset({6}),
                )
            )
        elementos.append(Spacer(1, 0.5 * cm))

    # Sprint 21.9 (Modo Executivo) — só quando o cliente enviou insights
    # (hoje, só o botão "Exportar" do Modo Executivo envia; qualquer outro
    # chamador de `POST /relatorios` continua sem esta seção, comportamento
    # idêntico ao de antes desta Sprint). Cada string já vem pronta —
    # nunca recalculada aqui, só escapada para XML (mesmo tratamento já
    # dado a `_resumo_filtros`) e prefixada com um marcador visual.
    if parametros.insights:
        elementos.append(Paragraph("Insights", estilos["secao"]))
        for texto_insight in parametros.insights:
            elementos.append(Paragraph(f"• {_escapar_xml(texto_insight)}", estilos["insight"]))
        elementos.append(Spacer(1, 0.5 * cm))

    if (
        not parametros.incluir_indicadores
        and not parametros.incluir_graficos
        and not incluir_secao_tabela
        and not parametros.insights
    ):
        elementos.append(Paragraph("Nenhuma seção selecionada para este relatório.", estilos["vazio"]))

    elementos.append(Paragraph(f"Última sincronização: {sincronizado_em}", estilos["subtitulo"]))

    documento.build(elementos, canvasmaker=_CanvasComRodape)


def gerar_relatorio(filtros: FiltrosDiaria, parametros: ParametrosRelatorio) -> RelatorioGerado:
    """`POST /relatorios` (Sprint 19.7.2, `v2-plano-tecnico.md § 12.6`).
    Reaproveita a mesma consulta de recorte inteiro de
    `calcular_indicadores`/`calcular_distribuicoes`
    (`repositorio_analitico.agregar_indicadores`, nunca uma 2ª consulta) e
    delega a composição por tipo a `app.domain.analitica.relatorios.
    compor_relatorio` (19.7.1) — esta função nunca calcula KPI/distribuição
    nenhum diretamente, só orquestra e escreve o arquivo físico.

    Decisão desta Sprint sobre `modo`: `"previsualizacao"` e `"final"`
    produzem exatamente o mesmo artefato, no mesmo caminho temporário —
    nenhum documento homologado define um payload de prévia diferente do
    artefato final (`§ 12.6` só declara UM formato de resposta,
    `RelatorioGeradoResposta`); "não grava nada em disco além do
    necessário para a prévia" (critério de aceite) é satisfeito por
    construção, já que nenhum dos dois modos escreve nada "a mais" que o
    outro. A diferença de UX entre pré-visualizar e gerar (§ 11.2) fica
    inteiramente do lado do frontend: só o modo `"final"` aciona o IPC
    `relatorio:salvar-como` depois (19.7.3/19.7.4/19.7.5, fora desta
    função)."""
    if parametros.tipo in _TIPOS_RELATORIO_INDISPONIVEIS:
        raise TipoRelatorioIndisponivel(
            f'O tipo de relatório "{parametros.tipo}" depende do catálogo de diagnósticos '
            "(Sprint 19.8), ainda não implementado."
        )
    tipo_disponivel = cast(relatorios_dominio.TipoRelatorio, parametros.tipo)

    filtros_repositorio = repositorio_analitico.FiltrosDiaria(
        q=filtros.q,
        sei=filtros.sei,
        cpf=filtros.cpf,
        servidor_nome=filtros.servidor_nome,
        servidor_matricula=filtros.servidor_matricula,
        municipio=filtros.municipio,
        motivo=filtros.motivo,
        situacao=filtros.situacao,
        periodo_inicial=filtros.periodo_inicial,
        periodo_final=filtros.periodo_final,
        origem=filtros.origem,
        destino=filtros.destino,
        trecho=filtros.trecho,
        valor_minimo=filtros.valor_minimo,
        valor_maximo=filtros.valor_maximo,
        categoria_funcional=filtros.categoria_funcional,
    )

    caminho_sqlite = base_local_sqlite.caminho_base_local_sqlite()
    try:
        registros = repositorio_analitico.agregar_indicadores(caminho_sqlite, filtros_repositorio)
        sincronizacao = repositorio_analitico.ultima_sincronizacao(caminho_sqlite)
    except sqlite3.Error as erro:
        raise BaseAnaliticaIndisponivel(_MENSAGEM_BASE_INDISPONIVEL) from erro

    conteudo = relatorios_dominio.compor_relatorio(registros, tipo_disponivel)

    agora = datetime.now()
    nome_sugerido = _nome_sugerido(parametros.tipo, parametros.formato, agora)
    extensao = _EXTENSAO_POR_FORMATO[parametros.formato]
    caminho = _pasta_temporaria_relatorios() / f"{uuid.uuid4().hex}.{extensao}"

    if parametros.formato == "pdf":
        _escrever_pdf(caminho, tipo_disponivel, conteudo, parametros, filtros, sincronizacao.sincronizado_em, agora)
    elif parametros.formato == "excel":
        _escrever_excel(caminho, conteudo, parametros, filtros, sincronizacao.sincronizado_em, agora)
    else:
        secoes = _construir_secoes(conteudo, parametros)
        _escrever_csv(caminho, secoes, sincronizacao.sincronizado_em, agora)

    return RelatorioGerado(
        caminho_arquivo_temporario=str(caminho),
        nome_sugerido=nome_sugerido,
        sincronizado_em=sincronizacao.sincronizado_em,
    )


def obter_opcoes_filtro() -> OpcoesFiltro:
    """Sprint 17.4.5 — resolve o caminho da Base Local em SQLite e delega
    a `repositorio_analitico.opcoes_filtro`. Sem parâmetro de entrada e
    sem carimbo de sincronização embutido (contrato aprovado, Fase 4 —
    "Opções de Filtro" não inclui `sincronizacao`, diferente de
    `ResultadoPesquisa`/`ResultadoDetalhamento`), então não há tipo a
    traduzir na fronteira: `OpcoesFiltro` do repositório é reaproveitada
    diretamente como tipo de retorno, mesmo padrão já usado para
    `PaginaDeRegistros`/`InfoSincronizacaoResumida`."""
    caminho_sqlite = base_local_sqlite.caminho_base_local_sqlite()
    try:
        return repositorio_analitico.opcoes_filtro(caminho_sqlite)
    except sqlite3.Error as erro:
        raise BaseAnaliticaIndisponivel(_MENSAGEM_BASE_INDISPONIVEL) from erro


def listar_avisos_sincronizacao(paginacao: ParametrosPaginacao) -> PaginaDeAvisos:
    """`GET /sincronizacao/avisos` (Sprint 17.4.6) — sem tipo de entrada
    complexo construído pela API além da paginação já existente
    (`ParametrosPaginacao`, reaproveitada sem duplicata), `PaginaDeAvisos`
    do repositório é devolvida diretamente, mesmo padrão de
    `obter_opcoes_filtro`. "Nunca sincronizado" (arquivo ausente) vira
    `BaseAnaliticaIndisponivel` (`503`) aqui — decisão confirmada da
    17.4.6, diferente de `estado_sincronizacao`, onde o caso análogo é
    `status="nunca_sincronizado"` (`200`, estado de negócio válido)."""
    caminho_sqlite = base_local_sqlite.caminho_base_local_sqlite()
    paginacao_repositorio = repositorio_analitico.ParametrosPaginacao(
        pagina=paginacao.pagina, tamanho_pagina=paginacao.tamanho_pagina
    )
    try:
        return repositorio_analitico.avisos_paginados(caminho_sqlite, paginacao_repositorio)
    except sqlite3.Error as erro:
        raise BaseAnaliticaIndisponivel(_MENSAGEM_BASE_INDISPONIVEL) from erro


def estado_sincronizacao() -> EstadoSincronizacao:
    """`GET /sincronizacao` (Sprint 17.4.6). `base_local_sqlite.
    ultimo_sinal_frescor` devolvendo `None` distingue "nunca sincronizado"
    (arquivo `.sqlite` ausente — estado de negócio válido, `200`) de
    "arquivo existe mas está corrompido" (levanta `sqlite3.Error`, `503`)
    — mesma função escrita na Sprint 17.3 especificamente para este uso.

    `possivelmente_desatualizado` é sempre `true` quando não é possível
    provar frescor (RN-E) — a comparação ao vivo captura qualquer exceção
    (não só `PlanilhaOficialIndisponivel`/`OSError`: também erros de
    leitura da planilha em si, ex. aba esperada ausente) e nunca a deixa
    propagar; esta rota nunca retorna `422`, só `GET /sincronizacao/avisos`
    e `POST /sincronizacao` fazem isso."""
    caminho_sqlite = base_local_sqlite.caminho_base_local_sqlite()
    try:
        sinal_registrado = base_local_sqlite.ultimo_sinal_frescor(caminho_sqlite)
    except sqlite3.Error as erro:
        raise BaseAnaliticaIndisponivel(_MENSAGEM_BASE_INDISPONIVEL) from erro

    if sinal_registrado is None:
        return EstadoSincronizacao(
            sincronizado_em=None,
            origem=None,
            possivelmente_desatualizado=True,
            total_avisos=0,
            status="nunca_sincronizado",
        )

    try:
        info = repositorio_analitico.estado_sincronizacao_registrado(caminho_sqlite)
    except sqlite3.Error as erro:
        raise BaseAnaliticaIndisponivel(_MENSAGEM_BASE_INDISPONIVEL) from erro

    try:
        caminho_planilha = configuracao_app.resolver_caminho_para_preenchimento()
        sinal_atual = base_local_sqlite.capturar_sinal_frescor(caminho_planilha)
        desatualizado = base_local_sqlite.sinal_mudou(sinal_atual, sinal_registrado)
    except Exception:
        # RN-E — nunca assumir frescor sem conseguir provar. Deliberadamente
        # amplo (não só PlanilhaOficialIndisponivel/OSError): qualquer falha
        # nesta comparação ao vivo (ex. a planilha configurada perdeu uma
        # aba esperada entre a validação estrutural e agora) não pode
        # derrubar GET /sincronizacao — o estado registrado (já lido acima)
        # continua a resposta correta, só com o sinal mais conservador.
        #
        # Logging (Sprint 17.4.6.1, achado da auditoria da 17.4.6): nível
        # WARNING, não ERROR/`.exception()` — este bloco cobre tanto
        # condições comuns e esperadas (planilha oficial ainda não
        # configurada, jornada J7 da UX) quanto falhas genuinamente
        # inesperadas; `exc_info=True` preserva o traceback completo para
        # diagnóstico em ambos os casos, sem tratar o caso comum como um
        # erro de aplicação. Limitado a este sub-bloco — nenhum outro
        # tratamento de erro desta função (ou de qualquer outra) muda.
        _logger.warning(
            "Não foi possível comparar o frescor da Base Local com a Planilha Oficial "
            "atual — respondendo possivelmente_desatualizado=true por segurança (RN-E).",
            exc_info=True,
        )
        desatualizado = True

    # Sprint 19.9 (achado da auditoria — Electron real + Planilha Oficial
    # real): eixo de frescor independente do sinal de conteúdo acima —
    # `PRAGMA user_version` do `.sqlite` pode estar desatualizado mesmo
    # quando a Planilha Oficial não mudou (ex.: instalação que nunca rodou
    # "Sincronizar agora" desde uma mudança de schema no código). Tratado
    # como o mesmo estado de negócio "possivelmente_desatualizado" já
    # homologado — nenhum estado novo de UI, só mais um motivo de acionar o
    # botão "Sincronizar agora" que já existe. Mesma disciplina RN-E: uma
    # falha ao verificar não pode assumir frescor.
    try:
        if base_local_sqlite.esquema_desatualizado(caminho_sqlite):
            desatualizado = True
    except sqlite3.Error:
        _logger.warning(
            "Não foi possível verificar a versão do schema da Base Local — respondendo "
            "possivelmente_desatualizado=true por segurança (RN-E).",
            exc_info=True,
        )
        desatualizado = True

    # 2026-08-06 (achado real — build empacotado desatualizado): 3º eixo de
    # frescor, independente dos dois acima — a versão do Electron que
    # disparou a sincronização mais recente (`sincronizacoes.versao_app`,
    # lida por `versao_app_registrada` — deliberadamente isolada de
    # `estado_sincronizacao_registrado` acima, ver a docstring daquela
    # função: colocar `versao_app` no SELECT compartilhado quebraria a
    # garantia de leitura segura de QUALQUER endpoint contra um `.sqlite`
    # de versão de schema anterior, não só este) comparada com a versão do
    # Electron rodando agora. Cobre exatamente o cenário que os outros dois
    # eixos não cobrem: o usuário atualiza para uma versão nova do app
    # (instalador novo), mas a Planilha Oficial e o formato das tabelas
    # continuam idênticos — sem este eixo, a Central Analítica seguia
    # respondendo "atualizado" usando a lógica de importação da versão
    # ANTERIOR, silenciosamente. Só compara quando a versão atual é
    # conhecida (Electron de verdade, nunca backend standalone/dev/teste
    # sem essa variável) — ausência nunca é tratada como divergência, só
    # ausência mesmo (RN-E não se aplica à ausência da variável de
    # ambiente — não é uma falha ao verificar, é a informação genuinamente
    # não existir; mas UMA falha real de leitura, ex. arquivo corrompido no
    # meio da checagem, segue a mesma disciplina RN-E das duas acima).
    versao_app_atual = os.environ.get(base_local.VAR_AMBIENTE_VERSAO_APP, "")
    if versao_app_atual:
        try:
            versao_app_gravada = repositorio_analitico.versao_app_registrada(caminho_sqlite)
        except sqlite3.Error:
            _logger.warning(
                "Não foi possível verificar a versão do app da última sincronização — "
                "respondendo possivelmente_desatualizado=true por segurança (RN-E).",
                exc_info=True,
            )
            versao_app_gravada = None
        if versao_app_atual != versao_app_gravada:
            desatualizado = True

    return EstadoSincronizacao(
        sincronizado_em=info.sincronizado_em,
        origem=info.origem,
        possivelmente_desatualizado=desatualizado,
        total_avisos=info.total_avisos,
        status="possivelmente_desatualizado" if desatualizado else "atualizado",
    )


@dataclass(frozen=True)
class _SinalFisicoArquivo:
    """Sinal sobre o **arquivo `.sqlite` em si** (existência/identidade
    física) — distinto de `base_local_sqlite.SinalFrescor`, que é sobre o
    **conteúdo da planilha fonte**. Usado só para inferir se
    `base_local.sincronizar()` substituiu `base_local.sqlite` (§ 2.2 do
    plano técnico) — `sincronizar()` não devolve essa informação, então
    qualquer detecção feita daqui é necessariamente uma inferência, nunca
    uma confirmação direta."""

    existe: bool
    inode: int | None
    tamanho: int | None
    mtime_ns: int | None


def _capturar_sinal_fisico(caminho: Path) -> _SinalFisicoArquivo:
    if not caminho.is_file():
        return _SinalFisicoArquivo(existe=False, inode=None, tamanho=None, mtime_ns=None)
    estatisticas = caminho.stat()
    return _SinalFisicoArquivo(
        existe=True, inode=estatisticas.st_ino, tamanho=estatisticas.st_size, mtime_ns=estatisticas.st_mtime_ns
    )


def _indica_substituicao(antes: _SinalFisicoArquivo, depois: _SinalFisicoArquivo) -> bool:
    """`True` só quando os sinais físicos são coerentes com uma
    substituição bem-sucedida — por excesso de cautela, nunca assume
    sucesso na dúvida (§ 2.2)."""
    if not depois.existe:
        return False
    if not antes.existe:
        return True
    return (depois.inode, depois.tamanho, depois.mtime_ns) != (antes.inode, antes.tamanho, antes.mtime_ns)


def _resumo_falha() -> ResumoExecucao:
    return ResumoExecucao(
        status="falha",
        sincronizado_em=None,
        linhas_diarias=None,
        linhas_servidores_lidos=None,
        linhas_ignoradas=None,
        total_avisos=None,
    )


def executar_sincronizacao_manual() -> ResumoExecucao:
    """`POST /sincronizacao` (Sprint 17.4.6). Sequência obrigatória (§ 5
    do plano técnico): lock não-bloqueante primeiro; `try/finally`
    envolvendo literalmente tudo que segue, para o lock nunca ficar
    travado permanentemente numa falha precoce (inclusive
    `PlanilhaOficialIndisponivel`, que propaga por este `try` antes de
    `sincronizar()` ser chamado, mapeada para `422` pela API).

    Uma exceção inesperada durante `base_local.sincronizar()` (ex. arquivo
    de origem some no meio da cópia) é capturada, logada com stack trace
    completo (`logger.exception`, nada vazado na resposta) e tratada como
    falha inferida — nunca propagada como erro HTTP. Se o sinal físico do
    `.sqlite` indicar substituição, mas a leitura subsequente da tabela
    `sincronizacoes` mesmo assim falhar, trato como `BaseAnaliticaIndisponivel`
    (`503`) — decisão confirmada: nesse cenário a Base Local pode estar
    genuinamente corrompida para todos os endpoints, não só para esta
    chamada, então reportar "falha" como resultado de negócio desta
    operação seria enganoso."""
    if not _lock_sincronizacao.acquire(blocking=False):
        raise SincronizacaoEmAndamento(_MENSAGEM_SINCRONIZACAO_EM_ANDAMENTO)
    try:
        caminho_sqlite = base_local_sqlite.caminho_base_local_sqlite()
        sinal_antes = _capturar_sinal_fisico(caminho_sqlite)

        caminho_planilha = configuracao_app.resolver_caminho_para_preenchimento()

        try:
            base_local.sincronizar(caminho_planilha, origem="manual")
        except Exception:
            _logger.exception("Falha inesperada durante sincronização manual (etapa base_local.sincronizar).")
            return _resumo_falha()

        sinal_depois = _capturar_sinal_fisico(caminho_sqlite)
        if not _indica_substituicao(sinal_antes, sinal_depois):
            return _resumo_falha()

        try:
            info = repositorio_analitico.estado_sincronizacao_registrado(caminho_sqlite)
        except sqlite3.Error as erro:
            _logger.exception(
                "Sinal físico indicou substituição, mas a leitura pós-sincronização falhou."
            )
            raise BaseAnaliticaIndisponivel(_MENSAGEM_BASE_INDISPONIVEL) from erro

        return ResumoExecucao(
            status="sucesso",
            sincronizado_em=info.sincronizado_em,
            linhas_diarias=info.linhas_diarias,
            linhas_servidores_lidos=info.linhas_servidores_lidos,
            linhas_ignoradas=info.linhas_ignoradas,
            total_avisos=info.total_avisos,
        )
    finally:
        _lock_sincronizacao.release()
