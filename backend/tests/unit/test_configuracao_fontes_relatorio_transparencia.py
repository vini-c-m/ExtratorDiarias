"""Micro-sprint UX operacional — testes do módulo de configuração isolada
dos caminhos de Base E-Fisco e Controle DIMCAC do Relatório de Diárias —
Portal da Transparência. Dados 100% sintéticos, nenhum arquivo real."""

import json
import multiprocessing
import threading
import time

import pytest

from app.consulta import configuracao_fontes_relatorio_transparencia as config
from tests._multiprocesso_util import executar_e_reportar, segurar_trava_ate_ser_morto


def test_carregar_configuracao_fontes_inexistente_devolve_none(tmp_path):
    caminho_configuracao = tmp_path / "nunca_criado.json"

    assert config.carregar_configuracao_fontes(str(caminho_configuracao)) is None


def test_persistir_e_carregar_configuracao_fontes(tmp_path):
    caminho_configuracao = str(tmp_path / "configuracao.json")

    persistida = config.persistir_configuracao_fontes(
        caminho_configuracao,
        caminho_base_efisco="C:\\fake\\ob.xlsx",
        caminho_controle_dimcac="C:\\fake\\dimcac.xlsx",
    )

    assert persistida.caminho_base_efisco == "C:\\fake\\ob.xlsx"
    assert persistida.caminho_controle_dimcac == "C:\\fake\\dimcac.xlsx"
    assert persistida.atualizado_em

    carregada = config.carregar_configuracao_fontes(caminho_configuracao)
    assert carregada == persistida


def test_persistir_configuracao_fontes_grava_json_legivel(tmp_path):
    caminho_configuracao = tmp_path / "configuracao.json"

    config.persistir_configuracao_fontes(
        str(caminho_configuracao), caminho_base_efisco="C:\\fake\\ob.xlsx"
    )

    conteudo = json.loads(caminho_configuracao.read_text(encoding="utf-8"))
    assert conteudo["caminho_base_efisco"] == "C:\\fake\\ob.xlsx"
    assert conteudo["caminho_controle_dimcac"] is None


# --- Atualização parcial: selecionar uma fonte nunca apaga a outra já
# configurada (achado da micro-sprint UX operacional: usuário seleciona as
# duas fontes em momentos diferentes, cada seleção é uma chamada própria).


def test_configurar_apenas_base_ob_preserva_controle_ja_configurado(tmp_path):
    caminho_configuracao = str(tmp_path / "configuracao.json")
    config.persistir_configuracao_fontes(caminho_configuracao, caminho_controle_dimcac="C:\\fake\\dimcac.xlsx")

    atualizada = config.persistir_configuracao_fontes(
        caminho_configuracao, caminho_base_efisco="C:\\fake\\ob.xlsx"
    )

    assert atualizada.caminho_base_efisco == "C:\\fake\\ob.xlsx"
    assert atualizada.caminho_controle_dimcac == "C:\\fake\\dimcac.xlsx"


def test_configurar_apenas_controle_preserva_base_ob_ja_configurada(tmp_path):
    caminho_configuracao = str(tmp_path / "configuracao.json")
    config.persistir_configuracao_fontes(
        caminho_configuracao, caminho_base_efisco="C:\\fake\\ob.xlsx"
    )

    atualizada = config.persistir_configuracao_fontes(
        caminho_configuracao, caminho_controle_dimcac="C:\\fake\\dimcac.xlsx"
    )

    assert atualizada.caminho_base_efisco == "C:\\fake\\ob.xlsx"
    assert atualizada.caminho_controle_dimcac == "C:\\fake\\dimcac.xlsx"


# --- Sprint 1 (plano "Valor da Passagem no XLSX Oficial") — terceira fonte
# persistida (Planilha de Passagens), mesmo mecanismo de atualização parcial.


def test_persistir_e_carregar_planilha_passagens(tmp_path):
    caminho_configuracao = str(tmp_path / "configuracao.json")

    persistida = config.persistir_configuracao_fontes(
        caminho_configuracao, caminho_planilha_passagens="C:\\fake\\passagens.ods"
    )

    assert persistida.caminho_planilha_passagens == "C:\\fake\\passagens.ods"
    assert config.carregar_configuracao_fontes(caminho_configuracao) == persistida


