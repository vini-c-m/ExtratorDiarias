import logging
from dataclasses import dataclass, field
from datetime import date, datetime

from openpyxl.worksheet.worksheet import Worksheet

from app.domain.entities.aviso_linha_ignorada import AvisoLinhaIgnorada
from app.domain.entities.registro_diaria_existente import RegistroDiariaExistente
from app.planilha.escritor_planilha import (
    COLUNA_CPF,
    COLUNA_PERIODO_FINAL,
    COLUNA_PERIODO_INICIAL,
    COLUNA_SEI,
    COLUNA_TRECHO,
    NOME_ABA,
    PRIMEIRA_LINHA_DADOS,
    _cpf_normalizado,  # noqa: PLC2701 — mesma reutilização de repositorio_servidores.py
)

__all__ = ["NOME_ABA", "ResultadoIndexacaoDiarias", "diarias_por_cpf"]

_logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ResultadoIndexacaoDiarias:
    """Mesma filosofia de `ResultadoPreenchimento`
    (`app/planilha/escritor_planilha.py`): um objeto nomeado em vez de uma
    tupla posicional, para o resultado de `diarias_por_cpf` continuar
    extensível (um novo campo futuro não quebra callsites existentes, ao
    contrário de inserir uma posição no meio de uma tupla)."""

    diarias: dict[str, list[RegistroDiariaExistente]] = field(default_factory=dict)
    avisos: list[AvisoLinhaIgnorada] = field(default_factory=list)


def _como_data(valor: object) -> date | None:
    """H/I vêm do openpyxl como `datetime.datetime` na esmagadora maioria
    das ~3 mil linhas (célula formatada como data) — mas a planilha oficial
    já acumulou anos de digitação manual, e algumas poucas linhas antigas
    têm essa coluna gravada como texto malformado (ex.: `'22/05/0206'`, ano
    com dígito faltando). `None` sinaliza para `diarias_por_cpf` pular a
    linha (ver `AvisoLinhaIgnorada`) em vez de propagar uma exceção — um
    dado histórico ruim não pode derrubar a consulta inteira (RN-11)."""
    if isinstance(valor, datetime):
        return valor.date()
    if isinstance(valor, date):
        return valor
    return None


def diarias_por_cpf(planilha: Worksheet) -> ResultadoIndexacaoDiarias:
    """Indexa `Controle de Diárias` por CPF normalizado — mesmo padrão de
    `escritor_planilha._seis_existentes`, mas agrupando em lista (um CPF
    pode ter várias diárias registradas) em vez de mapear para uma única
    linha. RN-02 (chave de duplicidade: CPF + período inicial + período
    final) — a comparação exata das duas datas fica a cargo de
    `app.domain.rules.conferencia.conferir`, este repositório só lê e
    agrupa.

    Linhas cujo período não é reconhecido como data são desconsideradas da
    indexação (nunca derrubam a consulta) e voltam também em
    `ResultadoIndexacaoDiarias.avisos`, um `AvisoLinhaIgnorada` por linha
    pulada — quem chama decide o que fazer com eles (hoje:
    `conferencia_service` só anexa ao resultado para uso interno futuro)."""
    diarias: dict[str, list[RegistroDiariaExistente]] = {}
    avisos: list[AvisoLinhaIgnorada] = []
    for linha in range(PRIMEIRA_LINHA_DADOS, planilha.max_row + 1):
        cpf_bruto = planilha[f"{COLUNA_CPF}{linha}"].value
        periodo_inicial_bruto = planilha[f"{COLUNA_PERIODO_INICIAL}{linha}"].value
        periodo_final_bruto = planilha[f"{COLUNA_PERIODO_FINAL}{linha}"].value
        if cpf_bruto in (None, "") or periodo_inicial_bruto in (None, "") or periodo_final_bruto in (
            None,
            "",
        ):
            continue

        cpf = _cpf_normalizado(cpf_bruto)
        if not cpf:
            continue

        periodo_inicial = _como_data(periodo_inicial_bruto)
        periodo_final = _como_data(periodo_final_bruto)
        if periodo_inicial is None or periodo_final is None:
            bruto_invalido = periodo_inicial_bruto if periodo_inicial is None else periodo_final_bruto
            motivo = f"Período não reconhecido como data: {bruto_invalido!r}"
            avisos.append(AvisoLinhaIgnorada(aba=NOME_ABA, linha=linha, motivo=motivo))
            _logger.warning("Linha %s de '%s' ignorada na conferência: %s", linha, NOME_ABA, motivo)
            continue

        sei = planilha[f"{COLUNA_SEI}{linha}"].value
        trecho = planilha[f"{COLUNA_TRECHO}{linha}"].value
        registro = RegistroDiariaExistente(
            linha=linha,
            sei=str(sei or "").strip(),
            cpf=cpf,
            periodo_inicial=periodo_inicial,
            periodo_final=periodo_final,
            trecho=str(trecho or "").strip(),
        )
        diarias.setdefault(cpf, []).append(registro)
    return ResultadoIndexacaoDiarias(diarias=diarias, avisos=avisos)
