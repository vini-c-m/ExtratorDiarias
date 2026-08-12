"""Micro-sprint A — leitura dinâmica da aba `Tabela Valores` da Planilha
Oficial (mesma Base Local `.xlsx` já sincronizada e consultada por
`app/services/conferencia_service.py`, via `app/consulta/base_local.py`).

Decisão de arquitetura confirmada na auditoria financeira (2026-08-12,
`docs/central-conferencia/README.md` §2.3, e validação contra a Planilha
Oficial real): a Tabela Valores NUNCA é copiada/hardcoded no backend — ela é
sempre lida direto da mesma cópia da Planilha Oficial que a Central de
Conferência já usa para tudo o mais (Servidor/Duplicidade), reconstruída a
cada `base_local.sincronizar()`. Se o DIMCAC reajustar os valores na
Planilha, a próxima sincronização já reflete isso automaticamente — nunca
existe uma segunda fonte de verdade financeira para ficar dessincronizada.

Estrutura confirmada contra a Planilha Oficial real (2026-08-12): cabeçalho
("", "INTEGRAL", "PARCIAL") na linha 3, dados a partir da linha 4, colunas
A (UF/região), B (valor integral), C (valor parcial) — 28 entradas reais (27
UFs + Fernando de Noronha) no momento da auditoria. `PRIMEIRA_LINHA_DADOS`
começa em 4 pela mesma razão que `repositorio_servidores.PRIMEIRA_LINHA_DADOS`
começa em 2 (linha logo após o cabeçalho real, não uma suposição)."""

from decimal import Decimal

from openpyxl.worksheet.worksheet import Worksheet

from app.consulta.repositorio_diarias import _valor_como_numero  # noqa: PLC2701 — mesmo reuso já praticado em repositorio_analitico.py/base_local_sqlite.py
from app.domain.rules.valor_diaria_servidor import TarifaUF

NOME_ABA = "Tabela Valores"
PRIMEIRA_LINHA_DADOS = 4

COLUNA_UF = "A"
COLUNA_VALOR_INTEGRAL = "B"
COLUNA_VALOR_PARCIAL = "C"


class TabelaValoresEstruturalmenteInvalida(Exception):
    """A aba existe mas não tem nenhuma linha de dado reconhecível, ou uma
    linha tem UF preenchida com um valor unitário que não é um número válido
    — nunca calculado com um valor inventado/zerado nesses casos (P0 da
    Micro-sprint A). Mapeada pelo service para indisponibilidade financeira
    explícita (503), nunca um veredito de negócio. Uma linha genuinamente
    sem UF preenchida (fim da tabela ou linha em branco no meio) nunca cai
    aqui — só é ignorada em silêncio; um valor unitário presente mas
    ilegível é o único caso que interrompe a leitura, porque um valor
    financeiro errado nunca pode ser confundido com um valor ausente."""


def carregar_tabela_valores(planilha: Worksheet) -> dict[str, TarifaUF]:
    """Lê toda a aba `Tabela Valores` de uma Base Local `.xlsx` já aberta
    (mesmo padrão de `repositorio_servidores.servidores_por_cpf`: recebe a
    `Worksheet`, não o caminho — quem abre o workbook é sempre
    `conferencia_service._abrir_base_local`, nunca este módulo). Chave do
    dicionário: UF/região em maiúsculas, sem espaços nas pontas (RORAIMA na
    Planilha Oficial real tem um espaço final gravado na própria célula —
    normalizar aqui, no lado da leitura, é o que evita esse tipo de
    armadilha silenciosa sem alterar o dado original da Planilha)."""
    tarifas: dict[str, TarifaUF] = {}

    for linha in range(PRIMEIRA_LINHA_DADOS, planilha.max_row + 1):
        uf_bruta = planilha[f"{COLUNA_UF}{linha}"].value
        if uf_bruta in (None, ""):
            continue

        uf = str(uf_bruta).strip().upper()
        integral = _valor_como_numero(planilha[f"{COLUNA_VALOR_INTEGRAL}{linha}"].value)
        parcial = _valor_como_numero(planilha[f"{COLUNA_VALOR_PARCIAL}{linha}"].value)
        if integral is None or parcial is None:
            raise TabelaValoresEstruturalmenteInvalida(
                f"Tabela Valores: a linha {linha} (UF/região '{uf}') tem um valor "
                "unitário (integral ou parcial) que não pôde ser lido como número."
            )

        tarifas.setdefault(
            uf, TarifaUF(integral=Decimal(str(integral)), parcial=Decimal(str(parcial)))
        )

    if not tarifas:
        raise TabelaValoresEstruturalmenteInvalida(
            "Tabela Valores: nenhuma linha de UF/região foi encontrada na aba "
            f"'{NOME_ABA}' da Planilha Oficial configurada."
        )

    return tarifas
