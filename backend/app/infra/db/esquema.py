"""Esquema SQLite da Base Local de Consulta (Sprint 17.3) — ativa
`app/infra/db/`, reservada desde a estrutura original do projeto e nunca
usada até aqui (ver `app/infra/README.md` e `docs/roadmap/README.md`,
"Planejado (não implementado)").

Só DDL — nenhuma entidade de domínio é importada aqui (`app/infra/` "nunca
escreve regra de negócio", `app/infra/README.md`). Quem monta os dados a
inserir é `app/consulta/base_local_sqlite.py`.

Esquema deliberadamente mínimo (`docs/central-analitica/README.md § 6.2` e
o plano da Sprint 17.3): uma única tabela `diarias`, denormalizada — os
dados do servidor (nome, cargo, previdência, matrícula, situação) vêm
inline em cada linha de diária, sem uma tabela `servidores` separada,
porque a reconstrução é sempre total (decisão 4 da arquitetura) e nenhum
caso de uso aprovado precisa de um servidor sem diária associada. Sem
`tipo_processo`: não existe como fato explícito na planilha oficial, só
seria inferível por heurística, o que a arquitetura já rejeita (decisão 8 /
RN-08 — nunca adivinhar). `sincronizacoes`/`avisos_sincronizacao` persistem
os metadados de sincronização — decisão 7, vinculante.

Sem `PRAGMA foreign_keys`: uma diária cujo CPF não apareça em `Dados` é uma
situação real já documentada (RN-01) — não pode derrubar a reconstrução."""

import sqlite3

# Sprint 19.9 (achado da auditoria — validação com a Planilha Oficial real):
# `reconstruir()` só chama `criar_esquema` sobre um arquivo `.tmp` novo em
# folha (nunca sobre o `.sqlite` existente — decisão 4, reconstrução sempre
# total), então `CREATE TABLE IF NOT EXISTS` nunca "migra" um arquivo já
# existente. Isso deixava um buraco real: a verificação de frescor (decisão
# 1/2b) só compara o sinal de conteúdo da Planilha Oficial (tamanho/mtime/
# nº de linhas) — nunca detectava que o `.sqlite` de uma instalação mais
# antiga (schema sem a coluna `dh`, adicionada na Sprint 19.5.1) ficava
# desatualizado em relação ao código atual quando a planilha em si não
# mudava. Resultado observado (Electron real + Planilha Oficial real):
# `GET /sincronizacao` respondia "atualizado" enquanto `GET /diarias`/
# `/indicadores` quebravam com `sqlite3.OperationalError: no such column:
# dh`. `PRAGMA user_version` é o mecanismo nativo do SQLite para isto —
# gravado a cada reconstrução (sempre um arquivo novo), comparado pela
# verificação de frescor (`base_local_sqlite.esquema_desatualizado`) para
# tratar um schema desatualizado exatamente como "possivelmente
# desatualizado" (mesmo estado de UI já homologado, `IndicadorSincronizacao`
# — nenhum estado novo, só mais um motivo de disparar o já existente).
#
# Versão 3 (2026-08-05, Bloco de Refinamento item 2): nova coluna
# `categoria_funcional`. Não confundir com `tipo_processo` (rejeitado
# acima, na docstring do módulo) — `categoria_funcional` não é inferência
# por heurística sobre um formulário do PDF; é uma classificação
# determinística e testada sobre `servidor_cargo` (catálogo institucional
# fechado, `app/domain/analitica/categoria_funcional.py`), a mesma coluna
# cadastral que já é lida e gravada aqui desde a Sprint 17.3. Sempre
# populada (nunca `NULL`) — inclusive `"NAO_IDENTIFICADO"` quando não há
# cadastro (RN-01) ou quando o cargo não bate com nenhum catálogo
# conhecido (ex.: "Policial Militar", achado real de 2026-08-05 — nunca
# adivinhado para nenhum dos dois lados).
#
# Versão 4 (2026-08-06, achado real — Electron empacotado + Planilha
# Oficial real): nova coluna `versao_app` em `sincronizacoes`. Achado desta
# auditoria: o binário empacotado do backend (`extrator_diarias_backend.exe`,
# PyInstaller) fica congelado no código-fonte do momento em que foi gerado
# — uma correção de lógica de importação (ex.: `_valor_como_numero`,
# `base_local.py` `data_only=True`) só chega ao usuário quando o `.exe`
# instalado é reconstruído e reinstalado, nunca automaticamente. Nem o sinal
# de conteúdo (`SinalFrescor` — planilha não mudou) nem `VERSAO_ESQUEMA`
# acima (formato das tabelas não mudou) detectam essa situação: os dois
# ficam "iguais" entre uma instalação antiga e uma nova mesmo quando a
# LÓGICA de importação mudou. `versao_app` (gravada a cada reconstrução,
# lida de `app.getVersion()`/`package.json` via a mesma variável de
# ambiente que já leva `EXTRATOR_DIARIAS_USER_DATA`) fecha essa lacuna: uma
# instalação nova (versão diferente) sempre força re-sincronização, mesmo
# quando planilha e schema de tabelas não mudaram nem um pouco.
VERSAO_ESQUEMA = 4

