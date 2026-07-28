from fastapi.testclient import TestClient

from app.consulta import base_local
from app.main import app

client = TestClient(app)


def _sincronizar_base_local(caminho_planilha: str, tmp_path, monkeypatch):
    destino_base = tmp_path / "dados_usuario"
    monkeypatch.setenv(base_local.VAR_AMBIENTE_USER_DATA, str(destino_base))
    base_local.sincronizar(caminho_planilha)


def test_conferencia_apto_para_processamento(
    caminho_planilha_conferencia_teste, tmp_path, monkeypatch
):
    caminho = caminho_planilha_conferencia_teste()
    _sincronizar_base_local(caminho, tmp_path, monkeypatch)

    resposta = client.post(
        "/api/v1/conferencia",
        json={"cpf": "12345678901", "periodo_inicial": "2026-06-01", "periodo_final": "2026-06-03"},
    )

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["veredito"] == "APTO_PARA_PROCESSAMENTO"
    assert corpo["servidor"]["nome"] == "Maria Aparecida Souza"
    assert corpo["duplicidade"] is None


def test_conferencia_revisar_por_duplicidade(
    caminho_planilha_conferencia_teste, tmp_path, monkeypatch
):
    caminho = caminho_planilha_conferencia_teste()
    _sincronizar_base_local(caminho, tmp_path, monkeypatch)

    resposta = client.post(
        "/api/v1/conferencia",
        # mesmo CPF+período já gravado na fixture (linha 2)
        json={"cpf": "12345678901", "periodo_inicial": "2026-07-21", "periodo_final": "2026-07-23"},
    )

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["veredito"] == "REVISAR"
    assert corpo["duplicidade"]["sei"] == "19.20.0902.0004521/2026-11"


def test_conferencia_503_quando_base_local_indisponivel(tmp_path, monkeypatch):
    monkeypatch.setenv(base_local.VAR_AMBIENTE_USER_DATA, str(tmp_path / "vazio"))

    resposta = client.post(
        "/api/v1/conferencia",
        json={"cpf": "12345678901", "periodo_inicial": "2026-06-01", "periodo_final": "2026-06-03"},
    )

    assert resposta.status_code == 503


def test_conferencia_422_periodo_final_antes_do_inicial():
    resposta = client.post(
        "/api/v1/conferencia",
        json={"cpf": "12345678901", "periodo_inicial": "2026-06-03", "periodo_final": "2026-06-01"},
    )
    assert resposta.status_code == 422


def test_historico_gerado_com_sucesso(caminho_planilha_conferencia_teste, tmp_path, monkeypatch):
    caminho = caminho_planilha_conferencia_teste()
    _sincronizar_base_local(caminho, tmp_path, monkeypatch)

    resposta = client.post(
        "/api/v1/conferencia/historico",
        json={
            "cpf": "12345678901",
            "periodo_inicial": "2026-07-21",
            "periodo_final": "2026-07-23",
            "sei": "19.20.0903.0030720/2024-36",
            "origem": "Recife",
            "destino": "Garanhuns",
        },
    )

    assert resposta.status_code == 200
    texto = resposta.json()["texto"]
    assert texto.startswith("19.20.0903.0030720/2024-36 MARIA APARECIDA SOUZA")
    assert "02 (DUAS) DIÁRIAS INTEGRAIS E UMA PARCIAL" in texto


def test_historico_404_quando_servidor_nao_encontrado(
    caminho_planilha_conferencia_teste, tmp_path, monkeypatch
):
    caminho = caminho_planilha_conferencia_teste()
    _sincronizar_base_local(caminho, tmp_path, monkeypatch)

    resposta = client.post(
        "/api/v1/conferencia/historico",
        json={
            "cpf": "00000000000",
            "periodo_inicial": "2026-07-21",
            "periodo_final": "2026-07-23",
            "sei": "19.20.0903.0030720/2024-36",
            "origem": "Recife",
            "destino": "Garanhuns",
        },
    )

    assert resposta.status_code == 404


def test_historico_422_quando_origem_e_destino_iguais(
    caminho_planilha_conferencia_teste, tmp_path, monkeypatch
):
    caminho = caminho_planilha_conferencia_teste()
    _sincronizar_base_local(caminho, tmp_path, monkeypatch)

    resposta = client.post(
        "/api/v1/conferencia/historico",
        json={
            "cpf": "12345678901",
            "periodo_inicial": "2026-07-21",
            "periodo_final": "2026-07-23",
            "sei": "19.20.0903.0030720/2024-36",
            "origem": "Recife",
            "destino": "Recife",
        },
    )

    assert resposta.status_code == 422


def test_historico_422_quando_origem_vazia(caminho_planilha_conferencia_teste, tmp_path, monkeypatch):
    caminho = caminho_planilha_conferencia_teste()
    _sincronizar_base_local(caminho, tmp_path, monkeypatch)

    resposta = client.post(
        "/api/v1/conferencia/historico",
        json={
            "cpf": "12345678901",
            "periodo_inicial": "2026-07-21",
            "periodo_final": "2026-07-23",
            "sei": "19.20.0903.0030720/2024-36",
            "origem": "  ",
            "destino": "Garanhuns",
        },
    )

    assert resposta.status_code == 422
