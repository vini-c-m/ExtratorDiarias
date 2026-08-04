# Central Analítica — Demonstração Visual de Alta Fidelidade (Sprint 19.3)

> **Sprint 19.3 — exclusivamente mockups conceituais em texto/ASCII
> enriquecido. Nenhuma linha de código, nenhum componente, nenhum HTML,
> nenhum CSS.** Constrói sobre o fluxo aprovado em
> [`v2-arquitetura-funcional.md`](v2-arquitetura-funcional.md) (Sprint
> 19.1) e os wireframes aprovados em [`v2-wireframes.md`](v2-wireframes.md)
> (Sprint 19.2) — não redesenha decisões já fechadas, só as leva a uma
> fidelidade visual mais próxima do resultado final: densidade de
> informação real, tokens de cor reais do Design System já existente
> ("Neon Tech UI", `frontend/src/theme/`), estados de foco/hover
> anotados.

> ⚠️ **Todo dado (SEI, nome, valor, data) nestes mockups é ilustrativo**,
> marcado `[exemplo]` na primeira aparição em cada tela.

> 🟡 Mantém a mesma convenção de pendência da Sprint 19.2 — elemento
> marcado `🟡 PENDENTE` depende de uma das 8 perguntas em aberto
> (`v2-arquitetura-funcional.md` § 14) e não deve ser lido como decisão
> fechada.

## Sumário

