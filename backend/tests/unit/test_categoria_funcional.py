import pytest

from app.domain.analitica.categoria_funcional import classificar_categoria_funcional


@pytest.mark.parametrize(
    "cargo",
    [
        "Promotor de Justiça de 1a. entrância",
        "Promotor de Justiça de 2a. entrância",
        "Promotor de Justiça de 3a. entrância",
        "Procurador de Justiça",
        # Sem acento/caixa alta — a Planilha Oficial real grava em UTF-8 com
        # acento, mas a normalização não pode depender disso.
        "PROMOTOR DE JUSTICA DE 1A. ENTRANCIA",
        "  Procurador de Justiça  ",
    ],
)
def test_classifica_membro(cargo):
    assert classificar_categoria_funcional(cargo) == "MEMBRO"


@pytest.mark.parametrize(
    "cargo",
    [
        "Técnico Ministerial - Administração",
        "Analista Ministerial - Jurídica",
        "Comissionado",
        "Servidor Extraquadro",
        # Achado real de 2026-08-05 (validado contra a Planilha Oficial
        # real): cedido de outra instituição, não é membro — decisão
        # confirmada com o usuário de tratar como SERVIDOR (não-membro),
        # nunca NAO_IDENTIFICADO por conta desta ambiguidade específica.
        "Policial Militar",
        "Assessor de Membro",
        "Gerente Ministerial de Controle",
        "Oficial Ministerial de Gabinete",
    ],
)
def test_classifica_servidor(cargo):
    assert classificar_categoria_funcional(cargo) == "SERVIDOR"


@pytest.mark.parametrize("cargo", [None, "", "   "])
def test_classifica_nao_identificado_quando_cargo_ausente(cargo):
    assert classificar_categoria_funcional(cargo) == "NAO_IDENTIFICADO"


def test_nao_forca_categoria_para_cargo_parecido_mas_diferente():
    """RN explícita: só correspondência exata contra o catálogo fechado de
    MEMBRO — um cargo parecido mas de outra entrância/categoria (ex.: um
    "Promotor Eleitoral" hipotético, ou uma sigla) nunca deve "quase
    casar". Aqui, um texto que contém a palavra "Promotor" mas não é um
    dos 4 cargos do catálogo é SERVIDOR (decisão: complemento fechado de
    MEMBRO), nunca uma adivinhação por substring solta."""
    assert classificar_categoria_funcional("Assessor do Promotor de Justiça") == "SERVIDOR"
