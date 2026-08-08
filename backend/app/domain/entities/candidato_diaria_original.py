from dataclasses import dataclass

from app.domain.entities.registro_analitico import RegistroAnalitico


@dataclass(frozen=True)
class CandidatoDiariaOriginal:
    """Um candidato a ser a diária original de um Complemento de Diárias
    (ver `app.domain.continuidade_processual`). Embrulha um
    `RegistroAnalitico` já lançado na planilha + a lista de evidências
    documentais que o tornaram candidato.

    `evidencias` é sempre texto simples, em linguagem de negócio (ex.
    "mesmo CPF e período coincide com a diária original", "SEI é
    diferente, mas o motivo da diária original menciona 'complemento'")
    — nunca uma nota numérica ou probabilidade. O sistema nunca vincula
    um candidato automaticamente; a lista é sempre apresentada ao usuário
    para confirmação manual."""

    registro: RegistroAnalitico
    evidencias: list[str]
