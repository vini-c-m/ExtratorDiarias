"""Micro-sprint 3B — motor de decisão de CONTEÚDO do Relatório de Diárias
— Portal da Transparência. Classifica o resultado do motor de reconciliação
(Micro-sprint 2/3A) em candidatos normais (publicáveis automaticamente) e
casos que precisam de revisão humana (RN01–RN07,
`docs/relatorio-transparencia/README.md` § 2).

Fora de escopo desta Micro-sprint, deliberadamente: tela de revisão,
persistência de decisão humana, trava de geração, geração do XLSX final —
tudo isso é Micro-sprint 3C. Este módulo só produz a classificação; a
decisão sobre casos em `revisoes_necessarias` nunca é tomada aqui."""

from collections import defaultdict
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import date

from app.domain.entities.ordem_bancaria import OrdemBancaria
from app.domain.entities.registro_controle import RegistroControle
from app.domain.relatorio_transparencia.competencia import IntervaloAcumulado
from app.domain.relatorio_transparencia.motor_reconciliacao import ResultadoReconciliacao
from app.domain.relatorio_transparencia.normalizacao_trecho import normalizar_trecho

__all__ = [
    "OcorrenciaFinanceira",
    "CandidatoNormal",
    "RevisaoNecessaria",
    "DiagnosticoRepeticaoFisica",
    "ResultadoRelatorio",
    "classificar",
]


@dataclass(frozen=True)
class OcorrenciaFinanceira:
    """Unidade mínima de rastreabilidade usada em candidatos normais,
    diagnósticos e revisões: uma OB junto do DH ao qual está associada na
    reconciliação, e a proveniência do Controle DIMCAC daquele DH
    (`registros_controle`, pode ser vazia — DH só presente na Base OB,
    achado real a investigar por regra futura, não por este motor).

    Micro-sprint 3C.1: `registros_controle` é preenchido uma única vez, em
    `classificar()`, e acompanha a ocorrência por qualquer caminho que ela
    tome depois (candidato normal, diagnóstico de repetição física, ou
    revisão) — decisão humana muda PUBLICAÇÃO, nunca PROVENIÊNCIA (achado
    da revisão do confronto: antes desta correção, uma ocorrência que
    passava por REVISAO_NECESSARIA perdia a referência ao Controle ao
    virar candidata publicável)."""

    dh: str
    ordem_bancaria: OrdemBancaria
    registros_controle: list[RegistroControle] = field(default_factory=list)


@dataclass(frozen=True)
class CandidatoNormal:
    """Uma ocorrência financeira sem nenhum gatilho de revisão nesta
    competência (RN01) — publicável automaticamente. `registros_controle`
    espelha `ocorrencia.registros_controle` (nunca recalculado à parte —
    fonte única de verdade é a própria `OcorrenciaFinanceira`)."""

    ocorrencia: OcorrenciaFinanceira
    registros_controle: list[RegistroControle] = field(default_factory=list)


@dataclass(frozen=True)
class RevisaoNecessaria:
    """Um caso que o motor não decide sozinho — precisa de decisão humana
    (Micro-sprint 3C) antes de qualquer publicação. `regra` é o
    identificador curto (RN02/RN04/RN07) só para diagnóstico/rastreio,
    nunca usado para decidir automaticamente o desfecho."""

    regra: str
    motivo: str
    ocorrencias: list[OcorrenciaFinanceira]
    evidencias: dict[str, object] = field(default_factory=dict)


@dataclass(frozen=True)
class DiagnosticoRepeticaoFisica:
    """Repetição física do mesmo número de OB na Base OB, resolvida sem
    ambiguidade (I11) — nunca silenciosa: mesmo colapsada em um único
    candidato, toda ocorrência física fica registrada aqui."""

    ob: str
    ocorrencias: list[OcorrenciaFinanceira]


@dataclass(frozen=True)
class ResultadoRelatorio:
    candidatos_normais: list[CandidatoNormal] = field(default_factory=list)
    revisoes_necessarias: list[RevisaoNecessaria] = field(default_factory=list)
    diagnosticos_repeticao_fisica: list[DiagnosticoRepeticaoFisica] = field(default_factory=list)


