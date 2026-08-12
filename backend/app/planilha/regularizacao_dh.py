"""Micro-sprint D ("Escrita Exclusiva do DH na Central de Regularização") —
única capacidade de escrita desta central: SEI + linha (já conhecida, RN
"não é duplicidade" das Micro-sprints B/C) → escreve SOMENTE a coluna DH.

P0 (confirmado pelo usuário em todas as Micro-sprints anteriores):
"Registrar DH não pode alterar nenhuma outra célula." Mesma disciplina de
`app.planilha.finalizador_planilha.gravar_finalizacao` — escrita mínima,
sem tocar borda/fonte/alinhamento (a linha já existe, já tem sua própria
formatação)."""

from openpyxl.worksheet.worksheet import Worksheet

from app.planilha.escritor_planilha import COLUNA_DH, COLUNA_SEI


def sei_na_linha(planilha: Worksheet, linha: int) -> str | None:
    """Lê a coluna B (SEI) exatamente na linha informada — nunca busca por
    texto (RN de segurança desta Sprint: localização por `linha_planilha`,
    já conhecida via `RegistroAnalitico`, elimina a ambiguidade de SEI
    duplicado que uma busca textual teria no modo Complemento)."""
    valor = planilha[f"{COLUNA_SEI}{linha}"].value
    return str(valor).strip() if valor not in (None, "") else None


def dh_na_linha(planilha: Worksheet, linha: int) -> str | None:
    valor = planilha[f"{COLUNA_DH}{linha}"].value
    return str(valor).strip() if valor not in (None, "") else None


def gravar_dh(planilha: Worksheet, linha: int, dh: str) -> None:
    """Escrita mínima — só a célula DH (coluna A). Nunca toca borda/fonte/
    alinhamento (mesmo padrão de `finalizador_planilha.gravar_finalizacao`),
    nunca toca nenhuma outra coluna."""
    planilha[f"{COLUNA_DH}{linha}"].value = dh
