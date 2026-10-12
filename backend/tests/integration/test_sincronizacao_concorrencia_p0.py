"""ETAPA 2 (Auditoria P0, 2026-08-09) — testes obrigatórios de
sincronização/concorrência da Base Local em SQLite: lock centralizado
(`base_local.LOCK_SINCRONIZACAO`), retry curto e específico de
`PermissionError` em `os.replace`, validação estrutural antes de promover,
Last Known Good preservado sob falha, e sinalização de falha sem desfazer
uma gravação de planilha já concluída. Nenhum dado real — tudo em
`tmp_path`, mesmos padrões de `test_base_local_sqlite.py`/
`test_integridade_valor_financeiro.py`."""

import sqlite3
import threading
import time
from datetime import date

import pytest

from app.consulta import base_local, base_local_sqlite
from app.consulta.repositorio_diarias import ResultadoDiariasCompletas
from app.domain.entities.diaria import Diaria
from app.domain.entities.processo import Processo, StatusProcesso
from app.domain.entities.registro_diaria_indexada import RegistroDiariaIndexada
from app.services import planilha_service


def _resultado_sintetico(sei: str) -> ResultadoDiariasCompletas:
    registro = RegistroDiariaIndexada(
        linha=2, sei=sei, doc_origem="PJTESTE", cpf="11111111111",
        periodo_inicial=date(2026, 1, 8), periodo_final=date(2026, 1, 10),
        cidade_origem="RECIFE", cidade_destino="GARANHUNS",
        motivo="teste", transporte="CARRO", valor_total_diarias=100.0, dh=None,
    )
    return ResultadoDiariasCompletas(diarias={sei: registro}, avisos=[], linhas_ignoradas=0)


def _sinal_frescor_dummy(linhas: int = 2) -> base_local_sqlite.SinalFrescor:
    return base_local_sqlite.SinalFrescor(tamanho_bytes=1, mtime=1.0, linhas_controle_diarias=linhas)


def _sei_atual(caminho_sqlite) -> str:
    conexao = sqlite3.connect(caminho_sqlite)
    try:
        return conexao.execute("SELECT sei FROM diarias").fetchone()[0]
    finally:
        conexao.close()


def test_duas_chamadas_de_sincronizar_concorrentes_sao_serializadas_pelo_lock(
    tmp_path, caminho_planilha_conferencia_teste
):
    """Antes da ETAPA 2, só o caminho manual usava lock — duas chamadas de
    `sincronizar()` concorrentes (reproduzindo processamento + complemento
    quase simultâneos) podiam colidir sem coordenação nenhuma (reproduzido
    na auditoria: `WinError 32` real). Com `LOCK_SINCRONIZACAO`
    centralizado dentro da própria `sincronizar()`, as duas devem
    terminar sem exceção e a Base Local final deve ficar íntegra."""
    origem_planilha = caminho_planilha_conferencia_teste()
    destino_base = tmp_path / "dados_usuario"
    barreira = threading.Barrier(2)
    erros: dict[str, Exception | None] = {}

    def tarefa(nome: str) -> None:
        try:
            barreira.wait(timeout=5)
            base_local.sincronizar(origem_planilha, diretorio_base=destino_base, origem="teste")
            erros[nome] = None
        except Exception as erro:  # noqa: BLE001 — captura deliberada p/ relatar qualquer falha
            erros[nome] = erro

    t1 = threading.Thread(target=tarefa, args=("t1",))
    t2 = threading.Thread(target=tarefa, args=("t2",))
    t1.start()
    t2.start()
    t1.join(timeout=15)
    t2.join(timeout=15)

    assert erros == {"t1": None, "t2": None}
    caminho_sqlite = base_local_sqlite.caminho_base_local_sqlite(diretorio_base=destino_base)
    assert caminho_sqlite.is_file()
    conexao = sqlite3.connect(caminho_sqlite)
    try:
        conexao.execute("SELECT COUNT(*) FROM diarias").fetchone()  # schema íntegro, sem DatabaseError
    finally:
        conexao.close()
    assert not caminho_sqlite.with_suffix(caminho_sqlite.suffix + ".tmp").exists()


