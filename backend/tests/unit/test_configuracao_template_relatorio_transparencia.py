"""Micro-sprint 3H — testes do módulo de configuração isolada do Template
Oficial do Relatório de Diárias — Portal da Transparência. Dados 100%
sintéticos, nenhum arquivo real."""

import json
import multiprocessing
import pathlib
import threading
import time

import pytest
from openpyxl import Workbook

from app.consulta import configuracao_template_relatorio_transparencia as config
from tests._multiprocesso_util import executar_e_reportar, segurar_trava_ate_ser_morto


def _criar_xlsx(caminho) -> str:
    wb = Workbook()
    wb.active.title = "Sheet1"
    wb.save(caminho)
    return str(caminho)


def test_carregar_configuracao_template_inexistente_devolve_none(tmp_path):
    caminho_configuracao = tmp_path / "nunca_criado.json"

    assert config.carregar_configuracao_template(str(caminho_configuracao)) is None


def test_persistir_e_carregar_configuracao_template(tmp_path):
    caminho_template = _criar_xlsx(tmp_path / "template.xlsx")
    caminho_configuracao = str(tmp_path / "configuracao.json")

    persistida = config.persistir_configuracao_template(caminho_configuracao, caminho_template)

    assert persistida.caminho_template == caminho_template
    assert persistida.configurado_em

    carregada = config.carregar_configuracao_template(caminho_configuracao)
    assert carregada == persistida


def test_persistir_configuracao_template_grava_json_legivel(tmp_path):
    caminho_template = _criar_xlsx(tmp_path / "template.xlsx")
    caminho_configuracao = tmp_path / "configuracao.json"

    config.persistir_configuracao_template(str(caminho_configuracao), caminho_template)

    conteudo = json.loads(caminho_configuracao.read_text(encoding="utf-8"))
    assert conteudo["caminho_template"] == caminho_template


def test_persistir_configuracao_template_rejeita_arquivo_inexistente(tmp_path):
    caminho_configuracao = str(tmp_path / "configuracao.json")

    with pytest.raises(config.TemplateOficialInvalido):
        config.persistir_configuracao_template(caminho_configuracao, str(tmp_path / "nao_existe.xlsx"))

    # Nada persistido quando a validação falha.
    assert not (tmp_path / "configuracao.json").exists()


def test_persistir_configuracao_template_rejeita_extensao_errada(tmp_path):
    caminho_nao_xlsx = tmp_path / "template.csv"
    caminho_nao_xlsx.write_text("a,b,c")
    caminho_configuracao = str(tmp_path / "configuracao.json")

    with pytest.raises(config.TemplateOficialInvalido):
        config.persistir_configuracao_template(caminho_configuracao, str(caminho_nao_xlsx))


def test_persistir_configuracao_template_rejeita_arquivo_corrompido(tmp_path):
    caminho_corrompido = tmp_path / "corrompido.xlsx"
    caminho_corrompido.write_bytes(b"nao e um xlsx de verdade")
    caminho_configuracao = str(tmp_path / "configuracao.json")

    with pytest.raises(config.TemplateOficialInvalido):
        config.persistir_configuracao_template(caminho_configuracao, str(caminho_corrompido))


def test_persistir_configuracao_template_sobrescreve_configuracao_anterior(tmp_path):
    caminho_configuracao = str(tmp_path / "configuracao.json")
    caminho_v1 = _criar_xlsx(tmp_path / "v1.xlsx")
    caminho_v2 = _criar_xlsx(tmp_path / "v2.xlsx")

    config.persistir_configuracao_template(caminho_configuracao, caminho_v1)
    config.persistir_configuracao_template(caminho_configuracao, caminho_v2)

    carregada = config.carregar_configuracao_template(caminho_configuracao)
    assert carregada.caminho_template == caminho_v2


def test_resolver_caminho_template_nao_configurado_levanta_indisponivel(tmp_path):
    caminho_configuracao = str(tmp_path / "nunca_criado.json")

    with pytest.raises(config.TemplateOficialIndisponivel):
        config.resolver_caminho_template(caminho_configuracao)


