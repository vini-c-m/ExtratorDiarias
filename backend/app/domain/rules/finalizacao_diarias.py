import re
from dataclasses import dataclass

from app.extraction.parsers.sei_parser_v1 import _buscar_campo  # noqa: PLC2701 — reuso deliberado
from app.extraction.segmentacao_documentos import ultimo_segmento

# "FINALIZAR DIÁRIAS" — regra de elegibilidade (2026-08-07): um processo só
# está apto quando tem (1) Confirmação dos Serviços válida e (2) pelo menos
# um comprovante/anexo. Ordem Bancária é só informativa (nunca pré-condição).

_PADRAO_TITULO_CONFIRMACAO = re.compile(r"Confirma[çc][ãa]o dos Servi[çc]os", re.IGNORECASE)
_PADRAO_CAMPO_CONFIRMACAO_VALOR = r"(Sim|N[ãa]o)"

_INICIO_ORDEM_BANCARIA = re.compile(r"^[ \t]*ORDEM BANC[ÁA]RIA\b", re.MULTILINE)

# Linha estrutural que o próprio SEI grava para QUALQUER documento anexado
# que não seja um formulário CMFC (ex.: "Recibo (1371455) SEI .../ pg. 6",
# "Anexo Comprovante (1373700) SEI .../ pg. 6") — validado contra os dois
# processos reais de referência (SEI 19.20.0001.0000375/2026-24 e
# 19.20.0001.0000639/2026-96) e contra os 145 PDFs reais de legado/pdfs.
_PADRAO_TITULO_ANEXO_GENERICO = re.compile(
    r"^(?!CMFC -)([^\n(]{1,80})\(\d+\)\s*SEI\s+[\d./-]+\s*/\s*pg\.\s*\d+", re.MULTILINE
)
_PALAVRAS_COMPROVANTE = re.compile(r"anexo|compro|recibo|nota fiscal", re.IGNORECASE)
# Achado real no corpus: o próprio anexo de Ordem Bancária/Nota de
# Liquidação às vezes é rotulado "Anexo <código>" em vez de "EXTERNO
# <código>" — sem esta exclusão, esse título seria confundido com um
# comprovante de diária por conter a palavra "Anexo".
_PADRAO_CODIGO_EXECUCAO_FINANCEIRA = re.compile(r"\d{4}(OB|LE|EC)\d+", re.IGNORECASE)
_PADRAO_CANCELADA = re.compile(r"cancelad", re.IGNORECASE)


@dataclass(frozen=True)
class AvaliacaoElegibilidade:
    confirmacao_encontrada: bool
    confirmacao_valida: bool
    comprovante_encontrado: bool
    ordem_bancaria_encontrada: bool
    apto: bool
    motivo: str | None = None


def _avaliar_confirmacao(texto: str) -> tuple[bool, bool]:
    """Devolve (encontrada, válida). Válida quando o documento existe e o
    campo 'Confirmação dos serviços' — quando presente — está como 'Sim';
    documento existente sem esse subcampo também conta como válido (layout
    mais antigo, mesmo critério de tolerância já usado no resto do parser)."""
    segmento = ultimo_segmento(texto, _PADRAO_TITULO_CONFIRMACAO)
    if segmento is None:
        return False, False

    campo = _buscar_campo(
        r"Confirma[çc][ãa]o dos [Ss]ervi[çc]os", segmento, _PADRAO_CAMPO_CONFIRMACAO_VALOR
    )
    if campo is None:
        return True, True
    return True, campo.group(1).strip().lower() == "sim"


def _avaliar_comprovante(texto: str) -> bool:
    for correspondencia in _PADRAO_TITULO_ANEXO_GENERICO.finditer(texto):
        titulo = correspondencia.group(1).strip()
        if _PADRAO_CODIGO_EXECUCAO_FINANCEIRA.search(titulo):
            continue
        if _PADRAO_CANCELADA.search(titulo):
            continue
        if _PALAVRAS_COMPROVANTE.search(titulo):
            return True
    return False


def avaliar(texto: str) -> AvaliacaoElegibilidade:
    confirmacao_encontrada, confirmacao_valida = _avaliar_confirmacao(texto)
    comprovante_encontrado = _avaliar_comprovante(texto)
    ordem_bancaria_encontrada = bool(_INICIO_ORDEM_BANCARIA.search(texto))

    apto = confirmacao_valida and comprovante_encontrado
    motivo: str | None = None
    if not apto:
        if not confirmacao_valida and not comprovante_encontrado:
            motivo = "Confirmação de Diárias não encontrada."
        elif confirmacao_valida:
            motivo = "Confirmação encontrada, mas nenhum comprovante/anexo foi identificado."
        else:
            motivo = "Comprovante identificado, mas a Confirmação de Diárias não está válida."

    return AvaliacaoElegibilidade(
        confirmacao_encontrada=confirmacao_encontrada,
        confirmacao_valida=confirmacao_valida,
        comprovante_encontrado=comprovante_encontrado,
        ordem_bancaria_encontrada=ordem_bancaria_encontrada,
        apto=apto,
        motivo=motivo,
    )