def test_configurar_apenas_passagens_preserva_base_ob_e_controle_ja_configurados(tmp_path):
    caminho_configuracao = str(tmp_path / "configuracao.json")
    config.persistir_configuracao_fontes(
        caminho_configuracao,
        caminho_base_efisco="C:\\fake\\ob.xlsx",
        caminho_controle_dimcac="C:\\fake\\dimcac.xlsx",
    )

    atualizada = config.persistir_configuracao_fontes(
        caminho_configuracao, caminho_planilha_passagens="C:\\fake\\passagens.ods"
    )

    assert atualizada.caminho_base_efisco == "C:\\fake\\ob.xlsx"
    assert atualizada.caminho_controle_dimcac == "C:\\fake\\dimcac.xlsx"
    assert atualizada.caminho_planilha_passagens == "C:\\fake\\passagens.ods"


def test_configurar_base_ob_preserva_passagens_ja_configurada(tmp_path):
    caminho_configuracao = str(tmp_path / "configuracao.json")
    config.persistir_configuracao_fontes(
        caminho_configuracao, caminho_planilha_passagens="C:\\fake\\passagens.ods"
    )

    atualizada = config.persistir_configuracao_fontes(
        caminho_configuracao, caminho_base_efisco="C:\\fake\\ob.xlsx"
    )

    assert atualizada.caminho_base_efisco == "C:\\fake\\ob.xlsx"
    assert atualizada.caminho_planilha_passagens == "C:\\fake\\passagens.ods"


def test_configuracao_persistida_antes_do_campo_passagens_existir_carrega_com_none(tmp_path):
    """Retrocompatibilidade: um `configuracao.json` gravado antes do Sprint 1
    (sem o campo `caminho_planilha_passagens`) nunca pode virar
    `ConfiguracaoFontesCorrompida` — o campo novo é opcional e ausente vira
    `None`, nunca `KeyError`."""
    caminho_configuracao = tmp_path / "configuracao_antiga.json"
    caminho_configuracao.write_text(
        json.dumps(
            {
                "caminho_base_efisco": "C:\\fake\\ob.xlsx",
                "caminho_controle_dimcac": None,
                "atualizado_em": "2026-01-01T00:00:00",
            }
        ),
        encoding="utf-8",
    )

    carregada = config.carregar_configuracao_fontes(str(caminho_configuracao))

    assert carregada.caminho_base_efisco == "C:\\fake\\ob.xlsx"
    assert carregada.caminho_planilha_passagens is None


# ============================================================================
# Plano de Migração E-Fisco, Sprint D — retrocompatibilidade de leitura da
# chave legada `caminho_base_ordens_bancarias` (nome do ClickView, gravado
# por qualquer instalação anterior a esta Sprint) para `caminho_base_efisco`
# (nome novo). O usuário nunca precisa selecionar a fonte de novo só por
# causa do rename.
# ============================================================================


def test_configuracao_legada_com_chave_antiga_de_base_ob_e_lida_no_campo_novo(tmp_path):
    """Um `configuracao.json` gravado por uma instalação anterior à Sprint D
    só tem a chave ANTIGA (`caminho_base_ordens_bancarias`) — nunca a nova.
    `carregar_configuracao_fontes` precisa reconhecer isso sem exigir que o
    usuário selecione a Base E-Fisco de novo."""
    caminho_configuracao = tmp_path / "configuracao_legada_clickview.json"
    caminho_configuracao.write_text(
        json.dumps(
            {
                "caminho_base_ordens_bancarias": "C:\\fake\\base_ob_legada.xlsx",
                "caminho_controle_dimcac": "C:\\fake\\dimcac.xlsx",
                "caminho_planilha_passagens": "C:\\fake\\passagens.ods",
                "atualizado_em": "2026-08-01T00:00:00",
            }
        ),
        encoding="utf-8",
    )

    carregada = config.carregar_configuracao_fontes(str(caminho_configuracao))

    assert carregada.caminho_base_efisco == "C:\\fake\\base_ob_legada.xlsx"
    assert carregada.caminho_controle_dimcac == "C:\\fake\\dimcac.xlsx"
    assert carregada.caminho_planilha_passagens == "C:\\fake\\passagens.ods"


