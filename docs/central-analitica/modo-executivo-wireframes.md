# Central Analítica — Modo Executivo: Wireframes (Sprint 21)

> Todos os números abaixo são **exemplos ilustrativos**, marcados
> `[exemplo]`. Nenhuma biblioteca de gráfico foi escolhida — os desenhos
> abaixo representam intenção visual e estrutura de informação, não uma
> implementação (ver `modo-executivo-plano-tecnico.md § 4`). Nenhum dado
> real do usuário aparece neste documento.

> **✅ Atualizado após aprovação do planejamento (2026-08-05)** com as 6
> decisões de fechamento de `modo-executivo-arquitetura-funcional.md § 0`
> (linhas 8–13): "Imagem" = PDF executivo (§ 7), "Unidade solicitante" =
> `doc_origem` com rótulo completo (§ 2.2), tela cheia via Fullscreen API
> (§ 6), Membros × Servidores como distribuição combinada — não mais um
> atalho de "Comparar" (§ 2.2, § 3), sem controle de acesso (sem impacto
> visual nestes wireframes), modo apresentação sem atualização contínua
> (§ 6).

## Sumário

0. [O que este documento cobre](#0-o-que-este-documento-cobre)
1. [Entrada no Modo Executivo](#1-entrada-no-modo-executivo)
2. [Tela principal](#2-tela-principal)
3. [Comparação](#3-comparação)
4. [Zoom e interação](#4-zoom-e-interação)
5. [Painel lateral contextual](#5-painel-lateral-contextual)
6. [Modo apresentação](#6-modo-apresentação)
7. [Exportação executiva](#7-exportação-executiva)
8. [Estados: loading, erro, vazio](#8-estados-loading-erro-vazio)
9. [Responsividade](#9-responsividade)

---

## 0. O que este documento cobre

Wireframes textuais (ASCII) do Modo Executivo descrito em
`modo-executivo-arquitetura-funcional.md`. Cada tela reaproveita, sempre
que indicado, um componente/padrão visual já existente no Modo Operacional
— não redesenha do zero o que já está homologado.

## 1. Entrada no Modo Executivo

```
┌─ Central Analítica (Modo Operacional) ────────────────────────────────────┐
│  Central Analítica                                                        │
│  Última sincronização: 05/08/2026 14:32 · 0 avisos      [Modo Executivo] │
│                                                            ▲               │
│                                                            └─ novo botão   │
│  [ Busca global.......................... 🔍 ]                            │
│  [ Todos | Membros | Servidores ]  [ Hoje ] [7 dias] [30 dias] ...        │
│  ▾ Filtros avançados      Chips: Município: Araripina ✕   Limpar filtros  │
│  ...                                                                       │
│  [ Gerar Dashboard ]  [ Gerar Relatório ]  [ Executar Diagnóstico ]       │
│  ...tabela de resultados...                                               │
└─────────────────────────────────────────────────────────────────────────┘
```

- Botão "Modo Executivo" fica na mesma linha do título/carimbo de
  sincronização — sempre visível, habilitado com o mesmo critério de
  `PainelAcoesRecorte.habilitado` (recorte válido: backend online, sem
  erro, com pelo menos 1 registro). Desabilitado com `title`/`sr-only`
  explicando o motivo, nunca escondido (mesmo padrão já usado nos atalhos
  pendentes de `FiltrosRapidos`).
- Clique → transição para a tela principal do Executivo (§ 2), **sem**
  perder nenhum filtro ativo — o cabeçalho executivo já nasce mostrando o
  recorte que estava aplicado no Operacional.
- Transição: reaproveita a mesma classe de entrada já usada em todo o app
  (`animate-entrada-conteudo`/`animate-entrada-painel`, `theme.css`) —
  nenhuma animação nova a inventar.

## 2. Tela principal

```
┌─ Modo Executivo ───────────────────────────────────────────────────────────┐
│ [← Voltar ao Modo Operacional]                    [Apresentação] [Exportar]│
│                                                                             │
│ Recorte: 01/06/2026–30/06/2026 · [Todos|Membros|Servidores] · 3 filtros   │
│ Última sincronização: 05/08/2026 14:32                        [Comparar]  │
├─────────────────────────────────────────────────────────────────────────┤
│  KPIs executivos (§ 2.1)                                                   │
├─────────────────────────────────────────────────────────────────────────┤
│  Gráficos executivos (§ 2.2)                                               │
├─────────────────────────────────────────────────────────────────────────┤
│  Insights automáticos (§ 2.3)                                              │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.1 KPIs executivos

```
┌────────────────┐ ┌────────────────┐ ┌────────────────┐ ┌────────────────┐
│  DIÁRIAS         │  PESSOAS         │  VALOR TOTAL     │  VALOR MÉDIO     │
│                  │                  │                  │                  │
│    312           │    298           │  R$ 149.760,00   │   R$ 480,00      │
│  [exemplo]        │  [exemplo]        │  [exemplo]        │  [exemplo]        │
└────────────────┘ └────────────────┘ └────────────────┘ └────────────────┘
┌────────────────┐ ┌────────────────┐
│  MEMBROS × SERV. │  ATENÇÃO         │
│                  │                  │
│  22% × 78%       │  14 casos 🟡     │
│  [exemplo]        │  [exemplo]        │
└────────────────┘ └────────────────┘
```

- Mesmos 4 KPIs já homologados (`total_diarias`, `total_servidores`,
  `valor_total`, `valor_medio`), tipografia maior (`TIPOGRAFIA.tituloApp`
  em vez de `TIPOGRAFIA.titulo` — mesma escala do cabeçalho principal do
  app, não um tamanho novo).
- "Membros × Servidores" — proporção da distribuição por
  `categoria_funcional` (Sprint 20), apresentada como par percentual.
- "Atenção" — soma de `atencao + inconsistencia` do resumo do
  Diagnóstico já existente (`ResumoDiagnosticoResposta`), nunca um
  recálculo — é a mesma contagem que a Central de Conferência/Diagnóstico
  já produz, só reapresentada em escala de KPI. 🟡 (âmbar, RN-08) quando
  > 0, nunca vermelho.

### 2.2 Gráficos executivos

```
┌─ Evolução de gastos [exemplo] ────────────┐  ┌─ Evolução da quantidade [ex.]─┐
│    R$ ▂▃▅▆█▇▅▃▂                            │  │     ▂▃▅▆█▇▅▃▂                  │
│    jan  fev  mar  abr  mai  jun            │  │     jan  fev  mar  abr  mai jun│
└────────────────────────────────────────────┘  └────────────────────────────┘

┌─ Municípios (top 8) [exemplo] ────────────┐  ┌─ Membros × Servidores [ex.]───┐
│ Araripina-PE      ██████████ 89            │  │   ◕ Servidores    78%          │
│ Petrolina-PE      ███████    62            │  │   ◔ Membros       22%          │
└────────────────────────────────────────────┘  └────────────────────────────┘

┌─ Motivos (top 8) [exemplo] ───────────────┐  ┌─ Situação do servidor [ex.]───┐
│ Fiscalização      ██████████ 120           │  │   ◕ Em exercício     94%       │
│ Capacitação       ███████    88             │  │   ◔ Não informado     6%       │
└────────────────────────────────────────────┘  └────────────────────────────┘

┌─ Transporte [exemplo] ────────────────────┐  ┌─ Unidade solicitante [ex.] ───┐
│   ◕ Carro          61%                     │  │ GABPGJ            ██████ 40    │
│   ◔ Avião          31%                     │  │ SECCGMP           ████   28    │
│   ◑ Não identificado 8% 🟡                 │  │ ...                              │
└────────────────────────────────────────────┘  └────────────────────────────┘

┌─ Origem × Destino (top 8) [exemplo] ──────┐  ┌─ Concentração de gastos [ex.]─┐
│ Recife-PE → Araripina-PE       ██████ 58  │  │ 20% dos destinos concentram    │
│ Recife-PE → Petrolina-PE       ████   34  │  │ 68% do valor total [exemplo]  │
└────────────────────────────────────────────┘  └────────────────────────────┘
```

- **Evolução de gastos/quantidade, Municípios, Motivos, Origem × Destino**
  — mesma dimensão de `DimensaoDistribuicao` já existente
  (`periodo`/`municipio`/`motivo`/`origem_destino`), só em cartão maior.
- **Membros × Servidores** — **decisão fechada (2026-08-05):** distribuição
  combinada nova (`categoria_funcional` como `DimensaoDistribuicao`, 2
  pontos, MEMBRO/SERVIDOR) dentro do recorte único — nunca depende de
  "Comparar" (§ 3). Extensão aditiva de backend, detalhada em
  `modo-executivo-plano-tecnico.md § 7`/`§ 8`.
- **Unidade solicitante** — **decisão fechada (2026-08-05):** dimensão
  nova sobre o campo já existente `doc_origem`, sem nenhuma
  reinterpretação. O rótulo completo na UI é sempre **"Unidade
  solicitante (documento de origem)"** (o cartão acima abrevia só por
  espaço no desenho ASCII — a implementação real usa o rótulo completo no
  título do cartão e na tabela textual equivalente).
- **Transporte** — mesmo caso: `transporte` já existe como campo de
  `RegistroAnalitico`, mas não como `DimensaoDistribuicao` hoje —
  extensão aditiva, mesmo padrão das 2 anteriores.
- **Concentração de gastos** — não é uma dimensão nova: é uma
  apresentação (regra de Pareto, "X% dos grupos concentram Y% do valor")
  calculada no cliente sobre uma distribuição já existente (ex. por
  município), nunca um novo endpoint.
- Grade 3 colunas em tela larga (empilha em telas estreitas, § 9) — mais
  densa que os 2 pares do Dashboard operacional (decisão de densidade,
  `modo-executivo-arquitetura-funcional.md § 0`/§ 6).

### 2.3 Insights automáticos

```
┌─ Insights ──────────────────────────────────────────────────────────────┐
│ 🔼 Valor total 12% acima do período anterior [exemplo]                    │
│ 🟡 68% do gasto concentrado em 3 municípios [exemplo]                     │
│ 🟡 14 processos aguardando DH há mais tempo que o usual [exemplo]         │
│ 🟡 6% dos registros com transporte não identificado [exemplo]             │
└───────────────────────────────────────────────────────────────────────┘
```

- Cada linha é uma frase gerada por uma fórmula fixa e documentada (ver
  `modo-executivo-arquitetura-funcional.md § 5`/`§ 10`, decisão 5) — nunca
  texto gerado por IA. Cada insight tem uma ação equivalente ao painel
  lateral (§ 5) ao ser clicado/focado (ex.: abre o Diagnóstico já
  filtrado).
- Símbolos (🔼/🟡) seguem `CORES_STATUS` já existente — nunca vermelho
  para variação de negócio (RN-08).

## 3. Comparação

```
┌─ Modo Executivo — Comparando ─────────────────────────────────────────────┐
│ [← Voltar ao Modo Operacional]                    [Apresentação] [Exportar]│
│                                                                             │
│ A: 01/06/2026–30/06/2026        vs.        B: 01/05/2026–31/05/2026       │
│ [Trocar A/B]  [Encerrar comparação]                                       │
├───────────────────────────────────────────────────────────────────────┤
│ ┌────────────────┐ ┌────────────────┐ ┌────────────────┐               │
│ │  DIÁRIAS         │  VALOR TOTAL     │  VALOR MÉDIO     │               │
│ │  A: 312           │  A: R$ 149.760   │  A: R$ 480       │               │
│ │  B: 289 (+8%)      │  B: R$ 138.200(+8%)│ B: R$ 478 (+0,4%)│               │
│ │  [exemplo]        │  [exemplo]        │  [exemplo]        │               │
│ └────────────────┘ └────────────────┘ └────────────────┘               │
├───────────────────────────────────────────────────────────────────────┤
│ ┌─ Evolução (A sobreposto a B) [exemplo] ───────────────────────────┐ │
│ │   R$ ▂▃▅▆█▇▅▃▂  (A)                                                │ │
│ │      ▁▂▄▅▇▆▄▂▁  (B, tracejado)                                     │ │
│ └────────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────────┘
```

- **Como entrar:** botão "Comparar" no cabeçalho executivo → escolhe o
  tipo de comparação (atalhos prontos: "Mês atual × anterior", "Ano atual
  × anterior"; ou manual: período B/categoria B livre) → confirma.
- **Membros × Servidores dentro de "Comparar"** — decisão fechada
  (2026-08-05): o gráfico combinado de § 2.2 é sempre visível e é a
  leitura rápida padrão (não depende de "Comparar"). "Comparar" com
  categoria como campo variável (A=Membros, B=Servidores) continua
  disponível como opção **só para comparação detalhada** — quando o
  usuário quer o painel completo (todos os KPIs/gráficos lado a lado com
  variação percentual, não só a proporção do donut). Quando usada dessa
  forma, todos os demais filtros (período, município, motivo, etc.) são
  preservados idênticos entre A e B — só `categoria_funcional` muda.
- **O que muda tecnicamente:** o recorte A continua sendo
  `useDiarias.filtros` (nunca alterado); o recorte B é um `FiltrosDiaria`
  paralelo, somente para leitura, usado só para chamar
  `/indicadores`/`/distribuicoes` uma segunda vez (ver `arquitetura-
  funcional.md § 0` decisão 4, `plano-tecnico.md § 8`). Nenhuma
  comparação é uma chamada nova ao backend — são 2 chamadas já
  existentes.
- Cada KPI comparado mostra os 2 valores e a variação percentual
  calculada no cliente (`(B-A)/A`), nunca uma "explicação" da causa —
  isso ficaria a cargo do usuário, nunca inventado pelo sistema.
- "Trocar A/B" inverte só a apresentação (rótulos/sinais), nunca refaz as
  2 chamadas.
- "Encerrar comparação" volta ao estado normal de § 2, preservando A
  (nunca troca o recorte principal por B).

## 4. Zoom e interação

```
┌─ Evolução de gastos — com seleção por arraste [exemplo] ─────────────────┐
│    R$ ▂▃▅▆[███████]▇▅▃▂                                                    │
│    jan fev [mar────jun] jul                                               │
│                          ↑ arraste do mouse seleciona um subintervalo     │
│  [Aplicar como filtro]  [Reset]                                           │
└───────────────────────────────────────────────────────────────────────┘
```

- **Zoom temporal**: só no gráfico "Evolução" (dimensão `periodo`) —
  arraste horizontal sobre o eixo de tempo destaca um subintervalo;
  "Aplicar como filtro" chama `aplicarFiltro({periodo_inicial, periodo_final})`
  (mesmo mecanismo de `DashboardRecorte.refinar`, nunca um filtro novo).
  "Reset" volta ao intervalo do recorte original.
- **Seleção por arraste**: implementável sem biblioteca (captura de
  `pointerdown`/`pointermove`/`pointerup` sobre o SVG/CSS do gráfico) —
  ver avaliação técnica de viabilidade em `plano-tecnico.md § 4`.
- **Hover**: mesmo `title` nativo já usado hoje (`GraficoBarras`/
  `GraficoDonut`), com tooltip mais rico (valor + % do total + contagem)
  — avaliação de tooltip customizado (`role="tooltip"`, posicionado) vs.
  `title` nativo fica em `plano-tecnico.md § 6`.
- **Clique para filtrar / drill-down**: mesmo padrão já homologado de
  `refinar()` — clique num ponto aplica o filtro correspondente e oferece
  abrir o painel lateral (§ 5) em vez de navegar direto para a tabela
  (diferença de UX proposta: o Executivo nunca "sai" da visão executiva
  só por causa de um clique; quem decide ir para a tabela é o usuário, via
  ação explícita no painel lateral).
- **Teclado**: todo ponto interativo é `<button>` real (mesmo padrão de
  `GraficoBarras`) ou tem `tabIndex`+Enter/Espaço equivalente; zoom por
  arraste tem um caminho por teclado alternativo (ex.: setas para mover
  seleção, Enter para aplicar) — detalhado em `plano-tecnico.md § 6`,
  nunca uma funcionalidade exclusiva de mouse.

## 5. Painel lateral contextual

```
┌─ Modo Executivo ──────────────────────────────┬─ Painel: Araripina-PE ────┐
│  (grade de KPIs/gráficos, dimmed/sem foco)      │  ✕ Fechar                 │
│                                                  │                            │
│                                                  │  58 diárias [exemplo]      │
│                                                  │  R$ 34.200,00 [exemplo]    │
│                                                  │                            │
│                                                  │  Principais motivos:       │
│                                                  │  Fiscalização (32)         │
│                                                  │  Reunião (18)               │
│                                                  │                            │
│                                                  │  Principais pessoas:        │
│                                                  │  João da Silva (6)          │
│                                                  │  Maria Souza (4)             │
│                                                  │                            │
│                                                  │  [ Aplicar filtro ]         │
│                                                  │  [ Comparar ]                │
│                                                  │  [ Exportar ]                │
│                                                  │  [ Abrir relatório ]         │
│                                                  │  [ Abrir diagnóstico ]       │
└─────────────────────────────────────────────────┴────────────────────────┘
```

- Abre como painel lateral deslizante (não modal centralizado) — nunca
  cobre 100% da tela, para "sem perder contexto" ser literal (a grade
  continua visível atrás, mesmo padrão visual de painel lateral já
  cogitado para `PainelDetalhamentoDiaria` — hoje ele é modal central;
  aqui a intenção explícita do usuário é lateral, uma diferença de UX
  documentada, não um erro).
- Fecha com Esc, clique fora, ou botão "✕" — mesmo padrão de
  `DialogoConfirmacao`/`ModalRelatorio` (`role="dialog"`, embora lateral
  em vez de centralizado nesta tela).
- **"Principais motivos"/"Principais pessoas"** — cada um é o `top N`
  (ex.: top 5) de uma distribuição já filtrada pelo ponto clicado (ex.:
  distribuição por motivo, com filtro adicional `municipio=Araripina-PE`)
  — nova chamada ao backend com filtro composto, não um novo tipo de
  dado.
- **Ações:**
  - **Aplicar filtro** → mesmo `aplicarFiltro`, leva de volta ao Modo
    Operacional já filtrado (mesmo padrão de `refinar()`).
  - **Comparar** → abre o fluxo de § 3 já usando este ponto como recorte
    A.
  - **Exportar** → mesmo fluxo de § 7, já pré-filtrado por este ponto.
  - **Abrir relatório** → abre `ModalRelatorio` já existente, com este
    filtro adicional aplicado.
  - **Abrir diagnóstico** → navega para o Diagnóstico (já existente),
    filtrado por este ponto.

## 6. Modo apresentação

```
┌─ Modo Executivo — Apresentação (tela cheia) ──────────────────────────────┐
│                                                                             │
│                     ● ─── ● ─── ○ ─── ○      (indicador de seção)          │
│                                                                             │
│                        DIÁRIAS · JUNHO/2026                                │
│                                                                             │
│                            312                                             │
│                        [exemplo]                                          │
│                                                                             │
│                                                                             │
│                                          (mover o mouse revela: [Sair])    │
└─────────────────────────────────────────────────────────────────────────┘
```

- Ativado por "Modo apresentação" no cabeçalho executivo → tela cheia
  (Fullscreen API do navegador — sem controles do SO/Electron visíveis).
- Sem filtros, sem menus, sem cabeçalho executivo — só o conteúdo
  (KPIs → gráficos → insights, um "slide" por seção, navegação por
  seta/clique/toque, indicador de posição discreto).
- "Sair"/Esc sempre disponível (revelado ao mover o mouse ou sempre focável
  por Tab, nunca escondido de quem navega por teclado — § 8 da
  arquitetura funcional).
- **Atualização de dados** — decisão fechada (2026-08-05): uso pontual em
  reunião/projeção, não uso contínuo em TV. **Sem polling/atualização
  automática nesta versão** — os dados exibidos são os já carregados ao
  ativar o modo apresentação; para atualizar, o usuário sai (Esc) e
  reentra (mesma leitura de `/indicadores`/`/distribuicoes` de sempre).
- Nunca duplica cálculo: cada "slide" é a mesma grade de KPIs/gráficos já
  usada em § 2, só reapresentada em tela cheia — nenhum componente novo
  de cálculo.

## 7. Exportação executiva

```
┌─ Exportar visão executiva ────────────────────────────────────────────┐
│  Formato:  ( ) PDF executivo   ( ) Imprimir                            │
│                                                                          │
│  Inclui: [x] KPIs  [x] Gráficos  [x] Insights  [ ] Tabela detalhada    │
│                                                                          │
│  Recorte: 01/06/2026–30/06/2026 · Todos · 3 filtros [mesmo do momento] │
│                                                                          │
│                                       [ Cancelar ]  [ Gerar e Salvar ] │
└───────────────────────────────────────────────────────────────────────┘
```

- Reaproveita `ModalRelatorio`/`useGerarRelatorio` — só um novo `tipo`
  (ou combinação de `incluir_*`) de relatório, mesmo fluxo de estados
  (`configurando → gerando → sucesso/erro`), mesmo IPC
  `relatorio:salvar-como` (já aceita qualquer formato sem canal novo).
- **"Imagem"** — decisão fechada (2026-08-05): é sempre o PDF executivo
  (`incluir_tabela=false`) nesta primeira versão; captura de tela literal
  não é implementada. Por isso este wireframe não lista "Imagem" como uma
  opção de formato à parte — é o mesmo botão "PDF executivo".
  **"Impressão"**: `window.print()`, mesmo precedente do Dashboard
  operacional.
- **"Mesma seleção e comparação, mesmos filtros, sem divergência do que
  está na tela"** (requisito do usuário) — garantido por construção: o
  modal de exportação nunca reconfigura o recorte, só lê o estado atual
  (A, ou A+B se "Comparando") e passa para `POST /relatorios`, mesmo
  princípio já vinculante do Dashboard operacional
  (`ModalRelatorio`/`filtros` como prop, nunca reconfigurados na janela).
- Se "Comparando" estiver ativo, o PDF executivo inclui as 2 séries
  (A e B) exatamente como exibidas na tela — nunca só uma.

## 8. Estados: loading, erro, vazio

```
┌─ Carregando ───────────────────────┐  ┌─ Erro num cartão ──────────────┐
│  ░░░░░░░░  (esqueleto de KPI)       │  │ ⚠ Não foi possível carregar     │
│  ░░░░░░░░                            │  │   este gráfico.                 │
│  role="status", "Carregando..."     │  │   [ Tentar novamente ]          │
└─────────────────────────────────────┘  └─────────────────────────────┘

┌─ Vazio ─────────────────────────────────────────────────────────────┐
│  Nenhum registro neste recorte.                                       │
│  Ajuste os filtros no Modo Operacional para ver dados aqui.           │
│  [ Voltar ao Modo Operacional ]                                       │
└───────────────────────────────────────────────────────────────────────┘
```

- **Loading**: por cartão (KPI/gráfico/insight), nunca uma tela cheia de
  spinner — mesmo padrão já usado no Dashboard operacional
  (`SecaoGrafico`), para um cartão lento não bloquear a leitura dos
  demais já carregados.
- **Erro**: isolado por cartão, com "Tentar novamente" local — uma falha
  na distribuição de motivos não derruba os KPIs já carregados com
  sucesso.
- **Vazio**: mesma mensagem/tom já usado no Modo Operacional para "sem
  resultados" (nunca um "0" decorado como se fosse informação real) — com
  ação clara de voltar e ajustar o filtro (o Executivo não tem painel de
  filtro completo, então a correção acontece no Operacional).
- Em modo apresentação (§ 6), erro/vazio de uma seção pula
  automaticamente para a próxima seção com dado disponível (nunca trava a
  apresentação numa seção quebrada) — comportamento a confirmar com o
  usuário (pergunta nova, ver fechamento deste documento).

## 9. Responsividade

- **Janela padrão do Electron**: `1024×720` (`frontend/electron/
  main.ts`), sem `minWidth`/`minHeight` hoje — mesma base já usada pelo
  Modo Operacional (`v2-wireframes.md § 9.1`). O Executivo herda a mesma
  janela, não abre uma janela separada.
- **Grade de KPIs**: 4 colunas em largura total, 2 em largura reduzida, 1
  em janela minimizada — mesmo comportamento de quebra já usado em
  `ResumoRecorte`/cartões do Dashboard operacional.
- **Grade de gráficos**: 3 colunas → 2 → 1, mesma lógica de
  `DashboardRecorte` (que já quebra 2→1).
- **Painel lateral (§ 5)**: em largura reduzida, vira painel de largura
  total sobreposto (não lateral estreito ilegível) — mesmo critério já
  usado por modais existentes que precisam caber em telas menores.
- **Modo apresentação (§ 6)**: assume tela cheia — não precisa de
  quebra responsiva no sentido tradicional, mas o tamanho de fonte de
  cada "slide" precisa se adaptar à resolução real de tela cheia (maior
  que a janela padrão do app), risco já registrado na arquitetura
  funcional (§ 11, risco 4).
