from openpyxl.worksheet.worksheet import Worksheet

from app.domain.entities.servidor import Servidor

# Sprint 13 — reaproveita a normalização de CPF já homologada em
# `escritor_planilha`, exatamente como o doc arquitetural manda (nunca
# duplicar), em vez de reimplementar a mesma lógica aqui.
from app.planilha.escritor_planilha import _cpf_normalizado  # noqa: PLC2701

NOME_ABA = "Dados"
PRIMEIRA_LINHA_DADOS = 2

# RN-01, § 5 riscos 1 e 2 do doc arquitetural: a coluna A está rotulada
# "SEI" na planilha oficial, mas o conteúdo real é sempre CPF — nomear
# sempre `cpf` no código, nunca `sei`, ao ler este índice. E a fórmula de
# PREVIDÊNCIA lê `Dados!D`, não `Dados!G` ("REGIME DE PREVIDÊNCIA", nome
# parecido mas coluna diferente) — atenção redobrada, é um erro fácil de
# cometer numa leitura apressada.
COLUNA_CPF = "A"
COLUNA_MATRICULA = "B"
COLUNA_NOME = "C"
COLUNA_PREVIDENCIA = "D"
COLUNA_CARGO = "E"
COLUNA_SITUACAO = "H"


def servidores_por_cpf(planilha: Worksheet) -> dict[str, Servidor]:
    """Indexa a aba `Dados` por CPF normalizado — mesmo padrão de
    `escritor_planilha._historico_doc_origem_por_cpf` (um laço, um
    dicionário, primeira ocorrência vence). RN-01 (consulta cadastral).

    Sprint 17.3 — passou a ler também `matricula`/`situacao` (colunas B/H),
    usadas pela Central Analítica (busca por matrícula, filtro por
    situação); a Central de Conferência continua sem exibi-los (decisão de
    UI já homologada), sem nenhuma mudança de comportamento para ela."""
    servidores: dict[str, Servidor] = {}
    for linha in range(PRIMEIRA_LINHA_DADOS, planilha.max_row + 1):
        cpf_bruto = planilha[f"{COLUNA_CPF}{linha}"].value
        if cpf_bruto in (None, ""):
            continue
        cpf = _cpf_normalizado(cpf_bruto)
        if not cpf:
            continue

        nome = planilha[f"{COLUNA_NOME}{linha}"].value
        previdencia = planilha[f"{COLUNA_PREVIDENCIA}{linha}"].value
        cargo = planilha[f"{COLUNA_CARGO}{linha}"].value
        matricula = planilha[f"{COLUNA_MATRICULA}{linha}"].value
        situacao = planilha[f"{COLUNA_SITUACAO}{linha}"].value
        servidores.setdefault(
            cpf,
            Servidor(
                cpf=cpf,
                nome=str(nome or "").strip(),
                cargo=str(cargo or "").strip(),
                previdencia=str(previdencia or "").strip(),
                matricula=str(matricula or "").strip(),
                situacao=str(situacao or "").strip(),
            ),
        )
    return servidores
