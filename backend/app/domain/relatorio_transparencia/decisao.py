"""Micro-sprint 3C — decisão humana sobre casos REVISAO_NECESSARIA (RN01
via RN02/RN04/RN07), persistência auditável dessa decisão, e aplicação
dela sobre a saída do motor da 3B (`motor_decisao.classificar`). Ainda sem
UI/IPC/XLSX final — só o modelo de dados e a lógica pura de aplicação
(`docs/relatorio-transparencia/README.md` § 6, G05/G06).

Função pura, sem I/O — quem lê/escreve a decisão persistida é sempre
`app/consulta/persistencia_decisoes.py`, nunca este módulo. Este módulo
nunca reimplementa RN01-RN07: consome `ResultadoRelatorio` da 3B tal como
está, nunca reclassifica nada por conta própria."""

from collections import defaultdict
from collections.abc import Callable, Iterable
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from decimal import Decimal
from enum import Enum
import hashlib
import json

from app.domain.relatorio_transparencia.linha_publicavel import (
    nome_publicado,
    valor_do_controle_com_fallback,
    valor_passagem_publicavel,
)
from app.domain.relatorio_transparencia.motor_decisao import (
    CAMPOS_EVIDENCIA_MATERIAL,
    CandidatoNormal,
    DiagnosticoRepeticaoFisica,
    OcorrenciaFinanceira,
    ResultadoRelatorio,
    RevisaoNecessaria,
)
from app.domain.relatorio_transparencia.normalizacao_trecho import normalizar_trecho
from app.domain.relatorio_transparencia.quantidade_diarias import resolver_quantidade_diarias

__all__ = [
    "AcaoDecisao",
    "EstadoRevisao",
    "DecisaoHumana",
    "CategoriaNaoPublicada",
    "OcorrenciaNaoPublicavel",
    "RevisaoComEstado",
    "ResultadoRevisado",
    "ContextoRevisaoParaExibicao",
    "identidade_grupo",
    "identidades_ocorrencias",
    "calcular_fingerprint",
    "registrar_decisao",
    "aplicar_decisoes",
    "contexto_para_exibicao",
]

_SEPARADOR_CAMPO = "\x1f"  # unit separator — usado só por `identidade_grupo` abaixo

_VERSAO_IDENTIDADE_OCORRENCIA = "v4"
"""Confronto QA Codex / HOMO-RT-04, item 14 (v2), avançada para v3 pela
correção HOMO-RT-05, e para v4 pela Sprint 3 (HOMO-RT-06, plano "Valor da
Passagem no XLSX Oficial"): mesmo padrão já estabelecido — sempre que o
CONJUNTO de campos de `_campos_linha_publicavel` muda (aqui, a adição de
`valor_passagem_publicado`/`valor_passagem_bloqueia_geracao`), a versão é
incrementada, para que nenhuma identidade gravada sob `v3` colida
textualmente com `v4` — `aplicar_decisoes` nunca reaplica uma decisão v3
às cegas sobre uma ocorrência cuja linha publicável agora inclui Valor da
Passagem; cai no mesmo caminho de ambiguidade que qualquer formato
anterior, exigindo nova decisão humana. Prefixo de versão do formato de
`identidades_ocorrencias` para repetição física — nunca omitido, mesmo que o
hash sozinho já fosse improvável de colidir com formatos anteriores. Gerações
anteriores (nenhuma delas usa o prefixo ATUAL, então nunca podem ser
confundidas com a atual por coincidência de formato): OB pura (antes de
HOMO-RT-02), `"{ob}#{N}"` posicional (HOMO-RT-02 — instável a reordenação),
`"{ob}#{hash}"` sem versão (HOMO-RT-03 — canonicalização por delimitador
vulnerável a colisão estrutural), `"{ob}#v2:{hash}"` (HOMO-RT-04 —
canonicalização JSON estrutural, mas sem os campos da LINHA PUBLICÁVEL —
Nome efetivo/Cargo efetivo/Transporte efetivo/Quantidade de Diárias
efetiva, ver `_campos_linha_publicavel` abaixo — corrigido em HOMO-RT-05),
`"{ob}#v3:{hash}"` (HOMO-RT-05 — linha publicável completa, mas sem Valor da
Passagem, que ainda não existia como campo publicável — corrigido aqui,
HOMO-RT-06). `aplicar_decisoes` já rejeita qualquer `obs_publicaveis` que
não bata com NENHUMA identidade atual (ambiguidade → `REQUER_NOVA_DECISAO`);
o prefixo torna essa proteção estrutural — nenhum formato anterior pode
colidir textualmente com `f"{ob}#{_VERSAO_IDENTIDADE_OCORRENCIA}:{hash}"`,
em vez de depender só da improbabilidade estatística. Uma decisão gravada
sob `v3` (linha publicável sem Valor da Passagem, mas estruturalmente
segura) nunca coincide textualmente com uma identidade `v4` — cai no mesmo
caminho de ambiguidade que qualquer formato anterior, exigindo nova decisão
humana (nunca reaplicada às cegas)."""


class AcaoDecisao(str, Enum):
    """Vocabulário mínimo que representa qualquer decisão sobre N
    ocorrências sem modelar "lado esquerdo/lado direito": `PUBLICAR` sempre
    vem acompanhado de `obs_publicaveis` (pode ser todas, algumas ou
    nenhuma — "nenhuma" é uma decisão real, distinta de adiar). `ADIAR`
    nunca publica nada e mantém a revisão bloqueando a geração."""

    PUBLICAR = "publicar"
    ADIAR = "adiar"


class EstadoRevisao(str, Enum):
    """PENDENTE: nunca decidida. DECIDIDA: decisão `PUBLICAR` válida e com
    fingerprint batendo com a evidência atual — reaproveitável sem
    reperguntar. ADIADA: decisão explícita de adiar — mantém bloqueio
    (nunca confundida com DECIDIDA). DESATUALIZADA: existe decisão para
    este grupo, mas a evidência mudou desde então — nunca reaplicada
    cegamente, volta a bloquear como se fosse nova. REQUER_NOVA_DECISAO
    (HOMO-RT-02, formato de identidade redesenhado em HOMO-RT-03): existe
    decisão `PUBLICAR` com fingerprint batendo, mas o grupo tem repetição
    física de OB (I11/RN04) e `obs_publicaveis` não corresponde a NENHUMA
    identidade atual das ocorrências do grupo — cobre tanto o formato "OB
    pura" (anterior a HOMO-RT-02) quanto o formato posicional `"{ob}#{N}"`
    (HOMO-RT-02, abandonado em HOMO-RT-03 por depender de posição/ordem,
    nunca do formato atual baseado em hash de conteúdo). Em qualquer um
    desses casos é ambíguo qual ocorrência física a decisão pretendia
    publicar. Nunca reinterpretada automaticamente como "publicar todas":
    volta a bloquear como se fosse nova, preservando a decisão antiga em
    `RevisaoComEstado.decisao` só para rastreabilidade/histórico (nunca
    descartada)."""

    PENDENTE = "pendente"
    DECIDIDA = "decidida"
    ADIADA = "adiada"
    DESATUALIZADA = "desatualizada"
    REQUER_NOVA_DECISAO = "requer_nova_decisao"


