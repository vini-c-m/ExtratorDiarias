"""Modo Complemento de Diárias (RN-14) na Central de Conferência —
`POST /api/v1/conferencia` com `modo=COMPLEMENTO`, e o endpoint de
Continuidade Processual `POST /api/v1/conferencia/complemento/candidatos`.
Testes de wiring ponta a ponta (as regras em si já têm cobertura
exaustiva em `tests/unit/test_conferencia_complemento.py` e
`tests/unit/test_continuidade_processual.py`)."""

from fastapi.testclient import TestClient

from app.consulta import base_local
from app.main import app

client = TestClient(app)


def _sincronizar_base_local(caminho_planilha: str, tmp_path, monkeypatch):
    destino_base = tmp_path / "dados_usuario"
    monkeypatch.setenv(base_local.VAR_AMBIENTE_USER_DATA, str(destino_base))
    base_local.sincronizar(caminho_planilha)


def test_conferencia_modo_complemento_fica_apto_apesar_da_duplicidade(
    caminho_planilha_conferencia_teste, tmp_path, monkeypatch
):
    caminho = caminho_planilha_conferencia_teste()
    _sincronizar_base_local(caminho, tmp_path, monkeypatch)

    resposta = client.post(
        "/api/v1/conferencia",
        json={
            "cpf": "12345678901",
            "periodo_inicial": "2026-07-21",
            "periodo_final": "2026-07-23",
            "modo": "COMPLEMENTO",
        },
    )

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["veredito"] == "APTO_PARA_PROCESSAMENTO"
    assert corpo["duplicidade"] is not None  # continua visível, só não bloqueia


def test_conferencia_sem_modo_continua_modo_padrao_e_bloqueia_duplicidade(
    caminho_planilha_conferencia_teste, tmp_path, monkeypatch
):
    caminho = caminho_planilha_conferencia_teste()
    _sincronizar_base_local(caminho, tmp_path, monkeypatch)

    resposta = client.post(
        "/api/v1/conferencia",
        json={
            "cpf": "12345678901",
            "periodo_inicial": "2026-07-21",
            "periodo_final": "2026-07-23",
        },
    )

    assert resposta.status_code == 200
    assert resposta.json()["veredito"] == "REVISAR"


def test_historico_complemento_200_com_base_sincronizada(
    caminho_planilha_conferencia_teste, tmp_path, monkeypatch
):
    caminho = caminho_planilha_conferencia_teste()
    _sincronizar_base_local(caminho, tmp_path, monkeypatch)

    resposta = client.post(
        "/api/v1/conferencia/historico-complemento",
        json={
            "cpf": "12345678901",
            "periodo_inicial": "2026-07-21",
            "periodo_final": "2026-07-23",
            "sei": "19.20.0902.0004521/2026-11",
            "destino": "Garanhuns",
        },
    )

    assert resposta.status_code == 200
    corpo = resposta.json()
    # RN-16 (2026-08-07) — mesmo modelo institucional (RN-13), sem sufixo:
    # padrão institucional (quantidade_diaria_parcial=0) omite "PARCIAL".
    assert corpo["texto"] == (
        "19.20.0902.0004521/2026-11 MARIA APARECIDA SOUZA "
        "02 (DUAS) DIÁRIAS INTEGRAIS, DEST. GARANHUNS, NO PERÍODO DE 21/07/2026 A 23/07/2026."
    )


def test_historico_complemento_com_parcial_documentada_inclui_e_uma_parcial(
    caminho_planilha_conferencia_teste, tmp_path, monkeypatch
):
    caminho = caminho_planilha_conferencia_teste()
    _sincronizar_base_local(caminho, tmp_path, monkeypatch)

    resposta = client.post(
        "/api/v1/conferencia/historico-complemento",
        json={
            "cpf": "12345678901",
            "periodo_inicial": "2026-07-21",
            "periodo_final": "2026-07-23",
            "sei": "19.20.0902.0004521/2026-11",
            "destino": "Garanhuns",
            "quantidade_diaria_parcial": 1,
        },
    )

    assert resposta.status_code == 200
    assert "02 (DUAS) DIÁRIAS INTEGRAIS E UMA PARCIAL," in resposta.json()["texto"]


def test_historico_complemento_404_quando_servidor_nao_encontrado(
    caminho_planilha_conferencia_teste, tmp_path, monkeypatch
):
    caminho = caminho_planilha_conferencia_teste()
    _sincronizar_base_local(caminho, tmp_path, monkeypatch)

    resposta = client.post(
        "/api/v1/conferencia/historico-complemento",
        json={
            "cpf": "00000000000",
            "periodo_inicial": "2026-07-21",
            "periodo_final": "2026-07-23",
            "sei": "19.20.0902.0004521/2026-11",
            "destino": "Garanhuns",
        },
    )

    assert resposta.status_code == 404


def test_candidatos_complemento_200_com_base_sincronizada(
    caminho_planilha_conferencia_teste, tmp_path, monkeypatch
):
    caminho = caminho_planilha_conferencia_teste()
    _sincronizar_base_local(caminho, tmp_path, monkeypatch)

    resposta = client.post(
        "/api/v1/conferencia/complemento/candidatos",
        json={
            "cpf": "12345678901",
            "periodo_inicial": "2026-07-21",
            "periodo_final": "2026-07-23",
        },
    )

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert "candidatos" in corpo
    assert isinstance(corpo["candidatos"], list)


def test_candidatos_complemento_503_quando_base_local_indisponivel(tmp_path, monkeypatch):
    monkeypatch.setenv(base_local.VAR_AMBIENTE_USER_DATA, str(tmp_path / "vazio"))

    resposta = client.post(
        "/api/v1/conferencia/complemento/candidatos",
        json={
            "cpf": "12345678901",
            "periodo_inicial": "2026-06-01",
            "periodo_final": "2026-06-03",
        },
    )

    assert resposta.status_code == 503


def test_candidatos_complemento_422_periodo_final_antes_do_inicial():
    resposta = client.post(
        "/api/v1/conferencia/complemento/candidatos",
        json={
            "cpf": "12345678901",
            "periodo_inicial": "2026-06-03",
            "periodo_final": "2026-06-01",
        },
    )

    assert resposta.status_code == 422


def test_candidatos_complemento_aceita_campos_opcionais(
    caminho_planilha_conferencia_teste, tmp_path, monkeypatch
):
    caminho = caminho_planilha_conferencia_teste()
    _sincronizar_base_local(caminho, tmp_path, monkeypatch)

    resposta = client.post(
        "/api/v1/conferencia/complemento/candidatos",
        json={
            "cpf": "12345678901",
            "periodo_inicial": "2026-07-21",
            "periodo_final": "2026-07-23",
            "cidade_destino": "Garanhuns",
            "sei": "19.20.0902.0004521/2026-11",
            "texto_processo": "complemento de diária",
        },
    )

    assert resposta.status_code == 200
