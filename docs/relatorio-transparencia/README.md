# Relatório de Diárias — Portal da Transparência — Especificação Consolidada

> **Atualização (Plano de Migração E-Fisco, Sprints A-D/D.1, posteriores a
> este documento) — a Base de Ordens Bancárias/ClickView descrita abaixo foi
> APOSENTADA como fonte financeira e substituída pela Base E-Fisco
> (`app/consulta/repositorio_efisco.py`); o leitor exclusivo do ClickView
> (`repositorio_ordens_bancarias.py`) foi removido do pipeline produtivo na
> Sprint E (limpeza do legado). Nenhuma regra deste documento mudou de
> significado por causa disso — RN01-RN07, o motor de reconciliação e a
> estrutura `OrdemBancaria` continuam exatamente as mesmas, agora
> alimentadas por `adaptador_efisco.py` em vez do leitor antigo (a mesma
> forma de dados, `dict[str, list[OrdemBancaria]]`, entra em
> `motor_reconciliacao.reconciliar` de qualquer uma das duas fontes,
> indistintamente). As evidências/achados citados abaixo (linhas reais da
> Base OB 2026, números de OB específicos etc.) permanecem como registro
> histórico da investigação original que fundamentou essas regras — nunca
> reescritos —, mas não descrevem mais a fonte em produção.

> **Estado em 2026-08-23.** Micro-Sprints 1, 2 e 3A já implementadas
> (leitura isolada da Base de Ordens Bancárias, leitura própria e
> não-destrutiva do Controle DIMCAC, motor de reconciliação DH↔OB). Este
> documento CONGELA o resultado de uma sequência extensa de investigações
> **READ-ONLY** sobre as três fontes reais (Controle DIMCAC, Base de Ordens
> Bancárias, relatório histórico publicado) — nenhum dado real entrou no
> repositório; todo achado citado aqui foi confirmado contra as fontes reais
> localmente e depois generalizado em regra, nunca o contrário. A partir
> desta versão, RN01–RN07 substituem integralmente qualquer numeração
> anterior (R01–R13 e variações intermediárias) — não há versões
> contraditórias em vigor.
>
> Micro-Sprint 3B (implementada nesta revisão) constrói o **motor de decisão
> de conteúdo** (RN01–RN07, sem UI, sem persistência, sem XLSX final).
> Micro-Sprint 3C (não implementada) cobre a tela de revisão, a persistência
> de decisões humanas, a trava de geração e a geração do XLSX final.

## Sumário

