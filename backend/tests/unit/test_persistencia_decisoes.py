import json
import multiprocessing
import threading
import time
from datetime import date, datetime, timezone

import pytest

from app.consulta import persistencia_decisoes as pd_module
from app.consulta.persistencia_decisoes import (
    VERSAO_ESQUEMA_ATUAL,
    PersistenciaDecisoesCorrompida,
    VersaoEsquemaIncompativel,
    carregar_decisoes,
    salvar_decisao,
)
from tests._multiprocesso_util import executar_e_reportar, segurar_trava_ate_ser_morto
from app.domain.entities.ordem_bancaria import OrdemBancaria
from app.domain.relatorio_transparencia.decisao import AcaoDecisao, registrar_decisao
from app.domain.relatorio_transparencia.motor_decisao import OcorrenciaFinanceira, RevisaoNecessaria


def _ordem(ob="2026OB000001", valor=154.09):
    return OrdemBancaria(
        linha=2,
        dh="2026DH000001",
        ob=ob,
        credor="FULANO DE TAL",
        situacao="Paga",
        data_pagamento=datetime(2026, 5, 15, 9, 0, 0),
        sei="19.20.0001.0000001/2026-01",
        cpf="11111111111",
        nome="FULANO DE TAL",
        cargo="Cargo de Teste",
        periodo_inicial=date(2026, 5, 10),
        periodo_final=date(2026, 5, 10),
        cidade_origem=None,
        cidade_destino=None,
        transporte="CARRO",
        motivo="Motivo de teste",
        valor=valor,
        valor_bruto_sem_formula=valor,
        restituicao=None,
        duplicidade="Único",
        item_de_gasto="33901401",
        trecho="RECIFE-GARANHUNS",
    )


def _revisao():
    return RevisaoNecessaria(
        regra="RN07",
        motivo="Motivo de teste",
        ocorrencias=[
            OcorrenciaFinanceira(dh="2026DH000001", ordem_bancaria=_ordem(ob="2026OB000001")),
            OcorrenciaFinanceira(dh="2026DH000002", ordem_bancaria=_ordem(ob="2026OB000002")),
        ],
    )


# --- 17. Arquivo inexistente -----------------------------------------------


def test_arquivo_inexistente_devolve_dicionario_vazio(tmp_path):
    caminho = tmp_path / "decisoes.json"
    assert carregar_decisoes(caminho) == {}


# --- 18. Arquivo persistido válido / roundtrip -----------------------------


def test_salvar_e_carregar_roundtrip(tmp_path):
    caminho = tmp_path / "decisoes.json"
    decisao = registrar_decisao(
        _revisao(),
        acao=AcaoDecisao.PUBLICAR,
        autor="servidor.teste",
        obs_publicaveis=["2026OB000001"],
        observacao="Publiquei só a primeira.",
        agora=datetime(2026, 8, 23, 10, 0, 0, tzinfo=timezone.utc),
    )

    salvar_decisao(caminho, decisao)
    carregadas = carregar_decisoes(caminho)

    assert decisao.identidade_grupo in carregadas
    recuperada = carregadas[decisao.identidade_grupo]
    assert recuperada.acao is AcaoDecisao.PUBLICAR
    assert recuperada.obs_publicaveis == frozenset({"2026OB000001"})
    assert recuperada.fingerprint_evidencias == decisao.fingerprint_evidencias
    assert recuperada.regra == "RN07"


# --- 19. Escrita atômica ----------------------------------------------------


def test_escrita_e_atomica_nao_deixa_arquivo_temporario(tmp_path):
    caminho = tmp_path / "decisoes.json"
    decisao = registrar_decisao(_revisao(), acao=AcaoDecisao.ADIAR, autor="servidor.teste")

    salvar_decisao(caminho, decisao)

    assert caminho.is_file()
    assert not caminho.with_suffix(caminho.suffix + ".tmp").exists()


def test_salvar_preserva_decisoes_de_outros_grupos(tmp_path):
    caminho = tmp_path / "decisoes.json"
    decisao_1 = registrar_decisao(_revisao(), acao=AcaoDecisao.ADIAR, autor="servidor.a")
    outra_revisao = RevisaoNecessaria(
        regra="RN04",
        motivo="Outro motivo",
        ocorrencias=[OcorrenciaFinanceira(dh="2026DH000003", ordem_bancaria=_ordem(ob="2026OB000003"))],
    )
    decisao_2 = registrar_decisao(outra_revisao, acao=AcaoDecisao.PUBLICAR, autor="servidor.b", obs_publicaveis=["2026OB000003"])

    salvar_decisao(caminho, decisao_1)
    salvar_decisao(caminho, decisao_2)
    carregadas = carregar_decisoes(caminho)

    assert set(carregadas) == {decisao_1.identidade_grupo, decisao_2.identidade_grupo}


