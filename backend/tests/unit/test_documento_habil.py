from app.extraction import pdf_reader
from app.extraction.enriquecimento.documento_habil import extrair_documento_habil


def test_extrai_dh_do_campo_documento_habil():
    texto = """
    NOTA DE LIQUIDAÇÃO
    VALOR LIQUIDADO: TIPO DA LIQUIDAÇÃO: DOCUMENTO HÁBIL:
    154,09 Parcial 2025DH000102
    """
    valor, aviso = extrair_documento_habil(texto)
    assert valor == "2025DH000102"
    assert aviso is None


def test_dh_repetido_em_mais_de_um_lugar_do_mesmo_processo_nao_e_ambiguo():
    texto = """
    OBSERVAÇÕES:
    2025DH000102. A CMFC, para autorizar
    ...
    DOCUMENTO HÁBIL:
    2025DH000102
    """
    valor, aviso = extrair_documento_habil(texto)
    assert valor == "2025DH000102"
    assert aviso is None


def test_processo_sem_nota_de_liquidacao_fica_sem_dh():
    """Processo que ainda não chegou à fase de liquidação — nenhum DH no
    texto. Isso é esperado, não é um erro."""
    texto = "CMFC - Solicitação de Diária - Servidor ... FINALIDADE DA VIAGEM: De acordo com a requisição."
    valor, aviso = extrair_documento_habil(texto)
    assert valor is None
    assert aviso is not None
    assert "não localizado" in aviso


def test_dois_documentos_habeis_diferentes_fica_ambiguo():
    texto = "DOCUMENTO HÁBIL: 2025DH000102 ... referência anterior 2025DH001111"
    valor, aviso = extrair_documento_habil(texto)
    assert valor is None
    assert aviso is not None
    assert "Mais de um Documento Hábil" in aviso


# --- Sprint 04.2 — Caso 3: duas Validações de Diária no mesmo processo ---


def test_processo_real_com_duas_validacoes_usa_dh_da_ultima(caminho_pdf_duas_validacoes_diaria):
    """Processo 19.20.0001.0000105/2026-05: a primeira 'CMFC - Validação de
    Diária - Servidores' registrou DH=2026DH000201; a segunda, anexada
    depois com "DESCONSIDERAR VALIDAÇÃO ANTERIOR" nas Observações, registrou
    DH=2026DH000202 — o mesmo valor confirmado pela Nota de Liquidação. Sem
    a regra do último documento, o DH ficava em branco (ambíguo)."""
    texto = pdf_reader.ler_texto(caminho_pdf_duas_validacoes_diaria)
    valor, aviso = extrair_documento_habil(texto)

    assert valor == "2026DH000202"
    assert aviso is None


def test_duas_validacoes_texto_inline_usa_dh_da_ultima():
    texto = """
    CMFC - Validação de Diária - Servidores - 1000001
    OBSERVAÇÕES:
      2026DH000001
    CMFC - Validação de Diária - Servidores 1000001         SEI 19.20.0000.0000004/2026-00 / pg. 1

    CMFC - Validação de Diária - Servidores - 1000002
    OBSERVAÇÕES:
      2026DH000002. DESCONSIDERAR VALIDAÇÃO ANTERIOR
    CMFC - Validação de Diária - Servidores 1000002         SEI 19.20.0000.0000004/2026-00 / pg. 2

    DOCUMENTO HÁBIL:
    2026DH000002
    """
    valor, aviso = extrair_documento_habil(texto)
    assert valor == "2026DH000002"
    assert aviso is None


def test_uma_unica_validacao_continua_extraida_normalmente():
    """Nenhuma regressão: quando há só uma Validação de Diária (ou nenhuma
    marcação de título — todo o conjunto homologado até esta Sprint), o
    comportamento de consistência já existente (`len(valores) == 1`)
    continua intacto, sem passar pela nova lógica do último segmento."""
    texto = """
    CMFC - Validação de Diária - Servidores - 1000001
    OBSERVAÇÕES:
      2025DH000102
    CMFC - Validação de Diária - Servidores 1000001         SEI 19.20.0000.0000005/2025-00 / pg. 1

    DOCUMENTO HÁBIL:
    2025DH000102
    """
    valor, aviso = extrair_documento_habil(texto)
    assert valor == "2025DH000102"
    assert aviso is None


# --- Sprint — Refatoração DH: fonte oficial é sempre o Despacho de --------
# --- Validação, nunca a Nota de Liquidação ou a Ordem Bancária -----------


def test_tres_validacoes_usa_dh_da_ultima():
    """A mesma regra de 'última versão vence' já aplicada a Requerimento
    (Sprint 04.2) e a duas Validações (Caso 3) vale também para três."""
    texto = """
    CMFC - Validação de Diária - Servidores - 1000001
    OBSERVAÇÕES:
      2026DH000001
    CMFC - Validação de Diária - Servidores 1000001         SEI 19.20.0000.0000006/2026-00 / pg. 1

    CMFC - Validação de Diária - Servidores - 1000002
    OBSERVAÇÕES:
      2026DH000002. DESCONSIDERAR VALIDAÇÃO ANTERIOR
    CMFC - Validação de Diária - Servidores 1000002         SEI 19.20.0000.0000006/2026-00 / pg. 2

    CMFC - Validação de Diária - Servidores - 1000003
    OBSERVAÇÕES:
      2026DH000003. DESCONSIDERAR VALIDAÇÃO ANTERIOR
    CMFC - Validação de Diária - Servidores 1000003         SEI 19.20.0000.0000006/2026-00 / pg. 3
    """
    valor, aviso = extrair_documento_habil(texto)
    assert valor == "2026DH000003"
    assert aviso is None


def test_nota_de_liquidacao_e_ordem_bancaria_posteriores_sao_sempre_ignoradas():
    """Regra de negócio do DIMCAC: a fonte oficial do Documento Hábil é
    sempre o Despacho de Validação — mesmo que a Nota de Liquidação e a
    Ordem Bancária anexadas depois tragam um DH totalmente diferente (ex.:
    pertencente a outro processo, ou uma liquidação já substituída), elas
    nunca são consultadas pela extração."""
    texto = """
    CMFC - Validação de Diária - Servidores - 1000001
    OBSERVAÇÕES:
      2026DH000010
    CMFC - Validação de Diária - Servidores 1000001         SEI 19.20.0000.0000007/2026-00 / pg. 1

    NOTA DE LIQUIDAÇÃO
    DOCUMENTO HÁBIL:
    2026DH999999

    GOVERNO DO ESTADO DE PERNAMBUCO
    ORDEM BANCÁRIA DATA DA OB: NÚMERO:
    OBSERVAÇÃO: 2026DH888888
    """
    valor, aviso = extrair_documento_habil(texto)
    assert valor == "2026DH000010"
    assert aviso is None


def test_processo_real_com_le_de_outro_processo_anexada_ignora_le(
    caminho_pdf_le_de_outro_processo_anexada_por_engano,
):
    """Processo fictício 19.20.0001.0000106/2023-06: a Nota de Liquidação
    anexada por engano (DH 2023DH000302) pertence a outro processo, com
    credor diferente, e só foi desconsiderada por um despacho posterior —
    mas a extração não precisa reconhecer esse despacho, porque nunca
    consulta a Nota de Liquidação. O DH correto (2023DH000301) vem das
    Observações da própria Validação de Diária."""
    texto = pdf_reader.ler_texto(caminho_pdf_le_de_outro_processo_anexada_por_engano)
    valor, aviso = extrair_documento_habil(texto)

    assert valor == "2023DH000301"
    assert aviso is None
