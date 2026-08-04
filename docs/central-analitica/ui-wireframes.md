# Central Analítica — Wireframes da Interface (Sprint 18.2)

> **Documento histórico — substituído pela redefinição funcional v2**
> (Sprint 19.1/19.2, [`v2-wireframes.md`](v2-wireframes.md)): os
> wireframes abaixo ilustram o modelo de 3 abas fixas, substituído por um
> fluxo único antes de Dashboard/Relatórios chegarem a ser implementados.
> Mantido como registro do processo de design — não descreve a tela
> atual do app.

> **Sprint 18.2 — exclusivamente wireframes visuais (ASCII, mesma
> convenção já usada em `ux-wireframes.md`). Nenhuma linha de código,
> nenhuma biblioteca escolhida.** Constrói exatamente sobre o que foi
> aprovado em `docs/central-analitica/ui-arquitetura.md` (Sprint 18.1) —
> shell completo com 3 abas, Pesquisa e Sincronização com integração
> real, Dashboard/Relatórios bloqueados — e sobre a UX aprovada na
> Sprint 17.2 (`ux-wireframes.md`), que não é redesenhada aqui. Este
> documento cobre só o que a 18.1 § 10 atribuiu à 18.2: o shell, a aba
> Pesquisa, o Detalhamento (agora com a máscara de CPF, § 0.7 da 18.1) e
> o novo estado `AbaBloqueada`, que não existia na UX original.

## Sumário

