# Central Analítica — Modo Executivo: Arquitetura Funcional (Sprint 21)

> **Sprint 21 — exclusivamente arquitetura funcional, UX e planejamento
> técnico. Nenhuma linha de código de produção foi escrita nesta etapa.**
> Implementação só começa após aprovação explícita do usuário a este
> documento e aos dois documentos irmãos (`modo-executivo-wireframes.md`,
> `modo-executivo-plano-tecnico.md`), seguindo a mesma disciplina das
> Sprints 11, 12, 15 e 17.

> **Numeração:** a Central Analítica V2 (Sprints 17–19) está homologada
> definitivamente e não é reaberta por este documento ([[central-analitica-sprint19-v2-progresso]]
> na memória do projeto). `categoria_funcional` (Sprint 20) também está
> homologada e é pré-requisito direto desta etapa (o cabeçalho executivo
> reaproveita o filtro "Todos \| Membros \| Servidores" dela, sem
> reimplementar nada). O Modo Executivo é numerado **Sprint 21** — próximo
> número livre depois da 20.

> **✅ Planejamento aprovado pelo usuário (2026-08-05).** As 6 perguntas de
> § 12 foram todas fechadas com decisão explícita — ver § 0 (linhas 8–13)
> e § 10/§ 11 atualizados. A partir desta aprovação, a implementação segue
> o roadmap em micro-sprints de `modo-executivo-plano-tecnico.md § 12`.

## Sumário

