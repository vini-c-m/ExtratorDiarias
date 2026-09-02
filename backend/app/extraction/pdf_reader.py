import fitz
import pdfplumber

# Sprint de Correção Crítica — rodapé sobreposto por defeito de exportação do
# SEI (processo real 19.20.100000001.0016125/2026-70): quando uma Solicitação
# de Diária é reanexada ao processo (a reanexada é a vigente — "o último
# documento sempre vence", regra de negócio nunca alterada por este módulo),
# o SEI às vezes grava sobre a nova página o rodapé do documento imediatamente
# anterior, por cima do rodapé correto, exatamente na mesma posição. Os dois
# textos ficam fisicamente sobrepostos, então `pdfplumber`/`PyMuPDF`
# intercalam caractere a caractere as duas strings, produzindo uma linha
# ilegível bem onde um rótulo (ex.: "DATA DE RETORNO:") e o rodapé "SEI <NUP>
# / pg. <N>" deveriam estar — sem que o resto da página seja afetado (o corpo
# do formulário, fora dessa linha, continua íntegro).
#
# A defesa abaixo remove SÓ a linha afetada, por página, usando um critério
# puramente GEOMÉTRICO (bounding box dos caracteres) — nunca por conteúdo —
# para nunca arriscar remover uma linha legítima só por parecer, textualmente,
# com um rodapé. Duas métricas por linha, as duas têm que valer ao mesmo
# tempo:
#
#   densidade = (soma das larguras de cada caractere) / (span da linha)
#     ≈ 1.0 para texto normal (caracteres lado a lado); se aproxima de 2.0
#     quando dois textos inteiros são desenhados um sobre o outro.
#
#   n_severos = nº de pares de caracteres consecutivos (por x0) cuja
#     sobreposição é, ao mesmo tempo, > 1.0pt E > 30% da largura do menor dos
#     dois — limiar desenhado para nunca contar kerning/acentuação normais,
#     só sobreposição física de dois fluxos de texto independentes.
#
# Validado (Programa de Validação Evolutiva) contra as 19 PDFs de fixture
# homologadas antes desta correção: densidade e n_severos ficaram em 1.0/0 em
# 100% das 396 linhas analisadas — zero falso positivo na amostra disponível
# — contra 1.86+/117+ nas 4 linhas realmente corrompidas do processo real
# (ver `test_pdf_reader.py`). Na dúvida (só uma das duas métricas passa, ou
# passam por pouca margem), a linha é mantida — o comportamento de hoje,
# inclusive falhas já existentes, não muda.
_TOLERANCIA_MESMA_LINHA_PT = 2.0
_LIMIAR_DENSIDADE = 1.15
_LIMIAR_N_SEVEROS = 5
_SOBREPOSICAO_MINIMA_PT = 1.0
_SOBREPOSICAO_MINIMA_FRACAO_LARGURA = 0.30


def ler_texto(caminho_pdf: str) -> str:
    """Extrai o texto de um PDF. Usa pdfplumber primeiro; se vier vazio
    (PDF com layout incomum), tenta de novo com PyMuPDF como reforço."""
    texto = _ler_com_pdfplumber(caminho_pdf)
    if not texto.strip():
        texto = _ler_com_pymupdf(caminho_pdf)
    return texto


def _ler_com_pdfplumber(caminho_pdf: str) -> str:
    with pdfplumber.open(caminho_pdf) as pdf:
        return "\n".join(_extrair_texto_pagina(pagina) for pagina in pdf.pages)


def _extrair_texto_pagina(pagina: pdfplumber.page.Page) -> str:
    chars_corrompidos = _chars_de_linhas_corrompidas(pagina.chars)
    if not chars_corrompidos:
        return pagina.extract_text() or ""

    ids_corrompidos = {id(char) for char in chars_corrompidos}
    pagina_sem_sobreposicao = pagina.filter(
        lambda objeto: objeto.get("object_type") != "char" or id(objeto) not in ids_corrompidos
    )
    return pagina_sem_sobreposicao.extract_text() or ""


def _chars_de_linhas_corrompidas(chars: list) -> list:
    """Agrupa os caracteres da página em linhas (por proximidade de `top`) e
    devolve os caracteres de toda linha cuja geometria indica dois textos
    sobrepostos fisicamente na mesma posição (ver critério no topo do
    módulo)."""
    corrompidos: list = []
    for linha in _agrupar_por_linha(chars):
        if _linha_esta_corrompida(linha):
            corrompidos.extend(linha)
    return corrompidos


def _agrupar_por_linha(chars: list) -> list[list]:
    linhas: list[list] = []
    referencias_top: list[float] = []
    for char in sorted(chars, key=lambda c: (c["top"], c["x0"])):
        if linhas and abs(char["top"] - referencias_top[-1]) <= _TOLERANCIA_MESMA_LINHA_PT:
            linhas[-1].append(char)
        else:
            linhas.append([char])
            referencias_top.append(char["top"])
    return linhas


def _linha_esta_corrompida(linha: list) -> bool:
    if len(linha) < 2:
        return False
    ordenada = sorted(linha, key=lambda c: c["x0"])

    span = max(c["x1"] for c in ordenada) - min(c["x0"] for c in ordenada)
    if span <= 0:
        return False
    soma_larguras = sum(max(c["x1"] - c["x0"], 0.0) for c in ordenada)
    densidade = soma_larguras / span

    n_severos = 0
    for anterior, atual in zip(ordenada, ordenada[1:]):
        sobreposicao = anterior["x1"] - atual["x0"]
        largura_minima = min(
            max(anterior["x1"] - anterior["x0"], 0.01),
            max(atual["x1"] - atual["x0"], 0.01),
        )
        if (
            sobreposicao > _SOBREPOSICAO_MINIMA_PT
            and sobreposicao > _SOBREPOSICAO_MINIMA_FRACAO_LARGURA * largura_minima
        ):
            n_severos += 1

    return densidade > _LIMIAR_DENSIDADE and n_severos >= _LIMIAR_N_SEVEROS


def _ler_com_pymupdf(caminho_pdf: str) -> str:
    with fitz.open(caminho_pdf) as documento:
        return "\n".join(pagina.get_text() for pagina in documento)
