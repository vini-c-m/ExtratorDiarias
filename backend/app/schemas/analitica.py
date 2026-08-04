"""Contratos Pydantic da Central Analítica — request/response de
`GET /api/v1/analitica/diarias` (Sprint 17.4.3),
`GET /api/v1/analitica/diarias/{sei}` (Sprint 17.4.4),
`GET /api/v1/analitica/opcoes-filtro` (Sprint 17.4.5) e
`GET`/`POST /api/v1/analitica/sincronizacao` +
`GET /api/v1/analitica/sincronizacao/avisos` (Sprint 17.4.6). Não
reaproveita nenhuma classe de `schemas/conferencia.py` (decisão 9,
`docs/central-analitica/README.md § 0.1`) — só o **padrão** já
estabelecido (`model_validator(mode="after")` para invariantes cruzando
campos, `Literal[...]` para enums pequenos)."""

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator

CampoOrdenacao = Literal["sei", "periodo", "servidor", "destino", "valor"]
DirecaoOrdenacao = Literal["asc", "desc"]


class ParametrosPesquisaDiariasQuery(BaseModel):
    """Injetado via `Annotated[ParametrosPesquisaDiariasQuery, Query()]`
    (suporte nativo do FastAPI a partir da 0.115, já a versão fixada em
    `requirements.txt`) — cada campo vira um parâmetro de query."""

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
    # Sprint 19.5.3 — expõe os filtros já implementados em
    # `repositorio_analitico.FiltrosDiaria` (Sprint 19.5.2). `origem`/
    # `destino` isolam uma ponta da viagem (diferente de `municipio`, que
    # casa as duas); `trecho` casa a concatenação "origem - destino".
    origem: str | None = None
    destino: str | None = None
    trecho: str | None = None
    valor_minimo: float | None = None
    valor_maximo: float | None = None
    pagina: int = Field(default=1, ge=1)
    tamanho_pagina: int = Field(default=25, ge=1, le=100)
    ordenar_por: CampoOrdenacao = "periodo"
    ordem: DirecaoOrdenacao = "desc"

    @model_validator(mode="after")
    def _periodo_valido(self) -> "ParametrosPesquisaDiariasQuery":
        if (
            self.periodo_inicial is not None
            and self.periodo_final is not None
            and self.periodo_final < self.periodo_inicial
        ):
            raise ValueError("Período final não pode ser anterior ao período inicial.")
        return self

    @model_validator(mode="after")
    def _valor_valido(self) -> "ParametrosPesquisaDiariasQuery":
        if (
            self.valor_minimo is not None
            and self.valor_maximo is not None
            and self.valor_maximo < self.valor_minimo
        ):
            raise ValueError("Valor máximo não pode ser menor que o valor mínimo.")
        return self


class ParametrosIndicadoresQuery(BaseModel):
    """Entrada de `GET /indicadores` (Sprint 19.6.2, `v2-plano-tecnico.md`
    § 12.2): os mesmos 15 campos de filtro de
    `ParametrosPesquisaDiariasQuery`, sem paginação/ordenação — este
    endpoint sempre opera sobre o recorte inteiro, nunca uma página dele.

    Campos e validadores intencionalmente próprios (não herdados de
    `ParametrosPesquisaDiariasQuery`) — mesma "regra de posse de tipos"
    já documentada em `analitica_service.py` para `FiltrosDiaria`
    (service vs. repositório): cada camada/contrato é dono da sua própria
    definição, nunca uma herança atravessando a fronteira entre "busca
    paginada" e "agregação sobre o recorte inteiro". A tradução para
    `FiltrosDiaria` (idêntica à de `ParametrosPesquisaDiariasQuery`) é
    compartilhada num único ponto em `app/api/analitica.py`
    (`_filtros_da_query`), para as duas rotas nunca poderem divergir
    silenciosamente."""

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

    @model_validator(mode="after")
    def _periodo_valido(self) -> "ParametrosIndicadoresQuery":
        if (
            self.periodo_inicial is not None
            and self.periodo_final is not None
            and self.periodo_final < self.periodo_inicial
        ):
            raise ValueError("Período final não pode ser anterior ao período inicial.")
        return self

    @model_validator(mode="after")
    def _valor_valido(self) -> "ParametrosIndicadoresQuery":
        if (
            self.valor_minimo is not None
            and self.valor_maximo is not None
            and self.valor_maximo < self.valor_minimo
        ):
            raise ValueError("Valor máximo não pode ser menor que o valor mínimo.")
        return self


