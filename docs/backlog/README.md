# Backlog

Itens levantados durante a análise do sistema, mas **fora do escopo já
aprovado** — não implementar sem antes transformar cada item numa Sprint
própria, com as mesmas regras de rastreabilidade usadas em
[`docs/central-conferencia/`](../central-conferencia/README.md): toda regra
nova precisa ser rastreável a uma fórmula real da planilha oficial ou a uma
regra operacional confirmada pelo usuário.

## Evoluções da Central Inteligente de Conferência (Sprint 11 → futuro)

Levantadas durante a engenharia reversa da planilha
([`docs/central-conferencia/`](../central-conferencia/README.md)), mas fora
do escopo já aprovado (CPF + data → checklist de cadastro e duplicidade):

- **Consulta por matrícula** — a aba `Dados!B` já tem a matrícula de cada
  servidor; hoje só o CPF é usado como chave de busca.
- **Consulta por nome** — busca textual/aproximada pelo nome, útil quando o
  servidor não tem o CPF em mãos.
- **Histórico completo de diárias do servidor** — listar todas as linhas de
  `Controle de Diárias` de um CPF, não só checar duplicidade pontual.
- **Consulta por período** — "quais diárias existem entre a data X e a data
  Y", independente de CPF.
- **Identificação automática de CPF a partir do texto de um despacho do
  SEI** — reaproveitando a mesma extração por regex já usada em
  `app/extraction/parsers/sei_parser_v1.py`, mas para conferência avulsa
  (colar o texto de um despacho e já extrair o CPF, sem precisar digitar).
- ~~**Tratamento assistido da exceção "complemento de diária"**~~ —
  **decidido em 2026-07-21 (ver `docs/central-conferencia/` § 0, item 2 e
  RN-08): não haverá nenhum campo estruturado para isso.** A Central só
  informa a duplicidade encontrada; reconhecer um "complemento de diária"
  continua sendo decisão administrativa do DIMCAC, fora do sistema. Mantido
  aqui apenas como registro histórico da pergunta já respondida.
- **Digitalização das colunas `X` (COMPROVANTES) e `Y` (CONFIRMAÇÃO DE
  DIÁRIAS)** — hoje são conferências manuais em texto livre (`"sim"`)
  dentro da própria planilha; poderiam virar parte do checklist informativo
  em uma evolução futura, uma vez que o significado exato de cada uma seja
  confirmado com o DIMCAC — sempre respeitando RN-08 (a Central nunca
  decide, só apresenta informação).
- **Outras regras escondidas nas fórmulas da planilha** não cobertas pelo
  escopo já aprovado (cadastro, duplicidade e janela de processamento) —
  por exemplo o cálculo de valores (`N`, `O`, `Q`, `R`, `S`, `P` —
  RN-03/RN-05 em `docs/central-conferencia/`). `T`/`DMTC`, `U`/`DMOF`
  (RN-09) e `V`/"PASSAR DIA" (RN-06/RN-10) já foram esclarecidas e RN-10 já
  está incorporada à Central. Documentadas para não se perderem.

## Itens herdados dos READMEs de arquitetura de camada (pré-existentes)

Já registrados em [`docs/roadmap/README.md`](../roadmap/README.md#planejado-não-implementado):

- Barramento de eventos / progresso via SSE (`app/events/`).
- Camada de persistência local (`app/infra/db/`).
