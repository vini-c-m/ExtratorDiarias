import pytest

from app.domain.rules._numero_extenso import numero_por_extenso_feminino


@pytest.mark.parametrize(
    "numero,esperado",
    [
        (0, "ZERO"),
        (1, "UMA"),
        (2, "DUAS"),
        (3, "TRÊS"),
        (9, "NOVE"),
        (10, "DEZ"),
        (15, "QUINZE"),
        (19, "DEZENOVE"),
        (20, "VINTE"),
        (21, "VINTE E UMA"),
        (30, "TRINTA"),
        (99, "NOVENTA E NOVE"),
    ],
)
def test_numero_por_extenso_feminino(numero: int, esperado: str) -> None:
    assert numero_por_extenso_feminino(numero) == esperado


@pytest.mark.parametrize("numero", [-1, 100])
def test_numero_por_extenso_feminino_fora_da_faixa(numero: int) -> None:
    with pytest.raises(ValueError):
        numero_por_extenso_feminino(numero)