0. [Isolamento arquitetural](#0-isolamento-arquitetural)
1. [Princípio central do modelo](#1-princípio-central-do-modelo)
2. [Regras de negócio (RN01–RN07)](#2-regras-de-negócio-rn01rn07)
3. [Normalização de trecho — regra técnica do detector](#3-normalização-de-trecho--regra-técnica-do-detector)
4. [Invariantes (I01–I11b)](#4-invariantes-i01i11b)
5. [Guardrails (G01–G07)](#5-guardrails-g01g07)
6. [Workflow/UX aprovado — Micro-Sprint 3C (não implementado)](#6-workflowux-aprovado--micro-sprint-3c-não-implementado)
7. [Evidências e limitações conhecidas](#7-evidências-e-limitações-conhecidas)
8. [Arquitetura implementada](#8-arquitetura-implementada)
9. [Homologação — Fevereiro a Julho/2026](#9-homologação--fevereiro-a-julho2026)

---

## 0. Isolamento arquitetural

`relatorio_transparencia` é um módulo **aditivo e isolado**. Nenhuma regra
deste documento altera, ou pode alterar sem PARAR e pedir autorização
explícita, o comportamento de: fluxo de extração de PDF, `repositorio_diarias.py`,
`diarias_completas`, Central de Conferência, Central Analítica, Central de
Regularização, Base Local, APIs existentes, frontend existente, Electron,
empacotamento desktop. O módulo tem sua própria leitura do Controle DIMCAC
(`app/consulta/repositorio_controle_dimcac.py`, Micro-Sprint 3A) — nunca
reaproveita `diarias_completas` como fonte, porque essa função deduplica por
SEI e descarta linhas silenciosamente (achado real: 16 DHs perdidos).

## 1. Princípio central do modelo

A Base de Ordens Bancárias é a fonte financeira do relatório. Uma OB paga
representa uma **ocorrência financeira candidata** à publicação — não uma
garantia incondicional de publicação, nem uma exclusão silenciosa possível.

```
OB paga
  → ocorrência candidata
  → normal (nenhum gatilho de RN02/RN04/RN07)      → publicação automática
  → atípica (algum gatilho de RN02/RN04/RN07)       → REVISAO_NECESSARIA
                                                         → decisão humana (Micro-Sprint 3C)
                                                         → publicação conforme decisão
```

Nenhuma OB desaparece silenciosamente — mesmo quando uma revisão resulta em
"não publicar esta OB", isso fica registrado como uma decisão, nunca como
ausência não-rastreável.

## 2. Regras de negócio (RN01–RN07)

### RN01 — Ocorrência financeira por OB

Cada OB efetivamente paga é uma ocorrência financeira candidata à
publicação. Um DH pode possuir N OBs e todas sobrevivem individualmente à
reconciliação — nunca somadas, consolidadas ou descartadas automaticamente.
Registro administrativo do Controle sem OB paga correspondente permanece
preservado na reconciliação (evidência), mas nunca cria pagamento fictício
no relatório.

RN01 é a regra guarda-chuva: os gatilhos concretos que tiram um candidato do
caminho de publicação automática são exatamente RN02, RN04, RN05/RN06 e
RN07 — nenhum outro campo ou heurística tira uma OB do caminho normal.

### RN02 — Restituição / estorno

O valor publicado é sempre o valor já registrado na Base OB
(`VALOR DA DIÁRIA`) — o sistema nunca calcula `valor original - restituição`.

**Evidência real (Base OB completa, 1828 linhas, 2026):** só **2 linhas**
têm `RESTITUIÇÃO` diferente de `'-'` (ambas `154,09`); nas duas,
`VALOR DA DIÁRIA = 0`, e o relatório histórico publicou `0`. Restituição
integral comprovada: usar o valor da Base OB diretamente (mesmo quando é
zero — zero não é "ausência de OB", é uma ocorrência financeira legítima de
valor zero).

Restituição parcial não tem nenhum exemplo real conhecido. Quando
`RESTITUIÇÃO` estiver presente e `VALOR DA DIÁRIA` **não** for zero →
REVISAO_NECESSARIA (RN04) — não há base empírica para decidir automaticamente.

### RN03 — Marcadores não decidem publicação

`DUPLICIDADE="Duplicado"`, `"JÁ EXISTE DIÁRIA"` (colunas AVISO/AVISO
AUXILIAR do Controle) e qualquer texto correlato **nunca**, isoladamente:
excluem, bloqueiam, alteram valor, confirmam duplicidade financeira, ou
disparam REVISAO_NECESSARIA. Permanecem como evidência/metadado, exibida
junto de um caso quando ele já está em revisão por outro motivo (nunca como
gatilho por si só).

**Evidência real**: dos 17 registros `DUPLICIDADE="Duplicado"` da Base OB
2026, a investigação individual encontrou pelo menos 5 fenômenos distintos
(complemento legítimo, duplicidade financeira real/provável, repetição
física de exportação, coincidência administrativa sem duplicidade,
indeterminado) — o campo mistura categorias incompatíveis e não pode ser
gatilho isolado de nada.

### RN04 — Conflito material sem resolução segura

Quando existir conflito, corrupção ou divergência que possa alterar
materialmente o conteúdo do relatório e não houver fonte segura para
resolver automaticamente → REVISAO_NECESSARIA. Nunca: adivinhar, corrigir
silenciosamente, escolher arbitrariamente uma fonte, remover um registro só
para eliminar o conflito.

Gatilhos concretos implementados na Micro-Sprint 3B: valor financeiro
ausente/não reconhecível na Base OB; `DATA OB` ausente/não reconhecível
(impede aplicar RN05); restituição presente com valor pago não-zero (RN02);
repetição física do mesmo número de OB com divergência em campo
financeiramente/descritivamente relevante (ver I11a/I11b).

### RN05 — Competência por DATA OB

A competência financeira é determinada pela `DATA OB` (data de pagamento) —
nunca pelo período da viagem.

**Evidência real**: 31 casos na Base OB 2026 com período de viagem anterior
a 2026 e publicação no relatório de pagamentos de 2026. Caso decisivo:
viagem em 07/10/2025, paga em 07/07/2026, publicada no relatório de
julho/2026 — só é explicável se a inclusão for por data de pagamento.

### RN06 — Relatório acumulativo anual

Para `ano_exercicio` + `mes_referencia`, o relatório compreende
`01/01/ano_exercicio` até o último dia de `mes_referencia` (ex.:
agosto/2026 → janeiro a agosto). O relatório é **reconstruído das fontes**
a cada geração — nunca abrir o XLSX de um mês anterior para anexar linhas
novas. Já implementada e testada desde a Micro-Sprint 2
(`competencia.intervalo_acumulado`).

### RN07 — Suspeita de duplicidade financeira

OBs **distintas** entram em suspeita forte de pagamento financeiro em
duplicidade quando, simultaneamente (AND — todos os critérios):

1. mesmo CPF normalizado;
2. mesmo período inicial;
3. mesmo período final;
4. mesmo valor da diária;
5. mesmo trecho **normalizado** (§ 3).

**Evidência real**: detector validado nas 1828 linhas inteiras da Base OB
2026, ignorando a coluna `DUPLICIDADE` como filtro inicial — 6 grupos de
alta confiança, 12 OBs envolvidas, nenhum grupo com 3+ OBs, o caso confirmado
`2026OB900101`/`2026OB900102` (identificadores fictícios) reencontrado, os
5 complementos legítimos
conhecidos não dispararam (porque um complemento sempre paga um valor
diferente do original), nenhum falso positivo conhecido no conjunto
validado.

**Resultado**: SUSPEITA ≠ DUPLICIDADE CONFIRMADA. O motor nunca escolhe
automaticamente qual OB publicar — o grupo inteiro vai para
REVISAO_NECESSARIA. A decisão humana (Micro-Sprint 3C) resultará em:
publicar todas / publicar só determinadas OBs / adiar decisão. Nunca
presumir "o primeiro pagamento sempre prevalece" — no único caso confirmado
isso aconteceu, mas em pelo menos 5 outros casos estruturalmente idênticos
o comportamento histórico observado foi publicar ambos os pagamentos sem
exclusão.

## 3. Normalização de trecho — regra técnica do detector

Registrada como regra técnica do detector RN07, **não** como RN de negócio
— não decide o que é publicado, só decide quando dois textos de trecho
"são a mesma escrita da mesma rota".

```
trecho_original                              (nunca alterado, sempre preservado)
  → UPPERCASE
  → remoção determinística de acentos (Unicode NFKD)
  → um ou mais hífens + espaços ao redor → um único "-" sem espaços
  → colapso de espaços consecutivos
  → trim
trecho_normalizado                            (só para comparação)
```

**Proibido, sem evidência que justifique**: fuzzy matching, Levenshtein,
similaridade percentual, inverter localidades (A-B ≠ B-A sempre — achado
real: par 732↔2388 é ida/volta legítima do mesmo evento, ordem importa),
expandir abreviações STA/STO automaticamente (3 ocorrências em 1828 linhas,
nenhuma delas parte de um grupo suspeito — sem evidência de necessidade),
corrigir ortografia por inferência.

**Validação global**: 675 trechos brutos distintos → 544 normalizados → 93
colisões, todas classificadas como equivalência legítima de escrita (mesma
rota, variando acento/espaçamento/caixa) — zero colisões perigosas
observadas.

## 4. Invariantes (I01–I11b)

Não decidem conteúdo do relatório — garantem que a reconciliação nunca perde
dado nem decide destrutivamente por conta própria.

- **I01** — DH é o elo estrutural primário da reconciliação.
- **I02** — SEI não pode ser usado para deduplicação destrutiva neste módulo.
- **I03** — 1 DH → N OBs é sempre preservado.
- **I04** — toda linha potencialmente relevante das fontes chega à
  reconciliação ou produz diagnóstico explícito — nunca desaparece em
  silêncio.
- **I05** — nenhum dado bruto é corrigido silenciosamente na leitura.
- **I06** — `trecho_original` é sempre preservado; `trecho_normalizado` é
  sempre derivado, nunca substitui o original.
- **I07** — matching aproximado nunca decide nada destrutivamente — só
  informa; nunca remove nem funde registros automaticamente.
- **I08** — o leitor próprio do Controle DIMCAC
  (`repositorio_controle_dimcac.py`) permanece isolado de
  `repositorio_diarias.diarias_completas`.
- **I09** — o leitor da Base OB (`repositorio_ordens_bancarias.py`)
  permanece isolado e nunca altera a fonte (só leitura).
- **I10** — `relatorio_transparencia` permanece módulo aditivo, isolado dos
  fluxos homologados existentes.
- **I11a — Preservação da evidência física** — toda ocorrência física de um
  número de OB repetido deve permanecer rastreável, na leitura e na
  classificação. Nenhuma ocorrência física pode desaparecer silenciosamente.
  Mesmo quando apenas uma ocorrência seguir como representante financeira
  (I11b), todas as ocorrências físicas originais permanecem disponíveis
  como evidência/diagnóstico (`DiagnosticoRepeticaoFisica.ocorrencias`,
  Micro-Sprint 3B — contém sempre a lista completa, nunca só a
  representante).
- **I11b — Unicidade da ocorrência financeira** — quando múltiplas
  ocorrências físicas do mesmo número de OB forem equivalentes segundo
  critérios técnicos determinísticos e testados, elas representam uma
  única ocorrência financeira/publicável; o motor pode selecionar uma
  representante determinística para continuar o pipeline (Micro-Sprint 3B:
  a de menor `linha`), desde que I11a continue satisfeita. Se houver
  divergência material entre as ocorrências físicas → nunca escolher
  silenciosamente → RN04 (REVISAO_NECESSARIA). Nunca é tratada como RN07 —
  RN07 é exclusivamente sobre OBs **distintas**, nunca sobre repetição
  física do mesmo número.

  **Comportamento técnico observado (não é parte do invariante — é um
  padrão empírico da fonte atual, sujeito a evolução)**: das 15 repetições
  físicas de número de OB encontradas na Base OB 2026, 12 seguem o padrão
  "uma linha com valor 0 + uma linha com o valor real, resto idêntico"
  (artefato de exportação em lote — critério de equivalência de I11b); 3
  coincidem com DHs que já tinham múltiplas linhas no próprio Controle
  (achado da Micro-Sprint 3A) — destas, 2 têm divergência de motivo/trecho
  entre as linhas físicas (RN04) e 1 é idêntica em todo campo (I11b
  colapsa).

## 5. Guardrails (G01–G07)

- **G01** — o relatório histórico publicado NÃO é golden file; é evidência
  do comportamento administrativo passado. Erros históricos comprovados
  (ex.: possível omissão isolada) não são reproduzidos automaticamente.
- **G02** — nunca transformar fórmula/artefato habitual da própria planilha
  em RN sem evidência de domínio (ex.: `"JÁ EXISTE DIÁRIA"` é, na maioria
  dos casos, saída rotineira de uma fórmula `VLOOKUP`, não um alerta
  seletivo).
- **G03** — nunca inferir regra universal a partir de um único caso (ex.: o
  par `OB900101`/`OB900102`, identificadores fictícios, não prova "sempre
  manter a primeira OB" — outros 5 casos estruturalmente idênticos
  mantiveram os dois pagamentos).
- **G04** — quando a evidência não for suficiente, REVISAO_NECESSARIA é
  sempre preferível a automação especulativa.
- **G05** — o XLSX final fica bloqueado enquanto existir REVISAO_NECESSARIA
  sem decisão humana válida para a competência (Micro-Sprint 3C).
- **G06** — decisão humana é vinculada à identidade estável do grupo de
  ocorrências + fingerprint das evidências relevantes — nunca ao mês de
  referência isolado (o relatório é acumulativo, RN06). Uma decisão
  permanece válida e é reaproveitada automaticamente em gerações futuras da
  mesma competência acumulada enquanto a evidência não mudar; mudança de
  evidência invalida/exige revalidação (Micro-Sprint 3C).
- **G07** — o XLSX final é sempre consequência determinística de
  `FONTES + RNs + DECISÕES HUMANAS VÁLIDAS`; edição manual do arquivo
  publicado não faz parte do fluxo normal (recurso excepcional externo,
  marcado como tal quando usado).

## 6. Workflow/UX aprovado — Micro-Sprint 3C (não implementado)

Registrado como requisito futuro — **não implementado na Micro-Sprint 3B**.

```
PREPARAR RELATÓRIO
  → reconciliar/classificar (motor da 3B)
  → casos normais seguem
  → casos atípicos vão para revisão
  → servidor decide (um caso por vez, "Caso X de Y")
  → todas as pendências resolvidas
  → GERAR RELATÓRIO
```

Tela de revisão: linguagem simples, sem termos técnicos (nunca mostrar
"fingerprint", "motor de reconciliação", "score interno", "RN07"); nenhuma
decisão pré-selecionada; explicar por que o sistema chamou atenção; destacar
o que é igual / o que é diferente entre as ocorrências. Pergunta principal:
**"Quais destes pagamentos devem constar no relatório?"** — nunca obrigar o
servidor a classificar tecnicamente o fenômeno ("isso é uma duplicidade?").

**Visão principal** (nunca escondida atrás de "ver todos os dados", porque
na investigação real esses campos foram repetidamente decisivos): nome do
beneficiário, OB, DH, SEI, DATA OB, período, trecho, valor, **MOTIVO**. Se
`RESTITUIÇÃO` tiver valor real, mostrar também na visão principal. Demais
campos ficam em "Ver todos os dados".

Decisões possíveis: selecionar explicitamente as OBs publicáveis / publicar
todas / adiar. "Adiar" mantém REVISAO_NECESSARIA e o relatório final
continua bloqueado (G05).

## 7. Evidências e limitações conhecidas

- Validação empírica limitada a 1 ano (2026) de 1 arquivo real de cada
  fonte.
- Nenhum grupo real de suspeita de duplicidade com 3+ OBs foi observado —
  lógica de decisão para grupos maiores que 2 não tem validação empírica.
- Um caso real (identificador fictício `2026OB900103`/`2026DH900103`)
  permanece indeterminado — nenhum vínculo estrutural encontrado com
  nenhuma outra ocorrência.
- Restituição parcial não tem nenhum exemplo real conhecido (RN02 cobre o
  caso integral com evidência; o parcial vai para REVISAO_NECESSARIA por
  falta de evidência, não por decisão arbitrária).
- Abreviações STA/STO não exigiram equivalência até agora (raras, isoladas).
- Novas evidências (mais anos, mais competências) podem exigir evolução das
  RN02/RN05/RN07 — nenhuma delas deve ser tratada como definitivamente
  imutável, só como suficientemente sustentada pela evidência disponível
  hoje.
- **Dívida técnica registrada (não corrigida agora)**: `OcorrenciaFinanceira`
  (`motor_decisao.py`) desempenha três papéis conceituais diferentes sem
  distinção de tipo — ocorrência física bruta (dentro de
  `DiagnosticoRepeticaoFisica.ocorrencias`), representante financeira
  escolhida após I11b, e ocorrência dentro de `CandidatoNormal`/
  `RevisaoNecessaria`. Não há perda de dado, rastreabilidade ou regressão
  comprovada — é só imprecisão de nomenclatura, sinalizada para uma futura
  melhoria (possivelmente 3 tipos distintos), não uma correção urgente.

## 8. Arquitetura implementada

- `app/domain/entities/ordem_bancaria.py` — `OrdemBancaria` (Micro-Sprint 1,
  estendida na 3B com o campo `trecho`, ver § 3).
- `app/domain/entities/registro_controle.py` — `RegistroControle`,
  `ClassificacaoSei` (Micro-Sprint 3A).
- `app/consulta/repositorio_ordens_bancarias.py` — leitura isolada da Base
  OB (Micro-Sprint 1).
- `app/consulta/repositorio_controle_dimcac.py` — leitura própria e
  não-destrutiva do Controle DIMCAC (Micro-Sprint 3A).
- `app/domain/relatorio_transparencia/entidades.py` — `DocumentoHabil`
  (Micro-Sprint 2/3A).
- `app/domain/relatorio_transparencia/competencia.py` —
  `intervalo_acumulado` (RN06, Micro-Sprint 2).
- `app/domain/relatorio_transparencia/motor_reconciliacao.py` —
  `reconciliar` (Micro-Sprint 2/3A).
- `app/domain/relatorio_transparencia/normalizacao_trecho.py` —
  `normalizar_trecho` (RN07, Micro-Sprint 3B).
- `app/domain/relatorio_transparencia/motor_decisao.py` — `classificar`,
  RN01–RN07, I11a/I11b (Micro-Sprint 3B).

## 9. Homologação — Fevereiro a Julho/2026

> **STATUS: HOMOLOGADO COM RESSALVA DOCUMENTADA.** Cobre as gerações de
> Fevereiro a Julho/2026 do gerador de XLSX
> (`app/planilha/escritor_relatorio_transparencia.py` +
> `app/services/relatorio_transparencia_service.py`). Nenhum código,
> planilha ou decisão persistida foi alterado por esta homologação — é um
> registro do resultado de duas rodadas de auditoria já concluídas
> (comparativa e de causa raiz), não uma nova investigação.
>
> **Nota de privacidade:** a homologação foi executada sobre dados
> operacionais reais. Nesta versão do documento foram removidos todos os
> identificadores (OBs, documentos hábeis, processos SEI), nomes, valores,
> contagens e decisões individuais. O registro detalhado permanece apenas
> em arquivo local, fora do repositório. Os identificadores que aparecem
> abaixo são **sintéticos** e servem só para ilustrar o formato.

### 9.1 Escopo

Comparação entre cada relatório mensal gerado pelo sistema e o recorte
correspondente do relatório oficial acumulado, para os meses de Fevereiro
a Julho/2026. Fora de escopo: qualquer recálculo financeiro e qualquer
alteração de dados persistidos.

### 9.2 Fontes utilizadas

- Bases de Ordens Bancárias e de Controle DIMCAC efetivamente usadas nas
  gerações auditadas (caminhos configurados localmente).
- Decisões humanas persistidas e relatório oficial acumulado, ambos
  mantidos fora do repositório.
- Nenhum desses arquivos é versionado nem reproduzido neste documento.

### 9.3 Metodologia

1. Comparação campo a campo (data, trecho, motivo, quantidade de diárias,
   valor total) entre cada relatório mensal e o recorte do oficial
   acumulado correspondente, por Ordem Bancária + assinatura de conteúdo.
   O campo "Valor da Passagem" foi excluído da comparação (decisão
   institucional então vigente).
2. Reexecução das funções puras do domínio (`classificar`,
   `identidade_grupo`, `aplicar_decisoes`) contra os mesmos dados, para
   confirmar que o XLSX reflete o domínio.
3. Execução estritamente somente-leitura: nenhuma fonte, planilha ou
   decisão persistida foi modificada.

### 9.4 Resultado — RN07 (supressões deliberadas, não bugs)

As ocorrências ausentes dos relatórios mensais por suspeita de pagamento
em duplicidade (RN07) correspondem a supressões deliberadas, cada uma com
decisão humana persistida e rastreável por `identidade_grupo`/fingerprint.
Não são defeitos do sistema. Os identificadores foram omitidos.

### 9.5 Resultado — Períodos (divergências materiais investigadas individualmente)

Todas as divergências materiais de período foram investigadas caso a
caso. Cada uma foi explicada por erro do relatório oficial, decisão humana
deliberada e rastreável, ou dado ruim já presente nas fontes. Detalhes
individuais omitidos.

### 9.6 Resultado — Outras divergências materiais (fontes sustentam o sistema)

Nas demais divergências materiais, as fontes de origem sustentam o valor
produzido pelo sistema, e não o do relatório oficial. Detalhes individuais
omitidos.

### 9.7 Resultado — Nomes

As divergências de grafia de nome foram classificadas; parte decorre do
fallback deliberado Nome→Credor e parte permanece sem causa-raiz
verificada individualmente (ver §9.11). Nenhum nome é reproduzido aqui.

### 9.8 Resultado — Dados ruins já presentes nas fontes

Foram identificados registros inconsistentes já existentes nas próprias
fontes (Base de Ordens Bancárias e Controle DIMCAC). O sistema os trata
conforme as regras aprovadas; a correção cabe à origem do dado.

### 9.9 Ressalva material aberta — 2026OB700001

Um caso permanece indeterminado: sua verificação depende de um artefato
externo (o processo SEI 19.20.0001.0000901/2026-01, identificador
sintético) que não está disponível localmente. Está registrado como a
única pendência material aberta desta homologação.

### 9.10 Conclusão de homologação

**HOMOLOGADO COM RESSALVA DOCUMENTADA.** Nenhum bug do sistema foi
confirmado nas duas rodadas de auditoria. As divergências materiais
investigadas foram explicadas, em cada caso individual, por: (a)
divergência/erro do relatório oficial; (b) decisão humana deliberada e
rastreável (RN07); (c) dado ruim já existente nas próprias fontes; ou (d)
fallback deliberado já aprovado. Não foi encontrada evidência de falha
sistêmica de matching, geração, persistência de decisão ou composição da
linha publicável. A única pendência material aberta é 2026OB700001
(§9.9), que requer um artefato externo (o processo SEI) que não está
disponível localmente.

**Critério metodológico**: esta homologação não usa aderência bruta ao
relatório oficial como métrica de precisão — o oficial tem divergências e
erros próprios (§9.5, §9.6, §9.9) e pode conter pagamentos em duplicidade
que o sistema deliberadamente reduz por regra aprovada (§9.4). Nenhum
percentual de precisão é declarado aqui: as evidências reunidas nas duas
rodadas de auditoria não permitem calcular um percentual metodologicamente
defensável (elas misturam divergências cosméticas, deliberadas e casos em
que as próprias fontes sustentam o sistema). O critério de avaliação
adotado é **acurácia material validada contra fontes de origem + regras
de negócio (RN01-RN07) + decisões humanas persistidas e rastreáveis** —
não similaridade textual com o relatório oficial.

### 9.11 Critérios para reabertura desta homologação

Esta homologação deve ser reaberta (nunca silenciosamente ignorada) se:

- O processo SEI 19.20.0001.0000901/2026-01 (§9.9) for consultado e
  revelar que a Base de Ordens Bancárias/Controle DIMCAC estão
  incorretos para 2026OB700001 (nesse caso, o achado passa de
  "indeterminado" para "dado ruim na fonte" ou "bug", conforme o caso).
- Novas gerações (Agosto/2026 em diante, ou Janeiro/2026 quando auditado)
  revelarem um padrão de divergência material **não** enquadrável em
  nenhuma das categorias 9.4–9.8 (ou seja, sem decisão RN07 rastreável,
  sem sustentação de Base OB/Controle, e sem erro identificável do
  oficial).
- Qualquer alteração futura em `motor_decisao.py`, `decisao.py`,
  `escritor_relatorio_transparencia.py` ou nos repositórios de leitura
  (`repositorio_ordens_bancarias.py`/`repositorio_controle_dimcac.py`)
  tocar em qualquer regra citada nesta seção (RN04, RN07, fallback
  Nome→Credor, `intervalo_acumulado`) sem uma nova rodada de auditoria
  equivalente.
- As divergências de grafia não root-causadas (§9.7) ou os padrões
  ainda não verificados individualmente forem, em algum momento,
  investigados e revelarem um bug — a homologação vale para o que foi
  efetivamente verificado, não para o que ficou pendente de verificação.

**Condição já exercida (Sprint 3, HOMO-RT-06)**: a integração de Valor da
Passagem à linha publicável tocou deliberadamente `motor_decisao.py`
(campo inerte `OcorrenciaFinanceira.passagem`, `CAMPOS_EVIDENCIA_MATERIAL`
intocado), `decisao.py` (`_campos_linha_publicavel`, identidade v3→v4) e
`escritor_relatorio_transparencia.py` (coluna J) — o terceiro gatilho
acima. RN01-RN07, fallback Nome→Credor e `intervalo_acumulado` permanecem
semanticamente idênticos (verificado por regressão completa da suíte
homologada + reexecução do pipeline real, RN01-RN07 idêntico antes/depois
de anexar a Planilha de Passagens). Esta nota registra a reabertura; uma
nova rodada de auditoria formal nos moldes de §9.1–9.10, específica para
Valor da Passagem, é recomendada antes do uso em produção.