def test_configuracao_legada_e_migrada_automaticamente_na_proxima_escrita(tmp_path):
    """Depois de carregar uma configuração legada (chave antiga) e persistir
    QUALQUER campo (mesmo um campo diferente, ex. Controle DIMCAC), o arquivo
    reescrito no disco passa a usar a chave NOVA — migração automática,
    silenciosa, sem nenhum passo manual."""
    caminho_configuracao = tmp_path / "configuracao.json"
    caminho_configuracao.write_text(
        json.dumps(
            {
                "caminho_base_ordens_bancarias": "C:\\fake\\base_ob_legada.xlsx",
                "caminho_controle_dimcac": None,
                "atualizado_em": "2026-08-01T00:00:00",
            }
        ),
        encoding="utf-8",
    )

    config.persistir_configuracao_fontes(str(caminho_configuracao), caminho_controle_dimcac="C:\\fake\\dimcac.xlsx")

    conteudo = json.loads(caminho_configuracao.read_text(encoding="utf-8"))
    assert "caminho_base_efisco" in conteudo
    assert "caminho_base_ordens_bancarias" not in conteudo
    assert conteudo["caminho_base_efisco"] == "C:\\fake\\base_ob_legada.xlsx"  # preservado, nunca perdido na migração
    assert conteudo["caminho_controle_dimcac"] == "C:\\fake\\dimcac.xlsx"

    recarregada = config.carregar_configuracao_fontes(str(caminho_configuracao))
    assert recarregada.caminho_base_efisco == "C:\\fake\\base_ob_legada.xlsx"


def test_configuracao_com_chave_nova_e_lida_normalmente_sem_fallback(tmp_path):
    """Uma configuração já no formato novo (gravada por esta versão ou
    posterior) usa a chave nova diretamente — o fallback para a chave legada
    só entra em ação quando a nova está ausente."""
    caminho_configuracao = tmp_path / "configuracao_nova.json"
    caminho_configuracao.write_text(
        json.dumps(
            {
                "caminho_base_efisco": "C:\\fake\\efisco.xlsx",
                "caminho_controle_dimcac": None,
                "atualizado_em": "2026-09-01T00:00:00",
            }
        ),
        encoding="utf-8",
    )

    carregada = config.carregar_configuracao_fontes(str(caminho_configuracao))

    assert carregada.caminho_base_efisco == "C:\\fake\\efisco.xlsx"


def test_configurar_nova_base_ob_sobrescreve_apenas_esse_campo(tmp_path):
    caminho_configuracao = str(tmp_path / "configuracao.json")
    config.persistir_configuracao_fontes(
        caminho_configuracao,
        caminho_base_efisco="C:\\fake\\ob_v1.xlsx",
        caminho_controle_dimcac="C:\\fake\\dimcac.xlsx",
    )

    atualizada = config.persistir_configuracao_fontes(
        caminho_configuracao, caminho_base_efisco="C:\\fake\\ob_v2.xlsx"
    )

    assert atualizada.caminho_base_efisco == "C:\\fake\\ob_v2.xlsx"
    assert atualizada.caminho_controle_dimcac == "C:\\fake\\dimcac.xlsx"


# --- Confronto QA Codex / mesmo critério de
# `ConfiguracaoTemplateCorrompida` — configuração corrompida/estruturalmente
# inválida vira erro de domínio controlado, nunca `JSONDecodeError`/
# `KeyError`/`TypeError` cru.


def test_carregar_configuracao_fontes_json_sintaticamente_invalido(tmp_path):
    caminho_configuracao = tmp_path / "corrompido.json"
    caminho_configuracao.write_text("{ isso nao e json valido ][", encoding="utf-8")

    with pytest.raises(config.ConfiguracaoFontesCorrompida):
        config.carregar_configuracao_fontes(str(caminho_configuracao))


def test_carregar_configuracao_fontes_sem_campo_obrigatorio(tmp_path):
    caminho_configuracao = tmp_path / "incompleto.json"
    caminho_configuracao.write_text(json.dumps({"caminho_controle_dimcac": None}), encoding="utf-8")

    with pytest.raises(config.ConfiguracaoFontesCorrompida):
        config.carregar_configuracao_fontes(str(caminho_configuracao))


