# Central Analítica — Plano Técnico do Frontend (Sprint 18.3)

> **Documento histórico — substituído pela redefinição funcional v2**
> (Sprint 19.4, [`v2-plano-tecnico.md`](v2-plano-tecnico.md)): o plano
> abaixo constrói sobre o modelo de 3 abas fixas, substituído por um
> fluxo único antes de Dashboard/Relatórios chegarem a ser implementados
> sobre ele. Mantido como registro do processo de design — não descreve
> a implementação atual.

> **Sprint 18.3 — exclusivamente plano técnico do frontend. Nenhuma linha
> de código.** Constrói sobre `ui-arquitetura.md` (18.1, aprovada) e
> `ui-wireframes.md` (18.2, aprovada, incluindo o fechamento definitivo da
> máscara de CPF sem mecanismo de revelar). O backend (Sprint 17.4,
> homologado) não é alterado. **Sem Dashboard, sem gráfico, sem
> relatório, sem contrato de API inventado** — só o que já existe em
> `app/schemas/analitica.py`/`app/api/analitica.py`.

## Sumário

- [1 — Arquivos e componentes a criar ou alterar](#1--arquivos-e-componentes-a-criar-ou-alterar)
- [2 — Estrutura do shell da Central Analítica](#2--estrutura-do-shell-da-central-analítica)
- [3 — Mapa aba → componente](#3--mapa-aba--componente)
- [4 — Integração com os 6 endpoints homologados](#4--integração-com-os-6-endpoints-homologados)
- [5 — Estado global e estados locais](#5--estado-global-e-estados-locais)
- [6 — Estratégia de pesquisa, filtros, paginação e detalhamento](#6--estratégia-de-pesquisa-filtros-paginação-e-detalhamento)
- [7 — Tratamento de loading, vazio, erro e indisponibilidade](#7--tratamento-de-loading-vazio-erro-e-indisponibilidade)
- [8 — Indicador e fluxo de sincronização](#8--indicador-e-fluxo-de-sincronização)
- [9 — Componente `AbaBloqueada` para Dashboard e Relatórios](#9--componente-ababloqueada-para-dashboard-e-relatórios)
- [10 — Máscara de CPF no frontend](#10--máscara-de-cpf-no-frontend)
- [11 — Reuso do Design System existente](#11--reuso-do-design-system-existente)
- [12 — Estratégia de testes](#12--estratégia-de-testes)
- [13 — Ordem de implementação em etapas pequenas](#13--ordem-de-implementação-em-etapas-pequenas)
- [14 — Critérios de aceite](#14--critérios-de-aceite)
- [15 — Riscos e limites de escopo](#15--riscos-e-limites-de-escopo)
- [16 — Auditoria consolidada (18.4.1–18.4.3) e correção (18.4.3.1)](#16--auditoria-consolidada-1841184-e-correção-18431)
- [17 — Auditoria da 18.4.4 e correção (18.4.4.1)](#17--auditoria-da-1844-e-correção-18441)
- [18 — Consolidação da Sprint 18.5 (aba Pesquisa)](#18--consolidação-da-sprint-185-aba-pesquisa)
- [19 — Correções da auditoria da Sprint 18.5 (sub-etapa 18.5.1)](#19--correções-da-auditoria-da-sprint-185-sub-etapa-1851)
- [20 — Correção da Sprint 18.5.1.1 (focus trap)](#20--correção-da-sprint-18511-focus-trap)

---

## 1 — Arquivos e componentes a criar ou alterar

### 1.1 Novos

| Arquivo | Papel |
| --- | --- |
| `frontend/src/pages/CentralAnalitica.tsx` | Página nova — shell do módulo (§ 2). |
| `frontend/src/components/analitica/IndicadorSincronizacao.tsx` | Os 5 estados de sincronização (§ 8). |
| `frontend/src/components/analitica/BarraPesquisaGlobal.tsx` | Campo único, muda a aba ativa para "pesquisa" ao submeter. |
| `frontend/src/components/analitica/SeletorDeAbas.tsx` | 3 abas, puramente apresentacional. |
| `frontend/src/components/analitica/AbaBloqueada.tsx` | Estado único "Ainda não disponível" (§ 9). |
| `frontend/src/components/analitica/PainelFiltrosAvancados.tsx` | Campos nomeados de filtro, colapsável. |
| `frontend/src/components/analitica/ChipsFiltroAtivo.tsx` | Chips removíveis, um por filtro ativo. |
| `frontend/src/components/analitica/TabelaDiarias.tsx` | Lista paginada de `DiariaResumoResposta` (§ 6). |
| `frontend/src/components/analitica/PainelDetalhamentoDiaria.tsx` | Painel lateral, com CPF mascarado (§ 10). |
| `frontend/src/hooks/useSincronizacao.ts` | Estado de sincronização + disparo manual (§ 8). |
| `frontend/src/hooks/useDiarias.ts` | Estado de filtros/paginação/ordenação + busca (§ 6). |
| `frontend/src/hooks/useOpcoesFiltro.ts` | Busca única de `GET /opcoes-filtro`. |
| `frontend/src/hooks/useDetalhamentoDiaria.ts` | Busca sob demanda de `GET /diarias/{sei}`. |
| `frontend/src/types/analitica.ts` | Tipos espelhando 1:1 `app/schemas/analitica.py`. |
| `frontend/src/lib/mascararCpf.ts` | Função pura de máscara (§ 10) — mesma convenção de `lib/mensagens.ts`/`lib/arquivos.ts` (função utilitária + `.test.ts` ao lado). |

Cada arquivo acima nasce com seu `*.test.ts`/`*.test.tsx` correspondente
(§ 12) — mesma convenção já usada em todo o projeto (`Hub.test.tsx`,
`Conferencia.test.tsx`, `mensagens.test.ts`).

### 1.2 Existentes, a alterar (mínimo necessário, nenhum além disso)

| Arquivo | Alteração |
| --- | --- |
| `frontend/src/App.tsx` | `type Pagina` ganha `"analitica"`; novo branch `{pagina === "analitica" && <CentralAnalitica backendOnline={...} />}`; `Hub` ganha a prop `aoSelecionarAnalitica={() => setPagina("analitica")}`, mesmo padrão de `aoSelecionarProcessamento`/`aoSelecionarConferencia`. |
| `frontend/src/pages/Hub.tsx` | Novo item no array `funcionalidades` (título, descrição, ícone, `cor: "azul"`); nova prop `aoSelecionarAnalitica`. Nenhuma outra mudança — o array já foi desenhado para isso (comentário da Sprint 14: "um 3º módulo futuro é uma linha a mais aqui"). |
| `frontend/src/components/hub/CardFuncionalidade.tsx` | `type Cor` passa de `"roxo" \| "ciano"` para `"roxo" \| "ciano" \| "azul"`; uma entrada nova em cada um dos 3 mapas (`GLOW_POR_COR`, `SELO_POR_COR`, `SETA_POR_COR`) — nenhuma mudança de estrutura, só dados (o comentário do próprio arquivo já antecipa exatamente essa extensão). |
| `frontend/src/services/api.ts` | Estendido (não recriado) com 6 funções novas (§ 4) — mesma convenção de `conferir`/`gerarHistorico`; reaproveita a função privada `mensagemDoErro422` (já genérica, já usada por Conferência/Configuração) sem duplicá-la. |

**Correção a uma suposição de documentos anteriores:** `ux-wireframes.md`
(Anexo J) e `ui-arquitetura.md` (§ 5) descreveram o token
`shadow-glow-blue` como "hoje sem nenhum consumidor de UI fixo". Isso não
é exato — o token já é consumido por `GLOW_PDFS`
(`theme/estilos.ts:56`, `"border-blue-800/30 shadow-glow-blue"`), usado
em `ZonaArrastar.tsx` (zona de arrastar PDFs, aba Processamento). Não há
conflito real (Hub e Processamento nunca aparecem na tela ao mesmo
tempo, e o token é só uma variável de sombra CSS, não uma reserva
semântica exclusiva), mas o card "azul" do Hub reaproveita a mesma cor
visual já associada a PDFs em outra tela — aceitável, sem ação
necessária, só registrado aqui para a documentação parar de afirmar algo
que o código não confirma.

**Nenhum arquivo de `app/` (backend) é criado ou alterado.**

---

## 2 — Estrutura do shell da Central Analítica

```tsx
// esqueleto conceitual, não é código a ser copiado — só a árvore de
// responsabilidade que a implementação (18.4+) deve seguir
<CentralAnalitica backendOnline={...}>
  <IndicadorSincronizacao />
  <BarraPesquisaGlobal onPesquisar={...} />
  <SeletorDeAbas abaAtiva={...} onMudarAba={...} />
  {renderizarConteudoDaAba(abaAtiva)}   {/* mapa § 3 */}
</CentralAnalitica>
```

`CentralAnalitica.tsx` é dona de exatamente um estado local: a aba ativa
(`useState<"dashboard" | "pesquisa" | "relatorios">("dashboard")` —
default herdado, `ui-arquitetura.md` § 0.2). Não há Context/Redux/store
global: cada hook (§ 5) é chamado no nível de página ou de componente que
o usa, mesmo padrão já praticado em `Conferencia.tsx`/`SelecionarProcessar.tsx`
(estado local via `useState`, sem biblioteca de gerenciamento de estado).

`backendOnline` é repassado pela página, mesma convenção de todas as
demais (`Conferencia`, `SelecionarProcessar`) — nenhum hook novo
reimplementa a checagem que `useBackendStatus` já faz em `App.tsx`.

---

## 3 — Mapa aba → componente

Peça central da promessa de "zero retrabalho de shell" (`ui-arquitetura.md`
§ 0.6/§ 4) — implementada como um objeto literal, nunca uma cadeia de
`if`/`else if`:

```tsx
// conceitual — define o contrato, não o código final
const CONTEUDO_POR_ABA: Record<AbaAtiva, ComponentType> = {
  dashboard: () => <AbaBloqueada variante="dashboard" aoIrParaPesquisa={...} />,
  pesquisa: AbaPesquisa,
  relatorios: () => <AbaBloqueada variante="relatorios" aoIrParaPesquisa={...} />,
};
```

`AbaPesquisa` (componente interno de `CentralAnalitica.tsx`, não
listado em § 1 como arquivo próprio — é pequeno o bastante para viver na
própria página, compondo `PainelFiltrosAvancados` + `ChipsFiltroAtivo` +
`TabelaDiarias` + `PainelDetalhamentoDiaria`) é o único ramo com dado
real. Trocar `AbaBloqueada` por um componente real de Dashboard/Relatórios
no futuro é **substituir uma entrada deste objeto** — nenhuma outra parte
do shell (§ 2) muda.

**✅ Decisão fechada na correção 18.4.4.1 — forma real do mapa:** a
implementação (18.4.4) usa `Record<AbaAnalitica, ReactNode>` — cada
entrada já é o elemento React construído (`<AbaBloqueada variante="..."
.../>`), não uma função/componente (`ComponentType`) resolvida sob
demanda como o esboço acima sugeria. Avaliado explicitamente nesta
correção (o próprio § 15, risco 2, previa essa verificação numa
auditoria) e mantido como está, pelos seguintes motivos:
- O React só invoca o corpo de um componente (e, portanto, só executa
  seus hooks/efeitos) quando o elemento é efetivamente devolvido pela
  árvore renderizada de um componente pai — construir um elemento
  `<X .../>` como valor de uma propriedade de objeto que não é
  retornada não aciona `X` de forma nenhuma. As duas entradas não
  selecionadas do mapa nunca chegam a montar, então nunca disparam
  `fetch`/hook, com ou sem essa indireção de função.
- A promessa que este parágrafo protege — "trocar `AbaBloqueada` por um
  componente real é substituir uma entrada do objeto, sem tocar no
  shell" — vale igualmente para os dois formatos: um objeto literal de
  elementos ou um objeto literal de funções que devolvem elementos são,
  para esse propósito, equivalentes.
- É a forma mais direta de expressar "um elemento por aba" nesta página
  (sem indireção de chamar uma função só para obter o mesmo elemento),
  consistente com o padrão já usado alhures no projeto (`VEREDITO_BANNER`
  em `Conferencia.tsx`, também um `Record` de dados/elementos, não de
  funções).

O trecho de código acima (`ComponentType`) permanece só como registro
histórico do rascunho original — o contrato vigente é `Record<AbaAnalitica,
ReactNode>`, como implementado em `CentralAnalitica.tsx`.

---

## 4 — Integração com os 6 endpoints homologados

Nenhum endpoint além destes 6 (todos já homologados, Sprint 17.4) é
usado. Toda função nova em `services/api.ts` segue a convenção já
existente: `fetch` + verificação de `resposta.ok` + erro tipado.

| # | Endpoint | Função em `services/api.ts` | Hook consumidor |
| --- | --- | --- | --- |
| 1 | `GET /api/v1/analitica/diarias` | `pesquisarDiarias(filtros, paginacao, ordenacao)` → `ResultadoPesquisaResposta` | `useDiarias` |
| 2 | `GET /api/v1/analitica/diarias/{sei}` | `detalharDiaria(sei)` → `DiariaCompletaResposta` | `useDetalhamentoDiaria` |
| 3 | `GET /api/v1/analitica/opcoes-filtro` | `obterOpcoesFiltro()` → `OpcoesFiltroResposta` | `useOpcoesFiltro` |
| 4 | `GET /api/v1/analitica/sincronizacao` | `consultarEstadoSincronizacao()` → `EstadoSincronizacaoResposta` | `useSincronizacao` |
| 5 | `POST /api/v1/analitica/sincronizacao` | `dispararSincronizacaoManual()` → `ExecucaoSincronizacaoResposta` | `useSincronizacao` |
| 6 | `GET /api/v1/analitica/sincronizacao/avisos` | `consultarAvisosSincronizacao(pagina, tamanhoPagina)` → `PaginaAvisosResposta` | (diagnóstico, a partir do indicador — sem hook próprio, chamado sob demanda) |

**Erros, mesma convenção de `conferir`/`gerarHistorico`:**
- `pesquisarDiarias`/`detalharDiaria`/`obterOpcoesFiltro`/
  `consultarAvisosSincronizacao`: `503` → nova classe
  `ErroAnaliticaIndisponivel` (mesmo padrão de `ErroConferenciaIndisponivel`);
  demais erros não-`ok` → `mensagemDoErro422` (reaproveitada, já cobre
  string e lista de validação Pydantic).
- `detalharDiaria`: `404` tratado separadamente — não é
  `ErroAnaliticaIndisponivel` (não é falha técnica), vira uma classe
  própria `DiariaNaoEncontradaError` ou um retorno `null` explícito
  (decisão de detalhe a fechar na implementação, § 13 — qualquer uma das
  duas mantém a distinção de negócio-vs-falha-técnica já praticada no
  resto do app).
- `dispararSincronizacaoManual`: `409` → classe própria
  `SincronizacaoEmAndamentoError` (não é erro, é estado esperado); `422`
  → `mensagemDoErro422` (mapeia `PlanilhaOficialIndisponivel`).

**Tipos (`types/analitica.ts`):** espelham 1:1 `app/schemas/analitica.py`
— `ParametrosPesquisaDiariasQuery`, `ResultadoPesquisaResposta`,
`DiariaResumoResposta`, `DiariaCompletaResposta`, `OpcoesFiltroResposta`,
`EstadoSincronizacaoResposta`, `ExecucaoSincronizacaoResposta`,
`PaginaAvisosResposta`, `AvisoSincronizacaoResposta`, `PaginacaoResposta`.
Nenhum campo é adicionado, renomeado ou omitido em relação ao schema
Pydantic correspondente.

---

## 5 — Estado global e estados locais

**Sem estado global** (Context/Redux/Zustand) — decisão herdada de todo o
app (`ui-arquitetura.md` § 0.4/§ 2), reafirmada aqui porque é a primeira
Sprint com múltiplos hooks de dado coexistindo na mesma página:

| Estado | Dono | Escopo |
| --- | --- | --- |
| Aba ativa | `CentralAnalitica.tsx` | Vida da página (reseta ao sair do módulo, mesma simplicidade de sempre). |
| Estado de sincronização (`EstadoSincronizacaoResposta` + carregando/erro) | `useSincronizacao` (chamado uma vez, em `CentralAnalitica.tsx`, repassado a `IndicadorSincronizacao` via props) | Página inteira — visível em qualquer aba (§ 8). |
| Filtros/paginação/ordenação + resultados (`DiariaResumoResposta[]`) | `useDiarias` (chamado dentro do componente `AbaPesquisa`) | Só existe enquanto a aba Pesquisa está montada — não persiste ao trocar de aba (decisão herdada, "filtros não persistem entre sessões" — aqui estendida a "nem entre trocas de aba", já que não há necessidade de negócio para o contrário). |
| Opções de filtro (`OpcoesFiltroResposta`) | `useOpcoesFiltro` (dentro de `AbaPesquisa`) | Buscado uma vez ao montar a aba; não muda com os filtros aplicados. |
| Registro em detalhamento (`DiariaCompletaResposta \| null`) | `useDetalhamentoDiaria` (dentro de `PainelDetalhamentoDiaria`, ou em `AbaPesquisa` se o painel precisar ser controlado de fora) | Só existe enquanto o painel está aberto. |
| Filtro de texto da barra global (`q`) | `CentralAnalitica.tsx` (precisa cruzar de `BarraPesquisaGlobal` para dentro de `useDiarias`, que vive em `AbaPesquisa`) | Elevado ao componente pai comum (`CentralAnalitica.tsx`) só para essa comunicação entre irmãos — não vira estado "global" do módulo, é local ao shell. |

Nenhum hook novo faz polling contínuo — `useSincronizacao` busca uma vez
ao montar (verificação automática de frescor "ao entrar no módulo",
decisão 1 da arquitetura de backend) e expõe uma função `atualizar()`
para o botão "Sincronizar agora" forçar nova leitura, mesmo padrão
exato de `useConfiguracao` (`atualizar`, chamado depois de uma ação do
usuário, não um timer).

---

## 6 — Estratégia de pesquisa, filtros, paginação e detalhamento

- **Pesquisa rápida (`q`):** `BarraPesquisaGlobal`, ao submeter, muda a
  aba ativa para "pesquisa" e passa o termo para `useDiarias` (via prop/
  callback elevado a `CentralAnalitica.tsx`, § 5) — sem decidir CPF/SEI/
  nome no frontend: `q` viaja como está para `GET /diarias?q=...`, o
  backend já decide o tipo pelo formato (`repositorio_analitico.
  _condicao_pesquisa_global`, Sprint 17.4.3) — nenhuma duplicação dessa
  lógica no cliente.
- **Filtros avançados:** `PainelFiltrosAvancados`, colapsado por padrão
  (herdado). Cada mudança de campo atualiza o estado de `useDiarias` e
  dispara nova busca imediatamente (sem botão "Aplicar" — decisão
  herdada, Anexo B da UX). **Correção documental (18.6.1):** o
  *debounce* se aplica só aos 4 campos de texto livre realmente
  implementados — SEI, CPF, nome do servidor e matrícula — para não
  disparar uma requisição por tecla; detalhe de implementação, não uma
  mudança de contrato. Município **não** está entre eles: é um `select`
  (ver item abaixo), que dispara `onMudarFiltro` imediatamente na
  seleção, sem *debounce* — um `<select>` não gera evento por tecla, então
  a técnica não se aplicaria a ele de qualquer forma. A versão original
  desta seção listava "município" junto aos campos de texto livre com
  *debounce*; era uma inconsistência interna do próprio documento (a
  seção seguinte, abaixo, já definia município como `select`), identificada
  na Sprint 18.5 e só agora corrigida no texto.
- **Opções de filtro:** município/motivo/situação vêm de
  `useOpcoesFiltro` (`GET /opcoes-filtro`) — nunca digitados livremente
  quando há uma lista fechada de valores possíveis (`select`, não
  `input` de texto livre, para esses 3 campos). Município especificamente
  é alimentado por `opcoes.municipios` (`OpcoesFiltroResposta`), populado
  no `<select>` de `PainelFiltrosAvancados` assim que `useOpcoesFiltro`
  resolve — mesma fonte e mesmo componente de motivo/situação, sem
  nenhuma via alternativa de texto livre para esse campo.
- **Paginação:** sempre no servidor (`pagina`/`tamanho_pagina` de
  `ParametrosPesquisaDiariasQuery`) — `TabelaDiarias` nunca recebe mais
  linhas do que uma página; navegação numérica no rodapé, mesma
  convenção do wireframe (`ui-wireframes.md` § 2).
- **Ordenação:** clique no cabeçalho da coluna alterna `ordenar_por`/
  `ordem` em `useDiarias`; `COLUNAS_ORDENACAO` do backend
  (`repositorio_analitico.py`) já define os 5 campos permitidos (`sei`,
  `periodo`, `servidor`, `destino`, `valor`) — o frontend só oferece
  ordenação nessas 5 colunas, nenhuma outra.
- **Detalhamento:** clique numa linha de `TabelaDiarias` chama
  `useDetalhamentoDiaria(sei)`, que busca `GET /diarias/{sei:path}` (SEI
  literal, nunca `.trim()`/normalizado no cliente — RN-12 herdada) e abre
  `PainelDetalhamentoDiaria`. Fechar o painel (✕ ou clique fora) não
  refaz a busca de `useDiarias` — a tabela ao fundo mantém seu estado e
  posição de rolagem (mesma garantia do wireframe, `ui-wireframes.md`
  § 3).

---

## 7 — Tratamento de loading, vazio, erro e indisponibilidade

Implementação direta da matriz já definida em `ui-arquitetura.md` § 8 e
visualizada em `ui-wireframes.md` § 5 — aqui só o mapeamento para estado
de hook:

| Estado do hook `useDiarias` | Renderização em `AbaPesquisa` |
| --- | --- |
| `carregando === true` (primeira busca ou qualquer mudança de filtro) | Esqueleto de tabela (§ 5 do wireframe) |
| `erro !== null` (`ErroAnaliticaIndisponivel` ou outro) | `Alerta variante="erro"` com `mensagemAmigavel(erro, ...)` — mesma função já usada em `Conferencia.tsx`, nenhuma reimplementação |
| `resultado !== null && resultado.pagina.itens.length === 0 && nenhumFiltroAplicado` | Estado "vazio" (J7 — nunca sincronizado) |
| `resultado !== null && resultado.pagina.itens.length === 0 && algumFiltroAplicado` | Estado "sem resultados" (busca feita, nada encontrado) |
| `resultado !== null && itens.length > 0` | `TabelaDiarias` populada |

A distinção "vazio" vs. "sem resultados" (dois textos diferentes, mesmo
`length === 0`) é decidida no frontend por **se algum filtro/`q` está
ativo no momento da resposta** — o backend não precisa (nem deveria)
devolver um campo novo só para essa diferença de copy; `total_avisos`/
`sincronizado_em` de `EstadoSincronizacaoResumidoResposta` (embutido em
`ResultadoPesquisaResposta.sincronizacao`) já é suficiente combinado com
"nenhum filtro ativo" para inferir J7 com segurança.

`useSincronizacao`, `useOpcoesFiltro` e `useDetalhamentoDiaria` seguem o
mesmo padrão de 3 estados (`carregando`/`erro`/`dado`) que `useConfiguracao`
já usa — nenhuma biblioteca de data-fetching (React Query, SWR) é
introduzida; mesma disciplina de "nenhum padrão novo só para este módulo"
(`ui-arquitetura.md` § 1).

---

## 8 — Indicador e fluxo de sincronização

`useSincronizacao`:

```
estado: {
  carregando: boolean;
  erro: string | null;
  dado: EstadoSincronizacaoResposta | null;   // GET /sincronizacao
  sincronizando: boolean;                      // true durante o POST
}
atualizar(): Promise<void>       // GET /sincronizacao — chamado ao montar
sincronizarAgora(): Promise<void> // POST /sincronizacao, depois re-chama atualizar()
```

`IndicadorSincronizacao` traduz esse estado nos 5 estados visuais já
wireframados (`ui-wireframes.md` § 6):

| Estado do hook | Estado visual |
| --- | --- |
| `carregando === true` (chamada inicial) | "Verificando atualizações..." |
| `sincronizando === true` | "Sincronizando..." (botão desabilitado) |
| Acabou de sincronizar com sucesso (`ExecucaoSincronizacaoResposta.status === "sucesso"`) | "Base Local atualizada" (auto-esconde após alguns segundos, `setTimeout` local no componente, não no hook) |
| Última tentativa falhou (`status === "falha"` ou erro de rede no `POST`) | "Falha ao sincronizar" (persiste até nova ação) |
| `dado.possivelmente_desatualizado === true` (e nenhuma sincronização em andamento) | "Os dados podem estar desatualizados" |
| Nenhum dos acima | "Base Local sincronizada às `dado.sincronizado_em`" (normal) |

`dado.status === "nunca_sincronizado"` é um caso do estado "normal"
com texto adaptado (J7) — não é um 6º estado visual, é o mesmo indicador
com uma mensagem diferente, consistente com `EstadoSincronizacaoResposta.
status` já ser um `Literal` de 3 valores no backend, não 5.

**Concorrência (`409`):** ao chamar `sincronizarAgora()`, se o backend
responder `409` (`SincronizacaoEmAndamentoError`), o hook trata como
"já em andamento" — atualiza `sincronizando: true` e agenda uma nova
tentativa de `atualizar()` mais adiante, nunca mostra `Alerta erro`
(não é uma falha, é o RN-A já homologado no backend).

**Avisos de sincronização** (`GET /sincronizacao/avisos`): acessível a
partir de um link/botão secundário dentro de `IndicadorSincronizacao`
(diagnóstico, não é parte dos 5 estados principais) — busca sob demanda,
sem hook próprio (chamada direta de `consultarAvisosSincronizacao` no
handler de clique), population de uma lista simples (reaproveitando
`TabelaDiarias`? Não — é uma lista de avisos, shape diferente; um
componente de lista simples inline em `IndicadorSincronizacao` mesmo,
sem arquivo próprio, dado o volume de informação bem menor que
`TabelaDiarias`).

---

## 9 — Componente `AbaBloqueada` para Dashboard e Relatórios

```
interface PropsAbaBloqueada {
  variante: "dashboard" | "relatorios";
  aoIrParaPesquisa: () => void;
}
```

Sem `fetch`, sem hook, sem estado interno de dado — só 2 textos fixos
(um por variante, mapeados internamente por um `Record<Variante, {titulo,
mensagem}>`, mesmo padrão de `VEREDITO_BANNER` em `Conferencia.tsx`) e um
botão que chama `aoIrParaPesquisa` (repassado de `CentralAnalitica.tsx`,
que muda a aba ativa).

**✅ Decisão fechada na implementação (18.4.4), registrada aqui na
correção 18.4.4.1 — superfície própria em vez de `Alerta`/`Cartao`:**
o rascunho original desta seção previa `Alerta variante="info"` ou um
`Cartao` neutro como superfície. Na prática, nenhum dos dois serve ao
layout do estado bloqueado sem forçar um uso fora do propósito de cada
componente:
- `Alerta` é uma faixa horizontal estreita (ícone + uma linha/parágrafo
  de texto, `flex items-start gap-2.5`, `text-sm`) — pensada para avisos
  inline dentro de um fluxo de tela, não para o bloco central "hero"
  (ícone grande, título, parágrafo, botão, bastante respiro vertical)
  desenhado em `ui-wireframes.md` § 4.
- `Cartao` é modelado para o par rótulo+valor de um indicador (KPI) —
  não tem slot para título + mensagem + botão de ação.

A implementação usa a mesma superfície "vidro" de qualquer cartão/painel
do app (`SUPERFICIE_BASE`, o mesmo token que `Cartao` usa por baixo),
compondo diretamente `Botao` e a hierarquia de `TIPOGRAFIA` — reaproveita
os tokens e componentes atômicos do Design System, só não passa por um
dos dois componentes compostos citados no rascunho, porque nenhum dos
dois foi desenhado para este formato de conteúdo. Não é a criação de um
novo componente de `ui/`: `AbaBloqueada` continua sendo o único
componente novo desta Sprint (`§ 5` de `ui-arquitetura.md`), exatamente
como já previsto. Esta seção deixa de recomendar `Alerta`/`Cartao` como
opções — a superfície própria é a decisão vigente.

Textos exatos (título + mensagem, por variante) **ainda não validados
com o DIMCAC** — pendência já registrada em `ui-wireframes.md`
(Recomendações 1), carregada para a implementação: o componente recebe o
texto como dado interno mapeado por variante, não hardcoded inline no
JSX, exatamente para que a correção de copy (quando vier) seja uma
edição de uma constante, nunca uma mudança estrutural.

**✅ Decisão fechada na correção 18.4.4.1 — escopo de `role="status"`:**
a região viva (`role="status"`) envolve só o título + mensagem (o
conteúdo informativo), nunca o botão "Ir para Pesquisa" — mesmo padrão
já usado em `IndicadorSincronizacao` (`LinhaDeEstado`, § 8: o `role`
fica restrito ao texto simples, o botão é sempre um irmão fora da
região viva). A primeira versão da 18.4.4 envolvia título, mensagem e
botão no mesmo `role="status"`, divergindo dessa convenção já
estabelecida no módulo — corrigido nesta sub-etapa. Não houve mudança
no layout aprovado pelo wireframe (`ui-wireframes.md` § 4) nem mudança
funcional ou de comportamento (mesmo texto, mesmo botão, mesma ação):
a correção introduziu uma reorganização interna da estrutura HTML
(título+mensagem passam a viver num `<div>` próprio, para que o `role`
os envolva sem envolver o botão), e essa reorganização teve um efeito
colateral visual mínimo — o espaçamento entre título e mensagem, antes
16px (`gap-4`, herdado do container externo), passou a 8px (`gap-2`,
do novo `<div>` interno). Avaliado e aceito como não bloqueante: a
diferença é sutil, não descaracteriza o estado "hero" centralizado do
wireframe, e não há especificação de espaçamento pixel-exato aprovada
para este componente (o wireframe é ASCII, sem métrica de espaçamento).
`AbaBloqueada.tsx` não foi alterado desde a 18.4.4.1 para preservar
esse ajuste — só esta seção foi corrigida para descrevê-lo com
precisão.

---

## 10 — Máscara de CPF no frontend

Fecha, em termos de implementação, a decisão vinculante de
`ui-arquitetura.md` § 0.7 (mascarado por padrão, **sem mecanismo de
revelar nesta fase**, sem mudança de contrato):

```ts
// frontend/src/lib/mascararCpf.ts — conceitual, não é o código final
function mascararCpf(cpf: string): string {
  // formato acordado no wireframe (ui-wireframes.md § 3): últimos 2
  // dígitos visíveis, resto asterisco — "***.***.***-11"
}
```

- Função pura, sem estado, sem efeito colateral — mesma categoria de
  `lib/arquivos.ts`/`lib/progresso.ts` (utilitário testável isoladamente,
  sem precisar renderizar componente nenhum).
- **Único ponto de chamada nesta fase:** `PainelDetalhamentoDiaria`, ao
  renderizar `registro.cpf` (vindo de `DiariaCompletaResposta`, completo,
  como a API sempre devolveu). Nenhum outro componente importa
  `mascararCpf` porque nenhum outro componente recebe/exibe CPF —
  `TabelaDiarias` nunca vê esse campo (`DiariaResumoResposta` não o tem).
- **Sem toggle, sem estado de "revelado":** `PainelDetalhamentoDiaria`
  não guarda nenhum estado relacionado a mostrar/esconder o CPF — o
  valor mascarado é o único renderizado, sempre. Isso é mais simples que
  o rascunho da 18.2 (que cogitava um ícone "👁"), consequência direta do
  fechamento da decisão nesta rodada.
- **Formato exato ainda sujeito a validação com o DIMCAC** (mesma
  ressalva já registrada em `ui-wireframes.md`) — `mascararCpf` isola
  essa regra num único lugar, então ajustar o formato depois é editar
  uma função, nunca procurar por CPF espalhado em múltiplos componentes.
- **Exibição completa do CPF permanece fora de escopo** (dependente de
  regra de acesso/perfil e aprovação específica do DIMCAC,
  `ui-arquitetura.md` § 0.7) — nenhum código desta Sprint prepara,
  esconde ou deixa pronto um caminho para isso; se vier a existir, será
  uma decisão de arquitetura própria, não uma flag desativada hoje.

---

## 11 — Reuso do Design System existente

Nenhum componente novo em `components/ui/`. Confirmação componente a
componente:

| Necessidade | Componente/token existente |
| --- | --- |
| KPIs — não aplicável nesta Sprint (Dashboard bloqueado) | — |
| Chips de filtro, badges de status | `Badge` (`theme/cores.ts`, `VarianteStatus`) |
| Avisos de estado (erro/vazio/bloqueado) | `Alerta` — variantes `erro`/`info`, nunca `erro` para `AbaBloqueada` |
| Botões (Sincronizar, Ir para Pesquisa, paginação) | `Botao` (`variante`, `carregando`) |
| Campos de filtro/pesquisa | `Campo` |
| Card do Hub | `CardFuncionalidade` (estendido, § 1 — não substituído) |
| Superfície "vidro", scroll fino, altura de lista | `SUPERFICIE_BASE`, `SCROLL_FINO`, `ALTURA_LISTA_ROLAVEL` (`theme/estilos.ts`) |
| Tipografia | `TIPOGRAFIA` (`theme/tipografia.ts`) |
| Cabeçalho, "← Hub" | `Cabecalho` (sem alteração) |
| Cor "azul" do Hub | Extensão de `CardFuncionalidade.tsx` (§ 1) — reaproveita `--shadow-glow-blue`, já existente em `theme.css` (com a ressalva de já ter um consumidor, § 1) |
| Ícones novos (`SlidersHorizontal` filtros, `Printer`* impressão) | `lucide-react`, já é dependência — nenhuma biblioteca nova. *`Printer` só será necessário quando Relatórios existir; não usado nesta Sprint. |

Nenhuma dependência nova em `package.json` — nem biblioteca de
data-fetching (§ 7), nem de gráficos (fora de escopo, § 15), nem de
roteamento (§ 2 confirma: sem `react-router`).

---

## 12 — Estratégia de testes

Mesma convenção de todo o projeto: Vitest + Testing Library
(`@testing-library/react`/`user-event`), arquivos `*.test.ts(x)`
co-localizados com o arquivo testado, mocks via `vi.mock("../services/api", ...)`
+ `vi.mocked(nomeDaFuncao)` (exatamente como `Conferencia.test.tsx`/
`FormularioConfiguracao.test.tsx` já fazem).

| Alvo | O que testar |
| --- | --- |
| `lib/mascararCpf.ts` | Função pura — CPF válido de 11 dígitos, entradas malformadas (não deve lançar, deve ter comportamento definido). |
| `services/api.ts` (6 funções novas) | Corpo/URL da requisição corretos; `503` → `ErroAnaliticaIndisponivel`; `404` (só `detalharDiaria`) tratado à parte; `409` (só `dispararSincronizacaoManual`) tratado à parte; demais erros → `mensagemDoErro422`. |
| `hooks/useSincronizacao.ts` | Busca ao montar; `sincronizarAgora` chama `POST` e depois re-busca; `409` não vira `erro`. |
| `hooks/useDiarias.ts` | Muda filtro → nova busca com os parâmetros certos; paginação/ordenação refletidas na query. |
| `AbaBloqueada.tsx` | Renderiza o texto certo por `variante`; botão chama `aoIrParaPesquisa`; nunca renderiza com `Alerta variante="erro"`. |
| `TabelaDiarias.tsx` | Nunca renderiza uma coluna/valor de CPF, mesmo se o item de dado (por erro de programação futuro) tivesse o campo — teste de regressão deliberado para a regra de privacidade (§ 10/`ui-arquitetura.md` § 0.7). |
| `PainelDetalhamentoDiaria.tsx` | CPF sempre aparece mascarado; nenhum elemento de "revelar" existe no DOM (`queryByRole`/`queryByText` negativos). |
| `pages/CentralAnalitica.tsx` (integração) | Troca de aba renderiza o componente certo (mapa § 3); Dashboard/Relatórios nunca disparam `fetch`; barra de pesquisa global muda para a aba Pesquisa. |
| **Regressão** | Suíte completa do frontend (`npm test`) deve continuar 100% verde — nenhum teste de Processamento/Conferência/Configuração afetado. Mesmo critério já usado em toda auditoria de backend desta Sprint 17/18. |

Sem teste E2E novo nesta Sprint (fora do padrão já estabelecido pelo
projeto, que usa Playwright só para gerar screenshots/GIF de
documentação, não para testes funcionais).

---

## 13 — Ordem de implementação em etapas pequenas

Refinamento de `ui-arquitetura.md` § 10 (18.4/18.5), agora quebrado em
incrementos menores e verificáveis — cada um compila, testa e roda
isoladamente antes do próximo:

| Etapa | Entrega | Verificável por | Status |
| --- | --- | --- | --- |
| 18.4.1 | `types/analitica.ts` + as 6 funções em `services/api.ts` + testes | `npm test` cobrindo só essas funções, sem UI nenhuma | **Aprovada 2026-07-31** |
| 18.4.2 | `CardFuncionalidade`/`Hub`/`App.tsx` estendidos + `CentralAnalitica.tsx` mínima (só `SeletorDeAbas` + as 3 abas mostrando um placeholder de texto) | Abrir o app, clicar no card novo do Hub, ver as 3 abas trocando | **Aprovada 2026-07-31** |
| 18.4.3 | `IndicadorSincronizacao` + `useSincronizacao` (real, ligado a `GET`/`POST /sincronizacao`) | Abrir o módulo com o backend homologado rodando, ver o timestamp real, clicar "Sincronizar agora" | **Aprovada 2026-07-31** — auditoria consolidada 18.4.1–18.4.3 concluiu "aprovada com ressalvas" (ver correção abaixo) |
| 18.4.3.1 | Correções da auditoria consolidada 18.4.1–18.4.3: eliminação do travamento do indicador após 409, alinhamento visual do estado "Sincronizando", extração de `LinhaDeEstado` (dedup de JSX), `role="status"` nos textos simples do indicador, testes de resolução do 409 e de recuperação falha→sucesso | `npm test` (suíte completa) + revisão do bug do 409 eliminado | **Aprovada 2026-07-31** |
| 18.4.4 | `AbaBloqueada` real nas abas Dashboard/Relatórios (substitui o placeholder da 18.4.2) | Abrir Dashboard/Relatórios, ver o estado final, clicar "Ir para Pesquisa" | **Aprovada 2026-08-01** — auditoria concluiu "aprovada com ressalvas" (ver correção abaixo) |
| 18.4.4.1 | Correções da auditoria da 18.4.4: escopo de `role="status"` restrito ao título+mensagem (nunca o botão, § 9), decisões documentadas em vez de código revertido (superfície própria de `AbaBloqueada`, § 9; forma do mapa `aba → componente`, § 3), testes de acessibilidade (cabeçalho, escopo do `role`, ícone decorativo) | `npm test` (suíte completa) + revisão de que nenhuma ressalva ficou sem resposta | **Aprovada 2026-08-01** |
| 18.5.1 *(plano original)* | `useOpcoesFiltro` + `PainelFiltrosAvancados` + `ChipsFiltroAtivo` (sem tabela ainda) | Filtros renderizam opções reais vindas do backend | **Não executada nesta forma** — ver nota "Divergência de numeração" abaixo |
| 18.5.2 *(plano original)* | `useDiarias` + `TabelaDiarias` (paginação/ordenação/estados de § 7) | Pesquisa funcional fim a fim, sem detalhamento ainda | **Não executada nesta forma** — ver nota abaixo |
| 18.5.3 *(plano original)* | `useDetalhamentoDiaria` + `PainelDetalhamentoDiaria` (com `mascararCpf`) | Clicar numa linha, ver o painel, CPF mascarado, sem toggle | **Não executada nesta forma** — ver nota abaixo |
| 18.5.4 *(plano original)* | `BarraPesquisaGlobal` ligada de verdade (muda aba + popula `q` de `useDiarias`) | Buscar de qualquer aba, cair na Pesquisa já com resultado | **Não executada nesta forma** — ver nota abaixo |
| 18.5 *(execução real)* | Todos os quatro itens acima (`useOpcoesFiltro`, `useDiarias`, `useDetalhamentoDiaria`, `PainelFiltrosAvancados`, `ChipsFiltroAtivo`, `TabelaDiarias`, `PainelDetalhamentoDiaria`, `BarraPesquisaGlobal`, `mascararCpf`) implementados juntos, como um único bloco — aba Pesquisa funcional fim a fim, incluindo detalhamento, na mesma entrega | `npm test`/`npm run typecheck` (suíte completa) + verificação manual fim a fim | **Aprovada 2026-08-01** — auditoria concluiu "aprovada com ressalvas" (ver 18.5.1 abaixo) |
| 18.5.1 *(reaproveitado — correções de auditoria)* | Correções da auditoria da 18.5: distinção 404 de negócio vs. falha técnica, seleção de linha por teclado, botão "Limpar filtros", erro/retry de `GET /opcoes-filtro`, aplicação conjunta do período, proteção contra corrida em `useDiarias`, estados acessíveis da tabela, foco do painel de detalhamento (ver § 18) | `npm test` (suíte completa) + revisão de que as 8 correções foram aplicadas | **Aprovada 2026-08-02** — auditoria concluiu "aprovada com ressalvas" (1 bug remanescente no *focus trap*, ver 18.5.1.1) |
| 18.5.1.1 *(reaproveitado — correção pontual)* | Correção do *focus trap* do `PainelDetalhamentoDiaria`: `Shift+Tab` como primeira tecla após abrir (foco ainda no título) passa a ir para o último elemento focável, nunca escapa do `role="dialog"` (ver § 19) | Teste que reproduz o bug e falha contra o código anterior + suíte completa | **Homologada 2026-08-02** |
| 18.6 | Revisão de consolidação final de toda a interface da Central Analítica (18.1–18.5.1.1) — arquitetura, fidelidade aos 3 documentos de UI, acessibilidade, não regressão, busca por código morto/duplicação/divergência de documentação | Relatório de auditoria, mesmo formato já usado no backend | **Concluída 2026-08-02** — "aprovada com ressalvas": nenhum bug de código, só as divergências documentais registradas nesta mesma tabela e no § 6 (corrigidas na 18.6.1) |
| 18.6.1 | Consolidação documental final — correção das 4 divergências encontradas na 18.6 (esta tabela, § 6, §§ 18–20 novas, rodapé "Resultado desta Sprint"). Sem nenhuma alteração de código, teste ou contrato. | Revisão do próprio documento — nenhuma suíte a executar (não há código alterado) | Aguardando auditoria documental |

Cada etapa é um ponto de checagem — nenhuma pula para a seguinte sem a
anterior compilando e com seus testes verdes.

**Divergência de numeração (registrada na 18.6.1):** o plano original
desta seção previa a Sprint 18.5 quebrada em quatro sub-etapas
incrementais (18.5.1–18.5.4). Na prática, a pedido explícito de quem
conduziu a implementação, a Sprint 18.5 foi entregue como **um bloco
único** (linha "18.5 *(execução real)*" acima) — mais rápido de
implementar de uma vez, dado que os quatro hooks/componentes planejados
já haviam sido desenhados em conjunto no § 1/§ 5 e não tinham
dependência sequencial real entre si. As quatro linhas do plano original
são preservadas nesta tabela por completude histórica, não por terem
sido executadas. Os números **18.5.1** e **18.5.1.1**, já "livres" depois
dessa mudança, foram **reaproveitados** posteriormente para as
sub-etapas de correção de auditoria — um escopo diferente do que o plano
original atribuía a "18.5.1" (que seria só `useOpcoesFiltro` +
`PainelFiltrosAvancados` + `ChipsFiltroAtivo`). Nenhuma perda de rastro:
as duas linhas "18.5.1" desta tabela têm entregas e datas de aprovação
claramente distintas, marcadas como "(plano original)" e "(reaproveitado)"
respectivamente.

---

## 14 — Critérios de aceite

Ao final da 18.4–18.5 (antes da auditoria 18.6), a Sprint 18 está pronta
para revisão quando **todos** os itens abaixo forem verdadeiros:

1. O card "Central Analítica" aparece no Hub, cor azul, abre o módulo.
2. As 3 abas existem e trocam sem recarregar a página; Dashboard é a
   aba padrão ao abrir.
3. `IndicadorSincronizacao` mostra o estado real vindo de
   `GET /sincronizacao` ao entrar no módulo, nas 3 abas.
4. "Sincronizar agora" dispara `POST /sincronizacao` de verdade e
   atualiza o indicador; uma segunda chamada enquanto a primeira está em
   andamento nunca aparece como erro.
5. Dashboard e Relatórios mostram exclusivamente o estado
   "Ainda não disponível" — nenhum dado, número ou gráfico, mesmo
   placeholder; nenhuma chamada de rede é feita por essas duas abas.
6. A aba Pesquisa busca, filtra (todos os campos de
   `ParametrosPesquisaDiariasQuery`), pagina e ordena contra o backend
   real — nenhum dado mockado no cliente.
7. Nenhuma coluna, card ou resultado de listagem exibe CPF, em nenhuma
   circunstância.
8. O painel de Detalhamento mostra o CPF **sempre mascarado**, sem
   nenhum controle de revelar, em qualquer registro.
9. Todos os estados de § 7 (carregando/vazio/erro/sem-resultados) têm
   representação visual distinta e correta.
10. Nenhuma dependência nova foi adicionada a `package.json` além do que
    já existia.
11. `npm test` roda 100% verde, sem nenhuma regressão em
    Processamento/Conferência/Configuração.
12. `npm run build`/checagem de tipos (`tsc`) passa sem erro.

---

## 15 — Riscos e limites de escopo

| # | Item | Natureza |
| --- | --- | --- |
| 1 | Textos de `AbaBloqueada` (§ 9) e formato exato da máscara de CPF (§ 10) permanecem rascunho até validação com o DIMCAC. | Risco herdado (`ui-wireframes.md` Riscos) — não bloqueia o início da implementação, já que ambos os textos vivem em constantes isoladas, fáceis de trocar depois. |
| 2 | O mapa `aba → componente` (§ 3) só cumpre a promessa de "zero retrabalho de shell" se a implementação de fato o usar como está especificado aqui — mesmo risco já registrado na 18.1 (Riscos, item 2), agora com a etapa 18.6 (auditoria) responsável por verificar isso concretamente no código. | Risco de disciplina de implementação, não de arquitetura. |
| 3 | Exposição de CPF nas colunas de `PainelFiltrosAvancados` (campo de filtro, não de exibição) — o usuário pode digitar um CPF ali; isso não expõe CPF de terceiros (é o próprio critério de busca do usuário), mas vale confirmar no 18.4/18.5 que nenhum log de frontend grava esse valor. | Risco menor, novo nesta Sprint — sem mitigação de código necessária além de atenção na implementação. |
| 4 | Riscos de backend já conhecidos e aceitos (ausência de índice em `servidor_situacao`/`cidade_origem`) continuam sem mitigação nova — a paginação do frontend não piora nem resolve esse ponto. | Herdado, fora de escopo desta Sprint. |
| 5 | `SeletorDeAbas` não usa `role="tabpanel"`/`aria-controls` ligando cada aba ao seu conteúdo. | Registrado na auditoria da 18.4.4 e reafirmado na consolidação final (18.6) — gap de acessibilidade herdado desde a 18.4.2, nunca endereçado em nenhuma sub-etapa. |
| 6 | Falha em `GET /opcoes-filtro` só é visível com o painel "Filtros" expandido (o erro vive dentro de `{aberto && (...)}` em `PainelFiltrosAvancados`). | Decisão conscientemente aceita na correção 18.5.1.1 — os campos e a ação de recuperação pertencem a esse contexto; não é um alerta global nem duplicado. |

**✅ Registrado no encerramento (18.6.1):** os 6 riscos desta tabela foram
reavaliados na consolidação final (Sprint 18.6) e confirmados como
**não bloqueantes** para o encerramento da Central Analítica — nenhum
deles impede o funcionamento correto do módulo hoje entregue; todos
ficam registrados aqui como pendências conhecidas para uma eventual
Sprint futura, caso o DIMCAC decida reabri-los.

**Limites de escopo explícitos (reafirmados, não uma lista nova):**
nenhum código de Dashboard, gráfico, biblioteca de gráfico, geração de
relatório, exportação PDF/Excel ou impressão é criado nesta Sprint —
essas funcionalidades continuam sem arquitetura de API própria
(`ui-arquitetura.md` § 10, "fora do roadmap desta Sprint, sem número
atribuído"). Nenhum mecanismo de revelar CPF, controle de acesso/perfil
ou login é criado — permanece fora de escopo até decisão específica do
DIMCAC (§ 10, `ui-arquitetura.md` § 0.7).

---

## 16 — Auditoria consolidada (18.4.1–18.4.3) e correção (18.4.3.1)

Auditoria técnica das etapas 18.4.1, 18.4.2 e 18.4.3, no mesmo padrão já
usado para a Sprint 17 (fidelidade aos documentos, separação de
responsabilidades, Design System, acessibilidade, contratos HTTP,
regressões, cobertura de testes). **Veredito: aprovada com ressalvas.**

**Achado principal — bug real, alcance estreito:** após uma chamada a
`POST /sincronizacao` recusada com `409` (`SincronizacaoEmAndamentoError`,
RN-A), `useSincronizacao` fixava `ultimaExecucao: {tipo: "em_andamento"}`
e nunca limpava esse valor. `IndicadorSincronizacao` usava a mesma flag
para decidir se mostrava "Sincronizando..." com o botão desabilitado —
resultado: depois de um 409, o indicador ficava preso nesse estado para
sempre, com um botão desabilitado sem `onClick`, sem nenhuma forma de
disparar uma nova sincronização a partir da UI (só remontando o
componente, saindo e reentrando no módulo). Alcançável na prática só por
uma corrida de duplo clique (o `disabled` do botão só é aplicado no
re-render seguinte ao primeiro clique).

**Demais achados, todos de baixo risco:** duplicação de JSX entre os 6
estados "mensagem + botão" do indicador; o estado "Sincronizando" com
layout diferente dos demais (sem `justify-between`); textos simples do
indicador sem `role="status"` (sem anúncio automático para leitores de
tela); duas divergências de forma (não de comportamento) entre o código e
os esboços de tipo deste documento (§ 4/§ 8), não sinalizadas
explicitamente nas entregas das etapas correspondentes.

**Correções aplicadas na sub-etapa 18.4.3.1** (mesmo escopo dos itens 1–6
apontados pela auditoria, sem nenhuma funcionalidade nova, sem alteração
de contrato HTTP, sem dependência nova, sem tocar em `backend/`):

1. `useSincronizacao`: removida a variante `"em_andamento"` de
   `ResultadoUltimaExecucao` — um 409 não define mais `ultimaExecucao`,
   confiando só na flag transitória `sincronizando` para a exibição
   durante a própria chamada. O indicador nunca mais fica travado.
2. `IndicadorSincronizacao`: o estado "Sincronizando" passou a usar o
   mesmo layout (`justify-between`) dos demais 5 estados.
3. Extraído `LinhaDeEstado` (componente interno, não exportado) para as 6
   combinações "mensagem + botão", eliminando a duplicação de JSX.
4. Textos simples (`<p>`) do indicador passaram a ter `role="status"` —
   mudança de estado agora é anunciada a leitores de tela, mesmo
   comportamento que `Alerta` já tinha para seus próprios textos.
5. Adicionados testes cobrindo explicitamente: resolução do 409 (o botão
   volta a funcionar, uma nova tentativa é bem-sucedida) e a transição de
   recuperação falha→sucesso ao clicar "Tentar novamente".
6. Este documento atualizado com o status de conclusão das etapas
   18.4.1–18.4.3 e desta correção (tabela do § 13).

As duas divergências de forma (§ 4/§ 8) não foram revertidas — permanecem
como simplificações deliberadas e documentadas em código, sem impacto de
comportamento ou contrato; não fazem parte do escopo de correção pedido.

---

## 17 — Auditoria da 18.4.4 e correção (18.4.4.1)

Auditoria técnica da etapa 18.4.4 (`AbaBloqueada` real em Dashboard/
Relatórios), mesmo padrão já usado na Sprint 17 e na auditoria consolidada
18.4.1–18.4.3 (§ 16): fidelidade aos documentos, mapa `aba → componente`,
comportamento de `AbaBloqueada` (fetch/estado/semântica de erro/variantes/
retorno à Pesquisa/Design System), ausência de dado fictício, integridade
do shell/indicador/seletor, contratos HTTP/backend, regressão, cobertura
de testes. **Veredito: aprovada com ressalvas.** Nenhum bug funcional,
nenhuma regressão, nenhum contrato/backend/dependência alterados — as
ressalvas foram três divergências de forma:

1. `role="status"` de `AbaBloqueada` envolvia título, mensagem **e o
   botão** "Ir para Pesquisa" no mesmo elemento — divergindo do padrão já
   estabelecido em `IndicadorSincronizacao` (`LinhaDeEstado`, § 8), que
   restringe o `role` só ao texto informativo, mantendo qualquer botão
   como irmão fora da região viva.
2. A superfície de `AbaBloqueada` usa `SUPERFICIE_BASE` diretamente, não
   `Alerta`/`Cartao` como o rascunho original do § 9 sugeria.
3. O mapa `aba → componente` (§ 3) foi implementado como
   `Record<AbaAnalitica, ReactNode>` (elementos já construídos), não como
   `Record<AbaAtiva, ComponentType>` (funções resolvidas sob demanda)
   como o esboço conceitual do § 3 mostrava.

**Correções aplicadas na sub-etapa 18.4.4.1:**

1. `AbaBloqueada.tsx`: `role="status"` movido para um `<div>` interno que
   envolve só `<h3>`+`<p>` (título+mensagem); o botão "Ir para Pesquisa"
   passou a ser irmão desse `<div>`, fora da região viva — mesma
   convenção de `LinhaDeEstado`. Não houve mudança no layout aprovado
   pelo wireframe nem mudança funcional ou de comportamento (mesmo
   texto, mesmo clique, mesma ação) — houve uma reorganização interna da
   estrutura HTML (título+mensagem agrupados num `<div>` próprio), que
   teve como efeito colateral um ajuste visual mínimo no espaçamento
   entre título e mensagem (de 16px para 8px, detalhado no § 9). Ajuste
   avaliado e aceito como não bloqueante.
2. `ui-plano-tecnico.md` § 9 atualizado: registrada a decisão de manter a
   superfície própria de `AbaBloqueada` (em vez de forçar `Alerta`/
   `Cartao`), com a justificativa de que nenhum dos dois componentes foi
   desenhado para o formato "hero" do estado bloqueado (§ 4 de
   `ui-wireframes.md`) — código não alterado, só a documentação corrigida
   para refletir a decisão já tomada na implementação.
3. `ui-plano-tecnico.md` § 3 atualizado: registrada a decisão de manter
   `Record<AbaAnalitica, ReactNode>` como a forma real do mapa (em vez de
   reescrever `CentralAnalitica.tsx` para usar `ComponentType`), com a
   justificativa de que o React só monta o que é efetivamente devolvido
   pela árvore de render — as entradas não selecionadas do mapa nunca
   disparam efeito/`fetch`, com ou sem essa indireção — e de que a
   promessa de "trocar uma entrada sem tocar no shell" vale igualmente
   para as duas formas.
4. `AbaBloqueada.test.tsx`: adicionado o bloco `describe("acessibilidade")`
   com 3 testes novos — o título é exposto como cabeçalho de nível 3; o
   botão "Ir para Pesquisa" nunca é descendente do elemento com
   `role="status"`; o ícone `Hourglass` é puramente decorativo (não
   exposto como `role="img"`/`"graphics-symbol"` para leitores de tela).

Nenhuma das três correções altera texto visível, layout aprovado pelo
wireframe, funcionalidade, contrato HTTP, arquivo de `backend/` ou
dependência de `package.json`. A única correção com efeito visual
(item 1) é uma reorganização interna de estrutura HTML, não uma
mudança de layout — o ajuste mínimo de espaçamento resultante (§ 9) foi
avaliado e aceito como não bloqueante.

---

## 18 — Consolidação da Sprint 18.5 (aba Pesquisa)

**Registrado na 18.6.1**, a partir da implementação e da auditoria já
concluídas — nenhuma linha de código nova nasce desta seção, só o
registro formal do que a 18.5 entregou (linha "18.5 *(execução real)*",
§ 13):

1. **Implementação funcional da aba Pesquisa**, fim a fim, incluindo
   detalhamento — não só filtros/tabela isolados.
2. **Integração real com os 3 endpoints de leitura homologados** (Sprint
   17.4, sem nenhuma alteração de contrato): `GET /api/v1/analitica/diarias`
   (`useDiarias`/`pesquisarDiarias`), `GET /api/v1/analitica/diarias/{sei}`
   (`useDetalhamentoDiaria`/`detalharDiaria`), `GET
   /api/v1/analitica/opcoes-filtro` (`useOpcoesFiltro`/`obterOpcoesFiltro`).
3. **`BarraPesquisaGlobal`** — campo único no shell, muda a aba ativa para
   "pesquisa" e popula `q` de `useDiarias` ao submeter (§ 5/§ 6).
4. **`PainelFiltrosAvancados`** — os 9 campos nomeados de
   `ParametrosPesquisaDiariasQuery` (SEI, CPF, nome do servidor, matrícula,
   município, motivo, situação, período inicial/final), colapsado por
   padrão, com município/motivo/situação como `<select>` alimentados por
   `GET /opcoes-filtro` (texto corrigido no § 6 desta mesma correção).
5. **`ChipsFiltroAtivo`** — um `Badge` removível por filtro ativo.
6. **Botão "Limpar filtros"** — implementado junto aos chips, satisfazendo
   a exigência do Anexo B da UX (`ux-wireframes.md`) que ficou sem
   componente próprio até esta Sprint.
7. **Paginação e ordenação sempre no servidor** — `TabelaDiarias` nunca
   pagina/ordena no cliente; as 5 colunas ordenáveis (`sei`, `periodo`,
   `servidor`, `destino`, `valor`) espelham `COLUNAS_ORDENACAO` do
   backend.
8. **`TabelaDiarias`** — as 5 colunas de `DiariaResumoResposta`, nunca uma
   coluna de CPF (o próprio contrato já não inclui esse campo nessa
   rota).
9. **`PainelDetalhamentoDiaria`** — painel lateral com `DiariaCompletaResposta`
   completo; fechar não afeta o estado de `useDiarias` (filtros/página/
   rolagem preservados).
10. **CPF sempre mascarado, sem opção de revelar** (`mascararCpf`, § 10) —
    único ponto da UI que exibe o campo, decisão vinculante de
    `ui-arquitetura.md` § 0.7, sem nenhuma mudança de contrato.
11. **Estados de carregamento, vazio, sem resultados e erro** —
    implementados em `TabelaDiarias`, distinguindo "vazio" (J7, nenhum
    filtro aplicado) de "sem resultados" (busca feita, nada encontrado),
    conforme § 7.

Auditoria da 18.5: **aprovada com ressalvas** — achados corrigidos
integralmente na sub-etapa 18.5.1 (§ 19).

---

## 19 — Correções da auditoria da Sprint 18.5 (sub-etapa 18.5.1)

Oito correções aplicadas, todas sem alterar contrato HTTP, backend,
dependência ou funcionalidade além do estritamente necessário para cada
achado:

1. **Distinção entre 404 de negócio e falha técnica** — `useDetalhamentoDiaria`
   passou a expor `naoEncontrada: boolean`, separado de `erro`;
   `DiariaNaoEncontradaError` (já existente desde a 18.4.1, nenhum
   contrato novo) vira `naoEncontrada: true`, renderizado com
   `Alerta variante="info"` em `PainelDetalhamentoDiaria` — nunca
   `"erro"`, respeitando a regra de que vermelho nunca representa
   veredito de negócio (RN-08).
2. **Seleção de linha por teclado** — `<tr>` de `TabelaDiarias` ganhou
   `tabIndex={0}`, `aria-label` descritivo e `onKeyDown` para
   Enter/Espaço, preservando o `role="row"` nativo e o comportamento por
   clique já existente.
3. **Erro e nova tentativa de `GET /opcoes-filtro`** — `useOpcoesFiltro`
   passou a expor `tentarNovamente`; `PainelFiltrosAvancados` mostra o
   erro com botão "Tentar novamente" quando o painel está expandido,
   sem nunca desabilitar os 4 campos de texto livre (que não dependem de
   `opcoes`).
4. **Aplicação conjunta do período** — `periodo_inicial`/`periodo_final`
   passaram a ser aplicados sempre juntos (`aplicarPeriodoSeValido`),
   nunca um de cada vez; corrige o cenário em que corrigir um dos dois
   campos, depois de o outro ter sido rejeitado por invalidade, deixava
   o filtro realmente aplicado divergente do que a tela mostrava.
5. **Proteção contra respostas fora de ordem em `useDiarias`** — a busca
   voltou a viver dentro do próprio `useEffect`, com uma flag `cancelado`
   fechada sobre o efeito (mesmo padrão de `useOpcoesFiltro`/
   `useDetalhamentoDiaria`) — uma resposta de uma pesquisa antiga nunca
   mais sobrescreve o resultado de uma mais recente, mesmo chegando
   depois.
6. **Estados acessíveis da tabela** — `role="status"` no texto `sr-only`
   do esqueleto de carregamento e no bloco compartilhado vazio/sem-
   resultados; o estado de erro manteve só o `role="alert"` já existente
   via `Alerta`, sem duplicar anúncio.
7. **Botão "Limpar filtros"** — ver § 18, item 6 (registrado aqui também
   por ter nascido como resposta a um achado de auditoria, não do plano
   original).
8. **Foco inicial, devolução de foco e *focus trap*** do
   `PainelDetalhamentoDiaria` — foco move para o título ao abrir; ao
   fechar, volta ao elemento que abriu o painel (a própria linha da
   tabela, focável desde o item 2 acima); *focus trap* simples (sem
   dependência nova) mantém `Tab`/`Shift+Tab` dentro do `role="dialog"`.

Auditoria da 18.5.1: **aprovada com ressalvas** — um bug remanescente no
*focus trap* (item 8), corrigido na sub-etapa 18.5.1.1 (§ 20).

---

## 20 — Correção da Sprint 18.5.1.1 (focus trap)

O *focus trap* do item 8 (§ 19) tinha uma lacuna: como o foco inicial ao
abrir o painel fica no título (`tabIndex={-1}`, deliberadamente fora da
lista de elementos focáveis do trap), pressionar `Shift+Tab` como a
**primeiríssima tecla** — antes de qualquer `Tab` — não era interceptado,
e o foco escapava do `role="dialog"` para a página por trás.

**Correção:** `aoTeclarNoPainel` passou a tratar "o foco atual não é
nenhum dos elementos focáveis do trap" (ou seja, está no título) como
equivalente a "está na borda" na direção pressionada — `Shift+Tab` vai
para o último elemento focável do painel, `Tab` vai para o primeiro.
O ciclo já correto entre `primeiro`/`ultimo`, quando o foco já está em um
deles, não foi alterado.

**Teste:** adicionado um teste que renderiza o painel a partir de um
elemento externo focável, confirma que o título recebe o foco ao abrir,
pressiona `Shift+Tab` como primeira tecla e confirma que o foco
permanece dentro do `role="dialog"` (indo para o último elemento
focável). **Verificado de forma independente, duas vezes** (na correção
e de novo na auditoria da 18.5.1.1) que esse teste falha contra o código
anterior à correção — não é um teste que só confirma o comportamento
novo sem provar que capturaria a regressão.

**Resultado:** Sprint 18.5.1.1 **homologada em 2026-08-02**, sem nenhuma
regressão — nenhum outro arquivo além de `PainelDetalhamentoDiaria.tsx`/
`.test.tsx` foi tocado.

---

## Resultado desta Sprint

Plano técnico completo (15 pontos), sem nenhuma linha de código escrita,
sem Dashboard/gráfico/relatório, sem contrato de API inventado — só o que
já está homologado em `app/schemas/analitica.py`/`app/api/analitica.py`.
Aguardando aprovação explícita antes de iniciar a implementação (18.4.1).

**Atualização (2026-07-31):** etapas 18.4.1, 18.4.2 e 18.4.3 implementadas
e aprovadas; auditoria consolidada resultou em "aprovada com ressalvas",
corrigidas integralmente na sub-etapa 18.4.3.1 (§ 16).

**Atualização (2026-08-01):** etapa 18.4.4 (`AbaBloqueada`) implementada e
aprovada; auditoria resultou em "aprovada com ressalvas", corrigidas
integralmente na sub-etapa 18.4.4.1 (§ 17). Aguardando nova auditoria
antes de iniciar a 18.5.

**Atualização (2026-08-02):** Sprint 18.5 (aba Pesquisa, § 18), 18.5.1
(correções de auditoria, § 19) e 18.5.1.1 (correção do *focus trap*,
§ 20) **implementadas, auditadas e homologadas**. A Sprint 18.6
(revisão de consolidação final de toda a interface, 18.1–18.5.1.1) não
encontrou nenhum bug de código nem regressão — só **divergências
documentais** neste próprio arquivo (a tabela do § 13, o texto do § 6
sobre município/*debounce*, a ausência de seções registrando a 18.5/
18.5.1/18.5.1.1, e este rodapé desatualizado), corrigidas agora na
sub-etapa 18.6.1.

**Estado técnico consolidado (18.6.1):**
- Frontend: **257 testes passando** (`npm test`), `npm run typecheck`
  sem erros.
- Backend: **444 testes passando** (`pytest`), nenhum contrato, arquivo
  ou dependência alterado por nenhuma das sub-etapas 18.5–18.5.1.1.
- **Zero regressões** em Hub, Processamento, Central de Conferência,
  Configuração Inicial, navegação, shell da Central Analítica,
  `IndicadorSincronizacao` e `AbaBloqueada`.
- Riscos remanescentes (§ 15, itens 1–6) revisados e confirmados **não
  bloqueantes** para o encerramento.

A Central Analítica está **tecnicamente concluída** dentro do escopo
desta Sprint 18 (shell, navegação, sincronização, abas bloqueadas e aba
Pesquisa completa — Dashboard/Relatórios/KPIs/gráficos/exportações
permanecem deliberadamente fora de escopo, sem arquitetura própria).
Aguardando apenas a auditoria documental desta 18.6.1 para o
encerramento oficial do módulo.
