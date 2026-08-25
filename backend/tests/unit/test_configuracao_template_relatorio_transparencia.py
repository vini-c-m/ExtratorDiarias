"""Micro-sprint 3H — testes do módulo de configuração isolada do Template
Oficial do Relatório de Diárias — Portal da Transparência. Dados 100%
sintéticos, nenhum arquivo real."""

import json

import pytest
from openpyxl import Workbook

from app.consulta import configuracao_template_relatorio_transparencia as config


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