# Sprint 19.6.3 (`v2-plano-tecnico.md` § 12.3) — só as 6 dimensões cujo
# comportamento já está integralmente definido nos documentos homologados
# (19.1/19.2/19.3). `"completude"` (a 7ª do catálogo completo, § 6.2)
# fica deliberadamente de fora: usa a mesma base do KPI "Registros
# completos"/"Registros incompletos" (§ 6.1), que depende da definição
# fechada de "registro incompleto" (§ 9 pergunta 7 / § 14 pergunta 5) —
# pergunta ainda em aberto com o DIMCAC, mesmo critério já homologado na
# Sprint 19.6.1 para os KPIs pendentes (nunca implementar com suposição).
# Omissão 100% aditiva: adicionar `"completude"` a este `Literal` quando a
# definição existir não quebra nenhum cliente já integrado, porque
# `Literal` só restringe valores aceitos — nunca uma mudança de shape.
DimensaoDistribuicao = Literal["periodo", "servidor", "municipio", "motivo", "situacao", "origem_destino"]


class ParametrosDistribuicaoQuery(BaseModel):
    """Entrada de `GET /distribuicoes` (Sprint 19.6.3, `v2-plano-tecnico.md`
    § 12.3): os mesmos 15 campos de filtro de
    `ParametrosPesquisaDiariasQuery`/`ParametrosIndicadoresQuery` (sem
    paginação/ordenação — mesmo motivo de `ParametrosIndicadoresQuery`,
    este endpoint também opera sobre o recorte inteiro), mais `dimensao`
    (obrigatório, um valor por chamada — nunca uma lista, § 12.3).

    Campos e validadores intencionalmente próprios (não herdados de
    `ParametrosPesquisaDiariasQuery`/`ParametrosIndicadoresQuery`) — mesma
    "regra de posse de tipos" já documentada para `ParametrosIndicadoresQuery`
    acima. A tradução para `FiltrosDiaria` é compartilhada com as outras
    duas rotas num único ponto em `app/api/analitica.py`
    (`_filtros_da_query`)."""

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
    dimensao: DimensaoDistribuicao

    @model_validator(mode="after")
    def _periodo_valido(self) -> "ParametrosDistribuicaoQuery":
        if (
            self.periodo_inicial is not None
            and self.periodo_final is not None
            and self.periodo_final < self.periodo_inicial
        ):
            raise ValueError("Período final não pode ser anterior ao período inicial.")
        return self

    @model_validator(mode="after")
    def _valor_valido(self) -> "ParametrosDistribuicaoQuery":
        if (
            self.valor_minimo is not None
            and self.valor_maximo is not None
            and self.valor_maximo < self.valor_minimo
        ):
            raise ValueError("Valor máximo não pode ser menor que o valor mínimo.")
        return self


class PontoDistribuicaoResposta(BaseModel):
    rotulo: str
    contagem: int
    valor: float | None


class DistribuicaoResposta(BaseModel):
    """Resposta de `GET /distribuicoes` (Sprint 19.6.3). Só `dimensao`
    (eco do parâmetro de entrada) e `pontos` — contrato aprovado
    (`v2-plano-tecnico.md § 12.3`) não inclui `sincronizacao` aqui,
    diferente de `IndicadoresResposta`/`ResultadoPesquisaResposta`
    (decisão já tomada no plano técnico, não uma omissão desta
    implementação)."""

    dimensao: DimensaoDistribuicao
    pontos: list[PontoDistribuicaoResposta]