0. [Decisões oficiais desta etapa](#0-decisões-oficiais-desta-etapa)
1. [Objetivo](#1-objetivo)
2. [Personas](#2-personas)
3. [Problemas resolvidos](#3-problemas-resolvidos)
4. [Fluxo principal](#4-fluxo-principal)
5. [Regras obrigatórias](#5-regras-obrigatórias)
6. [Componentes conceituais](#6-componentes-conceituais)
7. [Estados](#7-estados)
8. [Acessibilidade](#8-acessibilidade)
9. [Integração com a Central Analítica V2](#9-integração-com-a-central-analítica-v2)
10. [Decisões](#10-decisões)
11. [Riscos](#11-riscos)
12. [Perguntas em aberto](#12-perguntas-em-aberto)

---

## 0. Decisões oficiais desta etapa

| # | Tema | Decisão | Onde se aplica |
| --- | --- | --- | --- |
| 1 | Módulo vs. modo | O Executivo **não é um módulo novo do Hub** (`Hub.tsx`) — é um segundo modo de apresentação *dentro* da Central Analítica, ativado por um botão no cabeçalho já existente. O card do Hub continua descrevendo um único módulo. | § 4, § 9 |
| 2 | Estado único | O Executivo lê o mesmo `useDiarias` (mesmo `filtros`, mesmo `FiltrosDiaria`) já usado pelo Modo Operacional — nunca uma segunda fonte de verdade de filtro. Trocar de modo nunca reresincroniza nem reseta o recorte. | § 5, § 9 |
| 3 | Sem biblioteca de gráfico nesta etapa | Mantém a mesma abordagem de `GraficoBarras`/`GraficoDonut` (CSS/SVG próprios) — nenhuma dependência nova é decidida aqui (ver `modo-executivo-plano-tecnico.md § 4` para a avaliação, não decisão). | § 6, § 11 |
| 4 | "Comparar" é uma composição de 2 recortes, exceto Membros × Servidores | "Comparar" (períodos/entidades explícitas escolhidas pelo usuário, ex. mês atual × anterior, ano × ano) continua sendo o mesmo `FiltrosDiaria` chamado 2 vezes, diferença calculada no cliente (subtração/percentual, nunca regra de negócio). **Membros × Servidores deixou de usar este mecanismo** (decisão 11) — virou uma distribuição combinada normal, dentro de um único recorte. | § 4, § 5, § 10 |
| 5 | Insights são determinísticos, não preditivos | Todo "insight automático" é uma fórmula fixa e documentada (variação percentual, concentração de Pareto, limiar) sobre dados já calculados pelo backend — nunca IA generativa, nunca heurística probabilística. | § 5, § 10 |
| 6 | Exportação executiva reaproveita `POST /relatorios` | "PDF executivo" é um novo `tipo`/composição do mesmo endpoint já existente — nunca um pipeline de geração de PDF paralelo. "Imagem" **é definitivamente o PDF executivo nesta primeira versão** (decisão 8 — não implementar captura literal de tela); impressão continua via `window.print()`. | § 6, § 9, § 11 |
| 7 | Nenhum KPI novo sem fonte | Só entram no Executivo os KPIs/distribuições/diagnósticos já implementados e homologados (4 indicadores, 6 distribuições, catálogo de diagnóstico). KPIs do catálogo documentado mas pendente do DIMCAC (município total, completude, aguardando liberação) **não** aparecem até a decisão existir. | § 6, § 11, § 12 |
| 8 | "Imagem" = PDF executivo (fechamento da pergunta 1) | Confirmado pelo usuário (2026-08-05): nesta primeira versão, "exportar imagem" produz o PDF executivo. Captura literal de tela (Electron `capturePage`) **não é implementada**. | § 7, § 10, § 11 |
| 9 | "Unidade solicitante" = `doc_origem` (fechamento da pergunta 2) | Confirmado: a dimensão nova reaproveita o campo já existente `doc_origem`, sem nenhuma reinterpretação. Rótulo de UI obrigatório: **"Unidade solicitante (documento de origem)"** — nunca só "Unidade solicitante" sozinho, para deixar clara a proveniência do dado e não atribuir uma semântica institucional que o campo não tem. | § 6, § 10, `plano-tecnico.md § 8` |
| 10 | Tela cheia via Fullscreen API (fechamento da pergunta 3) | Confirmado: modo apresentação usa a Fullscreen API do navegador (`element.requestFullscreen()`), sem canal IPC novo. Kiosk mode do Electron (`win.setFullScreen()`/`kiosk: true`) **não é implementado**. | § 6, § 7, `plano-tecnico.md § 5` |
| 11 | Membros × Servidores: distribuição combinada é a leitura padrão; "Comparar" fica disponível só para comparação detalhada (fechamento da pergunta 4) | Confirmado: dentro do recorte único (A), `categoria_funcional` vira uma `DimensaoDistribuicao` nova (2 pontos: MEMBRO/SERVIDOR) — aparece sempre visível como gráfico normal na grade executiva, independente de "Comparar" (§ 2.2 do wireframe). O fluxo "Comparar" (decisão 4) continua podendo ser usado com `categoria_funcional` como campo variável quando o usuário quer o painel completo lado a lado (todos os KPIs/gráficos com variação percentual, não só a proporção) — nesse caso, preserva todos os demais filtros idênticos entre A e B, só a categoria muda. | § 4, § 6, § 10, `plano-tecnico.md § 6`/`§ 8` |
| 12 | Sem controle de acesso nesta etapa (fechamento da pergunta 5) | Confirmado: o Modo Executivo fica disponível para qualquer usuário que já acessa a Central Analítica hoje — mesmo modelo atual, sem autenticação/perfis. Não reabre a pergunta 8 do DIMCAC (`v2-arquitetura-funcional.md § 14`), só confirma que esta etapa não depende dela. | § 2, § 11 |
| 13 | Modo apresentação é uso pontual, sem atualização contínua (fechamento da pergunta 6) | Confirmado: cenário de uso é reunião/projeção pontual — nenhuma estratégia de atualização automática/polling para uso contínuo em TV é implementada nesta versão. Os dados do modo apresentação são os já carregados ao entrar; atualizar exige sair e reabrir (ou, no máximo, uma ação manual explícita de "atualizar", nunca automática em segundo plano). | § 6, § 7, `plano-tecnico.md § 5` |

---

## 1. Objetivo

Dar a gestores (Procurador-Geral, Corregedoria, DIMCAC, chefias
administrativas) uma segunda forma de olhar para o mesmo Recorte Analítico
já produzido pelo Modo Operacional — não uma consulta detalhada linha a
linha, mas uma leitura executiva: números grandes, comparação entre
períodos/categorias, concentração de gasto, sinais de atenção, e uma
narrativa visual que sirva tanto para análise individual quanto para
apresentação em reunião/projeção. O Modo Executivo nunca introduz um dado,
cálculo ou regra de negócio novos — é uma camada de apresentação sobre o
que a Central Analítica V2 já sabe calcular.

## 2. Personas

| Persona | O que busca | O que NÃO busca aqui |
| --- | --- | --- |
| **Procurador-Geral / Corregedoria** | Visão consolidada de gasto e volume por período, comparação com o período anterior, sinais de atenção (duplicidade, DH ausente) sem precisar entender colunas de planilha. | Editar/corrigir um registro individual — isso continua exclusivo do Modo Operacional. |
| **DIMCAC (equipe técnica/financeira)** | A mesma leitura executiva, mas usada para preparar relatórios formais e apresentações de prestação de contas; precisa exportar exatamente o que está na tela. | Nenhuma funcionalidade de edição de dados; o DIMCAC já usa o Modo Operacional para isso. |
| **Apresentador em reunião/projeção** | Tela limpa, sem controles de filtro visíveis, navegável por seções, legível a distância (TV/projetor). | Interatividade de mouse fina (hover complexo) — em modo apresentação a interação é minimizada por design (§ 6.9). |

## 3. Problemas resolvidos

1. **O Dashboard operacional foi desenhado para "ver o recorte atual", não para decidir.** Ele já expõe os 4 KPIs e 6 gráficos, mas em densidade de tela pensada para quem está ao lado da tabela, não para quem abre o app só para decidir algo em 2 minutos.
2. **Não existe hoje nenhuma forma de comparar dois recortes** (mês atual × anterior, Membros × Servidores, ano × ano) — cada pergunta desse tipo hoje exige o usuário aplicar um filtro, anotar o número, trocar o filtro, e comparar de cabeça.
3. **Não existe uma leitura consolidada de "o que precisa de atenção agora"** — o Diagnóstico lista casos individuais (por SEI), mas não sintetiza "18% dos registros deste mês têm DH ausente, um aumento de 5 pontos em relação ao mês passado".
4. **Não existe um formato adequado para apresentar em reunião/projeção** — a tela operacional tem filtros, chips, paginação e uma tabela densa, inadequados para uma sala com projetor.

## 4. Fluxo principal

```
Central Analítica (Modo Operacional)
        │
        │  [Modo Executivo]  (botão no cabeçalho, sempre visível quando
        │                      backend online — mesmo critério de
        │                      habilitação de PainelAcoesRecorte)
        ▼
Modo Executivo — Cabeçalho executivo (mesmo Recorte Analítico herdado)
        │
        ├── ajustar categoria/período no próprio cabeçalho executivo
        │   (mesmo `useDiarias.aplicarFiltro` — sem estado paralelo)
        │
        ├── Comparar → escolhe o segundo recorte (ex.: período B, ano B —
        │   comparação explícita entre 2 recortes, decisão 4/11) → tela
        │   ganha uma segunda coluna/sobreposição de valores. Membros ×
        │   Servidores NÃO passa por aqui — é sempre uma distribuição
        │   combinada normal, dentro do recorte único (decisão 11)
        │
        ├── clique num ponto de gráfico → Painel lateral contextual
        │   (resumo, principais motivos/pessoas, ações: aplicar filtro /
        │   comparar / exportar / abrir relatório / abrir diagnóstico)
        │       │
        │       └── "Aplicar filtro" → volta ao Modo Operacional já
        │           com o recorte refinado (mesmo padrão de
        │           `DashboardRecorte.refinar`, Sprint 19.6.4)
        │
        ├── Modo apresentação → tela cheia, sem filtros/menus, navegação
        │   por seções → Esc ou botão "Sair" retorna ao Executivo normal
        │
        └── Voltar ao Modo Operacional → mesmo recorte, mesma página de
            resultados de onde o usuário saiu
```

Nenhuma dessas transições dispara uma nova sincronização da Base Local —
o carimbo de sincronização já lido pelo Modo Operacional é o mesmo exibido
no cabeçalho executivo (§ 6.2).

## 5. Regras obrigatórias

Reafirmando, em prosa, os princípios do pedido do usuário — cada um
rastreável a uma decisão de arquitetura existente da V2:

- **Um único Recorte Analítico.** O Executivo lê `useDiarias.filtros`
  (o mesmo hook, a mesma instância de estado) — nunca cria um segundo
  `useState<FiltrosDiaria>`. Qualquer alteração de filtro feita dentro do
  Executivo (categoria, período) usa `aplicarFiltro`/`removerFiltro` já
  existentes. Isso é uma continuação direta da decisão já registrada em
  `v2-arquitetura-funcional.md § 0` (Recorte Analítico único para
  Dashboard/Relatórios/Diagnóstico) — o Executivo é só mais um consumidor
  do mesmo recorte, nunca um quarto estado paralelo.
- **Nenhuma regra de negócio duplicada.** Toda classificação (categoria
  funcional, diagnóstico, distribuição) já vem calculada do backend.
  Operações permitidas no cliente: soma, subtração, percentual, ordenação,
  agrupamento visual de números já calculados — nunca decidir se um
  registro é "MEMBRO" ou se um caso é "inconsistência".
- **Nenhum recálculo do que o backend já fornece.** Indicadores e
  distribuições continuam vindo de `GET /indicadores`/`GET /distribuicoes`
  — o Executivo nunca refaz a soma de `valor_total_diarias` no cliente a
  partir da lista de registros quando o backend já devolve o total.
- **Contratos existentes não mudam sem necessidade comprovada.** As únicas
  extensões de contrato cogitadas nesta etapa são aditivas (novos valores
  de enum, nunca campos removidos/renomeados) — ver § 10 e
  `modo-executivo-plano-tecnico.md § 7`.
- **O Dashboard operacional não é tocado.** `DashboardRecorte.tsx` continua
  existindo, inalterado, como está — o Executivo é um componente/rota
  irmã, não uma reescrita dele.
- **Acessibilidade nunca regride.** Todo padrão já estabelecido (foco por
  teclado, `role="status"`, tabela textual equivalente a cada gráfico,
  RN-08) se aplica também ao Executivo — ver § 8.
- **Identidade visual preservada.** Fundo escuro, azul de marca, tokens de
  `theme/` — a diferença é escala/densidade/interatividade, nunca paleta
  ou tipografia novas (ver § 6, § 9).
- **Compatibilidade com Electron.** Nenhuma funcionalidade do Executivo
  (tela cheia, exportação) pode assumir um navegador comum — tudo roda
  dentro da mesma `BrowserWindow` já existente (`frontend/electron/main.ts`).
- **Nenhuma biblioteca de gráfico nova nesta etapa.** Decisão adiada, não
  proibida para sempre — ver `modo-executivo-plano-tecnico.md § 4`.
- **Nenhum dado fictício.** Todo wireframe e todo exemplo numérico deste
  conjunto de documentos usa dados de exemplo claramente rotulados como
  exemplo (nunca apresentados como se fossem reais) — mesmo critério já
  seguido pela Política de Dados Sintéticos do projeto (`CONTRIBUTING.md`),
  aplicado aqui à documentação, não a fixtures de teste.

## 6. Componentes conceituais

Nomes propostos (não vinculantes — `modo-executivo-plano-tecnico.md § 2`
decide os componentes React reais):

1. **Botão de entrada** — no cabeçalho da Central Analítica operacional,
   ao lado do `IndicadorSincronizacao` (mesma linha, mesmo critério de
   habilitação de `PainelAcoesRecorte.habilitado`).
2. **Cabeçalho executivo** — período do recorte, categoria funcional
   (mesmo toggle "Todos \| Membros \| Servidores" da Sprint 20, agora
   também disponível aqui), resumo de filtros ativos (reaproveita
   `ChipsFiltroAtivo`, versão compacta), carimbo de última sincronização,
   e os botões Comparar / Exportar / Modo apresentação / Voltar.
3. **Grade de KPIs** — versão "grande" dos cartões de indicador já
   existentes (`ResumoRecorte`/cartões do `DashboardRecorte`), maior
   escala tipográfica, com indicador de variação quando "Comparar" está
   ativo.
4. **Grade de gráficos** — reaproveita `GraficoBarras`/`GraficoDonut`
   dentro de um novo `CartaoGraficoExecutivo` (versão maior de
   `CartaoGrafico`, mesmo par gráfico+tabela textual equivalente).
   Inclui a distribuição combinada "Membros × Servidores" (dimensão nova,
   decisão 11) como um gráfico normal da grade, sempre visível
   independentemente de "Comparar" estar ativo.
5. **Painel de comparação** — ativado por "Comparar" (comparações
   explícitas de período/entidade, decisão 4); não é uma tela nova, é um
   estado do cabeçalho executivo + da grade de KPIs/gráficos (cada cartão
   passa a mostrar 2 séries/2 números lado a lado). Ao comparar, todos os
   filtros do recorte A são preservados no recorte B, exceto o único
   campo escolhido para comparação (decisão 11).
6. **Painel lateral contextual** — reaproveita o padrão de "abrir detalhe
   sem perder contexto" já usado por `PainelDetalhamentoDiaria` (aberto por
   clique em linha da tabela ou "▸ Ver" do Diagnóstico) — aqui, aberto por
   clique num ponto de gráfico/KPI, mostrando resumo + ações.
7. **Painel de insights** — lista de frases determinísticas (§ 5, regra
   "insights são determinísticos"), cada uma com um botão-ação equivalente
   ao do painel lateral ("Ver este recorte", "Abrir diagnóstico").
8. **Modo apresentação** — o mesmo cabeçalho/grade de KPIs/gráficos, com
   controles escondidos e navegação por seção (Fullscreen API do
   navegador, não uma tela React separada — ver
   `modo-executivo-plano-tecnico.md § 5`).

## 7. Estados

| Estado | Gatilho | Comportamento |
| --- | --- | --- |
| Carregando | Entrada no Executivo, troca de período/categoria, "Comparar" disparado | Mesmo padrão de `role="status"` + esqueleto de cartão já usado no Dashboard (`SecaoGrafico`/`ResumoRecorte`) — nunca uma segunda linguagem de carregamento. |
| Erro | Falha em qualquer chamada de indicadores/distribuições/diagnóstico | Mesmo `Alerta variante="erro"` + "Tentar novamente" já usado no Dashboard, por cartão — uma falha isolada não derruba a tela inteira. |
| Vazio | Recorte sem nenhum registro | Mesma mensagem/ilustração já usada no Modo Operacional para "sem resultados" — nunca inventar um "0" decorado como se fosse dado real. |
| Comparando | "Comparar" ativo | Cabeçalho mostra os 2 recortes lado a lado (rótulo A/B); saída volta ao estado normal preservando o recorte A (nunca descarta o filtro original). |
| Apresentação | "Modo apresentação" ativo | Tela cheia, navegação por seção, sem filtros/menus; Esc ou botão "Sair" sempre visível ao mover o mouse/focar por teclado. |
| Exportando | "Exportar" acionado | Mesma máquina de estados de `useGerarRelatorio` (`configurando → gerando → sucesso/erro`) — reaproveitada, não duplicada. |

## 8. Acessibilidade

Convenções já estabelecidas no projeto e que o Executivo herda sem
exceção (ver levantamento em `modo-executivo-plano-tecnico.md § 6` para o
detalhamento técnico):

- Todo gráfico continua com uma tabela textual equivalente acessível
  (mesmo padrão de `CartaoGrafico`) — inclusive em modo apresentação
  (alternável, nunca removida).
- Todo ponto clicável de gráfico é um elemento focável nativamente
  (`<button>`) ou tem `tabIndex`+`onKeyDown` equivalente, mesmo padrão de
  `GraficoBarras`/`PainelDiagnostico`.
- Estados assíncronos usam `role="status"`; modais/painéis usam
  `role="dialog" aria-modal="true"`; grupos de opção usam
  `role="radiogroup"`/`role="group"` com `aria-label`.
- RN-08 (nunca vermelho para estado de negócio que não é falha técnica) é
  absoluta também nos insights automáticos e nos indicadores de variação
  ("gasto subiu 12%" nunca é apresentado em vermelho só por ser um
  aumento — vermelho é reservado a falha técnica real, mesmo critério já
  usado no veredito da Central de Conferência).
- Modo apresentação **não** pode depender só de mouse/hover — navegação
  por seção precisa funcionar por teclado (setas ou Tab) para quem
  apresenta sem mouse conectado a um projetor.

## 9. Integração com a Central Analítica V2

O Modo Executivo não é uma "V3" — é uma segunda superfície sobre a mesma
V2 homologada:

- **Mesmo backend, zero regra nova de negócio.** Todos os endpoints
  (`/diarias`, `/indicadores`, `/distribuicoes`, `/diagnostico`,
  `/relatorios`) continuam sendo os únicos pontos de verdade.
- **Mesmo Recorte Analítico** (`useDiarias`, `FiltrosDiaria`) —
  documentado em detalhe em § 5.
- **Mesmo filtro de categoria funcional** da Sprint 20
  (`categoria_funcional`, `FiltroCategoriaFuncional.tsx`) — o cabeçalho
  executivo reaproveita o componente existente ou uma variante visual dele
  sobre o mesmo estado, nunca uma segunda implementação do toggle.
- **Mesmo padrão de exportação** (`POST /relatorios` + IPC
  `relatorio:salvar-como`, já generalizado desde a Sprint 19.7.5 para
  aceitar qualquer formato/nome sem precisar de canal IPC novo).
- **Navegação:** entra a partir da Central Analítica operacional (não do
  Hub — decisão 1, § 0) e sempre pode voltar a ela sem perder o recorte.

## 10. Decisões

Além da tabela de § 0 (linhas 8–13 são o fechamento definitivo das 6
perguntas antes abertas em § 12 — aprovado pelo usuário em 2026-08-05):

- **"Imagem da visão atual" é o PDF executivo, ponto final.** Nunca uma
  captura de tela literal nesta primeira versão (decisão 8). Mesmo
  precedente já estabelecido no Dashboard operacional
  (`v2-arquitetura-funcional.md § 6.3`: "a Imagem é o mesmo PDF").
- **"Comparar" nunca é um endpoint novo** — é a composição de 2 chamadas
  ao mesmo `FiltrosDiaria` já existente, decidida em § 0.4, reservada a
  comparações explícitas de período/entidade escolhidas pelo usuário
  (nunca para Membros × Servidores, decisão 11). O detalhamento de quais
  campos de `Indicadores`/`Distribuicao` suportam diferença numérica
  direta (todos: são números ou ausência de número) fica em
  `modo-executivo-plano-tecnico.md § 8`.
- **KPIs pendentes do DIMCAC ficam de fora do Executivo até serem
  decididos** (total de municípios, completude, aguardando liberação) —
  mesma decisão já vinculante da V2 (`v2-arquitetura-funcional.md § 14`),
  só reafirmada aqui porque um painel executivo é exatamente o tipo de
  tela onde a tentação de "inventar o número" é maior.
- **"Membros × Servidores" tem leitura padrão como distribuição combinada
  dentro do mesmo recorte** (decisão 11, fechamento definitivo) — sempre
  visível, independente de "Comparar". Exige uma dimensão de distribuição
  nova no backend (`categoria_funcional` ainda não é uma
  `DimensaoDistribuicao` — só um filtro, Sprint 20) — extensão aditiva,
  detalhada em `modo-executivo-plano-tecnico.md § 7`/`§ 8`. "Comparar" com
  categoria como campo variável continua disponível à parte, só para
  comparação detalhada (painel completo A×B), preservando os demais
  filtros entre A e B.
- **"Unidade solicitante" é literalmente o campo `doc_origem`, sem
  reinterpretação** (decisão 9, fechamento definitivo) — nova dimensão de
  distribuição aditiva, sempre rotulada na UI como **"Unidade solicitante
  (documento de origem)"**, nunca só "Unidade solicitante".
- **Tela cheia é só Fullscreen API do navegador, sem kiosk mode do
  Electron** (decisão 10, fechamento definitivo) — nenhum canal IPC novo
  para isso.
- **Sem controle de acesso/perfil nesta etapa** (decisão 12, fechamento
  definitivo) — mesmo modelo de acesso atual da Central Analítica.
- **Modo apresentação é uso pontual, sem atualização contínua** (decisão
  13, fechamento definitivo) — sem estratégia de polling/TV ligada o dia
  inteiro nesta versão.

## 11. Riscos

1. **Duas chamadas completas por comparação, sem paginação (decisão já
   existente da V2 — `agregar_indicadores` lê o recorte inteiro em
   memória).** Com ~3 mil diárias medidas (Sprint 13.1) e múltiplos
   cartões comparando simultaneamente, o Executivo pode multiplicar o
   número de roundtrips por sessão. Mitigação a decidir na etapa técnica:
   nenhuma nesta etapa (levantamento em
   `modo-executivo-plano-tecnico.md § 9`), mas o risco é real e não deve
   ser subestimado — sobretudo se "Comparar" for combinado com múltiplos
   gráficos abertos ao mesmo tempo.
2. **Tela cheia via Fullscreen API do navegador, decidida (§ 0 decisão
   10), com risco residual a testar:** não existe precedente de tela
   cheia no projeto — o comportamento da Fullscreen API dentro de uma
   `BrowserWindow` do Electron empacotado precisa ser confirmado em
   ambiente real (não só `npm run dev`) antes de considerar "uso em
   TV/projetor" pronto. Decisão de qual API usar já está fechada; o risco
   que sobra é de teste/validação, não de arquitetura.
3. ~~"Imagem" como captura de tela literal~~ — **fechado (§ 0 decisão 8):
   nesta versão é sempre o PDF executivo**, sem captura de tela. Risco
   removido; a decisão está registrada aqui só para não ser reaberta sem
   pedido explícito do usuário.
4. **Densidade de informação em modo apresentação x legibilidade a
   distância.** Gráficos em CSS/SVG próprios (sem biblioteca) precisam de
   testes visuais reais em resolução de projetor — risco de qualidade
   visual, não de arquitetura, mas vale registrar.
5. **Escopo "grande" pode crescer para além de uma única Sprint.** Os 10
   blocos de funcionalidade do pedido original são, na prática, o tamanho
   de uma V2 inteira nova. O roadmap em micro-sprints
   (`modo-executivo-plano-tecnico.md § 12`) existe justamente para evitar
   um "big bang" sem homologação intermediária.

## 12. Perguntas em aberto

**Nenhuma — as 6 perguntas originais foram todas fechadas com decisão
explícita do usuário em 2026-08-05** (§ 0, decisões 8–13; detalhamento em
§ 10/§ 11). Registro histórico das perguntas e da decisão que fechou cada
uma:

1. ~~"Imagem" é PNG literal ou o PDF já existente?~~ → **PDF executivo**
   (decisão 8).
2. ~~"Unidade solicitante" é `doc_origem` ou outra coisa?~~ → **é
   `doc_origem`**, rótulo "Unidade solicitante (documento de origem)"
   (decisão 9).
3. ~~Fullscreen API ou kiosk mode do Electron?~~ → **Fullscreen API**,
   sem kiosk mode (decisão 10).
4. ~~Membros × Servidores é comparação de 2 recortes ou distribuição
   combinada?~~ → **distribuição combinada** dentro de 1 recorte; "Comparar"
   fica reservado a comparações explícitas, preservando os demais filtros
   entre A e B (decisão 11).
5. ~~Precisa de controle de acesso/perfil?~~ → **não, nesta etapa**
   (decisão 12).
6. ~~Modo apresentação é uso pontual ou contínuo (TV)?~~ → **uso
   pontual**, sem atualização automática (decisão 13).

Qualquer pergunta nova que surgir durante a implementação (decisão de
produto/regra de negócio/arquitetura/segurança/privacidade/acessibilidade)
é adicionada aqui como um novo item, nunca decidida sem consultar o
usuário — mesmo critério já em vigor no Modo de Execução Contínua do
projeto.
