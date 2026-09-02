"""Sprint 2 (plano "Valor da Passagem no XLSX Oficial + Não Publicadas") —
cruzamento EXATO por OB entre a Base de Ordens Bancárias (fonte de verdade da
ocorrência) e a Planilha de Passagens (enriquecimento opcional). Módulo
puro/domínio, sem I/O — consome as estruturas já lidas por
`app/consulta/repositorio_ordens_bancarias.py` e
`app/consulta/repositorio_planilha_passagens.py`.

Confronto/decisão de produto preservada explicitamente (não decidida por este
módulo, herdada do plano já aprovado): correspondência SOMENTE por OB, EXATA
— nenhum fallback por Nome, CPF, SEI, DH ou Trecho. Se a OB não casar, a
ocorrência nunca recebe um valor de passagem inventado.

O estado E ("OB da Base OB sem correspondente na Planilha de Passagens")
NASCE AQUI, não no leitor da Sprint 1 (`repositorio_planilha_passagens.py`) —
aquele módulo só sabe o que está escrito na própria Planilha de Passagens,
nunca compara contra a Base OB. Os estados A-D (o que o leitor da Sprint 1 já
classifica: NUMERICO/AUSENTE/NAO_SE_APLICA/INVALIDO) são REAPROVEITADOS
diretamente de `EstadoPassagem` — nunca uma cópia paralela — e a normalização
de valores (ex.: moeda brasileira "R$ ..." vs. célula float nativa do ODF)
permanece inteiramente dentro do leitor/adaptador da fonte, nunca vazando
como regra duplicada para este módulo ou para camadas futuras.

Este módulo era, até a Sprint 2, uma estrutura PARALELA — nunca integrada a
`ResultadoRevisado`/`OcorrenciaFinanceira`/fingerprint/linha publicável.
Sprint 3 (HOMO-RT-06) acrescenta `anexar_passagens_ao_resultado`, o único
ponto de integração real: anexa `OcorrenciaFinanceira.passagem` a um
`ResultadoRelatorio` já classificado por `motor_decisao.classificar` — nunca
reclassifica nada, só enriquece o dado que acompanha cada ocorrência. Nenhuma
regra de bloqueio para o estado D (`INVALIDO`) é decidida aqui — isso é
responsabilidade de `linha_publicavel.valor_passagem_publicavel`/do escritor,
nunca deste módulo.

Transporte usado em TODO o diagnóstico é sempre o da Base OB (`OrdemBancaria.
transporte`, fonte de verdade da ocorrência), nunca o da Planilha de
Passagens (que é só enriquecimento subordinado, e nem sempre existe — estado
E não tem transporte próprio na Passagens).

Sprint 3 — `cruzar_passagens_por_ob` passou a receber `Mapping[str,
LinhaPassagem]` diretamente (o `.por_ob` já resolvido), não mais o wrapper
`ResultadoLeituraPlanilhaPassagens` de `app/consulta/
repositorio_planilha_passagens.py`: este módulo é domínio puro e não deve
depender do tipo de retorno de um módulo de leitura/I/O, só da entidade
(`LinhaPassagem`, agora em `app/domain/entities/linha_passagem.py`) — mesmo
padrão já seguido por `motor_decisao.classificar`, que nunca recebe
`ResultadoLeituraOrdensBancarias`, só as entidades já extraídas dele."""

from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field, replace

from app.domain.entities.linha_passagem import LinhaPassagem
from app.domain.entities.ordem_bancaria import OrdemBancaria
from app.domain.relatorio_transparencia.motor_decisao import (
    CandidatoNormal,
    DiagnosticoRepeticaoFisica,
    OcorrenciaFinanceira,
    ResultadoRelatorio,
    RevisaoNecessaria,
)

__all__ = [
    "ROTULO_SEM_CORRESPONDENCIA",
    "CruzamentoPassagem",
    "ResultadoCruzamentoPassagens",
    "cruzar_passagens_por_ob",
    "contagem_por_estado",
    "contagem_por_transporte_e_estado",
    "cobertura_unica_por_ob",
    "anexar_passagens_ao_resultado",
]

# Rótulo do estado E — deliberadamente uma string própria (não um valor de
# `EstadoPassagem`, que só cobre A-D) para que nunca seja confundido com um
# dos 4 estados que o leitor da Sprint 1 já sabe distinguir.
ROTULO_SEM_CORRESPONDENCIA = "sem_correspondencia"


@dataclass(frozen=True)
class CruzamentoPassagem:
    """Uma ocorrência FÍSICA da Base OB (uma linha, não uma OB única) cruzada
    com a Planilha de Passagens pela sua OB. `linha_passagem is None` é,
    exclusivamente, o estado E — nunca inferido de nenhuma outra forma (nunca
    "OB vazia", nunca "erro de leitura da Base OB": essas são outras
    categorias já tratadas por `repositorio_ordens_bancarias.py`, anteriores
    a este cruzamento)."""

    ob: str
    transporte: str | None
    linha_passagem: LinhaPassagem | None

    @property
    def rotulo_estado(self) -> str:
        """"numerico" | "ausente" | "nao_se_aplica" | "invalido" (os 4
        estados de `EstadoPassagem`, reaproveitados sem cópia) ou
        `ROTULO_SEM_CORRESPONDENCIA` (estado E, exclusivo deste módulo)."""
        if self.linha_passagem is None:
            return ROTULO_SEM_CORRESPONDENCIA
        return self.linha_passagem.estado.value


