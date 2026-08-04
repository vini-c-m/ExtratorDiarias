# Central Analítica — UX e Wireframes (Sprint 17.2)

> **Sprint 17.2 — exclusivamente experiência do usuário (UX), fluxos e
> wireframes. Nenhuma linha de código de produção foi escrita nesta
> Sprint.** Sem React, sem Electron, sem SQLite, sem API, sem backend. A
> arquitetura da Sprint 17.1 (`docs/central-analitica/README.md`, aprovada
> em 2026-07-30) **não é alterada nem reaberta aqui** — todas as suas
> decisões (as 9 formalizadas em `§ 0.1` e as herdadas em `§ 0.2`)
> permanecem válidas e são tratadas como restrição de projeto, não como
> hipótese. Implementação só começa após aprovação explícita desta UX,
> seguindo a mesma disciplina da Sprint 11 → 12 → 13.

> **✅ UX aprovada em 2026-07-30**, sem revisões estruturais — aprovação
> destacou o alinhamento com a arquitetura da Sprint 17.1, a ordem
> jornada-antes-de-tela e a reutilização integral do Design System. A
> Sprint 17.2 está concluída; a próxima etapa, seguindo a ordem recomendada
> de `docs/central-analitica/README.md § 12`, é a **Sprint 17.3 — Base
> Local em SQLite** (esquema, reconstrução, sincronização automática e
> manual — sem nenhuma tela nova, primeira etapa de código real do módulo).

## Sumário