0. [Base visual usada nesta demonstração](#0-base-visual-usada-nesta-demonstração)
1. [Tela inicial](#1-tela-inicial)
2. [Pesquisa aplicada](#2-pesquisa-aplicada)
3. [Resumo do recorte](#3-resumo-do-recorte)
4. [Tabela](#4-tabela)
5. [Painel de detalhes](#5-painel-de-detalhes)
6. [Dashboard](#6-dashboard)
7. [Relatórios](#7-relatórios)
8. [Diagnóstico](#8-diagnóstico)
9. [Estados de carregamento](#9-estados-de-carregamento)
10. [Estados de erro](#10-estados-de-erro)
11. [Sem resultados](#11-sem-resultados)
12. [Jornada completa do servidor DIMCAC](#12-jornada-completa-do-servidor-dimcac)
13. [Avaliação crítica da solução proposta](#13-avaliação-crítica-da-solução-proposta)
14. [Confirmação de escopo](#14-confirmação-de-escopo)

---

## 0. Base visual usada nesta demonstração

Nada abaixo é inventado para esta Sprint — são os tokens já existentes e
homologados em `frontend/src/theme/cores.ts` e `estilos.ts`, citados aqui
só para que os mockups usem exatamente a paleta que a implementação real
vai usar (nunca uma paleta nova "de mockup"):

| Papel visual | Token real | Anotação usada nesta demonstração |
| --- | --- | --- |
| Fundo do app | `#060818` → `#0b1120` (degradê) | `▓ fundo escuro ▓` |
| Superfície de cartão/painel ("vidro") | `SUPERFICIE_BASE` — borda e fundo translúcidos, `backdrop-blur`, cantos de 20px | `░ superfície vidro ░` |
| Cor de marca / info / ativo | ciano (`cyan-400`) | `《ciano》` |
| Sucesso | verde-esmeralda (`emerald-400`) | `《verde》` |
| Aviso / atenção | âmbar (`amber-400`) | `《âmbar》` |
| Erro / falha técnica | vermelho (`red-400`) — **nunca** para veredito de negócio (RN-08) | `《vermelho》` |
| Neutro estrutural | `slate` | `《slate》` |
| Anel de foco (navegação por teclado) | azul, sempre visível em `:focus-visible` | `⟦foco de teclado⟧` |

Ícones citados usam os mesmos nomes de `lucide-react` já em uso no
projeto (`Search`, `Inbox`, `ChevronDown`, `SlidersHorizontal`,
`ArrowUp`/`ArrowDown`, etc. — `TabelaDiarias.tsx`,
`PainelFiltrosAvancados.tsx`) — nenhum ícone novo é proposto sem
necessidade.

---

## 1. Tela inicial

### Mockup

```
▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓
▓  ← Hub                                          ⚙          《●verde》Online ▓
▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░▓
▓░ 🕐 Base Local sincronizada às 14:32 [exemplo]   [ Sincronizar agora ]   ░▓
▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░▓
▓                                                                            ▓
▓  Central Analítica                                                        ▓
▓  Filtre os registros da Planilha Oficial e gere dashboards, relatórios     ▓
▓  ou diagnósticos a partir do mesmo recorte.                                ▓
▓                                                                            ▓
▓░ ░ ░ ░ ░ ░ ░ ░ ░ ░ ░ ░ FILTROS RÁPIDOS ░ ░ ░ ░ ░ ░ ░ ░ ░ ░ ░ ░ ░ ░ ░ ░ ░ ░▓
▓░                                                                          ░▓
▓░  ⟦Hoje⟧ 《slate, borda sutil》  [Últimos 7 dias]  [Últimos 30 dias]       ░▓
▓░  [Mês atual]  [Mês anterior]  [Ano inteiro]                              ░▓
▓░  [Aguardando liberação 🟡]  [Registros incompletos]  [Possível          ░▓
▓░   inconsistência]                                                        ░▓
▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░▓
▓                                                                            ▓
▓░ FILTROS                                            [ SlidersHorizontal ▾]░▓
▓░ ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐         ░▓
▓░ │ Período            │ │ SEI                │ │ CPF                 │         ░▓
▓░ │ [dd/mm/aaaa] até   │ │ [________________] │ │ [________________]  │         ░▓
▓░ │ [dd/mm/aaaa]       │ │                     │ │                      │         ░▓
▓░ └──────────────────┘ └──────────────────┘ └──────────────────┘         ░▓
▓░                                                                          ░▓
▓░                        [ Limpar filtros 《slate》 ]  [ Aplicar filtros 《ciano, preenchido》 ]░▓
▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░▓
▓                                                                            ▓
▓                  (resultados aparecem logo abaixo, § 3/§ 4 —              ▓
▓                   estado inicial: registros mais recentes, sem filtro)    ▓
▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓
```

### Objetivo

Ser o único ponto de entrada da Central Analítica — nenhuma decisão de
"para onde ir" antes de filtrar; o usuário já está, desde o primeiro
segundo, na tela que vai gerar o resultado que ele precisa.

### Fluxo esperado do usuário

1. Abre a Central Analítica a partir do Hub.
2. Vê a Base Local já sincronizada (ou o aviso de verificação, § 9) sem
   precisar de nenhuma ação.
3. Ou clica num filtro rápido (mais comum), ou expande "Avançados" e
   preenche campos específicos.
4. Rola a página (ou nem precisa, se a tela for alta o suficiente) para
   ver os resultados já refletidos abaixo.

### Decisões de UX

- Filtros rápidos antes dos avançados — resolve a maioria dos casos de
  uso com 1 clique, sem exigir que o usuário pense em "quais campos
  preencher".
- "Avançados" nasce colapsado (herdado de `PainelFiltrosAvancados`) —
  reduz a carga visual inicial para quem só quer o padrão.
- Nenhuma escolha de "Dashboard/Pesquisa/Relatórios" nesta tela —
  eliminação intencional da decisão prematura que existia no modelo de
  abas (19.1 § 1).

### Decisões de acessibilidade

- Todo filtro rápido é um botão real (`<button>`), navegável por Tab,
  com `aria-pressed` quando ativo — não uma `<div>` clicável.
- `SlidersHorizontal ▾` do painel avançado usa `aria-expanded`/
  `aria-controls` (mesmo padrão já implementado em
  `PainelFiltrosAvancados.tsx`).
- Ordem de tabulação segue a ordem visual: filtros rápidos → avançados →
  Limpar → Aplicar — nunca uma ordem de foco que salte de forma
  inesperada.

### Decisões de produtividade

- Campos de texto livre (SEI, CPF, servidor, matrícula) continuam com
  debounce de 400ms (herdado) — digitar não dispara uma requisição por
  tecla.
- Filtro rápido "Hoje"/"Mês atual"/etc. preenche e aplica em 1 clique só
  (sem exigir confirmar "Aplicar" depois) — atalho de verdade, não um
  atalho que ainda pede uma segunda ação.

---

## 2. Pesquisa aplicada

### Mockup

```
▓ FILTROS                                              [ SlidersHorizontal ▴]▓
▓░ Filtros ativos:  《ciano, pílula》Período: 01/06–30/06/2026 ✕            ░▓
▓░                  《ciano, pílula》Destino: Araripina-PE ✕                ░▓
▓░                                              [ Limpar tudo 《slate》 ]   ░▓
▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░▓
```

### Objetivo

Deixar explícito, o tempo todo, **o que está sendo mostrado** — nunca o
usuário precisa lembrar de cabeça quais filtros aplicou.

### Fluxo esperado do usuário

1. Aplica um ou mais filtros (§ 1).
2. Os filtros viram pílulas removíveis logo abaixo do painel — cada
   pílula tem um `✕` próprio.
3. Pode remover um de cada vez (clique no `✕` da pílula) ou tudo de uma
   vez ("Limpar tudo").
4. A tabela (§ 4) e o resumo (§ 3) reagem imediatamente a cada mudança.

### Decisões de UX

- Pílulas na cor de marca (ciano) — não âmbar/vermelho, porque um filtro
  ativo não é um alerta, é um estado normal de uso.
- Cada pílula usa o rótulo em linguagem de negócio ("Destino:
  Araripina-PE"), nunca o nome técnico do parâmetro (`destino=Araripina`).

### Decisões de acessibilidade

- Cada `✕` de pílula tem `aria-label="Remover filtro: Destino"` (nunca só
  o glifo `✕` sem contexto para leitor de tela).
- Mudança de filtro anuncia a nova contagem de resultados via região
  `aria-live="polite"` (mesmo padrão já usado no esqueleto de
  carregamento, `TabelaDiarias.tsx`).

### Decisões de produtividade

- Remover um filtro nunca limpa os demais — cada pílula é independente.
- "Limpar tudo" existe separado de remover uma a uma, para o caso comum
  de "quero recomeçar do zero" sem precisar de N cliques.

---

## 3. Resumo do recorte

### Mockup

```
▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░▓
▓░  RECORTE ATUAL                                                          ░▓
▓░                                                                          ░▓
▓░  《texto grande, branco》312 registros [exemplo]                        ░▓
▓░  《texto auxiliar, slate》período considerado: 01/06/2026 – 30/06/2026   ░▓
▓░                                                                          ░▓
▓░  312 diárias · 298 servidores · 1 município · R$ 149.760,00 [exemplo]   ░▓
▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░▓
▓░                                                                          ░▓
▓░  ┌──────────────────────┐  ┌──────────────────────┐  ┌──────────────────────┐░▓
▓░  │ 📊 Gerar Dashboard     │  │ 📄 Gerar Relatório     │  │ 🔎 Análise Rápida     │░▓
▓░  │ 《ciano, preenchido》 │  │ 《ciano, contorno》   │  │ 《ciano, contorno》   │░▓
▓░  └──────────────────────┘  └──────────────────────┘  └──────────────────────┘░▓
▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░▓
```

### Objetivo

Ser o "resumo executivo" do que o usuário está prestes a transformar em
dashboard/relatório/diagnóstico — e o ponto de decisão sobre qual dessas
três ações tomar.

### Fluxo esperado do usuário

1. Lê a contagem e o resumo básico.
2. Decide entre continuar explorando a tabela (§ 4), ou já ir direto para
   uma das três ações.
3. Se clicar numa ação, é levado para a tela correspondente (§ 6/§ 7/§ 8)
   carregando exatamente este recorte.

### Decisões de UX

- "Gerar Dashboard" é o botão preenchido (mais proeminente) — é a ação
  mais provável de ser a primeira escolhida por quem está s
  explorando os dados, os outros dois ficam com contorno (hierarquia
  visual, não esconde nenhum).
- O resumo básico (contagem de servidores/municípios/valor) usa
  exatamente os mesmos números que os KPIs do Dashboard vão mostrar —
  nunca uma segunda fonte de cálculo (19.1 § 2).

### Decisões de acessibilidade

- Contagem de resultados fica dentro de uma região `aria-live="polite"`
  — leitor de tela anuncia a mudança sem precisar o usuário navegar até
  lá de novo a cada filtro.
- Os três botões de ação têm `aria-describedby` apontando para o motivo
  quando desabilitados (§ 9/§ 11) — nunca só `disabled` silencioso.

### Decisões de produtividade

- Os três botões nunca somem — ficam desabilitados com tooltip
  explicando o motivo (§ 9/§ 11), então o usuário nunca precisa
  "descobrir" onde eles foram parar quando o recorte muda.

---

## 4. Tabela

### Mockup

```
▓░ 312 resultados [exemplo] · ordenados por período (mais recente primeiro)  [⚙ Colunas]░▓
▓░┌────────────────────┬──────────────────┬───────────────┬───────────────┬────────────┬───┐░▓
▓░│ SEI 《ciano, ativa,│ Servidor          │ Período        │ Destino        │ Valor      │   │░▓
▓░│ ArrowDown》         │                    │                │                │             │   │░▓
▓░├────────────────────┼──────────────────┼───────────────┼───────────────┼────────────┼───┤░▓
▓░│ 19.20...0720/2024  │ João da Silva      │ 08–10/06/2026  │ Araripina-PE   │ R$ 480,00  │ ▸ │░▓
▓░│ [exemplo]           │ [exemplo]           │ [exemplo]       │ [exemplo]       │ [exemplo]  │   │░▓
▓░├────────────────────┼──────────────────┼───────────────┼───────────────┼────────────┼───┤░▓
▓░│ 19.20...0331/2024  │ Maria Souza        │ 22–23/06/2026  │ Araripina-PE   │ —《âmbar》⚠ │ ▸ │░▓
▓░│  [exemplo]          │                    │                │                │ vazio       │   │░▓
▓░├────────────────────┼──────────────────┼───────────────┼───────────────┼────────────┼───┤░▓
▓░│ 19.20...0512/2024《│ (não cadastrado)   │ 03–05/06/2026  │ —《âmbar》⚠    │ R$ 308,19  │ ▸ │░▓
▓░│ âmbar linha inteira》│ 《âmbar》⚠         │                │  vazio         │            │   │░▓
▓░└────────────────────┴──────────────────┴───────────────┴───────────────┴────────────┴───┘░▓
▓░                                          ‹ 1  2  3 … 13 ›  《ciano, página atual destacada》░▓
```

*(exemplos ilustrativos)*

**Tooltip em texto longo (foco ou hover na célula "Motivo"):**

```
  │ Participação em curso de capacitação e...  (cortado, ellipsis) │
        ⟦foco de teclado⟧ ou hover ↓
  ┌────────────────────────────────────────────────────────────────┐
  │ Participação em curso de capacitação e atualização profissional │
  │ promovido pela Secretaria Estadual [exemplo]                     │
  └────────────────────────────────────────────────────────────────┘
```

**Configuração de colunas:**

```
  [ ⚙ Colunas ]
  ░ Sempre visíveis: SEI · Servidor · Período · Destino · Valor          ░
  ░ Opcionais: ☐ Origem  ☐ Trecho completo  ☐ Motivo                     ░
  ░            ☐ Situação do servidor  ☐ Matrícula  ☐ CPF (mascarado)    ░
  ░            ☐ Doc. origem  ☐ Transporte                                ░
  ░                                              [ Aplicar 《ciano》 ]    ░
```

### Objetivo

Deixar o recorte inteiro navegável e comparável linha a linha, sem
esconder nenhuma lacuna ou possível problema atrás de uma célula em
branco silenciosa.

### Fluxo esperado do usuário

1. Rola verticalmente pela lista (altura fixa com scroll próprio,
   herdado de `ALTURA_LISTA_ROLAVEL`).
2. Opcionalmente ativa colunas extras via "⚙ Colunas".
3. Passa o mouse (ou foca via teclado) sobre células cortadas para ler o
   texto completo.
4. Clica numa linha para abrir o detalhamento (§ 5).
5. Usa a paginação no rodapé para ir além da página atual.

### Decisões de UX

- Vazio (`—`) sempre acompanhado do ícone âmbar de atenção — nunca um
  traço "mudo" que o usuário possa confundir com "não se aplica".
- Linha com inconsistência ganha destaque no início da linha (mesma cor
  âmbar/laranja do Diagnóstico, § 8) — consistência visual entre tabela
  e diagnóstico é deliberada (19.1 § 4.2).
- Página atual destacada em ciano no rodapé de paginação (herdado, sem
  mudança).

### Decisões de acessibilidade

- Cabeçalho de coluna ordenável usa `aria-sort="ascending"/"descending"/
  "none"` (já implementado, preservado).
- Tooltip de texto cortado é acionável por teclado (`:focus-visible`),
  nunca só `:hover` — usuário sem mouse consegue ler o texto completo.
- Linha da tabela é `tabIndex={0}` com `aria-label` descritivo ("Ver
  detalhamento da diária 19.20...0720/2024") — já implementado,
  preservado.
- Ícone de vazio/inconsistência nunca é a única forma de comunicar o
  estado — sempre acompanhado de texto (tooltip) para quem usa leitor de
  tela ou não distingue cor.

### Decisões de produtividade

- Configuração de colunas é local (não pede confirmação ao backend) —
  ativar/desativar coluna é instantâneo.
- Ordenação com 1 clique no cabeçalho (sem menu de contexto) — mesma
  interação já validada na v1.
- Paginação sempre no servidor — nunca carrega mais do que uma página de
  cada vez, mantendo a tabela responsiva mesmo com milhares de
  registros no recorte.

---

## 5. Painel de detalhes

### Mockup

```
                                                    ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
                                                    ░  Diária                     ✕  ░
  (tabela ao fundo,                                ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
   escurecida ~40%)                                ░  SEI                            ░
                                                    ░  19.20.0903.0030720/2024-36     ░
                                                    ░  [exemplo]                       ░
                                                    ░─────────────────────────────────░
                                                    ░  Servidor                        ░
                                                    ░  João da Silva [exemplo]         ░
                                                    ░  Matrícula: 123456 [exemplo]      ░
                                                    ░  CPF: ***.***.***-11             ░
                                                    ░  Situação do servidor:            ░
                                                    ░  《verde》● Em exercício          ░
                                                    ░─────────────────────────────────░
                                                    ░  Período                         ░
                                                    ░  08/06/2026 – 10/06/2026         ░
                                                    ░─────────────────────────────────░
                                                    ░  Origem → Destino                 ░
                                                    ░  Recife-PE → Araripina-PE         ░
                                                    ░  Trecho completo:                 ░
                                                    ░  "Recife-PE - Araripina-PE"       ░
                                                    ░─────────────────────────────────░
                                                    ░  Motivo                          ░
                                                    ░  Participação em curso de         ░
                                                    ░  capacitação [exemplo]            ░
                                                    ░─────────────────────────────────░
                                                    ░  Valores                         ░
                                                    ░  Total das diárias: R$ 480,00    ░
                                                    ░  Transporte: Aéreo [exemplo]       ░
                                                    ░─────────────────────────────────░
                                                    ░  《âmbar》⚠ Campos vazios         ░
                                                    ░  Nenhum neste registro             ░
                                                    ░─────────────────────────────────░
                                                    ░  🔎 Avisos e diagnósticos          ░
                                                    ░  《âmbar》● Atenção — DH ainda      ░
                                                    ░  não emitido (processo em fase      ░
                                                    ░  de liquidação)                     ░
                                                    ░                                    ░
                                                    ░  [Ver histórico deste CPF《ciano》]░
                                                    ░  [ Copiar SEI 《slate》]           ░
                                                    ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
```

### Objetivo

Dar a visão completa de um único registro, sem exigir que o usuário
volte à planilha original para conferir algo que a tabela resumida não
mostrou.

### Fluxo esperado do usuário

1. Clica numa linha da tabela (§ 4).
2. O painel desliza sobre a tabela (a tabela permanece visível, só
   escurecida) — nunca troca de tela inteira.
3. Lê os blocos de cima para baixo: identificação → servidor → período →
   trajeto → motivo → valores → qualidade do dado.
4. Fecha com `✕`, `Esc` ou clique fora — volta exatamente ao ponto da
   tabela onde estava.

### Decisões de UX

- CPF sempre mascarado, sem botão de revelar (decisão vinculante já
  herdada, `ui-wireframes.md` § 3) — mantida sem mudança nesta Sprint.
- Bloco "Avisos e diagnósticos" usa a mesma cor/ícone do catálogo do
  Diagnóstico (§ 8) — nunca um estilo de alerta próprio e desalinhado.
- "Situação do servidor" com bolinha verde/âmbar conforme o valor (verde
  = "Em exercício", âmbar = outros/ausente) — reforço visual rápido sem
  precisar ler o texto.

### Decisões de acessibilidade

- Painel é um `role="dialog"` com foco automático no título ao abrir, e
  foco devolvido ao elemento da tabela que abriu o painel, ao fechar
  (mesmo padrão de qualquer diálogo modal do app, `DialogoConfirmacao`).
- `Esc` fecha o painel a partir de qualquer campo focado dentro dele.
- Ordem de leitura por leitor de tela segue a ordem visual (top-down),
  sem `tabindex` fora de ordem.

### Decisões de produtividade

- "Ver histórico deste CPF" evita o usuário ter que copiar o CPF, voltar
  à tabela e colar no filtro manualmente — 1 clique aplica o filtro e
  volta.
- "Copiar SEI" cobre o caso comum de precisar colar o número em outro
  sistema (ex.: SEI, e-Fisco) sem selecionar texto manualmente.

---

## 6. Dashboard

### Mockup

```
▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓
▓  ← Voltar aos resultados 《ciano》            312 registros [exemplo]     ▓
▓  Dashboard · Período: 01/06–30/06/2026 · Destino: Araripina-PE            ▓
▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓
▓░┌─────────┐┌─────────┐┌─────────┐┌─────────┐                            ░▓
▓░│ Diárias  ││Servidores││Municípios🟡││ Valor    │                            ░▓
▓░│  312     ││   298    ││    1      ││R$149.760 │  《texto branco grande,   ░▓
▓░│[exemplo] ││[exemplo] ││[exemplo]  ││[exemplo] │   rótulo slate pequeno》  ░▓
▓░└─────────┘└─────────┘└─────────┘└─────────┘                            ░▓
▓░┌─────────┐┌─────────┐┌─────────┐┌─────────┐                            ░▓
▓░│ Médio    ││Completos ││Incomp.🟡 ││Aguard.🟡 │                            ░▓
▓░│ R$480,00 ││   289    ││    23     ││    4      │                            ░▓
▓░│[exemplo] ││《verde》 ││《âmbar》  ││《âmbar》  │                            ░▓
▓░└─────────┘└─────────┘└─────────┘└─────────┘                            ░▓
▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░▓
▓░┌─ Evolução por período [exemplo] ─────────┐ ┌─ Valores por período [ex.]┐░▓
▓░│      ▂▃▅▆█▇▅▃▂ 《ciano》                  │ │   R$ ▂▃▅▆█▇▅▃▂ 《ciano》  │░▓
▓░│  jan  fev  mar  abr  mai  jun              │ │ jan fev mar abr mai jun    │░▓
▓░└──────────────────────────────────────────┘ └────────────────────────────┘░▓
▓░┌─ Ranking de servidores (top 5) [ex.] ─────┐ ┌─ Ranking de municípios ───┐░▓
▓░│ João da Silva    ████████《ciano》 12      │ │ Araripina-PE  ██████████ 89│░▓
▓░│ Maria Souza      ██████ 9                  │ │ Petrolina-PE  ███████    62│░▓
▓░│ ...                                          │ │ ...                          │░▓
▓░└──────────────────────────────────────────┘ └────────────────────────────┘░▓
▓░┌─ Distribuição por motivo [ex.] ───────────┐ ┌─ Situação do servidor ────┐░▓
▓░│ ◕ Capacitação  41% 《ciano》                │ │ ◕ Em exercício  94%《verde》│░▓
▓░│ ◔ Reunião       33% 《slate claro》         │ │ ◔ Não informado  6%《âmbar》│░▓
▓░│ ◑ Fiscalização  26% 《slate》                │ │                             │░▓
▓░└──────────────────────────────────────────┘ └────────────────────────────┘░▓
▓░┌─ Origem × Destino (principais) [ex.] ─────┐ ┌─ Completos × incompletos ─┐░▓
▓░│ Recife → Araripina        ██████ 58        │ │ ████████████████░░░░ 289  │░▓
▓░│ Recife → Petrolina        ████   34        │ │ 《verde》completos          │░▓
▓░│ ...                                          │ │ 《âmbar》23 incompletos 🟡 │░▓
▓░└──────────────────────────────────────────┘ └────────────────────────────┘░▓
▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░▓
▓░                                     [ Exportar dashboard ▾ 《ciano》]    ░▓
▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓
```

**Interação — clique numa barra do gráfico refina o recorte:**

```
  clique em "jun" ──▶  adiciona filtro Período=jun/2026 ao recorte atual
                        (nunca substitui os filtros existentes)
                    ──▶  volta para a tabela (§4) já refinada
                        chip novo aparece em "Filtros ativos" (§2),
                        removível como qualquer outro
```

### Objetivo

Transformar o recorte filtrado numa leitura agregada — a pergunta
"quanto/quem/onde/quando" respondida em uma tela só, sem o usuário
precisar montar tabela dinâmica manualmente (motivação original do
projeto, `README.md` § 1).

### Fluxo esperado do usuário

1. Chega ao Dashboard a partir do botão "Gerar Dashboard" (§ 3), com o
   recorte já carregado.
2. Lê os 9 cartões de indicador no topo.
3. Explora os 8 gráficos, opcionalmente clicando numa barra/fatia para
   refinar.
4. Volta aos resultados (link no topo) quando quiser ver a lista
   detalhada de novo, ou exporta o dashboard (rodapé).

### Decisões de UX

- KPIs sempre no topo, gráficos abaixo — leitura de cima para baixo do
  mais resumido para o mais detalhado.
- "Total de processos" não vira um cartão a mais (mesmo texto do que
  "Total de diárias") — evita sugerir uma métrica que o modelo de dados
  não sustenta (19.1 § 6.1).
- Cartões `🟡` (Municípios/Incompletos/Aguardando) permanecem visíveis
  no mockup porque são requisito do pedido original, mas com a
  ressalva clara de que a regra de cálculo ainda depende de decisão do
  DIMCAC.

### Decisões de acessibilidade

- Cada gráfico tem um resumo em texto equivalente disponível (ex.: a
  tabela por trás de um gráfico de barras pode ser alternada para modo
  texto) — decisão de implementação a confirmar na 19.4, mas o
  princípio ("gráfico nunca é a única forma de acessar o dado") já é
  registrado aqui como requisito, não como detalhe posterior.
- Cores do gráfico nunca são o único diferenciador de série — sempre
  acompanhadas de rótulo textual (nome do mês, nome do servidor) dentro
  do próprio gráfico ou em legenda.

### Decisões de produtividade

- Clique em gráfico refina sem exigir reconfigurar filtro manualmente —
  atalho direto de "explorar visualmente" para "ver a lista exata".
- "Voltar aos resultados" sempre no mesmo lugar (topo esquerdo) — nunca
  muda de posição entre Dashboard/Relatório/Diagnóstico, para virar
  hábito motor do usuário frequente.

---

## 7. Relatórios

### Mockup — janela de configuração

```
░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
░  Gerar relatório                                                     ✕  ░
░  Recorte atual: 312 registros [exemplo] · 01/06/2026–30/06/2026          ░
░────────────────────────────────────────────────────────────────────────░
░  Tipo de relatório                                                       ░
░  (●) Executivo 《ciano, selecionado》 — resumo de 1 página                ░
░  ( ) Detalhado    — todos os indicadores, gráficos e a tabela            ░
░  ( ) Financeiro   — foco em valores, sem dados cadastrais                ░
░  ( ) Por servidor · ( ) Por município · ( ) Por situação                 ░
░  ( ) Inconsistências · ( ) Qualidade dos dados                            ░
░────────────────────────────────────────────────────────────────────────░
░  Formato          (●) PDF   ( ) Excel (.xlsx)   ( ) CSV                  ░
░────────────────────────────────────────────────────────────────────────░
░  Conteúdo a incluir                                                       ░
░  ☑ Indicadores  ☑ Gráficos*  ☑ Tabela completa  ☑ Inconsistências        ░
░  *Gráficos disponíveis apenas para PDF                                    ░
░────────────────────────────────────────────────────────────────────────░
░                                [ Cancelar 《slate》 ] [Pré-visualizar《ciano》]░
░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
```

### Mockup — pré-visualização e confirmação

```
░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
░  Pré-visualização — Relatório Executivo (PDF)                        ✕  ░
░────────────────────────────────────────────────────────────────────────░
░  ┌──────────────────────────────────────────────────────────────┐      ░
░  │ [Identidade visual]  Relatório Executivo — Central Analítica    │      ░
░  │ Período: 01/06–30/06/2026 · Filtros: Destino Araripina-PE       │      ░
░  │ [grade de KPIs em miniatura] [1–2 gráficos em miniatura]        │      ░
░  │ Gerado em 03/08/2026 14:40 · Sincronizado às 14:32 [exemplo]    │      ░
░  └──────────────────────────────────────────────────────────────┘      ░
░────────────────────────────────────────────────────────────────────────░
░                              [ ← Voltar ]  [ Gerar relatório 《ciano》]  ░
░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
```

### Objetivo

Transformar o recorte em um artefato levável ("para a chefia", "para o
processo administrativo") sem o usuário precisar montar isso manualmente
no Excel.

### Fluxo esperado do usuário

1. Clica em "Gerar Relatório" (§ 3) com o recorte já pronto.
2. Escolhe tipo + formato + conteúdo.
3. Pré-visualiza (opcional, mas recomendado antes de gerar algo grande).
4. Confirma "Gerar relatório" → acompanha progresso (§ 9) → recebe
   sucesso com opção de abrir/salvar, ou erro com "Tentar novamente"
   (§ 10).

### Decisões de UX

- Pré-visualização é uma etapa própria, não opcional escondida — reduz o
  risco de gerar um PDF de 50 páginas por engano com "Detalhado"
  selecionado sem querer.
- "Gráficos disponíveis apenas para PDF" é dito explicitamente no
  próprio formulário, não descoberto só depois de gerar em Excel e
  notar que faltou.

### Decisões de acessibilidade

- Grupo de rádio "Tipo de relatório" é um `role="radiogroup"` com
  legenda associada — navegável só com setas do teclado dentro do
  grupo.
- Miniatura da pré-visualização tem uma descrição textual equivalente
  (não é só uma imagem sem alternativa) — mesmo princípio dos gráficos
  do Dashboard.

### Decisões de produtividade

- O recorte nunca precisa ser reconfigurado nesta janela — só tipo/
  formato/conteúdo, porque os filtros já vieram prontos (19.1 § 5).
- "Cancelar" sempre disponível sem perguntar confirmação — gerar
  relatório não é uma ação destrutiva, não precisa de fricção extra.

---

## 8. Diagnóstico

### Mockup — resumo

```
▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓
▓  ← Voltar aos resultados                        312 registros [exemplo]  ▓
▓  Análise Rápida · Período: 01/06–30/06/2026 · Destino: Araripina-PE      ▓
▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓
▓░  《verde》● Esperado 289 (93%)  《âmbar》● Atenção 19 (6%)               ░▓
▓░  《laranja》● Inconsistência 4 (1%)  [exemplo]                          ░▓
▓░  ████████████████████████████████░░░░░░░░░░█ 《barra proporcional》     ░▓
▓░────────────────────────────────────────────────────────────────────────░▓
▓░  Nenhum problema crítico encontrado. 23 registros merecem atenção ou      ░▓
▓░  conferência manual.                                                      ░▓
▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░▓
```

### Mockup — lista + cartão individual

```
▓░┌────────────────────┬──────────────┬────────────────────────┬───────┐░▓
▓░│ SEI                 │ Classificação │ Campo problemático       │       │░▓
▓░├────────────────────┼──────────────┼────────────────────────┼───────┤░▓
▓░│ 19.20...0512/2024   │《âmbar》●Atenção│ DH                     │▸Ver《ciano》│░▓
▓░│ 19.20...0331/2024   │《âmbar》●Atenção│ Destino                │▸Ver   │░▓
▓░│ 19.20...0890/2024   │《laranja》●Inconsist.│CPF+Período (duplicado)│▸Ver│░▓
▓░└────────────────────┴──────────────┴────────────────────────┴───────┘░▓

  ↓ clique em "▸ Ver" no 1º item — cartão de diagnóstico (mesmo painel do §5):

  ░─────────────────────────────────────────────────────────────────────░
  ░  《âmbar》● Atenção — Documento Hábil (DH) ainda não emitido           ░
  ░                                                                        ░
  ░  Campo problemático: DH                                               ░
  ░  Motivo provável: este processo ainda não chegou à fase de            ░
  ░  liquidação — a extração do PDF só grava o DH quando o Despacho de    ░
  ░  Validação já existe. Isso é esperado para processos recentes.        ░
  ░                                                                        ░
  ░  Ação recomendada: nenhuma ação imediata; se o processo já é antigo,  ░
  ░  confira manualmente o andamento no SEI.                              ░
  ░  🟡 PENDENTE — limiar de "antigo demais" ainda não definido            ░
  ░  (v2-arquitetura-funcional.md § 14, pergunta 4).                       ░
  ░─────────────────────────────────────────────────────────────────────░
```

**Distinção obrigatória DH × PASSAR DIA (lado a lado, nunca fundidos):**

```
  ┌─ DH vazio ──────────────────────┐   ┌─ PASSAR DIA (janela de 15 dias)─┐
  │ Campo: DH                        │   │ Campo: nenhum (é uma condição    │
  │ Classificação: Atenção 《âmbar》 │   │  de tempo, não um dado ausente)  │
  │ Regra: fase de liquidação         │   │ Classificação: Esperado《verde》│
  │  ainda não atingida                │   │ Regra: RN-06, Vn = Hn − 15       │
  └──────────────────────────────────┘   └──────────────────────────────────┘
```

### Objetivo

Dar ao servidor do DIMCAC uma leitura rápida de "o que merece minha
atenção neste recorte", sem que ele precise vasculhar linha por linha
a planilha — sempre com o motivo explicado, nunca um alerta mudo.

### Fluxo esperado do usuário

1. Clica em "Análise Rápida" (§ 3).
2. Vê o resumo por classificação (topo).
3. Rola a lista de registros afetados.
4. Clica em "▸ Ver" para abrir o cartão de diagnóstico completo daquele
   registro (mesmo painel de detalhamento do § 5, com o bloco de avisos
   em foco).
5. Volta aos resultados quando terminar.

### Decisões de UX

- Barra proporcional (topo) dá a leitura "de relance" antes mesmo de
  rolar a lista — comunicação em 1 elemento visual da saúde geral do
  recorte.
- Nenhuma cor vermelha em nenhum estado do Diagnóstico — mesmo o nível
  mais alto ("Inconsistência") usa laranja, reservando vermelho
  exclusivamente para falha técnica (RN-08, decisão herdada e
  repetida deliberadamente aqui por ser o ponto de maior risco de
  quebra dessa regra).
- Cartão "DH vazio" e cartão "PASSAR DIA" nunca aparecem como o mesmo
  componente reaproveitado sem diferenciação — títulos, campos e
  explicações sempre distintos (requisito explícito desta Sprint).

### Decisões de acessibilidade

- Barra proporcional tem texto equivalente ("93% esperado, 6% atenção,
  1% inconsistência") — nunca só a cor/tamanho do segmento.
- Tabela de registros afetados segue a mesma semântica de acessibilidade
  já usada em `TabelaDiarias` (linha focável, `aria-label` descritivo).

### Decisões de produtividade

- "▸ Ver" abre o mesmo painel de detalhamento já conhecido (§ 5) — o
  usuário não aprende uma interface nova para o Diagnóstico, reaproveita
  o que já usou na tabela.
- Classificação sempre visível na lista (coluna própria) — não é preciso
  abrir cada registro para saber a gravidade.

---

## 9. Estados de carregamento

### Mockup — esqueleto da tabela

```
▓░ ┌────────────────────┬──────────────────┬───────────────┬────────────┐░▓
▓░ │ ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒  │ ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒  │ ▒▒▒▒▒▒▒▒▒▒▒▒  │ ▒▒▒▒▒▒▒▒▒  │░▓
▓░ │ ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒  │ ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒  │ ▒▒▒▒▒▒▒▒▒▒▒▒  │ ▒▒▒▒▒▒▒▒▒  │░▓
▓░ │ ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒  │ ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒  │ ▒▒▒▒▒▒▒▒▒▒▒▒  │ ▒▒▒▒▒▒▒▒▒  │░▓
▓░ └────────────────────┴──────────────────┴───────────────┴────────────┘░▓
     (blocos pulsando suavemente — animate-pulse, herdado)
     texto sr-only paralelo: "Carregando resultados..." (role="status")
```

### Mockup — Dashboard/Relatório/Diagnóstico "calculando"

```
░  📊 Calculando indicadores...                                            ░
░  ┌─────────┐┌─────────┐┌─────────┐┌─────────┐                          ░
░  │ ▒▒▒▒▒▒▒ ││ ▒▒▒▒▒▒▒ ││ ▒▒▒▒▒▒▒ ││ ▒▒▒▒▒▒▒ │  (mesmos blocos pulsantes)░
░  └─────────┘└─────────┘└─────────┘└─────────┘                          ░
```

### Mockup — Relatório gerando

```
░  Gerando relatório...                                                    ░
░  ▓▓▓▓▓▓▓▓▓░░░░░░░░░░  45%  《ciano》                                     ░
```

### Objetivo

Nunca deixar o usuário se perguntando "travou ou está processando?" —
todo carregamento tem um sinal visual e um equivalente para leitor de
tela.

### Fluxo esperado do usuário

Vê o esqueleto/barra assim que dispara qualquer ação que dependa do
backend (aplicar filtro, abrir Dashboard, gerar relatório); a tela real
substitui o esqueleto assim que o dado chega, sem "pulo" brusco de
layout (mesmas dimensões do esqueleto e do conteúdo final).

### Decisões de UX

- Esqueleto reaproveita a mesma superfície "vidro" com opacidade
  reduzida já usada em outros carregamentos do app — nunca um spinner
  genérico desconectado do restante do Design System.
- Barra de progresso determinística (%) quando o backend consegue
  informar progresso real (ex.: geração de relatório grande);
  indeterminada (`Calculando...`, sem %) quando não há como medir.

### Decisões de acessibilidade

- Todo esqueleto é `aria-hidden="true"` com um texto irmão `role="status"
  sr-only"` equivalente (padrão já implementado em `TabelaDiarias.tsx`)
  — leitor de tela não tenta ler blocos decorativos, mas é avisado do
  estado.
- Foco do teclado nunca fica "preso" dentro de uma área em carregamento.

### Decisões de produtividade

- Dimensões do esqueleto = dimensões do conteúdo real (mesmo número de
  colunas/linhas aproximado) — evita o layout "pular" quando o dado
  chega, o que quebraria a leitura de quem já estava rolando a página.

---

## 10. Estados de erro

### Mockup — erro de carregamento

```
▓░ 《vermelho, borda e fundo translúcidos》                                  ░▓
▓░ ⚠️ Não foi possível carregar os resultados.    [ Tentar novamente 《slate》]░▓
▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░▓
```

### Mockup — backend/Base Local indisponível (afeta as 3 ações)

```
▓░  [ 📊 Gerar Dashboard ]  [ 📄 Gerar Relatório ]  [ 🔎 Análise Rápida ]  ░▓
▓░  (desabilitados, opacidade reduzida)                                     ░▓
▓░  ⚠️《vermelho》 Aguardando o aplicativo ficar disponível para habilitar   ░▓
▓░     as ações.                                                            ░▓
```

### Mockup — falha ao gerar relatório

```
░  ⚠️《vermelho》 Não foi possível gerar o relatório.                       ░
░                                              [ Tentar novamente 《slate》]░
```

### Objetivo

Deixar claro que o problema é técnico (do sistema), nunca do dado ou de
algo que o usuário fez errado — e sempre oferecer um próximo passo.

### Fluxo esperado do usuário

Vê o alerta vermelho, lê a frase (sempre em linguagem natural, nunca um
código de erro cru), clica em "Tentar novamente" quando disponível.

### Decisões de UX

- **Vermelho é usado exclusivamente aqui** (e nos estados equivalentes
  de sincronização, já herdados) — em nenhuma outra tela deste
  documento (Diagnóstico, destaque de vazio, etc.) a cor vermelha
  aparece, reforçando a regra RN-08 de forma consistente em toda a
  extensão desta demonstração.
- Mensagem nunca inclui stack trace, código HTTP ou nome de exceção —
  sempre a versão "amigável" (`mensagemAmigavel`, já implementado).

### Decisões de acessibilidade

- Alerta de erro é uma região `role="alert"` — leitor de tela anuncia
  imediatamente, sem exigir navegação até lá.
- "Tentar novamente" é sempre um botão real, focável, nunca só texto
  clicável sem indicação visual de interatividade.

### Decisões de produtividade

- Erro nunca é um beco sem saída — sempre com uma ação de recuperação
  (retry) na própria mensagem, nunca exigindo recarregar a tela inteira.
- Falha ao carregar resultados nunca apaga os filtros já aplicados — o
  usuário tenta de novo sem precisar reconfigurar nada.

---

## 11. Sem resultados

### Mockup — filtro aplicado sem correspondência

```
▓░                                                                          ░▓
▓░                              🔍  《slate claro》                         ░▓
▓░                Nada encontrado para os filtros aplicados.                ░▓
▓░           Ajuste os filtros ou use "Limpar filtros" para recomeçar.      ░▓
▓░                                                                          ░▓
▓░  [ 📊 Gerar Dashboard ]  [ 📄 Gerar Relatório ]  [ 🔎 Análise Rápida ]  ░▓
▓░  (desabilitados)          Ajuste os filtros para habilitar as ações.     ░▓
▓░                                                                          ░▓
```

### Mockup — base ainda vazia (nunca sincronizada)

```
▓░                              📭  《slate claro》                         ░▓
▓░                Ainda não há dados para pesquisar.                       ░▓
▓░     Assim que o primeiro processamento for concluído, os registros       ░▓
▓░                    aparecem aqui.                                        ░▓
```

### Objetivo

Diferenciar claramente "você buscou e não achou" (ação do usuário) de
"o sistema ainda não tem nada" (estado do módulo) — confundir os dois
foi um risco já identificado desde a UX da v1 (`ui-wireframes.md` § 5).

### Fluxo esperado do usuário

Lê a mensagem, entende se o problema é o filtro (ajusta ou limpa) ou se
é a base (aguarda um processamento acontecer) — nunca pensa que o
aplicativo quebrou.

### Decisões de UX

- Ícones diferentes (`🔍` busca vs. `📭` caixa vazia) reforçam
  visualmente que são estados diferentes, mesmo antes de ler o texto.
- As três ações permanecem visíveis, só desabilitadas — reforça que elas
  existem e vão voltar a funcionar assim que houver recorte.

### Decisões de acessibilidade

- Mensagem de "sem resultados" fica em `role="status"` (não
  `role="alert"` — não é um erro, é informação neutra) — mesma
  distinção semântica já usada em `TabelaDiarias.tsx`.
- Texto explica a ação seguinte esperada ("ajuste os filtros"), nunca só
  descreve o estado sem indicar o que fazer.

### Decisões de produtividade

- "Limpar filtros" citado explicitamente no texto do estado vazio — o
  usuário não precisa lembrar onde o botão está, o próprio estado
  aponta o caminho de saída mais rápido.

---

## 12. Jornada completa do servidor DIMCAC

```
Escolher planilha
   │  (Configuração Inicial, já existente — fora do escopo desta Sprint,
   │   mas pré-requisito para a Central Analítica ter dado)
   ▼
Abrir Central Analítica
   │  Hub → clique no card "Central Analítica" (já existente)
   │  → Tela inicial (§1): Base Local já verificada silenciosamente,
   │    resultados mais recentes já visíveis sem esforço nenhum.
   ▼
Filtrar
   │  Clica em um filtro rápido ("Mês atual") ou expande "Avançados" e
   │  preenche campos específicos (§1/§2). Cada mudança já atualiza a
   │  tabela — sem precisar de uma etapa de "confirmar" separada, exceto
   │  quando o próprio botão "Aplicar filtros" é usado.
   ▼
Analisar registros
   │  Lê o resumo do recorte (§3), explora a tabela (§4), abre o
   │  detalhamento de um ou mais registros específicos que chamaram a
   │  atenção (§5) — ex.: um valor vazio destacado em âmbar.
   ▼
Gerar Dashboard
   │  Clica em "Gerar Dashboard" (§3) → vê os KPIs e gráficos do mesmo
   │  recorte (§6) → opcionalmente refina clicando num gráfico → volta.
   ▼
Gerar Relatório
   │  Clica em "Gerar Relatório" (§3) → escolhe tipo "Executivo" e
   │  formato PDF (§7) → pré-visualiza → confirma → recebe o arquivo
   │  pronto para levar à chefia.
   ▼
Executar Diagnóstico
   │  Clica em "Análise Rápida" (§3) → vê o resumo por classificação
   │  (§8) → identifica os 23 registros que merecem atenção → abre
   │  alguns para entender o motivo exato (DH vazio ≠ PASSAR DIA,
   │  nunca confundidos).
   ▼
Exportar
   │  A partir do Dashboard (§6.7) ou do Relatório (§7) já gerado,
   │  exporta em PDF/Excel/CSV/impressão — sempre com o timestamp de
   │  sincronização impresso no artefato (regra vinculante herdada).
   ▼
Fechar
      "← Hub" no cabeçalho (sempre disponível, mesmo padrão de todo o
      app) — volta ao Hub sem perder nenhum dado real (a Central
      Analítica é só-leitura; não há "salvar" nem risco de perda de
      trabalho ao sair).
```

Cada seta desta jornada corresponde a uma transição já desenhada em
`v2-wireframes.md` § 11 (mapa de fluxo) — esta versão só narra a mesma
jornada em primeira pessoa, do ponto de vista do servidor do DIMCAC, sem
introduzir nenhuma tela nova.

---

## 13. Avaliação crítica da solução proposta

### Pontos fortes

1. **Um único recorte, sempre coerente** — Dashboard, Relatório e
   Diagnóstico nunca divergem da Pesquisa porque nunca reconfiguram
   filtro próprio; elimina por construção o problema original que
   motivou a redefinição (19.1 § 1).
2. **Nenhuma funcionalidade homologada da v1 foi perdida** — Base Local
   SQLite, os 5 endpoints, filtros, paginação, ordenação, detalhamento,
   sincronização e máscara de CPF continuam intactos; o custo desta
   mudança é só de casca (§ 11 de `v2-arquitetura-funcional.md`).
3. **Diagnóstico rastreável, nunca especulativo** — cada explicação do
   catálogo (§ 8) cita a fórmula/regra real (RN-01 a RN-10) ou declara
   explicitamente "motivo não determinado automaticamente" — reduz o
   risco de o DIMCAC confiar numa explicação inventada.
4. **Linguagem alinhada ao usuário real** — nenhuma tela expõe termo
   técnico; a correção "Situação do servidor" (em vez de só "Situação")
   é um exemplo concreto de cuidado com precisão sem jargão.
5. **Consistência de cor mantida em toda a extensão do documento** —
   vermelho nunca usado para veredito de negócio, nem uma vez, nas 11
   telas — prova, por amostragem exaustiva, que a regra é sustentável
   na prática, não só na teoria.

### Limitações

1. **Vários indicadores centrais (KPIs de município, incompletos,
   aguardando liberação) dependem de perguntas ainda sem resposta** —
   o Dashboard, tal como desenhado, tem 3 de 9 cartões marcados `🟡`;
   a experiência "final" só fica de fato completa depois que o DIMCAC
   responder às perguntas da 19.1 § 14.
2. **Nenhuma biblioteca de gráfico foi escolhida** (decisão
   deliberadamente adiada) — a fidelidade visual dos 8 gráficos do
   Dashboard é conceitual; a implementação real pode ter limitações de
   biblioteca que exijam ajuste fino não previsto aqui.
3. **O catálogo de diagnóstico (§ 8) cobre os casos mapeados nas Sprints
   anteriores, mas não é garantidamente exaustivo** — a planilha real
   pode revelar padrões de dado ainda não observados na fixture de
   teste usada para as regras documentadas.
4. **Densidade do Dashboard em janela padrão** — 9 KPIs + 8 gráficos é
   bastante conteúdo para uma tela só; mesmo com rolagem vertical
   própria, pode exigir mais rolagem do que o ideal para um resumo
   "executivo" — vale reavaliar na demonstração navegável (19.3 →
   feedback do DIMCAC) se algum agrupamento adicional (abas internas
   dentro do próprio Dashboard, por exemplo) seria bem-vindo.

### Riscos

1. **Risco de over-promise visual** — como esta demonstração já mostra
   layout de alta fidelidade, existe o risco de o DIMCAC interpretar
   isso como "quase pronto"; é importante reforçar que nenhum dado real
   passou por essas telas ainda, e que 19.4 (plano técnico) pode revelar
   ajustes de viabilidade não previstos aqui.
2. **Risco de o catálogo de diagnóstico crescer descontroladamente** —
   à medida que mais "casos reais" forem encontrados na planilha de
   produção, o catálogo (§ 8) tende a crescer; sem um processo definido
   de "como uma nova regra entra no catálogo" (quem aprova, com que
   evidência), o Diagnóstico pode divergir de módulo consultivo
   confiável para lista de suposições acumuladas.
3. **Risco de a distinção DH × PASSAR DIA se perder na implementação**
   — mesmo com o cuidado explícito nesta Sprint (§ 8), são dois textos
   parecidos ("aguardando algo relacionado a data/documento") que um
   desenvolvedor apressado pode fundir num único componente sem essa
   ressalva; recomenda-se que o plano técnico (19.4) trate os dois como
   tipos de diagnóstico estruturalmente distintos (não apenas strings
   diferentes de um mesmo template).
4. **Risco de desempenho não avaliado ainda** — os novos filtros
   (origem/destino/trecho/valor) e os novos endpoints agregados
   (indicadores, distribuições) ainda não têm medição de custo real
   sobre a Base Local SQLite; sem essa medição (prevista só na 19.5+),
   o Dashboard "instantâneo" mostrado aqui é uma aspiração, não um fato
   comprovado.

### Oportunidades futuras

1. **Diagnóstico como insumo de qualidade de dado para a própria
   Planilha Oficial** — hoje é só leitura, mas o catálogo (§ 8) poderia,
   no futuro, alimentar um "checklist de conferência" para quem
   preenche a planilha original, fechando o ciclo entre consulta e
   melhoria da fonte.
2. **Relatórios agendados** — já registrado como pergunta em aberto na
   v1 (`README.md` § 13); com o Relatório agora desacoplado de uma aba
   fixa e definido como "ação sobre um recorte", agendar a geração
   periódica de um recorte salvo (ex.: "relatório mensal de Araripina")
   se torna uma extensão natural, não uma reformulação.
3. **Colunas configuráveis persistidas por usuário** — hoje local
   (sem persistência entre sessões, § 4); se o app algum dia ganhar
   qualquer noção de sessão/perfil (pergunta 8, 19.1 § 14), a
   preferência de colunas seria um primeiro caso de uso natural e de
   baixo risco.
4. **Exportação de um "recorte salvo" reutilizável** — nada nesta
   proposta impede, no futuro, nomear e salvar uma combinação de
   filtros ("Araripina · mês corrente") para reabrir com 1 clique — hoje
   cada visita à Central Analítica começa do zero (estado inicial, § 1).

---

## 14. Confirmação de escopo

- Nenhum componente React foi criado ou modificado.
- Nenhum arquivo HTML ou CSS foi escrito.
- Nenhuma biblioteca de gráficos foi escolhida ou instalada.
- Nenhum endpoint de backend foi criado ou alterado.
- Todos os mockups desta Sprint são texto/ASCII, sem imagem.
- Todo valor numérico exibido está marcado `[exemplo]` e não representa
  dado real da Planilha Oficial.

Aguardando aprovação explícita do DIMCAC antes da Sprint 19.4 (Plano
Técnico).