# --- 20. Arquivo corrompido falha explicitamente ---------------------------


def test_json_invalido_levanta_erro_explicito(tmp_path):
    caminho = tmp_path / "decisoes.json"
    caminho.write_text("{isso nao e json valido", encoding="utf-8")

    with pytest.raises(PersistenciaDecisoesCorrompida):
        carregar_decisoes(caminho)


def test_estrutura_inesperada_levanta_erro_explicito(tmp_path):
    caminho = tmp_path / "decisoes.json"
    caminho.write_text('{"nada_a_ver": true}', encoding="utf-8")

    with pytest.raises(PersistenciaDecisoesCorrompida):
        carregar_decisoes(caminho)


def test_campo_obrigatorio_ausente_levanta_erro_explicito(tmp_path):
    caminho = tmp_path / "decisoes.json"
    caminho.write_text(
        '{"versao_esquema": 1, "decisoes": {"abc": {"regra": "RN07"}}}', encoding="utf-8"
    )

    with pytest.raises(PersistenciaDecisoesCorrompida):
        carregar_decisoes(caminho)


# --- Confronto QA Codex — falhas de leitura/decodificação também precisam
# virar `PersistenciaDecisoesCorrompida`, nunca escapar cru até `/preparar`,
# `/revisoes`, o registro de decisão ou `/gerar` como um 500 técnico.
# Achado real: `UnicodeDecodeError`/`PermissionError`/`OSError` não eram
# capturados antes desta correção.


def test_bytes_utf8_invalidos_levanta_erro_explicito(tmp_path):
    caminho = tmp_path / "decisoes.json"
    caminho.write_bytes(b"\x80\x81\x82\x83 nao decodifica como utf-8")

    with pytest.raises(PersistenciaDecisoesCorrompida):
        carregar_decisoes(caminho)


def test_permission_error_levanta_erro_explicito(tmp_path, monkeypatch):
    caminho = tmp_path / "decisoes.json"
    caminho.write_text('{"versao_esquema": 1, "decisoes": {}}', encoding="utf-8")

    def _read_text_nega_permissao(self, *args, **kwargs):
        raise PermissionError("Acesso negado (simulado)")

    monkeypatch.setattr("pathlib.Path.read_text", _read_text_nega_permissao)

    with pytest.raises(PersistenciaDecisoesCorrompida):
        carregar_decisoes(caminho)


def test_oserror_generico_levanta_erro_explicito(tmp_path, monkeypatch):
    caminho = tmp_path / "decisoes.json"
    caminho.write_text('{"versao_esquema": 1, "decisoes": {}}', encoding="utf-8")

    def _read_text_falha_io(self, *args, **kwargs):
        raise OSError("Falha de E/S simulada")

    monkeypatch.setattr("pathlib.Path.read_text", _read_text_falha_io)

    with pytest.raises(PersistenciaDecisoesCorrompida):
        carregar_decisoes(caminho)


def test_erros_de_leitura_nunca_expoem_o_erro_python_cru(tmp_path):
    caminho = tmp_path / "decisoes.json"
    caminho.write_bytes(b"\x80\x81\x82\x83 nao decodifica como utf-8")

    with pytest.raises(PersistenciaDecisoesCorrompida) as excinfo:
        carregar_decisoes(caminho)

    assert "UnicodeDecodeError" not in str(excinfo.value)
    assert "Traceback" not in str(excinfo.value)


def test_persistencia_valida_continua_funcionando_apos_a_correcao(tmp_path):
    """Controle — a correção não pode quebrar o caminho feliz já
    homologado (roundtrip salvar/carregar)."""
    caminho = tmp_path / "decisoes.json"
    decisao = registrar_decisao(_revisao(), acao=AcaoDecisao.PUBLICAR, autor="teste@teste.com", obs_publicaveis={"2026OB000001"})
    salvar_decisao(caminho, decisao)

    carregado = carregar_decisoes(caminho)

    assert carregado[decisao.identidade_grupo].autor == "teste@teste.com"


# --- 21. Versão de esquema incompatível -------------------------------------


def test_versao_esquema_incompativel_levanta_erro_especifico(tmp_path):
    caminho = tmp_path / "decisoes.json"
    caminho.write_text('{"versao_esquema": 999, "decisoes": {}}', encoding="utf-8")

    with pytest.raises(VersaoEsquemaIncompativel):
        carregar_decisoes(caminho)