SQL_CRIAR_DIARIAS = """
CREATE TABLE IF NOT EXISTS diarias (
    id INTEGER PRIMARY KEY,
    dh TEXT,
    sei TEXT UNIQUE NOT NULL,
    doc_origem TEXT,
    cpf TEXT NOT NULL,
    periodo_inicial TEXT NOT NULL,
    periodo_final TEXT NOT NULL,
    cidade_origem TEXT,
    cidade_destino TEXT,
    motivo TEXT,
    transporte TEXT,
    valor_total_diarias REAL,
    linha_planilha INTEGER NOT NULL,
    servidor_nome TEXT,
    servidor_cargo TEXT,
    servidor_previdencia TEXT,
    servidor_matricula TEXT,
    servidor_situacao TEXT,
    categoria_funcional TEXT NOT NULL DEFAULT 'NAO_IDENTIFICADO'
)
"""

SQL_CRIAR_SINCRONIZACOES = """
CREATE TABLE IF NOT EXISTS sincronizacoes (
    id INTEGER PRIMARY KEY,
    sincronizado_em TEXT NOT NULL,
    origem TEXT NOT NULL,
    linhas_diarias INTEGER NOT NULL,
    linhas_servidores_lidos INTEGER NOT NULL,
    linhas_ignoradas INTEGER NOT NULL,
    status TEXT NOT NULL,
    tamanho_bytes_fonte INTEGER NOT NULL,
    mtime_fonte REAL NOT NULL,
    linhas_controle_diarias_fonte INTEGER NOT NULL,
    versao_app TEXT NOT NULL DEFAULT ''
)
"""
# As 3 últimas colunas guardam o sinal de frescor de conteúdo (tamanho +
# mtime + nº de linhas da Planilha Oficial) capturado no momento desta
# sincronização — sem elas, uma verificação futura de frescor (decisão 1,
# `docs/central-analitica/README.md § 0.1`) não teria contra o que comparar
# o estado atual da planilha. Deliberadamente separado de
# `FingerprintEstrutural` (Sprint 15, hash de cabeçalho/abas) — decisão 3.

SQL_CRIAR_AVISOS_SINCRONIZACAO = """
CREATE TABLE IF NOT EXISTS avisos_sincronizacao (
    id INTEGER PRIMARY KEY,
    sincronizacao_id INTEGER NOT NULL,
    aba TEXT NOT NULL,
    linha INTEGER NOT NULL,
    motivo TEXT NOT NULL
)
"""

SQL_CRIAR_INDICES = [
    "CREATE INDEX IF NOT EXISTS idx_diarias_cpf ON diarias (cpf)",
    "CREATE INDEX IF NOT EXISTS idx_diarias_periodo_inicial ON diarias (periodo_inicial)",
    "CREATE INDEX IF NOT EXISTS idx_diarias_cidade_origem ON diarias (cidade_origem)",
    "CREATE INDEX IF NOT EXISTS idx_diarias_cidade_destino ON diarias (cidade_destino)",
    "CREATE INDEX IF NOT EXISTS idx_diarias_motivo ON diarias (motivo)",
    "CREATE INDEX IF NOT EXISTS idx_diarias_servidor_nome ON diarias (servidor_nome)",
    "CREATE INDEX IF NOT EXISTS idx_diarias_servidor_matricula ON diarias (servidor_matricula)",
    "CREATE INDEX IF NOT EXISTS idx_diarias_servidor_situacao ON diarias (servidor_situacao)",
    "CREATE INDEX IF NOT EXISTS idx_diarias_valor_total_diarias ON diarias (valor_total_diarias)",
    "CREATE INDEX IF NOT EXISTS idx_diarias_categoria_funcional ON diarias (categoria_funcional)",
    "CREATE INDEX IF NOT EXISTS idx_avisos_sincronizacao_id ON avisos_sincronizacao (sincronizacao_id)",
]


def criar_esquema(conexao: sqlite3.Connection) -> None:
    conexao.execute(SQL_CRIAR_DIARIAS)
    conexao.execute(SQL_CRIAR_SINCRONIZACOES)
    conexao.execute(SQL_CRIAR_AVISOS_SINCRONIZACAO)
    for sql_indice in SQL_CRIAR_INDICES:
        conexao.execute(sql_indice)
    # `PRAGMA user_version` não aceita parâmetro (`?`) — só é seguro fazer
    # f-string aqui porque `VERSAO_ESQUEMA` é uma constante inteira deste
    # módulo, nunca dado de entrada do usuário.
    conexao.execute(f"PRAGMA user_version = {VERSAO_ESQUEMA}")
