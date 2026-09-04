"""Plano de Migração E-Fisco, Sprint A — testes de integração de
`abrir_base_efisco` (arquivo real em disco, `tmp_path`). Mesmo padrão de
`test_abrir_base_ordens_bancarias.py`. Dados sintéticos."""

from datetime import date

import pytest
from openpyxl import Workbook

from app.consulta.repositorio_efisco import (
    EfiscoEstruturalmenteInvalido,
    abrir_base_efisco,
    linhas_efisco,
)

_CABECALHO = [
    "Ordem Bancária",
    "Número do DH",
    "Situação",
    "Data da OB",
    "Data Pagto./Devol.",
    "Valor Bruto",
    "Observação",
    "Código da Natureza de Despesa",
    "Razão Social do Credor",
    "Número do documento do Credor",
]


def _criar_arquivo_efisco(caminho, cabecalho=None, linhas=None, nome_aba="OB"):
    workbook = Workbook()
    planilha = workbook.active
    planilha.title = nome_aba
    planilha.append(cabecalho if cabecalho is not None else _CABECALHO)
    for linha in linhas or []:
        planilha.append(linha)
    workbook.save(caminho)


def test_arquivo_inexistente_levanta_erro_explicito(tmp_path):
    caminho = str(tmp_path / "nao_existe.xlsx")
    with pytest.raises(EfiscoEstruturalmenteInvalido, match="não encontrado"):
        abrir_base_efisco(caminho)


def test_extensao_errada_levanta_erro_explicito(tmp_path):
    caminho = tmp_path / "efisco.csv"
    caminho.write_text("Ordem Bancária,Situação\n")
    with pytest.raises(EfiscoEstruturalmenteInvalido, match=r"\.xlsx"):
        abrir_base_efisco(str(caminho))


def test_arquivo_corrompido_levanta_erro_explicito(tmp_path):
    caminho = tmp_path / "efisco.xlsx"
    caminho.write_bytes(b"isto nao e um xlsx valido")
    with pytest.raises(EfiscoEstruturalmenteInvalido, match="corrompido"):
        abrir_base_efisco(str(caminho))


def test_arquivo_vazio_zero_bytes_levanta_erro_explicito(tmp_path):
    caminho = tmp_path / "efisco.xlsx"
    caminho.write_bytes(b"")
    with pytest.raises(EfiscoEstruturalmenteInvalido, match="corrompido"):
        abrir_base_efisco(str(caminho))


def test_coluna_obrigatoria_ausente_no_arquivo_real_levanta_erro_explicito(tmp_path):
    caminho = tmp_path / "efisco.xlsx"
    cabecalho_incompleto = [c for c in _CABECALHO if c != "Número do documento do Credor"]
    _criar_arquivo_efisco(caminho, cabecalho=cabecalho_incompleto)

    with pytest.raises(EfiscoEstruturalmenteInvalido, match="Número do documento do Credor"):
        abrir_base_efisco(str(caminho))


def test_aba_com_nome_generico_e_aceita():
    """A Base E-Fisco real de referência tem uma única aba chamada 'OB' —
    a validação nunca deve exigir um nome literal de aba, só a estrutura de
    colunas. Simulado aqui com o nome padrão do openpyxl ('Sheet'), sem
    renomear — o ponto do teste é não exigir nome nenhum."""
    workbook = Workbook()
    planilha = workbook.active
    planilha.append(_CABECALHO)

    from app.consulta.repositorio_efisco import _selecionar_aba

    aba_selecionada = _selecionar_aba(workbook)
    assert aba_selecionada is planilha


def test_arquivo_valido_e_aberto_e_lido_de_ponta_a_ponta(tmp_path):
    caminho = tmp_path / "efisco.xlsx"
    _criar_arquivo_efisco(
        caminho,
        linhas=[
            [
                "2026OB000001",
                "2026DH000001",
                "Paga",
                "10/02/2026",
                "10/02/2026 09:01:40",
                154.09,
                "PAGTO 2026LE000001 SEI 19.20.0001.0000001/2026-01 FULANO DE TAL UMA DIARIA PARCIAL, DEST RECIFE",
                "33901400",
                "FULANO DE TAL",
                "111.222.333-44",
            ],
            [
                "2026OB000002",
                "",
                "Corrente",
                "10/02/2026",
                "10/02/2026 09:05:00",
                5000000,
                "Transferência entre contas da própria UG",
                "",
                "PROCURADORIA GERAL DA JUSTICA",
                "24.417.065/0001-03",
            ],
        ],
    )

    planilha = abrir_base_efisco(str(caminho))
    resultado = linhas_efisco(planilha)

    assert len(resultado.linhas) == 2
    assert resultado.linhas_ignoradas == 0
    assert resultado.linhas[0].ob == "2026OB000001"
    assert resultado.linhas[0].data_ob == date(2026, 2, 10)
    assert resultado.linhas[1].dh is None
    assert resultado.linhas[1].natureza is None
