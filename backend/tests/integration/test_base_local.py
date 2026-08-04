import os
import sqlite3

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


def test_sincronizar_tambem_reconstroi_base_local_em_sqlite(
    tmp_path, caminho_planilha_conferencia_teste
):
    """Sprint 17.3 — o mesmo gancho que já copia o `.xlsx` passa também a
    reconstruir a segunda materialização da Base Local, em SQLite."""
    origem = caminho_planilha_conferencia_teste()
    destino_base = tmp_path / "dados_usuario"

    caminho_xlsx = base_local.sincronizar(origem, diretorio_base=destino_base)

    caminho_sqlite = caminho_xlsx.parent / "base_local.sqlite"
    assert caminho_sqlite.is_file()


def test_sincronizar_publica_sqlite_mesmo_com_planilha_sem_dimension(
    tmp_path, caminho_planilha_conferencia_teste, remover_tag_dimension_da_planilha
):
    """Micro-sprint 18.7.1 — regressão do bug real (auditoria do Gatilho
    A): uma planilha sem a tag `<dimension>` (ex. exportada pelo Google
    Sheets) fazia `capturar_sinal_frescor` devolver `None`, e
    `sincronizar()` engolia o `sqlite3.IntegrityError` resultante em
    silêncio — `base_local.sqlite` nunca era publicado, não importa qual
    dos três chamadores (pós-preenchimento, botão manual, Configuração
    Inicial) disparasse. Testado neste nível (não só em
    `test_base_local_sqlite.py`) porque é exatamente esta função,
    `base_local.sincronizar()`, que os três gatilhos chamam."""
    origem = caminho_planilha_conferencia_teste()
    remover_tag_dimension_da_planilha(origem)
    destino_base = tmp_path / "dados_usuario"

    caminho_xlsx = base_local.sincronizar(origem, diretorio_base=destino_base)

    caminho_sqlite = caminho_xlsx.parent / "base_local.sqlite"
    assert caminho_sqlite.is_file()
    assert not any(nome.endswith(".tmp") for nome in os.listdir(caminho_xlsx.parent))


def test_sincronizar_planilha_sem_abas_esperadas_nao_quebra_copia_xlsx(tmp_path):
    """A cópia `.xlsx` (já homologada desde a Sprint 13) nunca pode ser
    afetada por uma falha na etapa nova de reconstrução SQLite (risco 4,
    `docs/central-analitica/README.md § 10`) — aqui simulada com uma
    planilha sem nenhuma das abas esperadas."""
    origem = tmp_path / "planilha_sem_abas.xlsx"
    Workbook().save(origem)  # só a aba padrão "Sheet"

    destino_base = tmp_path / "dados_usuario"
    caminho_destino = base_local.sincronizar(str(origem), diretorio_base=destino_base)

    assert caminho_destino.is_file()
    caminho_sqlite = caminho_destino.parent / "base_local.sqlite"
    assert not caminho_sqlite.exists()


def _origem_gravada(caminho_sqlite):
    conexao = sqlite3.connect(caminho_sqlite)
    try:
        return conexao.execute(
            "SELECT origem FROM sincronizacoes ORDER BY id DESC LIMIT 1"
        ).fetchone()[0]
    finally:
        conexao.close()


def test_sincronizar_grava_origem_padrao_pos_preenchimento_quando_nao_informada(
    tmp_path, caminho_planilha_conferencia_teste
):
    """Sprint 17.4.6.1 — preservação integral do fluxo consolidado: uma
    chamada sem o parâmetro `origem` (exatamente como
    `app/services/planilha_service.py` sempre chamou) continua gravando
    `"pos_preenchimento"`."""
    origem_planilha = caminho_planilha_conferencia_teste()
    destino_base = tmp_path / "dados_usuario"

    caminho_xlsx = base_local.sincronizar(origem_planilha, diretorio_base=destino_base)

    caminho_sqlite = caminho_xlsx.parent / "base_local.sqlite"
    assert _origem_gravada(caminho_sqlite) == "pos_preenchimento"


def test_sincronizar_grava_origem_informada_explicitamente(tmp_path, caminho_planilha_conferencia_teste):
    """Sprint 17.4.6.1 — `origem` persiste de verdade na Base Local em
    SQLite (não é simulada/sobrescrita só na resposta HTTP): o valor
    passado por `executar_sincronizacao_manual` (`"manual"`) é o mesmo
    valor lido de volta do banco."""
    origem_planilha = caminho_planilha_conferencia_teste()
    destino_base = tmp_path / "dados_usuario"

    caminho_xlsx = base_local.sincronizar(origem_planilha, diretorio_base=destino_base, origem="manual")

    caminho_sqlite = caminho_xlsx.parent / "base_local.sqlite"
    assert _origem_gravada(caminho_sqlite) == "manual"
