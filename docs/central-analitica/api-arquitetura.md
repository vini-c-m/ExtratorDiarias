# Central Analítica — Arquitetura da API de Pesquisa e Filtros (Sprint 17.4)

> **Sprint 17.4 — exclusivamente arquitetura da API. Nenhuma linha de
> código de produção foi escrita nesta Sprint.** Sem FastAPI, sem React,
> sem Electron, sem endpoints implementados, sem DTOs, sem schemas
> Pydantic, sem SQL. A Base Local em SQLite da Sprint 17.3 (homologada) é
> tratada como **infraestrutura consolidada e imutável** — esta proposta
> não altera esquema, não adiciona tabela, não adiciona coluna. Onde uma
> lacuna do esquema atual é relevante para a API (ex.: um índice ausente),
> ela é apenas **registrada como risco/recomendação**, nunca resolvida
> aqui. Metodologia igual às sub-etapas anteriores: Arquitetura →
> Aprovação → Plano Técnico → Implementação → Auditoria → Homologação.
> Implementação só começa após aprovação explícita deste documento.

> **✅ Arquitetura aprovada em 2026-07-30.** Cinco decisões ficaram
> formalmente fechadas na aprovação, encerrando os itens correspondentes
> de Riscos/Recomendações abaixo (mantidos no documento, marcados como
> resolvidos, nunca apagados — mesmo padrão de rastreabilidade já usado
> nas Sprints anteriores):
> 1. Filtro por município considera cidade de origem **ou** destino (Fase 5).
> 2. Filtro por período usa semântica de **interseção**, não contenção (Fase 5).
> 3. Pesquisas usam `GET` com parâmetros de consulta (Fase 3).
> 4. A estratégia de indexação atual **permanece inalterada nesta Sprint**
>    — reavaliação fica marcada para depois da implementação da Pesquisa
>    (17.4.3), não como uma sprint futura indefinida.
> 5. Sincronizações concorrentes **não são suportadas** nesta fase — uma
>    segunda chamada a `POST /sincronizacao` enquanto outra já está em
>    andamento deve ser **recusada** (`409`), não enfileirada nem ignorada.
>
> A Sprint 17.4.1 está concluída; a próxima etapa é a **Sprint 17.4.2 —
> Plano Técnico da Implementação**.

## Sumário