# Confronto QA Codex / QA-RT-01 — lista original (Micro-sprint 3B) cobria só
# trecho/motivo/situacao/data_pagamento. Campos adicionados aqui e por quê
# (nenhum inventado — todos já são materialmente relevantes segundo RN01-07/
# I01-I03/RN02 ou já saem publicados no XLSX final,
# `app/planilha/escritor_relatorio_transparencia.py`):
#   dh          — I01 ("DH é o elo estrutural primário") / I03 (1 DH -> N
#                 OBs sempre preservado): duas ocorrências físicas da mesma
#                 OB sob DHs diferentes são, por definição, dois documentos
#                 administrativos distintos — nunca "a mesma ocorrência".
#   cpf         — identifica o beneficiário (§1: "quem recebeu"); CPF
#                 divergente é a pessoa errada recebendo o pagamento.
#   sei         — identifica o processo administrativo (mesmo raciocínio de
#                 `dh`; I02 só proíbe usar SEI para deduplicar
#                 destrutivamente — aqui SEI divergente faz o oposto, força
#                 revisão em vez de fundir).
#   periodo_inicial/periodo_final — a viagem em si (coluna E/F do XLSX
#                 final); períodos diferentes são viagens diferentes.
#   cargo, transporte — colunas D/H do XLSX final (com precedência do
#                 Controle DIMCAC, mas fallback para a Base OB quando o
#                 Controle não resolve — se as linhas físicas da Base OB já
#                 divergem aqui, o mesmo raciocínio de "nunca escolher à
#                 toa" do fallback do escritor se aplica antes mesmo de
#                 chegar lá).
#   restituicao — RN02 trata RESTITUIÇÃO como campo sensível o bastante
#                 para, sozinho, forçar RN04 quando o valor pago não é
#                 zero; divergência entre linhas físicas é o mesmo tipo de
#                 ambiguidade que RN02 já recusa resolver sozinha.
# `nome` foi deliberadamente NÃO incluído: nenhuma RN o cita isoladamente e
# `cpf` já cobre a divergência de identidade; incluir texto livre (sujeito a
# variação cosmética de digitação) sem evidência específica seria inventar
# regra nova — se necessário, tratar em confronto separado.
# `duplicidade` continua fora (RN03: nunca decide nada isoladamente) e
# `linha` continua fora (é só posição física na planilha, nunca dado
# publicável — mesmo critério já usado por `calcular_fingerprint`).
_CAMPOS_DIVERGENCIA_FISICA: dict[str, Callable[[OcorrenciaFinanceira], object]] = {
    "dh": lambda o: o.dh,
    "trecho": lambda o: o.ordem_bancaria.trecho,
    "motivo": lambda o: o.ordem_bancaria.motivo,
    "situacao": lambda o: o.ordem_bancaria.situacao,
    "data_pagamento": lambda o: o.ordem_bancaria.data_pagamento,
    "cpf": lambda o: o.ordem_bancaria.cpf,
    "sei": lambda o: o.ordem_bancaria.sei,
    "periodo_inicial": lambda o: o.ordem_bancaria.periodo_inicial,
    "periodo_final": lambda o: o.ordem_bancaria.periodo_final,
    "cargo": lambda o: o.ordem_bancaria.cargo,
    "transporte": lambda o: o.ordem_bancaria.transporte,
    "restituicao": lambda o: o.ordem_bancaria.restituicao,
}


def _campos_divergentes(ocorrencias: list[OcorrenciaFinanceira]) -> list[str]:
    return [
        nome
        for nome, extrator in _CAMPOS_DIVERGENCIA_FISICA.items()
        if len({extrator(o) for o in ocorrencias}) > 1
    ]