def test_leitura_mode_ro_aberta_bloqueia_replace_e_retry_recupera_apos_fechar(tmp_path):
    """Mesma reprodução da auditoria (Parte A): uma conexão `mode=ro`
    deixada aberta bloqueia `os.replace` no Windows (SQLite não pede
    `FILE_SHARE_DELETE`). Fechando o leitor DENTRO da janela de retry
    (3 tentativas, ~50ms/100ms de intervalo), `reconstruir()` deve se
    recuperar sozinho, sem propagar exceção."""
    destino = tmp_path / "base_local.sqlite"
    base_local_sqlite.reconstruir(
        _resultado_sintetico("ORIGINAL"), {}, _sinal_frescor_dummy(), origem="teste", caminho_destino=destino
    )

    # `check_same_thread=False` só porque o fechamento (abaixo) roda numa
    # thread separada, de propósito, para simular a janela real de
    # colisão — a conexão em si nunca é usada por duas threads ao mesmo
    # tempo.
    leitor = sqlite3.connect(f"{destino.resolve().as_uri()}?mode=ro", uri=True, check_same_thread=False)
    leitor.execute("SELECT COUNT(*) FROM diarias").fetchone()

    def fechar_apos_atraso() -> None:
        time.sleep(0.08)
        leitor.close()

    threading.Thread(target=fechar_apos_atraso).start()

    # Não deve levantar — o retry precisa conseguir depois que o leitor fechar.
    base_local_sqlite.reconstruir(
        _resultado_sintetico("RECUPERADO"), {}, _sinal_frescor_dummy(), origem="teste", caminho_destino=destino
    )

    assert _sei_atual(destino) == "RECUPERADO"


def test_replace_com_permissionerror_transitorio_e_recuperado_pelo_retry(tmp_path, monkeypatch):
    """Mesmo mecanismo do teste anterior, determinístico via monkeypatch
    (sem depender de timing real do SO) — prova a lógica do retry em si,
    isolada do comportamento do Windows."""
    destino = tmp_path / "base_local.sqlite"
    base_local_sqlite.reconstruir(
        _resultado_sintetico("ORIGINAL"), {}, _sinal_frescor_dummy(), origem="teste", caminho_destino=destino
    )

    chamadas = {"n": 0}
    os_replace_original = base_local_sqlite.os.replace

    def replace_falha_duas_vezes(origem, dest):
        chamadas["n"] += 1
        if chamadas["n"] <= 2:
            raise PermissionError(13, "Acesso negado (simulado)")
        return os_replace_original(origem, dest)

    monkeypatch.setattr(base_local_sqlite.os, "replace", replace_falha_duas_vezes)

    base_local_sqlite.reconstruir(
        _resultado_sintetico("RECUPERADO"), {}, _sinal_frescor_dummy(), origem="teste", caminho_destino=destino
    )

    assert chamadas["n"] == 3
    assert _sei_atual(destino) == "RECUPERADO"


def test_permissionerror_persistente_preserva_base_antiga_e_nao_falseia_metadata(tmp_path, monkeypatch):
    """PermissionError persistente (esgota o retry) precisa: propagar (não
    ser engolido aqui), preservar a base antiga íntegra, nunca consumir o
    `.tmp` como fonte de leitura, e nunca gravar 'sucesso' em
    `sincronizacoes` para esta tentativa — o registro de sucesso mais
    recente continua sendo o da reconstrução anterior."""
    destino = tmp_path / "base_local.sqlite"
    base_local_sqlite.reconstruir(
        _resultado_sintetico("ORIGINAL"), {}, _sinal_frescor_dummy(), origem="original", caminho_destino=destino
    )

    def sempre_falha(origem, dest):
        raise PermissionError(13, "Acesso negado (simulado, persistente)")

    monkeypatch.setattr(base_local_sqlite.os, "replace", sempre_falha)

    with pytest.raises(PermissionError):
        base_local_sqlite.reconstruir(
            _resultado_sintetico("NUNCA_PROMOVIDO"), {}, _sinal_frescor_dummy(),
            origem="tentativa_falha", caminho_destino=destino,
        )

    # Base antiga intacta — ainda o registro ORIGINAL, metadata ainda "original".
    conexao = sqlite3.connect(destino)
    try:
        sei = conexao.execute("SELECT sei FROM diarias").fetchone()[0]
        origem_gravada = conexao.execute(
            "SELECT origem FROM sincronizacoes ORDER BY id DESC LIMIT 1"
        ).fetchone()[0]
    finally:
        conexao.close()
    assert sei == "ORIGINAL"
    assert origem_gravada == "original"

    # .tmp existe (órfão) mas nunca foi promovido/consumido como leitura.
    caminho_tmp = destino.with_suffix(destino.suffix + ".tmp")
    assert caminho_tmp.exists()


