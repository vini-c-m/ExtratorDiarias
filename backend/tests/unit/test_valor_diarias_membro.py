from app.extraction import pdf_reader
from app.extraction.enriquecimento.valor_diarias_membro import extrair_valor_diarias_membro

_VALORES_ESPERADOS = {
    "SEI_19.20.0001.0000114_2026_14.pdf": "652,96",
    "SEI_19.20.0001.0000115_2026_15.pdf": "1.069,14",
    "SEI_19.20.0001.0000916_2025_16.pdf": "1.069,14",
}


def test_extrai_valor_dos_3_processos_reais(pdfs_diaria_membro):
    for caminho in pdfs_diaria_membro:
        import os

        nome = os.path.basename(caminho)
        texto = pdf_reader.ler_texto(caminho)

        valor, aviso = extrair_valor_diarias_membro(texto)

        assert valor == _VALORES_ESPERADOS[nome], f"Valor incorreto para {nome}"
        assert aviso is None


def test_despacho_gabpgj_nao_localizado_gera_aviso():
    texto = "Processo sem nenhum despacho do Gabinete do Procurador-Geral de Justiça."

    valor, aviso = extrair_valor_diarias_membro(texto)

    assert valor is None
    assert "não localizado" in aviso.lower()


def test_mencao_solta_a_gabpgj_no_corpo_de_outro_despacho_nao_conta():
    """Reprodução do caso real (SEI 19.20.0001.0000916/2025-16): a DIMCAC
    emite um despacho próprio que só encaminha o processo 'Ao GABPGJ para
    autorização' — isso não é o despacho do GABPGJ em si, e não pode ser
    usado como fonte do valor."""
    texto = (
        "DESPACHO Nº 2549/2025 - DIMCAC\n"
        "DE: DIVISÃO MINISTERIAL DE CONTROLE E ANÁLISE DE CONTAS\n"
        "Ao GABPGJ para autorização e determinação do valor da diaria(s), por\n"
        "competência.\n"
    )

    valor, aviso = extrair_valor_diarias_membro(texto)

    assert valor is None
    assert "não localizado" in aviso.lower()


def test_despacho_localizado_mas_sem_valor_no_texto_proximo_gera_aviso():
    texto = "DESPACHO Nº 999/2026 - GABPGJ\nAutorizo o afastamento, sem mais detalhes."

    valor, aviso = extrair_valor_diarias_membro(texto)

    assert valor is None
    assert "não foi encontrado" in aviso.lower()


def test_dois_despachos_gabpgj_com_valores_diferentes_gera_aviso_de_ambiguidade():
    texto = (
        "DESPACHO Nº 111/2026 - GABPGJ\n"
        "Defiro o pagamento no valor de R$ 100,00 ao servidor.\n"
        "DESPACHO Nº 222/2026 - GABPGJ\n"
        "Defiro o pagamento no valor de R$ 200,00 ao servidor.\n"
    )

    valor, aviso = extrair_valor_diarias_membro(texto)

    assert valor is None
    assert "mais de um valor" in aviso.lower()


def test_dois_despachos_gabpgj_com_mesmo_valor_nao_e_ambiguo():
    texto = (
        "DESPACHO Nº 111/2026 - GABPGJ\n"
        "Defiro o pagamento no valor de R$ 100,00 ao servidor.\n"
        "DESPACHO Nº 222/2026 - GABPGJ\n"
        "Defiro o pagamento no valor de R$ 100,00 ao servidor.\n"
    )

    valor, aviso = extrair_valor_diarias_membro(texto)

    assert valor == "100,00"
    assert aviso is None


def test_reconhece_variante_valor_total_de_diarias_integrais():
    texto = (
        "DESPACHO PGJ Nº 1/2026 - GABPGJ\n"
        "Defiro o pagamento de 02 (duas) diárias integrais, no valor total de "
        "R$ 1.069,14, ao Dr. Fulano."
    )

    valor, aviso = extrair_valor_diarias_membro(texto)

    assert valor == "1.069,14"
    assert aviso is None