@dataclass(frozen=True)
class DecisaoHumana:
    """Uma decisão humana sobre um grupo de revisão — nunca inferida
    automaticamente (G04). `identidade_grupo` e `fingerprint_evidencias`
    são sempre calculados por `registrar_decisao`, nunca escritos à mão
    por quem chama (evita divergência entre o que foi persistido e o que
    o motor recalcularia)."""

    identidade_grupo: str
    regra: str
    obs_envolvidas: frozenset[str]
    fingerprint_evidencias: str
    acao: AcaoDecisao
    autor: str
    decidido_em: datetime
    obs_publicaveis: frozenset[str] = field(default_factory=frozenset)
    observacao: str | None = None
    # Sprint D.1 (QA manual — "decisão anterior reaplicada invisível") —
    # a competência para a qual esta decisão foi ORIGINALMENTE tomada.
    # `None` para toda decisão persistida ANTES desta correção (formato
    # legado — nunca reescrito, nunca inferido retroativamente: ver
    # `persistencia_decisoes._decisao_de_dict`). `aplicar_decisoes` compara
    # isto com a competência sendo preparada AGORA para distinguir "decidido
    # nesta execução" de "decisão de execução anterior reaplicada" — sem
    # isso, as duas eram indistinguíveis para quem revisa (achado real do
    # QA: SEVERINO/LEANDRO)."""
    ano_exercicio: int | None = None
    mes_referencia: int | None = None
    # Sprint D.1 (P2, cobertura parcial E-Fisco) — a data de cobertura
    # comprovada (`DiagnosticoQualidadeEfisco.cobertura_paga_ate`) em vigor
    # NO MOMENTO desta decisão; `None` quando decidida sob cobertura
    # completa (ou por uma versão anterior a este campo). Permite a
    # `aplicar_decisoes` invalidar (`DESATUALIZADA`) uma decisão tomada
    # sobre um universo parcial se a cobertura real avançar depois —
    # mesmo que o fingerprint do grupo, por si só, não tenha mudado.
    cobertura_efisco_ate: date | None = None


class CategoriaNaoPublicada(str, Enum):
    """Sprint 4 (plano "XLSX Operacional de Diárias Não Publicadas") — as
    DUAS categorias já homologadas, nenhuma terceira inventada (ver
    docstring de `OcorrenciaNaoPublicavel` abaixo para a distinção exata).
    ADIAR/PENDENTE/DESATUALIZADA/REQUER_NOVA_DECISAO nunca produzem
    `OcorrenciaNaoPublicavel` — só uma revisão efetivamente `DECIDIDA`
    (`PUBLICAR` com fingerprint válido) chega a este ponto do código."""

    NAO_PUBLICADA_POR_DECISAO_HUMANA = "nao_publicada_por_decisao_humana"
    DUPLICATA_FISICA_IDENTICA_SUPRIMIDA = "duplicata_fisica_identica_suprimida"


@dataclass(frozen=True)
class OcorrenciaNaoPublicavel:
    """Uma ocorrência que não entrou no XLSX oficial apesar de a revisão do
    seu grupo estar `DECIDIDA` — nunca desaparece: continua rastreável
    aqui, com a decisão que a excluiu e a categoria exata do motivo.

    `categoria` é calculada exatamente onde este dataclass já era
    construído (Sprint 4 rotula o que `aplicar_decisoes` já sabia, nunca
    recalcula nada em paralelo — mesmo princípio de NOVO-RT-08: uma única
    fonte de verdade, nunca duas listas/loops divergentes):
    - `NAO_PUBLICADA_POR_DECISAO_HUMANA`: a identidade desta ocorrência não
      está em `decisao.obs_publicaveis` — o usuário nunca selecionou esta
      identidade (inclui "publicar zero": `obs_publicaveis` vazio faz TODA
      ocorrência do grupo cair aqui, nunca em duplicata suprimida).
    - `DUPLICATA_FISICA_IDENTICA_SUPRIMIDA`: a identidade FOI selecionada,
      mas já existe outra ocorrência física com a MESMA identidade
      publicada antes desta no mesmo grupo (I11a — identidade idêntica,
      nunca há base lógica para distinguir qual das duas é "a
      representante") — publicar as duas duplicaria o mesmo pagamento no
      relatório, então só a primeira em ordem de iteração é publicada; as
      demais caem aqui, nunca como se o usuário as tivesse rejeitado
      individualmente."""

    ocorrencia: OcorrenciaFinanceira
    decisao: DecisaoHumana
    categoria: CategoriaNaoPublicada
    # Sprint D.1 — mesma flag de `RevisaoComEstado`, copiada aqui no momento
    # em que `aplicar_decisoes` já sabe a resposta (nunca recalculada em
    # paralelo, mesmo princípio de `categoria` acima): permite ao escritor
    # de Diárias Não Publicadas (`escritor_relatorio_nao_publicadas.py`)
    # marcar a linha sem falsificar responsável/timestamp — o autor e a
    # data continuam sendo os da decisão ORIGINAL, sempre.
    reaplicada_de_execucao_anterior: bool = False


@dataclass(frozen=True)
class RevisaoComEstado:
    revisao: RevisaoNecessaria
    estado: EstadoRevisao
    decisao: DecisaoHumana | None = None
    # Sprint D.1 — `True` quando `decisao` já existia ANTES desta chamada de
    # `aplicar_decisoes` ter sido feita para OUTRA competência (comparação
    # de `decisao.ano_exercicio`/`mes_referencia` contra a competência
    # atual, ver `aplicar_decisoes`) — nunca para decisões sem essa
    # informação por serem anteriores a este campo, tratadas como
    # reaplicadas por segurança (não dá pra provar que foram "agora").
    # Sempre `False` quando `decisao is None` (nada a reaplicar).
    reaplicada_de_execucao_anterior: bool = False


@dataclass(frozen=True)
class ResultadoRevisado:
    """Saída da Micro-sprint 3C: `ResultadoRelatorio` (3B) + decisões
    persistidas válidas, aplicadas. `candidatos_publicaveis` sempre
    contém, no mínimo, todos os `candidatos_normais` originais da 3B
    (decisão humana nunca remove um candidato normal — só resolve
    revisões)."""

    candidatos_publicaveis: list[CandidatoNormal] = field(default_factory=list)
    ocorrencias_nao_publicaveis: list[OcorrenciaNaoPublicavel] = field(default_factory=list)
    revisoes: list[RevisaoComEstado] = field(default_factory=list)
    diagnosticos_repeticao_fisica: list[DiagnosticoRepeticaoFisica] = field(default_factory=list)

    @property
    def pode_gerar_relatorio(self) -> bool:
        """G05: só libera quando toda revisão tiver decisão `PUBLICAR`
        válida (DECIDIDA). PENDENTE, ADIADA e DESATUALIZADA bloqueiam."""
        return all(r.estado is EstadoRevisao.DECIDIDA for r in self.revisoes)

    @property
    def motivos_bloqueio(self) -> list[str]:
        return [
            f"{r.revisao.regra} ({r.estado.value}): {r.revisao.motivo}"
            for r in self.revisoes
            if r.estado is not EstadoRevisao.DECIDIDA
        ]


@dataclass(frozen=True)
class ContextoRevisaoParaExibicao:
    """Contrato mínimo para uma futura tela de revisão montar a
    comparação lado a lado — nunca expõe o fingerprint bruto (uso
    exclusivamente interno de invalidação) nem estrutura interna do
    motor além do necessário. `identidade_grupo` é um identificador
    opaco: a UI só precisa devolvê-lo junto da decisão, nunca
    interpretá-lo."""

    identidade_grupo: str
    regra: str
    explicacao: str
    ocorrencias: list[OcorrenciaFinanceira]
    campos_iguais: list[str]
    campos_diferentes: list[str]


