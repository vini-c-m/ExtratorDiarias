"""Cenário adicional do commit fe51f64: a API devolve 503 quando a trava da
configuração está em uso."""

from fastapi.testclient import TestClient


from app.infra.config import configuracao_app as config


from app.main import app


client = TestClient(app)


def _isolar_diretorio_configuracao(monkeypatch, tmp_path):
    monkeypatch.setenv(config.VAR_AMBIENTE_USER_DATA, str(tmp_path / "dados_usuario"))



def test_post_configuracao_trava_em_uso_devolve_503(
    monkeypatch, tmp_path, caminho_planilha_configuracao_teste
):
    _isolar_diretorio_configuracao(monkeypatch, tmp_path)
    caminho_planilha = caminho_planilha_configuracao_teste()

    def _persistir_sempre_em_uso(*args, **kwargs):
        raise config.ConfiguracaoAppEmUso(
            "A configuração está sendo usada por outro processo. Tente novamente em instantes."
        )

    monkeypatch.setattr(config, "persistir", _persistir_sempre_em_uso)

    resposta = client.post(
        "/api/v1/configuracao",
        json={"caminho_planilha_oficial": caminho_planilha},
    )

    assert resposta.status_code == 503
    assert "outro processo" in resposta.json()["detail"]
    assert config.carregar(diretorio_base=tmp_path / "dados_usuario") is None  # nunca persistiu parcialmente