def test_sincronizacao_valida_apos_falha_anterior_recupera_normalmente(tmp_path, monkeypatch):
    """Invariante 6 (Recuperação): depois de uma falha, uma sincronização
    válida posterior deve promover corretamente, sem intervenção manual."""
    destino = tmp_path / "base_local.sqlite"
    base_local_sqlite.reconstruir(
        _resultado_sintetico("ORIGINAL"), {}, _sinal_frescor_dummy(), origem="teste", caminho_destino=destino
    )

    def sempre_falha(origem, dest):
        raise PermissionError(13, "Acesso negado (simulado)")

    monkeypatch.setattr(base_local_sqlite.os, "replace", sempre_falha)
    with pytest.raises(PermissionError):
        base_local_sqlite.reconstruir(
            _resultado_sintetico("FALHOU"), {}, _sinal_frescor_dummy(), origem="teste", caminho_destino=destino
        )

    monkeypatch.undo()

    base_local_sqlite.reconstruir(
        _resultado_sintetico("RECUPERADO"), {}, _sinal_frescor_dummy(), origem="teste", caminho_destino=destino
    )

    assert _sei_atual(destino) == "RECUPERADO"


def test_validacao_bloqueia_base_vazia_quando_fonte_tem_linhas(tmp_path):
    """Guarda estrutural (nunca limite financeiro): fonte com linhas em
    'Controle de Diárias' mas reconstrução vazia é bloqueada ANTES de
    `commit()`/`os.replace` — a base antiga continua servindo."""
    destino = tmp_path / "base_local.sqlite"
    base_local_sqlite.reconstruir(
        _resultado_sintetico("ORIGINAL"), {}, _sinal_frescor_dummy(), origem="teste", caminho_destino=destino
    )

    resultado_vazio = ResultadoDiariasCompletas(diarias={}, avisos=[], linhas_ignoradas=0)
    sinal_com_linhas = _sinal_frescor_dummy(linhas=5)

    with pytest.raises(base_local_sqlite.ValidacaoBaseLocalFalhou):
        base_local_sqlite.reconstruir(
            resultado_vazio, {}, sinal_com_linhas, origem="teste", caminho_destino=destino
        )

    assert _sei_atual(destino) == "ORIGINAL"


def test_falha_de_sincronizacao_automatica_nao_desfaz_gravacao_da_planilha(
    tmp_path, caminho_planilha_teste, monkeypatch
):
    """Caminho automático (processamento/complemento): gravação da
    Planilha e sincronização da Central Analítica são resultados
    distintos — uma falha na segunda nunca pode reportar a primeira como
    'processamento falhou', mas precisa sinalizar explicitamente."""
    caminho = caminho_planilha_teste()
    monkeypatch.setenv(base_local.VAR_AMBIENTE_USER_DATA, str(tmp_path / "dados_usuario"))

    def reconstruir_falha(*args, **kwargs):
        raise RuntimeError("falha simulada na reconstrução SQLite")

    monkeypatch.setattr("app.consulta.base_local_sqlite.reconstruir", reconstruir_falha)

    diaria = Diaria(
        sei="19.20.0009.0009999/2026-01", doc_origem="PJNOVO", cpf="12312312312",
        periodo_inicial=date(2026, 3, 1), periodo_final=date(2026, 3, 3),
        cidade_origem="RECIFE", cidade_destino="OLINDA", motivo="Teste falha sync",
    )
    processo = Processo(arquivo_origem="arquivo.pdf", status=StatusProcesso.SUCESSO, diaria=diaria)

    resultado, _, _ = planilha_service.preencher_planilha(caminho, [processo], erros=[])

    assert resultado.total_gravado == 1
    assert resultado.sincronizacao_analitica_falhou is True
