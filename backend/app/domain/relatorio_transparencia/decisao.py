"""Micro-sprint 3C — decisão humana sobre casos REVISAO_NECESSARIA (RN01
via RN02/RN04/RN07), persistência auditável dessa decisão, e aplicação
dela sobre a saída do motor da 3B (`motor_decisao.classificar`). Ainda sem
UI/IPC/XLSX final — só o modelo de dados e a lógica pura de aplicação
(`docs/relatorio-transparencia/README.md` § 6, G05/G06).

Função pura, sem I/O — quem lê/escreve a decisão persistida é sempre
`app/consulta/persistencia_decisoes.py`, nunca este módulo. Este módulo
nunca reimplementa RN01-RN07: consome `ResultadoRelatorio` da 3B tal como
está, nunca reclassifica nada por conta própria."""

from collections.abc import Callable, Iterable
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from enum import Enum
import hashlib

from app.domain.relatorio_transparencia.motor_decisao import (
    CandidatoNormal,
    DiagnosticoRepeticaoFisica,
    OcorrenciaFinanceira,
    ResultadoRelatorio,
    RevisaoNecessaria,
)
from app.domain.relatorio_transparencia.normalizacao_trecho import normalizar_trecho

__all__ = [
    "AcaoDecisao",
    "EstadoRevisao",
    "DecisaoHumana",
    "OcorrenciaNaoPublicavel",
    "RevisaoComEstado",
    "ResultadoRevisado",
    "ContextoRevisaoParaExibicao",
    "identidade_grupo",
    "calcular_fingerprint",
    "registrar_decisao",
    "aplicar_decisoes",
    "contexto_para_exibicao",
]

_SEPARADOR_CAMPO = "\x1f"  # unit separator — seguro contra colisão com texto livre
_SEPARADOR_OCORRENCIA = "\x1e"  # record separator


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
    cegamente, volta a bloquear como se fosse nova."""

    PENDENTE = "pendente"
    DECIDIDA = "decidida"
    ADIADA = "adiada"
    DESATUALIZADA = "desatualizada"


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


@dataclass(frozen=True)
class OcorrenciaNaoPublicavel:
    """Uma OB explicitamente excluída da publicação por decisão humana —
    nunca desaparece: continua rastreável aqui, com a decisão que a
    excluiu."""

    ocorrencia: OcorrenciaFinanceira
    decisao: DecisaoHumana


@dataclass(frozen=True)
class RevisaoComEstado:
    revisao: RevisaoNecessaria
    estado: EstadoRevisao
    decisao: DecisaoHumana | None = None


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
    canônica ordenada."""
    obs_ordenadas = sorted(set(obs))
    base = _SEPARADOR_CAMPO.join([regra, *obs_ordenadas])
    return hashlib.sha256(base.encode("utf-8")).hexdigest()


def _campo_serializavel(valor: object) -> str:
    if valor is None:
        return ""
    if isinstance(valor, float):
        return f"{valor:.2f}"
    if isinstance(valor, (datetime, date)):
        return valor.isoformat()
    return str(valor)


def calcular_fingerprint(ocorrencias: Iterable[OcorrenciaFinanceira]) -> str:
    """Serialização determinística das evidências materialmente relevantes
    de um grupo — nunca a representação padrão de objeto Python.
    Deliberadamente ordenada por OB para não depender da ordem de entrada.

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
    financeiro confiável isolado). `situacao` continua incluída — ao
    contrário de `duplicidade`, não há nenhuma RN que a declare
    irrelevante, e ela já é campo de divergência de RN04
    (`_campos_divergentes`); na ausência de evidência que justifique
    excluí-la, o lado conservador (mais propenso a revalidar do que a
    reaproveitar cegamente) é o escolhido.

    O valor bruto de CPF/motivo/trecho nunca é persistido em claro pela
    camada de persistência (§12 da especificação) — só entra aqui, dentro
    do hash, nunca no JSON salvo."""
    linhas = []
    for oc in sorted(ocorrencias, key=lambda o: o.ordem_bancaria.ob):
        ordem = oc.ordem_bancaria
        campos = [
            ordem.ob,
            oc.dh,
            ordem.cpf,
            ordem.periodo_inicial,
            ordem.periodo_final,
            ordem.valor,
            ordem.trecho,
            normalizar_trecho(ordem.trecho),
            ordem.motivo,
            ordem.data_pagamento,
            ordem.restituicao,
            ordem.situacao,
        ]
        linhas.append(_SEPARADOR_CAMPO.join(_campo_serializavel(c) for c in campos))
    canonico = _SEPARADOR_OCORRENCIA.join(linhas)
    return hashlib.sha256(canonico.encode("utf-8")).hexdigest()


def registrar_decisao(
    revisao: RevisaoNecessaria,
    *,
    acao: AcaoDecisao,
    autor: str,
    obs_publicaveis: Iterable[str] = (),
    observacao: str | None = None,
    agora: datetime | None = None,
) -> DecisaoHumana:
    """Constrói uma `DecisaoHumana` a partir de uma revisão da 3B —
    identidade e fingerprint são sempre calculados aqui, nunca à mão."""
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
    )


def aplicar_decisoes(
    resultado: ResultadoRelatorio,
    decisoes: dict[str, DecisaoHumana],
) -> ResultadoRevisado:
    """Aplica decisões humanas persistidas sobre a saída da 3B. Nunca
    reclassifica nada por conta própria (RN01-RN07 continuam
    responsabilidade exclusiva de `motor_decisao.classificar`) e nunca
    inventa uma decisão para um grupo sem entrada correspondente em
    `decisoes` — esse grupo simplesmente permanece PENDENTE."""
    candidatos_publicaveis = list(resultado.candidatos_normais)
    nao_publicaveis: list[OcorrenciaNaoPublicavel] = []
    revisoes_com_estado: list[RevisaoComEstado] = []

    for revisao in resultado.revisoes_necessarias:
        obs_atuais = [oc.ordem_bancaria.ob for oc in revisao.ocorrencias]
        grupo_id = identidade_grupo(revisao.regra, obs_atuais)
        decisao = decisoes.get(grupo_id)

        if decisao is None:
            revisoes_com_estado.append(RevisaoComEstado(revisao=revisao, estado=EstadoRevisao.PENDENTE))
            continue

        fingerprint_atual = calcular_fingerprint(revisao.ocorrencias)
        if decisao.fingerprint_evidencias != fingerprint_atual:
            revisoes_com_estado.append(
                RevisaoComEstado(revisao=revisao, estado=EstadoRevisao.DESATUALIZADA, decisao=decisao)
            )
            continue

        if decisao.acao is AcaoDecisao.ADIAR:
            revisoes_com_estado.append(
                RevisaoComEstado(revisao=revisao, estado=EstadoRevisao.ADIADA, decisao=decisao)
            )
            continue

        for oc in revisao.ocorrencias:
            if oc.ordem_bancaria.ob in decisao.obs_publicaveis:
                candidatos_publicaveis.append(
                    CandidatoNormal(ocorrencia=oc, registros_controle=oc.registros_controle)
                )
            else:
                nao_publicaveis.append(OcorrenciaNaoPublicavel(ocorrencia=oc, decisao=decisao))
        revisoes_com_estado.append(
            RevisaoComEstado(revisao=revisao, estado=EstadoRevisao.DECIDIDA, decisao=decisao)
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