- [§ 0 — Decisões e princípios herdados](#0--decisões-e-princípios-herdados)
- [§ 1 — Objetivos da API](#1--objetivos-da-api)
- [Fase 1 — Casos de uso](#fase-1--casos-de-uso)
- [Fase 2 — Recursos](#fase-2--recursos)
- [Fase 3 — Endpoints propostos](#fase-3--endpoints-propostos)
- [Fase 4 — Contratos](#fase-4--contratos)
- [Fase 5 — Estratégia de filtros](#fase-5--estratégia-de-filtros)
- [Fase 6 — Estratégia de pesquisa](#fase-6--estratégia-de-pesquisa)
- [Fase 7 — Paginação e ordenação](#fase-7--paginação-e-ordenação)
- [Fase 8 — Estratégia de detalhamento](#fase-8--estratégia-de-detalhamento)
- [Estratégia de erros](#estratégia-de-erros)
- [Fase 9 — Critérios de performance](#fase-9--critérios-de-performance)
- [Fase 10 — Evolução](#fase-10--evolução)
- [Estratégia de testes](#estratégia-de-testes)
- [Riscos](#riscos)
- [Recomendações](#recomendações)
- [Plano de subetapas da Sprint 17.4](#plano-de-subetapas-da-sprint-174)
- [Resultado desta Sprint](#resultado-desta-sprint)

---

## § 0 — Decisões e princípios herdados

| # | Decisão herdada | Origem | Como se aplica aqui |
| --- | --- | --- | --- |
| 1 | A API é somente-leitura sobre a Base Local; a única escrita no sistema continua sendo o fluxo de Processamento na Planilha Oficial (RN-11). | `docs/central-conferencia/README.md` | Todo endpoint proposto é `GET`, exceto o disparo de sincronização manual (decisão 2 da 17.1), que **não escreve na Planilha Oficial nem decide nada de negócio** — só reconstrói a Base Local. |
| 2 | A Base Local em SQLite (Sprint 17.3, homologada) é o único ponto de leitura da Central Analítica — nunca a Planilha Oficial diretamente, nunca o `.xlsx` de Conferência. | `docs/central-analitica/README.md § 0.1` decisões 4/5/7/8; auditoria da 17.3 | Toda consulta desta API abre uma conexão SQLite curta contra `base_local.sqlite`; nenhum endpoint abre `openpyxl`. |
| 3 | Único ponto de compartilhamento entre Central Analítica e Central de Conferência é `app/consulta/` (decisão 9). | `docs/central-analitica/README.md § 0.1` | A camada de serviço desta API (a ser desenhada no plano técnico) não importa `app/domain/rules/conferencia.py`, `conferencia_service.py` nem `schemas/conferencia.py` — e vice-versa. Reaproveita **padrões** já estabelecidos por Conferência (convenção de erro, estilo de resposta), nunca as **classes**. |
| 4 | Dado desatualizado nunca é apresentado silenciosamente; timestamp de sincronização obrigatório em toda tela (decisão 6). | `docs/central-analitica/README.md § 0.1` | Todo contrato de listagem/detalhamento desta API carrega consigo o estado de sincronização — nunca obriga uma segunda chamada só para saber se o dado está fresco (Fase 4). |
| 5 | Chave de negócio de uma diária é o `sei` normalizado, nunca `linha_planilha` (decisão 8). | `docs/central-analitica/README.md § 0.1` | O detalhamento (Fase 8) é sempre por SEI. `linha_planilha` aparece no contrato só como referência administrativa, rotulada como tal, nunca como identificador. |
| 6 | Reaproveitar componentes existentes, evitar duplicação de regra de negócio. | Pedido original da Sprint 17 | O botão "Sincronizar agora" (Fase 3) reaproveita `base_local.sincronizar()` e `configuracao_app.resolver_caminho_para_preenchimento()`, já existentes — a API não reimplementa sincronização. |
| 7 | Pesquisa rápida (SEI/CPF/nome), pesquisa avançada, filtros combináveis, tabela paginada, detalhamento em painel lateral, indicador de sincronização em toda tela, "Limpar filtros" — já aprovado. | `docs/central-analitica/ux-wireframes.md`, Anexos A/B/D/G | Esta API é desenhada para entregar exatamente essa experiência, nada além. |
| 8 | Esquema SQLite da Sprint 17.3 (uma tabela `diarias` denormalizada + `sincronizacoes` + `avisos_sincronizacao`, sem tabela `servidores`, sem `tipo_processo`). | `docs/central-analitica/README.md § 6.2` (nota: o esquema real diverge do esboço original do documento — ver auditoria da 17.3) e `app/infra/db/esquema.py` | Todo contrato desta API é compatível com essas colunas exatas — nenhum campo inventado que não exista no esquema real. |

---

## § 1 — Objetivos da API

1. Permitir que a interface (ainda não construída, Sprint 17.5+) satisfaça integralmente a UX já aprovada na Sprint 17.2, sem exigir nenhuma lógica de negócio no frontend.
2. Esconder completamente o SQLite — nenhuma tabela, coluna ou particularidade de armazenamento vaza para o contrato HTTP.
3. Ser estável o bastante para que Dashboards (17.5), Relatórios (17.6) e exportações (17.6) sejam **aditivos** — novos recursos/campos, nunca mudança incompatível nos já existentes.
4. Nunca calcular ou decidir nada que já não esteja na Base Local — a API traduz e organiza, não infere regra de negócio nova (mesmo espírito de RN-08: "a Central nunca decide sozinha").

---

## Fase 1 — Casos de uso

Todos rastreados a um requisito já aprovado (Sprint 17.1 § 2, Sprint 17.2 Fase 2/Anexos):

1. **Pesquisar por SEI** — o usuário digita um número de processo e espera encontrar exatamente aquele registro (ou nenhum).
2. **Pesquisar por CPF** — o usuário quer ver todas as diárias de um servidor específico.
3. **Pesquisar por nome de servidor** — o usuário não tem o CPF em mãos, só o nome (ou parte dele).
4. **Pesquisa global de um único campo** — o usuário digita um termo na barra fixa do topo (UX 17.2) sem escolher previamente se é SEI, CPF ou nome; o sistema decide.
5. **Filtrar por período** — o usuário quer ver diárias de um intervalo de tempo.
6. **Filtrar por município** — o usuário quer ver diárias envolvendo uma cidade específica.
7. **Filtrar por motivo** — o usuário quer ver diárias de um tipo de ocorrência específico.
8. **Filtrar por situação do servidor** — o usuário quer restringir a servidores numa determinada situação funcional.
9. **Combinar múltiplos filtros** — as jornadas acima raramente acontecem isoladas (ex.: "diárias para Araripina em julho").
10. **Listar resultados de forma navegável** — nunca todos de uma vez; sempre com contagem total visível e páginas percorríveis.
11. **Ordenar a listagem** — por padrão, mais recente primeiro; o usuário pode escolher outra ordem.
12. **Abrir o detalhamento completo de um registro** — a partir de qualquer linha da lista, sem perder o contexto da pesquisa (painel lateral, UX 17.2).
13. **Saber se os dados estão atualizados** — toda tela precisa do timestamp da última sincronização e de um sinal se algo pode ter mudado (decisão 1/6 da 17.1).
14. **Forçar uma sincronização manual** — quando o usuário desconfia que a Planilha Oficial mudou fora do app (decisão 2 da 17.1).
15. **Consultar a qualidade dos dados da última sincronização** — quantas linhas foram ignoradas/degradadas, para o painel de avisos já previsto na UX (Anexo G).
16. **Descobrir quais valores existem para popular um filtro** — o usuário não deveria poder digitar um "motivo" que não existe; a interface precisa de uma lista de valores reais para montar um seletor.

*Fora desta lista, deliberadamente: indicadores agregados (KPIs), rankings, séries temporais e geração de relatório — são casos de uso da Sprint 17.5/17.6 (Dashboard/Relatórios), não desta Sprint. Esta arquitetura é desenhada para não precisar de redesenho quando eles chegarem (Fase 10), mas não os implementa agora.*

---

## Fase 2 — Recursos

Modelados pelo que o usuário pensa que está manipulando, não pelas tabelas físicas.

| Recurso | Responsabilidade | Não é responsabilidade dele |
| --- | --- | --- |
| **Diária** | Representa um registro de diária já processado — a unidade central de pesquisa/detalhamento. Sempre identificada por `sei`. Inclui, aninhado, os dados do servidor associado (mesmo o esquema físico sendo denormalizado — a API não precisa expor essa denormalização). | Não representa uma linha crua do SQLite; `linha_planilha` aparece só como metadado de auditoria, nunca como identidade. |
| **Resultado de Pesquisa** | Uma coleção paginada e filtrada de Diárias — resultado *derivado* de uma consulta, nunca persistido. Carrega consigo a paginação e o estado de sincronização no momento da consulta. | Não é "a lista de todas as diárias" — sempre existe em função de algum critério (mesmo que vazio = sem filtro). |
| **Opções de Filtro** | Os valores reais e atualmente existentes para os filtros de seleção (motivo, situação, município) — evita que a interface hardcode uma lista ou deixe o usuário digitar um valor inexistente. | Não filtra nada sozinho — só informa o que existe para filtrar. |
| **Estado de Sincronização** | O retrato do momento: quando a Base Local foi sincronizada pela última vez, se pode estar desatualizada, quantos avisos a última sincronização gerou. | Não decide se deve sincronizar — só informa; a decisão de acionar é sempre do usuário (decisão 2, botão manual) ou do gancho automático já existente (decisão 1, fora do escopo de qualquer endpoint aqui). |
| **Execução de Sincronização** | O ato de disparar uma nova sincronização manual e o resumo do que aconteceu (sucesso, contagens, avisos). | Não é um recurso consultável no tempo (não expõe histórico de todas as sincronizações já feitas) — só a execução corrente e o estado mais recente. |
| **Aviso de Sincronização** | Uma linha da Planilha Oficial que não pôde ser plenamente indexada na última sincronização, com o motivo — para o painel de qualidade de dados. | Não é um erro do usuário nem do sistema — é transparência sobre dado histórico degradado (já uma decisão herdada, § 0). |

---

## Fase 3 — Endpoints propostos

Prefixo comum: `/api/v1/analitica` (mesmo padrão de prefixo já usado por `conferencia`/`planilha`/`processamento`). Todos somente-leitura, exceto o marcado como ação.

### `GET /api/v1/analitica/diarias`
- **Finalidade:** atender os casos de uso 1–11 (pesquisa, filtros, listagem, ordenação) num único ponto de entrada.
- **Responsabilidade:** traduzir parâmetros de consulta em um Resultado de Pesquisa.
- **Parâmetros:** `q` (pesquisa global), `sei`, `cpf`, `servidor_nome`, `servidor_matricula`, `municipio`, `motivo`, `situacao`, `periodo_inicial`, `periodo_final`, `pagina`, `tamanho_pagina`, `ordenar_por`, `ordem` — todos opcionais, combináveis (Fase 5).
- **Resposta:** Resultado de Pesquisa (Fase 4).
- **Erros possíveis:** `422` (parâmetro fora do formato esperado, ex. período final antes do inicial, campo de ordenação fora da lista permitida); `503` (Base Local indisponível/corrompida). Nunca `404` — pesquisa sem resultado é uma lista vazia, não um erro.

### `GET /api/v1/analitica/diarias/{sei}`
- **Finalidade:** caso de uso 12 (detalhamento completo).
- **Responsabilidade:** devolver todos os campos conhecidos de uma diária específica.
- **Parâmetros:** `sei` (path, texto literal, nunca normalizado — mesmo cuidado de RN-12 já estabelecido em Conferência).
- **Resposta:** Diária completa (Fase 4/8).
- **Erros possíveis:** `404` (SEI não encontrado na Base Local); `503`.

### `GET /api/v1/analitica/opcoes-filtro`
- **Finalidade:** caso de uso 16.
- **Responsabilidade:** listar os valores distintos hoje presentes na Base Local para motivo, situação e município.
- **Parâmetros:** nenhum.
- **Resposta:** Opções de Filtro (Fase 4).
- **Erros possíveis:** `503`.

### `GET /api/v1/analitica/sincronizacao`
- **Finalidade:** caso de uso 13.
- **Responsabilidade:** informar o estado atual de frescor da Base Local.
- **Parâmetros:** nenhum.
- **Resposta:** Estado de Sincronização (Fase 4). "Nunca sincronizado" (primeira utilização, jornada J7 da UX 17.2) é um **estado válido, não um erro** — devolvido como `200`.
- **Erros possíveis:** `503` só se o arquivo `base_local.sqlite` existir mas estiver corrompido/ilegível (falha técnica real, distinta de "nunca existiu").

### `POST /api/v1/analitica/sincronizacao`
- **Finalidade:** caso de uso 14 (ação, decisão 2 da 17.1 — botão manual, complementar).
- **Responsabilidade:** reaproveitar `base_local.sincronizar()` (Sprint 17.3) a partir do caminho atual da Planilha Oficial, resolvido por `configuracao_app.resolver_caminho_para_preenchimento()` (Sprint 15) — nenhuma lógica nova de sincronização, só o disparo.
- **Parâmetros:** nenhum no corpo.
- **Resposta:** Execução de Sincronização (Fase 4).
- **Erros possíveis:** `422`/`503` (Planilha Oficial não configurada/inacessível — mesmo padrão de `PlanilhaOficialIndisponivel` já existente); `409` (uma sincronização já em andamento — ver Riscos).

### `GET /api/v1/analitica/sincronizacao/avisos`
- **Finalidade:** caso de uso 15.
- **Responsabilidade:** listar os Avisos de Sincronização da execução mais recente, paginados (podem ser numerosos).
- **Parâmetros:** `pagina`, `tamanho_pagina`.
- **Resposta:** lista paginada de Aviso de Sincronização.
- **Erros possíveis:** `503`.

**Por que `GET`+parâmetros de consulta para `/diarias`, e não `POST` com corpo (como `/api/v1/conferencia` já faz)?** Decisão deliberada, não inconsistência: `/api/v1/conferencia` computa um diagnóstico de negócio a partir de exatamente 3 campos obrigatórios — é uma operação, não uma coleção. `/diarias` é uma busca/listagem com muitos parâmetros **opcionais** e paginação — o caso clássico onde `GET` com query string é o idioma correto (reproduzível, cada busca é uma URL). Os dois padrões coexistem no mesmo app pelo mesmo motivo que já levou a escolhas diferentes em outras rotas: a forma segue o caso de uso, não uma regra estética única.

---

## Fase 4 — Contratos

Somente forma conceitual (nomes/tipos/hierarquia) — nenhum código, nenhum Pydantic.

**Diária (resumo, usado na listagem):**
`sei` (texto) · `periodo` (`{inicial, final}`, datas) · `destino` (texto ou nulo) · `servidor` (`{nome, matricula}` ou nulo) · `motivo` (texto) · `valor_total_diarias` (número ou nulo).

**Diária (completa, usada no detalhamento):**
tudo do resumo, mais: `doc_origem` (texto) · `cpf` (texto) · `trecho` (`{origem, destino}`, ambos texto ou nulos) · `transporte` (texto ou nulo) · `servidor` completo (`{nome, cargo, previdencia, matricula, situacao}` ou nulo — objeto inteiro nulo quando o CPF não tem cadastro, nunca um objeto com todos os campos vazios) · `referencia_administrativa` (`{linha_planilha}`, rotulado explicitamente como dado de auditoria, não identidade) · `sincronizacao` (mesmo objeto do Estado de Sincronização, embutido — decisão 6, nunca uma tela sem saber o frescor do que está vendo).

**Resultado de Pesquisa:**
`itens` (lista de Diária-resumo) · `paginacao` (`{pagina_atual, tamanho_pagina, total_itens, total_paginas}`) · `sincronizacao` (mesmo objeto embutido).

**Opções de Filtro:**
`motivos` (lista de texto) · `situacoes` (lista de texto) · `municipios` (lista de texto, união de origem+destino distintos).

**Estado de Sincronização:**
`sincronizado_em` (data/hora ou nulo — nulo só no estado "nunca sincronizado") · `origem` (texto, ex. "pos_preenchimento"/"manual") · `possivelmente_desatualizado` (booleano) · `total_avisos` (número) · `status` (um de: `nunca_sincronizado` · `atualizado` · `possivelmente_desatualizado` · `falha_na_ultima_sincronizacao`) — um único campo discriminador, para a interface nunca precisar combinar múltiplos booleanos para saber qual dos 5 estados da UX (Anexo G) mostrar (o 5º, "sincronizando", é um estado transitório do lado do cliente, durante a chamada `POST`, não um valor de resposta do `GET`).

**Execução de Sincronização:**
`sincronizado_em` · `linhas_diarias` · `linhas_servidores_lidos` · `linhas_ignoradas` · `status` · `total_avisos`.

**Aviso de Sincronização:**
`aba` (texto) · `linha` (número, referência de auditoria — mesma natureza de `linha_planilha`) · `motivo` (texto).

**Critérios de consistência aplicados a todos os contratos:**
- Todo campo nulo é **explicitamente nulo**, nunca omitido silenciosamente (a interface não deveria precisar tratar "campo ausente" e "campo nulo" como coisas diferentes).
- Toda resposta de listagem embute o estado de sincronização — nunca uma chamada extra obrigatória.
- Nenhum nome de campo espelha uma coluna SQL 1:1 quando o nome de negócio é outro (`cidade_destino` → `destino`/`trecho.destino`, `servidor_situacao` → `servidor.situacao`).
- Evolução só aditiva (Fase 10) — nenhum campo é removido/renomeado sem quebrar versão.

---

## Fase 5 — Estratégia de filtros

- **Combinação:** todos os filtros informados são combinados com **E lógico** (Seção 2.2 da arquitetura 17.1 já define isso). Pesquisa global (`q`) e filtros estruturados podem ser usados **ao mesmo tempo** — `q` não é um modo exclusivo, é mais um critério que entra no mesmo E lógico.
- **Filtro vazio:** parâmetro ausente = sem restrição naquele campo. Nunca um valor mágico ("todos") — a ausência já significa isso.
- **Limpeza:** "Limpar filtros" (UX 17.2) é, do ponto de vista da API, simplesmente uma chamada sem nenhum parâmetro de filtro — não existe um endpoint de "resetar", o estado dos filtros vive só na interface.
- **Município:** compara contra **origem OU destino** (um único parâmetro `municipio`, correspondência parcial/case-insensitive) — decisão desta arquitetura, não estava detalhada na UX 17.2 (ver Riscos, item a confirmar).
- **Motivo / situação:** correspondência **exata**, restrita aos valores devolvidos por `GET /opcoes-filtro` — são campos de seleção (select), não texto livre, então não faz sentido aceitar substring aqui.
- **Servidor:** dois parâmetros distintos e explícitos — `servidor_nome` (parcial) e `servidor_matricula` (exata) — em vez de um único campo ambíguo que tenta adivinhar a intenção do usuário (mesmo princípio de "nunca decidir sozinho" já estabelecido na Sprint 17.3 para SEI/CPF).
- **Período:** dois parâmetros (`periodo_inicial`, `periodo_final`), semântica de **interseção** — uma diária entra no resultado se seu intervalo tem qualquer sobreposição com o intervalo filtrado, não só se está inteiramente contida nele (decisão desta arquitetura — ver Riscos, item a confirmar).
- **Comportamento em tempo real:** a UX 17.2 já decidiu que mudar um filtro atualiza a lista imediatamente (sem botão "Aplicar") — isso é responsabilidade da interface chamar `GET /diarias` de novo a cada mudança; a API não precisa de nenhum mecanismo especial para isso, só responder rápido o bastante (Fase 9).

---

## Fase 6 — Estratégia de pesquisa

- **`q` (pesquisa global/rápida):** o backend decide o tipo pelo formato, exatamente como já aprovado na UX 17.2 (Anexo A):
  1. Se o termo normaliza para exatamente 11 dígitos → tratado como **CPF**, correspondência exata.
  2. Senão, se casa com o formato de um número de processo SEI (mesmo padrão já reconhecido em outros pontos do sistema) → tratado como **SEI**, correspondência exata.
  3. Caso contrário → correspondência **parcial**, case-insensitive, contra o nome do servidor.
- **Pesquisa por SEI (exata):** se resultar em exatamente um registro, é o mesmo dado que `GET /diarias/{sei}` devolveria — a interface decide se pula direto para o detalhamento (decisão de UX, não desta API).
- **Pesquisa por CPF (exata):** pode devolver **vários** resultados (um CPF pode ter várias diárias, herdado de RN-02) — sempre uma lista, nunca um objeto único.
- **Pesquisa por servidor (parcial):** pode devolver diárias de **mais de um** servidor com nome parecido — não há desambiguação automática, a lista mostra todas.
- **Ausência de resultados:** nunca um erro. `200` com `itens: []` e `paginacao.total_itens: 0` — a interface já tem um estado dedicado para isso (UX 17.2, Anexo H).

---

## Fase 7 — Paginação e ordenação

**Paginação:**
- Estratégia por página numerada (`pagina`, `tamanho_pagina`), não por cursor — combina com a navegação numérica já aprovada na UX (`‹ 1 2 3 … 50 ›`, Anexo D), que pressupõe saber o total de páginas.
- Tamanho de página: valor padrão pequeno (dezenas, não centenas), com um teto máximo — protege contra uma interface pedindo uma página gigante e degradando a resposta.
- Sempre no servidor — a interface nunca recebe mais do que uma página por vez (já decisão da UX 17.2, "nunca milhares de linhas no cliente").
- `paginacao.total_itens`/`total_paginas` sempre presentes, mesmo em resultado vazio (`total_itens: 0`, `total_paginas: 0`).

**Ordenação:**
- Um único campo de ordenação por vez (`ordenar_por` + `ordem` asc/desc) — reflete a UX aprovada (clique no cabeçalho da coluna alterna a ordem, uma coluna de cada vez, Anexo D).
- Padrão quando nada é informado: período decrescente (mais recente primeiro) — mesma decisão já registrada na UX 17.2.
- `ordenar_por` restrito a uma lista explícita e pequena de campos permitidos (os mesmos que aparecem na listagem: SEI, período, servidor, destino, valor) — nunca um nome de coluna arbitrário vindo da interface, para não acoplar o contrato a detalhes internos do armazenamento.

---

## Fase 8 — Estratégia de detalhamento

- Sempre por `sei` (chave de negócio, decisão 8) — nunca por `id` técnico nem por `linha_planilha`.
- Devolve o contrato "Diária completa" (Fase 4) — todos os campos conhecidos, incluindo os que a listagem omite por brevidade (`doc_origem`, `trecho` completo, `transporte`, servidor completo).
- Sempre inclui o Estado de Sincronização embutido (decisão 6) — um detalhamento aberto a partir de um link direto (ex.: futuro clique num ranking do Dashboard) precisa saber o frescor tanto quanto a listagem.
- `referencia_administrativa.linha_planilha` é exposta, mas rotulada de forma que deixe claro que é só um dado de auditoria/diagnóstico (mesmo cuidado do esquema SQLite, decisão 8) — nunca usada pela interface como identificador de nada.

---

## Estratégia de erros

Reaproveita a **convenção** já estabelecida por Conferência/Planilha/Configuração — não as classes de exceção delas (decisão 9, § 0):

| Código | Quando | Precedente reaproveitado |
| --- | --- | --- |
| `200` com lista vazia | Pesquisa sem resultado | Nunca um erro — é um resultado válido |
| `404` | SEI não encontrado no detalhamento | Mesmo padrão de `ServidorNaoEncontrado` (Conferência) |
| `422` | Parâmetro fora do formato esperado (período invertido, página negativa, campo de ordenação não permitido) | Mesmo padrão de validação já usado nas demais rotas |
| `503` | Base Local (`base_local.sqlite`) ausente ou corrompida | Mesmo padrão de `BaseLocalIndisponivel` (Conferência) |
| `409` | Sincronização manual chamada enquanto outra já está em andamento | **✅ Decisão oficial (2026-07-30):** sincronizações concorrentes não são suportadas nesta fase — a segunda chamada é recusada, nunca enfileirada ou ignorada silenciosamente |

Todo erro devolve uma mensagem pronta para exibição direta ao usuário, mesmo padrão já praticado em todo o resto do app (nunca um stack trace ou mensagem técnica crua na resposta).

---

## Fase 9 — Critérios de performance

- **Nenhum JOIN necessário:** a denormalização decidida na Sprint 17.3 já elimina a necessidade de juntar `diarias` com uma tabela de servidores — cada linha da API é uma única leitura de linha do SQLite.
- **Toda consulta de listagem deve ser satisfeita por um índice já existente sempre que o filtro corresponder a uma coluna indexada** (`cpf`, `sei`, `periodo_inicial`, `cidade_destino`, `motivo`, `servidor_nome`, `servidor_matricula` — todos já criados na Sprint 17.3).
- **Achado concreto (não bloqueia esta Sprint, registrado como risco):** dois filtros já aprovados não têm índice correspondente hoje — `situacao` (mapeia para `servidor_situacao`, sem índice) e o lado "origem" do filtro de município (`cidade_origem`, sem índice — só `cidade_destino` é indexado). Na escala atual (~3 mil linhas) uma varredura completa é irrelevante em termos de tempo de resposta; não há necessidade de otimizar antes do problema existir de fato (mesmo critério já usado na Sprint 13.1). Fica registrado para uma sprint futura de ajuste de esquema.
- **Conexão curta:** cada requisição abre e fecha sua própria conexão SQLite — nunca uma conexão global de longa duração, para nunca competir com uma futura reconstrução (`os.replace`) em andamento (risco já identificado na auditoria da Sprint 17.3).
- **Sem cache de aplicação nesta Sprint:** SQLite indexado já é rápido o bastante na escala atual; um cache adicionaria complexidade de invalidação exatamente onde a sincronização por reconstrução total já resolve o problema de forma mais simples — decisão deliberada de não otimizar prematuramente.
- **Paginação sempre no servidor** (já coberto na Fase 7) é, em si, o maior fator de performance desta API — nenhuma consulta devolve mais do que uma página.

---

## Fase 10 — Evolução

- **Dashboards/KPIs (17.5):** um novo recurso "Indicadores" (`GET /api/v1/analitica/indicadores`) reaproveitaria **os mesmos nomes e tipos de parâmetro de filtro** já definidos aqui (`periodo_inicial`, `municipio`, `motivo`, `situacao`) — a interface que já sabe montar esses parâmetros para `/diarias` não precisa aprender um vocabulário novo. Nenhuma mudança em `/diarias` seria necessária.
- **Rankings (top municípios/servidores, UX Anexo E):** um recurso adicional (`GET /api/v1/analitica/rankings?dimensao=...`), aditivo, mesmo vocabulário de filtro.
- **Relatórios/exportação (17.6):** a API continua devolvendo só dados — nunca um PDF/Excel. Formato de exportação é responsabilidade de uma camada de apresentação fora desta API (o mesmo princípio que já mantém `app/planilha/relatorio.py` gerando HTML, não a API decidindo formato de arquivo). Um relatório poderia simplesmente compor chamadas a `/diarias` (com `tamanho_pagina` maior) e a `/indicadores`.
- **Compatibilidade:** como em `ResultadoPreenchimento`/`ItemResultado` (já um princípio estabelecido no projeto, `escritor_planilha.py`), toda evolução destes contratos deve ser **aditiva** — novo campo opcional, nunca remoção/renomeação sem quebrar a versão (`/api/v1`).
- **Esquema SQLite desacoplado:** nada no contrato espelha nome de coluna 1:1 (Fase 4) — se uma sprint futura precisar mudar o esquema (ex.: tabelas agregadas para performance de Dashboard), o contrato HTTP não muda, só a implementação por trás dele.

---

## Estratégia de testes

Sem implementação — só a estratégia:

- **Testes de contrato:** dado um estado conhecido da Base Local (mesma técnica já usada na Sprint 17.3 — SQLite construído em `tmp_path`, nunca abrindo uma planilha `.xlsx` real, reforça RN-11/decisão 9), cada endpoint devolve exatamente a forma e os valores esperados.
- **Testes de filtro:** cada filtro isoladamente e em combinação; casos de borda (filtro sem nenhum resultado, filtro vazio, valores de filtro que não existem em `opcoes-filtro`).
- **Testes de pesquisa (`q`):** os 3 caminhos de decisão de formato (CPF/SEI/nome parcial), incluindo um termo que não bate com nenhum dos três (cai no fallback de nome parcial).
- **Testes de paginação/ordenação:** página fora do intervalo, tamanho de página no teto máximo, ordenação por cada campo permitido, tentativa de ordenar por campo não permitido (deve dar `422`, não erro interno).
- **Testes de erro:** SEI inexistente (`404`), parâmetro inválido (`422`), Base Local ausente (`503`), primeira utilização/nunca sincronizado (`200` com `status: nunca_sincronizado`, não erro).
- **Testes de sincronização manual:** sucesso, falha simulada (reaproveitando o mesmo padrão de `monkeypatch` já usado na Sprint 17.3), e — porque esta Sprint é a primeira a expor a sincronização manual via HTTP — um teste dedicado ao cenário de concorrência (duas chamadas simultâneas), mesmo que a mitigação final seja decidida só no plano técnico.
- **Regressão:** suíte completa do backend deve continuar 100% verde, sem nenhum teste de Central de Conferência afetado — mesmo critério já usado na auditoria da Sprint 17.3.

---

## Riscos

| # | Risco | Observação |
| --- | --- | --- |
| 1 | `servidor_situacao` e `cidade_origem` não têm índice no esquema atual (achado concreto desta análise, Fase 9). | **✅ Decisão oficial (2026-07-30):** estratégia de indexação permanece inalterada nesta Sprint; reavaliação marcada explicitamente para **depois da implementação da Pesquisa** (17.4.3), não uma sprint futura indefinida. |
| 2 | ~~Sincronização manual concorrente (duas chamadas simultâneas ao `POST /sincronizacao`) — mesma classe de risco já identificada na auditoria técnica da Sprint 17.3, agora exposta via HTTP, logo mais fácil de disparar sem querer (dois cliques rápidos).~~ | **✅ Decisão oficial (2026-07-30):** sincronizações concorrentes não são suportadas — a segunda chamada é recusada (`409`) enquanto a primeira está em andamento. Resolvido; ver Estratégia de erros. |
| 3 | ~~Semântica de "município" (origem OU destino) e de "período" (interseção) são decisões **desta arquitetura**, não estavam explicitadas literalmente na UX 17.2.~~ | **✅ Decisão oficial (2026-07-30):** ambas confirmadas exatamente como propostas — município = origem OU destino; período = interseção. Resolvido. |
| 4 | Exposição de CPF em listagens paginadas (potencialmente muitos registros por página) é uma superfície de exposição maior que a de Conferência (um CPF por vez, mediante busca ativa). | **Ainda em aberto** — não foi endereçado na aprovação de 2026-07-30; segue como pergunta para o DIMCAC. |
| 5 | ~~Conexões SQLite de longa duração poderiam colidir com uma reconstrução em andamento (`os.replace`) — já sinalizado na auditoria da 17.3 como ponto de atenção "quando alguém passar a ler o arquivo". Esta é a Sprint em que alguém passa a lê-lo.~~ | **✅ Resolvido (implementação, Sprints 17.4.3–17.4.6):** confirmado — todas as funções de `app/consulta/repositorio_analitico.py` abrem e fecham sua própria conexão por chamada (`_conectar_somente_leitura`), nunca uma conexão compartilhada de longa duração. Não é mais só um critério definido — é o comportamento real, verificado por leitura de código na revisão de consolidação da 17.4.7. |

---

## Recomendações

1. ~~Confirmar explicitamente, antes do plano técnico, as duas semânticas de filtro assumidas nesta arquitetura.~~ **Resolvido na aprovação de 2026-07-30** — ambas confirmadas como propostas.
2. ~~Tratar a adição dos índices faltantes como item de uma sprint futura.~~ **Resolvido na aprovação de 2026-07-30** — reavaliação marcada explicitamente para depois de 17.4.3 (implementação da Pesquisa), não uma sprint futura indefinida.
3. ~~Decidir o mecanismo de proteção contra sincronização manual concorrente.~~ **Resolvido na aprovação de 2026-07-30** — recusar (`409`) quando já houver uma em andamento; o plano técnico (17.4.2) ainda precisa decidir o mecanismo exato de detecção (ex.: lock em memória), mas a política já está fechada.
4. Confirmar com o DIMCAC se a exposição de CPF em listagens paginadas precisa de algum tratamento adicional antes de abrir a Central Analítica para mais usuários. **Ainda em aberto.**
5. ~~No plano técnico, decidir o formato exato de erro (string simples vs. lista estruturada de validação) — hoje o próprio app já tem os dois estilos convivendo (Conferência vs. demais rotas); esta API deveria escolher um e justificar, não herdar a inconsistência por acidente.~~ **Resolvido no plano técnico (`api-plano-tecnico.md § 5`)** — não havia inconsistência real a resolver: as rotas já existentes (Conferência/Planilha/Configuração) já usavam uniformemente `detail=str(erro)` para exceções de domínio; esta API segue o mesmo padrão, com lista estruturada aparecendo só quando o próprio Pydantic recusa a forma da requisição (fora do controle da rota).

---

## Plano de subetapas da Sprint 17.4

Mesma disciplina de entregas pequenas e validáveis já usada nas sub-etapas anteriores:

| Sub-etapa | Entrega | Depende de | Status |
| --- | --- | --- | --- |
| 17.4.1 | Esta arquitetura (documento atual) | — | **Concluída, aprovada 2026-07-30** |
| 17.4.2 | Plano técnico (schemas Pydantic, camada de serviço, router — só depois de aprovada esta arquitetura) | 17.4.1 aprovada | **Concluída, aprovada 2026-07-30** |
| 17.4.3 | Implementação de `GET /diarias` (pesquisa + filtros + paginação + ordenação) | 17.4.2 | **Concluída, homologada 2026-07-31** |
| 17.4.4 | Implementação de `GET /diarias/{sei}` (detalhamento) | 17.4.2 | **Concluída, homologada 2026-07-31** (correção 17.4.4.1 — decisão de `matricula`/`situacao` opcionais formalizada em `api-plano-tecnico.md § 8` — homologada na mesma data) |
| 17.4.5 | Implementação de `GET /opcoes-filtro` | 17.4.2 | **Concluída, homologada 2026-07-31** (correção 17.4.5.1 — teste de consistência cruzada com `/diarias`, renomeação de função de rota, docstring de `analitica_service.py` — homologada na mesma data) |
| 17.4.6 | Implementação de `GET`/`POST /sincronizacao` + `GET /sincronizacao/avisos` | 17.4.2 | **Concluída, homologada 2026-07-31** (correção 17.4.6.1 — parâmetro `origem` de `base_local.sincronizar()`, testes de múltiplas linhas em `sincronizacoes` e do branch 503 pós-sinal-físico, logging da comparação de frescor — homologada na mesma data) |
| 17.4.7 | Testes de contrato/regressão + auditoria técnica (revisão de consolidação da Sprint 17.4 inteira, mesmo padrão da 17.3) | 17.4.3–17.4.6 | **Concluída, homologada 2026-07-31** — veredito "aprovada com ressalvas" (não conformidades exclusivamente documentais, sem impacto em código/testes) |
| 17.4.7.1 | Correções finais apontadas pela auditoria da 17.4.7 | 17.4.7 | **Concluída, homologada 2026-07-31** — eliminação de duplicação de SQL (`avisos_paginados` passou a reaproveitar `_contar_avisos`, já usada por `ultima_sincronizacao`/`estado_sincronizacao_registrado`), renomeação de `listar_avisos_de_sincronizacao` para `consultar_avisos_de_sincronizacao` (mesmo padrão de nomenclatura já usado nas demais rotas), atualização deste documento e da docstring de `analitica_service.py` |

---

## Resultado desta Sprint

1. **Objetivos da API** — § 1.
2. **Casos de uso** — Fase 1 (16 casos, todos rastreados).
3. **Recursos** — Fase 2 (6 recursos).
4. **Endpoints propostos** — Fase 3 (6 endpoints).
5. **Contratos** — Fase 4.
6. **Estratégia de filtros** — Fase 5.
7. **Estratégia de pesquisa** — Fase 6.
8. **Estratégia de paginação** — Fase 7.
9. **Estratégia de ordenação** — Fase 7.
10. **Estratégia de detalhamento** — Fase 8.
11. **Estratégia de erros** — seção própria.
12. **Critérios de performance** — Fase 9 (inclui achado concreto sobre índices ausentes).
13. **Estratégia de testes** — seção própria.
14. **Riscos** — seção própria (5 itens).
15. **Recomendações** — seção própria (5 itens).
16. **Plano de implementação da Sprint 17.4** — subetapas 17.4.1–17.4.7.

Nenhum código foi escrito. Nenhum schema Pydantic, router FastAPI ou consulta SQL foi criado. Aguardando aprovação explícita antes de elaborar o plano técnico (17.4.2) ou iniciar qualquer implementação.
