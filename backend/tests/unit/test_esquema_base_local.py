import sqlite3

from app.infra.db.esquema import VERSAO_ESQUEMA, criar_esquema


def test_criar_esquema_cria_tabelas_esperadas():
    conexao = sqlite3.connect(":memory:")
    criar_esquema(conexao)

    tabelas = {
        linha[0]
        for linha in conexao.execute("SELECT name FROM sqlite_master WHERE type = 'table'").fetchall()
    }

    assert {"diarias", "sincronizacoes", "avisos_sincronizacao"} <= tabelas


def test_criar_esquema_cria_indices_esperados():
    conexao = sqlite3.connect(":memory:")
    criar_esquema(conexao)

    indices = {
        linha[0]
        for linha in conexao.execute("SELECT name FROM sqlite_master WHERE type = 'index'").fetchall()
    }

    assert "idx_diarias_cpf" in indices
    assert "idx_diarias_servidor_matricula" in indices
    assert "idx_avisos_sincronizacao_id" in indices


def test_criar_esquema_cria_coluna_dh():
    conexao = sqlite3.connect(":memory:")
    criar_esquema(conexao)

    colunas = {linha[1] for linha in conexao.execute("PRAGMA table_info(diarias)").fetchall()}

    assert "dh" in colunas


def test_criar_esquema_cria_indices_novos_da_sprint_195():
    conexao = sqlite3.connect(":memory:")
    criar_esquema(conexao)

    indices = {
        linha[0]
        for linha in conexao.execute("SELECT name FROM sqlite_master WHERE type = 'index'").fetchall()
    }

    assert "idx_diarias_cidade_origem" in indices
    assert "idx_diarias_servidor_situacao" in indices
    assert "idx_diarias_valor_total_diarias" in indices


def test_criar_esquema_e_idempotente():
    conexao = sqlite3.connect(":memory:")
    criar_esquema(conexao)
    criar_esquema(conexao)  # não deve levantar exceção (CREATE TABLE IF NOT EXISTS)


def test_criar_esquema_grava_versao_em_user_version():
    """Sprint 19.9 — achado da auditoria: sem isto, um `.sqlite` de uma
    instalação anterior a uma mudança de schema nunca era detectável como
    desatualizado quando a Planilha Oficial em si não mudava (ver
    `base_local_sqlite.esquema_desatualizado`)."""
    conexao = sqlite3.connect(":memory:")
    criar_esquema(conexao)

    (versao_gravada,) = conexao.execute("PRAGMA user_version").fetchone()

    assert versao_gravada == VERSAO_ESQUEMA
