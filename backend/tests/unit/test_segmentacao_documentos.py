import re

from app.extraction.segmentacao_documentos import (
    texto_a_partir_do_ultimo_segmento,
    ultimo_segmento,
    ultimo_segmento_ate_execucao_financeira,
)

_PADRAO_REQUERIMENTO = re.compile(
    r"(?:Requerimento|Solicita[çc][ãa]o) de Di[áa]ria", re.IGNORECASE
)
_PADRAO_VALIDACAO = re.compile(r"Valida[çc][ãa]o de Di[áa]ria", re.IGNORECASE)


def _documento(titulo: str, corpo: str) -> str:
    return f"CMFC - {titulo} - 111\n{corpo}\nCMFC - {titulo} 111         SEI 19.20.0000.0000001/2026-00 / pg. 1\n"


def test_ultimo_segmento_devolve_none_sem_nenhum_titulo_correspondente():
    texto = "Texto qualquer sem nenhuma marcação de documento CMFC."
    assert ultimo_segmento(texto, _PADRAO_REQUERIMENTO) is None
    assert texto_a_partir_do_ultimo_segmento(texto, _PADRAO_REQUERIMENTO) is None


def test_ultimo_segmento_com_um_unico_documento_e_ele_mesmo():
    texto = _documento("Requerimento de Diária - Membro", "CIDADE ORIGEM: Recife")
    segmento = ultimo_segmento(texto, _PADRAO_REQUERIMENTO)
    assert segmento is not None
    assert "CIDADE ORIGEM: Recife" in segmento


def test_ultimo_segmento_com_dois_documentos_devolve_so_o_segundo():
    primeiro = _documento("Requerimento de Diária - Membro", "DATA INICIAL: 11/05/2025")
    segundo = _documento("Requerimento de Diária - Membro", "DATA INICIAL: 11/05/2026")
    texto = primeiro + segundo

    segmento = ultimo_segmento(texto, _PADRAO_REQUERIMENTO)

    assert segmento is not None
    assert "11/05/2026" in segmento
    assert "11/05/2025" not in segmento


def test_ultimo_segmento_nao_vaza_conteudo_de_documento_de_outro_tipo_anexado_depois():
    requerimento = _documento("Requerimento de Diária - Membro", "DATA INICIAL: 11/05/2026")
    confirmacao = _documento("Confirmação dos Serviços - Diária -Membro", "DATA INICIAL: 01/01/2099")
    texto = requerimento + confirmacao

    segmento = ultimo_segmento(texto, _PADRAO_REQUERIMENTO)

    assert segmento is not None
    assert "11/05/2026" in segmento
    assert "01/01/2099" not in segmento


def test_ultimo_segmento_ignora_documentos_de_outro_tipo():
    confirmacao = _documento("Confirmação dos Serviços - Diária -Servidor", "DATA INICIAL: 22/06/2026")
    solicitacao = _documento("Solicitação de Diária - Servidor", "DATA INICIAL: 22/05/2026")
    texto = confirmacao + solicitacao

    segmento = ultimo_segmento(texto, _PADRAO_REQUERIMENTO)

    assert segmento is not None
    assert "22/05/2026" in segmento
    assert "22/06/2026" not in segmento


def test_texto_a_partir_do_ultimo_segmento_inclui_tudo_que_vem_depois():
    primeira_validacao = _documento("Validação de Diária - Servidores", "OBSERVAÇÕES: 2026DH000001")
    segunda_validacao = _documento("Validação de Diária - Servidores", "OBSERVAÇÕES: 2026DH000002")
    nota_liquidacao = "NOTA DE LIQUIDAÇÃO\nDOCUMENTO HÁBIL:\n2026DH000002"
    texto = primeira_validacao + segunda_validacao + nota_liquidacao

    resultado = texto_a_partir_do_ultimo_segmento(texto, _PADRAO_VALIDACAO)

    assert resultado is not None
    assert "2026DH000001" not in resultado
    assert "2026DH000002" in resultado
    assert "NOTA DE LIQUIDAÇÃO" in resultado