class ServidorResumoResposta(BaseModel):
    """**✅ Decisão oficial (2026-08-02, correção 18.6.2, acompanha a
    17.4.4.1):** `matricula` é `str | None`, mesma razão já registrada em
    `ServidorCompletoResposta` — as colunas de `Servidor` (`domain/entities/
    servidor.py`) são independentes e opcionais, sem garantia de
    preenchimento conjunto com `nome`. Antes desta correção, um servidor com
    `nome` preenchido e `matricula` nula fazia `GET /diarias` responder 500
    (`ValidationError` ao construir esta resposta em `api/analitica.py`)."""

    nome: str
    matricula: str | None
    # Sprint 19.5.7.1 — dado já lido pela consulta de listagem (`Servidor.
    # situacao`), sem relação com CPF/privacidade; aditivo, default `None`.
    situacao: str | None = None


class PeriodoResposta(BaseModel):
    inicial: date
    final: date


class DiariaResumoResposta(BaseModel):
    sei: str
    periodo: PeriodoResposta
    destino: str | None
    servidor: ServidorResumoResposta | None
    motivo: str
    valor_total_diarias: float | None
    # Sprint 19.5.7.1 — Configuração de Colunas (`v2-wireframes.md` § 3.4):
    # os 3 campos abaixo já são lidos pela consulta de listagem existente,
    # só não eram copiados para a resposta. `cpf_mascarado` é o único campo
    # relacionado a CPF permitido aqui — o valor completo nunca é incluído
    # neste schema (decisão vinculante herdada, `ui-arquitetura.md` § 0.7:
    # "CPF nunca aparece em TabelaDiarias/listagens... sem mudança de
    # contrato do backend" — `cpf_mascarado` estende o contrato sem violar
    # essa cláusula, porque não carrega o CPF completo). Nenhum campo
    # `trecho`: "Trecho completo" é composto no frontend a partir de
    # `origem` + `destino` (já existente), nunca duplicado aqui.
    origem: str | None = None
    doc_origem: str | None = None
    transporte: str | None = None
    cpf_mascarado: str | None = None


class ServidorCompletoResposta(BaseModel):
    """Versão completa do servidor, exclusiva do detalhamento (`GET
    /diarias/{sei}`) — `ServidorResumoResposta` (listagem) continua só com
    `nome`/`matricula`.

    **✅ Decisão oficial (2026-07-31, Sprint 17.4.4.1,
    `docs/central-analitica/api-plano-tecnico.md § 8`):** `matricula`/
    `situacao` são `str | None`, escolha arquitetural defensiva para
    tolerar dado incompleto e futuras mudanças na origem dos dados — as
    colunas correspondentes no esquema SQLite (Sprint 17.3, imutável) são
    independentes e opcionais, sem nenhuma garantia de preenchimento
    conjunto com `nome`. Não depende de o pipeline de sincronização atual
    produzir `NULL` hoje (isso nunca foi confirmado) — a garantia que
    importa é a do esquema, não a do código de leitura atual."""

    nome: str
    cargo: str
    previdencia: str
    matricula: str | None
    situacao: str | None


class TrechoResposta(BaseModel):
    origem: str | None
    destino: str | None


class ReferenciaAdministrativaResposta(BaseModel):
    """Rotulado explicitamente como dado de auditoria (decisão 8) — nunca
    usado pela interface como identificador de nada."""

    linha_planilha: int


class EstadoSincronizacaoResumidoResposta(BaseModel):
    """Versão mínima (decisão do usuário, 2026-07-30, Sprint 17.4.3): só
    timestamp + contagem de avisos, sem comparação ao vivo contra a
    Planilha Oficial. Usada em `GET /diarias`/`GET /diarias/{sei}` —
    contrato intocado pela Sprint 17.4.6, que adiciona
    `EstadoSincronizacaoResposta` como classe própria (`GET
    /sincronizacao`), nunca fundida com esta nem a substituindo."""

    sincronizado_em: datetime
    total_avisos: int


# Sprint 19.8.2/19.8.3 (`v2-plano-tecnico.md` § 12.4/§ 12.5) — definidos
# aqui (antes de `DiariaCompletaResposta`) porque `CasoDiagnosticoResposta`
# é reaproveitado nos dois contratos (`GET /diagnostico` e `GET
# /diarias/{sei}`), regra explícita de não duplicar o mesmo shape.
ClassificacaoDiagnostico = Literal["esperado", "atencao", "inconsistencia"]


