import os

from fastapi.testclient import TestClient

from app.infra.config import configuracao_app as config
from app.main import app

client = TestClient(app)


def _isolar_diretorio_configuracao(monkeypatch, tmp_path):
    monkeypatch.setenv(config.VAR_AMBIENTE_USER_DATA, str(tmp_path / "dados_usuario"))


def test_get_configuracao_quando_nunca_configurado(monkeypatch, tmp_path):
    _isolar_diretorio_configuracao(monkeypatch, tmp_path)

    resposta = client.get("/api/v1/configuracao")

    assert resposta.status_code == 200
    assert resposta.json() == {"configurado": False}


def test_post_configuracao_planilha_invalida_nao_persiste(monkeypatch, tmp_path):
    _isolar_diretorio_configuracao(monkeypatch, tmp_path)

    resposta = client.post(
        "/api/v1/configuracao",
        json={"caminho_planilha_oficial": str(tmp_path / "nao_existe.xlsx")},
    )

    assert resposta.status_code == 422
    assert "não encontrado" in resposta.json()["detail"]
    assert config.carregar(diretorio_base=tmp_path / "dados_usuario") is None


def test_post_configuracao_valida_persiste_e_responde_configurado(
    monkeypatch, tmp_path, caminho_planilha_configuracao_teste
):
    _isolar_diretorio_configuracao(monkeypatch, tmp_path)
    caminho_planilha = caminho_planilha_configuracao_teste()

    resposta = client.post(
        "/api/v1/configuracao",
        json={"caminho_planilha_oficial": caminho_planilha},
    )

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["configurado"] is True
    assert corpo["planilha_acessivel"] is True
    assert corpo["requer_revalidacao"] is False
    assert corpo["caminho_planilha_oficial"] == caminho_planilha
    assert "configurado_em" in corpo

    assert config.carregar(diretorio_base=tmp_path / "dados_usuario") is not None


def test_get_configuracao_apos_configurar_segue_acessivel(
    monkeypatch, tmp_path, caminho_planilha_configuracao_teste
):
    _isolar_diretorio_configuracao(monkeypatch, tmp_path)
    caminho_planilha = caminho_planilha_configuracao_teste()
    client.post("/api/v1/configuracao", json={"caminho_planilha_oficial": caminho_planilha})

    resposta = client.get("/api/v1/configuracao")

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo == {
        "configurado": True,
        "planilha_acessivel": True,
        "requer_revalidacao": False,
        "caminho_planilha_oficial": caminho_planilha,
        "configurado_em": corpo["configurado_em"],
    }


def test_get_configuracao_planilha_excluida_apos_configurar(
    monkeypatch, tmp_path, caminho_planilha_configuracao_teste
):
    _isolar_diretorio_configuracao(monkeypatch, tmp_path)
    caminho_planilha = caminho_planilha_configuracao_teste()
    client.post("/api/v1/configuracao", json={"caminho_planilha_oficial": caminho_planilha})

    os.remove(caminho_planilha)

    resposta = client.get("/api/v1/configuracao")

    assert resposta.status_code == 200
    assert resposta.json() == {"configurado": True, "planilha_acessivel": False}


def test_get_configuracao_requer_revalidacao_apos_estrutura_divergir(
    monkeypatch, tmp_path, caminho_planilha_configuracao_teste
):
    from openpyxl import Workbook

    _isolar_diretorio_configuracao(monkeypatch, tmp_path)
    caminho_planilha = caminho_planilha_configuracao_teste()
    client.post("/api/v1/configuracao", json={"caminho_planilha_oficial": caminho_planilha})

    workbook = Workbook()
    workbook.active.title = "Controle de Diárias"
    workbook.save(caminho_planilha)

    resposta = client.get("/api/v1/configuracao")

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["configurado"] is True
    assert corpo["planilha_acessivel"] is True
    assert corpo["requer_revalidacao"] is True


def test_alterar_planilha_oficial_reutiliza_o_mesmo_post(
    monkeypatch, tmp_path, caminho_planilha_configuracao_teste
):
    """'Alterar Planilha Oficial' (§8) é o mesmo endpoint — trocar a
    configuração não exige que o caminho anterior ainda esteja acessível."""
    _isolar_diretorio_configuracao(monkeypatch, tmp_path)
    caminho_v1 = caminho_planilha_configuracao_teste(nome_arquivo="v1.xlsx")
    client.post("/api/v1/configuracao", json={"caminho_planilha_oficial": caminho_v1})
    os.remove(caminho_v1)

    caminho_v2 = caminho_planilha_configuracao_teste(nome_arquivo="v2.xlsx")
    resposta = client.post("/api/v1/configuracao", json={"caminho_planilha_oficial": caminho_v2})

    assert resposta.status_code == 200
    assert resposta.json()["caminho_planilha_oficial"] == caminho_v2

    verificacao = client.get("/api/v1/configuracao")
    assert verificacao.json()["caminho_planilha_oficial"] == caminho_v2