# --- ultimo_segmento_ate_execucao_financeira ---------------------------------
# Sprint — Refatoração DH: mesmo contrato de `ultimo_segmento`, mas o fim do
# segmento também para no início de uma Nota de Liquidação ou Ordem
# Bancária — não só no próximo título CMFC — porque a fonte oficial do
# Documento Hábil é sempre o Despacho de Validação, nunca uma reprodução
# posterior gerada a partir dele.


def test_ultimo_segmento_ate_execucao_financeira_devolve_none_sem_titulo_correspondente():
    texto = "Texto qualquer sem nenhuma marcação de documento CMFC."
    assert ultimo_segmento_ate_execucao_financeira(texto, _PADRAO_VALIDACAO) is None


def test_ultimo_segmento_ate_execucao_financeira_para_antes_da_nota_de_liquidacao():
    validacao = _documento("Validação de Diária - Servidores", "OBSERVAÇÕES: 2026DH000001")
    nota_liquidacao = "NOTA DE LIQUIDAÇÃO\nDOCUMENTO HÁBIL:\n2026DH999999\n"
    texto = validacao + nota_liquidacao

    segmento = ultimo_segmento_ate_execucao_financeira(texto, _PADRAO_VALIDACAO)

    assert segmento is not None
    assert "2026DH000001" in segmento
    assert "NOTA DE LIQUIDAÇÃO" not in segmento
    assert "2026DH999999" not in segmento


def test_ultimo_segmento_ate_execucao_financeira_para_antes_da_ordem_bancaria():
    validacao = _documento("Validação de Diária - Servidores", "OBSERVAÇÕES: 2026DH000001")
    ordem_bancaria = "GOVERNO DO ESTADO DE PERNAMBUCO\nORDEM BANCÁRIA DATA DA OB: NÚMERO:\n2026DH999999\n"
    texto = validacao + ordem_bancaria

    segmento = ultimo_segmento_ate_execucao_financeira(texto, _PADRAO_VALIDACAO)

    assert segmento is not None
    assert "2026DH000001" in segmento
    assert "ORDEM BANCÁRIA" not in segmento
    assert "2026DH999999" not in segmento


def test_ultimo_segmento_ate_execucao_financeira_sem_execucao_financeira_devolve_ate_o_fim():
    """Quando não há Nota de Liquidação nem Ordem Bancária depois da
    Validação (processo ainda não liquidado, ou layout sem esses
    marcadores), o segmento vai até o fim do texto — mesmo comportamento de
    `ultimo_segmento` quando não existe outro título CMFC depois."""
    texto = _documento("Validação de Diária - Servidores", "OBSERVAÇÕES: 2026DH000001")

    segmento = ultimo_segmento_ate_execucao_financeira(texto, _PADRAO_VALIDACAO)

    assert segmento is not None
    assert "2026DH000001" in segmento


def test_ultimo_segmento_ate_execucao_financeira_com_tres_validacoes_usa_a_ultima():
    v1 = _documento("Validação de Diária - Servidores", "OBSERVAÇÕES: 2026DH000001")
    v2 = _documento("Validação de Diária - Servidores", "OBSERVAÇÕES: 2026DH000002")
    v3 = _documento("Validação de Diária - Servidores", "OBSERVAÇÕES: 2026DH000003")
    nota_liquidacao = "NOTA DE LIQUIDAÇÃO\nDOCUMENTO HÁBIL:\n2026DH000003\n"
    texto = v1 + v2 + v3 + nota_liquidacao

    segmento = ultimo_segmento_ate_execucao_financeira(texto, _PADRAO_VALIDACAO)

    assert segmento is not None
    assert "2026DH000001" not in segmento
    assert "2026DH000002" not in segmento
    assert "2026DH000003" in segmento
    assert "NOTA DE LIQUIDAÇÃO" not in segmento