def _resolver_repeticao_fisica(
    ocorrencias_por_ob: dict[str, list[OcorrenciaFinanceira]],
) -> tuple[list[OcorrenciaFinanceira], list[RevisaoNecessaria], list[DiagnosticoRepeticaoFisica]]:
    """I11: nenhuma ocorrência física desaparece silenciosamente. Quando o
    mesmo número de OB aparece em mais de uma linha da Base OB, resolve por
    equivalência (nunca por escolha arbitrária): linhas com valor zero
    convivendo com uma linha de valor real (achado real — artefato de
    exportação em lote) colapsam para a linha de valor real SE E SOMENTE SE
    todo o resto também for idêntico (I11b: "resto idêntico" é a própria
    descrição empírica que fundamenta a equivalência — nunca presumida sem
    checar); valores reais divergentes, ou qualquer outro campo
    materialmente relevante divergente entre QUALQUER par de linhas físicas
    (inclusive a de valor zero), vira RN04 (não é seguro decidir sozinho
    qual versão publicar).

    Confronto QA Codex / QA-RT-01 (achado real, corrigido aqui): a versão
    anterior comparava só as linhas de valor NÃO-zero entre si
    (`primarias`), o que deixava a linha de valor zero inteiramente fora de
    qualquer checagem de divergência — motivo/trecho/CPF/DH/período/etc.
    completamente diferentes na linha zero nunca eram detectados. A
    checagem agora roda sobre TODAS as ocorrências físicas do grupo,
    sempre; `primarias`/`valores_nao_zero` continuam existindo só para
    escolher QUAL linha vira a representante quando o grupo é de fato
    equivalente, nunca para decidir o que é comparado."""
    representantes: list[OcorrenciaFinanceira] = []
    revisoes: list[RevisaoNecessaria] = []
    diagnosticos: list[DiagnosticoRepeticaoFisica] = []

    for numero_ob, ocorrencias in ocorrencias_por_ob.items():
        if len(ocorrencias) == 1:
            representantes.append(ocorrencias[0])
            continue

        valores_nao_zero = {
            o.ordem_bancaria.valor for o in ocorrencias if o.ordem_bancaria.valor not in (None, 0)
        }
        if len(valores_nao_zero) > 1:
            revisoes.append(
                RevisaoNecessaria(
                    regra="RN04",
                    motivo=(
                        f"OB {numero_ob} aparece {len(ocorrencias)}x fisicamente na Base OB "
                        "com valores financeiros diferentes e não-zero — não é seguro decidir "
                        "automaticamente qual é o valor correto."
                    ),
                    ocorrencias=ocorrencias,
                    evidencias={"valores": sorted(valores_nao_zero)},
                )
            )
            continue

        # QA-RT-01 — compara TODAS as ocorrências físicas do grupo (nunca só
        # as de valor não-zero) contra todos os campos materialmente
        # relevantes; só decide qual linha representa o grupo DEPOIS de
        # confirmar que não há divergência.
        divergentes = _campos_divergentes(ocorrencias)
        if divergentes:
            revisoes.append(
                RevisaoNecessaria(
                    regra="RN04",
                    motivo=(
                        f"OB {numero_ob} aparece {len(ocorrencias)}x fisicamente na Base OB "
                        f"com divergência em campo(s) materialmente relevante(s): {', '.join(divergentes)}."
                    ),
                    ocorrencias=ocorrencias,
                    evidencias={"campos_divergentes": divergentes},
                )
            )
            continue

        diagnosticos.append(DiagnosticoRepeticaoFisica(ob=numero_ob, ocorrencias=ocorrencias))
        candidatas_representante = (
            [o for o in ocorrencias if o.ordem_bancaria.valor in valores_nao_zero]
            if valores_nao_zero
            else ocorrencias
        )
        representantes.append(min(candidatas_representante, key=lambda o: o.ordem_bancaria.linha))

    return representantes, revisoes, diagnosticos


def _chave_suspeita_rn07(ordem: OrdemBancaria) -> tuple[str, date, date, float, str] | None:
    if None in (ordem.cpf, ordem.periodo_inicial, ordem.periodo_final, ordem.valor, ordem.trecho):
        return None
    trecho_normalizado = normalizar_trecho(ordem.trecho)
    if trecho_normalizado is None:
        return None
    return (ordem.cpf, ordem.periodo_inicial, ordem.periodo_final, round(ordem.valor, 2), trecho_normalizado)


