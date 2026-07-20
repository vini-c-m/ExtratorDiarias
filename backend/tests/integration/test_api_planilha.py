import os

from fastapi.testclient import TestClient
from openpyxl import load_workbook

from app.main import app

client = TestClient(app)

_DIARIA = {
    "sei": "19.20.0000.0000001/2025-99",
    "doc_origem": "PJNOVO",
    "cpf": "99999999999",
    "periodo_inicial": "2025-03-01",
    "periodo_final": "2025-03-03",
    "cidade_origem": "RECIFE",
    "cidade_destino": "OLINDA",
    "motivo": "Diligência de teste",
}


def test_post_planilha_preencher_grava_na_copia_de_teste(caminho_planilha_teste):
    caminho = caminho_planilha_teste()

    resposta = client.post(
        "/api/v1/planilha/preencher",
        json={
            "caminho_planilha": caminho,
            "itens": [{"arquivo_origem": "arquivo.pdf", "diaria": _DIARIA}],
        },
    )

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["total_gravado"] == 1
    assert corpo["duplicadas_ignoradas"] == 0
    assert corpo["linha_inicial"] == 4
    assert corpo["linha_final"] == 4
    assert corpo["itens"] == [
        {
            "arquivo_origem": "arquivo.pdf",
            "sei": _DIARIA["sei"],
            "categoria": "inserido",
            "linha": 4,
        }
    ]
    assert os.path.isdir(corpo["pasta_resultados"])
    assert corpo["caminho_relatorio"].endswith(".html")
    assert os.path.isfile(corpo["caminho_log"])

    planilha = load_workbook(caminho)["Controle de Diárias"]
    assert planilha["B4"].value == _DIARIA["sei"]


def test_post_planilha_preencher_bug1_duplicidade_no_lote(caminho_planilha_teste):
    """Mesmo PDF (mesmo SEI) enviado duas vezes na mesma requisição — só uma
    diária pode ser gravada, a outra vira 'duplicado no lote'."""
    caminho = caminho_planilha_teste()
    sei_novo = "19.20.0000.0000020/2025-00"

    resposta = client.post(
        "/api/v1/planilha/preencher",
        json={
            "caminho_planilha": caminho,
            "itens": [
                {"arquivo_origem": "a.pdf", "diaria": {**_DIARIA, "sei": sei_novo}},
                {"arquivo_origem": "b.pdf", "diaria": {**_DIARIA, "sei": sei_novo}},
            ],
        },
    )

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["total_gravado"] == 1
    assert corpo["duplicadas_ignoradas"] == 1
    assert corpo["itens"][0]["categoria"] == "inserido"
    assert corpo["itens"][0]["linha"] == 4
    assert corpo["itens"][1]["categoria"] == "duplicado_no_lote"
    assert corpo["itens"][1]["linha"] is None

    planilha = load_workbook(caminho)["Controle de Diárias"]
    assert planilha["B4"].value == sei_novo
    assert planilha["B5"].value is None


def test_post_planilha_preencher_bug2_duplicidade_na_planilha_informa_linha(
    caminho_planilha_teste,
):
    """SEI que já existe na planilha (linha 2 da fixture) não pode virar
    linha nova, e a resposta precisa apontar em qual linha ele já existe."""
    caminho = caminho_planilha_teste()
    sei_ja_existente = "19.20.0000.0000001/2025-00"

    resposta = client.post(
        "/api/v1/planilha/preencher",
        json={
            "caminho_planilha": caminho,
            "itens": [
                {"arquivo_origem": "a.pdf", "diaria": {**_DIARIA, "sei": sei_ja_existente}},
            ],
            "erros": [{"arquivo_origem": "c.pdf", "motivos": ["Falha ao ler o PDF"]}],
        },
    )

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["total_gravado"] == 0
    assert corpo["duplicadas_ignoradas"] == 1
    assert corpo["itens"] == [
        {
            "arquivo_origem": "a.pdf",
            "sei": sei_ja_existente,
            "categoria": "duplicado_na_planilha",
            "linha": 2,
        }
    ]

    planilha = load_workbook(caminho)["Controle de Diárias"]
    assert planilha["B4"].value is None

    conteudo = open(corpo["caminho_relatorio"], encoding="utf-8").read()
    assert "PDFs analisados" in conteudo
    assert "a.pdf" in conteudo

    conteudo_log = open(corpo["caminho_log"], encoding="utf-8").read()
    assert "já existe na linha 2" in conteudo_log


def test_post_planilha_preencher_grava_dh_transporte_local_e_lista_avisos_no_relatorio(
    caminho_planilha_teste,
):
    """Sprint 03: quando a diária vem com documento_habil/transporte/
    estado_destino preenchidos, eles são gravados nas colunas A/K/Q. Quando
    um arquivo tem avisos (campo não identificado com segurança), eles
    aparecem no relatório e no log — sem afetar a deduplicação por SEI."""
    caminho = caminho_planilha_teste()
    sei_completo = "19.20.0000.0000030/2025-00"
    sei_incompleto = "19.20.0000.0000031/2025-00"

    resposta = client.post(
        "/api/v1/planilha/preencher",
        json={
            "caminho_planilha": caminho,
            "itens": [
                {
                    "arquivo_origem": "completo.pdf",
                    "diaria": {
                        **_DIARIA,
                        "sei": sei_completo,
                        "documento_habil": "2025DH009999",
                        "transporte": "AVIÃO",
                        "estado_destino": "SÃO PAULO",
                    },
                },
                {
                    "arquivo_origem": "incompleto.pdf",
                    "diaria": {**_DIARIA, "sei": sei_incompleto},
                },
            ],
            "avisos": [
                {
                    "arquivo_origem": "incompleto.pdf",
                    "mensagens": [
                        "Transporte não identificado no processo — necessita revisão manual."
                    ],
                }
            ],
        },
    )

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["total_gravado"] == 2

    planilha = load_workbook(caminho)["Controle de Diárias"]
    assert planilha["A4"].value == "2025DH009999"
    assert planilha["K4"].value == "AVIÃO"
    assert planilha["Q4"].value == "SÃO PAULO"
    # A segunda diária não trouxe DH/transporte/estado — colunas ficam vazias.
    assert planilha["A5"].value is None
    assert planilha["K5"].value is None
    assert planilha["Q5"].value is None

    conteudo_relatorio = open(corpo["caminho_relatorio"], encoding="utf-8").read()
    # Sprint 05.1: a hierarquia de revisão substituiu a antiga seção plana
    # "Revisão manual necessária" pelo selo "Revisão recomendada".
    assert "Revisão recomendada" in conteudo_relatorio
    assert "incompleto.pdf" in conteudo_relatorio

    conteudo_log = open(corpo["caminho_log"], encoding="utf-8").read()
    assert "REVISAO_MANUAL arquivo: incompleto.pdf" in conteudo_log


def test_post_planilha_preencher_planilha_inexistente_retorna_422():
    resposta = client.post(
        "/api/v1/planilha/preencher",
        json={
            "caminho_planilha": "C:/caminho/que/nao/existe.xlsx",
            "itens": [{"arquivo_origem": "arquivo.pdf", "diaria": _DIARIA}],
        },
    )

    assert resposta.status_code == 422