def test_versao_esquema_incompativel_e_subclasse_de_corrompida(tmp_path):
    caminho = tmp_path / "decisoes.json"
    caminho.write_text('{"versao_esquema": 999, "decisoes": {}}', encoding="utf-8")

    with pytest.raises(PersistenciaDecisoesCorrompida):
        carregar_decisoes(caminho)


def test_versao_esquema_atual_e_estavel():
    assert VERSAO_ESQUEMA_ATUAL == 1


# --- 22-23. Autor, data/hora e observação preservados -----------------------


def test_autor_data_hora_e_observacao_preservados(tmp_path):
    caminho = tmp_path / "decisoes.json"
    momento = datetime(2026, 8, 23, 14, 30, 0, tzinfo=timezone.utc)
    decisao = registrar_decisao(
        _revisao(),
        acao=AcaoDecisao.PUBLICAR,
        autor="maria.servidora",
        obs_publicaveis=["2026OB000001", "2026OB000002"],
        observacao="Confirmado com a CMFC: são duas viagens distintas.",
        agora=momento,
    )

    salvar_decisao(caminho, decisao)
    recuperada = carregar_decisoes(caminho)[decisao.identidade_grupo]

    assert recuperada.autor == "maria.servidora"
    assert recuperada.decidido_em == momento
    assert recuperada.observacao == "Confirmado com a CMFC: são duas viagens distintas."


# --- Minimização de dados sensíveis (§12) -----------------------------------


def test_json_persistido_nao_contem_cpf_nem_motivo_em_claro(tmp_path):
    caminho = tmp_path / "decisoes.json"
    decisao = registrar_decisao(
        _revisao(), acao=AcaoDecisao.PUBLICAR, autor="servidor.teste", obs_publicaveis=["2026OB000001"]
    )

    salvar_decisao(caminho, decisao)
    conteudo_bruto = caminho.read_text(encoding="utf-8")

    assert "11111111111" not in conteudo_bruto  # CPF usado no fingerprint, nunca em claro
    assert "Motivo de teste" not in conteudo_bruto  # motivo da OB, só entra no hash
    assert "RECIFE-GARANHUNS" not in conteudo_bruto  # trecho, só entra no hash


# ============================================================================
# QA Codex (BUG-01) — `salvar_decisao` fazia um ciclo read-modify-write sem
# nenhuma trava, com um `.tmp` fixo compartilhado: duas chamadas concorrentes
# perdiam uma decisão silenciosamente, ou levantavam `PermissionError` no
# Windows. Corrigido com `_LOCK_SALVAR_DECISAO` (`threading.Lock()`,
# cobrindo o ciclo inteiro). Os testes abaixo usam `threading.Barrier` para
# sincronizar o INÍCIO das duas (ou mais) threads, e um atraso injetado via
# `monkeypatch` logo após a leitura interna (`carregar_decisoes`, chamada
# por nome dentro do próprio módulo — patchável em `pd_module`) para alargar
# a janela vulnerável de forma confiável, em vez de depender só da sorte do
# agendamento do SO. Passam de forma determinística tanto antes quanto
# depois da correção só mudaria o RESULTADO (decisão perdida vs. as duas
# sobrevivendo) — por isso servem também como prova viva do bug quando
# rodados contra o código sem o lock.
# ============================================================================


def _outra_revisao(sufixo: str) -> RevisaoNecessaria:
    return RevisaoNecessaria(
        regra="RN04",
        motivo=f"Outro motivo {sufixo}",
        ocorrencias=[
            OcorrenciaFinanceira(
                dh=f"2026DH0009{sufixo}", ordem_bancaria=_ordem(ob=f"2026OB0009{sufixo}")
            )
        ],
    )


def _patchear_leitura_com_atraso(monkeypatch, atraso_s: float = 0.05):
    """Alarga deterministicamente a janela entre a leitura e a escrita de
    `salvar_decisao`, sem tocar no código de produção."""
    carregar_original = pd_module.carregar_decisoes

    def _carregar_com_atraso(caminho_arg):
        resultado = carregar_original(caminho_arg)
        time.sleep(atraso_s)
        return resultado

    monkeypatch.setattr(pd_module, "carregar_decisoes", _carregar_com_atraso)


