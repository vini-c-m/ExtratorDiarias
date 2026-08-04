"""Sprint 19.7.1 (`docs/central-analitica/v2-plano-tecnico.md` § 18) —
funções puras (sem I/O) que compõem o conteúdo de um relatório a partir de
um recorte já filtrado de `RegistroAnalitico` (`v2-arquitetura-funcional.md`
§ 7.1). Mesmo papel de `indicadores.py`/`distribuicoes.py` para o Dashboard:
quem gera o arquivo físico (PDF/Excel/CSV) é `app/services/
analitica_service.py::gerar_relatorio` (19.7.2) — este módulo nunca abre
conexão nenhuma, nunca desenha nada, 100% testável com dado sintético.

Reaproveita `calcular_indicadores`/`calcular_distribuicao` para todo número
apresentado — nenhum recálculo duplicado (auditoria de contrato desta
micro-sprint).

Só os 6 tipos do catálogo (§ 7.1) sem nenhuma dependência pendente são
compostos aqui: executivo, detalhado, financeiro, por_servidor,
por_municipio, por_situacao. "Inconsistências" e "Qualidade dos dados"
ficam de fora desta Sprint — ambos dependem do catálogo de diagnósticos
(`app/domain/analitica/diagnostico.py`, Sprint 19.8), que ainda não existe.
Risco já registrado no plano técnico (entrada 19.7.1, "Riscos"): se 19.7
roda antes de 19.8 terminar, esses 2 tipos ficam bloqueados até lá — mesmo
critério já homologado nas Sprints 19.6.1/19.6.3/19.6.4 para KPIs/dimensões/
cartões pendentes: nunca implementar com suposição, preferível omitir do
que adivinhar. Omissão 100% aditiva — nada impede adicionar
`"inconsistencias"`/`"qualidade_dados"` a `TipoRelatorio` quando
`diagnostico.py` existir, sem quebrar nenhum contrato já entregue.

Decisão de composição desta Sprint (nenhum dos dois documentos de UX define
os blocos com precisão suficiente para os 6 tipos — decisão de
apresentação, deliberadamente registrada aqui, no mesmo espírito de
`distribuicoes.py`/`DashboardRecorte.tsx` já terem documentado decisões
equivalentes de "top N"/"top 3 + Outros"):

- `indicadores` (§ 6.1) é sempre o mesmo `Indicadores` completo em todo
  tipo que o inclui: hoje `indicadores.py` só calcula os 4 KPIs sem
  dependência pendente (nunca os 5 do catálogo completo que dependem do
  DIMCAC) — não há um subconjunto maior do qual recortar "KPIs principais"
  vs. "todos os KPIs" enquanto os pendentes não existirem.
- "Executivo": `indicadores` + a dimensão `periodo` (que já alimenta os
  dois gráficos-chave do Dashboard — Evolução e Valores, mesma reutilização
  de uma única distribuição para dois gráficos já usada em
  `DashboardRecorte.tsx`) — sem tabela.
- "Detalhado": `indicadores` + todas as 6 dimensões + a tabela completa do
  recorte (`registros`, mesma entidade `RegistroAnalitico` já usada
  internamente por todo o domínio — o mascaramento de CPF para exibição é
  responsabilidade da camada de schema/API, 19.7.2, mesma fronteira já
  estabelecida por `DiariaResumoResposta.cpf_mascarado` em
  `schemas/analitica.py`, nunca deste módulo).
- "Financeiro": `indicadores` + as dimensões `periodo`/`municipio` (§ 7.1:
  "total, médio, por período, por município") — nunca a dimensão
  `servidor`/`situacao`, nunca a tabela: nenhum dado que identifique um
  servidor específico entra na composição, satisfazendo "sem os campos
  cadastrais do servidor" por construção, não por um filtro adicional.
- "Por servidor"/"Por município"/"Por situação": `indicadores` + a única
  dimensão correspondente (`servidor`/`municipio`/`situacao`) — a própria
  distribuição já É o agrupamento pedido ("Agrupado por X: total ... por
  Y"), sem tabela de registros brutos."""

from dataclasses import dataclass
from typing import Literal

from app.domain.analitica.distribuicoes import Distribuicao, DimensaoDistribuicao, calcular_distribuicao
from app.domain.analitica.indicadores import Indicadores, calcular_indicadores
from app.domain.entities.registro_analitico import RegistroAnalitico

TipoRelatorio = Literal[
    "executivo",
    "detalhado",
    "financeiro",
    "por_servidor",
    "por_municipio",
    "por_situacao",
]


@dataclass(frozen=True)
class ConteudoRelatorio:
    tipo: TipoRelatorio
    indicadores: Indicadores
    distribuicoes: list[Distribuicao]
    registros: list[RegistroAnalitico]


_DIMENSOES_POR_TIPO: dict[TipoRelatorio, tuple[DimensaoDistribuicao, ...]] = {
    "executivo": ("periodo",),
    "detalhado": ("periodo", "servidor", "municipio", "motivo", "situacao", "origem_destino"),
    "financeiro": ("periodo", "municipio"),
    "por_servidor": ("servidor",),
    "por_municipio": ("municipio",),
    "por_situacao": ("situacao",),
}

# Só "detalhado" inclui a tabela completa do recorte (§ 7.1: "tabela
# completa do recorte") — os demais tipos são compostos só de indicadores/
# distribuições agregadas, nunca de registro por registro.
_TIPOS_COM_TABELA: frozenset[TipoRelatorio] = frozenset({"detalhado"})


def compor_relatorio(registros: list[RegistroAnalitico], tipo: TipoRelatorio) -> ConteudoRelatorio:
    """Recorte vazio devolve indicadores/distribuições igualmente vazios
    (mesmo comportamento de `calcular_indicadores([])`/
    `calcular_distribuicao([], ...)`, nunca um bloco inventado) — nunca um
    caso especial aqui."""
    indicadores = calcular_indicadores(registros)
    distribuicoes = [calcular_distribuicao(registros, dimensao) for dimensao in _DIMENSOES_POR_TIPO[tipo]]
    tabela = list(registros) if tipo in _TIPOS_COM_TABELA else []

    return ConteudoRelatorio(tipo=tipo, indicadores=indicadores, distribuicoes=distribuicoes, registros=tabela)
