from app.domain.rules.finalizacao_diarias import avaliar

# Trechos reproduzindo a estrutura real dos dois processos de referência
# (SEI 19.20.0001.0000375/2026-24 — Recibo; SEI 19.20.0001.0000639/2026-96 —
# Anexo Comprovante), sem dados pessoais reais.

_CONFIRMACAO_SIM = """
CMFC - Confirmação dos Serviços - Diária -Servidor - 1000001
Confirmação dos serviços de diária - Servidor - nos termos da Instrução Normativa PGJ 006/2018.
Confirmação dos serviços:
Sim
Devolução das diárias:
Não
CMFC - Confirmação dos Serviços - Diária -Servidor 1000001 SEI 19.20.0000.0000001/2026-01 / pg. 3
"""

_CONFIRMACAO_NAO = _CONFIRMACAO_SIM.replace(
    "Confirmação dos serviços:\nSim", "Confirmação dos serviços:\nNão"
)

_RECIBO = "Recibo (1000002) SEI 19.20.0000.0000001/2026-01 / pg. 6\n"
_ANEXO_COMPROVANTE = "Anexo Comprovante (1000002) SEI 19.20.0000.0000001/2026-01 / pg. 6\n"
_ORDEM_BANCARIA = "ORDEM BANCÁRIA DATA DA OB: NÚMERO: FOLHA:\n"


def test_apto_com_confirmacao_sim_e_recibo():
    avaliacao = avaliar(_CONFIRMACAO_SIM + _RECIBO)
    assert avaliacao.apto
    assert avaliacao.confirmacao_valida
    assert avaliacao.comprovante_encontrado
    assert avaliacao.motivo is None


def test_apto_com_confirmacao_sim_e_anexo_comprovante():
    avaliacao = avaliar(_CONFIRMACAO_SIM + _ANEXO_COMPROVANTE)
    assert avaliacao.apto
    assert avaliacao.comprovante_encontrado


def test_nao_apto_sem_nenhum_documento():
    avaliacao = avaliar("texto qualquer sem nenhum dos dois documentos")
    assert not avaliacao.apto
    assert not avaliacao.confirmacao_encontrada
    assert not avaliacao.comprovante_encontrado
    assert avaliacao.motivo == "Confirmação de Diárias não encontrada."


def test_nao_apto_confirmacao_sem_comprovante():
    avaliacao = avaliar(_CONFIRMACAO_SIM)
    assert not avaliacao.apto
    assert avaliacao.confirmacao_valida
    assert not avaliacao.comprovante_encontrado
    assert avaliacao.motivo == "Confirmação encontrada, mas nenhum comprovante/anexo foi identificado."


def test_nao_apto_comprovante_sem_confirmacao_valida():
    avaliacao = avaliar(_CONFIRMACAO_NAO + _RECIBO)
    assert not avaliacao.apto
    assert avaliacao.confirmacao_encontrada
    assert not avaliacao.confirmacao_valida
    assert avaliacao.comprovante_encontrado
    assert avaliacao.motivo == "Comprovante identificado, mas a Confirmação de Diárias não está válida."


def test_ordem_bancaria_e_informativa_nunca_bloqueia():
    sem_ob = avaliar(_CONFIRMACAO_SIM + _RECIBO)
    com_ob = avaliar(_CONFIRMACAO_SIM + _RECIBO + _ORDEM_BANCARIA)

    assert sem_ob.apto
    assert not sem_ob.ordem_bancaria_encontrada
    assert com_ob.apto
    assert com_ob.ordem_bancaria_encontrada


def test_titulo_anexo_com_codigo_de_execucao_financeira_nao_conta_como_comprovante():
    """Achado real no corpus (145 PDFs de legado/pdfs): o próprio anexo da
    Ordem Bancária às vezes é rotulado 'Anexo <código>' em vez de 'EXTERNO
    <código>' — não pode ser confundido com um comprovante de diária."""
    texto = _CONFIRMACAO_SIM + "Anexo 2026OB700003 (1000009) SEI 19.20.0000.0000001/2026-01 / pg. 9\n"
    avaliacao = avaliar(texto)
    assert not avaliacao.comprovante_encontrado


def test_anexo_cancelado_nao_conta_como_comprovante():
    texto = _CONFIRMACAO_SIM + "Anexo CANCELADA (1000009) SEI 19.20.0000.0000001/2026-01 / pg. 9\n"
    avaliacao = avaliar(texto)
    assert not avaliacao.comprovante_encontrado


def test_nota_fiscal_conta_como_comprovante():
    texto = _CONFIRMACAO_SIM + "Nota Fiscal Hospedagem (1000003) SEI 19.20.0000.0000001/2026-01 / pg. 6\n"
    assert avaliar(texto).comprovante_encontrado


def test_confirmacao_sem_subcampo_sim_nao_conta_como_valida_por_padrao():
    """Layout mais antigo, sem 'Confirmação dos serviços: Sim/Não' — o
    documento existir já basta (mesmo critério de tolerância a layouts
    antigos usado no resto do parser)."""
    texto_sem_subcampo = (
        "CMFC - Confirmação dos Serviços - Diária -Servidor - 1000001\n"
        "Algum outro conteúdo, sem o subcampo Sim/Não.\n"
    )
    avaliacao = avaliar(texto_sem_subcampo + _RECIBO)
    assert avaliacao.confirmacao_encontrada
    assert avaliacao.confirmacao_valida
    assert avaliacao.apto