def test_salvar_decisao_concorrente_duas_identidades_diferentes_sobrevivem(tmp_path, monkeypatch):
    caminho = tmp_path / "decisoes.json"
    decisao_a = registrar_decisao(_revisao(), acao=AcaoDecisao.ADIAR, autor="servidor.a")
    decisao_b = registrar_decisao(
        _outra_revisao("b"), acao=AcaoDecisao.PUBLICAR, autor="servidor.b", obs_publicaveis=["2026OB0009b"]
    )
    _patchear_leitura_com_atraso(monkeypatch)

    barreira = threading.Barrier(2)
    erros: dict[str, Exception | None] = {}

    def _tarefa(nome, decisao):
        barreira.wait(timeout=5)
        try:
            pd_module.salvar_decisao(caminho, decisao)
        except Exception as erro:  # noqa: BLE001 — capturado só para o assert abaixo
            erros[nome] = erro
        else:
            erros[nome] = None

    t1 = threading.Thread(target=_tarefa, args=("A", decisao_a))
    t2 = threading.Thread(target=_tarefa, args=("B", decisao_b))
    t1.start()
    t2.start()
    t1.join(timeout=15)
    t2.join(timeout=15)

    assert erros == {"A": None, "B": None}  # nenhuma exceção nas duas threads
    carregadas = carregar_decisoes(caminho)  # leitura real, sem o atraso injetado
    assert decisao_a.identidade_grupo in carregadas  # nenhuma decisão perdida
    assert decisao_b.identidade_grupo in carregadas


def test_salvar_decisao_concorrente_cinco_threads_arquivo_permanece_json_valido(tmp_path, monkeypatch):
    caminho = tmp_path / "decisoes.json"
    _patchear_leitura_com_atraso(monkeypatch, atraso_s=0.02)

    decisoes = [
        registrar_decisao(
            _outra_revisao(str(indice)),
            acao=AcaoDecisao.PUBLICAR,
            autor=f"servidor.{indice}",
            obs_publicaveis=[f"2026OB0009{indice}"],
        )
        for indice in range(5)
    ]

    barreira = threading.Barrier(len(decisoes))
    erros: dict[int, Exception | None] = {}

    def _tarefa(indice, decisao):
        barreira.wait(timeout=5)
        try:
            pd_module.salvar_decisao(caminho, decisao)
        except Exception as erro:  # noqa: BLE001
            erros[indice] = erro
        else:
            erros[indice] = None

    threads = [threading.Thread(target=_tarefa, args=(i, d)) for i, d in enumerate(decisoes)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=15)

    assert erros == dict.fromkeys(range(5))  # nenhuma exceção em nenhuma thread
    conteudo_bruto = caminho.read_text(encoding="utf-8")
    json.loads(conteudo_bruto)  # nunca corrompe — sempre JSON válido
    carregadas = carregar_decisoes(caminho)
    assert {d.identidade_grupo for d in decisoes} <= set(carregadas)  # nenhuma decisão perdida


def test_salvar_decisao_excecao_durante_escrita_nao_deixa_estado_invalido(tmp_path, monkeypatch):
    caminho = tmp_path / "decisoes.json"
    decisao_inicial = registrar_decisao(_revisao(), acao=AcaoDecisao.ADIAR, autor="servidor.inicial")
    salvar_decisao(caminho, decisao_inicial)
    conteudo_antes = caminho.read_text(encoding="utf-8")

    def _write_text_falha(self, *args, **kwargs):
        raise OSError("Falha de E/S simulada durante a escrita do .tmp")

    monkeypatch.setattr("pathlib.Path.write_text", _write_text_falha)
    decisao_nova = registrar_decisao(
        _outra_revisao("x"), acao=AcaoDecisao.PUBLICAR, autor="servidor.novo", obs_publicaveis=["2026OB0009x"]
    )

    with pytest.raises(OSError):
        salvar_decisao(caminho, decisao_nova)

    # A falha aconteceu escrevendo o `.tmp`, antes de qualquer `os.replace` —
    # o arquivo real permanece exatamente como estava.
    assert caminho.read_text(encoding="utf-8") == conteudo_antes

    monkeypatch.undo()
    # O lock precisa ter sido liberado mesmo com a exceção (garantia do
    # próprio `with` do Python) — uma chamada subsequente, sem a falha
    # simulada, tem que funcionar normalmente, nunca travar (deadlock).
    salvar_decisao(caminho, decisao_nova)
    carregadas = carregar_decisoes(caminho)
    assert decisao_nova.identidade_grupo in carregadas


