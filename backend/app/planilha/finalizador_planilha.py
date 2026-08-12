from dataclasses import dataclass
from datetime import date, datetime
from enum import Enum

from openpyxl.worksheet.worksheet import Worksheet

from app.planilha.escritor_planilha import (
    COLUNA_AVISO,
    COLUNA_CPF,
    COLUNA_DH,
    COLUNA_PERIODO_FINAL,
    COLUNA_PERIODO_INICIAL,
    COLUNA_SEI,
    COLUNA_TRECHO,
    PRIMEIRA_LINHA_DADOS,
)

# "FINALIZAR DIÁRIAS" — únicas duas colunas que este fluxo grava, nunca as
# mesmas de `escritor_planilha` (que nunca as toca). Confirmado contra a
# Planilha Oficial real: texto, valor padrão "SIM" em CAIXA ALTA.
COLUNA_COMPROVANTES = "X"
COLUNA_CONFIRMACAO_DIARIAS = "Y"
VALOR_FINALIZADO = "SIM"


class EstadoLinhaFinalizacao(str, Enum):
    PRONTA = "pronta"  # X e Y vazios — grava os dois
    # Regra definitiva (Sprint pré-build, 2026-08-11): exatamente uma das
    # duas colunas já é "SIM" e a outra está vazia — grava SÓ a que falta,
    # nunca reescreve a que já existe. Diferente de PARCIAL: aqui o valor
    # que já está lá é exatamente "SIM", nunca um valor fora do padrão.
    INCOMPLETA = "incompleta"
    JA_FINALIZADA = "ja_finalizada"  # X e Y já "SIM" — NO-OP, nada é gravado
    PARCIAL = "parcial"  # valor fora do padrão (ex.: "SM", "NÃO") — revisão manual, nunca gravado


def _normalizar_xy(valor: object) -> str:
    """'' para vazio, 'SIM' quando o valor (ignorando caixa/espaços) é
    exatamente "sim" — cobre as variações reais já digitadas na planilha
    ("SIM", "sim") —, senão devolve o texto original em CAIXA ALTA (typos
    reais como "SM"/"SI M" caem aqui e nunca são tratados como já
    finalizados nem sobrescritos silenciosamente)."""
    texto = str(valor or "").strip()
    if not texto:
        return ""
    if texto.strip().upper() == VALOR_FINALIZADO:
        return VALOR_FINALIZADO
    return texto.upper()


def classificar_estado(x_bruto: object, y_bruto: object) -> EstadoLinhaFinalizacao:
    x, y = _normalizar_xy(x_bruto), _normalizar_xy(y_bruto)
    if x == "" and y == "":
        return EstadoLinhaFinalizacao.PRONTA
    if x == VALOR_FINALIZADO and y == VALOR_FINALIZADO:
        return EstadoLinhaFinalizacao.JA_FINALIZADA
    if x == VALOR_FINALIZADO and y == "":
        return EstadoLinhaFinalizacao.INCOMPLETA
    if x == "" and y == VALOR_FINALIZADO:
        return EstadoLinhaFinalizacao.INCOMPLETA
    return EstadoLinhaFinalizacao.PARCIAL


def _como_data(valor: object) -> date | None:
    if isinstance(valor, datetime):
        return valor.date()
    if isinstance(valor, date):
        return valor
    return None


def _aviso_texto(valor: object) -> str | None:
    """AA normalmente é a fórmula nativa `=VLOOKUP(...)` de alerta de
    duplicidade (ver `escritor_planilha.COLUNA_AVISO`) — sem `data_only`,
    isso vem como a própria string da fórmula, não o resultado calculado, e
    não tem serventia para exibição aqui. Só o texto fixo ("COMPLEMENTO DE
    DIÁRIAS", gravado no modo Complemento) é mostrado."""
    texto = str(valor or "").strip()
    if not texto or texto.startswith("="):
        return None
    return texto