- [§ 0 — O que muda e o que não muda em relação à Sprint 17.2](#-0--o-que-muda-e-o-que-não-muda-em-relação-à-sprint-172)
- [§ 1 — Tela principal (shell do módulo)](#-1--tela-principal-shell-do-módulo)
- [§ 2 — Aba Pesquisa](#-2--aba-pesquisa)
- [§ 3 — Detalhamento (com CPF mascarado)](#-3--detalhamento-com-cpf-mascarado)
- [§ 4 — Abas bloqueadas (Dashboard/Relatórios)](#-4--abas-bloqueadas-dashboardrelatórios)
- [§ 5 — Estados da aba Pesquisa](#-5--estados-da-aba-pesquisa)
- [§ 6 — Indicador de sincronização](#-6--indicador-de-sincronização)
- [Riscos](#riscos)
- [Recomendações](#recomendações)
- [Resultado desta Sprint](#resultado-desta-sprint)

---

## § 0 — O que muda e o que não muda em relação à Sprint 17.2

**Sem alteração — reaproveitados literalmente de `ux-wireframes.md`:**
card do Hub (5.1, cor `"azul"`), estrutura geral do shell (5.2), estrutura
da aba Pesquisa (5.3), os 5 estados do indicador de sincronização
(Anexo G), a matriz de responsividade (Anexo I), a lista de componentes
reaproveitados do Design System (Anexo J). Redesenhados aqui só quando
necessário para deixar clara a integração com o que a 18.1 decidiu — sem
mudar nenhuma decisão visual já aprovada.

**Novo nesta Sprint:**

1. **Detalhamento (§ 3):** o wireframe original (5.4 da UX) mostrava o
   CPF do servidor implicitamente dentro de "Servidor" — a UX de 17.2 não
   tinha decidido ainda expor CPF explicitamente nem mascará-lo. Esta
   Sprint redesenha esse bloco para refletir a decisão vinculante da
   18.1 § 0.7: CPF visível só aqui, sempre mascarado por padrão.
2. **`AbaBloqueada` (§ 4):** estado inteiramente novo — a UX 17.2 desenhou
   Dashboard (5.5) e Relatórios (5.6) como telas funcionais, com dado
   real. Como as duas ficam bloqueadas nesta fase (18.1 § 0.6), esses
   dois wireframes originais **não são usados agora** (ficam suspensos,
   não descartados — voltam a valer quando cada aba ganhar backend
   próprio) — em vez disso, esta Sprint desenha o único estado que as
   duas abas de fato têm hoje.
3. **Estados da aba Pesquisa (§ 5):** a UX 17.2 (Anexo H) só descreveu os
   estados em texto/tabela — esta Sprint dá forma visual a cada um.

---

## § 1 — Tela principal (shell do módulo)

Idêntico a `ux-wireframes.md` 5.2 — reproduzido aqui por completude,
sem nenhuma alteração:

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ← Hub                                              ⚙        [status app] │  ← Cabeçalho já existente
├──────────────────────────────────────────────────────────────────────────┤
│  🕐 Base Local sincronizada às 14:32          [ Sincronizar agora ]      │  ← IndicadorSincronizacao (§6)
├──────────────────────────────────────────────────────────────────────────┤
│  🔍  [ Pesquisar por SEI, CPF, servidor ou município...            ] ⏎   │  ← BarraPesquisaGlobal
├──────────────────────────────────────────────────────────────────────────┤
│   Dashboard      Pesquisa      Relatórios                                │  ← SeletorDeAbas, Dashboard ativa por padrão
├──────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│                         (conteúdo da aba ativa)                          │
│                                                                            │
└──────────────────────────────────────────────────────────────────────────┘
```

Largura de referência: `max-w-6xl` (mesma decisão da UX 17.2, Fase 5).
Note-se que, embora Dashboard seja a aba ativa por padrão ao abrir o
módulo (decisão herdada, 18.1 § 0.2), seu conteúdo nesta fase é o estado
bloqueado de § 4 — a primeira coisa que o usuário vê hoje ao abrir a
Central Analítica é esse estado, não um dashboard vazio ou quebrado.

---

## § 2 — Aba Pesquisa

Idêntico a `ux-wireframes.md` 5.3 — sem alteração estrutural, já que os
filtros/tabela correspondem exatamente ao que `GET /diarias` devolve
(`ui-arquitetura.md` § 9):

```
   Dashboard      [Pesquisa]      Relatórios
──────────────────────────────────────────────────────────────────────────
  🔍  [ araripina                                                    ] ⏎
  Filtros ▾  (colapsado — SEI, CPF, servidor, matrícula, município,
              motivo, situação, período)

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

**Confirmação visual da regra de privacidade (18.1 § 0.7):** nenhuma
coluna desta tabela mostra CPF — as 5 colunas (SEI, Servidor, Período,
Destino, Valor) são exatamente as de `DiariaResumoResposta`, que nunca
teve campo `cpf`. Filtrar por CPF continua possível (campo de busca em
"Filtros ▾"), só não aparece como coluna de exibição.

---

## § 3 — Detalhamento (com CPF mascarado)

Painel lateral, sobre a lista — mesma mecânica de `ux-wireframes.md` 5.4
(nunca troca de tela, fecha com ✕ ou clique fora). Redesenhado para
mostrar explicitamente onde e como o CPF aparece:

```
──────────────────────────────────────────────────────────── ┌───────────────────────────────┐
  1.248 resultados                                            │  Processo SEI              ✕ │
  ┌──────────────────┬─────────┬────────┐                     │  19.20.0903.0030720/2024-36   │
  │ SEI               │ ...     │        │  (tabela ao fundo,  ├───────────────────────────────┤
  │ 19.20...0720/2024 │ ...     │  ▸     │   levemente         │  Servidor                     │
  │                    │         │        │   escurecida)       │  João da Silva                │
  └──────────────────┴─────────┴────────┘                     │  Cargo · Previdência           │
                                                                │                                │
                                                                │  CPF                           │
                                                                │  ***.***.***-11                │  ← novo (§0.7),
                                                                │                                │     sempre mascarado
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

- **Formato de máscara (rascunho, a validar com o DIMCAC — mesmo
  tratamento já dado a outros textos/formatos exatos neste projeto,
  ex. Anexo G da UX 17.2):** últimos 2 dígitos visíveis
  (`***.***.***-11`), os demais substituídos por asterisco. Preserva o
  suficiente para conferência cruzada humana ("é este CPF mesmo?") sem
  expor o número inteiro por padrão.
- **✅ Fechado (2026-07-31, após aprovação da 18.2): sem botão/ícone de
  revelar.** O rascunho de ícone "👁" cogitado na primeira versão deste
  wireframe foi descartado — nesta fase, o CPF no Detalhamento é sempre
  o valor mascarado, sem nenhuma interação para exibi-lo por completo.
  Uma futura exibição completa do CPF fica registrada como fora de
  escopo, dependente de regra de acesso/perfil (inexistente hoje no app)
  e de aprovação específica do DIMCAC — não é uma sub-etapa prevista
  desta Sprint (`ui-arquitetura.md` § 0.7).
- **Sem mudança de contrato:** o painel recebe `DiariaCompletaResposta.
  cpf` completo do backend (`ui-arquitetura.md` § 9) — a máscara é só
  apresentação, nunca um campo novo pedido à API, e nunca é revertida na
  tela nesta fase.

---

## § 4 — Abas bloqueadas (Dashboard/Relatórios)

Estado único, idêntico nas duas abas (só o texto muda) — nunca usa a cor
de erro (vermelho), consequência da regra herdada (`ui-arquitetura.md`
§ 0.3/§ 8):

```
   [Dashboard]      Pesquisa      Relatórios
──────────────────────────────────────────────────────────────────────────



                              ⏳
                    Ainda não disponível

        Os indicadores e gráficos da Central Analítica chegam
           numa próxima etapa. Enquanto isso, use a aba
        Pesquisa para consultar diárias por período, município,
                    servidor ou situação.

                    [ Ir para Pesquisa ]



──────────────────────────────────────────────────────────────────────────
```

```
   Dashboard      Pesquisa      [Relatórios]
──────────────────────────────────────────────────────────────────────────



                              ⏳
                    Ainda não disponível

           A geração de relatórios periódicos chega numa
              próxima etapa. Enquanto isso, use a aba
             Pesquisa e filtre pelo período desejado.

                    [ Ir para Pesquisa ]



──────────────────────────────────────────────────────────────────────────
```

- **Ícone/cor:** neutro (tom `info`/cinza claro, mesma família visual do
  estado "verificando" do indicador de sincronização) — nunca `erro`
  nem `aviso`, para não ser confundido com falha técnica ou com um
  problema que o usuário precise resolver.
- **Botão "Ir para Pesquisa":** único elemento interativo do estado —
  muda a aba ativa para "Pesquisa" (mesma mecânica de `SeletorDeAbas`,
  `ui-arquitetura.md` § 4). Atende diretamente o risco 1 registrado na
  18.1 (usuário achar que o app está quebrado) e a mitigação prevista
  para o perfil Gestor (18.1 § 2) — a funcionalidade equivalente mais
  próxima já está a um clique, nunca escondida.
- **Texto (rascunho, a validar com o DIMCAC, mesma ressalva já feita para
  outros textos deste módulo):** evita prometer prazo ("numa próxima
  etapa", nunca uma data), e não usa a palavra "erro"/"indisponível" (que
  sugeriria falha) — é uma ausência planejada, não um problema.
- **Sem grid, sem breakpoint próprio** (`ui-arquitetura.md` § 7) —
  mensagem centralizada, comportamento idêntico em qualquer largura.

---

## § 5 — Estados da aba Pesquisa

Forma visual da matriz do Anexo H (UX 17.2) / § 8 (`ui-arquitetura.md`),
restrita à aba Pesquisa (única com integração real nesta fase):

```
Carregando (esqueleto):
  ┌────────────────────┬──────────────────┬───────────────┬───────────────┬────────────┐
  │ ░░░░░░░░░░░░░░░░░  │ ░░░░░░░░░░░░░░░  │ ░░░░░░░░░░░░  │ ░░░░░░░░░░░░  │ ░░░░░░░░░  │
  │ ░░░░░░░░░░░░░░░░░  │ ░░░░░░░░░░░░░░░  │ ░░░░░░░░░░░░  │ ░░░░░░░░░░░░  │ ░░░░░░░░░  │
  └────────────────────┴──────────────────┴───────────────┴───────────────┴────────────┘

Vazio (nunca sincronizado — J7):
                              📭
              Ainda não há dados para pesquisar.
    Assim que o primeiro processamento for concluído, os
              registros aparecem aqui.

Sem resultados (busca feita, nada encontrado):
                              🔍
          Nada encontrado para "xyz123".
     Confira a grafia ou tente outro termo de busca.

Erro:
  ⚠️  Não foi possível carregar os resultados. [ Tentar novamente ]
```

- **Carregando:** esqueleto reaproveita a mesma superfície "vidro" com
  opacidade reduzida já usada em outros carregamentos do app (decisão já
  registrada no Anexo H da UX, sem componente novo de skeleton).
- **Vazio vs. sem resultados:** ícones e textos deliberadamente distintos
  — o primeiro é um estado do módulo (nada foi sincronizado ainda), o
  segundo é um resultado de uma ação do usuário (buscou e não achou);
  confundir os dois foi um risco já identificado na UX 17.2 (Anexo A).
- **Erro:** `Alerta variante="erro"` (única cor vermelha desta aba,
  reservada a falha técnica real — `ui-arquitetura.md` § 0.3).
- **Sincronizando/desatualizado:** não redesenhados aqui — vivem inteiramente
  no `IndicadorSincronizacao` (§ 6), a tabela em si só permanece visível
  sem mudança de layout (já descrito em `ui-arquitetura.md` § 8).

---

## § 6 — Indicador de sincronização

Idêntico a `ux-wireframes.md` Anexo G — sem alteração, reproduzido por
completude:

```
Normal:          🕐  Base Local sincronizada às 14:32     [ Sincronizar agora ]
Verificando:     ⏳  Verificando atualizações...
Sincronizando:   🔄  Sincronizando...                     (botão desabilitado)
Concluído:       ✅  Base Local atualizada                (some sozinho em poucos segundos)
Falha:           ⚠️  Falha ao sincronizar às 14:32 — dados podem estar desatualizados
                                                           [ Tentar novamente ]
Desatualizado:   🟠  Os dados podem estar desatualizados  [ Sincronizar agora ]
```

Presente e idêntico nas 3 abas, inclusive nas duas bloqueadas (§ 4) —
a verificação de frescor é do módulo inteiro, não de uma aba específica
(`ui-arquitetura.md` § 8).

---

## Riscos

| # | Risco | Mitigação proposta |
| --- | --- | --- |
| 1 | ~~Ícone "👁" de revelar CPF proposto no rascunho original.~~ | **✅ Resolvido (2026-07-31):** descartado — sem mecanismo de revelar nesta fase. CPF sempre mascarado no Detalhamento; exibição completa fica registrada como fora de escopo, dependente de regra de acesso/perfil e aprovação do DIMCAC (`ui-arquitetura.md` § 0.7). |
| 2 | Texto do estado `AbaBloqueada` (§ 4) e o formato exato da máscara de CPF (§ 3) são rascunhos, não redação final. | Validar redação final com o DIMCAC antes da 18.3 (plano técnico), mesma prática já usada para o indicador de sincronização na UX 17.2. |

---

## Recomendações

1. Validar com o DIMCAC, antes da 18.3: (a) o texto exato de
   `AbaBloqueada` para Dashboard e para Relatórios (§ 4); (b) o formato
   exato da máscara de CPF (§ 3) — sem mecanismo de revelar, decisão já
   fechada.
2. Ao aprovar estes wireframes, tratar as duas telas novas (`AbaBloqueada`,
   Detalhamento com CPF mascarado) como parte do escopo vinculante da
   18.3 (plano técnico) — não como rascunho livre para a implementação
   decidir sozinha.

---

## Resultado desta Sprint

1. **Shell do módulo** — § 1 (sem alteração em relação à 17.2).
2. **Aba Pesquisa** — § 2 (sem alteração estrutural).
3. **Detalhamento com CPF mascarado** — § 3 (novo, fecha a decisão da
   18.1 § 0.7 em forma visual).
4. **Abas bloqueadas (Dashboard/Relatórios)** — § 4 (novo).
5. **Estados da aba Pesquisa** — § 5 (forma visual do Anexo H/§ 8).
6. **Indicador de sincronização** — § 6 (sem alteração em relação à 17.2).

Nenhum código foi escrito. Nenhuma biblioteca foi escolhida. Aguardando
aprovação explícita antes da Sprint 18.3 (plano técnico do frontend).