class CasoDiagnosticoResposta(BaseModel):
    """Mesma estrutura usada tanto em `RegistroDiagnosticadoResposta.casos`
    (`GET /diagnostico`, § 12.4) quanto em `DiariaCompletaResposta.
    diagnosticos` (`GET /diarias/{sei}`, § 12.5) — garante que o cartão de
    diagnóstico do frontend seja o mesmo componente nas duas telas (regra
    de não duplicar). Sem `classificacao`: só o agregado por SEI
    (`RegistroDiagnosticadoResposta.classificacao`) carrega essa
    informação, contrato já definido assim no plano técnico."""

    campo: str | None
    titulo: str
    motivo: str
    acao_recomendada: str


class DiariaCompletaResposta(BaseModel):
    """Resposta de `GET /diarias/{sei}` (Fase 4/8,
    `docs/central-analitica/api-arquitetura.md`) — tudo de
    `DiariaResumoResposta`, mais os campos que a listagem omite por
    brevidade.

    `diagnosticos` (Sprint 19.8.3, § 12.5) — vazio quando o registro é
    "esperado" sem nenhum caso a reportar, nunca `null`/omitido; um item
    por caso do catálogo que se aplica a este registro específico (nunca
    inclui duplicidade — essa depende de um recorte que este endpoint de
    SEI único não tem, ver `analitica_service.detalhar_diaria`)."""

    sei: str
    periodo: PeriodoResposta
    destino: str | None
    servidor: ServidorCompletoResposta | None
    motivo: str
    valor_total_diarias: float | None
    doc_origem: str
    cpf: str
    trecho: TrechoResposta
    transporte: str | None
    referencia_administrativa: ReferenciaAdministrativaResposta
    sincronizacao: EstadoSincronizacaoResumidoResposta
    diagnosticos: list[CasoDiagnosticoResposta]


class PaginacaoResposta(BaseModel):
    pagina_atual: int
    tamanho_pagina: int
    total_itens: int
    total_paginas: int


class ResultadoPesquisaResposta(BaseModel):
    itens: list[DiariaResumoResposta]
    paginacao: PaginacaoResposta
    sincronizacao: EstadoSincronizacaoResumidoResposta


class IndicadoresResposta(BaseModel):
    """Resposta de `GET /indicadores` (Sprint 19.6.2). Só os 4 KPIs sem
    decisão pendente (calculados em `app/domain/analitica/indicadores.py`,
    Sprint 19.6.1). Os demais do catálogo completo (`v2-plano-tecnico.md`
    § 12.2: `total_municipios`, `registros_completos`,
    `registros_incompletos`, `aguardando_liberacao`) dependem de perguntas
    ainda em aberto com o DIMCAC (`v2-arquitetura-funcional.md` § 14,
    perguntas 2/4/5) — omitidos deste contrato agora, nunca com suposição;
    serão campos aditivos quando as respectivas decisões existirem, sem
    quebrar nenhum cliente já integrado."""

    total_diarias: int
    total_servidores: int
    valor_total: float | None
    valor_medio: float | None
    sincronizacao: EstadoSincronizacaoResumidoResposta


class OpcoesFiltroResposta(BaseModel):
    """Resposta de `GET /opcoes-filtro` (Fase 4,
    `docs/central-analitica/api-arquitetura.md`) — sem `sincronizacao`
    embutida (só os contratos de listagem/detalhamento carregam esse
    carimbo, por decisão 6; "Opções de Filtro" não está entre eles)."""

    motivos: list[str]
    situacoes: list[str]
    municipios: list[str]


class EstadoSincronizacaoResposta(BaseModel):
    """Resposta de `GET /sincronizacao` (Fase 4, Sprint 17.4.6) — classe
    própria, nunca fundida com `EstadoSincronizacaoResumidoResposta`
    (usada em `/diarias`). `"falha_na_ultima_sincronizacao"` nunca
    aparece em `status` aqui (achado § 2.1 do plano técnico: a tabela
    `sincronizacoes` só grava sucesso) — só em
    `ExecucaoSincronizacaoResposta`, resposta do `POST`."""

    sincronizado_em: datetime | None
    origem: str | None
    possivelmente_desatualizado: bool
    total_avisos: int
    status: Literal["nunca_sincronizado", "atualizado", "possivelmente_desatualizado"]