def test_resolver_caminho_template_configurado_mas_arquivo_sumiu(tmp_path):
    caminho_template = _criar_xlsx(tmp_path / "template.xlsx")
    caminho_configuracao = str(tmp_path / "configuracao.json")
    config.persistir_configuracao_template(caminho_configuracao, caminho_template)

    (tmp_path / "template.xlsx").unlink()

    with pytest.raises(config.TemplateOficialIndisponivel):
        config.resolver_caminho_template(caminho_configuracao)


def test_resolver_caminho_template_configurado_e_disponivel(tmp_path):
    caminho_template = _criar_xlsx(tmp_path / "template.xlsx")
    caminho_configuracao = str(tmp_path / "configuracao.json")
    config.persistir_configuracao_template(caminho_configuracao, caminho_template)

    assert config.resolver_caminho_template(caminho_configuracao) == caminho_template


def test_mensagens_de_indisponivel_nunca_expoem_caminho_interno(tmp_path):
    """Item 12/privacidade — a mensagem devolvida direto ao usuário nunca
    inclui o caminho do arquivo de configuração (infraestrutura interna)."""
    caminho_configuracao = str(tmp_path / "configuracao_interna_sensivel.json")

    with pytest.raises(config.TemplateOficialIndisponivel) as excinfo:
        config.resolver_caminho_template(caminho_configuracao)

    assert "configuracao_interna_sensivel" not in str(excinfo.value)


# --- Confronto QA Codex / QA-RT-03 — configuração corrompida/estruturalmente
# inválida vira erro de domínio controlado (`ConfiguracaoTemplateCorrompida`),
# nunca `JSONDecodeError`/`KeyError`/`TypeError` cru. Achado real: antes
# desta correção, essas exceções escapavam de `carregar_configuracao_template`
# até a API, resultando em HTTP 500 genérico (ver
# `tests/integration/test_api_relatorio_transparencia.py`).


def test_carregar_configuracao_template_json_sintaticamente_invalido(tmp_path):
    caminho_configuracao = tmp_path / "corrompido.json"
    caminho_configuracao.write_text("{ isso nao e json valido ][", encoding="utf-8")

    with pytest.raises(config.ConfiguracaoTemplateCorrompida):
        config.carregar_configuracao_template(str(caminho_configuracao))


def test_carregar_configuracao_template_sem_campo_obrigatorio(tmp_path):
    caminho_configuracao = tmp_path / "incompleto.json"
    caminho_configuracao.write_text(json.dumps({"configurado_em": "2026-01-01T00:00:00"}), encoding="utf-8")

    with pytest.raises(config.ConfiguracaoTemplateCorrompida):
        config.carregar_configuracao_template(str(caminho_configuracao))


def test_carregar_configuracao_template_sem_o_outro_campo_obrigatorio(tmp_path):
    caminho_configuracao = tmp_path / "incompleto2.json"
    caminho_configuracao.write_text(json.dumps({"caminho_template": "C:\\fake\\t.xlsx"}), encoding="utf-8")

    with pytest.raises(config.ConfiguracaoTemplateCorrompida):
        config.carregar_configuracao_template(str(caminho_configuracao))


@pytest.mark.parametrize(
    "conteudo",
    [
        json.dumps({"caminho_template": 123, "configurado_em": "2026-01-01T00:00:00"}),
        json.dumps({"caminho_template": None, "configurado_em": "2026-01-01T00:00:00"}),
        json.dumps({"caminho_template": ["a", "b"], "configurado_em": "2026-01-01T00:00:00"}),
        json.dumps({"caminho_template": "C:\\fake\\t.xlsx", "configurado_em": 20260101}),
    ],
)
def test_carregar_configuracao_template_tipos_estruturalmente_invalidos(tmp_path, conteudo):
    caminho_configuracao = tmp_path / "tipo_errado.json"
    caminho_configuracao.write_text(conteudo, encoding="utf-8")

    with pytest.raises(config.ConfiguracaoTemplateCorrompida):
        config.carregar_configuracao_template(str(caminho_configuracao))


