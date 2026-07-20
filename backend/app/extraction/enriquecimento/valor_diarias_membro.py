import re

# Cabeçalho do despacho do GABPGJ (Gabinete do Procurador-Geral de Justiça) —
# validado contra os 3 processos reais de Diária de Membro desta Sprint, ex.:
# "DESPACHO PGJ Nº 1377629/2026 - GABPGJ", "DESPACHO Nº 2680/2025 - GABPGJ".
# Âncora na linha inteira do cabeçalho (não em qualquer menção solta a
# "GABPGJ" no corpo de outro despacho, como o da DIMCAC que só encaminha o
# processo "Ao GABPGJ para autorização") — é o que evita falso positivo.
_CABECALHO_DESPACHO_GABPGJ = re.compile(
    r"^DESPACHO[^\n]*-\s*(?:GABPGJ|GABINETE\s+DO\s+PROCURADOR[-\s]GERAL\s+DE\s+JUSTI[ÇC]A)\s*$",
    re.IGNORECASE | re.MULTILINE,
)

# "no valor de R$ 652,96" (diária parcial única) ou "no valor total de
# R$ 1.069,14" (duas ou mais diárias) — mesmo despacho, duas redações.
_VALOR_DIARIAS = re.compile(
    r"VALOR\s+(?:TOTAL\s+)?DE\s*R\$\s*(\d{1,3}(?:\.\d{3})*,\d{2})", re.IGNORECASE
)

# Distância, em caracteres, do fim do cabeçalho até onde o valor é buscado —
# grande o bastante para cobrir o texto do despacho (nos 3 processos reais,
# o valor aparece a menos de 400 caracteres do cabeçalho) e pequeno o
# bastante para não alcançar valores de outro documento do mesmo processo
# (ex.: tabela de passagens aéreas, a mais de 5000 caracteres de distância).
_JANELA_APOS_CABECALHO = 1500


def extrair_valor_diarias_membro(texto: str) -> tuple[str | None, str | None]:
    """Procura, só dentro do(s) despacho(s) do GABPGJ, o valor autorizado das
    diárias — nunca em qualquer outro trecho do processo. Chamada apenas
    para processos já identificados como Diária de Membro: o despacho GABPGJ
    não identifica o tipo do processo, só fornece este valor (coluna P)."""
    cabecalhos = list(_CABECALHO_DESPACHO_GABPGJ.finditer(texto))
    if not cabecalhos:
        return (
            None,
            "Despacho GABPGJ não localizado — não foi possível extrair o valor das diárias.",
        )

    valores: set[str] = set()
    for cabecalho in cabecalhos:
        janela = texto[cabecalho.end() : cabecalho.end() + _JANELA_APOS_CABECALHO]
        valor = _VALOR_DIARIAS.search(janela)
        if valor:
            valores.add(valor.group(1))

    if len(valores) == 1:
        return next(iter(valores)), None

    if not valores:
        return (
            None,
            "Despacho GABPGJ localizado, mas o valor das diárias não foi encontrado — "
            "necessita revisão manual.",
        )

    return (
        None,
        f"Mais de um valor de diárias encontrado no processo ({', '.join(sorted(valores))}) "
        "— necessita revisão manual.",
    )