- [Fase 1 — Compreensão do usuário](#fase-1--compreensão-do-usuário)
- [Fase 2 — Jornada do usuário](#fase-2--jornada-do-usuário)
- [Fase 3 — Fluxos de navegação](#fase-3--fluxos-de-navegação)
- [Fase 4 — Arquitetura da informação](#fase-4--arquitetura-da-informação)
- [Fase 5 — Wireframes](#fase-5--wireframes)
- [Fase 6 — Validação da experiência](#fase-6--validação-da-experiência)
- [Anexo A — Pesquisa](#anexo-a--pesquisa)
- [Anexo B — Filtros](#anexo-b--filtros)
- [Anexo C — KPIs](#anexo-c--kpis)
- [Anexo D — Tabelas](#anexo-d--tabelas)
- [Anexo E — Dashboards](#anexo-e--dashboards)
- [Anexo F — Relatórios](#anexo-f--relatórios)
- [Anexo G — Indicador de sincronização](#anexo-g--indicador-de-sincronização)
- [Anexo H — Estados da interface](#anexo-h--estados-da-interface)
- [Anexo I — Responsividade](#anexo-i--responsividade)
- [Anexo J — Componentes reutilizados do Design System](#anexo-j--componentes-reutilizados-do-design-system)
- [Riscos de UX](#riscos-de-ux)
- [Recomendações](#recomendações)
- [Fora do escopo](#fora-do-escopo)
- [Resultado desta Sprint](#resultado-desta-sprint)

---

## Fase 1 — Compreensão do usuário

Reaproveita integralmente `docs/central-analitica/README.md § 4`, sem
reabrir a definição — aqui ela é traduzida em prioridades de UX.

**Quem utiliza:** os dois perfis já definidos na arquitetura, sem sistema
de conta/login (uso do mesmo app por qualquer pessoa da DIMCAC):

| Perfil | Como usa a Central Analítica |
| --- | --- |
| **Servidor operacional** | Consultas pontuais e rápidas, no meio de outra tarefa (ex.: conferir um SEI antes de responder um e-mail). Já é usuário da Central de Conferência hoje — chega esperando a mesma agilidade. |
| **Gestor/coordenador** | Sessões mais longas e menos frequentes: abre para entender o panorama de um período, montar um relatório, comparar municípios/servidores. |

**Problemas que ela resolve** (herdado da Seção 1 da arquitetura): elimina
a necessidade de abrir a Planilha Oficial no Excel e montar filtro/tabela
dinâmica manualmente numa planilha de 29 colunas, várias delas fórmulas.

**Tarefas mais frequentes → menos frequentes** (definem a ordem de
prioridade de todo o resto deste documento):

1. Pesquisa pontual por SEI ou CPF ("esse processo é esse mesmo?", "esse
   CPF já tem diária?").
2. Consultar o histórico de diárias de um servidor específico.
3. Checar os indicadores gerais do período atual (visão rápida, sem
   intenção de pesquisa específica).
4. Filtrar por período/município/motivo para responder uma pergunta pontual
   da chefia.
5. Gerar e exportar um relatório periódico (semanal/mensal).

**O que precisa aparecer sem nenhum clique** (visível assim que o módulo
abre): quantas diárias e qual valor total no período corrente, e quando a
Base Local foi sincronizada pela última vez. Justifica a decisão (Fase 4)
de o Dashboard ser a aba padrão de entrada — quem só quer "bater o olho"
não precisa navegar para lugar nenhum.

**Tarefas que exigem o mínimo de cliques possível:**
- Pesquisa rápida (1 campo + Enter, disponível em qualquer aba — Fase 4).
- Abrir o detalhe de um resultado (1 clique, sem trocar de tela — Anexo D).
- Sincronizar manualmente (1 clique, sempre visível — Anexo G).

**Tarefas que podem (e devem) exigir mais atenção do usuário** — aqui um
pouco mais de fricção é desejável, porque o custo de errar é maior que o
custo de mais um clique:
- Combinar múltiplos filtros antes de uma exportação (Anexo B) — errar o
  recorte gera um relatório errado entregue a terceiros.
- Gerar um relatório (Anexo F) — sempre passa por uma pré-visualização
  antes de exportar, nunca "um clique direto para o PDF".

**Prioridades do usuário, em ordem:** (1) responder rápido uma pergunta
pontual, (2) nunca duvidar se o dado está atualizado, (3) nunca exportar
algo errado para outra pessoa, (4) não precisar aprender uma ferramenta
nova (reaproveitar tudo que a Central de Conferência já ensinou).

---

## Fase 2 — Jornada do usuário

Sete jornadas relevantes, cobrindo as tarefas da Fase 1 mais os casos de
borda que a arquitetura já previu (primeira utilização, dados
desatualizados). Nenhuma tela do documento (Fase 5) existe fora de uma
destas jornadas.

### J1 — Pesquisa rápida por SEI ou CPF

- **Objetivo:** confirmar a existência/situação de um processo específico,
  o mais rápido possível.
- **Passos:** entra no módulo (qualquer aba) → digita na barra de pesquisa
  global → Enter → é levado à aba Pesquisa já com o resultado.
- **Decisões do usuário:** nenhuma antes da busca; depois, decidir se abre
  o detalhe do resultado.
- **Erros possíveis:** termo não encontrado; termo ambíguo (ex.: CPF com
  múltiplas diárias — não é erro, é lista).
- **Retorno esperado:** resultado (ou "nada encontrado") em menos de 2
  segundos, sem sair da tela em que já estava.

### J2 — Histórico completo de um servidor

- **Objetivo:** ver todas as diárias já registradas para um CPF.
- **Passos:** pesquisa por CPF (J1) ou pelo nome → resultado agrupado por
  servidor → abre o histórico → opcionalmente filtra por período dentro do
  próprio histórico.
- **Decisões:** ordenar por data; exportar esse recorte específico ou não.
- **Erros possíveis:** nome ambíguo (mais de um servidor com nome parecido)
  — resolvido com lista de resultados, nunca uma escolha "adivinhada".
- **Retorno esperado:** lista completa, ordenada, com contagem total visível.

### J3 — Visão geral via Dashboard

- **Objetivo:** entender o panorama do período corrente sem nenhuma
  pergunta específica em mente.
- **Passos:** abre o módulo (Dashboard é a aba padrão) → observa KPIs →
  opcionalmente rola para tendência/ranking/distribuição.
- **Decisões:** trocar o período do filtro global; aprofundar em algum
  indicador (ex.: clicar num município do ranking para ver as diárias
  daquele município na Pesquisa).
- **Erros possíveis:** nenhum inerente — é uma jornada de leitura.
- **Retorno esperado:** compreensão do panorama em poucos segundos, sem
  precisar interpretar uma planilha.

### J4 — Filtrar e exportar um recorte específico

- **Objetivo:** responder uma pergunta da chefia com um recorte preciso
  (ex.: "diárias para Araripina em junho").
- **Passos:** define período + município no filtro → confere o resultado
  na tabela/dashboard → exporta (PDF ou Excel).
- **Decisões:** quais filtros combinar; qual formato exportar.
- **Erros possíveis:** filtro sem nenhum resultado; combinação de filtros
  que o usuário esquece de limpar depois (ver Anexo B, persistência).
- **Retorno esperado:** arquivo exportado com o recorte exato visto na
  tela, timestamp de sincronização carimbado nele.

### J5 — Gerar relatório periódico (semanal/mensal)

- **Objetivo:** produzir o relatório de prestação de contas pronto para
  repassar.
- **Passos:** aba Relatórios → escolhe semana ou mês → pré-visualiza →
  exporta ou imprime.
- **Decisões:** semanal vs. mensal; PDF vs. Excel vs. impressão direta.
- **Erros possíveis:** período sem nenhum dado (semana/mês sem diárias
  registradas) — precisa de um estado vazio claro, não um relatório em
  branco sem explicação.
- **Retorno esperado:** arquivo/impressão gerado com o período correto e o
  timestamp de sincronização visível no próprio documento.

### J6 — Perceber e resolver dados desatualizados

- **Objetivo:** o usuário precisa confiar que está vendo o dado certo.
- **Passos:** entra no módulo → verificação automática de frescor roda
  (decisão 1, arquitetura) → se desatualizado, vê o aviso → decide
  sincronizar agora ou continuar (ciente do risco).
- **Decisões:** sincronizar agora vs. seguir mesmo assim.
- **Erros possíveis:** sincronização manual falha (planilha aberta em
  outro programa, por exemplo) — precisa de retorno claro, sem travar o
  resto do módulo (decisão 5/"bloqueio por ação", herdada).
- **Retorno esperado:** ou o dado é confirmado fresco (aviso some), ou o
  usuário segue ciente e informado — nunca no escuro.

### J7 — Primeira utilização (nenhuma sincronização ainda existe)

- **Objetivo:** entender por que o módulo está vazio na primeira vez.
- **Passos:** abre o módulo pela primeira vez → não há Base Local
  construída ainda → vê uma explicação clara, não um dashboard quebrado.
- **Decisões:** aguardar a primeira sincronização automática (próximo
  Processamento) ou não há ação possível nesta jornada (a Sprint 17.1 não
  prevê construção sob demanda de uma base totalmente vazia sem nenhum
  Processamento já ter ocorrido — ver Fase 6, risco).
- **Retorno esperado:** mensagem explicativa, nunca uma tela genérica de
  erro/vazio indistinguível de uma falha.

---

## Fase 3 — Fluxos de navegação

```
Hub
 └─▶ Central Analítica (abre sempre em Dashboard)
      │
      ├─▶ [barra de pesquisa global, disponível em qualquer aba]
      │     └─▶ Aba Pesquisa (com resultado já carregado)
      │           └─▶ Resultado (lista)
      │                 └─▶ Detalhamento (painel lateral, sem trocar de tela)
      │                       └─▶ Exportar este registro
      │
      ├─▶ Aba Pesquisa
      │     ├─▶ Pesquisa rápida → Resultado → Detalhamento
      │     └─▶ Pesquisa avançada (filtros) → Resultado → Detalhamento
      │
      ├─▶ Aba Dashboard
      │     ├─▶ KPIs (leitura)
      │     ├─▶ Tendência temporal (leitura)
      │     ├─▶ Ranking → clicar num item → Aba Pesquisa (filtrada por aquele item)
      │     └─▶ Distribuição (leitura)
      │
      └─▶ Aba Relatórios
            └─▶ Escolher período (semanal/mensal)
                  └─▶ Pré-visualização
                        ├─▶ Exportar PDF
                        ├─▶ Exportar Excel
                        └─▶ Imprimir

 [em qualquer ponto] ── "← Hub" ──▶ Hub (sempre reversível, mesmo padrão de Processamento/Conferência)
 [em qualquer ponto] ── aviso de dados desatualizados ──▶ Sincronizar agora (permanece na mesma tela)
```

Três propriedades deliberadas, todas reaproveitando um comportamento já
existente em outro módulo:

- **Nunca é preciso trocar de aba para pesquisar** — mesmo princípio de
  "menor número de cliques" da Fase 1. A barra de pesquisa global fica
  fixa acima das 3 abas.
- **Ranking → Pesquisa é um atalho, não uma tela nova** — clicar em "Recife"
  no ranking de municípios abre a aba Pesquisa já filtrada por Recife, em
  vez de o usuário ter que redigitar o filtro. Reaproveita o mesmo
  mecanismo de filtro da Aba Pesquisa, só pré-preenchido.
- **Voltar ao Hub sempre pelo mesmo caminho** ("← Hub" no Cabeçalho), sem
  nenhum outro ponto de saída — idêntico a Processamento e Conferência.

---

## Fase 4 — Arquitetura da informação

**O que aparece primeiro (sem nenhuma ação do usuário):**
1. Timestamp de sincronização (decisão 6 da arquitetura — obrigatório,
   sempre visível, mesmo lugar em toda tela do módulo).
2. Barra de pesquisa global.
3. KPIs (a aba Dashboard é a entrada padrão do módulo — ver justificativa
   abaixo).

**Por que o Dashboard é a aba padrão de entrada, não a Pesquisa:** a Fase 1
mostrou que "o que precisa aparecer sem nenhum clique" são os indicadores
gerais e o timestamp — não um formulário de busca vazio. Um formulário de
busca vazio não entrega nada até o usuário agir; um KPI entrega valor
imediato para os dois perfis (o operacional também se beneficia de ver o
panorama, mesmo que sua tarefa mais frequente seja pesquisa pontual — e a
pesquisa pontual continua a zero cliques de distância, via barra global,
então não perde velocidade por o Dashboard ser a entrada).

**Ordem de prioridade visual dentro de cada aba:**

| Aba | 1º (mais destaque) | 2º | 3º (menor destaque, mais denso) |
| --- | --- | --- | --- |
| Dashboard | KPIs (linha de cartões grandes) | Tendência temporal (largura total) | Ranking + Distribuição (lado a lado, mais compactos) |
| Pesquisa | Campo de busca / filtros aplicados (chips) | Contagem de resultados | Tabela de resultados |
| Relatórios | Seletor de período | Pré-visualização | Botões de exportação (ação final, mas sempre visíveis, nunca escondidos em scroll) |

**O que fica secundário/oculto até ser pedido:**
- Filtros avançados (Anexo B) — colapsados por padrão, um clique para
  expandir. A pesquisa rápida (1 campo) nunca fica atrás de um clique.
- Detalhamento de um registro — só aparece ao clicar num resultado
  (painel lateral, Anexo D), nunca pré-carregado para todos os resultados
  da lista.
- Avisos de qualidade de dados (linhas ignoradas na sincronização, herdado
  de `AVISOS_SINCRONIZACAO`) — acessíveis a partir do indicador de
  sincronização (Anexo G), não exibidos por padrão (não é uma informação
  do dia a dia dos dois perfis, é diagnóstico).

**Agrupamento:** tudo que é "sobre o momento atual dos dados" (timestamp,
avisos de frescor) fica isolado numa única faixa, sempre no mesmo lugar,
nunca misturado com o conteúdo analítico em si — reforça a decisão 6 sem
poluir (a faixa é fina e discreta quando tudo está normal, cresce só
quando há algo a dizer).

---

## Fase 5 — Wireframes

Larguras de referência seguem a mesma convenção já usada pelo projeto (cada
tela escolhe sua própria largura máxima, não há container global — herdado
de `Cabecalho`/`App.tsx`, ver pesquisa de apoio). Como a Central Analítica é
a tela mais densa do app até hoje (dashboards + tabelas), propõe-se
`max-w-6xl` — mesmo padrão, só um valor ainda não usado por nenhuma tela.

### 5.1 Hub — terceiro card

```
┌───────────────────────────────┐ ┌───────────────────────────────┐ ┌───────────────────────────────┐
│ [📄]  Processamento da        │ │ [☑]  Central Inteligente      │ │ [📊]  Central Analítica        │
│       Planilha                │ │      de Conferência           │ │                                │
│                                │ │                                │ │                                │
│ Extrai diárias de PDFs SEI e  │ │ Verifica cadastro e           │ │ Pesquise, filtre e acompanhe   │
│ preenche a planilha oficial.  │ │ duplicidade antes de          │ │ indicadores das diárias já     │
│                                │ │ registrar uma diária.         │ │ registradas.                   │
│                          Abrir │ │                          Abrir │ │                          Abrir │
│                            →  │ │                            →  │ │                            →  │
└───────────────────────────────┘ └───────────────────────────────┘ └───────────────────────────────┘
     glow roxo (existente)             glow ciano (existente)            glow azul (ver Anexo J)
```

### 5.2 Tela principal (shell do módulo)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ← Hub                                              ⚙        [status app] │  ← Cabeçalho já existente
├──────────────────────────────────────────────────────────────────────────┤
│  🕐 Base Local sincronizada às 14:32          [ Sincronizar agora ]      │  ← Anexo G
├──────────────────────────────────────────────────────────────────────────┤
│  🔍  [ Pesquisar por SEI, CPF, servidor ou município...            ] ⏎   │  ← barra global, Fase 3
├──────────────────────────────────────────────────────────────────────────┤
│   Dashboard      Pesquisa      Relatórios                                │  ← abas, Dashboard ativa por padrão
├──────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│                         (conteúdo da aba ativa)                          │
│                                                                            │
└──────────────────────────────────────────────────────────────────────────┘
```

### 5.3 Aba Pesquisa

```
   Dashboard      [Pesquisa]      Relatórios
──────────────────────────────────────────────────────────────────────────
  🔍  [ araripina                                                    ] ⏎
  Filtros ▾  (colapsado — ver Anexo B)

  1.248 resultados · ordenados por período (mais recente primeiro)

  ┌────────────────────┬──────────────────┬───────────────┬───────────────┬────────────┐
  │ SEI                │ Servidor          │ Período        │ Destino        │ Valor      │
  ├────────────────────┼──────────────────┼───────────────┼───────────────┼────────────┤
  │ 19.20...0720/2024  │ João da Silva     │ 08–10/01/2025 │ Araripina-PE   │ R$ 480,00 │ ▸
  │ 19.20...0331/2024  │ Maria Souza       │ 22–23/12/2024 │ Araripina-PE   │ R$ 320,00 │ ▸
  │ ...                │                   │                │                │            │
  └────────────────────┴──────────────────┴───────────────┴───────────────┴────────────┘
                                                                 ‹ 1  2  3 … 50 ›
```

### 5.4 Detalhamento (painel lateral, sobre a lista — sem trocar de tela)

```
──────────────────────────────────────────────────────────── ┌───────────────────────────────┐
  1.248 resultados                                            │  Processo SEI              ✕ │
  ┌──────────────────┬─────────┬────────┐                     │  19.20.0903.0030720/2024-36   │
  │ SEI               │ ...     │        │  (tabela ao fundo,  ├───────────────────────────────┤
  │ 19.20...0720/2024 │ ...     │  ▸     │   levemente         │  Servidor                     │
  │                    │         │        │   escurecida)       │  João da Silva               │
  └──────────────────┴─────────┴────────┘                     │  Cargo · Previdência           │
                                                                │                                │
                                                                │  Período                      │
                                                                │  08/01/2025 – 10/01/2025      │
                                                                │                                │
                                                                │  Trecho                       │
                                                                │  Recife → Araripina-PE        │
                                                                │                                │
                                                                │  Motivo · Transporte · Valor  │
                                                                │                                │
                                                                │  [ Exportar este registro ]   │
                                                                └───────────────────────────────┘
```

### 5.5 Aba Dashboard

```
   [Dashboard]      Pesquisa      Relatórios
──────────────────────────────────────────────────────────────────────────
  Período:  [ Últimos 30 dias ▾ ]                          (filtro global)

  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐
  │ Processos │ │ Diárias   │ │ Valor     │ │ Valor     │ │ Servidores│
  │           │ │           │ │ total     │ │ médio     │ │ atendidos │
  │   1.248   │ │   1.310   │ │ R$ 412 mil│ │ R$ 330,00 │ │    412    │
  └───────────┘ └───────────┘ └───────────┘ └───────────┘ └───────────┘

  ┌────────────────────────────────────────────────────────────────────┐
  │ Tendência (mês a mês)                                              │
  │   ▂▃▅▆▇▆▅▄▃▂▃▅   [gráfico de linha — biblioteca a definir na 17.5] │
  └────────────────────────────────────────────────────────────────────┘

  ┌──────────────────────────────┐  ┌──────────────────────────────┐
  │ Top municípios                │  │ Distribuição por motivo       │
  │ 1. Recife         218  ▸      │  │  [gráfico — a definir na 17.5]│
  │ 2. Araripina      164  ▸      │  │                                │
  │ 3. Petrolina      140  ▸      │  │                                │
  └──────────────────────────────┘  └──────────────────────────────┘
```

### 5.6 Aba Relatórios

```
   Dashboard      Pesquisa      [Relatórios]
──────────────────────────────────────────────────────────────────────────
  Tipo:  ( • ) Semanal   ( ) Mensal
  Período: [ Semana de 21–27/07/2026 ▾ ]

  ┌────────────────────────────────────────────────────────────────────┐
  │ Pré-visualização                                                    │
  │  Relatório de Diárias — 21 a 27/07/2026                            │
  │  Sincronizado às 14:32 · 86 processos · R$ 28.400,00                │
  │  (mesma tabela/KPIs já vistos nas outras abas, agora em formato     │
  │   de documento)                                                     │
  └────────────────────────────────────────────────────────────────────┘

  [ Exportar PDF ]   [ Exportar Excel ]   [ Imprimir ]
```

---

## Fase 6 — Validação da experiência

Checagem cruzada contra a Fase 1 (prioridades do usuário):

| Prioridade do usuário | Como esta UX atende |
| --- | --- |
| Responder rápido uma pergunta pontual | Barra de pesquisa global sempre visível, 0 cliques de navegação (Fase 3/4). |
| Nunca duvidar se o dado está atualizado | Timestamp obrigatório em toda tela + verificação automática ao entrar (Anexo G), herdado da decisão 6/1 da arquitetura. |
| Nunca exportar algo errado | Relatórios sempre passam por pré-visualização antes de exportar (5.6); filtros aplicados ficam visíveis como chips antes de qualquer exportação (Anexo B). |
| Não aprender ferramenta nova | 100% componentes/tokens já existentes (Anexo J); mesmo padrão de navegação "← Hub" e abas internas sem rota nova. |

Checagem cruzada contra a Fase 2 (jornadas): todas as 7 jornadas (J1–J7)
têm uma tela ou estado correspondente nas Fases 5 e nos Anexos G/H — nenhum
elemento de tela foi desenhado sem estar a serviço de uma jornada.

---

## Anexo A — Pesquisa

| Modo | Como funciona | Estado sem resultado |
| --- | --- | --- |
| **Rápida** | 1 campo, sempre visível (barra global, Fase 3). Aceita SEI, CPF ou nome — o backend decide o tipo pelo formato (arquitetura, `§ 13` pergunta 4, a confirmar tecnicamente na 17.3+, sem impacto na UX: o campo é sempre um só). | "Nada encontrado para '...'" + sugestão de checar a grafia/formato — nunca uma tela em branco sem explicação. |
| **Avançada** | Painel colapsado (Anexo B) com campos nomeados: SEI, CPF, servidor, município, período, motivo, situação — combináveis. | Mesmo estado acima, mas com o botão "Limpar filtros" em destaque, já que é mais provável o usuário ter combinado filtros demais. |
| **Por SEI** | Busca exata (SEI é identificador único — decisão 8 da arquitetura). Resultado único abre direto o Detalhamento, sem passar por uma lista de 1 item. |
| **Por CPF** | Busca exata, resultado é sempre uma lista (um CPF pode ter várias diárias — RN-02 herdada). |
| **Por servidor (nome)** | Busca parcial/aproximada — pode retornar mais de um servidor com nome parecido; cada um agrupa suas diárias. |
| **Parcial** | Em qualquer campo de texto, busca por trecho (não exige o valor completo) — reduz fricção para quem não tem o dado inteiro em mãos. |
| **Ausência de resultados** | Estado dedicado (ver Anexo H) — nunca uma tabela vazia sem título/explicação. |

---

## Anexo B — Filtros

- **Onde vivem:** um filtro de **período** é global — uma única escolha
  afeta Dashboard e Relatórios ao mesmo tempo (Fase 4), porque é o
  denominador comum das jornadas J3/J4/J5. Os demais filtros (município,
  servidor, motivo, situação) vivem dentro da aba Pesquisa, colapsados sob
  "Filtros ▾" por padrão.
- **Múltiplos filtros:** combináveis (E lógico, herdado da arquitetura
  Seção 2.2). Cada filtro ativo vira um **chip removível** logo abaixo da
  barra de busca — visível mesmo com o painel de filtros fechado, para o
  usuário nunca esquecer que um filtro está reduzindo o que ele está vendo.
- **Limpeza:** botão único "Limpar filtros", sempre ao lado dos chips
  quando há pelo menos um filtro ativo.
- **Persistência:** filtros duram enquanto o usuário permanece dentro do
  módulo nesta sessão do app — resetam ao voltar ao Hub ou fechar o app.
  Nenhum armazenamento novo é introduzido (mesma simplicidade já praticada:
  nenhuma tela do app hoje persiste estado de UI entre execuções, exceto a
  configuração da planilha em si).
- **Comportamento:** aplicar um filtro nunca é uma ação separada
  ("Aplicar") — atualiza a lista/dashboard imediatamente ao mudar um
  campo, com um pequeno indicador de carregamento (Anexo H), reduzindo
  cliques (Fase 1).

---

## Anexo C — KPIs

| KPI | Prioridade visual | Justificativa |
| --- | --- | --- |
| Total de processos | Igual às demais, 1ª posição (esquerda) | Resposta mais básica de "quanto está acontecendo". |
| Total de diárias | Igual, 2ª posição | Pode divergir de processos (mais de uma diária por processo em alguns fluxos). |
| Valor total | Igual, 3ª posição | Pergunta financeira mais comum do perfil gestor. |
| Valor médio | Igual, 4ª posição | Complementa o total, contextualiza. |
| Servidores atendidos | Igual, 5ª posição | Menos perguntado no dia a dia, mas fecha o panorama. |

Todos com o mesmo tamanho (`Cartao` tamanho "grande", já existente) numa
única linha — sem hierarquia artificial entre eles (nenhum é "mais
importante" a ponto de ficar maior); a ordem esquerda→direita já comunica
prioridade, reaproveitando a mesma leitura já usada em `ResumoResultado.tsx`.
Grid responsivo herdado do mesmo padrão (`grid-cols-2 → sm:3 → lg:5`).

---

## Anexo D — Tabelas

- **Colunas (Pesquisa):** SEI, Servidor, Período, Destino, Valor — as 5
  informações que respondem "é esse processo?" sem precisar abrir o
  detalhe. Colunas adicionais (motivo, transporte etc.) só no Detalhamento.
- **Ordenação:** clique no cabeçalho da coluna alterna asc/desc; padrão
  inicial = período decrescente (mais recente primeiro, mesmo raciocínio
  de "o que é mais provável ser perguntado agora").
- **Paginação:** por página vinda do servidor (a lista nunca carrega
  milhares de linhas de uma vez no navegador) — página de ~25–50 linhas,
  navegação numérica simples no rodapé da tabela.
- **Seleção/abertura de detalhe:** clique em qualquer linha abre o
  Detalhamento como painel lateral (5.4) sobre a própria lista — a tabela
  nunca é substituída, só ganha uma sobreposição parcial. Fechar o painel
  (✕ ou clique fora) volta exatamente ao mesmo ponto de rolagem.
- **Comportamento com milhares de registros:** contagem total sempre
  visível acima da tabela ("1.248 resultados"); paginação no servidor evita
  qualquer travamento de rolagem; se a largura da tela não comportar todas
  as colunas (Anexo I), a tabela rola horizontalmente dentro do próprio
  contêiner — o restante da tela (filtros, abas) nunca rola junto.

---

## Anexo E — Dashboards

Só a experiência — nenhuma biblioteca de gráfico escolhida, nenhuma
implementação (decisão explícita do pedido, mantida).

- **Organização (topo → base):** KPIs → Tendência temporal → Ranking +
  Distribuição — ordem de "mais resumido" para "mais detalhado" (mesma
  lógica de arquitetura da informação da Fase 4).
- **Hierarquia:** KPIs sempre em destaque máximo (topo, largura total);
  Tendência ocupa a largura toda (é a visão mais "olhada de longe");
  Ranking e Distribuição dividem a largura, lado a lado, por serem mais
  densos/comparativos entre si.
- **Agrupamento:** cada seção é um contêiner próprio (mesma "superfície
  vidro" dos cards existentes), nunca elementos soltos direto no fundo da
  página — reforça que são blocos de leitura independentes.
- **Interatividade mínima esperada** (sem definir biblioteca): itens do
  ranking são clicáveis e levam à Pesquisa já filtrada (Fase 3) — é a
  única interação de dashboard exigida por esta Sprint; gráficos de
  tendência/distribuição são só leitura nesta fase.

---

## Anexo F — Relatórios

| Formato | Experiência |
| --- | --- |
| **PDF** | Sempre precedido de pré-visualização (5.6) — o PDF exportado é visualmente idêntico ao que já foi visto na tela, incluindo o timestamp de sincronização carimbado (decisão 6). Diálogo nativo "Salvar Como" (Electron, já existente para o relatório de Processamento). |
| **Excel** | Mesmo recorte de dados da pré-visualização, em formato tabular — não é "a planilha oficial", é um extrato derivado, e deve deixar isso textualmente claro (ex.: nome do arquivo/cabeçalho "Extrato — não é a Planilha Oficial"), para nunca ser confundido com o documento administrativo real (reforça a separação Planilha Oficial × Base Local já estabelecida na arquitetura). |
| **Impressão** | Mesmo conteúdo da pré-visualização, layout adaptado para papel (sem os elementos de navegação do app — abas, barra de pesquisa). Timestamp de sincronização também impresso. |

---

## Anexo G — Indicador de sincronização

Cinco estados exigidos pela arquitetura, projetados para nunca poluir a
tela quando tudo está normal:

```
Normal (estado mais comum, discreto):
  🕐  Base Local sincronizada às 14:32                [ Sincronizar agora ]

Verificando (rápido, ao entrar no módulo — decisão 1):
  ⏳  Verificando atualizações...

Sincronizando (após clique manual ou verificação detectar mudança):
  🔄  Sincronizando...                                          (desabilita o botão)

Sincronização concluída (confirmação breve, some sozinha em poucos segundos):
  ✅  Base Local atualizada

Falha na sincronização (persiste até o usuário agir — nunca some sozinha):
  ⚠️  Falha ao sincronizar às 14:32 — dados podem estar desatualizados
                                                    [ Tentar novamente ]

Necessidade de atualização detectada (dados podem ter mudado fora do app):
  🟠  Os dados podem estar desatualizados          [ Sincronizar agora ]
```

- **Cores:** normal/verificando/sincronizando usam a variante `info`
  (ciano); concluído usa `sucesso` (esmeralda); "necessidade de
  atualização" usa `aviso` (âmbar); **falha usa `erro` (vermelho)** — e
  isso está correto pela regra herdada (vermelho é reservado a falha
  técnica do próprio sistema, nunca a veredito de negócio; uma
  sincronização que falhou é exatamente esse caso, não uma exceção à regra).
- **Onde fica:** uma faixa fina, logo abaixo do Cabeçalho, acima da barra
  de pesquisa (5.2) — presente nas 3 abas, nunca dentro do conteúdo de
  cada uma (Fase 4, "agrupamento").
- **Sem poluir:** no estado normal, é só uma linha de texto discreta com
  um botão secundário — não é um banner grande nem chamativo. Só cresce em
  destaque visual (cor de aviso/erro) quando há algo a comunicar.

---

## Anexo H — Estados da interface

| Aba | Carregando | Vazio (nunca sincronizado — J7) | Erro | Sem resultados | Sincronizando | Dados desatualizados |
| --- | --- | --- | --- | --- | --- | --- |
| **Dashboard** | Esqueleto dos 5 cartões de KPI + placeholders dos gráficos | "Ainda não há dados sincronizados. Assim que o primeiro processamento for concluído, os indicadores aparecem aqui." | `Alerta` erro: "Não foi possível carregar os indicadores." + tentar novamente | *(não se aplica — dashboard sempre mostra algo, mesmo que zerado)* | Faixa do Anexo G ativa; conteúdo permanece visível (não pisca/some) | Faixa de aviso do Anexo G; conteúdo permanece visível, apenas marcado como potencialmente desatualizado |
| **Pesquisa** | Esqueleto de 3–4 linhas de tabela | Mesmo texto do Dashboard, adaptado: "Ainda não há dados para pesquisar." | `Alerta` erro na região da lista | "Nada encontrado para '...'" + sugestão (Anexo A) | Igual acima | Igual acima |
| **Relatórios** | Esqueleto da pré-visualização | Mesmo texto, botões de exportação desabilitados | `Alerta` erro na pré-visualização | "Nenhum dado no período selecionado — escolha outro período." | Igual acima | Igual acima (mas aqui vale reforçar: exportar com dado desatualizado exige confirmação extra — ver Riscos) |

Todos os estados de "carregando" reaproveitam o mesmo padrão visual já
existente (`Botao carregando`, animação de entrada) — nenhum esqueleto novo
de skeleton-loading está documentado no design system hoje; recomenda-se
usar a mesma superfície "vidro" com opacidade reduzida como placeholder,
decisão de detalhe visual a confirmar na implementação (não bloqueia esta
aprovação de UX).

---

## Anexo I — Responsividade

Mesma filosofia já praticada (Fase de pesquisa: grids que ganham colunas
com a largura, nunca uma tela "modo mobile" separada):

| Faixa | KPIs (Anexo C) | Ranking + Distribuição | Tabela (Anexo D) |
| --- | --- | --- | --- |
| Notebook (~1024–1366px, largura mínima real do app — janela Electron parte de 1024px) | 2 por linha | Empilhados (1 coluna) | Rola horizontalmente dentro do próprio contêiner se necessário |
| Full HD (~1920px) | 5 por linha (todos numa linha) | Lado a lado (2 colunas) | Todas as colunas visíveis sem rolagem |
| Ultrawide (2560px+) | 5 por linha, cartões com mais respiro (não esticam infinitamente — largura máxima do contêiner, `max-w-6xl`, mantém leitura confortável) | Lado a lado, com mais espaço em branco lateral | Igual a Full HD |

Não há layout alternativo/reorganizado por faixa — só o número de colunas
dos grids muda, exatamente como já acontece hoje em `Hub.tsx` e
`ResumoResultado.tsx`. O painel de Detalhamento (5.4) em telas estreitas
(próximo de 1024px) ocupa uma fração maior da largura total (pode chegar a
sobrepor quase toda a tabela) — comportamento aceitável, já que é uma
sobreposição temporária, fechável a qualquer momento.

---

## Anexo J — Componentes reutilizados do Design System

Nenhum componente novo de `ui/` é necessário para tudo que não é gráfico.
Reaproveitamento direto:

| Elemento desta UX | Componente/token já existente |
| --- | --- |
| KPIs (Anexo C) | `Cartao` (`rotulo`, `valor`, `cor`, `icone`) |
| Chips de filtro, indicador de veredito de sincronização | `Badge` (`variante: VarianteStatus`) |
| Avisos de estado (erro/aviso/vazio) | `Alerta` |
| Botões (Sincronizar, Exportar, Limpar filtros) | `Botao` (`variante`, `carregando`) |
| Campo de pesquisa/filtros de texto/data | `Campo` |
| Confirmação antes de exportar com dado desatualizado (Riscos) | `DialogoConfirmacao` |
| Card do Hub (5.1) | `CardFuncionalidade` |
| Cores semânticas (sucesso/aviso/erro/info) | `CORES_STATUS` (`cores.ts`) |
| Tipografia | `TIPOGRAFIA` (`tipografia.ts`) |
| Superfície "vidro", ripple, foco | `SUPERFICIE_BASE`, `EFEITO_RIPPLE`, `FOCO_ANEL` (`estilos.ts`) |
| Cabeçalho, "← Hub" | `Cabecalho` (já existente, sem alteração) |

**Único ponto que precisa de uma entrada nova (não um padrão novo):** o
card do Hub (5.1) precisa de uma 3ª cor além de `"roxo"`/`"ciano"` — o
próprio código já prevê essa extensão (`CardFuncionalidade.tsx`, comentário:
"um 3º módulo futuro só precisa de uma nova entrada neste mapa, nunca um
valor de sombra novo"). Recomenda-se `"azul"`, mapeado ao token
`shadow-glow-blue` já definido em `theme.css` (um dos 6 tokens de glow do
próprio sistema, hoje sem nenhum consumidor de UI fixo) — zero cor nova
inventada, só uma nova chave num mapa que já existe para essa finalidade.

Ícones (`lucide-react`, já é dependência do projeto): reaproveita `Search`,
`Clock`, `RotateCcw`, `FileSpreadsheet`, `FileText`, `FolderOpen` (já usados
em outras telas com o mesmo significado); precisa de 2 ícones ainda não
usados no projeto, mas já parte da mesma biblioteca já instalada:
`SlidersHorizontal` (filtros avançados) e `Printer` (imprimir) — seleção de
ícone, não escolha de biblioteca nova.

---

## Riscos de UX

| # | Risco | Mitigação proposta |
| --- | --- | --- |
| 1 | Exportar um relatório com dados marcados como "possivelmente desatualizados" (J6 cruzando com J4/J5) pode fazer o usuário levar informação errada para outra pessoa sem perceber. | Ao exportar/imprimir com o aviso de desatualização ativo, intercalar um `DialogoConfirmacao` explícito ("Os dados podem estar desatualizados. Exportar mesmo assim?") — único ponto do fluxo de exportação com fricção deliberada extra, coerente com a prioridade #3 da Fase 1. |
| 2 | Jornada J7 (primeira utilização) fica sem nenhuma ação possível além de esperar — pode parecer que o módulo "não funciona". | Mensagem explícita orientando o próximo passo real ("assim que um Processamento for concluído..."), nunca um estado vazio genérico; ver Anexo H. Se o DIMCAC preferir permitir construir a Base Local sob demanda mesmo sem nenhum Processamento prévio (lendo direto da Planilha Oficial), isso é uma decisão de arquitetura fora do escopo desta Sprint (não reabre a 17.1). |
| 3 | Painel de Detalhamento (5.4) sobrepondo a tabela em telas estreitas (Anexo I) pode ocultar contexto demais em notebooks pequenos. | Aceito como trade-off desta Sprint — é temporário e fechável; se vier a incomodar na prática, uma alternativa (ex.: detalhe abaixo da linha, expansível, em vez de painel lateral) pode ser revisitada na implementação sem impacto arquitetural. |
| 4 | Filtro de período **global** (Dashboard + Relatórios) pode confundir se o usuário mudar o período no Dashboard e "esquecer" que ele também afeta o relatório que vai gerar em seguida. | O período selecionado fica sempre visível como texto simples no topo de ambas as abas (5.5/5.6), nunca implícito. |

---

## Recomendações

1. Confirmar com o DIMCAC, antes da 17.3, os campos exatos cobertos pela
   pesquisa rápida (SEI + CPF + nome já assumidos — pergunta em aberto
   herdada da arquitetura, `§ 13` item 4).
2. Tratar a extensão do tipo `Cor` do Hub (Anexo J) como parte da Sprint
   17.4/17.5 (quando a tela realmente for construída), não antes.
3. Escolher a biblioteca de gráficos e o mecanismo de exportação PDF/Excel
   apenas na sub-etapa de implementação correspondente (17.5/17.6),
   mantendo a decisão fora desta Sprint (herdado do risco 5,
   `docs/central-analitica/README.md § 10`).
4. Validar o texto exato dos 5 estados do indicador de sincronização
   (Anexo G) com o DIMCAC antes da implementação — o conteúdo textual aqui
   é um rascunho fiel à arquitetura, não uma redação final aprovada
   palavra por palavra.

---

## Fora do escopo

Não tratados nesta Sprint, por instrução explícita: Diagnóstico de
Pendências (módulo à parte, fora do escopo da Central Analítica), qualquer
implementação, código, APIs, SQLite, backend ou Electron.

---

## Resultado desta Sprint

1. **Compreensão do usuário** — Fase 1.
2. **Jornadas completas** — Fase 2 (J1–J7).
3. **Fluxos de navegação** — Fase 3.
4. **Arquitetura da informação** — Fase 4.
5. **Wireframes ASCII** — Fase 5 (Hub, shell do módulo, Pesquisa,
   Detalhamento, Dashboard, Relatórios).
6. **Componentes reutilizáveis** — Anexo J.
7. **Critérios de usabilidade** — prioridades da Fase 1 + checagem cruzada
   da Fase 6.
8. **Justificativas de UX** — presentes em cada decisão (Dashboard como
   aba padrão, filtro de período global, painel lateral de detalhe etc.).
9. **Riscos** — seção "Riscos de UX".
10. **Recomendações** — seção "Recomendações".

Nenhuma linha de código foi escrita. Aguardando aprovação explícita antes
de qualquer implementação da Sprint 17.