@pytest.mark.parametrize("conteudo", [json.dumps([1, 2, 3]), json.dumps("apenas uma string"), json.dumps(42)])
def test_carregar_configuracao_template_json_valido_mas_nao_e_objeto(tmp_path, conteudo):
    caminho_configuracao = tmp_path / "nao_e_objeto.json"
    caminho_configuracao.write_text(conteudo, encoding="utf-8")

    with pytest.raises(config.ConfiguracaoTemplateCorrompida):
        config.carregar_configuracao_template(str(caminho_configuracao))


def test_carregar_configuracao_template_corrompida_nunca_expoe_caminho_interno(tmp_path):
    caminho_configuracao = tmp_path / "configuracao_interna_sensivel.json"
    caminho_configuracao.write_text("{ invalido", encoding="utf-8")

    with pytest.raises(config.ConfiguracaoTemplateCorrompida) as excinfo:
        config.carregar_configuracao_template(str(caminho_configuracao))

    assert "configuracao_interna_sensivel" not in str(excinfo.value)


def test_carregar_configuracao_template_bytes_utf8_invalidos(tmp_path):
    """Confronto QA Codex / revalidação final — bytes que não decodificam
    como UTF-8 escapavam como `UnicodeDecodeError` cru antes desta
    correção (não capturado por nenhum dos `except` existentes)."""
    caminho_configuracao = tmp_path / "bytes_invalidos.json"
    caminho_configuracao.write_bytes(b"\x80\x81\x82\x83 nao decodifica como utf-8")

    with pytest.raises(config.ConfiguracaoTemplateCorrompida):
        config.carregar_configuracao_template(str(caminho_configuracao))


def test_carregar_configuracao_template_permission_error(tmp_path, monkeypatch):
    """Confronto QA Codex / revalidação final — arquivo existe (passa em
    `os.path.isfile`) mas a leitura em si falha por permissão negada;
    escapava como `PermissionError` cru antes desta correção."""
    caminho_configuracao = tmp_path / "sem_permissao.json"
    caminho_configuracao.write_text('{"caminho_template": "x", "configurado_em": "y"}', encoding="utf-8")

    def _read_text_nega_permissao(self, *args, **kwargs):
        raise PermissionError("Acesso negado (simulado)")

    monkeypatch.setattr("pathlib.Path.read_text", _read_text_nega_permissao)

    with pytest.raises(config.ConfiguracaoTemplateCorrompida):
        config.carregar_configuracao_template(str(caminho_configuracao))


def test_carregar_configuracao_template_oserror_generico(tmp_path, monkeypatch):
    """Confronto QA Codex / revalidação final — qualquer outro `OSError`
    de leitura (arquivo bloqueado por outro processo, falha de I/O etc.)
    também precisa virar erro de domínio controlado, nunca escapar cru."""
    caminho_configuracao = tmp_path / "falha_io.json"
    caminho_configuracao.write_text('{"caminho_template": "x", "configurado_em": "y"}', encoding="utf-8")

    def _read_text_falha_io(self, *args, **kwargs):
        raise OSError("Falha de E/S simulada")

    monkeypatch.setattr("pathlib.Path.read_text", _read_text_falha_io)

    with pytest.raises(config.ConfiguracaoTemplateCorrompida):
        config.carregar_configuracao_template(str(caminho_configuracao))


def test_resolver_caminho_template_propaga_configuracao_corrompida(tmp_path):
    """`resolver_caminho_template` (usado por `/gerar`) não engole nem
    reinterpreta a corrupção como "não configurado" — propaga o erro
    específico, para a API distinguir os dois casos."""
    caminho_configuracao = tmp_path / "corrompido.json"
    caminho_configuracao.write_text("{ invalido", encoding="utf-8")

    with pytest.raises(config.ConfiguracaoTemplateCorrompida):
        config.resolver_caminho_template(str(caminho_configuracao))