@dataclass(frozen=True)
class ResultadoCruzamentoPassagens:
    """`cruzamentos` preserva a ordem e a MULTIPLICIDADE física de entrada —
    uma OB fisicamente repetida na Base OB (achado real da Sprint 1: 15
    pares na Base OB de referência) gera 2 `CruzamentoPassagem` independentes
    aqui. Resolver essa repetição física (I11/RN04) é responsabilidade do
    motor de decisão, fora do escopo deste módulo — cruzar duas vezes é o
    comportamento correto e honesto, nunca deduplicar silenciosamente."""

    cruzamentos: list[CruzamentoPassagem] = field(default_factory=list)


def cruzar_passagens_por_ob(
    ordens_bancarias: Iterable[OrdemBancaria],
    passagens_por_ob: Mapping[str, LinhaPassagem],
) -> ResultadoCruzamentoPassagens:
    """Cruzamento exato por OB. Para cada `OrdemBancaria` física, procura a
    mesma OB (comparação exata de string, sem normalização de caixa/espaço —
    a mesma convenção já usada por `repositorio_planilha_passagens.por_ob`,
    cuja chave já é a OB "tal como está" após `strip()`) no índice da
    Planilha de Passagens. Nenhum outro campo (Nome/CPF/SEI/DH/Trecho) é
    usado para decidir a correspondência."""
    cruzamentos = [
        CruzamentoPassagem(
            ob=ordem.ob,
            transporte=ordem.transporte,
            linha_passagem=passagens_por_ob.get(ordem.ob),
        )
        for ordem in ordens_bancarias
    ]
    return ResultadoCruzamentoPassagens(cruzamentos=cruzamentos)


def contagem_por_estado(resultado: ResultadoCruzamentoPassagens) -> dict[str, int]:
    """Contagem por linha física (não por OB única) — mesma granularidade de
    `resultado.cruzamentos`."""
    contagem: dict[str, int] = {}
    for cruzamento in resultado.cruzamentos:
        contagem[cruzamento.rotulo_estado] = contagem.get(cruzamento.rotulo_estado, 0) + 1
    return contagem


def contagem_por_transporte_e_estado(
    resultado: ResultadoCruzamentoPassagens,
) -> dict[tuple[str | None, str], int]:
    """Tabela cruzada Transporte (sempre da Base OB) × estado (A-E), por
    linha física. Chave `(transporte, rotulo_estado)` — `transporte` pode ser
    `None` quando a própria Base OB não tem esse campo preenchido."""
    contagem: dict[tuple[str | None, str], int] = {}
    for cruzamento in resultado.cruzamentos:
        chave = (cruzamento.transporte, cruzamento.rotulo_estado)
        contagem[chave] = contagem.get(chave, 0) + 1
    return contagem


def cobertura_unica_por_ob(resultado: ResultadoCruzamentoPassagens) -> tuple[int, int]:
    """`(obs_unicas_cobertas, obs_unicas_sem_correspondencia)` — nível de OB
    ÚNICA (não de linha física): responde "que fração dos números de OB
    distintos da Base OB tem alguma correspondência na Planilha de
    Passagens", independente de repetição física. Uma OB fisicamente
    repetida conta 1 vez aqui, mesmo que apareça 2x em `cruzamentos`."""
    obs_todas = {c.ob for c in resultado.cruzamentos}
    obs_sem_correspondencia = {c.ob for c in resultado.cruzamentos if c.linha_passagem is None}
    return len(obs_todas) - len(obs_sem_correspondencia), len(obs_sem_correspondencia)


def anexar_passagens_ao_resultado(
    resultado: ResultadoRelatorio,
    passagens_por_ob: Mapping[str, LinhaPassagem],
) -> ResultadoRelatorio:
    """Sprint 3 (HOMO-RT-06) — único ponto de integração deste módulo com o
    motor de decisão: anexa `OcorrenciaFinanceira.passagem` (cruzamento
    exato por OB, mesma lógica de `cruzar_passagens_por_ob` — um simples
    `passagens_por_ob.get(ob)`) a CADA ocorrência de `resultado`, preservando
    integralmente a classificação já feita por `motor_decisao.classificar`
    (RN01-RN07). Nunca reclassifica, nunca remove, nunca reordena — só
    enriquece o dado que acompanha cada ocorrência já existente.

    Chamada DEPOIS de `classificar()` e ANTES de `aplicar_decisoes()`: o
    fingerprint calculado em `aplicar_decisoes` (via `decisao.
    calcular_fingerprint`, que já inclui `_campos_linha_publicavel`) só
    reflete o Valor da Passagem se a ocorrência já tiver `passagem` anexada
    quando `aplicar_decisoes` a vir — anexar depois seria tarde demais.

    `OcorrenciaFinanceira` é `frozen` — cada ocorrência é substituída por uma
    cópia via `dataclasses.replace`, nunca mutada; a identidade de objeto
    muda, o conteúdo lógico (exceto `passagem`) não."""

    def _com_passagem(oc: OcorrenciaFinanceira) -> OcorrenciaFinanceira:
        return replace(oc, passagem=passagens_por_ob.get(oc.ordem_bancaria.ob))

    candidatos = [
        CandidatoNormal(ocorrencia=_com_passagem(c.ocorrencia), registros_controle=c.registros_controle)
        for c in resultado.candidatos_normais
    ]
    revisoes = [
        RevisaoNecessaria(
            regra=r.regra,
            motivo=r.motivo,
            ocorrencias=[_com_passagem(oc) for oc in r.ocorrencias],
            evidencias=r.evidencias,
        )
        for r in resultado.revisoes_necessarias
    ]
    diagnosticos = [
        DiagnosticoRepeticaoFisica(ob=d.ob, ocorrencias=[_com_passagem(oc) for oc in d.ocorrencias])
        for d in resultado.diagnosticos_repeticao_fisica
    ]
    return ResultadoRelatorio(
        candidatos_normais=candidatos,
        revisoes_necessarias=revisoes,
        diagnosticos_repeticao_fisica=diagnosticos,
    )