def identidade_grupo(regra: str, obs: Iterable[str]) -> str:
    """Identidade estável e determinística de um grupo de revisão —
    independente da ordem das OBs (achado real: o mesmo par pode aparecer
    em ordens diferentes entre reconciliações). Nunca usa hash/repr padrão
    de objeto Python (instável entre execuções); `sha256` de uma string
    canônica.

    Confronto QA Codex / micro-sprint "Duplicatas idênticas" (achado
    reportado em HOMO-RT-04, corrigido agora): a versão anterior fazia
    `_SEPARADOR_CAMPO.join([regra, *obs_ordenadas])` — a MESMA classe
    estrutural de colisão corrigida em `_serializar_ocorrencia`
    (HOMO-RT-04): se uma OB contivesse literalmente o byte `\x1f`, o grupo
    `{"A\x1fB", "C"}` colidiria com `{"A", "B\x1fC"}`. Corrigido com a
    MESMA técnica: `json.dumps([regra, obs_ordenadas], ...)` — a fronteira
    entre `regra` e a lista de OBs, e entre as OBs entre si, passa a ser a
    gramática do JSON (nunca um byte que possa aparecer dentro de uma OB).

    IMPACTO NAS DECISÕES JÁ PERSISTIDAS (mapeado antes de implementar,
    conforme pedido): `identidade_grupo` é a CHAVE de persistência de TODA
    decisão já gravada. Mudar o algoritmo de hash muda o valor da chave
    para QUALQUER grupo (regra, obs) — não só os com repetição física de
    OB. Uma decisão gravada com a chave ANTIGA nunca mais seria encontrada
    por uma busca com a chave NOVA, e simplesmente "sumiria" (viraria
    PENDENTE, perdendo autor/data/observação da tela) se nada mais fosse
    feito — proibido explicitamente ("não fazer decisões antigas sumirem
    silenciosamente"). Por isso `aplicar_decisoes` NUNCA usa só esta
    função: ela também tenta `_identidade_grupo_legado` como reserva
    quando a busca pela chave nova não encontra nada, e decide se a
    decisão encontrada por essa via pode ser reaplicada com segurança ou
    se precisa de nova decisão humana (ver `aplicar_decisoes` para a
    regra exata — não é "sempre seguro" nem "nunca seguro", depende da
    ação da decisão antiga)."""
    obs_ordenadas = sorted(set(obs))
    canonico = json.dumps([regra, obs_ordenadas], ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(canonico.encode("utf-8")).hexdigest()


def _identidade_grupo_legado(regra: str, obs: Iterable[str]) -> str:
    """Algoritmo de `identidade_grupo` ANTERIOR a esta correção — mantido
    exclusivamente como chave de RESERVA em `aplicar_decisoes`, para
    localizar decisões persistidas com a chave antiga sem que elas
    desapareçam silenciosamente. NUNCA usado para gravar uma decisão nova
    (`registrar_decisao` sempre usa `identidade_grupo`, a versão segura),
    e uma decisão só encontrada por esta via NUNCA é reaplicada às cegas —
    ver a regra de migração em `aplicar_decisoes`."""
    obs_ordenadas = sorted(set(obs))
    base = _SEPARADOR_CAMPO.join([regra, *obs_ordenadas])
    return hashlib.sha256(base.encode("utf-8")).hexdigest()


def _normalizar_numero(valor: int | float | Decimal) -> str:
    """Canonicaliza um número (`int`, `float` ou `Decimal`) preservando
    PRECISÃO MATERIAL total, mas convergindo representações que o próprio
    domínio já trata como o MESMO valor para o MESMO texto canônico —
    nunca inventa uma distinção nova, nunca apaga uma real.

    Confronto QA Codex / HOMO-RT-04, item 3 (investigado, não presumido):
    `app/consulta/repositorio_diarias._valor_como_numero` — usado por
    `repositorio_ordens_bancarias.py` para ler `VALOR DA DIÁRIA`/
    `RESTITUIÇÃO` — sempre devolve `float | None` (`float(valor)` explícito
    mesmo quando a célula chega como `int` do openpyxl); na prática,
    `OrdemBancaria.valor`/`.restituicao` nunca são `int` puro vindos da
    Base OB real. Ainda assim, `int`/`Decimal` são tratados aqui por
    segurança (uso direto do domínio fora do pipeline de leitura — testes,
    scripts, futuras integrações) e para documentar a regra explicitamente,
    em vez de presumir "tudo é float".

    Regra adotada, e por quê: `motor_decisao._resolver_repeticao_fisica`/
    `_campos_divergentes` (que decidem se uma repetição física é RN04)
    comparam `valor`/campos materiais por IGUALDADE NATIVA do Python — onde
    `100 == 100.0` é `True` e `0.0 == -0.0` também é `True`. Se a
    canonicalização tratasse `100`/`100.0` (ou `0.0`/`-0.0`) como
    DIFERENTES, uma decisão válida poderia virar `DESATUALIZADA`/ambígua só
    por causa de uma diferença de REPRESENTAÇÃO que o próprio motor de
    decisão já considera irrelevante — o equivalente inverso do bug do
    HOMO-RT-03 (lá, valores DIFERENTES colidiam; aqui, seria valores IGUAIS
    tratados como diferentes). A canonicalização acompanha deliberadamente
    a mesma noção de igualdade já usada pelo domínio, nunca uma nova.

    Implementação: converte para `Decimal` a partir de `repr(float(x))`
    (nunca do `float` bruto — evita introduzir ruído binário extra na
    conversão; `repr` já é o texto mais curto que reproduz o float
    exatamente), normaliza `-0`/`0` para `0`, e usa `Decimal.normalize()`
    (remove zeros à direita de forma determinística — `Decimal("100.0")` e
    `Decimal("100")` normalizam para o MESMO `Decimal("1E+2")`) — nunca
    `f"{x:.2f}"` (perderia precisão material, o bug do HOMO-RT-03).
    `100.001`/`100.002` não têm zeros à direita para remover e permanecem
    distintos."""
    decimal_valor = valor if isinstance(valor, Decimal) else Decimal(repr(float(valor)))
    if decimal_valor == 0:
        decimal_valor = Decimal(0)  # unifica 0/-0, mesma igualdade nativa usada no domínio
    return str(decimal_valor.normalize())


def _campo_canonico(nome_campo: str, valor: object) -> list:
    """Um campo → uma entrada estrutural `[nome, tipo, valor_canônico]` —
    NUNCA concatenação de texto. Consumida por `_serializar_ocorrencia`,
    que monta a lista completa e serializa via `json.dumps` (ver ali o
    motivo estrutural: `json.dumps` delimita cada elemento pela GRAMÁTICA
    do JSON — colchetes/aspas/escapes — nunca por um caractere sentinela
    que possa aparecer dentro do próprio valor).

    `tipo` é sempre um rótulo fixo do vocabulário desta função (nunca
    derivado do dado) — nome/tipo nunca são texto livre do usuário, só
    `valor` pode ser; a fronteira entre os três nunca depende do
    CONTEÚDO de `valor` (requisito B do confronto: nome/posição do campo
    sempre inequívocos)."""
    if valor is None:
        return [nome_campo, "nulo", None]
    if isinstance(valor, (int, float, Decimal)):
        return [nome_campo, "numero", _normalizar_numero(valor)]
    if isinstance(valor, datetime):
        return [nome_campo, "datahora", valor.isoformat()]
    if isinstance(valor, date):
        return [nome_campo, "data", valor.isoformat()]
    if isinstance(valor, str):
        return [nome_campo, "texto", valor]
    return [nome_campo, "texto", str(valor)]  # defensivo — nenhum campo usado aqui cai neste ramo hoje


def calcular_fingerprint(ocorrencias: Iterable[OcorrenciaFinanceira]) -> str:
    """Serialização determinística das evidências materialmente relevantes
    de um grupo — nunca a representação padrão de objeto Python.
    Deliberadamente canonicalizada para não depender da ordem de entrada.

    Confronto QA Codex / QA-RT-02 (achado real, corrigido aqui): a versão
    anterior ordenava as ocorrências por `ordem.ob` ANTES de serializar.
    Isso normaliza corretamente grupos de OBs DISTINTAS (RN07), mas para um
    grupo onde todas as ocorrências têm a MESMA OB (exatamente o caso de
    revisão RN04 por repetição física, I11) a chave de ordenação empata
    para todas — como `sorted()` do Python é estável, o empate preserva a
    ordem de ENTRADA sem normalizar nada, e o fingerprint acabava
    dependendo da ordem física das linhas na fonte (achado real: OB
    repetida com motivo/trecho divergente produzia hashes diferentes só
    por inverter a ordem das ocorrências). Correção: serializa cada
    ocorrência primeiro (função pura do conteúdo, nunca da posição), e só
    ORDENA as strings já serializadas — a canonicalização passa a depender
    exclusivamente do conteúdo material da evidência, nunca da ordem de
    entrada nem do número da linha (que já não entra em `campos` abaixo).

    `linha` (posição física na Base OB) é deliberadamente EXCLUÍDA — é só
    diagnóstico de localização na planilha, nunca afeta o significado do
    pagamento; incluí-la invalidaria decisões por motivo irrelevante toda
    vez que a fonte fosse reexportada com linhas deslocadas.

    `duplicidade` (Micro-sprint 3C.1) também é deliberadamente EXCLUÍDA —
    RN03 estabelece que esse marcador é só metadado, nunca decide nada
    sozinho; incluí-lo aqui obrigaria revalidar uma decisão humana válida
    toda vez que esse campo mudasse, mesmo sem nenhuma mudança material
    (achado real: a investigação dos 17 casos "Duplicado" mostrou que o
    campo mistura fenômenos incompatíveis e não tem significado
    financeiro confiável isolado).

    Confronto QA Codex / NOVO-RT-08 (achado real, corrigido aqui): antes
    desta correção, esta função mantinha sua PRÓPRIA lista de campos
    materiais (`ob, dh, cpf, periodo_inicial, periodo_final, valor, trecho,
    trecho_normalizado, motivo, data_pagamento, restituicao, situacao`),
    paralela e independente de `CAMPOS_EVIDENCIA_MATERIAL`
    (`motor_decisao.py`, usada para decidir se uma repetição física é RN04).
    As duas listas divergiram silenciosamente: quando QA-RT-01 acrescentou
    `sei`/`cargo`/`transporte` (e a revalidação seguinte acrescentou `nome`)
    a `CAMPOS_EVIDENCIA_MATERIAL`, esta função não foi atualizada — um
    grupo podia virar RN04 por SEI divergente, receber uma decisão humana,
    o SEI mudar de novo, e o fingerprint permanecer idêntico (SEI nunca
    entrava no hash), mantendo a decisão antiga como "válida" mesmo com
    evidência diferente. Corrigido reutilizando `CAMPOS_EVIDENCIA_MATERIAL`
    diretamente como base — nunca mais duas listas paralelas: todo campo
    adicionado lá agora participa automaticamente do fingerprint. Além
    desses campos, esta função inclui três exclusivos seus: `ordem.ob`
    (discriminador entre OBs distintas — irrelevante para
    `CAMPOS_EVIDENCIA_MATERIAL`, que só compara ocorrências que já
    compartilham a mesma OB), `ordem.valor` (tem semântica de equivalência
    própria, zero-vs-real, tratada à parte — nunca por igualdade simples) e
    `normalizar_trecho(ordem.trecho)` (chave de agrupamento do RN07,
    redundante com `trecho` mas mantida por segurança).

    O valor bruto de CPF/nome/motivo/trecho nunca é persistido em claro
    pela camada de persistência (§12 da especificação) — só entra aqui,
    dentro do hash, nunca no JSON salvo.

    Confronto QA Codex / HOMO-RT-04 (achado real e BLOQUEANTE, corrigido
    aqui): a versão anterior juntava as ocorrências já serializadas com
    `_SEPARADOR_OCORRENCIA.join(sorted(linhas))` — um caractere sentinela
    (`\x1e`) como fronteira entre ocorrências, a MESMA classe de problema
    que `_campo_canonico`/`_serializar_ocorrencia` corrigem para os campos
    de UMA ocorrência (ver lá o motivo estrutural). Corrigido: em vez de
    juntar strings com um separador físico, as strings já serializadas
    (cada uma já um JSON válido e auto-delimitado) são colocadas como
    elementos de um ARRAY JSON externo (`json.dumps(sorted(linhas), ...)`)
    — a fronteira entre ocorrências passa a ser a gramática do JSON
    (vírgulas fora de qualquer string, nunca um byte que possa aparecer
    dentro do conteúdo), nunca um sentinela.

    PRESERVA MULTIPLICIDADE deliberadamente: `sorted([A, A, B])` mantém 3
    elementos (dois iguais a `A`) — o array JSON resultante tem tamanho e
    conteúdo diferentes de `sorted([A, B])` (2 elementos), então os hashes
    NUNCA coincidem entre um grupo com uma ocorrência duplicada e um grupo
    sem ela. Independente da ORDEM de entrada: `sorted([A, B, A]) ==
    sorted([A, A, B])` (mesma lista canônica) — mesmo fingerprint."""
    linhas = [_serializar_ocorrencia(oc) for oc in ocorrencias]
    canonico = json.dumps(sorted(linhas), ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(canonico.encode("utf-8")).hexdigest()


def _serializar_ocorrencia(oc: OcorrenciaFinanceira) -> str:
    """Serialização determinística do conteúdo material de UMA ocorrência
    — extraída de `calcular_fingerprint` (HOMO-RT-02) para ser reutilizada
    também por `identidades_ocorrencias`, evitando uma segunda lista
    paralela de campos (o mesmo risco de divergência silenciosa do
    NOVO-RT-08 documentado acima).

    Confronto QA Codex / HOMO-RT-04 (achado real e BLOQUEANTE, corrigido
    aqui): a versão anterior fazia `_SEPARADOR_CAMPO.join(...)` — um
    caractere sentinela (`\x1f`) juntando os valores JÁ formatados em
    texto, sem escaping/comprimento/estrutura. Contraexemplo comprovado
    pelo Codex: `motivo="X\x1fY", situacao="Z"` e `motivo="X",
    situacao="Y\x1fZ"` produziam a MESMA string `"X\x1fY\x1fZ"" — a
    fronteira entre campos podia ser "empurrada" pelo próprio CONTEÚDO de
    um campo. `None` e `""` também colidiam (ambos viravam `""`).

    Corrigido com uma representação ESTRUTURAL: cada campo vira uma
    entrada `[nome, tipo, valor_canônico]` (`_campo_canonico`, nome/tipo
    SEMPRE de um vocabulário fixo do código, nunca do dado), a lista
    completa (ordem sempre a mesma, definida por `campos_nomeados` abaixo)
    é serializada com `json.dumps(..., ensure_ascii=False,
    separators=(",", ":"))`. Isso satisfaz, por construção da gramática
    JSON (nunca por escaping manual específico destes casos):
      - fronteira entre campos inequívoca (colchetes/vírgulas fora de
        qualquer string, escapes de aspas/backslash dentro dela);
      - qualquer caractere em uma string (`\x1f`, `\x1e`, aspas, barra
        invertida, vírgula, dois-pontos, quebra de linha, Unicode) fica DENTRO da
        string JSON escapada — nunca é interpretado como fronteira;
      - `None` (`null`) é estruturalmente distinto de `""` (string
        vazia) — nunca a mesma serialização;
      - reconstruir a mesma evidência sempre produz o mesmo texto (JSON
        determinístico: mesma lista, mesma ordem, `sort_keys` irrelevante
        aqui pois usamos listas posicionais, não dicts).
    `linha` continua deliberadamente FORA (só diagnóstico, nunca afeta o
    significado do pagamento — ver docstring de `calcular_fingerprint`).

    Confronto QA Codex / HOMO-RT-05 (achado real e BLOQUEANTE, corrigido
    aqui): os campos acima (`CAMPOS_EVIDENCIA_MATERIAL` + `ob`/`valor`/
    `trecho_normalizado`) são todos de ENTRADA (`OrdemBancaria` bruta).
    Mas várias colunas do XLSX final são derivadas de MAIS de uma fonte —
    Nome (coluna C) depende de `nome` **e** `credor`
    (`linha_publicavel.nome_publicado`); Cargo/Transporte (colunas D/H)
    dependem do Controle DIMCAC (`oc.registros_controle`) COM PRECEDÊNCIA
    sobre a Base OB (`linha_publicavel.valor_do_controle_com_fallback`);
    Nº de Diárias Integral/Parcial (colunas K/L) dependem inteiramente do
    Controle DIMCAC (`quantidade_diarias.resolver_quantidade_diarias`).
    Duas ocorrências podiam ser IDÊNTICAS em `CAMPOS_EVIDENCIA_MATERIAL`
    (mesma identidade/fingerprint) e ainda assim produzir uma linha
    diferente no relatório — comprovado com CREDOR divergente mudando o
    Nome publicado mesmo com `nome` idêntico. Corrigido incluindo os
    campos EFETIVAMENTE PUBLICÁVEIS (`_campos_linha_publicavel` abaixo) na
    serialização — reaproveitando as MESMAS funções que
    `escritor_relatorio_transparencia.py` usa para escrever o XLSX
    (`linha_publicavel.py`), nunca uma reimplementação paralela dessa
    lógica (o mesmo risco de divergência silenciosa do NOVO-RT-08).
    `CAMPOS_EVIDENCIA_MATERIAL` continua intocado — RN04/RN01-RN07
    continuam decidindo só sobre a evidência de ENTRADA bruta, nunca sobre
    a linha publicável (mudar isso mudaria RN01-RN07, fora do escopo desta
    correção)."""
    ordem = oc.ordem_bancaria
    campos_nomeados: list[tuple[str, object]] = [
        ("ob", ordem.ob),
        ("valor", ordem.valor),
        ("trecho_normalizado", normalizar_trecho(ordem.trecho)),
        *((nome, extrator(oc)) for nome, extrator in CAMPOS_EVIDENCIA_MATERIAL.items()),
        *_campos_linha_publicavel(oc),
    ]
    estrutura = [_campo_canonico(nome, valor) for nome, valor in campos_nomeados]
    return json.dumps(estrutura, ensure_ascii=False, separators=(",", ":"))


def _campos_linha_publicavel(oc: OcorrenciaFinanceira) -> list[tuple[str, object]]:
    """Campos EFETIVAMENTE PUBLICÁVEIS que dependem de mais de uma fonte —
    HOMO-RT-05. Sempre calculados com as MESMAS funções puras usadas por
    `escritor_relatorio_transparencia.py` (`linha_publicavel.py`,
    `quantidade_diarias.resolver_quantidade_diarias`) — nunca uma cópia:
    se o critério de precedência/fallback do escritor mudar no futuro,
    esta função automaticamente acompanha, sem risco de as duas
    divergirem silenciosamente (o mesmo princípio já aplicado a
    `CAMPOS_EVIDENCIA_MATERIAL`/`_campos_divergentes` desde o NOVO-RT-08).

    Deliberadamente SEPARADA de `CAMPOS_EVIDENCIA_MATERIAL`: estes campos
    entram na identidade/fingerprint (o que decide se uma decisão humana
    continua válida), mas NUNCA em `_campos_divergentes` (o que decide se
    uma repetição física exige revisão humana, RN04) — misturar as duas
    listas faria RN04 disparar por uma diferença de Cargo do Controle
    DIMCAC que hoje nunca é avaliada por aquela regra, uma mudança de
    escopo de RN01-RN07 não pedida por esta correção.

    Sprint 3 (HOMO-RT-06) — `valor_passagem_publicado`/
    `valor_passagem_inconsistente` seguem exatamente o mesmo padrão:
    calculados por `linha_publicavel.valor_passagem_publicavel(oc.passagem)`
    — a MESMA função que `escritor_relatorio_transparencia.py` chama para
    escrever a coluna J — e deliberadamente FORA de `CAMPOS_EVIDENCIA_
    MATERIAL`/`_campos_divergentes`: Valor da Passagem nunca entra em RN04
    (RN01-RN07 permanecem semanticamente idênticos; a evidência de entrada
    da Base OB continua sendo a única coisa que RN04 avalia). `oc.passagem`
    é `None` (estado E) para toda ocorrência construída antes desta Sprint
    (nenhum teste/fixture anterior a ela precisou mudar) — `valor_passagem_
    publicavel(None)` sempre devolve `(valor=None, inconsistente=False)`,
    então o par de campos abaixo é uma constante para código legado, mas
    ainda assim participa da serialização (é por isso, sozinho, que a versão
    de identidade avançou de v3 para v4 — o FORMATO da linha publicável
    mudou para toda ocorrência, mesmo quando o valor efetivo não muda).

    Fechamento HOMO-RT-06 (decisão de produto final): `valor_passagem_
    inconsistente` (estado D, INVALIDO — inconsistência da própria fonte,
    ex. `"#VALOR!"`) participa do fingerprint de propósito, MESMO a célula
    pública sendo idêntica à de B/C/E (todas vazias) — "sem passagem" (B/C/E,
    dado limpo) e "passagem inconsistente na fonte" (D, dado suspeito) são
    circunstâncias administrativas distintas; se uma decisão humana foi
    tomada com a fonte limpa e ela degradar para D antes da próxima geração,
    a decisão precisa virar DESATUALIZADA — nunca continuar válida
    silenciosamente só porque a célula pública não mudou. Por isso B→D,
    C→D e E→D (e o inverso) sempre mudam o fingerprint, enquanto B↔C↔E
    entre si nunca mudam (ver testes dedicados em `test_decisao.py`)."""
    ordem = oc.ordem_bancaria
    quantidade = resolver_quantidade_diarias(oc.registros_controle)
    valor_passagem = valor_passagem_publicavel(oc.passagem)
    return [
        ("nome_publicado", nome_publicado(ordem)),
        ("cargo_publicado", valor_do_controle_com_fallback(oc.registros_controle, "cargo", ordem.cargo)),
        (
            "transporte_publicado",
            valor_do_controle_com_fallback(oc.registros_controle, "transporte", ordem.transporte),
        ),
        ("quantidade_integral_publicada", quantidade.integral if quantidade else None),
        ("quantidade_parcial_publicada", quantidade.parcial if quantidade else None),
        ("valor_passagem_publicado", valor_passagem.valor),
        ("valor_passagem_inconsistente", valor_passagem.inconsistente),
    ]


def identidades_ocorrencias(ocorrencias: Iterable[OcorrenciaFinanceira]) -> list[str]:
    """Identidade estável por ocorrência dentro de um grupo de revisão —
    uma identidade por ocorrência, na mesma ordem de entrada (HOMO-RT-02,
    redesenhada em HOMO-RT-03, canonicalização reforçada em HOMO-RT-04).

    Para uma OB que aparece uma única vez no grupo (o caso comum, e
    SEMPRE o caso em RN07 — que por definição nunca repete OB dentro de um
    grupo) a identidade é a própria OB, sem nenhuma mudança de
    comportamento frente ao código anterior a esta correção.

    Para uma OB que aparece MAIS DE UMA VEZ no grupo (repetição física,
    I11/RN04) cada ocorrência recebe `"{ob}#{_VERSAO_IDENTIDADE_OCORRENCIA}:
    {sha256(conteúdo)}"` — o hash do MESMO conteúdo canônico usado em
    `calcular_fingerprint` (`_serializar_ocorrencia`, JSON estrutural desde
    HOMO-RT-04 — ver docstring lá para o porquê). NUNCA depende de posição,
    índice, ordem de entrada ou `linha`.

    Confronto QA Codex / HOMO-RT-04 (achado real e BLOQUEANTE, corrigido em
    `_serializar_ocorrencia`/`_campo_canonico`, não nesta função): a versão
    HOMO-RT-03 serializava campos com `_SEPARADOR_CAMPO.join(...)` — um
    caractere sentinela sem escaping. Contraexemplo comprovado: OB com
    `motivo="X\x1fY", situacao="Z"` e `motivo="X", situacao="Y\x1fZ"`
    produziam a MESMA string serializada — identidades colidiam mesmo com
    conteúdo material diferente. Esta função em si não mudou de desenho
    (continua hash do conteúdo canônico, sem posição/ordem); o que mudou é
    que "conteúdo canônico" agora é estruturalmente inequívoco (JSON), não
    mais um texto concatenado por sentinela.

    Confronto QA Codex / HOMO-RT-03 (achado real e BLOQUEANTE, corrigido
    aqui): a versão anterior (HOMO-RT-02) ordenava as ocorrências da OB por
    `(conteúdo_serializado, linha)` e usava a POSIÇÃO pós-ordenação (`#0`,
    `#1`, ...) como identidade. Combinado com a perda de precisão de
    `_campo_serializavel` (corrigida acima), isso permitia o seguinte:
    ocorrência A (valor 100.001) e ocorrência B (valor 100.002)
    serializavam para o MESMO conteúdo (`"100.00"`), então o desempate
    caía em `linha` — e `linha` é só a posição física na Base OB, que MUDA
    se a planilha for reexportada com as linhas físicas trocadas. Depois
    da troca, A passava a receber a identidade que antes era de B (e
    vice-versa) — SEM nenhuma mudança de conteúdo. Como o fingerprint do
    GRUPO (que ignora `linha` e ordem, por design) permanecia igual, a
    decisão continuava `DECIDIDA` e passava a publicar a ocorrência ERRADA
    silenciosamente. Corrigir só a precisão (`repr` em vez de `.2f`) reduz
    a chance de colisão real mas NÃO elimina o problema conceitual: duas
    ocorrências ainda podem ter conteúdo material idêntico por coincidência
    (ou serem, de fato, duplicatas idênticas — ver nota abaixo), e QUALQUER
    identidade derivada de posição/índice depois de um desempate continua
    vulnerável a essa mesma classe de bug.

    Alternativas avaliadas (e por que a escolhida é a única que fecha o
    problema por completo, não só o caso de teste):
    (A) usar `linha` física diretamente — REJEITADA: `linha` é posição na
        planilha, não identidade lógica; uma reexportação/reordenação da
        Base OB muda `linha` sem mudar o pagamento representado, e o
        histórico de decisões (`docs`) já documenta um achado real de
        `linha` mudando entre reexportações.
    (B) hash/canonicalização de TODO o conteúdo relevante sem perda de
        precisão — ESCOLHIDA. Função pura do conteúdo (mesma base do
        fingerprint do grupo, já auditada/testada); zero dependência de
        posição, ordem ou desempate. Reordenar a planilha, reabrir o app,
        ou reconstruir do zero a partir da mesma fonte sempre produz a
        MESMA identidade para a MESMA ocorrência lógica.
    (C) combinação OB + conteúdo integral — é essencialmente (B): o hash
        já incorpora a OB indiretamente (ela é um dos campos serializados),
        e o prefixo `"{ob}#"` é só para manter o formato legível/agrupável
        por OB, não para acrescentar segurança.
    (D) identificador persistente derivado deterministicamente da
        evidência — é o que (B) entrega; não há necessidade de um
        identificador "persistente" separado gravado em algum lugar, já
        que ele pode sempre ser recalculado da fonte (mesma filosofia de
        `identidade_grupo`/`fingerprint_evidencias`: nunca armazenar o que
        pode ser derivado, para nunca divergir).
    (E) nenhuma outra estratégia avaliada superou (B) em simplicidade e
        segurança: não introduz estado, não introduz um novo formato de
        persistência, reaproveita a mesma serialização já auditada.

    GARANTIA (a que este redesenho existe para cumprir): se o usuário
    selecionou a ocorrência A, na próxima reconstrução — a partir da MESMA
    fonte, em QUALQUER ordem física — ou A continua tendo exatamente a
    mesma identidade (conteúdo inalterado), ou o conteúdo de A mudou e a
    identidade muda junto (o que `aplicar_decisoes` já trata como
    ambiguidade/desatualização, nunca como "B virou A"). Nunca existe um
    terceiro caminho onde A muda de identidade e B "herda" silenciosamente
    a identidade antiga de A.

    Ocorrências MATERIALMENTE IDÊNTICAS (mesmo conteúdo, mesma OB): não há
    nenhum atributo estável para distinguir logicamente duas ocorrências
    com conteúdo idêntico — inventar uma (por posição, por hash de
    `linha`, por contagem) seria exatamente o erro que este redesenho
    corrige. A escolha aqui é NUNCA inventar uma identidade que as
    distinga: as duas recebem o MESMO `"{ob}#{hash}"` (hash do mesmo
    conteúdo é, por definição, o mesmo hash). Isso as torna
    estruturalmente inseparáveis em `aplicar_decisoes` — uma decisão que
    publica essa identidade publica as duas ocorrências (nunca desaparece
    uma delas sem rastro, I11a); uma decisão que a exclui exclui as duas.
    Selecionar "só uma das duas" nunca é oferecido para esse caso porque
    não existe base lógica para distinguir qual seria "a primeira" — não é
    uma limitação desta implementação, é uma limitação do próprio domínio
    (duas linhas indistinguíveis não têm uma identidade individual real).

    VERSIONAMENTO (HOMO-RT-04, item 14): o sufixo inclui
    `_VERSAO_IDENTIDADE_OCORRENCIA` (`"v2"`) — nenhuma decisão gravada por
    uma geração anterior (OB pura, `"{ob}#{N}"` posicional, ou o hash
    sem versão do HOMO-RT-03) pode colidir TEXTUALMENTE com o formato
    atual, então `aplicar_decisoes` nunca reaplica uma decisão antiga por
    coincidência de formato — só por correspondência real de conteúdo.

    Determinístico e sem estado: a mesma lista de ocorrências sempre
    produz as mesmas identidades, na mesma ordem de entrada."""
    ocorrencias_lista = list(ocorrencias)
    contagem_por_ob: dict[str, int] = defaultdict(int)
    for oc in ocorrencias_lista:
        contagem_por_ob[oc.ordem_bancaria.ob] += 1

    identidades = []
    for oc in ocorrencias_lista:
        ob = oc.ordem_bancaria.ob
        if contagem_por_ob[ob] <= 1:
            identidades.append(ob)
        else:
            assinatura = hashlib.sha256(_serializar_ocorrencia(oc).encode("utf-8")).hexdigest()
            identidades.append(f"{ob}#{_VERSAO_IDENTIDADE_OCORRENCIA}:{assinatura}")
    return identidades


def registrar_decisao(
    revisao: RevisaoNecessaria,
    *,
    acao: AcaoDecisao,
    autor: str,
    obs_publicaveis: Iterable[str] = (),
    observacao: str | None = None,
    agora: datetime | None = None,
    ano_exercicio: int | None = None,
    mes_referencia: int | None = None,
    cobertura_efisco_ate: date | None = None,
) -> DecisaoHumana:
    """Constrói uma `DecisaoHumana` a partir de uma revisão da 3B —
    identidade e fingerprint são sempre calculados aqui, nunca à mão.

    Sprint D.1 — `ano_exercicio`/`mes_referencia`/`cobertura_efisco_ate` são
    OPCIONAIS (retrocompatíveis: chamadores existentes, incluindo scripts/
    testes fora do service, continuam funcionando sem informar nada, com o
    mesmo comportamento de antes) — quando informados pelo chamador real
    (`registrar_decisao_revisao`, com a competência/cobertura da chamada
    atual), ficam gravados na decisão para permitir a `aplicar_decisoes`
    identificar reaplicação entre competências/coberturas."""
    obs = [oc.ordem_bancaria.ob for oc in revisao.ocorrencias]
    return DecisaoHumana(
        identidade_grupo=identidade_grupo(revisao.regra, obs),
        regra=revisao.regra,
        obs_envolvidas=frozenset(obs),
        fingerprint_evidencias=calcular_fingerprint(revisao.ocorrencias),
        acao=acao,
        autor=autor,
        decidido_em=agora or datetime.now(timezone.utc),
        obs_publicaveis=frozenset(obs_publicaveis),
        observacao=observacao,
        ano_exercicio=ano_exercicio,
        mes_referencia=mes_referencia,
        cobertura_efisco_ate=cobertura_efisco_ate,
    )


def _decisao_legado_e_segura_para_reaplicar(decisao: DecisaoHumana) -> bool:
    """Uma decisão só encontrada pela chave de grupo LEGADA
    (`_identidade_grupo_legado`) só pode ser reaplicada automaticamente
    quando reaplicá-la ao grupo ERRADO (no caso hipotético de colisão da
    chave antiga — ver `identidade_grupo`) não teria consequência
    material: `ADIAR` nunca publica nada, e `PUBLICAR` com
    `obs_publicaveis` vazio também nunca publica nada — os dois só mudam
    o ESTADO da revisão (bloqueia com um motivo diferente), nunca o
    conteúdo do relatório final. Qualquer `PUBLICAR` com pelo menos uma OB
    poderia, sob colisão, publicar conteúdo do grupo ERRADO — por isso
    exige nova decisão humana em vez de ser reaplicado às cegas."""
    if decisao.acao is AcaoDecisao.ADIAR:
        return True
    return decisao.acao is AcaoDecisao.PUBLICAR and not decisao.obs_publicaveis


def _decisao_e_de_outra_execucao(decisao: DecisaoHumana, ano_exercicio: int, mes_referencia: int) -> bool:
    """Sprint D.1 — `True` quando a decisão persistida NÃO foi tomada para a
    competência sendo preparada agora. Decisões sem `ano_exercicio`/
    `mes_referencia` gravados (formato anterior a esta correção) sempre
    contam como "de outra execução" — não há como provar que foram tomadas
    "agora" (a própria ausência do campo já significa que vieram de antes
    desta feature), e o lado seguro é sinalizar reaplicação, nunca omitir."""
    return (decisao.ano_exercicio, decisao.mes_referencia) != (ano_exercicio, mes_referencia)


def _cobertura_da_decisao_ficou_obsoleta(decisao: DecisaoHumana, cobertura_efisco_ate: date | None) -> bool:
    """Sprint D.1 (P2, cobertura parcial) — `True` quando a decisão foi
    tomada sob uma cobertura E-Fisco PARCIAL (`decisao.cobertura_efisco_ate`
    não-nulo) e a cobertura em vigor agora avançou além daquele ponto
    (inclui "agora está completa", `cobertura_efisco_ate is None`). Decisões
    tomadas sob cobertura completa (`decisao.cobertura_efisco_ate is None`)
    nunca são afetadas por esta checagem — só o caso descoberto no QA
    (decisão sobre universo comprovadamente incompleto) precisa desta
    proteção extra, além do fingerprint normal."""
    if decisao.cobertura_efisco_ate is None:
        return False
    return cobertura_efisco_ate is None or cobertura_efisco_ate > decisao.cobertura_efisco_ate


def aplicar_decisoes(
    resultado: ResultadoRelatorio,
    decisoes: dict[str, DecisaoHumana],
    *,
    ano_exercicio: int,
    mes_referencia: int,
    cobertura_efisco_ate: date | None = None,
) -> ResultadoRevisado:
    """Aplica decisões humanas persistidas sobre a saída da 3B. Nunca
    reclassifica nada por conta própria (RN01-RN07 continuam
    responsabilidade exclusiva de `motor_decisao.classificar`) e nunca
    inventa uma decisão para um grupo sem entrada correspondente em
    `decisoes` — esse grupo simplesmente permanece PENDENTE.

    Sprint D.1 — `ano_exercicio`/`mes_referencia` (a competência sendo
    preparada AGORA) e `cobertura_efisco_ate` (a cobertura E-Fisco em vigor
    agora, `None` quando completa) são novos parâmetros OBRIGATÓRIOS
    (`ano_exercicio`/`mes_referencia`) e opcional (`cobertura_efisco_ate`) —
    usados só para marcar cada revisão resolvida como reaplicada de
    execução anterior e/ou invalidar uma decisão cuja cobertura ficou
    obsoleta. PRESERVA o reaproveitamento entre competências (G06) — nunca
    força nova decisão só por ter mudado de mês quando a evidência continua
    válida; só torna essa reaplicação VISÍVEL."""
    candidatos_publicaveis = list(resultado.candidatos_normais)
    nao_publicaveis: list[OcorrenciaNaoPublicavel] = []
    revisoes_com_estado: list[RevisaoComEstado] = []

    for revisao in resultado.revisoes_necessarias:
        obs_atuais = [oc.ordem_bancaria.ob for oc in revisao.ocorrencias]
        grupo_id = identidade_grupo(revisao.regra, obs_atuais)
        decisao = decisoes.get(grupo_id)

        if decisao is None:
            # Micro-sprint "Duplicatas idênticas" — `identidade_grupo` foi
            # corrigida (canonicalização JSON, mesma técnica de
            # HOMO-RT-04); decisões gravadas com a chave ANTIGA
            # (`_identidade_grupo_legado`) não são mais encontradas pela
            # busca acima. Em vez de deixá-las "sumir" como PENDENTE
            # (proibido — perderia autor/data/observação da tela), busca
            # pela chave legada como reserva. Só reaplicada automaticamente
            # quando isso não tem risco material mesmo sob uma hipotética
            # colisão da chave antiga (`_decisao_legado_e_segura_para_
            # reaplicar`); caso contrário, sinalizada como
            # REQUER_NOVA_DECISAO — nunca descartada, sempre rastreável.
            grupo_id_legado = _identidade_grupo_legado(revisao.regra, obs_atuais)
            decisao_legada = decisoes.get(grupo_id_legado)
            if decisao_legada is None:
                revisoes_com_estado.append(RevisaoComEstado(revisao=revisao, estado=EstadoRevisao.PENDENTE))
                continue
            if not _decisao_legado_e_segura_para_reaplicar(decisao_legada):
                revisoes_com_estado.append(
                    RevisaoComEstado(revisao=revisao, estado=EstadoRevisao.REQUER_NOVA_DECISAO, decisao=decisao_legada)
                )
                continue
            decisao = decisao_legada

        fingerprint_atual = calcular_fingerprint(revisao.ocorrencias)
        if decisao.fingerprint_evidencias != fingerprint_atual or _cobertura_da_decisao_ficou_obsoleta(
            decisao, cobertura_efisco_ate
        ):
            revisoes_com_estado.append(
                RevisaoComEstado(revisao=revisao, estado=EstadoRevisao.DESATUALIZADA, decisao=decisao)
            )
            continue

        reaplicada = _decisao_e_de_outra_execucao(decisao, ano_exercicio, mes_referencia)

        if decisao.acao is AcaoDecisao.ADIAR:
            revisoes_com_estado.append(
                RevisaoComEstado(
                    revisao=revisao,
                    estado=EstadoRevisao.ADIADA,
                    decisao=decisao,
                    reaplicada_de_execucao_anterior=reaplicada,
                )
            )
            continue

        # HOMO-RT-02/HOMO-RT-03/HOMO-RT-04: identidade por ocorrência (não
        # mais por OB isolada) — necessário porque um grupo RN04 pode ter
        # duas ocorrências FÍSICAS com a MESMA OB (I11), e a decisão
        # precisa poder publicar só uma delas. Qualquer decisão cujo
        # `obs_publicaveis` não bate com NENHUMA identidade atual de um
        # grupo com repetição física é tratada como ambígua — nunca
        # reinterpretada sozinha, sempre volta a bloquear
        # (REQUER_NOVA_DECISAO), preservando a decisão antiga só para
        # histórico. Isso cobre uniformemente: "OB pura" (anterior a
        # HOMO-RT-02), `"{ob}#{N}"` posicional (HOMO-RT-02) e o hash sem
        # versão do HOMO-RT-03 — nenhum coincide com o formato atual
        # (`"{ob}#v2:{hash}"`). Grupos sem repetição física (todo RN07, e
        # RN04 sem repetição) têm identidade == ob — zero mudança de
        # comportamento.
        identidades_atuais = identidades_ocorrencias(revisao.ocorrencias)
        tem_repeticao_fisica = len(set(obs_atuais)) != len(obs_atuais)
        if (
            tem_repeticao_fisica
            and decisao.obs_publicaveis
            and not (decisao.obs_publicaveis & set(identidades_atuais))
        ):
            revisoes_com_estado.append(
                RevisaoComEstado(revisao=revisao, estado=EstadoRevisao.REQUER_NOVA_DECISAO, decisao=decisao)
            )
            continue

        # Micro-sprint "Duplicatas idênticas" — decisão de produto:
        # ocorrências FISICAMENTE duplicadas e MATERIALMENTE IDÊNTICAS
        # (mesma OB, mesmo conteúdo — `identidades_ocorrencias` já dá a
        # elas a MESMA identidade, por não haver base lógica para
        # distingui-las) publicam NO MÁXIMO UMA representante quando essa
        # identidade está em `obs_publicaveis` — nunca N vezes o mesmo
        # pagamento só porque a linha física se repetiu na fonte (o valor
        # NUNCA pode ser contado 2x no relatório por causa de um artefato
        # de exportação). `publicadas_por_identidade` garante isso: a
        # PRIMEIRA ocorrência da classe (na ordem em que aparece em
        # `revisao.ocorrencias`) é publicada; as demais da MESMA classe
        # vão para `ocorrencias_nao_publicaveis` (nunca desaparecem sem
        # rastro, I11a — só não duplicam o valor). Como o conteúdo delas é
        # byte-a-byte idêntico por definição de "mesma identidade", QUAL
        # das ocorrências físicas vira a representante é irrelevante para
        # o resultado publicado (mesmos campos, mesmo valor) — só precisa
        # ser exatamente uma. Identidades com uma única ocorrência (RN07,
        # e RN04 sem repetição) nunca entram no ramo "já publicada" —
        # comportamento idêntico ao anterior a esta correção.
        publicadas_por_identidade: set[str] = set()
        for oc, identidade in zip(revisao.ocorrencias, identidades_atuais):
            if identidade not in decisao.obs_publicaveis:
                nao_publicaveis.append(
                    OcorrenciaNaoPublicavel(
                        ocorrencia=oc,
                        decisao=decisao,
                        categoria=CategoriaNaoPublicada.NAO_PUBLICADA_POR_DECISAO_HUMANA,
                        reaplicada_de_execucao_anterior=reaplicada,
                    )
                )
            elif identidade in publicadas_por_identidade:
                nao_publicaveis.append(
                    OcorrenciaNaoPublicavel(
                        ocorrencia=oc,
                        decisao=decisao,
                        categoria=CategoriaNaoPublicada.DUPLICATA_FISICA_IDENTICA_SUPRIMIDA,
                        reaplicada_de_execucao_anterior=reaplicada,
                    )
                )
            else:
                candidatos_publicaveis.append(
                    CandidatoNormal(ocorrencia=oc, registros_controle=oc.registros_controle)
                )
                publicadas_por_identidade.add(identidade)
        revisoes_com_estado.append(
            RevisaoComEstado(
                revisao=revisao,
                estado=EstadoRevisao.DECIDIDA,
                decisao=decisao,
                reaplicada_de_execucao_anterior=reaplicada,
            )
        )

    return ResultadoRevisado(
        candidatos_publicaveis=candidatos_publicaveis,
        ocorrencias_nao_publicaveis=nao_publicaveis,
        revisoes=revisoes_com_estado,
        diagnosticos_repeticao_fisica=list(resultado.diagnosticos_repeticao_fisica),
    )


_CAMPOS_VISAO_PRINCIPAL: dict[str, Callable[[OcorrenciaFinanceira], object]] = {
    "beneficiario": lambda o: o.ordem_bancaria.nome,
    "ob": lambda o: o.ordem_bancaria.ob,
    "dh": lambda o: o.dh,
    "sei": lambda o: o.ordem_bancaria.sei,
    "data_ob": lambda o: o.ordem_bancaria.data_pagamento,
    "periodo_inicial": lambda o: o.ordem_bancaria.periodo_inicial,
    "periodo_final": lambda o: o.ordem_bancaria.periodo_final,
    "trecho": lambda o: o.ordem_bancaria.trecho,
    "valor": lambda o: o.ordem_bancaria.valor,
    "motivo": lambda o: o.ordem_bancaria.motivo,
    "restituicao": lambda o: o.ordem_bancaria.restituicao,
}


def contexto_para_exibicao(revisao: RevisaoNecessaria) -> ContextoRevisaoParaExibicao:
    """Prepara os dados que uma futura tela de revisão precisa — campos da
    visão principal (`docs/relatorio-transparencia/README.md` § 6),
    separados em iguais/diferentes entre as ocorrências do grupo. Não
    constrói nenhuma UI; só o contrato de dados."""
    campos_iguais: list[str] = []
    campos_diferentes: list[str] = []
    for nome, extrator in _CAMPOS_VISAO_PRINCIPAL.items():
        valores = {extrator(o) for o in revisao.ocorrencias}
        (campos_iguais if len(valores) <= 1 else campos_diferentes).append(nome)

    return ContextoRevisaoParaExibicao(
        identidade_grupo=identidade_grupo(revisao.regra, (o.ordem_bancaria.ob for o in revisao.ocorrencias)),
        regra=revisao.regra,
        explicacao=revisao.motivo,
        ocorrencias=list(revisao.ocorrencias),
        campos_iguais=campos_iguais,
        campos_diferentes=campos_diferentes,
    )
