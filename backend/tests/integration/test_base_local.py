import os

from openpyxl import Workbook, load_workbook

from app.consulta import base_local


def test_caminho_base_local_usa_env_var_quando_definida(tmp_path, monkeypatch):
    monkeypatch.setenv(base_local.VAR_AMBIENTE_USER_DATA, str(tmp_path))
    caminho = base_local.caminho_base_local()
    assert caminho == tmp_path / "central-conferencia" / base_local.NOME_ARQUIVO_BASE_LOCAL


def test_caminho_base_local_fallback_appdata_quando_env_var_ausente(tmp_path, monkeypatch):
    monkeypatch.delenv(base_local.VAR_AMBIENTE_USER_DATA, raising=False)
    monkeypatch.setenv("APPDATA", str(tmp_path))
    caminho = base_local.caminho_base_local()
    assert caminho == tmp_path / base_local.NOME_PASTA_DADOS_FALLBACK / "central-conferencia" / base_local.NOME_ARQUIVO_BASE_LOCAL


def test_sincronizar_copia_planilha_para_destino_fixo(tmp_path):
    origem = tmp_path / "planilha_preenchida.xlsx"
    workbook = Workbook()
    workbook.active["A1"] = "conteudo A"
    workbook.save(origem)

    destino_base = tmp_path / "dados_usuario"
    caminho_destino = base_local.sincronizar(str(origem), diretorio_base=destino_base)

    assert caminho_destino.is_file()
    assert load_workbook(caminho_destino).active["A1"].value == "conteudo A"
    # nenhum arquivo temporário deve sobrar depois da troca atômica
    assert not any(nome.endswith(".tmp") for nome in os.listdir(caminho_destino.parent))


def test_sincronizar_sobrescreve_versao_anterior(tmp_path):
    origem = tmp_path / "planilha_preenchida.xlsx"
    destino_base = tmp_path / "dados_usuario"

    workbook_v1 = Workbook()
    workbook_v1.active["A1"] = "versão 1"
    workbook_v1.save(origem)
    base_local.sincronizar(str(origem), diretorio_base=destino_base)

    workbook_v2 = Workbook()
    workbook_v2.active["A1"] = "versão 2"
    workbook_v2.save(origem)
    caminho_destino = base_local.sincronizar(str(origem), diretorio_base=destino_base)

    assert load_workbook(caminho_destino).active["A1"].value == "versão 2"


def test_base_local_disponivel(tmp_path):
    destino_base = tmp_path / "dados_usuario"
    assert base_local.base_local_disponivel(diretorio_base=destino_base) is False

    origem = tmp_path / "planilha_preenchida.xlsx"
    Workbook().save(origem)
    base_local.sincronizar(str(origem), diretorio_base=destino_base)

    assert base_local.base_local_disponivel(diretorio_base=destino_base) is True
