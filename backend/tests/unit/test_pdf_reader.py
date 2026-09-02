import pdfplumber

from app.extraction import pdf_reader


def _char(texto: str, x0: float, x1: float, top: float) -> dict:
    return {"text": texto, "x0": x0, "x1": x1, "top": top, "object_type": "char"}


def _linha_espacada(texto: str, top: float = 800.0, passo: float = 6.0, largura: float = 5.5) -> list:
    """Uma linha comum, sem sobreposição nenhuma entre caracteres."""
    return [_char(c, i * passo, i * passo + largura, top) for i, c in enumerate(texto)]


# --- unidade: `_agrupar_por_linha` / `_linha_esta_corrompida` -------------


def test_linha_normal_nao_e_marcada_como_corrompida():
    linha = _linha_espacada("DATA DE RETORNO:")
    assert pdf_reader._linha_esta_corrompida(linha) is False


def test_linha_de_um_unico_caractere_nao_e_marcada_como_corrompida():
    assert pdf_reader._linha_esta_corrompida([_char("-", 0.0, 5.5, 800.0)]) is False


def test_kerning_apertado_isolado_nao_e_marcado_como_corrompido():
    """Sobreposição mínima (bem abaixo dos dois limiares) entre um par de
    caracteres — o tipo de coisa que kerning/acentuação normal produz — não
    pode remover a linha."""
    linha = [
        _char("V", 0.0, 6.0, 800.0),
        _char("A", 5.6, 11.6, 800.0),  # 0.4pt de sobreposição, abaixo de 1.0pt
        _char("R", 11.6, 17.6, 800.0),
        _char("I", 17.6, 20.0, 800.0),
    ]
    assert pdf_reader._linha_esta_corrompida(linha) is False


def test_duas_strings_inteiras_na_mesma_posicao_sao_marcadas_como_corrompidas():
    """O padrão físico real do processo 19.20.100000001.0016125/2026-70: dois
    rodapés inteiros desenhados na mesma coordenada da página."""
    texto_a = "EXTERNO comprovante diaria fake (1)         SEI 19.20.0.1/2026-01 / pg. 8"
    texto_b = "CMFC - Solicitacao de Diaria - Servidor 1         SEI 19.20.0.1/2026-01 / pg. 10"
    chars = _linha_espacada(texto_a) + _linha_espacada(texto_b)
    assert pdf_reader._linha_esta_corrompida(chars) is True


def test_agrupar_por_linha_respeita_tolerancia_de_top():
    chars = [
        _char("A", 0.0, 6.0, 800.0),
        _char("B", 6.0, 12.0, 800.5),  # mesma linha (diferença de 0.5pt)
        _char("C", 0.0, 6.0, 820.0),  # linha diferente (diferença de 20pt)
    ]
    linhas = pdf_reader._agrupar_por_linha(chars)
    assert len(linhas) == 2
    tamanhos = sorted(len(linha) for linha in linhas)
    assert tamanhos == [1, 2]


# --- integração: `ler_texto` / não-regressão contra fixtures homologadas --


def test_pagina_sem_sobreposicao_extrai_texto_identico_ao_da_biblioteca(pdfs_exemplo):
    """Garantia central de não-regressão: quando nenhuma linha está
    corrompida, o texto extraído é BYTE A BYTE idêntico ao de
    `pagina.extract_text()` direto — a nova lógica não reformata nem altera
    nada no caso comum, só o caso estruturalmente corrompido."""
    caminho = pdfs_exemplo[0]
    with pdfplumber.open(caminho) as pdf:
        esperado = "\n".join(pagina.extract_text() or "" for pagina in pdf.pages)
    assert pdf_reader.ler_texto(caminho) == esperado


def test_todas_as_fixtures_homologadas_continuam_sem_nenhuma_linha_removida(pdfs_exemplo):
    """Guarda de não-regressão explícita (Programa de Validação Evolutiva —
    validado também durante o Plan Mode contra as 19 fixtures homologadas +
    os dois PDFs reais do caso, com zero falso positivo): nenhuma linha de
    nenhuma fixture já homologada pode ser classificada como corrompida."""
    for caminho in pdfs_exemplo:
        with pdfplumber.open(caminho) as pdf:
            for pagina in pdf.pages:
                for linha in pdf_reader._agrupar_por_linha(pagina.chars):
                    texto_linha = "".join(
                        c["text"] for c in sorted(linha, key=lambda c: c["x0"])
                    )
                    assert not pdf_reader._linha_esta_corrompida(linha), (
                        f"linha inesperadamente marcada como corrompida em "
                        f"{caminho}: {texto_linha!r}"
                    )


def test_rodape_sobreposto_e_removido_mas_corpo_da_pagina_continua_integro(
    caminho_pdf_rodape_sobreposto,
):
    """Reprodução com a fixture sintética (Caso 6) do padrão do processo
    real: o rodapé sobreposto some do texto extraído, mas todo o resto do
    corpo da página (rótulos e valores de negócio da Solicitação vigente)
    continua saindo normalmente — a remoção fica restrita à linha afetada,
    nunca a página inteira."""
    texto = pdf_reader.ler_texto(caminho_pdf_rodape_sobreposto)

    assert "DATA DE RETORNO:" in texto
    assert "19/09/2026" in texto
    # o rodapé sobreposto (mistura ilegível de duas strings) não sobrevive
    assert "pg. 8" not in texto
    assert "pg. 9" not in texto
    # o corpo da segunda (vigente) Solicitação continua íntegro
    assert "UNIDADE TESTE" in texto
    assert "Beltrano de Tal" in texto
    assert "11122233396" in texto