@pytest.mark.parametrize(
    "conteudo",
    [
        json.dumps(
            {"caminho_base_efisco": 123, "caminho_controle_dimcac": None, "atualizado_em": "2026-01-01T00:00:00"}
        ),
        json.dumps(
            {
                "caminho_base_efisco": None,
                "caminho_controle_dimcac": ["a", "b"],
                "atualizado_em": "2026-01-01T00:00:00",
            }
        ),
        json.dumps({"caminho_base_efisco": None, "caminho_controle_dimcac": None, "atualizado_em": 20260101}),
    ],
)
def test_carregar_configuracao_fontes_tipos_estruturalmente_invalidos(tmp_path, conteudo):
    caminho_configuracao = tmp_path / "tipo_errado.json"
    caminho_configuracao.write_text(conteudo, encoding="utf-8")

    with pytest.raises(config.ConfiguracaoFontesCorrompida):
        config.carregar_configuracao_fontes(str(caminho_configuracao))


@pytest.mark.parametrize("conteudo", [json.dumps([1, 2, 3]), json.dumps("apenas uma string"), json.dumps(42)])
def test_carregar_configuracao_fontes_json_valido_mas_nao_e_objeto(tmp_path, conteudo):
    caminho_configuracao = tmp_path / "nao_e_objeto.json"
    caminho_configuracao.write_text(conteudo, encoding="utf-8")

    with pytest.raises(config.ConfiguracaoFontesCorrompida):
        config.carregar_configuracao_fontes(str(caminho_configuracao))


def test_carregar_configuracao_fontes_corrompida_nunca_expoe_caminho_interno(tmp_path):
    caminho_configuracao = tmp_path / "configuracao_interna_sensivel.json"
    caminho_configuracao.write_text("{ invalido", encoding="utf-8")

    with pytest.raises(config.ConfiguracaoFontesCorrompida) as excinfo:
        config.carregar_configuracao_fontes(str(caminho_configuracao))

    assert "configuracao_interna_sensivel" not in str(excinfo.value)


def test_carregar_configuracao_fontes_bytes_utf8_invalidos(tmp_path):
    caminho_configuracao = tmp_path / "bytes_invalidos.json"
    caminho_configuracao.write_bytes(b"\x80\x81\x82\x83 nao decodifica como utf-8")

    with pytest.raises(config.ConfiguracaoFontesCorrompida):
        config.carregar_configuracao_fontes(str(caminho_configuracao))


def test_carregar_configuracao_fontes_permission_error(tmp_path, monkeypatch):
    caminho_configuracao = tmp_path / "sem_permissao.json"
    caminho_configuracao.write_text(
        '{"caminho_base_efisco": null, "caminho_controle_dimcac": null, "atualizado_em": "y"}',
        encoding="utf-8",
    )

    def _read_text_nega_permissao(self, *args, **kwargs):
        raise PermissionError("Acesso negado (simulado)")

    monkeypatch.setattr("pathlib.Path.read_text", _read_text_nega_permissao)

    with pytest.raises(config.ConfiguracaoFontesCorrompida):
        config.carregar_configuracao_fontes(str(caminho_configuracao))


def test_carregar_configuracao_fontes_oserror_generico(tmp_path, monkeypatch):
    caminho_configuracao = tmp_path / "falha_io.json"
    caminho_configuracao.write_text(
        '{"caminho_base_efisco": null, "caminho_controle_dimcac": null, "atualizado_em": "y"}',
        encoding="utf-8",
    )

    def _read_text_falha_io(self, *args, **kwargs):
        raise OSError("Falha de E/S simulada")

    monkeypatch.setattr("pathlib.Path.read_text", _read_text_falha_io)

    with pytest.raises(config.ConfiguracaoFontesCorrompida):
        config.carregar_configuracao_fontes(str(caminho_configuracao))