# ============================================================================
# QA Codex (revalidação cross-process) — comprovou por contraexemplo que o
# `threading.Lock` (correção anterior) não sobrevive a `WEB_CONCURRENCY`/
# múltiplos workers Uvicorn: cada processo tem sua própria instância do
# lock, então os mesmos bugs (decisão perdida, erro) voltavam a acontecer
# entre PROCESSOS distintos, mesmo com a correção de threads já aplicada.
# Os testes abaixo usam `multiprocessing.Process` de verdade (não
# `threading.Thread`) para reproduzir exatamente esse cenário contra
# `_LOCK_SALVAR_DECISAO`... já removido — agora `_trava_decisoes`
# (`filelock.FileLock`).
# ============================================================================


def test_salvar_decisao_multiprocesso_duas_identidades_diferentes_sobrevivem(tmp_path):
    caminho = tmp_path / "decisoes.json"
    decisao_a = registrar_decisao(
        _outra_revisao("mpa"), acao=AcaoDecisao.PUBLICAR, autor="servidor.a", obs_publicaveis=["2026OB0009mpa"]
    )
    decisao_b = registrar_decisao(
        _outra_revisao("mpb"), acao=AcaoDecisao.PUBLICAR, autor="servidor.b", obs_publicaveis=["2026OB0009mpb"]
    )

    fila = multiprocessing.Queue()
    p1 = multiprocessing.Process(target=executar_e_reportar, args=(fila, salvar_decisao, (caminho, decisao_a), {}))
    p2 = multiprocessing.Process(target=executar_e_reportar, args=(fila, salvar_decisao, (caminho, decisao_b), {}))
    p1.start()
    p2.start()
    resultados = [fila.get(timeout=20) for _ in range(2)]
    p1.join(timeout=20)
    p2.join(timeout=20)

    assert all(r[0] == "ok" for r in resultados), resultados  # nenhuma exceção em nenhum processo
    carregadas = carregar_decisoes(caminho)
    assert decisao_a.identidade_grupo in carregadas  # nenhuma decisão perdida
    assert decisao_b.identidade_grupo in carregadas


def test_salvar_decisao_multiprocesso_cinco_processos_arquivo_permanece_valido(tmp_path):
    caminho = tmp_path / "decisoes.json"
    decisoes = [
        registrar_decisao(
            _outra_revisao(f"mp{indice}"),
            acao=AcaoDecisao.PUBLICAR,
            autor=f"servidor.{indice}",
            obs_publicaveis=[f"2026OB0009mp{indice}"],
        )
        for indice in range(5)
    ]

    fila = multiprocessing.Queue()
    processos = [
        multiprocessing.Process(target=executar_e_reportar, args=(fila, salvar_decisao, (caminho, decisao), {}))
        for decisao in decisoes
    ]
    for p in processos:
        p.start()
    resultados = [fila.get(timeout=30) for _ in range(5)]
    for p in processos:
        p.join(timeout=30)

    assert all(r[0] == "ok" for r in resultados), resultados
    conteudo_bruto = caminho.read_text(encoding="utf-8")
    json.loads(conteudo_bruto)  # nunca corrompe — sempre JSON válido
    carregadas = carregar_decisoes(caminho)
    assert {d.identidade_grupo for d in decisoes} <= set(carregadas)  # nenhuma decisão perdida


def test_salvar_decisao_processo_morto_segurando_trava_recupera_depois(tmp_path):
    """Mata um processo real (`Process.kill()`, sem chance de rodar
    `finally`/cleanup Python) enquanto ele segura `_trava_decisoes` —
    prova que a trava do SO (não uma convenção em código) some junto com o
    processo, e uma tentativa logo depois recupera dentro do timeout,
    nunca herdando um lock preso."""
    caminho = tmp_path / "decisoes.json"

    fila = multiprocessing.Queue()
    processo = multiprocessing.Process(
        target=segurar_trava_ate_ser_morto,
        args=(fila, pd_module._trava_decisoes, (caminho,)),
    )
    processo.start()
    sinal = fila.get(timeout=15)
    assert sinal == "trava_obtida"

    processo.kill()
    processo.join(timeout=15)
    assert not processo.is_alive()

    decisao_recuperacao = registrar_decisao(
        _outra_revisao("rec"), acao=AcaoDecisao.ADIAR, autor="servidor.recuperacao"
    )
    inicio = time.monotonic()
    salvar_decisao(caminho, decisao_recuperacao)  # NUNCA deve levantar PersistenciaDecisoesEmUso
    duracao = time.monotonic() - inicio
    assert duracao < 8  # recupera bem antes do timeout de 10s — nenhum lock órfão

    carregadas = carregar_decisoes(caminho)
    assert decisao_recuperacao.identidade_grupo in carregadas
