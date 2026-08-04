# Central Analítica — Arquitetura da Interface (Sprint 18.1)

> **Documento histórico — substituído pela redefinição funcional v2**
> (Sprint 19.1, [`v2-arquitetura-funcional.md`](v2-arquitetura-funcional.md)
> § 0): o modelo de navegação por 3 abas fixas descrito aqui foi
> substituído por um fluxo único (filtrar → revisar recorte → agir) antes
> de Dashboard/Relatórios chegarem a ser implementados sobre ele. Mantido
> como registro do processo de design — não descreve o comportamento
> atual do app.

> **Sprint 18.1 — exclusivamente arquitetura da interface (frontend).
> Nenhuma linha de código, nenhum wireframe visual, nenhuma biblioteca de
> gráficos escolhida.** O backend da Central Analítica está oficialmente
> homologado (Sprints 17.4.1–17.4.7.2) e **não é alterado nem reaberto
> aqui** — esta Sprint só projeta como o frontend consome o que já existe.
> A UX aprovada na Sprint 17.2 (`docs/central-analitica/ux-wireframes.md`)
> também não é reaberta: suas decisões (jornadas, fluxos, hierarquia
> visual, componentes reutilizados) são tratadas como restrição de
> projeto. Implementação só começa após aprovação explícita desta
> arquitetura, seguindo a mesma disciplina de todas as Sprints anteriores.

> **Decisão oficial desta Sprint (confirmada explicitamente pelo usuário,
> 2026-07-31):** a UX aprovada (17.2) desenhou 3 abas — Dashboard,
> Pesquisa, Relatórios —, mas só **Pesquisa** e **Sincronização** têm
> contrato de API homologado hoje (Sprint 17.4). Dashboard e Relatórios
> dependem de endpoints que nunca foram implementados (KPIs agregados,
> geração de relatório — reservados para sprints futuras, sem número
> atribuído ainda). Esta arquitetura projeta o **shell completo** do
> módulo com as 3 abas, mas Dashboard/Relatórios entram como abas
> **visíveis e bloqueadas** ("Ainda não disponível"), sem dado fictício,
> sem gráfico simulado e sem inventar contrato de API. Só Pesquisa e
> Sincronização têm integração real nesta fase. Ver § 0 e § 10.

> **Decisão adicional (confirmada explicitamente pelo usuário, 2026-07-31,
> após aprovação da 18.1) — regra vinculante de privacidade de CPF na
> UI:** CPF nunca aparece em listagens, tabelas resumidas, resultados de
> pesquisa ou cards; só no detalhamento individual da diária, e ali
> mascarado por padrão. O contrato do backend **não muda** — a máscara é
> responsabilidade exclusiva da camada de apresentação do frontend. Ver
> § 0.7, § 5 e § 9.

## Sumário