# ============================================================================
# QA Codex (BUG-02) — `persistir_configuracao_fontes` fazia um ciclo
# read-modify-write sem trava, com um `.tmp` fixo compartilhado: duas
# atualizações parciais concorrentes (campos diferentes) podiam descartar
# uma a outra (lost update) ou corromper o JSON final. Corrigido com
# `_LOCK_PERSISTIR_CONFIGURACAO_FONTES` (`threading.Lock()`, cobrindo o
# ciclo inteiro). Mesma técnica de teste de `test_persistencia_decisoes.py`:
# `threading.Barrier` sincroniza o início, um atraso injetado via
# `monkeypatch` logo após a leitura interna (`carregar_configuracao_fontes`)
# alarga a janela vulnerável de forma determinística.
# ============================================================================


def _patchear_leitura_com_atraso(monkeypatch, atraso_s: float = 0.05):
    carregar_original = config.carregar_configuracao_fontes

    def _carregar_com_atraso(caminho_arg):
        resultado = carregar_original(caminho_arg)
        time.sleep(atraso_s)
        return resultado

    monkeypatch.setattr(config, "carregar_configuracao_fontes", _carregar_com_atraso)


def test_persistir_configuracao_fontes_concorrente_campos_diferentes_sao_mesclados(tmp_path, monkeypatch):
    caminho_configuracao = str(tmp_path / "configuracao.json")
    _patchear_leitura_com_atraso(monkeypatch)

    barreira = threading.Barrier(2)
    erros: dict[str, Exception | None] = {}

    def _tarefa(nome, **kwargs):
        barreira.wait(timeout=5)
        try:
            config.persistir_configuracao_fontes(caminho_configuracao, **kwargs)
        except Exception as erro:  # noqa: BLE001 — capturado só para o assert abaixo
            erros[nome] = erro
        else:
            erros[nome] = None

    t1 = threading.Thread(target=_tarefa, args=("A",), kwargs={"caminho_base_efisco": "C:\\fake\\ob.xlsx"})
    t2 = threading.Thread(
        target=_tarefa, args=("B",), kwargs={"caminho_controle_dimcac": "C:\\fake\\dimcac.xlsx"}
    )
    t1.start()
    t2.start()
    t1.join(timeout=15)
    t2.join(timeout=15)

    assert erros == {"A": None, "B": None}  # nenhuma exceção nas duas threads
    conteudo_bruto = (tmp_path / "configuracao.json").read_text(encoding="utf-8")
    json.loads(conteudo_bruto)  # nunca corrompe — sempre JSON válido

    final = config.carregar_configuracao_fontes(caminho_configuracao)  # leitura real, sem o atraso injetado
    assert final.caminho_base_efisco == "C:\\fake\\ob.xlsx"  # nenhum dos dois updates foi perdido
    assert final.caminho_controle_dimcac == "C:\\fake\\dimcac.xlsx"


def test_persistir_configuracao_fontes_concorrente_tres_campos_todos_mesclados(tmp_path, monkeypatch):
    caminho_configuracao = str(tmp_path / "configuracao.json")
    _patchear_leitura_com_atraso(monkeypatch, atraso_s=0.02)

    tarefas_kwargs = [
        {"caminho_base_efisco": "C:\\fake\\ob.xlsx"},
        {"caminho_controle_dimcac": "C:\\fake\\dimcac.xlsx"},
        {"caminho_planilha_passagens": "C:\\fake\\passagens.ods"},
    ]
    barreira = threading.Barrier(len(tarefas_kwargs))
    erros: dict[int, Exception | None] = {}

    def _tarefa(indice, kwargs):
        barreira.wait(timeout=5)
        try:
            config.persistir_configuracao_fontes(caminho_configuracao, **kwargs)
        except Exception as erro:  # noqa: BLE001
            erros[indice] = erro
        else:
            erros[indice] = None

    threads = [threading.Thread(target=_tarefa, args=(i, kw)) for i, kw in enumerate(tarefas_kwargs)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=15)

    assert erros == dict.fromkeys(range(3))  # nenhuma exceção em nenhuma thread
    conteudo_bruto = (tmp_path / "configuracao.json").read_text(encoding="utf-8")
    json.loads(conteudo_bruto)  # nunca corrompe

    final = config.carregar_configuracao_fontes(caminho_configuracao)
    assert final.caminho_base_efisco == "C:\\fake\\ob.xlsx"
    assert final.caminho_controle_dimcac == "C:\\fake\\dimcac.xlsx"
    assert final.caminho_planilha_passagens == "C:\\fake\\passagens.ods"