def test_config_valida_continua_funcionando_apos_a_correcao(tmp_path):
    """Controle — a correção não pode quebrar o caminho feliz já
    homologado."""
    caminho_template = _criar_xlsx(tmp_path / "template.xlsx")
    caminho_configuracao = str(tmp_path / "configuracao.json")
    config.persistir_configuracao_template(caminho_configuracao, caminho_template)

    carregada = config.carregar_configuracao_template(caminho_configuracao)

    assert carregada.caminho_template == caminho_template


# ============================================================================
# Achado colateral da auditoria de concorrência que corrigiu BUG-01/BUG-02
# (`persistencia_decisoes.py`/`configuracao_fontes_relatorio_transparencia.py`)
# — `persistir_configuracao_template` usava a mesma técnica `.tmp` fixo +
# `os.replace` sem trava. Diferente dos outros dois módulos, esta função não
# faz merge de campos (sempre um overwrite completo — não lê a configuração
# anterior), então o risco não é "lost update" de um campo, é duas escritas
# concorrentes colidindo no mesmo `.tmp` (JSON corrompido / `PermissionError`
# no Windows). Corrigido com `_LOCK_PERSISTIR_CONFIGURACAO_TEMPLATE`
# (`threading.Lock()`, cobrindo só a escrita — a validação do arquivo de
# template, que não toca o recurso compartilhado, fica fora do lock).
# Mesma técnica de teste: como não há uma leitura interna para atrasar (a
# função não lê a config anterior), o atraso é injetado na própria escrita
# (`Path.write_text`), alargando a janela entre "escreveu o .tmp" e
# "promoveu com os.replace" — exatamente onde a corrida acontecia.
# ============================================================================


def _patchear_escrita_com_atraso(monkeypatch, atraso_s: float = 0.05):
    escrever_original = pathlib.Path.write_text

    def _escrever_com_atraso(self, *args, **kwargs):
        resultado = escrever_original(self, *args, **kwargs)
        time.sleep(atraso_s)
        return resultado

    monkeypatch.setattr("pathlib.Path.write_text", _escrever_com_atraso)


def test_persistir_configuracao_template_concorrente_nao_corrompe_nem_falha(tmp_path, monkeypatch):
    caminho_configuracao = str(tmp_path / "configuracao.json")
    caminho_template_a = _criar_xlsx(tmp_path / "template_a.xlsx")
    caminho_template_b = _criar_xlsx(tmp_path / "template_b.xlsx")
    _patchear_escrita_com_atraso(monkeypatch)

    barreira = threading.Barrier(2)
    erros: dict[str, Exception | None] = {}

    def _tarefa(nome, caminho_template):
        barreira.wait(timeout=5)
        try:
            config.persistir_configuracao_template(caminho_configuracao, caminho_template)
        except Exception as erro:  # noqa: BLE001 — capturado só para o assert abaixo
            erros[nome] = erro
        else:
            erros[nome] = None

    t1 = threading.Thread(target=_tarefa, args=("A", caminho_template_a))
    t2 = threading.Thread(target=_tarefa, args=("B", caminho_template_b))
    t1.start()
    t2.start()
    t1.join(timeout=15)
    t2.join(timeout=15)

    assert erros == {"A": None, "B": None}  # nenhuma exceção nas duas threads
    conteudo_bruto = (tmp_path / "configuracao.json").read_text(encoding="utf-8")
    json.loads(conteudo_bruto)  # nunca corrompe — sempre JSON válido

    final = config.carregar_configuracao_template(caminho_configuracao)
    # last-write-wins determinístico (mesma semântica de negócio de hoje
    # para "selecionar o template duas vezes seguidas") — nunca um estado
    # misto/corrompido entre as duas tentativas.
    assert final.caminho_template in {caminho_template_a, caminho_template_b}