class ExecucaoSincronizacaoResposta(BaseModel):
    """Resposta de `POST /sincronizacao` (Fase 4, Sprint 17.4.6) —
    `status="falha"` deixa as demais contagens `None` (nada real a
    reportar quando a sincronização não foi inferida como bem-sucedida)."""

    status: Literal["sucesso", "falha"]
    sincronizado_em: datetime | None
    linhas_diarias: int | None
    linhas_servidores_lidos: int | None
    linhas_ignoradas: int | None
    total_avisos: int | None


class AvisoSincronizacaoResposta(BaseModel):
    aba: str
    linha: int
    motivo: str


class PaginaAvisosResposta(BaseModel):
    """Resposta de `GET /sincronizacao/avisos` (Fase 4, Sprint 17.4.6) —
    avisos da sincronização mais recente, paginados; sem `sincronizacao`
    embutida, mesmo critério de `OpcoesFiltroResposta`."""

    itens: list[AvisoSincronizacaoResposta]
    paginacao: PaginacaoResposta


# Sprint 19.7.2 (`v2-plano-tecnico.md` § 12.6) — os 8 tipos do catálogo
# completo (`v2-arquitetura-funcional.md` § 7.1) aparecem todos aqui: o
# contrato público é aditivo e não muda de novo quando "inconsistencias"/
# "qualidade_dados" ganharem composição real (Sprint 19.8). Até lá, o
# serviço (`analitica_service.gerar_relatorio`) recusa esses 2 valores com
# `422` — nunca uma composição inventada (mesmo critério já homologado na
# 19.7.1 para `app.domain.analitica.relatorios.TipoRelatorio`, que só
# declara os 6 já implementados).
TipoRelatorio = Literal[
    "executivo",
    "detalhado",
    "financeiro",
    "por_servidor",
    "por_municipio",
    "por_situacao",
    "inconsistencias",
    "qualidade_dados",
]
FormatoRelatorio = Literal["pdf", "excel", "csv"]
ModoRelatorio = Literal["previsualizacao", "final"]


class FiltrosRelatorioQuery(BaseModel):
    """Mesmos 15 campos de filtro de `ParametrosPesquisaDiariasQuery`/
    `ParametrosIndicadoresQuery`/`ParametrosDistribuicaoQuery`, sem
    paginação/ordenação (mesmo motivo das duas últimas — este endpoint
    também opera sobre o recorte inteiro, nunca uma página dele). Aninhado
    em `filtros` dentro do corpo de `POST /relatorios` (§ 12.6) — diferente
    das rotas `GET` acima (query string "achatada"), aqui é corpo JSON, e
    o aninhamento natural do contrato é preservado, não desfeito.

    Campos e validadores intencionalmente próprios (não herdados) — mesma
    "regra de posse de tipos" já documentada para `ParametrosIndicadoresQuery`
    acima. A tradução para `FiltrosDiaria` é compartilhada com as outras
    rotas no mesmo `_filtros_da_query` de `app/api/analitica.py`."""

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

    @model_validator(mode="after")
    def _periodo_valido(self) -> "FiltrosRelatorioQuery":
        if (
            self.periodo_inicial is not None
            and self.periodo_final is not None
            and self.periodo_final < self.periodo_inicial
        ):
            raise ValueError("Período final não pode ser anterior ao período inicial.")
        return self

    @model_validator(mode="after")
    def _valor_valido(self) -> "FiltrosRelatorioQuery":
        if (
            self.valor_minimo is not None
            and self.valor_maximo is not None
            and self.valor_maximo < self.valor_minimo
        ):
            raise ValueError("Valor máximo não pode ser menor que o valor mínimo.")
        return self


