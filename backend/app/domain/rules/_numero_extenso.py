"""Conversão de número cardinal para texto por extenso, em português,
sempre no feminino (concorda com "DIÁRIAS", RN-13) — usado só para compor o
histórico do e-Fisco, nunca em nenhuma outra regra da Central.

Faixa suportada: 0–99. Nenhuma diária integral real chega perto desse
limite (seriam quase 100 pernoites numa única viagem); cobrir mais que isso
seria complexidade sem uso real."""

_UNIDADES = (
    "ZERO",
    "UMA",
    "DUAS",
    "TRÊS",
    "QUATRO",
    "CINCO",
    "SEIS",
    "SETE",
    "OITO",
    "NOVE",
)
_DEZ_A_DEZENOVE = (
    "DEZ",
    "ONZE",
    "DOZE",
    "TREZE",
    "QUATORZE",
    "QUINZE",
    "DEZESSEIS",
    "DEZESSETE",
    "DEZOITO",
    "DEZENOVE",
)
_DEZENAS = (
    "",
    "",
    "VINTE",
    "TRINTA",
    "QUARENTA",
    "CINQUENTA",
    "SESSENTA",
    "SETENTA",
    "OITENTA",
    "NOVENTA",
)


def numero_por_extenso_feminino(n: int) -> str:
    if n < 0 or n > 99:
        raise ValueError(f"numero_por_extenso_feminino só cobre 0–99, recebido: {n}")

    if n < 10:
        return _UNIDADES[n]
    if n < 20:
        return _DEZ_A_DEZENOVE[n - 10]

    dezena, unidade = divmod(n, 10)
    if unidade == 0:
        return _DEZENAS[dezena]
    return f"{_DEZENAS[dezena]} E {_UNIDADES[unidade]}"
