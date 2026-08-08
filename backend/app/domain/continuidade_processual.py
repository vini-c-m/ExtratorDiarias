"""Continuidade Processual — localização de candidatos a "diária original"
de um Complemento de Diárias (decisão institucional revisada nesta
conversa, substituindo RN-07/RN-08 de 2026-07-21 documentadas em
`docs/central-conferencia/README.md`).

Princípio central, igual ao já praticado por `fontes_secundarias/` (ver
`app/extraction/enriquecimento/fontes_secundarias/base.py`): só evidência
documental explícita, nunca probabilidade/score, nunca vínculo automático.
Este módulo só ENCONTRA e EXPLICA candidatos — a decisão de reconhecer um
deles como a diária original é sempre do usuário.

CPF é a única âncora obrigatória (mesma pessoa). SEI nunca é obrigatório
(achado real: complementos podem repetir ou trocar de SEI livremente) — se
coincidir, vira só mais uma evidência exibida, nunca um filtro."""

from dataclasses import dataclass
from datetime import date

from app.domain.entities.candidato_diaria_original import CandidatoDiariaOriginal
from app.domain.entities.registro_analitico import RegistroAnalitico
from app.extraction.enriquecimento._texto import normalizar

# Pistas textuais literais citadas pelo usuário — buscadas no texto do
# processo de complemento (nunca no texto do candidato, que é só o motivo
# curto já gravado na planilha). Presença de qualquer uma reforça que o
# processo é mesmo um complemento/correção administrativa, mas nunca aponta
# sozinha para UM candidato específico — some às evidências de um candidato
# só quando ele já tem pelo menos um sinal estrutural (período, destino,
# DH ou SEI).
_PISTAS_TEXTUAIS_COMPLEMENTO = (
    "complemento",
    "valor faltante",
    "desconsiderar",
    "corrigir",
    "retificar",
)

# Janela de "período próximo" (heurística de apresentação de candidatos,
# não de decisão automática — sempre disclosed na própria evidência
# textual). Complementos reais investigados tratam da MESMA viagem, então
# um candidato cujo período do complemento nem se aproxima nunca é um
# candidato plausível.
_JANELA_PERIODO_PROXIMO_DIAS = 60


@dataclass(frozen=True)
class ConsultaComplemento:
    """O que se sabe sobre o processo de complemento no momento da busca de
    candidatos — deliberadamente mais enxuto que `Diaria` (que exige
    campos como `doc_origem`/`motivo` nem sempre disponíveis nos dois
    pontos de entrada desta busca: o Processamento de PDFs, que tem a
    `Diaria` completa recém-extraída, e a Central de Conferência, que só
    tem os campos que o usuário digitou nos formulários de Etapa 1/2)."""

    cpf: str
    periodo_inicial: date
    periodo_final: date
    cidade_destino: str | None = None
    sei: str | None = None
    texto_processo: str = ""


def _periodo_overlaps_ou_proximo(consulta: ConsultaComplemento, registro: RegistroAnalitico) -> bool:
    if (
        registro.periodo_final >= consulta.periodo_inicial
        and registro.periodo_inicial <= consulta.periodo_final
    ):
        return True
    gap = min(
        abs((registro.periodo_inicial - consulta.periodo_final).days),
        abs((consulta.periodo_inicial - registro.periodo_final).days),
    )
    return gap <= _JANELA_PERIODO_PROXIMO_DIAS


def _contem_pista_textual(texto_processo: str) -> str | None:
    texto_normalizado = normalizar(texto_processo)
    for pista in _PISTAS_TEXTUAIS_COMPLEMENTO:
        if normalizar(pista) in texto_normalizado:
            return pista
    return None


def _evidencias(consulta: ConsultaComplemento, registro: RegistroAnalitico) -> list[str]:
    evidencias: list[str] = []

    if _periodo_overlaps_ou_proximo(consulta, registro):
        evidencias.append(
            f"Período coincide ou é próximo: diária já lançada "
            f"{registro.periodo_inicial.isoformat()} a {registro.periodo_final.isoformat()} "
            f"(linha {registro.linha_planilha}), complemento "
            f"{consulta.periodo_inicial.isoformat()} a {consulta.periodo_final.isoformat()}."
        )

    if (
        registro.cidade_destino
        and consulta.cidade_destino
        and normalizar(registro.cidade_destino) == normalizar(consulta.cidade_destino)
    ):
        evidencias.append(f"Mesmo destino: {registro.cidade_destino}.")

    if registro.dh and registro.dh in consulta.texto_processo:
        evidencias.append(
            f'Documento Hábil da diária já lançada ("{registro.dh}") é citado no '
            "texto do processo de complemento."
        )

    if consulta.sei and registro.sei == consulta.sei:
        evidencias.append(
            "Mesmo número de SEI (não é exigido para ser candidato — só mais uma evidência)."
        )

    if evidencias:
        pista = _contem_pista_textual(consulta.texto_processo)
        if pista is not None:
            evidencias.append(
                f'O texto do processo de complemento contém o termo "{pista}", reforçando '
                "que se trata de uma correção/complementação administrativa."
            )

    return evidencias


def localizar_candidatos_diaria_original(
    consulta: ConsultaComplemento, registros_do_cpf: list[RegistroAnalitico]
) -> list[CandidatoDiariaOriginal]:
    """Devolve os candidatos a "diária original" do complemento descrito em
    `consulta`, entre as diárias já lançadas do MESMO CPF
    (`registros_do_cpf` — já filtradas por CPF por quem chama, via
    `app.consulta.repositorio_analitico.FiltrosDiaria(cpf=...)`).

    Só entra na lista um registro com pelo menos uma evidência
    (`_evidencias` não vazia) — mesmo CPF sozinho não é suficiente
    (uma pessoa pode ter dezenas de diárias não relacionadas). A lista
    devolvida pode ser vazia; nunca escolhe um candidato "mais provável"
    — cabe ao usuário confirmar manualmente."""
    candidatos = []
    for registro in registros_do_cpf:
        evidencias = _evidencias(consulta, registro)
        if evidencias:
            candidatos.append(CandidatoDiariaOriginal(registro=registro, evidencias=evidencias))
    return candidatos