class ParametrosRelatorioQuery(BaseModel):
    """Entrada de `POST /relatorios` (Sprint 19.7.2, § 12.6) — corpo JSON,
    não query string (diferente de todas as rotas `GET` acima): gerar um
    relatório não é uma consulta idempotente por URL, é uma operação que
    grava um arquivo físico em disco.

    `incluir_indicadores`/`incluir_graficos`/`incluir_tabela`/
    `incluir_inconsistencias` são independentes de `tipo` — controlam
    quais blocos do conteúdo já composto por `tipo` (`v2-demonstracao-
    visual.md § 7`, "Conteúdo a incluir") entram no artefato final; todos
    `True` por padrão, mesmo estado inicial do formulário no mockup (todos
    marcados)."""

    filtros: FiltrosRelatorioQuery
    tipo: TipoRelatorio
    formato: FormatoRelatorio
    incluir_indicadores: bool = True
    incluir_graficos: bool = True
    incluir_tabela: bool = True
    incluir_inconsistencias: bool = True
    modo: ModoRelatorio

    @model_validator(mode="after")
    def _graficos_apenas_em_pdf(self) -> "ParametrosRelatorioQuery":
        # "Gráficos disponíveis apenas para PDF" (`v2-demonstracao-
        # visual.md` § 7) — regra real do backend, não só um texto
        # explicativo do formulário (critério de aceite explícito da
        # 19.7.3): rejeitada aqui, nunca silenciosamente ignorada.
        if self.incluir_graficos and self.formato != "pdf":
            raise ValueError("Gráficos estão disponíveis apenas para o formato PDF.")
        return self


class RelatorioGeradoResposta(BaseModel):
    """Saída de `POST /relatorios` (§ 12.6) — `caminho_arquivo_temporario`
    segue o mesmo padrão já usado pelo relatório HTML de Processamento
    (`app/planilha/relatorio.py` + `pasta_resultados.py`): o Electron copia
    deste caminho para o destino escolhido pelo usuário
    (`relatorio:salvar-como`, generalizado na Sprint 19.7.5)."""

    caminho_arquivo_temporario: str
    nome_sugerido: str
    sincronizado_em: datetime


# Sprint 19.8.2 (`v2-plano-tecnico.md` § 12.4) — `GET /diagnostico`.
# `ClassificacaoDiagnostico`/`CasoDiagnosticoResposta` ficam definidos mais
# acima no arquivo (perto de `DiariaCompletaResposta`, Sprint 19.8.3) —
# `CasoDiagnosticoResposta` é reaproveitado nos dois contratos (regra de
# não duplicar, § 12.4), então precisa existir antes de ambos os usos.


class ParametrosDiagnosticoQuery(BaseModel):
    """Entrada de `GET /diagnostico` — os mesmos 15 campos de filtro de
    `ParametrosPesquisaDiariasQuery`/`ParametrosIndicadoresQuery`/
    `ParametrosDistribuicaoQuery`, sem paginação/ordenação (mesmo motivo:
    este endpoint também opera sobre o recorte inteiro, § 8.3 — "só sobre
    os registros do recorte filtrado, nunca a base inteira por padrão").

    Campos e validadores intencionalmente próprios (não herdados) — mesma
    "regra de posse de tipos" já documentada para `ParametrosIndicadoresQuery`."""

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

    @model_validator(mode="after")
    def _periodo_valido(self) -> "ParametrosDiagnosticoQuery":
        if (
            self.periodo_inicial is not None
            and self.periodo_final is not None
            and self.periodo_final < self.periodo_inicial
        ):
            raise ValueError("Período final não pode ser anterior ao período inicial.")
        return self

    @model_validator(mode="after")
    def _valor_valido(self) -> "ParametrosDiagnosticoQuery":
        if (
            self.valor_minimo is not None
            and self.valor_maximo is not None
            and self.valor_maximo < self.valor_minimo
        ):
            raise ValueError("Valor máximo não pode ser menor que o valor mínimo.")
        return self


class RegistroDiagnosticadoResposta(BaseModel):
    sei: str
    classificacao: ClassificacaoDiagnostico
    casos: list[CasoDiagnosticoResposta]


class ResumoDiagnosticoResposta(BaseModel):
    esperado: int
    atencao: int
    inconsistencia: int


class DiagnosticoResposta(BaseModel):
    """Resposta de `GET /diagnostico` (§ 12.4) — sem `sincronizacao`
    embutida, mesmo critério já usado em `DistribuicaoResposta`."""

    resumo: ResumoDiagnosticoResposta
    registros: list[RegistroDiagnosticadoResposta]
