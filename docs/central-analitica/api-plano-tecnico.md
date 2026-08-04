# Central Analítica — Plano Técnico da API de Pesquisa e Filtros (Sprint 17.4.2)

> **Sprint 17.4.2 — exclusivamente plano técnico. Nenhuma linha de código
> de produção foi escrita nesta Sprint.** Continuação da Sprint 17.4.1
> (arquitetura da API, aprovada em 2026-07-30,
> `docs/central-analitica/api-arquitetura.md`). Este documento aprofunda a
> arquitetura já aprovada até o nível de assinatura de função, esquema de
> dados intermediário e estratégia de segurança de consulta — ainda sem
> escrever um único `def`, `class Router`, schema Pydantic real ou consulta
> SQL executável. Implementação só começa após aprovação explícita deste
> documento (Sprint 17.4.3 em diante).

## Sumário

- [§ 1 — Regra de imutabilidade da Sprint 17.3](#1--regra-de-imutabilidade-da-sprint-173)
- [§ 2 — Achados técnicos que refinam a arquitetura aprovada](#2--achados-técnicos-que-refinam-a-arquitetura-aprovada)
- [§ 3 — Arquivos a criar](#3--arquivos-a-criar)
- [§ 4 — Segurança de consulta SQL dinâmica](#4--segurança-de-consulta-sql-dinâmica)
- [§ 5 — Fechamento de itens em aberto herdados da 17.4.1](#5--fechamento-de-itens-em-aberto-herdados-da-1741)
- [§ 6 — Testes adicionais identificados nesta etapa](#6--testes-adicionais-identificados-nesta-etapa)
- [§ 7 — Plano de subetapas atualizado](#7--plano-de-subetapas-atualizado)
- [§ 8 — Revisão pós-implementação (Sprint 17.4.4.1)](#8--revisão-pós-implementação-sprint-17441)

---

## § 1 — Regra de imutabilidade da Sprint 17.3

A Base Local em SQLite é infraestrutura homologada (auditoria da Sprint
17.3, veredito "aprovado com ressalvas"). Nenhum arquivo abaixo é alterado
por este plano — toda nova necessidade de leitura é resolvida por um
módulo **novo**, nunca por editar um destes:

- `backend/app/consulta/base_local.py`
- `backend/app/consulta/base_local_sqlite.py`
- `backend/app/infra/db/esquema.py`
- `backend/app/consulta/repositorio_diarias.py`
- `backend/app/consulta/repositorio_servidores.py`
- `backend/app/domain/entities/servidor.py`
- `backend/app/domain/entities/registro_diaria_indexada.py`

Isso inclui, deliberadamente, **reler o resultado de uma sincronização
que este próprio plano acaba de disparar** — nunca fazendo `base_local.py`
devolver mais informação do que já devolve hoje, e sim consultando o
SQLite de novo, de fora, por um módulo próprio (§ 2).

---

## § 2 — Achados técnicos que refinam a arquitetura aprovada

Dois achados de implementação, na mesma categoria já registrada pela
própria Sprint 17.4.1 para os índices ausentes (`api-arquitetura.md § 9`):
**decorrem de olhar o código real com mais profundidade, não são decisões
novas fora de escopo, e são registrados — não resolvidos por uma mudança
na 17.3.**

### 2.1 `sincronizacoes` nunca acumula histórico

`base_local_sqlite.reconstruir()` sempre recria o SQLite num arquivo
temporário novo (`unlink()` se já existir, `sqlite3.connect` num arquivo
inexistente, `criar_esquema` do zero) antes de trocar atomicamente com o
destino. Consequência direta, confirmada por leitura do código: a tabela
`sincronizacoes`, em qualquer `base_local.sqlite` vigente, **tem sempre
exatamente 1 linha** — não é um log histórico, é o retrato só da última
sincronização bem-sucedida. E o campo `status` dessa linha é **sempre
literalmente a string `"sucesso"`** — nunca é gravado nada em caso de
falha (decisão 5 da Sprint 17.1: "falha nunca substitui a base válida",
implementada aqui como "nunca insere nada se falhar").

**Consequência para o contrato já aprovado na 17.4.1:** `GET
/sincronizacao` só consegue reportar, de fato, 3 dos 4 valores do
`status` esboçado na Fase 4 do documento de arquitetura —
`nunca_sincronizado`, `atualizado`, `possivelmente_desatualizado`.
`falha_na_ultima_sincronizacao` **não pode** ser reportado por uma
consulta passiva posterior — só pode aparecer, quando muito, na resposta
imediata do `POST /sincronizacao` que acabou de tentar a operação (§ 2.2).
Registrado aqui como limitação conhecida do esquema atual, com
recomendação de uma sprint futura de ajuste (uma tabela de tentativas,
incluindo falhas) — não resolvido agora, por imutabilidade (§ 1).

### 2.2 Detecção de sucesso/falha do `POST /sincronizacao`

`base_local.sincronizar()` não devolve nenhuma informação sobre o
resultado da etapa de reconstrução do SQLite — qualquer exceção ali é só
logada (`_logger.exception(...)`), nunca propagada, nunca refletida no
valor de retorno (que é só o `Path` da cópia `.xlsx`). Isso já foi
homologado assim na auditoria da 17.3 e não é reaberto aqui (§ 1).

Como consequência, **qualquer detecção de sucesso/falha desta etapa, feita
de fora, é necessariamente uma inferência — nunca uma confirmação
direta.** Este plano propõe basear essa inferência num **conjunto de
sinais**, nunca num único indicador isolado, capturados antes e depois da
chamada a `sincronizar()`:

1. **Existência do arquivo** `base_local.sqlite` antes e depois
   (`Path.exists()`).
2. **Identidade e metadados físicos do arquivo**, quando ele já existia
   antes e continua existindo depois (`os.stat`): `st_ino` (identidade —
   `os.replace` no fluxo homologado publica um arquivo fisicamente novo
   no mesmo caminho), `st_size` e `st_mtime_ns`.
3. **Abertura bem-sucedida em modo somente-leitura via SQLite**, depois
   da chamada — um arquivo corrompido ou parcialmente escrito falharia
   aqui mesmo que os metadados de sistema de arquivos parecessem ter
   mudado.
4. **Leitura e validação dos metadados da própria sincronização**
   (`repositorio_analitico.ultima_sincronizacao()`, § 3) — confirma que a
   linha em `sincronizacoes` é legível e internamente coerente, não só
   que o arquivo abre.

"Sucesso inferido" exige a combinação dos sinais físicos de substituição
**e** uma leitura SQLite subsequente bem-sucedida e coerente. Qualquer
inconsistência entre eles — arquivo aparentemente inalterado, ou alterado
mas ilegível, ou legível mas com metadados que não fecham — é tratada
como "falha inferida", sempre por excesso de cautela, nunca assumindo
sucesso na dúvida (mesmo princípio de "nunca decidir sozinho sem
evidência" já praticado no resto do sistema, RN-08/decisão 8).

**Duas ressalvas que ficam registradas explicitamente, não escondidas:**
- Isto é uma inferência porque `base_local.sincronizar()` não tem, hoje,
  nenhum canal de retorno para o resultado da etapa SQLite — não é
  apresentada como prova definitiva em nenhum lugar deste documento.
- `os.replace` **não** é afirmado como a única operação capaz de alterar
  esses metadados — o que se registra é que, no fluxo atualmente
  homologado, a substituição atômica é o mecanismo **esperado** de
  publicação de uma nova Base Local, e é essa expectativa que o conjunto
  de sinais verifica — não uma exclusividade garantida pelo sistema
  operacional.

**Recomendação para sprint futura** (fora do escopo aqui, por
imutabilidade): estender `base_local.sincronizar()` para também devolver
o resultado da etapa SQLite — mudança aditiva de contrato de função, não
de esquema — eliminaria a necessidade desta inferência por completo.

---

## § 3 — Arquivos a criar

Nenhum destes arquivos é criado nesta Sprint — são o produto planejado
para a 17.4.3 em diante. Assinatura conceitual (tipos, não corpo).

### `app/domain/entities/registro_analitico.py` (novo)
Entidade de negócio reutilizável — uma diária "completa" já traduzida da
linha denormalizada do SQLite, no mesmo espírito de `Diaria`/`Servidor`
já existentes.

```
@dataclass(frozen=True)
class RegistroAnalitico:
    sei: str
    doc_origem: str
    cpf: str
    periodo_inicial: date
    periodo_final: date
    cidade_origem: str | None
    cidade_destino: str | None
    motivo: str
    transporte: str | None
    valor_total_diarias: float | None
    linha_planilha: int          # diagnóstico — decisão 8, nunca chave
    servidor: Servidor | None    # reaproveita app/domain/entities/servidor.py
```
`servidor` é `None` quando todos os campos `servidor_*` da linha são
`NULL` (CPF sem cadastro em `Dados`) — nunca um `Servidor` com todos os
campos vazios (exigência literal do contrato já aprovado, Fase 4 da
17.4.1).

### `app/consulta/repositorio_analitico.py` (novo)
Única camada que fala SQL com `base_local.sqlite`. Reaproveita por
import (não duplica) `SinalFrescor` e `sinal_mudou` de
`base_local_sqlite.py`, e `AvisoLinhaIgnorada` de
`app/domain/entities/aviso_linha_ignorada.py`.

Dataclasses de forma de consulta (mesmo padrão de `ResultadoDiariasCompletas`
morar dentro de `repositorio_diarias.py`, não em `domain/entities/` —
essas são formas de operação, não entidades de negócio reutilizáveis):

```
@dataclass(frozen=True)
class FiltrosDiaria:
    q: str | None
    sei: str | None
    cpf: str | None
    servidor_nome: str | None
    servidor_matricula: str | None
    municipio: str | None
    motivo: str | None
    situacao: str | None
    periodo_inicial: date | None
    periodo_final: date | None

@dataclass(frozen=True)
class ParametrosPaginacao:
    pagina: int
    tamanho_pagina: int

@dataclass(frozen=True)
class ParametrosOrdenacao:
    campo: str   # já traduzido pela whitelist antes de chegar aqui — ver § 4
    ordem: str   # "asc" | "desc"

@dataclass(frozen=True)
class PaginaDeRegistros:
    itens: list[RegistroAnalitico]
    total_itens: int

@dataclass(frozen=True)
class OpcoesFiltro:
    motivos: list[str]
    situacoes: list[str]
    municipios: list[str]

@dataclass(frozen=True)
class PaginaDeAvisos:
    itens: list[AvisoLinhaIgnorada]  # reaproveitado, shape já bate 1:1
    total_itens: int
```

**`OpcoesFiltro`/`PaginaDeAvisos`/`buscar_por_sei`/`opcoes_filtro`/`avisos_paginados`
ainda não existem** — planejados para 17.4.4/17.4.5, fora do escopo da 17.4.3
(consistente com "não antecipar rotas fora do escopo", já registrado no
topo deste módulo no código real).

**`InfoSincronizacao` — implementado como `InfoSincronizacaoResumida`
(revisão pós-implementação, refletindo o que foi de fato aprovado):**

```
@dataclass(frozen=True)
class InfoSincronizacaoResumida:
    sincronizado_em: str
    total_avisos: int
```

Versão **mínima** (decisão do usuário, 2026-07-30, durante a implementação
da 17.4.3): só timestamp + contagem de avisos, lidos direto da tabela
`sincronizacoes`/`avisos_sincronizacao` — **sem** `origem`,
`linhas_diarias`, `linhas_servidores_lidos`, `linhas_ignoradas` nem
`sinal_frescor: SinalFrescor`. Não há comparação ao vivo contra a
Planilha Oficial nesta Sprint — isso, junto dos campos omitidos aqui,
fica para a Sprint 17.4.6 (endpoint dedicado de sincronização), que
estende este contrato de forma aditiva, nunca o substitui.

Funções (todas abrem e fecham sua própria conexão, curta, por chamada —
critério de performance já herdado da 17.4.1):

```
def listar_diarias(caminho_sqlite: Path, filtros: FiltrosDiaria,
                    paginacao: ParametrosPaginacao,
                    ordenacao: ParametrosOrdenacao) -> PaginaDeRegistros: ...

def ultima_sincronizacao(caminho_sqlite: Path) -> InfoSincronizacaoResumida: ...
    # nunca devolve None — se a tabela `sincronizacoes` existir sem
    # nenhuma linha (situação que a reconstrução homologada nunca produz,
    # mas um arquivo adulterado por fora do fluxo poderia), levanta
    # sqlite3.DatabaseError, tratado como Base Local inválida pelo service

def _conectar_somente_leitura(caminho_sqlite: Path) -> sqlite3.Connection: ...
    # sqlite3.connect(f"{caminho.resolve().as_uri()}?mode=ro", uri=True)
    # .resolve().as_uri() — não uma f-string ingênua — é necessário para
    # um caminho Windows (C:\...) virar uma URI file:///C:/... válida

def _montar_where(filtros: FiltrosDiaria) -> tuple[str, list]: ...
    # único ponto de montagem de SQL dinâmico — ver § 4

COLUNAS_ORDENACAO: dict[str, str]  # whitelist campo público -> coluna real
```

`buscar_por_sei`, `opcoes_filtro` e `avisos_paginados` (Sprint 17.4.4/17.4.5)
ainda não existem neste módulo — só o necessário para `GET /diarias`.

### `app/services/analitica_service.py` (novo)
Orquestração + exceções próprias — nunca importa `conferencia_service`
nem `app/domain/rules/conferencia.py` (decisão 9, único compartilhamento
é `app/consulta/`).

**Revisão pós-auditoria da 17.4.3:** este módulo é o dono dos tipos de
parâmetro/resultado que a API consome — `FiltrosDiaria`,
`ParametrosPaginacao`, `ParametrosOrdenacao` (mesmos campos dos tipos
homônimos de `repositorio_analitico.py`, mas definidos aqui como o
contrato público do serviço). `app/api/analitica.py` nunca importa de
`app.consulta.*`; `pesquisar_diarias` traduz para os tipos internos do
repositório na fronteira, sem alterar nenhum campo, valor ou regra —
único propósito é impedir a camada HTTP de depender de tipos do
repositório.

```
@dataclass(frozen=True)
class FiltrosDiaria:            # dono: este módulo, não repositorio_analitico
    q: str | None = None
    sei: str | None = None
    cpf: str | None = None
    servidor_nome: str | None = None
    servidor_matricula: str | None = None
    municipio: str | None = None
    motivo: str | None = None
    situacao: str | None = None
    periodo_inicial: date | None = None
    periodo_final: date | None = None

@dataclass(frozen=True)
class ParametrosPaginacao:
    pagina: int
    tamanho_pagina: int

@dataclass(frozen=True)
class ParametrosOrdenacao:
    campo: str
    ordem: str

class BaseAnaliticaIndisponivel(Exception): ...
class RegistroNaoEncontrado(Exception): ...
class SincronizacaoEmAndamento(Exception): ...

_lock = threading.Lock()   # nível de módulo — processo único, ver § 5

def pesquisar_diarias(filtros: FiltrosDiaria, paginacao: ParametrosPaginacao,
                       ordenacao: ParametrosOrdenacao) -> ResultadoPesquisa: ...
    # traduz para repositorio_analitico.FiltrosDiaria/ParametrosPaginacao/
    # ParametrosOrdenacao antes de chamar listar_diarias/ultima_sincronizacao
def detalhar_diaria(sei: str) -> DiariaDetalhada: ...
def obter_opcoes_filtro() -> OpcoesFiltro: ...
def estado_sincronizacao() -> EstadoSincronizacao: ...
def executar_sincronizacao_manual() -> ResumoExecucao: ...
def listar_avisos_sincronizacao(paginacao) -> PaginaDeAvisos: ...
```

`executar_sincronizacao_manual()` é a função mais sensível deste plano —
sequência obrigatória:

1. `if not _lock.acquire(blocking=False): raise SincronizacaoEmAndamento(...)`
2. `try:` — **envolvendo literalmente tudo que segue**, para o lock nunca
   ficar travado permanentemente numa falha precoce (ex.: planilha
   oficial não configurada, levantada antes mesmo de chamar
   `sincronizar()`):
   - captura os sinais "antes" (§ 2.2);
   - resolve o caminho via `configuracao_app.resolver_caminho_para_preenchimento()`
     (pode levantar `PlanilhaOficialIndisponivel`);
   - chama `base_local.sincronizar(caminho)` — função intocada da 17.3;
   - captura os sinais "depois" e aplica a inferência de sucesso/falha
     (§ 2.2);
   - monta o `ResumoExecucao` (campos de contagem `None` no caminho de
     falha inferida — não há dado real a reportar).
3. `finally: _lock.release()`.

`estado_sincronizacao()` reaproveita por import
`base_local_sqlite.capturar_sinal_frescor` e `sinal_mudou` — nunca
reimplementa a comparação. Se a Planilha Oficial não estiver
configurada/acessível no momento da chamada (então não dá para calcular
o sinal "atual"), `possivelmente_desatualizado` é reportado como `true`
por segurança — nunca assumir frescor sem conseguir provar.

### `app/schemas/analitica.py` (novo)
Pydantic — request/response. Não reaproveita nenhuma classe de
`schemas/conferencia.py` (decisão 9); reaproveita só o **padrão**
(`model_validator(mode="after")` para invariantes cruzando campos, mesmo
estilo de `RequisicaoConferencia`).

```
class ParametrosPesquisaDiariasQuery(BaseModel):
    q: str | None = None
    sei: str | None = None
    cpf: str | None = None
    servidor_nome: str | None = None
    servidor_matricula: str | None = None
    municipio: str | None = None
    motivo: str | None = None
    situacao: str | None = None
    periodo_inicial: date | None = None
    periodo_final: date | None = None
    pagina: int = 1                 # >= 1
    tamanho_pagina: int = 25        # 1..100
    ordenar_por: str = "periodo"    # restrito à whitelist, ver § 4
    ordem: Literal["asc", "desc"] = "desc"
    # model_validator(mode="after"): período final >= inicial quando os dois
    # informados; ordenar_por precisa estar na whitelist (422 caso contrário)

class ServidorAnaliticoResposta(BaseModel):
    # matricula/situacao — implementado como `str | None` (revisão
    # pós-implementação, Sprint 17.4.4.1, ver § 8): rascunho original
    # deste plano previa `str` obrigatório; decisão revista e aprovada
    # para `str | None` por escolha arquitetural defensiva.
    nome: str; cargo: str; previdencia: str; matricula: str | None; situacao: str | None

class PeriodoResposta(BaseModel):
    inicial: date; final: date

class TrechoResposta(BaseModel):
    origem: str | None; destino: str | None

class DiariaResumoResposta(BaseModel):
    sei: str; periodo: PeriodoResposta; destino: str | None
    servidor: ServidorResumoResposta | None   # {nome, matricula}
    motivo: str; valor_total_diarias: float | None

class DiariaCompletaResposta(BaseModel):
    # tudo do resumo, mais:
    doc_origem: str; cpf: str; trecho: TrechoResposta
    transporte: str | None
    servidor: ServidorAnaliticoResposta | None   # completo
    referencia_administrativa: ReferenciaAdministrativaResposta  # {linha_planilha}
    sincronizacao: EstadoSincronizacaoResposta

class PaginacaoResposta(BaseModel):
    pagina_atual: int; tamanho_pagina: int; total_itens: int; total_paginas: int

class ResultadoPesquisaResposta(BaseModel):
    itens: list[DiariaResumoResposta]
    paginacao: PaginacaoResposta
    sincronizacao: EstadoSincronizacaoResposta

class OpcoesFiltroResposta(BaseModel):
    motivos: list[str]; situacoes: list[str]; municipios: list[str]

class EstadoSincronizacaoResposta(BaseModel):
    sincronizado_em: datetime | None
    origem: str | None
    possivelmente_desatualizado: bool
    total_avisos: int
    status: Literal["nunca_sincronizado", "atualizado", "possivelmente_desatualizado"]
    # "falha_na_ultima_sincronizacao" NÃO aparece aqui — só em ExecucaoSincronizacaoResposta (§ 2.1)

class ExecucaoSincronizacaoResposta(BaseModel):
    status: Literal["sucesso", "falha"]
    sincronizado_em: datetime | None       # None se status == "falha"
    linhas_diarias: int | None
    linhas_servidores_lidos: int | None
    linhas_ignoradas: int | None
    total_avisos: int | None

class AvisoSincronizacaoResposta(BaseModel):
    aba: str; linha: int; motivo: str

class PaginaAvisosResposta(BaseModel):
    itens: list[AvisoSincronizacaoResposta]
    paginacao: PaginacaoResposta
```

### `app/api/analitica.py` (novo)
`APIRouter(prefix="/api/v1/analitica", tags=["analitica"])`. Mesmo padrão
de `conferencia.py`/`planilha.py`: `try/except` manual, rota por rota,
mapeando exceção de domínio → `HTTPException(status_code=N,
detail=str(erro))` — string simples, confirmado como o padrão já usado
nas 3 rotas existentes (§ 5).

Seis rotas, exatamente as já aprovadas na 17.4.1: `GET /diarias`, `GET
/diarias/{sei}`, `GET /opcoes-filtro`, `GET /sincronizacao`, `POST
/sincronizacao`, `GET /sincronizacao/avisos`.

### `app/main.py` (editar, não criar)
Duas linhas: `from app.api import analitica` no import existente
(linha 4) e `app.include_router(analitica.router)` junto dos demais
(linhas 15-19).

---

## § 4 — Segurança de consulta SQL dinâmica

`GET /diarias` combina até 10 filtros opcionais (§ 3) — a montagem da
cláusula `WHERE` precisa ser dinâmica. Regras obrigatórias para
`_montar_where`:

1. **Todo valor do usuário entra como parâmetro (`?`), nunca
   concatenação/f-string.** Uma lista de fragmentos SQL fixos
   (escolhidos por `if filtros.X is not None: condicoes.append("coluna = ?")`)
   e uma lista paralela de valores, unidas com `" AND ".join(...)`.

2. **`ORDER BY` e nomes de coluna nunca vêm de um parâmetro `?`** — placeholders
   só valem para valores, não para identificadores SQL. `ordenar_por` do
   usuário é sempre traduzido por `COLUNAS_ORDENACAO` (dicionário fixo no
   código, § 3) antes de entrar na consulta; `ordem` é mapeado para o
   literal `"ASC"`/`"DESC"` por `if`/`else` explícito, nunca ecoado. Isso
   também satisfaz de graça o princípio já aprovado de o vocabulário
   público não espelhar nome de coluna físico (Fase 4 da 17.4.1).

3. **`LIKE` com termo do usuário precisa escapar `%`, `_` e `\`** (`ESCAPE
   '\'` na cláusula) — usado em `servidor_nome`/`municipio` (correspondência
   parcial). Sem isso, um `_` digitado pelo usuário casa com "qualquer
   caractere" (bug de resultado incorreto, não de injeção).

4. **Limitação conhecida, registrada e não resolvida agora:** `LIKE` do
   SQLite só é case-insensitive nativamente para ASCII A-Z, não para
   acentos (`Á`/`á`, `Ç`/`ç`) — comuns em nomes de servidores e
   municípios brasileiros. Não há correção barata sem extensão ICU, fora
   do padrão do driver. Mesmo critério já aplicado aos índices ausentes
   na 17.4.1 — achado registrado, sem otimização/correção prematura.

5. **Conexão sempre somente-leitura** (`mode=ro` na URI de conexão) — reforça
   em código, não só em disciplina de revisão, a decisão "API é
   somente-leitura sobre a Base Local" (§ 0 da 17.4.1).

6. **Validação de forma (página ≥ 1, tamanho de página ≤ 100, `ordenar_por`
   na whitelist, período final ≥ inicial) acontece antes do SQL**, via
   `Query(...)`/`model_validator` em `ParametrosPesquisaDiariasQuery` — nunca
   dentro de `repositorio_analitico.py`.

---

## § 5 — Fechamento de itens em aberto herdados da 17.4.1

| Item em aberto (`api-arquitetura.md`) | Resolução nesta etapa |
| --- | --- |
| Formato de erro (string simples vs. lista estruturada) | **Confirmado, sem inconsistência real a resolver.** As 3 rotas existentes (`conferencia`, `planilha`, `configuracao`) já usam uniformemente `detail=str(erro)` para exceções de domínio — a "discrepância" suspeitada não existe no código real, só a validação automática do Pydantic (fora do controle da rota) produz lista estruturada. Esta API segue exatamente o mesmo padrão: `detail=str(erro)` manual + lista estruturada automática só quando o próprio Pydantic recusa a forma da requisição. |
| Mecanismo de detecção de sincronização concorrente | **Resolvido:** `threading.Lock()` de módulo em `analitica_service.py`, não-bloqueante (`acquire(blocking=False)`). Premissa explícita: o backend roda como **processo único** (Uvicorn local, subido pelo Electron, confirmado em `docs/architecture/README.md`) — um lock em memória é suficiente porque não há múltiplos workers hoje. Deixaria de proteger se isso mudasse no futuro; registrado como premissa, não como garantia universal. |
| Exposição de CPF em listagens paginadas | **Parcialmente mitigado pelo próprio contrato já aprovado, não por uma decisão nova aqui:** `DiariaResumoResposta` (usada em `GET /diarias`, potencialmente muitos registros por página) **não inclui `cpf`** — só `servidor.nome`/`servidor.matricula`. O CPF só aparece em `DiariaCompletaResposta` (`GET /diarias/{sei}`, um registro por vez, mediante busca ativa) — mesma exposição, registro a registro, que a Central de Conferência já pratica hoje. Ainda fica em aberto se `nome`/`matrícula` em listagem (não CPF) precisam de algum tratamento adicional — pergunta residual para o DIMCAC, não resolvida aqui. |

---

## § 6 — Testes adicionais identificados nesta etapa

Extensão da estratégia já definida na 17.4.1 (`api-arquitetura.md`,
seção "Estratégia de testes") — cenários que só ficaram visíveis ao
descer ao nível de assinatura de função:

- **Inferência de sucesso/falha por múltiplos sinais (§ 2.2):** caminho de
  sucesso real (todos os sinais — inode, tamanho, mtime, leitura SQLite —
  mudam de forma coerente) e caminho de falha simulada (via `monkeypatch`
  forçando exceção na etapa SQLite de `base_local.sincronizar()`, mesmo
  padrão já usado nos testes da 17.3, confirmando que nenhum sinal físico
  indica substituição e que `status="falha"` é corretamente inferido).
- **Lock não trava permanentemente** quando a resolução do caminho da
  Planilha Oficial falha *antes* de `sincronizar()` ser chamado — o
  `finally` precisa liberar o lock mesmo nesse caminho de erro precoce.
- **Escaping de `LIKE`** — termo de busca contendo `_` não deveria casar
  com qualquer caractere no lugar dele.
- **`GET /sincronizacao` nunca reporta o 4º estado** (§ 2.1) — teste
  negativo confirmando que `falha_na_ultima_sincronizacao` não é um
  valor alcançável por essa rota, só por `POST /sincronizacao`.

---

## § 7 — Plano de subetapas atualizado

| Sub-etapa | Entrega | Depende de | Status |
| --- | --- | --- | --- |
| 17.4.1 | Arquitetura da API — **concluída, aprovada 2026-07-30** | — | Homologada |
| 17.4.2 | Este plano técnico | 17.4.1 | Homologada |
| 17.4.3 | Implementação de `GET /diarias` (repositório + service + rota + schemas correspondentes) | 17.4.2 aprovado | **Homologada 2026-07-31** |
| 17.4.4 | Implementação de `GET /diarias/{sei}` | 17.4.2 aprovado | **Homologada 2026-07-31**, com correção 17.4.4.1 (§ 8) |
| 17.4.5 | Implementação de `GET /opcoes-filtro` | 17.4.2 aprovado | **Homologada 2026-07-31**, com correção 17.4.5.1 (teste de consistência cruzada, renomeação de função de rota, docstring de `analitica_service.py`) |
| 17.4.6 | Implementação de `GET`/`POST /sincronizacao` + `GET /sincronizacao/avisos` (inclui o mecanismo de inferência e o lock) | 17.4.2 aprovado | **Homologada 2026-07-31**, com correção 17.4.6.1 (parâmetro `origem` de `base_local.sincronizar()`, testes de múltiplas linhas em `sincronizacoes` e do branch 503 pós-sinal-físico, logging da comparação de frescor) |
| 17.4.7 | Testes de contrato/regressão + auditoria técnica (revisão de consolidação da Sprint 17.4 inteira) | 17.4.3–17.4.6 | **Homologada 2026-07-31** — veredito "aprovada com ressalvas" (ver § 9) |
| 17.4.7.1 | Correções finais da auditoria da 17.4.7 | 17.4.7 | **Homologada 2026-07-31**, com correção 17.4.7.1 (dedup de `_contar_avisos` em `avisos_paginados`, renomeação de `listar_avisos_de_sincronizacao` para `consultar_avisos_de_sincronizacao`, atualização deste documento e de `api-arquitetura.md`) |

Cada uma das sub-etapas 17.4.3–17.4.6 segue, individualmente, o mesmo
ciclo já usado na Sprint 17.3: plano de implementação (`EnterPlanMode`)
→ aprovação → código → testes.

---

## § 9 — Revisão de consolidação (Sprint 17.4.7) e correções (17.4.7.1)

Auditoria técnica final da Sprint 17.4 inteira, mesmo padrão de rigor já
usado na auditoria da Sprint 17.3 — reexecução de `test_repositorio_
analitico.py`, `test_api_analitica.py` e da suíte completa do backend
(444 testes, 0 regressões), mais verificação por leitura de código de 8
pontos: reuso de `_contar_avisos`, impacto da renomeação de rota,
consistência de `api-arquitetura.md` com a implementação e com este
documento, cobertura da docstring de `analitica_service.py` sobre os 3
padrões de posse de tipos, e ausência de mudança em regra de negócio,
contrato HTTP ou SQL funcional.

**Veredito: aprovada com ressalvas.** As únicas não conformidades
encontradas foram documentais — as tabelas de subetapas de
`api-arquitetura.md` e deste documento ainda marcavam 17.4.7 como "não
iniciada", contradizendo referências já feitas à revisão de consolidação
em outros pontos do próprio `api-arquitetura.md`. Nenhum código, teste,
contrato HTTP, regra de negócio ou consulta SQL precisou de correção.

**Correções aplicadas nesta sub-etapa (17.4.7.1):**

1. **Eliminação de duplicação de SQL** — `avisos_paginados`
   (`app/consulta/repositorio_analitico.py`) passou a reaproveitar
   `_contar_avisos`, a mesma função já usada por `ultima_sincronizacao` e
   `estado_sincronizacao_registrado`, em vez de repetir o `SELECT
   COUNT(*) FROM avisos_sincronizacao`.
2. **Padronização de nomenclatura** — a função de rota de `GET
   /sincronizacao/avisos` foi renomeada de `listar_avisos_de_
   sincronizacao` para `consultar_avisos_de_sincronizacao`, mesmo padrão
   verbo-da-rota-nunca-repete-verbo-do-service já usado em
   `consultar_opcoes_filtro`/`obter_opcoes_filtro` e
   `consultar_estado_sincronizacao`/`estado_sincronizacao`. Rota,
   método HTTP, `response_model` e comportamento observável não mudaram.
3. **Atualização de `api-arquitetura.md`** — tabela de subetapas
   corrigida para eliminar a contradição interna apontada pela
   auditoria (§ 7 acima e `api-arquitetura.md`, seção "Plano de
   subetapas da Sprint 17.4").
4. **Atualização da docstring de `analitica_service.py`** — sem mudança
   de conteúdo normativo, só confirmação de que os 3 padrões de posse de
   tipos já documentados continuam corretos após as sub-etapas 17.4.6/
   17.4.7.

Nenhuma alteração de código de produção foi necessária nesta sub-etapa
além da renomeação de função descrita no item 2 (mesmo arquivo, mesma
rota, mesmo comportamento).

Nenhum código foi escrito nesta Sprint. Aguardando aprovação explícita
antes de iniciar a Sprint 17.4.3.

---

## § 8 — Revisão pós-implementação (Sprint 17.4.4.1)

A implementação de `GET /diarias/{sei}` (Sprint 17.4.4) passou por
auditoria técnica, que aprovou a rota com ressalvas. Uma delas — o tipo
de `matricula`/`situacao` no contrato de resposta do servidor — foi
resolvida nesta sub-etapa (17.4.4.1), formalizando uma decisão que já
estava no código, mas não registrada em documento aprovado.

**✅ Decisão oficial (2026-07-31, Sprint 17.4.4.1) — `matricula` e
`situacao` são `str | None` em `ServidorAnaliticoResposta`
(`DiariaCompletaResposta.servidor`), não `str` obrigatório como o
rascunho original deste plano (§ 3) previa.**

- **Motivo: escolha arquitetural defensiva**, não uma inferência sobre o
  que o pipeline de sincronização produz hoje. `matricula`/`situacao` são
  colunas independentes e opcionais no esquema SQLite (`app/infra/db/
  esquema.py`, Sprint 17.3, imutável — § 1 deste documento) — nada nesse
  esquema garante que estarão sempre preenchidas quando `servidor_nome`
  existir, nem hoje nem numa fonte de dados futura. Tratar os dois campos
  como obrigatórios acopla o contrato da API a um comportamento apenas
  observado no pipeline atual (`repositorio_servidores.py`), não a uma
  garantia do esquema — o tipo `str | None` tolera dado incompleto sem
  quebrar a resposta, tanto hoje quanto se a origem dos dados mudar.
- **Não é justificada pela alegação de que o fluxo atual produz `NULL`.**
  A auditoria da Sprint 17.4.4 verificou que isso não estava confirmado; a
  decisão não depende dessa alegação e continua correta mesmo que o
  pipeline atual nunca produza `NULL` para esses campos — a garantia que
  importa é a do esquema (coluna nula permitida), não a do código de
  leitura de hoje.
- **Sem mudança de comportamento da rota:** `GET /diarias/{sei}` já
  implementava `str | None` desde a Sprint 17.4.4; esta sub-etapa só
  formaliza a decisão em documento e adiciona a cobertura de teste que
  faltava (servidor com matrícula/situação ausente ou vazia).
- **Escopo desta decisão:** só `ServidorAnaliticoResposta`
  (detalhamento). `ServidorResumoResposta` (listagem, `GET /diarias`) não
  é afetada — continua só `{nome, matricula}`, sem `situacao`, decisão
  independente já fechada na 17.4.1.
