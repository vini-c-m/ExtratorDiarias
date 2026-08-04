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
import re
import sqlite3
import tempfile
import threading
import uuid
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path
from typing import Literal, cast

from openpyxl import Workbook
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.consulta import base_local, base_local_sqlite, repositorio_analitico
from app.consulta.repositorio_analitico import InfoSincronizacaoResumida, OpcoesFiltro, PaginaDeAvisos, PaginaDeRegistros
from app.domain.analitica import diagnostico as diagnostico_dominio
from app.domain.analitica import distribuicoes as distribuicoes_dominio
from app.domain.analitica import indicadores as indicadores_dominio
from app.domain.analitica import relatorios as relatorios_dominio
from app.domain.analitica.diagnostico import CasoDiagnostico, Classificacao
from app.domain.analitica.distribuicoes import Distribuicao, DimensaoDistribuicao
from app.domain.analitica.indicadores import Indicadores
from app.domain.analitica.relatorios import ConteudoRelatorio
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


_lock_sincronizacao = threading.Lock()
"""Nível de módulo — protege `executar_sincronizacao_manual` contra
chamadas concorrentes (RN-A). Suficiente porque o backend roda como
processo único (Uvicorn local, subido pelo Electron) — premissa
explícita, não uma garantia universal (§ 5 do plano técnico); deixaria
de proteger se o backend passasse a rodar com múltiplos workers."""


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


# --- Sprint 19.7.2 — POST /relatorios ----------------------------------

_TIPOS_RELATORIO_INDISPONIVEIS: frozenset[str] = frozenset({"inconsistencias", "qualidade_dados"})

_TIPO_ROTULO: dict[str, str] = {
    "executivo": "Executivo",
    "detalhado": "Detalhado",
    "financeiro": "Financeiro",
    "por_servidor": "Por servidor",
    "por_municipio": "Por município",
    "por_situacao": "Por situação",
}

_EXTENSAO_POR_FORMATO: dict[str, str] = {"pdf": "pdf", "excel": "xlsx", "csv": "csv"}

# Mesmos títulos de cartão já usados em `DashboardRecorte.tsx` (19.6.4) —
# nenhum vocabulário novo para a mesma dimensão entre Dashboard e Relatório.
_ROTULO_DIMENSAO: dict[str, str] = {
    "periodo": "Evolução por período",
    "servidor": "Ranking de servidores",
    "municipio": "Ranking de municípios",
    "motivo": "Distribuição por motivo",
    "situacao": "Distribuição por situação do servidor",
    "origem_destino": "Origem × Destino",
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
        periodo = f"{registro.periodo_inicial.isoformat()} a {registro.periodo_final.isoformat()}"
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


def _escrever_excel(caminho: Path, secoes: list[_SecaoRelatorio], sincronizado_em: str, agora: datetime) -> None:
    workbook = Workbook()
    planilha = workbook.active
    planilha.title = "Relatório"

    linha_atual = 1
    for secao in secoes:
        planilha.cell(row=linha_atual, column=1, value=secao.titulo)
        linha_atual += 1
        for coluna, texto in enumerate(secao.cabecalho, start=1):
            planilha.cell(row=linha_atual, column=coluna, value=texto)
        linha_atual += 1
        for linha in secao.linhas:
            for coluna, texto in enumerate(linha, start=1):
                planilha.cell(row=linha_atual, column=coluna, value=texto)
            linha_atual += 1
        linha_atual += 1

    planilha.cell(row=linha_atual, column=1, value="Gerado em")
    planilha.cell(row=linha_atual, column=2, value=agora.strftime("%d/%m/%Y %H:%M:%S"))
    linha_atual += 1
    planilha.cell(row=linha_atual, column=1, value="Última sincronização")
    planilha.cell(row=linha_atual, column=2, value=sincronizado_em)

    workbook.save(caminho)


def _escrever_pdf(
    caminho: Path,
    tipo: str,
    secoes: list[_SecaoRelatorio],
    filtros: FiltrosDiaria,
    sincronizado_em: str,
    agora: datetime,
) -> None:
    """Sprint 19.7.2 — único formato com seção "Gráficos" (regra do
    backend validada em `schemas.analitica.ParametrosRelatorioQuery.
    _graficos_apenas_em_pdf`), mas sem imagem de gráfico nenhuma: o
    backend não tem motor de renderização (o Dashboard desenha em React/
    SVG, do lado do frontend, 19.6.4) — cada distribuição vira uma tabela,
    o mesmo equivalente textual já obrigatório nos gráficos do Dashboard
    (`v2-demonstracao-visual.md § 6`, "gráfico nunca é a única forma de
    acessar o dado"). Tabelas com `repeatRows=1` — o cabeçalho se repete
    em cada página quando a tabela é maior que uma página (ex.: "Tabela do
    recorte" do tipo Detalhado)."""
    documento = SimpleDocTemplate(
        str(caminho), pagesize=A4, leftMargin=2 * cm, rightMargin=2 * cm, topMargin=2 * cm, bottomMargin=2 * cm
    )
    estilos = getSampleStyleSheet()
    elementos = [
        Paragraph(f"Relatório {_TIPO_ROTULO[tipo]} — Central Analítica", estilos["Title"]),
        Paragraph(_resumo_filtros(filtros), estilos["Normal"]),
        Spacer(1, 0.5 * cm),
    ]

    for secao in secoes:
        elementos.append(Paragraph(secao.titulo, estilos["Heading2"]))
        if not secao.linhas:
            elementos.append(Paragraph("Sem dados para este recorte.", estilos["Normal"]))
        else:
            tabela = Table([secao.cabecalho] + secao.linhas, repeatRows=1)
            tabela.setStyle(
                TableStyle(
                    [
                        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0F172A")),
                        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
                        ("FONTSIZE", (0, 0), (-1, -1), 8),
                    ]
                )
            )
            elementos.append(tabela)
        elementos.append(Spacer(1, 0.5 * cm))

    elementos.append(Paragraph(f"Gerado em {agora.strftime('%d/%m/%Y %H:%M:%S')}", estilos["Normal"]))
    elementos.append(Paragraph(f"Última sincronização: {sincronizado_em}", estilos["Normal"]))

    documento.build(elementos)


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
    )

    caminho_sqlite = base_local_sqlite.caminho_base_local_sqlite()
    try:
        registros = repositorio_analitico.agregar_indicadores(caminho_sqlite, filtros_repositorio)
        sincronizacao = repositorio_analitico.ultima_sincronizacao(caminho_sqlite)
    except sqlite3.Error as erro:
        raise BaseAnaliticaIndisponivel(_MENSAGEM_BASE_INDISPONIVEL) from erro

    conteudo = relatorios_dominio.compor_relatorio(registros, tipo_disponivel)
    secoes = _construir_secoes(conteudo, parametros)

    agora = datetime.now()
    nome_sugerido = _nome_sugerido(parametros.tipo, parametros.formato, agora)
    extensao = _EXTENSAO_POR_FORMATO[parametros.formato]
    caminho = _pasta_temporaria_relatorios() / f"{uuid.uuid4().hex}.{extensao}"

    if parametros.formato == "pdf":
        _escrever_pdf(caminho, tipo_disponivel, secoes, filtros, sincronizacao.sincronizado_em, agora)
    elif parametros.formato == "excel":
        _escrever_excel(caminho, secoes, sincronizacao.sincronizado_em, agora)
    else:
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