def classificar(
    resultado: ResultadoReconciliacao,
    intervalo: IntervaloAcumulado,
) -> ResultadoRelatorio:
    """Aplica RN01–RN07 sobre o resultado já reconciliado (Micro-sprint
    2/3A), para a janela temporal `intervalo` (RN06). Função pura, sem I/O
    — quem lê/reconcilia as fontes continua sendo `app/consulta/` +
    `motor_reconciliacao.reconciliar`, nunca este módulo."""
    ocorrencias_por_ob: dict[str, list[OcorrenciaFinanceira]] = defaultdict(list)
    for dh, documento in resultado.documentos.items():
        registros_controle_do_dh = list(documento.controle)
        for ordem in documento.ordens_bancarias:
            ocorrencias_por_ob[ordem.ob].append(
                OcorrenciaFinanceira(dh=dh, ordem_bancaria=ordem, registros_controle=registros_controle_do_dh)
            )

    # I11 — repetição física do mesmo número de OB, resolvida antes de tudo.
    representantes, revisoes, diagnosticos = _resolver_repeticao_fisica(ocorrencias_por_ob)

    # RN05/RN06 — competência pela DATA OB; DATA OB ausente é conflito
    # material (RN04), nunca um filtro silencioso.
    dentro_da_competencia: list[OcorrenciaFinanceira] = []
    for oc in representantes:
        data_pagamento = oc.ordem_bancaria.data_pagamento
        if data_pagamento is None:
            revisoes.append(
                RevisaoNecessaria(
                    regra="RN04",
                    motivo=(
                        f"OB {oc.ordem_bancaria.ob} (DH {oc.dh}) não tem DATA OB reconhecível — "
                        "não é seguro determinar a competência deste pagamento automaticamente."
                    ),
                    ocorrencias=[oc],
                )
            )
            continue
        if not intervalo.contem(data_pagamento.date()):
            continue  # fora da janela desta competência — nem candidato, nem revisão aqui
        dentro_da_competencia.append(oc)

    # RN02/RN04 — valor financeiro ausente, ou restituição sem evidência
    # de comportamento seguro (restituição parcial).
    prontas: list[OcorrenciaFinanceira] = []
    for oc in dentro_da_competencia:
        ordem = oc.ordem_bancaria
        if ordem.valor is None:
            revisoes.append(
                RevisaoNecessaria(
                    regra="RN04",
                    motivo=f"OB {ordem.ob} (DH {oc.dh}) não tem valor financeiro reconhecível na Base OB.",
                    ocorrencias=[oc],
                )
            )
            continue
        if ordem.restituicao not in (None, 0) and ordem.valor != 0:
            revisoes.append(
                RevisaoNecessaria(
                    regra="RN02",
                    motivo=(
                        f"OB {ordem.ob} (DH {oc.dh}) tem RESTITUIÇÃO registrada "
                        f"({ordem.restituicao}) mas o valor pago não é zero ({ordem.valor}) — "
                        "restituição parcial ainda sem evidência real suficiente para decidir "
                        "automaticamente."
                    ),
                    ocorrencias=[oc],
                    evidencias={"restituicao": ordem.restituicao, "valor": ordem.valor},
                )
            )
            continue
        prontas.append(oc)

    # RN07 — suspeita de duplicidade financeira entre OBs DISTINTAS.
    grupos_suspeitos: dict[tuple, list[OcorrenciaFinanceira]] = defaultdict(list)
    for oc in prontas:
        chave = _chave_suspeita_rn07(oc.ordem_bancaria)
        if chave is not None:
            grupos_suspeitos[chave].append(oc)

    obs_em_revisao_rn07: set[str] = set()
    for chave, ocorrencias_grupo in grupos_suspeitos.items():
        numeros_ob_distintos = {oc.ordem_bancaria.ob for oc in ocorrencias_grupo}
        if len(numeros_ob_distintos) < 2:
            continue
        cpf, periodo_inicial, periodo_final, valor, trecho_normalizado = chave
        revisoes.append(
            RevisaoNecessaria(
                regra="RN07",
                motivo=(
                    f"{len(numeros_ob_distintos)} OBs distintas com o mesmo CPF, período, "
                    "valor e trecho normalizado — possível pagamento financeiro em "
                    "duplicidade. Suspeita, não confirmação; a decisão de quais OBs "
                    "publicar é humana."
                ),
                ocorrencias=ocorrencias_grupo,
                evidencias={
                    "cpf": cpf,
                    "periodo_inicial": periodo_inicial,
                    "periodo_final": periodo_final,
                    "valor": valor,
                    "trecho_normalizado": trecho_normalizado,
                },
            )
        )
        obs_em_revisao_rn07.update(numeros_ob_distintos)

    candidatos = [
        CandidatoNormal(ocorrencia=oc, registros_controle=oc.registros_controle)
        for oc in prontas
        if oc.ordem_bancaria.ob not in obs_em_revisao_rn07
    ]

    return ResultadoRelatorio(
        candidatos_normais=candidatos,
        revisoes_necessarias=revisoes,
        diagnosticos_repeticao_fisica=diagnosticos,
    )