def test_persistir_configuracao_template_excecao_durante_escrita_nao_deixa_estado_invalido(tmp_path, monkeypatch):
    caminho_template_v1 = _criar_xlsx(tmp_path / "v1.xlsx")
    caminho_configuracao = tmp_path / "configuracao.json"
    config.persistir_configuracao_template(str(caminho_configuracao), caminho_template_v1)
    conteudo_antes = caminho_configuracao.read_text(encoding="utf-8")

    caminho_template_v2 = _criar_xlsx(tmp_path / "v2.xlsx")

    def _write_text_falha(self, *args, **kwargs):
        raise OSError("Falha de E/S simulada durante a escrita do .tmp")

    monkeypatch.setattr("pathlib.Path.write_text", _write_text_falha)

    with pytest.raises(OSError):
        config.persistir_configuracao_template(str(caminho_configuracao), caminho_template_v2)

    # A falha aconteceu escrevendo o `.tmp`, antes de qualquer `os.replace` —
    # o arquivo real permanece exatamente como estava.
    assert caminho_configuracao.read_text(encoding="utf-8") == conteudo_antes

    monkeypatch.undo()
    # O lock precisa ter sido liberado mesmo com a exceção — uma chamada
    # subsequente, sem a falha simulada, tem que funcionar normalmente,
    # nunca travar (deadlock).
    atualizada = config.persistir_configuracao_template(str(caminho_configuracao), caminho_template_v2)
    assert atualizada.caminho_template == caminho_template_v2


# ============================================================================
# QA Codex (revalidação cross-process) — `multiprocessing.Process` de
# verdade, mesmo critério dos outros módulos irmãos.
# ============================================================================


def test_persistir_configuracao_template_multiprocesso_nao_corrompe_nem_falha(tmp_path):
    caminho_configuracao = str(tmp_path / "configuracao.json")
    caminho_template_a = _criar_xlsx(tmp_path / "template_a.xlsx")
    caminho_template_b = _criar_xlsx(tmp_path / "template_b.xlsx")

    fila = multiprocessing.Queue()
    p1 = multiprocessing.Process(
        target=executar_e_reportar,
        args=(fila, config.persistir_configuracao_template, (caminho_configuracao, caminho_template_a), {}),
    )
    p2 = multiprocessing.Process(
        target=executar_e_reportar,
        args=(fila, config.persistir_configuracao_template, (caminho_configuracao, caminho_template_b), {}),
    )
    p1.start()
    p2.start()
    resultados = [fila.get(timeout=20) for _ in range(2)]
    p1.join(timeout=20)
    p2.join(timeout=20)

    assert all(r[0] == "ok" for r in resultados), resultados
    conteudo_bruto = (tmp_path / "configuracao.json").read_text(encoding="utf-8")
    json.loads(conteudo_bruto)  # nunca corrompe

    final = config.carregar_configuracao_template(caminho_configuracao)
    assert final.caminho_template in {caminho_template_a, caminho_template_b}  # last-write-wins, nunca misto


def test_persistir_configuracao_template_processo_morto_segurando_trava_recupera_depois(tmp_path):
    caminho_configuracao = str(tmp_path / "configuracao.json")
    caminho_template = _criar_xlsx(tmp_path / "template.xlsx")

    fila = multiprocessing.Queue()
    processo = multiprocessing.Process(
        target=segurar_trava_ate_ser_morto,
        args=(fila, config._trava_template, (caminho_configuracao,)),
    )
    processo.start()
    sinal = fila.get(timeout=15)
    assert sinal == "trava_obtida"

    processo.kill()
    processo.join(timeout=15)
    assert not processo.is_alive()

    inicio = time.monotonic()
    atualizada = config.persistir_configuracao_template(caminho_configuracao, caminho_template)
    duracao = time.monotonic() - inicio
    assert duracao < 8  # recupera bem antes do timeout de 10s — nenhum lock órfão
    assert atualizada.caminho_template == caminho_template