def test_persistir_configuracao_fontes_excecao_durante_escrita_nao_deixa_estado_invalido(tmp_path, monkeypatch):
    caminho_configuracao = tmp_path / "configuracao.json"
    config.persistir_configuracao_fontes(str(caminho_configuracao), caminho_base_efisco="C:\\fake\\ob_v1.xlsx")
    conteudo_antes = caminho_configuracao.read_text(encoding="utf-8")

    def _write_text_falha(self, *args, **kwargs):
        raise OSError("Falha de E/S simulada durante a escrita do .tmp")

    monkeypatch.setattr("pathlib.Path.write_text", _write_text_falha)

    with pytest.raises(OSError):
        config.persistir_configuracao_fontes(str(caminho_configuracao), caminho_base_efisco="C:\\fake\\ob_v2.xlsx")

    # A falha aconteceu escrevendo o `.tmp`, antes de qualquer `os.replace` —
    # o arquivo real permanece exatamente como estava.
    assert caminho_configuracao.read_text(encoding="utf-8") == conteudo_antes

    monkeypatch.undo()
    # O lock precisa ter sido liberado mesmo com a exceção — uma chamada
    # subsequente, sem a falha simulada, tem que funcionar normalmente,
    # nunca travar (deadlock).
    atualizada = config.persistir_configuracao_fontes(
        str(caminho_configuracao), caminho_base_efisco="C:\\fake\\ob_v2.xlsx"
    )
    assert atualizada.caminho_base_efisco == "C:\\fake\\ob_v2.xlsx"


# ============================================================================
# QA Codex (revalidação cross-process) — `multiprocessing.Process` de
# verdade (não `threading.Thread`), reproduzindo o cenário exato do
# contraexemplo (`WEB_CONCURRENCY`/múltiplos workers Uvicorn = processos
# distintos, cada um com seu próprio estado em memória).
# ============================================================================


def test_persistir_configuracao_fontes_multiprocesso_campos_diferentes_mesclados(tmp_path):
    caminho_configuracao = str(tmp_path / "configuracao.json")

    fila = multiprocessing.Queue()
    p1 = multiprocessing.Process(
        target=executar_e_reportar,
        args=(fila, config.persistir_configuracao_fontes, (caminho_configuracao,), {"caminho_base_efisco": "C:\\fake\\ob.xlsx"}),
    )
    p2 = multiprocessing.Process(
        target=executar_e_reportar,
        args=(fila, config.persistir_configuracao_fontes, (caminho_configuracao,), {"caminho_controle_dimcac": "C:\\fake\\dimcac.xlsx"}),
    )
    p1.start()
    p2.start()
    resultados = [fila.get(timeout=20) for _ in range(2)]
    p1.join(timeout=20)
    p2.join(timeout=20)

    assert all(r[0] == "ok" for r in resultados), resultados
    conteudo_bruto = (tmp_path / "configuracao.json").read_text(encoding="utf-8")
    json.loads(conteudo_bruto)  # nunca corrompe

    final = config.carregar_configuracao_fontes(caminho_configuracao)
    assert final.caminho_base_efisco == "C:\\fake\\ob.xlsx"  # nenhum dos dois updates foi perdido
    assert final.caminho_controle_dimcac == "C:\\fake\\dimcac.xlsx"


def test_persistir_configuracao_fontes_processo_morto_segurando_trava_recupera_depois(tmp_path):
    caminho_configuracao = str(tmp_path / "configuracao.json")

    fila = multiprocessing.Queue()
    processo = multiprocessing.Process(
        target=segurar_trava_ate_ser_morto,
        args=(fila, config._trava_fontes, (caminho_configuracao,)),
    )
    processo.start()
    sinal = fila.get(timeout=15)
    assert sinal == "trava_obtida"

    processo.kill()
    processo.join(timeout=15)
    assert not processo.is_alive()

    inicio = time.monotonic()
    atualizada = config.persistir_configuracao_fontes(caminho_configuracao, caminho_base_efisco="C:\\fake\\ob.xlsx")
    duracao = time.monotonic() - inicio
    assert duracao < 8  # recupera bem antes do timeout de 10s — nenhum lock órfão
    assert atualizada.caminho_base_efisco == "C:\\fake\\ob.xlsx"