- [§ 0 — Decisões herdadas e desta Sprint](#-0--decisões-herdadas-e-desta-sprint)
- [§ 1 — Objetivos da interface](#-1--objetivos-da-interface)
- [§ 2 — Perfis de usuário](#-2--perfis-de-usuário)
- [§ 3 — Fluxos completos de navegação](#-3--fluxos-completos-de-navegação)
- [§ 4 — Arquitetura das telas](#-4--arquitetura-das-telas)
- [§ 5 — Arquitetura dos componentes](#-5--arquitetura-dos-componentes)
- [§ 6 — Organização da informação](#-6--organização-da-informação)
- [§ 7 — Estratégia de responsividade](#-7--estratégia-de-responsividade)
- [§ 8 — Estados da interface](#-8--estados-da-interface)
- [§ 9 — Integração frontend ↔ endpoints homologados](#-9--integração-frontend--endpoints-homologados)
- [§ 10 — Roadmap da implementação da UI](#-10--roadmap-da-implementação-da-ui)
- [Riscos](#riscos)
- [Recomendações](#recomendações)
- [Resultado desta Sprint](#resultado-desta-sprint)

---

## § 0 — Decisões herdadas e desta Sprint

**Herdadas, não reabertas:**

1. Estrutura de 3 abas (Dashboard/Pesquisa/Relatórios), barra de pesquisa
   global fixa, painel de detalhamento lateral, indicador de sincronização
   com 5 estados, filtro de período global, filtros da aba Pesquisa
   colapsados por padrão — tudo já aprovado em `ux-wireframes.md`
   (Sprint 17.2).
2. Dashboard é a aba padrão de entrada do módulo (Fase 4 da UX) — decisão
   mantida **na navegação**, mesmo com o conteúdo da aba bloqueado nesta
   fase (§ 3/§ 8 tratam a consequência disso).
3. Regra de cor: vermelho nunca representa veredito de negócio, só falha
   técnica (herdada da Central de Conferência, reafirmada no indicador de
   sincronização da UX 17.2).
4. Nenhuma tela desta arquitetura persiste estado entre execuções do app
   (mesma simplicidade já praticada em todo o projeto).
5. Sem `react-router` — navegação por `useState` local em `App.tsx`, mesmo
   padrão já usado para Processamento/Conferência (Sprint 13/14).

**Decisão nova desta Sprint (18.1):**

6. **Shell completo, abas bloqueadas.** As 3 abas existem na navegação
   desde a primeira entrega de UI. Dashboard e Relatórios renderizam um
   estado único "Ainda não disponível" — sem chamada de API, sem dado
   fictício, sem placeholder de gráfico. Pesquisa e o indicador de
   sincronização são as únicas superfícies com integração real de dados
   nesta fase. A arquitetura (§ 4/§ 5) isola esse bloqueio num único
   componente reutilizável, para que habilitar cada aba no futuro seja
   trocar um componente dentro de um slot já existente, nunca refazer o
   shell, a navegação ou o indicador de sincronização.

**Decisão adicional, confirmada em 2026-07-31 (fecha a pendência de CPF
registrada nos Riscos/Recomendações da versão original desta arquitetura,
antes do início da 18.2):**

7. **Regra vinculante de privacidade de CPF na UI.**
   - CPF **nunca** aparece em listagens, tabelas resumidas, resultados de
     pesquisa ou cards — em particular, `TabelaDiarias` (§ 5) não exibe
     CPF em nenhuma coluna. Isso já é consistente com o próprio contrato
     homologado: `DiariaResumoResposta` (resposta de `GET /diarias`) não
     tem campo `cpf` — a UI não precisa suprimir nada que a API já não
     envia nessa rota.
   - CPF só pode aparecer no **detalhamento individual** da diária
     (`PainelDetalhamentoDiaria`, alimentado por `DiariaCompletaResposta`,
     que tem o campo `cpf`).
   - No detalhamento, o CPF é exibido **mascarado por padrão, sem exceção
     nesta fase.**
   - **✅ Fechado (2026-07-31, após aprovação da 18.2):** **não existe
     nenhum mecanismo de revelar o valor completo** — nem botão, nem
     ícone, nem qualquer interação. O rascunho de ícone "👁" cogitado nos
     wireframes da 18.2 (`ui-wireframes.md` § 3) foi **descartado**, não
     implementado e não previsto para nenhuma sub-etapa futura desta
     Sprint. Enquanto a Sprint 18 estiver em vigor, o CPF no
     Detalhamento é sempre, e só, o valor mascarado.
   - **Exibição completa do CPF é matéria fora de escopo desta Sprint,**
     registrada aqui só para não ser esquecida: dependeria de uma **regra
     de acesso/perfil** (hoje inexistente no app — não há login nem
     controle de perfil em nenhuma tela) e de **aprovação específica do
     DIMCAC**, ambas fora do alcance de uma decisão de arquitetura de UI.
     Não há sub-etapa, prazo ou compromisso de roadmap associado a isso.
   - **Nenhuma mudança de contrato do backend.** `DiariaCompletaResposta.
     cpf` continua sendo devolvido por completo pela API — a máscara é
     aplicada só na renderização do frontend (regra de apresentação, não
     de dado). `app/schemas/analitica.py` e `app/api/analitica.py`
     permanecem exatamente como homologados na Sprint 17.4.
   - Formato exato da máscara (quantos dígitos permanecem visíveis) fica
     para a 18.3 — esta decisão fixa a regra (mascarado por padrão,
     sempre, nunca no contrato), não a redação/pixel exatos, mesmo padrão
     já usado no projeto para outros textos/formatos.

---

## § 1 — Objetivos da interface

1. Dar acesso real, via UI, a tudo que o backend já homologado oferece:
   pesquisa/filtro/paginação/ordenação de diárias, detalhamento por SEI, e
   visibilidade + controle da sincronização — sem lacunas em relação ao
   que a API de fato faz.
2. Nunca apresentar uma funcionalidade como disponível quando não é —
   Dashboard/Relatórios bloqueados de forma honesta é preferível a uma
   tela com dado simulado ou um KPI zerado indistinguível de "sem
   diárias".
3. Zero retrabalho estrutural quando Dashboard/Relatórios ganharem
   backend: a decisão 6 (§ 0) existe para que a Sprint que implementar
   KPIs/relatórios estenda o shell, não o reconstrua.
4. Reaproveitar 100% do Design System e dos padrões de código já
   estabelecidos (`Cartao`, `Badge`, `Alerta`, `Botao`, `Campo`,
   `DialogoConfirmacao`, convenção de `services/api.ts`, hooks dedicados) —
   nenhum padrão novo de arquitetura de frontend só para este módulo.
5. Preservar as 4 prioridades do usuário já validadas na UX (Fase 1/Fase 6
   de `ux-wireframes.md`): resposta rápida a pergunta pontual, nunca
   duvidar do frescor do dado, nunca exportar/errar um recorte, não
   aprender ferramenta nova.

---

## § 2 — Perfis de usuário

Reaproveitados integralmente de `ux-wireframes.md` (Fase 1) — não
redefinidos aqui:

| Perfil | Uso típico | Impacto do bloqueio de Dashboard/Relatórios (§ 0.6) |
| --- | --- | --- |
| **Servidor operacional** | Consultas pontuais e rápidas (SEI/CPF/servidor), no meio de outra tarefa. | Nenhum — sua tarefa mais frequente (pesquisa) está 100% disponível desde a primeira entrega. |
| **Gestor/coordenador** | Sessões mais longas: panorama do período, montagem de relatório, comparação entre municípios/servidores. | Perde, por enquanto, as jornadas J3 (visão geral) e J5 (relatório periódico) da UX. O estado bloqueado precisa deixar claro que a pesquisa/filtro (J4) já resolve parte da mesma necessidade — "quero saber quantas diárias teve Araripina em junho" continua respondível via Pesquisa + filtro de município/período, só sem o gráfico/KPI pronto. |

Nenhuma alteração dos dois perfis; o que muda é só a cobertura de
jornadas nesta primeira fase de implementação (detalhado em § 3).

---

## § 3 — Fluxos completos de navegação

Fluxo herdado da UX (`ux-wireframes.md` Fase 3), anotado com o que tem
integração real (✅) e o que é estado bloqueado terminal (⛔ — sem
sub-navegação, sem decisão possível além de voltar):

```
Hub
 └─▶ Central Analítica (abre sempre em Dashboard, decisão herdada)
      │
      ├─▶ [barra de pesquisa global, disponível em qualquer aba]      ✅
      │     └─▶ Aba Pesquisa (com resultado já carregado)             ✅
      │           └─▶ Resultado (lista)                                ✅
      │                 └─▶ Detalhamento (painel lateral)               ✅
      │
      ├─▶ Aba Pesquisa                                                 ✅
      │     ├─▶ Pesquisa rápida → Resultado → Detalhamento             ✅
      │     └─▶ Pesquisa avançada (filtros) → Resultado → Detalhamento ✅
      │
      ├─▶ Aba Dashboard                                                ⛔
      │     └─▶ "Ainda não disponível" (estado único, terminal —
      │           nenhuma ação além de trocar de aba)
      │
      └─▶ Aba Relatórios                                               ⛔
            └─▶ "Ainda não disponível" (idem)

 [em qualquer ponto] ── "← Hub" ──▶ Hub                                 ✅
 [ao entrar no módulo] ── verificação automática de frescor ──▶
      indicador de sincronização atualizado (§ 9)                      ✅
 [em qualquer ponto] ── aviso de dados desatualizados ──▶
      "Sincronizar agora" (permanece na mesma tela)                    ✅
```

Diferença deliberada em relação à UX original: o **ranking → Pesquisa
filtrada** (atalho descrito na Fase 3 da UX) pertence à aba Dashboard —
como o Dashboard está bloqueado nesta fase, esse atalho não existe ainda;
não é uma remoção de decisão de UX, é uma consequência de a UX ter sido
desenhada para o módulo completo, e esta Sprint entregar um subconjunto
dele. Reaparece automaticamente quando o Dashboard for habilitado, sem
mudança de arquitetura de navegação.

**Jornadas da UX (J1–J7) cobertas nesta fase:** J1 (pesquisa rápida), J2
(histórico de servidor via pesquisa por CPF/nome), J4 (filtrar; a
exportação de J4 não está incluída — ver § 10), J6 (dados desatualizados),
J7 (primeira utilização). **Não cobertas nesta fase:** J3 (Dashboard), J5
(relatório periódico) — dependem de § 0.6.

---

## § 4 — Arquitetura das telas

Sem wireframe visual — só a árvore estrutural de responsabilidade (o
"esqueleto" que os wireframes da próxima sub-etapa vão preencher).

```
App.tsx
 └─ Pagina: "boasvindas" | "hub" | "processamento" | "conferencia" | "analitica"
                                                                        ▲ nova entrada,
                                                                          mesmo padrão das demais

pages/CentralAnalitica.tsx                         (página nova, recebe `backendOnline`
 │                                                   como as demais páginas de App.tsx)
 │
 ├─ IndicadorSincronizacao                          (§5 — faixa fixa, abaixo do Cabeçalho)
 ├─ BarraPesquisaGlobal                             (§5 — fixa, acima das abas)
 ├─ SeletorDeAbas ("Dashboard" | "Pesquisa" | "Relatórios")
 │    estado local: aba ativa (`useState`, default "dashboard" — herdado)
 │
 └─ conteúdo da aba ativa (slot único, um componente por aba):
      ├─ aba "dashboard"   → AbaBloqueada (variante "dashboard")        ⛔ §0.6
      ├─ aba "pesquisa"    → AbaPesquisa                                 ✅
      │     ├─ PainelFiltrosAvancados (colapsado por padrão)
      │     ├─ ChipsFiltroAtivo
      │     ├─ TabelaDiarias
      │     │     └─ PainelDetalhamentoDiaria (lateral, condicional)
      │     └─ estados de carregamento/erro/vazio (§8)
      └─ aba "relatorios"  → AbaBloqueada (variante "relatorios")       ⛔ §0.6
```

**Ponto de extensão (§ 0.6 em código de arquitetura, não de implementação):**
o slot de conteúdo da aba é resolvido por um mapa `aba → componente`, nunca
por `if`/`else` espalhado pela página. Trocar `AbaBloqueada` por um
`AbaDashboard`/`AbaRelatorios` real, quando existirem, é substituir uma
entrada desse mapa — `CentralAnalitica.tsx`, `IndicadorSincronizacao`,
`BarraPesquisaGlobal` e `SeletorDeAbas` não mudam.

**Reaproveitamento confirmado (não há componente de tabela genérico
reaproveitável):** `TabelaResultado.tsx`/`ResumoResultado.tsx`
(existentes) são específicos do domínio de Processamento (status de
inserção de PDF) — `TabelaDiarias` é um componente novo, mas reaproveita
os mesmos tokens visuais (`SUPERFICIE_BASE`, `SCROLL_FINO`,
`ALTURA_LISTA_ROLAVEL`) e o componente `Badge`, mesmo padrão de código já
praticado.

---

## § 5 — Arquitetura dos componentes

| Componente | Novo/reaproveitado | Responsabilidade |
| --- | --- | --- |
| `pages/CentralAnalitica.tsx` | Novo (página) | Compõe o shell; dono do estado de aba ativa; único ponto que sabe que existem 3 abas. |
| `IndicadorSincronizacao` | Novo | Os 5 estados do Anexo G da UX; consome `useSincronizacao` (abaixo); único responsável por disparar `POST /sincronizacao` e exibir seu resultado. |
| `BarraPesquisaGlobal` | Novo | Campo único (`Campo`, reaproveitado); ao submeter, muda a aba ativa para "pesquisa" e popula o filtro `q`. |
| `SeletorDeAbas` | Novo | Puramente apresentacional — 3 abas, nenhuma lógica de dado. |
| `AbaBloqueada` | Novo | Único componente para os dois estados "Ainda não disponível" (Dashboard/Relatórios) — recebe só um texto/variante como prop; nenhuma lógica de fetch, nunca vai ter (é o ponto de extensão do § 0.6: quando a aba for habilitada, este componente é *substituído*, não estendido). |
| `PainelFiltrosAvancados` | Novo | Campos nomeados (SEI, CPF, servidor, matrícula, município, motivo, situação, período) — usa `Campo`; opções de município/motivo/situação vêm de `useOpcoesFiltro`. |
| `ChipsFiltroAtivo` | Novo | Lista de `Badge` removíveis, um por filtro ativo (herdado do Anexo B da UX). |
| `TabelaDiarias` | Novo | Lista paginada de `DiariaResumoResposta`; ordenação por clique de cabeçalho; linha clicável abre `PainelDetalhamentoDiaria`. **Nunca exibe CPF** (§ 0.7) — coerente com o próprio contrato, que já não inclui `cpf` em `DiariaResumoResposta`. |
| `PainelDetalhamentoDiaria` | Novo | Painel lateral; consome `DiariaCompletaResposta` via `useDetalhamentoDiaria(sei)`. Único ponto da UI que pode exibir CPF — sempre **mascarado por padrão** (§ 0.7); a máscara é lógica de apresentação deste componente, não do hook nem da API. |
| `hooks/useSincronizacao` | Novo | Busca `GET /sincronizacao` ao montar (decisão 1 da arquitetura de backend — verificação automática de frescor ao entrar no módulo); expõe função para `POST /sincronizacao`; mesmo padrão de `useBackendStatus`/`useConfiguracao` (hooks já existentes, poll/estado local, sem biblioteca de data-fetching nova). |
| `hooks/useDiarias` | Novo | Dono do estado de filtros/paginação/ordenação da aba Pesquisa; chama `GET /diarias` a cada mudança. |
| `hooks/useOpcoesFiltro` | Novo | Busca `GET /opcoes-filtro` uma vez ao montar a aba Pesquisa (não muda com os filtros aplicados — são as opções *possíveis*, não as atuais). |
| `hooks/useDetalhamentoDiaria` | Novo | Busca `GET /diarias/{sei}` sob demanda, ao abrir o painel. |
| `services/api.ts` (extensão) | Estendido, não recriado | Novas funções: `pesquisarDiarias`, `detalharDiaria`, `obterOpcoesFiltro`, `consultarEstadoSincronizacao`, `dispararSincronizacaoManual`, `consultarAvisosSincronizacao` — mesma convenção das funções já existentes (`conferir`, `gerarHistorico`): função pura, `fetch` + tratamento de erro HTTP, sem estado. |
| `types/analitica.ts` | Novo | Tipos TypeScript espelhando 1:1 os schemas Pydantic de `app/schemas/analitica.py` (§ 9) — nenhum campo inventado, nenhum campo omitido. |

Nenhum componente novo de `components/ui/` (design system) é necessário —
mesma conclusão já registrada no Anexo J da UX 17.2, reconfirmada aqui: só
a extensão de cor `"azul"` do Hub (já prevista, ainda pendente de
implementar).

---

## § 6 — Organização da informação

Reaproveita integralmente a Fase 4 de `ux-wireframes.md` (o que aparece
sem clique, ordem de prioridade visual por aba, o que fica secundário) —
**com uma adição desta Sprint:** nas abas bloqueadas, a única informação
apresentada é a mensagem "Ainda não disponível" e, quando fizer sentido
textualmente, uma frase indicando que a funcionalidade equivalente hoje é
alcançável via Pesquisa (para o perfil Gestor não achar um beco sem
saída — ver § 2). Nenhum número, contagem ou gráfico placeholder aparece
nessas duas abas — a organização da informação ali é deliberadamente
mínima, de propósito (§ 0.6).

---

## § 7 — Estratégia de responsividade

Reaproveita integralmente o Anexo I de `ux-wireframes.md` (grids que
ganham colunas com a largura — notebook ~1024–1366px / Full HD ~1920px /
ultrawide 2560px+, sem layout alternativo por faixa) para tudo que é
implementado nesta fase: `IndicadorSincronizacao`, `BarraPesquisaGlobal`,
`PainelFiltrosAvancados`, `TabelaDiarias` (rolagem horizontal dentro do
próprio contêiner quando necessário), `PainelDetalhamentoDiaria` (mesma
ressalva já registrada — pode ocupar fração maior da largura em telas
estreitas).

`AbaBloqueada` não tem estratégia de responsividade própria: é uma
mensagem central, sem grid, sem tabela — comportamento idêntico em
qualquer largura de tela.

---

## § 8 — Estados da interface

Reaproveita a matriz do Anexo H de `ux-wireframes.md` para a aba Pesquisa
(carregando/vazio/erro/sem-resultados/sincronizando/desatualizado) — sem
alteração. Para Dashboard/Relatórios, a matriz **colapsa para um único
estado**, consequência direta do § 0.6:

| Aba | Carregando | Vazio | Erro | Sem resultados | Sincronizando | Desatualizado | **Bloqueada** |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **Pesquisa** | Esqueleto de tabela (herdado) | "Ainda não há dados para pesquisar." (J7) | `Alerta` erro | "Nada encontrado para '...'" | Faixa do indicador ativa, conteúdo permanece | Faixa de aviso, conteúdo permanece | *(não se aplica)* |
| **Dashboard** | *(não se aplica — nunca busca dado)* | *(não se aplica)* | *(não se aplica)* | *(não se aplica)* | *(não se aplica)* | *(não se aplica)* | Único estado real: "Ainda não disponível" |
| **Relatórios** | *(idem)* | *(idem)* | *(idem)* | *(idem)* | *(idem)* | *(idem)* | Único estado real: "Ainda não disponível" |

Importante: o estado "Bloqueada" **não é um estado de erro** — nunca usa
`Alerta variante="erro"` nem a cor vermelha (regra herdada, § 0.3). É uma
variante neutra/informativa própria, para não ser confundida com falha
técnica nem com "sem resultados" (que implica que uma busca aconteceu).

O indicador de sincronização (`IndicadorSincronizacao`) mantém seus 5
estados (Anexo G da UX) **independente da aba ativa** — inclusive nas
abas bloqueadas, porque a verificação de frescor (decisão 1 da
arquitetura de backend) é do módulo como um todo, não de uma aba
específica.

---

## § 9 — Integração frontend ↔ endpoints homologados

Mapeamento 1:1 — nenhum endpoint usado além dos já homologados, nenhum
campo de resposta inventado. Contratos conforme `app/schemas/analitica.py`
(Sprint 17.4).

| Componente/hook | Endpoint | Request | Response |
| --- | --- | --- | --- |
| `useSincronizacao` (ao montar) | `GET /api/v1/analitica/sincronizacao` | — | `EstadoSincronizacaoResposta` (`sincronizado_em`, `origem`, `possivelmente_desatualizado`, `total_avisos`, `status`) |
| `IndicadorSincronizacao` (botão "Sincronizar agora") | `POST /api/v1/analitica/sincronizacao` | — | `ExecucaoSincronizacaoResposta` (`status: "sucesso"\|"falha"`, contagens) — `409` tratado como "já em andamento" (sem `Alerta` de erro, é esperado); `422` (`PlanilhaOficialIndisponivel`) tratado como aviso específico, não erro genérico |
| (diagnóstico, a partir do indicador) | `GET /api/v1/analitica/sincronizacao/avisos` | `pagina`, `tamanho_pagina` | `PaginaAvisosResposta` |
| `useOpcoesFiltro` (ao montar a aba Pesquisa) | `GET /api/v1/analitica/opcoes-filtro` | — | `OpcoesFiltroResposta` (`motivos`, `situacoes`, `municipios`) |
| `useDiarias` (a cada mudança de filtro/página/ordenação) | `GET /api/v1/analitica/diarias` | `ParametrosPesquisaDiariasQuery` (todos os campos de filtro + `pagina`/`tamanho_pagina`/`ordenar_por`/`ordem`) | `ResultadoPesquisaResposta` (`itens: DiariaResumoResposta[]`, `paginacao`, `sincronizacao`) |
| `useDetalhamentoDiaria(sei)` (ao abrir o painel) | `GET /api/v1/analitica/diarias/{sei:path}` | `sei` no path (literal, nunca normalizado — RN-12 herdada) | `DiariaCompletaResposta` — `404` tratado como "SEI não encontrado" (`Alerta`, não exceção não tratada). Campo `cpf` chega completo do backend; `PainelDetalhamentoDiaria` o mascara antes de renderizar (§ 0.7) — o hook devolve o dado tal como veio, a máscara não é responsabilidade dele |

**Tratamento de erro, mesma convenção já usada em `Conferencia.tsx`**
(`mensagemAmigavel`): `503` (`BaseAnaliticaIndisponivel`) vira mensagem
amigável de indisponibilidade técnica; `422` de validação de query
(página/tamanho fora do intervalo, campo de ordenação inválido, período
final antes do inicial) é responsabilidade do formulário nunca permitir
enviar um valor inválido antes de chegar à API — a validação do schema
(`ParametrosPesquisaDiariasQuery`) é a rede de segurança final, não a
primeira linha de defesa.

**Dashboard/Relatórios — nenhuma integração.** Nenhum `fetch`, nenhum
hook, nenhum tipo TypeScript para essas duas abas nesta fase. O único
"contrato" que `AbaBloqueada` conhece é a string de mensagem — não há
nada a manter sincronizado com o backend porque não há chamada nenhuma.

---

## § 10 — Roadmap da implementação da UI

Mesma disciplina de entregas pequenas e validáveis já praticada em toda a
Sprint 17. Numeração sob o guarda-chuva desta Sprint 18 (frontend),
distinta da numeração 17.4.x (backend, já encerrada) — consolida o que
`docs/central-analitica/README.md § 12` havia reservado como "17.4 (UI)"
sob a nova frente de trabalho.

| Sub-etapa | Entrega | Depende de | Observação |
| --- | --- | --- | --- |
| **18.1** | Esta arquitetura da interface (documento atual) | Backend homologado (17.4.1–17.4.7.2) | **Aprovada 2026-07-31** — com a decisão adicional de privacidade de CPF (§ 0.7), fechada antes do início da 18.2 |
| **18.2** | Wireframes visuais do shell + aba Pesquisa + estado bloqueado de Dashboard/Relatórios + Detalhamento com CPF mascarado | 18.1 aprovada | **Aprovada 2026-07-31** (`docs/central-analitica/ui-wireframes.md`), com o fechamento definitivo da máscara de CPF sem mecanismo de revelar (§ 0.7). A UX de 17.2 já wireframou Dashboard/Relatórios com dado real (Fase 5.5/5.6) — esses wireframes ficam **suspensos** (não descartados) até essa aba ganhar backend |
| **18.3** | Plano técnico do frontend (árvore de componentes definitiva, contratos de props, estrutura de `types/analitica.ts`, decisões de estado/hook — equivalente ao `api-plano-tecnico.md` do backend) | 18.2 aprovada | Ainda sem código |
| **18.4** | Implementação do shell (página, navegação, `SeletorDeAbas`, `IndicadorSincronizacao`, `AbaBloqueada` nas duas abas) | 18.3 aprovado | Primeira entrega de código React desta Sprint; validável isoladamente — módulo abre a partir do Hub, indicador funciona, abas trocam |
| **18.5** | Implementação da aba Pesquisa completa (filtros, tabela, paginação, ordenação, detalhamento) | 18.4 | Entrega validável isolada — cobre as jornadas J1/J2/J4 (parcial, sem exportação) |
| **18.6** | Testes de contrato/regressão + auditoria técnica da Sprint 18 inteira (mesmo padrão da 17.4.7) | 18.4–18.5 | Encerramento formal da Sprint 18 |

**Fora do roadmap desta Sprint, sem número atribuído:** implementação de
Dashboard (KPIs/gráficos) e Relatórios (exportação/impressão) — cada uma
exige primeiro sua própria arquitetura de API (equivalente à 17.4.1),
plano técnico e implementação de backend, só depois arquitetura/wireframe
de UI própria. Quando isso acontecer, a única mudança estrutural
necessária no que a Sprint 18 entrega é a troca do componente no slot
descrito em § 4 — não uma reabertura do shell.

---

## Riscos

| # | Risco | Mitigação proposta |
| --- | --- | --- |
| 1 | O estado "Ainda não disponível" pode ser lido como "o app está quebrado" por um usuário que não sabe que é uma entrega faseada. | Copy explícita (a validar com o DIMCAC na 18.2, mesma recomendação já feita para o indicador de sincronização na UX 17.2) + garantir visualmente que nunca usa a variante de erro (§ 8) — é informativo, não uma falha. |
| 2 | O ponto de extensão do § 4 (mapa `aba → componente`) só é uma garantia de projeto enquanto a implementação (18.4) realmente seguir esse desenho — se a disciplina não for respeitada na hora de codificar, o "sem retrabalho do shell" vira promessa não cumprida. | O plano técnico (18.3) deve especificar esse mapa explicitamente como parte do contrato da página, não como detalhe de implementação incidental — sujeito a verificação na auditoria (18.6). |
| 3 | Risco de backend já conhecido (ausência de índice em `servidor_situacao`/`cidade_origem` na escala atual) se manifesta na UI como paginação previsível hoje, mas não necessariamente performática se o volume crescer. | Nenhuma mitigação nova nesta arquitetura — herdado, não resolvido aqui (aceito desde a Sprint 17.4.1). |
| 4 | ~~Exposição de CPF em listagens paginadas/tabela.~~ | **✅ Resolvido (2026-07-31, § 0.7):** CPF nunca aparece em `TabelaDiarias`/listagens; só no detalhamento, mascarado por padrão. Regra vinculante de UI, sem mudança de contrato do backend. |

---

## Recomendações

1. Validar o texto exato do estado "Ainda não disponível" (Dashboard e
   Relatórios) com o DIMCAC na Sprint 18.2 — mesma recomendação já feita
   para o indicador de sincronização na UX 17.2, agora estendida a este
   novo estado.
2. Ao aprovar esta arquitetura, tratar o mapa `aba → componente` (§ 4)
   como requisito não negociável do plano técnico (18.3), não como
   sugestão — é a peça que sustenta a promessa central desta Sprint (zero
   retrabalho de shell quando Dashboard/Relatórios ganharem backend).
3. Definir, ainda na 18.3, o formato exato da máscara de CPF em
   `PainelDetalhamentoDiaria` (quantos dígitos permanecem visíveis) — a
   regra em si (mascarado por padrão, sempre, sem mecanismo de revelar,
   nunca em listagem) já está fechada (§ 0.7); falta só a
   redação/formato exato, mesmo padrão já usado no projeto para outros
   textos/formatos.

---

## Resultado desta Sprint

1. **Objetivos da interface** — § 1.
2. **Perfis de usuário** — § 2.
3. **Fluxos completos de navegação** — § 3.
4. **Arquitetura das telas** — § 4.
5. **Arquitetura dos componentes** — § 5.
6. **Organização da informação** — § 6.
7. **Estratégia de responsividade** — § 7.
8. **Estados da interface** — § 8.
9. **Integração com os endpoints já homologados** — § 9.
10. **Roadmap da implementação da UI** — § 10.

Nenhum código foi escrito. Nenhum wireframe visual foi desenhado. Nenhuma
biblioteca de gráficos foi escolhida. Aguardando aprovação explícita antes
da Sprint 18.2 (wireframes).
