from app.domain.entities.tipo_processo import TipoProcesso, rotulo
from app.extraction import pdf_reader
from app.extraction.enriquecimento.tipo_processo import identificar_tipo_processo


def test_identifica_diaria_de_membro_nos_3_processos_reais(pdfs_diaria_membro):
    for caminho in pdfs_diaria_membro:
        texto = pdf_reader.ler_texto(caminho)
        assert identificar_tipo_processo(texto) is TipoProcesso.DIARIA_MEMBRO, (
            f"Não identificado como Diária de Membro: {caminho}"
        )


def test_processos_padrao_continuam_identificados_como_padrao(pdfs_exemplo):
    """Nenhum dos PDFs já homologados tem o documento-marcador de Diária de
    Membro — devem continuar caindo no tipo Padrão, sem exceção."""
    for caminho in pdfs_exemplo:
        texto = pdf_reader.ler_texto(caminho)
        assert identificar_tipo_processo(texto) is TipoProcesso.PADRAO, (
            f"Falso positivo de Diária de Membro em: {caminho}"
        )


def test_texto_sem_nenhum_marcador_e_padrao():
    assert identificar_tipo_processo("qualquer texto de processo comum") is TipoProcesso.PADRAO


def test_identificacao_nao_depende_do_despacho_gabpgj():
    """O despacho GABPGJ nunca identifica o tipo do processo — mesmo com o
    despacho presente, sem o documento-marcador o processo é Padrão."""
    texto = (
        "DESPACHO PGJ Nº 1377629/2026 - GABPGJ\n"
        "DE: GABINETE DO PROCURADOR-GERAL DE JUSTIÇA\n"
        "1. Autorizo o afastamento. 2. Defiro o pagamento no valor de R$ 652,96."
    )
    assert identificar_tipo_processo(texto) is TipoProcesso.PADRAO


def test_identificacao_e_insensivel_a_acento_e_caixa():
    texto = "cmfc - requerimento de diaria - membro - 123456\nRequerimento de diária para membros."
    assert identificar_tipo_processo(texto) is TipoProcesso.DIARIA_MEMBRO


def test_rotulo_dos_tipos_de_processo():
    assert rotulo(TipoProcesso.PADRAO) == "Diária Padrão"
    assert rotulo(TipoProcesso.DIARIA_MEMBRO) == "Diária de Membro"
