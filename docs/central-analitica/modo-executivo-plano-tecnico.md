# Central Analítica — Modo Executivo: Plano Técnico (Sprint 21)

> **Planejamento aprovado (2026-08-05) — implementação segue o roadmap
> de § 12.** Este documento antecipa módulos, componentes, contratos e um
> roadmap em micro-sprints; nenhuma decisão aqui é definitiva sobre
> biblioteca de gráfico (§ 4) — só levantamento, isso continua adiado.

> **Decisões de fechamento aplicadas** (ver `modo-executivo-arquitetura-
> funcional.md § 0`, decisões 8–13): "Imagem" = PDF executivo, "Unidade
> solicitante" = `doc_origem` (rótulo "Unidade solicitante (documento de
> origem)"), tela cheia = Fullscreen API sem kiosk mode, Membros ×
> Servidores = distribuição combinada padrão (+ "Comparar" opcional para
> comparação detalhada), sem controle de acesso nesta etapa, modo
> apresentação sem atualização contínua.

## Sumário

1. [Módulos e componentes](#1-módulos-e-componentes)
2. [Hooks](#2-hooks)
3. [Reaproveitamento vs. criação do zero](#3-reaproveitamento-vs-criação-do-zero)
4. [Zoom, animação e drill-down nos componentes atuais](#4-zoom-animação-e-drill-down-nos-componentes-atuais)
5. [Estratégia de estado](#5-estratégia-de-estado)
6. [Estratégia de comparação](#6-estratégia-de-comparação)
7. [Estratégia de acessibilidade](#7-estratégia-de-acessibilidade)
8. [Contratos atuais e contratos novos](#8-contratos-atuais-e-contratos-novos)
9. [Desempenho com 1.800+ registros](#9-desempenho-com-1800-registros)
10. [Funcionalidades só-frontend vs. que exigem backend novo](#10-funcionalidades-só-frontend-vs-que-exigem-backend-novo)
11. [Testes](#11-testes)
12. [Roadmap em micro-sprints](#12-roadmap-em-micro-sprints)
13. [Rollback](#13-rollback)
14. [Auditoria](#14-auditoria)

---

## 1. Módulos e componentes

Nomes provisórios, todos sob `frontend/src/components/analitica/executivo/`
(pasta nova, irmã de `graficos/`) — nada dentro de `DashboardRecorte.tsx`
é tocado:

| Componente | Papel | Reaproveita |
| --- | --- | --- |
| `ModoExecutivo.tsx` | Shell da tela — orquestra cabeçalho, grade de KPIs/gráficos, insights, comparação, painel lateral. Papel equivalente ao de `DashboardRecorte.tsx`, mas independente dele. | `useDiarias.filtros`, `useIndicadores`, `useDistribuicoes` (mesmas instâncias/mesmos hooks já existentes, chamados de novo aqui — nunca duplicados em lógica, só numa segunda árvore de componentes). |
| `CabecalhoExecutivo.tsx` | Período, categoria funcional, chips resumidos, sincronização, botões Comparar/Exportar/Apresentação/Voltar. | `FiltroCategoriaFuncional.tsx` (Sprint 20, direto), `IndicadorSincronizacao.tsx`, versão compacta de `ChipsFiltroAtivo.tsx`. |
| `GradeKpisExecutivos.tsx` | KPIs em escala grande, com variação quando comparando. | `Indicadores`/`IndicadoresResposta` (mesmo contrato), `TIPOGRAFIA`/`CORES_STATUS`. |
| `CartaoGraficoExecutivo.tsx` | Versão maior de `CartaoGrafico.tsx` — mesmo par gráfico + tabela textual equivalente, densidade maior. | `GraficoBarras.tsx`, `GraficoDonut.tsx`, `CartaoGrafico.tsx` (composição, não reescrita). |
| `PainelComparacao.tsx` | Cabeçalho/seleção de comparação (§ 6) — não é uma tela nova, é um estado do `ModoExecutivo.tsx`. | `useDiarias.filtros` (para o recorte A), um segundo `FiltrosDiaria` local só-leitura para B. |
| `PainelLateralExecutivo.tsx` | Painel de detalhe contextual (arquitetura funcional § 6.6). | Mesmo padrão de `PainelDetalhamentoDiaria.tsx` (estrutura de painel deslizante/modal + Esc + `role="dialog"`), adaptado para layout lateral. |
| `PainelInsights.tsx` | Lista de insights determinísticos. | `lib/insightsExecutivos.ts` (novo, § 6/§ 10 — funções puras, testáveis isoladamente, sem componente). |
| `ModoApresentacao.tsx` | Tela cheia, navegação por seção. | `GradeKpisExecutivos`/`CartaoGraficoExecutivo`/`PainelInsights` reaproveitados como "slides" — nenhum componente de cálculo novo. |
| `ModalExportacaoExecutiva.tsx` | Formulário de exportação executiva. | `useGerarRelatorio.ts`, `ModalRelatorio.tsx` como referência de estrutura (máquina de estados idêntica). |

## 2. Hooks

| Hook | Papel | Novo ou reaproveitado |
| --- | --- | --- |
| `useDiarias` | Fonte única do recorte A (filtros/paginação/ordenação). | **Reaproveitado**, zero mudança. |
| `useIndicadores(filtros)` | KPIs do recorte A. | **Reaproveitado**, zero mudança — já usado por `DashboardRecorte`. |
| `useDistribuicoes(filtros, dimensao)` | Uma distribuição por vez, já existente. | **Reaproveitado** — o Executivo chama várias vezes (uma por gráfico), mesmo padrão já usado hoje pelo Dashboard operacional (várias chamadas independentes, uma por `SecaoGrafico`). |
| `useDiagnostico(filtros)` | Resumo de diagnóstico (para o KPI "Atenção" e insights). | **Reaproveitado**, zero mudança. |
| `useComparacaoExecutiva(filtrosA, filtrosB)` | Orquestra as chamadas paralelas de indicadores/distribuições para A e B, calcula variação percentual. | **Novo** — hook de composição fina: internamente chama `useIndicadores`/`useDistribuicoes` 2 vezes (uma por recorte), nunca reimplementa a leitura de dado. |
| `useInsightsExecutivos(indicadores, distribuicoes, diagnostico, indicadoresPeriodoAnterior?)` | Deriva a lista de insights (§ 6) a partir de dados já carregados pelos hooks acima. | **Novo**, mas 100% função pura sobre dado já em memória — nenhuma chamada de rede própria. |
| `useModoApresentacao()` | Controla entrada/saída de tela cheia (Fullscreen API), seção atual, navegação por teclado. | **Novo** — encapsula só a interação de apresentação, nenhum dado de negócio. |
| `useGerarRelatorio` | Geração/exportação. | **Reaproveitado**, zero mudança — ver § 8 para o único campo aditivo cogitado. |

## 3. Reaproveitamento vs. criação do zero

**Reaproveitado sem nenhuma mudança:**
`useDiarias`, `useIndicadores`, `useDistribuicoes`, `useDiagnostico`,
`useGerarRelatorio`, `useColunasTabela` (não usado no Executivo, mas
intocado), `GraficoBarras.tsx`, `GraficoDonut.tsx`, `CartaoGrafico.tsx`,
`FiltroCategoriaFuncional.tsx`, `Badge`/`Botao`/`Alerta`/`Cartao`
(componentes base de `components/ui/`), todos os tokens de `theme/`,
`filtrosParaRelatorio` (`lib/parametrosRelatorio.ts`), IPC
`relatorio:salvar-como`.

**Criado do zero** (todos aditivos, nenhum substitui algo existente):
os 9 componentes de § 1, os 3 hooks novos de § 2, `lib/
insightsExecutivos.ts`, e possivelmente `lib/comparacaoExecutiva.ts` (cálculo
de variação percentual/Pareto — funções puras, testáveis sem
componente).

**Explicitamente não tocado:** `DashboardRecorte.tsx`, `PainelDiagnostico.tsx`,
`ModalRelatorio.tsx`, `TabelaDiarias.tsx`, `CentralAnalitica.tsx` (recebe
só uma nova branch de visualização — ver § 5) — nenhum destes é
reescrito ou tem sua lógica interna alterada.

## 4. Zoom, animação e drill-down nos componentes atuais

Avaliação pedida explicitamente: **os componentes atuais suportam
zoom/animação/drill-down?**

- **Drill-down**: **sim, já suportado** — `GraficoBarras`/`GraficoDonut`
  já aceitam `aoClicarPonto`/`onClick` e o padrão `refinar()` (`DashboardRecorte.tsx:240-243`)
  já implementa "clique aplica filtro" de ponta a ponta. O Executivo
  reaproveita esse mesmo mecanismo sem alteração — só decide, na camada de
  composição, se o clique abre o painel lateral (§ 6.6 da arquitetura
  funcional) em vez de navegar direto para a tabela.
- **Animação**: **não suportado hoje** — `GraficoBarras`/`GraficoDonut`
  não têm nenhuma transição de entrada/crescimento de valor; só herdam a
  transição genérica de hover do `theme.css`. Qualquer animação de
  "barra crescendo"/"número contando" no Executivo é funcionalidade nova,
  viável em CSS puro (`transition`/`@keyframes`, mesmo mecanismo já usado
  em `animate-entrada-conteudo`) — não exige biblioteca.
- **Zoom temporal / seleção por arraste**: **não suportado hoje** —
  nenhum dos dois gráficos tem captura de gesto de arraste. É
  implementável sem biblioteca (eventos de ponteiro nativos sobre o
  SVG/CSS existente), mas é trabalho novo real, não uma composição do que
  já existe — estimado como o item de maior esforço de UI desta etapa.
- **Tooltip avançado**: **parcialmente suportado** — hoje é só `title`
  nativo do navegador (sem posicionamento customizado, sem múltiplos
  valores). Um tooltip mais rico (valor + % + contagem, controlável por
  teclado) é componente novo, mas pequeno.

**Biblioteca SVG leve — avaliação, não decisão (regra do pedido: "não
decidir por biblioteca ainda"):** zoom por arraste e animação de entrada
são viáveis com o padrão atual (CSS + SVG manual), mas ficam
progressivamente mais trabalhosos à medida que mais gráficos precisam do
mesmo comportamento (curva de esforço replicado por gráfico, sem uma
abstração comum). Se, depois de implementado 1-2 gráficos com zoom manual,
o esforço de manutenção parecer alto, vale reavaliar uma biblioteca leve
focada só em primitivas de gráfico (não um framework de dashboard
completo) — decisão a tomar com dado real de esforço, não antecipada
aqui.

## 5. Estratégia de estado

- **Recorte A**: sempre `useDiarias.filtros`, subindo de `CentralAnalitica.tsx`
  exatamente como hoje — o Executivo é uma nova branch de renderização
  dentro do mesmo componente raiz (mesmo padrão de `visualizacao` em
  `CentralAnalitica.tsx:23,44` — um novo valor `"executivo"` no union
  type, ao lado de `"resultados"|"dashboard"|"relatorio"|"diagnostico"`).
  Nenhum novo `useState<FiltrosDiaria>` em lugar nenhum.
- **Recorte B (comparação)**: um `FiltrosDiaria` local ao
  `useComparacaoExecutiva`, nunca promovido a `CentralAnalitica.tsx`,
  nunca gravado onde `ChipsFiltroAtivo`/`limparFiltros` possam enxergá-lo
  — é estritamente auxiliar de leitura, descartado ao encerrar a
  comparação.
- **Estado de UI do Executivo** (seção ativa em apresentação, painel
  lateral aberto/fechado, comparando ou não): local a `ModoExecutivo.tsx`
  e filhos, nunca persistido, nunca sincronizado com o Modo Operacional —
  mesmo critério já usado para `visualizacao`/`seiSelecionado` em
  `CentralAnalitica.tsx` hoje (estado de navegação de tela, não dado de
  negócio).
- **Transição de modo**: trocar entre Operacional ↔ Executivo é só uma
  troca de `visualizacao` — nunca desmonta `useDiarias` (o hook vive no
  componente raiz, sobrevive à troca de branch de renderização), então o
  recorte nunca é perdido nem refeito.

## 6. Estratégia de comparação

> Nota de escopo (decisão de fechamento 11): a leitura rápida de "Membros
> × Servidores" **não** passa por esta estratégia — é uma distribuição
> combinada sempre visível na grade executiva (`categoria_funcional` como
> `DimensaoDistribuicao`, § 8.2), calculada com 1 única chamada dentro do
> recorte A. O fluxo abaixo (2 recortes) é reservado a comparações
> explícitas escolhidas pelo usuário — incluindo, opcionalmente, uma
> comparação *detalhada* Membros × Servidores (todos os KPIs/gráficos
> lado a lado, não só a proporção), quando o usuário quer mais do que o
> gráfico combinado padrão oferece.

1. Usuário aciona "Comparar" → escolhe um atalho (mês atual × anterior,
   ano × ano, Membros × Servidores — comparação detalhada, distinta do
   gráfico combinado padrão) ou período/categoria manual para B.
2. `useComparacaoExecutiva` deriva `filtrosB` a partir de `filtrosA`
   (mesmo objeto, só os campos de período/categoria substituídos —
   nunca uma reconstrução às cegas dos outros filtros, que continuam
   idênticos ao recorte A, exceto quando o próprio tipo de comparação for
   "Membros × Servidores", caso em que só `categoria_funcional` muda).
3. Duas chamadas independentes e paralelas (`Promise.all`) a
   `/indicadores` e a cada `/distribuicoes` usada na tela — nunca
   sequenciais, para não dobrar o tempo de carregamento percebido.
4. Cada par de números (A, B) tem a variação calculada no cliente:
   `((B - A) / A) * 100`, arredondada, com proteção para `A === 0`/`A ===
   null` (mostra "—", nunca `Infinity`/`NaN` — mesma disciplina de "nunca
   apresentar dado quebrado" já usada em `_formatar_moeda`/`CelulaVazia`).
5. Para distribuições (gráficos), a comparação é apresentada como 2
   séries no mesmo cartão (§ 3 do wireframe) — sem um novo tipo de
   agregação; é literalmente 2 respostas de `/distribuicoes` já
   existentes, renderizadas juntas.
6. Nenhuma regra de negócio é recalculada: a variação percentual é
   aritmética simples sobre números que o backend já formou.

## 7. Estratégia de acessibilidade

Herdada integralmente do que já existe (levantamento factual):

- `role="status"` para carregamento assíncrono (`DashboardRecorte.tsx:171,364`,
  `PainelDiagnostico.tsx:80`, `ModalRelatorio.tsx:380`) — replicado em
  todo cartão executivo.
- `role="group"`/`aria-describedby`/texto irmão `sr-only` para
  informação complementar (`DashboardRecorte.tsx:141-146`,
  `FiltrosRapidos.tsx:107-114`) — replicado nos insights (cada insight
  tem uma descrição completa acessível, não só o texto visual truncado).
- `<button>` nativo para todo ponto clicável de gráfico
  (`GraficoBarras.tsx:59-71`); quando não é botão nativo (linha de
  painel lateral, ex.), `tabIndex={0}`+`onKeyDown` para Enter/Espaço
  (`PainelDiagnostico.tsx:158-165`).
- `role="dialog" aria-modal="true"` para o painel lateral e o modal de
  exportação (`ModalRelatorio.tsx:178-181`), com fechamento por Esc.
- `role="radiogroup"` para o toggle de categoria funcional (já existente,
  `FiltroCategoriaFuncional.tsx`) e para o seletor de tipo de comparação.
- **Novo, específico do Executivo**: navegação por teclado do Modo
  Apresentação (§ 6 do wireframe) — setas ←/→ ou Tab para trocar de
  seção, Esc para sair, sempre documentado com `aria-label` na região de
  navegação (`role="region" aria-label="Slide N de M"` por seção).
- RN-08 mantida em 100% dos elementos novos (insights, variações de
  comparação): vermelho nunca usado para "aumento"/"atenção" de negócio.

## 8. Contratos atuais e contratos novos

### 8.1 Contratos atuais reaproveitados sem mudança

- `GET /api/v1/analitica/indicadores` (`ParametrosIndicadoresQuery` →
  `IndicadoresResposta`) — usado para A e, na comparação, também para B
  (mesma rota, parâmetros diferentes).
- `GET /api/v1/analitica/distribuicoes` (`ParametrosDistribuicaoQuery` →
  `DistribuicaoResposta`) — para as 6 dimensões já existentes
  (`periodo`, `servidor`, `municipio`, `motivo`, `situacao`,
  `origem_destino`).
- `GET /api/v1/analitica/diagnostico` — para o KPI "Atenção" e para os
  insights de DH ausente/duplicidade/transporte não identificado
  (contagem por caso já vem no campo `casos`/`classificacao` de cada
  `RegistroDiagnosticadoResposta`; o Executivo só agrega/conta o que já
  está na resposta, nunca decide um novo caso).
- `POST /api/v1/analitica/relatorios` — para a exportação executiva
  (§ 8.2 abaixo detalha o único campo aditivo cogitado).

### 8.2 Extensões aditivas — aprovadas, prontas para implementação

Nenhuma delas remove ou renomeia campo existente — todas puramente
aditivas, mesmo critério já usado nas extensões anteriores da V2
(ex.: `categoria_funcional` na Sprint 20). As 3 primeiras estão
confirmadas pelas decisões de fechamento (`arquitetura-funcional.md § 0`,
decisões 9 e 11) — não há mais nada "a confirmar" nelas.

| Extensão | Onde | Motivo | Rótulo de UI |
| --- | --- | --- | --- |
| `"categoria_funcional"` como novo valor de `DimensaoDistribuicao` | `backend/app/domain/analitica/distribuicoes.py`, `schemas/analitica.py`, `frontend/src/types/analitica.ts` | Gráfico combinado "Membros × Servidores" (wireframe § 2.2), sempre visível, independente de "Comparar" (decisão 11). | "Membros × Servidores" |
| `"doc_origem"` como novo valor de `DimensaoDistribuicao` | mesmos 3 arquivos acima | Gráfico "Unidade solicitante" (wireframe § 2.2) — decisão 9: é literalmente `doc_origem`, sem reinterpretação. | **"Unidade solicitante (documento de origem)"** — rótulo completo obrigatório em todo lugar que exibir este gráfico (título do cartão, tabela textual equivalente, legenda), nunca abreviado para só "Unidade solicitante". |
| `"transporte"` como novo valor de `DimensaoDistribuicao` | mesmos 3 arquivos acima | Gráfico "Meio de transporte" (pedido explícito do usuário), aprovado junto com os demais gráficos executivos (prioridade 4 do plano de implementação). | "Transporte" |
| Campo `incluir_insights`/`tipo="executivo"` (a definir) em `ParametrosRelatorioQuery`/`ParametrosRelatorio` | `schemas/analitica.py`, `analitica_service.py` | "PDF executivo" (wireframe § 7, decisão 8 — é sempre o PDF, nunca captura de tela) precisa incluir os insights automáticos, que hoje não fazem parte de nenhum `ConteudoRelatorio` existente. | — |

**Nenhuma dessas 4 extensões é backend novo no sentido de nova regra de
negócio** — as 3 primeiras são "mais uma dimensão de agrupamento" sobre
colunas que já existem na tabela `diarias`; a última é "mais um bloco no
mesmo compositor de relatório já existente"
(`app/domain/analitica/relatorios.py::compor_relatorio`).

## 9. Desempenho com 1.800+ registros

Fatos levantados (não estimativa): `agregar_indicadores`
(`backend/app/consulta/repositorio_analitico.py:355-374`) faz **uma
única query SQL sem paginação** por chamada e carrega o recorte inteiro
em `list[RegistroAnalitico]` para o domínio calcular em memória; volume
real já medido é de **~3 mil diárias** (comentário de código, linha 369,
e `docs/central-analitica/README.md:591`). `agregar_distribuicao`
reaproveita a mesma consulta (nenhuma segunda query).

**Impacto do Executivo:**

- Uma tela executiva sem comparação já dispara, hoje, o mesmo número de
  chamadas que o Dashboard operacional (1 indicadores + N distribuições,
  N = quantidade de gráficos exibidos) — sem risco novo.
- **Com "Comparar" ativo, esse número dobra** (A + B) — o risco real
  identificado é aqui: se a tela executiva mantiver todos os 8 gráficos
  do wireframe (§ 2.2) abertos simultaneamente E o usuário ativar
  comparação, são até 16 chamadas de agregação completas (8 dimensões ×
  2 recortes), cada uma relendo até ~3 mil linhas do SQLite via
  `sqlite3` (sem índice em algumas colunas usadas para agrupar, risco já
  aceito desde a Sprint 17.4.1 conforme `docs/central-analitica/
  ui-arquitetura.md:417`).
- **Mitigação a decidir na implementação, não nesta etapa de
  planejamento**: candidatos incluem (a) carregar gráficos sob demanda
  (só os visíveis na viewport/seção atual do modo apresentação, não os 8
  de uma vez), (b) limitar comparação a um subconjunto de cartões por
  padrão, (c) cache client-side por combinação de filtro+dimensão dentro
  da mesma sessão (nunca persistente, nunca substituindo o carimbo de
  sincronização). Nenhuma dessas é adotada aqui — são opções a avaliar
  com medição real (mesmo critério já usado pela Sprint 19.9,
  "medição real, não estimada").
- **Não é um risco de banco de dados grande** (~3 mil linhas é trivial
  para SQLite) — é um risco de **número de roundtrips HTTP e
  recomputação em Python repetida**, sobretudo se o usuário abrir/fechar
  comparação repetidamente sem cache.

## 10. Funcionalidades só-frontend vs. que exigem backend novo

| Funcionalidade | Classificação | Nota |
| --- | --- | --- |
| Botão de entrada, cabeçalho executivo, grade de KPIs (4 já implementados) | **Só frontend** | Zero mudança de contrato. |
| Comparação (A × B) | **Só frontend** | 2 chamadas a endpoints já existentes; matemática de variação no cliente. |
| Zoom temporal, seleção por arraste, hover/tooltip avançado | **Só frontend** | Interação pura de UI sobre dado já carregado. |
| Painel lateral contextual | **Só frontend**, com 1 chamada adicional a `/distribuicoes`/`/indicadores` já existente, com filtro composto (ex.: `municipio` + o filtro do ponto clicado) — nenhum endpoint novo. |
| Insights automáticos | **Só frontend** | Fórmulas determinísticas sobre dado já carregado (§ 6/§ 9 da arquitetura funcional). |
| Modo apresentação (tela cheia, navegação por seção) | **Só frontend** | Fullscreen API do navegador (decisão 10, fechada) — sem kiosk mode, sem IPC novo. |
| Exportação em PDF/impressão | **Só frontend + reaproveitamento de backend existente** | Reaproveita `POST /relatorios` tal como está; só precisa da extensão § 8.2 (insights no PDF) para ficar completo. |
| Gráfico "Membros × Servidores" como distribuição | **Exige extensão de backend** | § 8.2, linha 1. |
| Gráfico "Unidade solicitante" | **Exige extensão de backend** (+ confirmação de definição) | § 8.2, linha 2. |
| Gráfico "Meio de transporte" | **Exige extensão de backend** | § 8.2, linha 3. |
| ~~"Imagem" como captura de tela literal~~ | **Não implementada — fora de escopo** | Decisão 8 (fechada): "Imagem" é sempre o PDF executivo nesta versão. Linha mantida só como registro histórico da avaliação, não como pendência. |

## 11. Testes

Mesma disciplina já praticada no projeto (nenhuma suíte nova de
ferramenta, só mais testes com Vitest/pytest já configurados):

- **Unitários (frontend)**: `lib/insightsExecutivos.test.ts` (cada
  fórmula de insight, casos de borda: recorte vazio, `valor_total: null`,
  variação com `A=0`), `lib/comparacaoExecutiva.test.ts` (cálculo de
  variação percentual, arredondamento, proteção contra divisão por
  zero/`null`).
- **Componentes (frontend)**: `CabecalhoExecutivo.test.tsx`,
  `GradeKpisExecutivos.test.tsx`, `CartaoGraficoExecutivo.test.tsx`
  (reaproveitando fixtures já usadas em `DashboardRecorte.test.tsx`),
  `PainelLateralExecutivo.test.tsx`, `ModoApresentacao.test.tsx`
  (navegação por teclado, Esc para sair).
- **Hooks (frontend)**: `useComparacaoExecutiva.test.ts` (2 chamadas
  paralelas, tratamento de erro parcial — A ok, B falha), `useInsightsExecutivos.test.ts`,
  `useModoApresentacao.test.ts`.
- **Integração de página**: `CentralAnalitica.test.tsx` ganha casos novos
  para a branch `visualizacao === "executivo"` (entrada, volta preservando
  filtro, comparação, saída de apresentação) — mesmo arquivo já existente,
  só mais casos.
- **Backend**: testes unitários para cada extensão aditiva de § 8.2
  (nova dimensão de distribuição, novo campo de relatório) seguindo
  exatamente o padrão já usado pelas 6 dimensões atuais em
  `backend/tests/unit/test_distribuicoes.py`.
- **Regressão obrigatória**: toda a suíte já existente (backend +
  frontend) continua rodando e passando sem nenhuma alteração de
  comportamento do Modo Operacional — critério de aceite transversal,
  igual ao já praticado em todas as Sprints anteriores da V2.

## 12. Roadmap em micro-sprints

Proposto, não vinculante — cada micro-sprint termina com homologação
antes da próxima, mesmo critério já usado pelo roadmap da V2
(`v2-plano-tecnico.md § 18`). Numeração provisória sob Sprint 21.

- **21.1 — Extensões aditivas de backend** (§ 8.2, as 3 dimensões novas de
  distribuição + testes). Sem nenhuma UI nova ainda.
- **21.2 — Shell do Modo Executivo + KPIs.** `ModoExecutivo.tsx`,
  `CabecalhoExecutivo.tsx`, `GradeKpisExecutivos.tsx`, botão de entrada,
  navegação de volta — só os 4 KPIs já existentes + "Membros × Servidores"
  (usa filtro, não a dimensão nova ainda) + "Atenção" (via diagnóstico).
- **21.3 — Grade de gráficos executivos.** `CartaoGraficoExecutivo.tsx`
  sobre as dimensões já existentes + as novas de 21.1 (município, motivo,
  situação, origem×destino, membros×servidores, unidade solicitante,
  transporte, evolução).
- **21.4 — Drill-down e painel lateral.** `PainelLateralExecutivo.tsx`,
  reaproveitando `refinar()`.
- **21.5 — Insights automáticos.** `lib/insightsExecutivos.ts` +
  `PainelInsights.tsx`.
- **21.6 — Comparação.** `useComparacaoExecutiva`, `PainelComparacao.tsx`,
  variação percentual nos KPIs e gráficos.
- **21.7 — Zoom temporal e interação avançada.** Seleção por arraste,
  tooltip avançado, teclado.
- **21.8 — Modo apresentação.** `useModoApresentacao`, `ModoApresentacao.tsx`,
  Fullscreen API, navegação por seção.
- **21.9 — Exportação executiva.** `ModalExportacaoExecutiva.tsx`,
  extensão de `POST /relatorios` (§ 8.2, última linha).
- **21.10 — Auditoria dedicada + homologação com Planilha Oficial
  real** — mesmo critério já obrigatório desde a Sprint 19.9/19.10 (nunca
  só fixture sintética antes de fechar a etapa).

## 13. Rollback

- Cada micro-sprint de 21.1 a 21.9 é aditiva e isolada: reverter qualquer
  uma delas nunca afeta o Modo Operacional (nenhum arquivo dele é
  modificado). O rollback mais simples é remover o botão de entrada
  (§ 1 do wireframe) — sem ele, o Modo Executivo fica inacessível pela UI
  mesmo que o código continue no repositório.
- As extensões de backend (§ 8.2) são estritamente aditivas (novos
  valores de enum/campo opcional) — remover a UI que as consome não
  quebra nenhum contrato já em uso pelo Modo Operacional.
- Nenhuma migração de schema SQLite é necessária para o Modo Executivo
  (todas as colunas usadas já existem) — não há rollback de banco de
  dados a planejar.

## 14. Auditoria

Mesma disciplina já obrigatória em toda Sprint da V2
(`v2-plano-tecnico.md § 16`): ao final de 21.10, auditoria dedicada
cobrindo:

- Diff completo desde o último commit homologado — confirmar que
  `DashboardRecorte.tsx`, `PainelDiagnostico.tsx`, `ModalRelatorio.tsx`,
  `TabelaDiarias.tsx` e todos os componentes base (`Botao`/`Badge`/
  `Alerta`/`Cartao`) não têm nenhum diff.
- Navegação real no Electron (não só testes automatizados) pelos dois
  modos, incluindo a transição de ida e volta preservando o recorte.
- Validação contra a Planilha Oficial real (mesmo protocolo já usado nas
  Sprints 19.9/19.10 e na Sprint 20) — números do Executivo batendo
  exatamente com os números já homologados do Modo Operacional para o
  mesmo recorte (nenhuma divergência de cálculo entre as duas telas).
- Auditoria de acessibilidade dedicada ao Modo Apresentação (navegação
  100% por teclado, sem depender de mouse).
- Auditoria de desempenho com o volume real de diárias, medindo tempo de
  carregamento do Executivo com e sem comparação ativa (confirma ou
  refuta o risco de § 9 com dado real, não estimado).
