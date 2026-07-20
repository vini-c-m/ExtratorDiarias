import fitz
import pdfplumber


def ler_texto(caminho_pdf: str) -> str:
    """Extrai o texto de um PDF. Usa pdfplumber primeiro; se vier vazio
    (PDF com layout incomum), tenta de novo com PyMuPDF como reforço."""
    texto = _ler_com_pdfplumber(caminho_pdf)
    if not texto.strip():
        texto = _ler_com_pymupdf(caminho_pdf)
    return texto


def _ler_com_pdfplumber(caminho_pdf: str) -> str:
    with pdfplumber.open(caminho_pdf) as pdf:
        return "\n".join(pagina.extract_text() or "" for pagina in pdf.pages)


def _ler_com_pymupdf(caminho_pdf: str) -> str:
    with fitz.open(caminho_pdf) as documento:
        return "\n".join(pagina.get_text() for pagina in documento)
