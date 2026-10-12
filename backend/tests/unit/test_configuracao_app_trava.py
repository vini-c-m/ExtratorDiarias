"""Cenários adicionais de proteção cross-process da configuração, trazidos do
commit fe51f64 (branch fix/config-filelock-isolated) sem alterar a
implementação atual: cobrem a trava expirada, o retry de leitura/substituição e
a concorrência entre threads. Os testes multiprocesso do fix não foram
trazidos."""

import json


import os


import threading


import time


import filelock


import pytest


from app.infra.config import configuracao_app as config


def _patchear_substituicao_com_atraso(monkeypatch, atraso_s: float = 0.05):
    substituir_original = config._substituir_com_retry

    def _substituir_com_atraso(caminho_tmp, caminho_destino):
        time.sleep(atraso_s)
        return substituir_original(caminho_tmp, caminho_destino)

    monkeypatch.setattr(config, "_substituir_com_retry", _substituir_com_atraso)



def test_carregar_concorrente_durante_persistir_nunca_levanta_permission_error(
    tmp_path, caminho_planilha_configuracao_teste, monkeypatch
):
    """Leitor (`carregar`, chamado sem trava por `GET /api/v1/configuracao`)
    correndo ao mesmo tempo que um escritor (`persistir`) nunca pode
    levantar `PermissionError` — o retry de `_ler_texto_com_retry` absorve
    a colisão transiente com o `os.replace` em andamento. Mesmo ritmo de
    interleaving dos testes já homologados de
    `test_persistencia_decisoes.py` (`threading.Barrier` sincronizando
    pares leitor/escritor, nunca um loop apertado sem pausa — que
    monopolizaria o SO/GIL além de qualquer cenário real de `GET`
    concorrente, e excederia o orçamento de retry que já é o mesmo,
    homologado, de `persistencia_decisoes.py`/`base_local_sqlite.py`)."""
    diretorio = tmp_path / "dados_usuario"
    caminho_planilha = caminho_planilha_configuracao_teste()
    fingerprint = config.validar_planilha(caminho_planilha)
    config.persistir(caminho_planilha, fingerprint, diretorio_base=diretorio)  # config inicial já existe
    _patchear_substituicao_com_atraso(monkeypatch)

    erros_leitura: list[Exception] = []

    def _repeticoes(quantidade):
        barreira = threading.Barrier(2, timeout=5)

        def _escrever():
            barreira.wait(timeout=5)
            config.persistir(caminho_planilha, fingerprint, diretorio_base=diretorio)

        def _ler():
            barreira.wait(timeout=5)
            try:
                config.carregar(diretorio_base=diretorio)
            except Exception as erro:  # noqa: BLE001
                erros_leitura.append(erro)

        for _ in range(quantidade):
            escritor = threading.Thread(target=_escrever)
            leitor = threading.Thread(target=_ler)
            escritor.start()
            leitor.start()
            escritor.join(timeout=15)
            leitor.join(timeout=15)

    _repeticoes(10)

    assert erros_leitura == []  # nenhuma exceção durante toda a corrida



def test_carregar_permission_error_persistente_propaga_cru(tmp_path, monkeypatch):
    """Comportamento inalterado (docstring de `_ler_texto_com_retry`):
    `carregar` nunca teve tratamento de erro de leitura próprio — um
    `PermissionError` genuinamente persistente continua propagando cru,
    nunca é silenciado nem embrulhado numa exceção de domínio."""
    diretorio = tmp_path / "dados_usuario"
    diretorio.mkdir(parents=True)
    (diretorio / config.NOME_ARQUIVO_CONFIGURACAO).write_text(
        '{"caminho_planilha_oficial": "x"}', encoding="utf-8"
    )

    def _read_text_sempre_falha(self, *args, **kwargs):
        raise PermissionError("Acesso negado (simulado)")

    monkeypatch.setattr("pathlib.Path.read_text", _read_text_sempre_falha)

    with pytest.raises(PermissionError):
        config.carregar(diretorio_base=diretorio)



def test_ler_texto_com_retry_absorve_permission_error_transiente(tmp_path, monkeypatch):
    caminho = tmp_path / "arquivo.json"
    caminho.write_text("conteudo", encoding="utf-8")

    chamadas = {"n": 0}
    read_text_original = type(caminho).read_text

    def _read_text_falha_duas_vezes(self, *args, **kwargs):
        chamadas["n"] += 1
        if chamadas["n"] <= 2:
            raise PermissionError("Acesso negado (simulado)")
        return read_text_original(self, *args, **kwargs)

    monkeypatch.setattr("pathlib.Path.read_text", _read_text_falha_duas_vezes)

    assert config._ler_texto_com_retry(caminho) == "conteudo"
    assert chamadas["n"] == 3



