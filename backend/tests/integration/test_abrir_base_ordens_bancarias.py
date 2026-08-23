from datetime import date

import pytest
from openpyxl import Workbook

from app.consulta.repositorio_ordens_bancarias import (
    OrdensBancariasEstruturalmenteInvalida,
    abrir_base_ordens_bancarias,
    ordens_bancarias_por_dh,
)

_CABECALHO = [
    "DH",
    "OB",
    "SITUAÇÃO",
    "DATA OB",
    "SEI",
    "CPF",
    "NOME",
    "CARGO",
    "PERÍODO INICIAL",
    "PERÍODO FINAL",
    "TRECHO",
    "TRANSPORTE",
    "MOTIVO",
    "VALOR DA DIÁRIA",
    "RESTITUIÇÃO",
    "DUPLICIDADE",
    "ITEM DE GASTO",
]


def _criar_arquivo_base_ob(caminho, cabecalho=None, linhas=None):
    workbook = Workbook()
    planilha = workbook.active
    planilha.title = "Sheet1"
    planilha.append(cabecalho if cabecalho is not None else _CABECALHO)
    for linha in linhas or []:
        planilha.append(linha)
    workbook.save(caminho)


def test_arquivo_inexistente_levanta_erro_explicito(tmp_path):
    caminho = str(tmp_path / "nao_existe.xlsx")
    with pytest.raises(OrdensBancariasEstruturalmenteInvalida, match="não encontrado"):
        abrir_base_ordens_bancarias(caminho)


def test_extensao_errada_levanta_erro_explicito(tmp_path):
    caminho = tmp_path / "base_ob.csv"
    caminho.write_text("DH,OB\n")
    with pytest.raises(OrdensBancariasEstruturalmenteInvalida, match=r"\.xlsx"):
        abrir_base_ordens_bancarias(str(caminho))


def test_arquivo_corrompido_levanta_erro_explicito(tmp_path):
    caminho = tmp_path / "base_ob.xlsx"
    caminho.write_bytes(b"isto nao e um xlsx valido")
    with pytest.raises(OrdensBancariasEstruturalmenteInvalida, match="corrompido"):
        abrir_base_ordens_bancarias(str(caminho))


def test_coluna_obrigatoria_ausente_no_arquivo_real_levanta_erro_explicito(tmp_path):
    caminho = tmp_path / "base_ob.xlsx"
    cabecalho_incompleto = [c for c in _CABECALHO if c != "DUPLICIDADE"]
    _criar_arquivo_base_ob(caminho, cabecalho=cabecalho_incompleto)

    with pytest.raises(OrdensBancariasEstruturalmenteInvalida, match="DUPLICIDADE"):
        abrir_base_ordens_bancarias(str(caminho))


def test_arquivo_valido_e_aberto_e_lido_de_ponta_a_ponta(tmp_path):
    caminho = tmp_path / "base_ob.xlsx"
    _criar_arquivo_base_ob(
        caminho,
        linhas=[
            [
                "2026DH000001",
                "2026OB000001",
                "Paga",
                "12/05/2026 08:38:14",
                "19.20.0001.0000001/2026-01",
                11111111111,
                "FULANO DE TAL",
                "Cargo Teste",
                date(2026, 5, 13),
                date(2026, 5, 16),
                "RECIFE - GARANHUNS",
                "CARRO",
                "Motivo de teste",
                801.25,
                None,
                "Único",
                "33901401",
            ],
            [
                "2026DH000001",
                "2026OB000002",
                "Paga",
                "13/05/2026 08:52:04",
                "19.20.0001.0000001/2026-01",
                11111111111,
                "FULANO DE TAL",
                "Cargo Teste",
                date(2026, 5, 13),
                date(2026, 5, 16),
                "RECIFE - GARANHUNS",
                "CARRO",
                "Motivo de teste",
                0.60,
                None,
                "Único",
                "33901401",
            ],
        ],
    )

    planilha = abrir_base_ordens_bancarias(str(caminho))
    resultado = ordens_bancarias_por_dh(planilha)

    assert "2026DH000001" in resultado.por_dh
    registros = resultado.por_dh["2026DH000001"]
    assert len(registros) == 2
    assert {r.ob for r in registros} == {"2026OB000001", "2026OB000002"}
    assert resultado.linhas_ignoradas == 0
    assert resultado.avisos == []


def test_aba_unica_com_nome_generico_e_aceita():
    """A Base OB real de referência tem uma única aba chamada 'Sheet1' (nome
    de exportação, não escolhido por ninguém) — a validação nunca deve
    exigir um nome literal de aba, só a estrutura de colunas. Simulado aqui
    com o nome padrão que o próprio openpyxl atribui a uma planilha nova
    ('Sheet'), sem renomear — o ponto do teste é não exigir nome nenhum."""
    workbook = Workbook()
    planilha = workbook.active
    planilha.append(_CABECALHO)

    from app.consulta.repositorio_ordens_bancarias import _selecionar_aba

    aba_selecionada = _selecionar_aba(workbook)
    assert aba_selecionada is planilha