@dataclass(frozen=True)
class CandidatoLinhaFinalizacao:
    """Uma linha candidata a receber X=SIM/Y=SIM para um SEI — CPF/período/
    trecho/DH são só para o usuário comparar visualmente quando o mesmo SEI
    aparece em mais de uma linha (ex.: diária + complemento); nunca usados
    para escolher automaticamente entre as candidatas."""

    linha: int
    sei: str
    cpf: str | None
    periodo_inicial: date | None
    periodo_final: date | None
    trecho: str | None
    dh: str | None
    aviso: str | None
    x_atual: str | None
    y_atual: str | None
    estado: EstadoLinhaFinalizacao


def localizar_candidatos(planilha: Worksheet, sei: str) -> list[CandidatoLinhaFinalizacao]:
    """Todas as linhas de `Controle de Diárias` cujo SEI (coluna B) é
    exatamente igual ao informado — SEI nunca é garantidamente único (ver
    modo Complemento de Diárias), então esta função sempre devolve TODAS as
    correspondências, nunca só a primeira."""
    sei_normalizado = sei.strip()
    candidatos: list[CandidatoLinhaFinalizacao] = []
    for linha in range(PRIMEIRA_LINHA_DADOS, planilha.max_row + 1):
        valor_sei = planilha[f"{COLUNA_SEI}{linha}"].value
        if str(valor_sei or "").strip() != sei_normalizado:
            continue

        x_atual = planilha[f"{COLUNA_COMPROVANTES}{linha}"].value
        y_atual = planilha[f"{COLUNA_CONFIRMACAO_DIARIAS}{linha}"].value
        cpf_bruto = planilha[f"{COLUNA_CPF}{linha}"].value
        candidatos.append(
            CandidatoLinhaFinalizacao(
                linha=linha,
                sei=sei_normalizado,
                cpf=str(int(cpf_bruto)) if isinstance(cpf_bruto, (int, float)) else (
                    str(cpf_bruto).strip() or None
                ),
                periodo_inicial=_como_data(planilha[f"{COLUNA_PERIODO_INICIAL}{linha}"].value),
                periodo_final=_como_data(planilha[f"{COLUNA_PERIODO_FINAL}{linha}"].value),
                trecho=str(planilha[f"{COLUNA_TRECHO}{linha}"].value or "").strip() or None,
                dh=str(planilha[f"{COLUNA_DH}{linha}"].value or "").strip() or None,
                aviso=_aviso_texto(planilha[f"{COLUNA_AVISO}{linha}"].value),
                x_atual=str(x_atual).strip() if x_atual not in (None, "") else None,
                y_atual=str(y_atual).strip() if y_atual not in (None, "") else None,
                estado=classificar_estado(x_atual, y_atual),
            )
        )
    return candidatos


def gravar_finalizacao(planilha: Worksheet, linha: int) -> None:
    """Escrita mínima (decisão do usuário): só X e Y, sem tocar borda/fonte/
    alinhamento — a linha já existe e já tem sua própria formatação, ao
    contrário de `escritor_planilha._escrever_celula` (que formata uma
    linha nova em branco).

    Regra definitiva (Sprint pré-build, 2026-08-11) — grava só a célula que
    ainda não é "SIM": para uma linha PRONTA (as duas vazias) grava as duas;
    para uma linha INCOMPLETA (uma já "SIM") grava só a que falta, sem
    reescrever a que já existia. Nunca chamada para uma linha JA_FINALIZADA
    (as duas já "SIM") — quem chama (`finalizacao_service.confirmar`) já
    filtra isso antes; mesmo assim, se fosse chamada, o resultado seria o
    mesmo NO-OP (nenhuma das duas condições abaixo dispara)."""
    if _normalizar_xy(planilha[f"{COLUNA_COMPROVANTES}{linha}"].value) != VALOR_FINALIZADO:
        planilha[f"{COLUNA_COMPROVANTES}{linha}"].value = VALOR_FINALIZADO
    if _normalizar_xy(planilha[f"{COLUNA_CONFIRMACAO_DIARIAS}{linha}"].value) != VALOR_FINALIZADO:
        planilha[f"{COLUNA_CONFIRMACAO_DIARIAS}{linha}"].value = VALOR_FINALIZADO