def test_persistir_concorrente_cinco_chamadas_arquivo_permanece_json_valido(
    tmp_path, caminho_planilha_configuracao_teste, monkeypatch
):
    diretorio = tmp_path / "dados_usuario"
    _patchear_substituicao_com_atraso(monkeypatch, atraso_s=0.02)

    chamadas = [
        (caminho := caminho_planilha_configuracao_teste(nome_arquivo=f"v{indice}.xlsx"), config.validar_planilha(caminho))
        for indice in range(5)
    ]

    barreira = threading.Barrier(len(chamadas), timeout=5)
    erros: dict[int, Exception | None] = {}

    def _tarefa(indice, caminho, fingerprint):
        barreira.wait(timeout=5)
        try:
            config.persistir(caminho, fingerprint, diretorio_base=diretorio)
        except Exception as erro:  # noqa: BLE001
            erros[indice] = erro
        else:
            erros[indice] = None

    threads = [
        threading.Thread(target=_tarefa, args=(i, caminho, fingerprint))
        for i, (caminho, fingerprint) in enumerate(chamadas)
    ]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=15)

    assert erros == dict.fromkeys(range(5))  # nenhuma exceção em nenhuma thread
    conteudo_bruto = (diretorio / config.NOME_ARQUIVO_CONFIGURACAO).read_text(encoding="utf-8")
    json.loads(conteudo_bruto)  # nunca corrompe — sempre JSON válido
    recarregada = config.carregar(diretorio_base=diretorio)
    assert recarregada.caminho_planilha_oficial in {caminho for caminho, _ in chamadas}
    assert not any(nome.endswith(".tmp") for nome in os.listdir(diretorio))



def test_persistir_concorrente_duas_chamadas_diferentes_sobrevivem(
    tmp_path, caminho_planilha_configuracao_teste, monkeypatch
):
    diretorio = tmp_path / "dados_usuario"
    caminho_a = caminho_planilha_configuracao_teste(nome_arquivo="a.xlsx")
    caminho_b = caminho_planilha_configuracao_teste(nome_arquivo="b.xlsx")
    fingerprint_a = config.validar_planilha(caminho_a)
    fingerprint_b = config.validar_planilha(caminho_b)
    _patchear_substituicao_com_atraso(monkeypatch)

    barreira = threading.Barrier(2, timeout=5)
    erros: dict[str, Exception | None] = {}

    def _tarefa(nome, caminho, fingerprint):
        barreira.wait(timeout=5)
        try:
            config.persistir(caminho, fingerprint, diretorio_base=diretorio)
        except Exception as erro:  # noqa: BLE001 — capturado só para o assert abaixo
            erros[nome] = erro
        else:
            erros[nome] = None

    t1 = threading.Thread(target=_tarefa, args=("A", caminho_a, fingerprint_a))
    t2 = threading.Thread(target=_tarefa, args=("B", caminho_b, fingerprint_b))
    t1.start()
    t2.start()
    t1.join(timeout=15)
    t2.join(timeout=15)

    assert erros == {"A": None, "B": None}  # nenhuma exceção nas duas threads
    recarregada = config.carregar(diretorio_base=diretorio)  # leitura real, sem o atraso injetado
    assert recarregada.caminho_planilha_oficial in (caminho_a, caminho_b)  # uma das duas venceu, nunca uma mistura
    assert not any(nome.endswith(".tmp") for nome in os.listdir(diretorio))



def test_persistir_levanta_configuracaoappemuso_quando_trava_expira(
    tmp_path, caminho_planilha_configuracao_teste, monkeypatch
):
    diretorio = tmp_path / "dados_usuario"
    caminho_planilha = caminho_planilha_configuracao_teste()
    fingerprint = config.validar_planilha(caminho_planilha)

    class _TravaFalsaExpira:
        def __enter__(self):
            raise filelock.Timeout(str(config.caminho_configuracao(diretorio_base=diretorio)))

        def __exit__(self, *_args):
            return False

    monkeypatch.setattr(config, "_trava_configuracao", lambda destino: _TravaFalsaExpira())

    with pytest.raises(config.ConfiguracaoAppEmUso):
        config.persistir(caminho_planilha, fingerprint, diretorio_base=diretorio)



def test_substituir_com_retry_absorve_permission_error_transiente(tmp_path, monkeypatch):
    origem = tmp_path / "origem.tmp"
    origem.write_text("conteudo", encoding="utf-8")
    destino = tmp_path / "destino.json"

    chamadas = {"n": 0}
    replace_original = os.replace

    def _replace_falha_duas_vezes(caminho_tmp, caminho_destino):
        chamadas["n"] += 1
        if chamadas["n"] <= 2:
            raise PermissionError("Acesso negado (simulado)")
        return replace_original(caminho_tmp, caminho_destino)

    monkeypatch.setattr("os.replace", _replace_falha_duas_vezes)

    config._substituir_com_retry(origem, destino)

    assert destino.read_text(encoding="utf-8") == "conteudo"
    assert chamadas["n"] == 3



def test_substituir_com_retry_propaga_permission_error_persistente(tmp_path, monkeypatch):
    origem = tmp_path / "origem.tmp"
    origem.write_text("conteudo", encoding="utf-8")
    destino = tmp_path / "destino.json"

    def _replace_sempre_falha(caminho_tmp, caminho_destino):
        raise PermissionError("Acesso negado (simulado)")

    monkeypatch.setattr("os.replace", _replace_sempre_falha)

    with pytest.raises(PermissionError):
        config._substituir_com_retry(origem, destino)

