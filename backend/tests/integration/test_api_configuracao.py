import os

from fastapi.testclient import TestClient

from app.consulta import base_local_sqlite
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


def test_post_configuracao_valida_reconstroi_base_local_imediatamente(
    monkeypatch, tmp_path, caminho_planilha_configuracao_teste
):
    """Sprint 18.7 — a Central Analítica não pode mais depender de um
    processamento de PDF nem de um clique manual em "Sincronizar agora"
    para ficar disponível: salvar a Configuração Inicial já reconstrói a
    Base Local (Gatilho A), de forma síncrona."""
    _isolar_diretorio_configuracao(monkeypatch, tmp_path)
    caminho_planilha = caminho_planilha_configuracao_teste()

    resposta = client.post(
        "/api/v1/configuracao",
        json={"caminho_planilha_oficial": caminho_planilha},
    )

    assert resposta.status_code == 200

    caminho_sqlite = base_local_sqlite.caminho_base_local_sqlite(diretorio_base=tmp_path / "dados_usuario")
    assert caminho_sqlite.is_file()

    verificacao = client.get("/api/v1/analitica/sincronizacao")
    assert verificacao.status_code == 200
    corpo = verificacao.json()
    assert corpo["status"] != "nunca_sincronizado"
    assert corpo["origem"] == "configuracao_inicial"


def test_post_configuracao_persiste_mesmo_se_reconstrucao_da_base_local_falhar(
    monkeypatch, tmp_path, caminho_planilha_configuracao_teste
):
    """A reconstrução da Base Local (Gatilho A) é best-effort — uma falha
    nela nunca pode impedir a Configuração Inicial de ser salva (mesma
    garantia já homologada para o hook de `planilha_service.py`)."""
    _isolar_diretorio_configuracao(monkeypatch, tmp_path)
    caminho_planilha = caminho_planilha_configuracao_teste()

    def _sincronizar_com_falha(*args, **kwargs):
        raise RuntimeError("falha simulada na reconstrução da Base Local")

    monkeypatch.setattr("app.api.configuracao.base_local.sincronizar", _sincronizar_com_falha)

    resposta = client.post(
        "/api/v1/configuracao",
        json={"caminho_planilha_oficial": caminho_planilha},
    )

    assert resposta.status_code == 200
    assert config.carregar(diretorio_base=tmp_path / "dados_usuario") is not None


def test_alterar_planilha_oficial_tambem_reconstroi_a_base_local(
    monkeypatch, tmp_path, caminho_planilha_configuracao_teste
):
    """"Alterar Planilha Oficial" reusa `POST /api/v1/configuracao` — o
    Gatilho A dispara igualmente, não só na primeira configuração."""
    _isolar_diretorio_configuracao(monkeypatch, tmp_path)
    caminho_v1 = caminho_planilha_configuracao_teste(nome_arquivo="v1.xlsx")
    client.post("/api/v1/configuracao", json={"caminho_planilha_oficial": caminho_v1})

    caminho_v2 = caminho_planilha_configuracao_teste(nome_arquivo="v2.xlsx")
    resposta = client.post("/api/v1/configuracao", json={"caminho_planilha_oficial": caminho_v2})

    assert resposta.status_code == 200
    verificacao = client.get("/api/v1/analitica/sincronizacao")
    assert verificacao.json()["status"] != "nunca_sincronizado"


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
