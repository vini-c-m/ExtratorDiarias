from datetime import date

import pytest
from openpyxl import Workbook

from app.consulta.repositorio_controle_dimcac import (
    ControleDimcacEstruturalmenteInvalido,
    abrir_controle_dimcac,
    controle_dimcac_por_dh,
)


def _criar_arquivo_controle(caminho, *, nome_aba="Controle de Diárias", linhas=None):
    workbook = Workbook()
    planilha = workbook.active
    planilha.title = nome_aba
    for numero_linha, valores in enumerate(linhas or [], start=2):
        for coluna, valor in valores.items():
            planilha[f"{coluna}{numero_linha}"] = valor
    workbook.save(caminho)


def test_arquivo_inexistente_levanta_erro_explicito(tmp_path):
    caminho = str(tmp_path / "nao_existe.xlsx")
    with pytest.raises(ControleDimcacEstruturalmenteInvalido, match="não encontrado"):
        abrir_controle_dimcac(caminho)


def test_extensao_errada_levanta_erro_explicito(tmp_path):
    caminho = tmp_path / "controle.csv"
    caminho.write_text("DH,SEI\n")
    with pytest.raises(ControleDimcacEstruturalmenteInvalido, match=r"\.xlsx"):
        abrir_controle_dimcac(str(caminho))


def test_arquivo_corrompido_levanta_erro_explicito(tmp_path):
    caminho = tmp_path / "controle.xlsx"
    caminho.write_bytes(b"isto nao e um xlsx valido")
    with pytest.raises(ControleDimcacEstruturalmenteInvalido, match="corrompido"):
        abrir_controle_dimcac(str(caminho))


def test_aba_obrigatoria_ausente_levanta_erro_explicito(tmp_path):
    caminho = tmp_path / "controle.xlsx"
    _criar_arquivo_controle(caminho, nome_aba="Outra Aba")

    with pytest.raises(ControleDimcacEstruturalmenteInvalido, match="Controle de Diárias"):
        abrir_controle_dimcac(str(caminho))


def test_arquivo_valido_e_aberto_e_lido_de_ponta_a_ponta(tmp_path):
    caminho = tmp_path / "controle.xlsx"
    _criar_arquivo_controle(
        caminho,
        linhas=[
            {
                "A": "2026DH000001",
                "B": "19.20.0001.0000001/2026-01",
                "C": "PJTESTE",
                "D": 11111111111,
                "H": date(2026, 1, 8),
                "I": date(2026, 1, 10),
                "J": "RECIFE - GARANHUNS",
                "K": "CARRO",
                "L": "Motivo de teste",
                "P": 801.25,
            },
            {
                "A": "2026DH000001",
                "B": "19.20.0001.0000002/2026-02",
                "C": "PJTESTE",
                "D": 11111111111,
                "H": date(2026, 1, 8),
                "I": date(2026, 1, 10),
                "J": "RECIFE - GARANHUNS",
                "K": "CARRO",
                "L": "Motivo de teste",
                "P": 0.60,
            },
        ],
    )

    planilha = abrir_controle_dimcac(str(caminho))
    resultado = controle_dimcac_por_dh(planilha)

    assert "2026DH000001" in resultado.por_dh
    registros = resultado.por_dh["2026DH000001"]
    assert len(registros) == 2
    assert {r.sei for r in registros} == {
        "19.20.0001.0000001/2026-01",
        "19.20.0001.0000002/2026-02",
    }
    assert resultado.linhas_vazias_ignoradas == 0
    assert resultado.linhas_sem_dh == 0
