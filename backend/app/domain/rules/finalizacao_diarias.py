import re
from dataclasses import dataclass
from enum import Enum

from app.extraction.parsers.sei_parser_v1 import _buscar_campo  # noqa: PLC2701 — reuso deliberado
from app.extraction.segmentacao_documentos import ultimo_segmento

# "FINALIZAR DIÁRIAS" — regra de elegibilidade (2026-08-07): um processo só
# está apto quando tem (1) Confirmação dos Serviços válida e (2) pelo menos
# um comprovante/anexo. Ordem Bancária é só informativa (nunca pré-condição).

# P0-b (Sprint pré-build, 2026-08-11) — achado real na investigação dos "17
# processos sem explicação": o vocabulário "Confirmação dos Serviços" só
# existe no formulário de SERVIDOR. Diária de MEMBRO usa um documento
# equivalente, "Prestação de Contas - Diária - Membro" — sem este segundo
# padrão, 100% das diárias de Membro ficavam bloqueadas na Finalização,
# mesmo com a prestação de contas corretamente anexada (8 dos 9 casos reais
# de "sem_confirmacao" da bateria de 82 PDFs de teste eram exatamente isso).
_PADRAO_TITULO_CONFIRMACAO = re.compile(
    r"Confirma[çc][ãa]o dos Servi[çc]os|Presta[çc][ãa]o de Contas", re.IGNORECASE
)
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


# Pendência Analítica (Sprint pré-build, 2026-08-11) — achado real: um anexo
# genérico existe (o SEI grava a linha de título normalmente), mas o título
# em si não traz nenhuma palavra reconhecível ("EXTERNO", sem mais nada) —
# 8 dos 82 PDFs de teste caem exatamente aqui. A regra automática NUNCA
# assume que isso é o comprovante (decisão do usuário: não aceitar "EXTERNO"
# automaticamente) — mas também não é o mesmo que "documento ausente": existe
# algo, só não há evidência textual suficiente para decidir sozinho. Este
# terceiro estado existe só para essa distinção; nenhuma das duas checagens
# de título (`_PADRAO_CODIGO_EXECUCAO_FINANCEIRA`/`_PADRAO_CANCELADA`) muda.
class SituacaoComprovante(str, Enum):
    ENCONTRADO = "encontrado"
    PENDENTE = "pendente"
    AUSENTE = "ausente"


@dataclass(frozen=True)
class AvaliacaoElegibilidade:
    confirmacao_encontrada: bool
    confirmacao_valida: bool
    comprovante_encontrado: bool
    situacao_comprovante: SituacaoComprovante
    ordem_bancaria_encontrada: bool
    # Regra definitiva (Sprint pré-build, 2026-08-11) — `apto`/`pendente_
    # analitico` continuam calculados (informativos, ver `situacao_
    # comprovante`/tabela de análise) mas NENHUM dos dois decide mais se um
    # processo pode ser finalizado: essa decisão passou a depender só de o
    # SEI ser localizado na Planilha Oficial (`finalizacao_service`). A
    # avaliação documental vira só `alertas` — nunca um bloqueio.
    apto: bool
    pendente_analitico: bool
    motivo: str | None = None
    # Lista de avisos informativos, nunca bloqueantes — vazia quando não há
    # nada a revisar (`apto` é True). Mostrada ao servidor do DIMCAC junto
    # com o processo, mas nunca impede a finalização.
    alertas: tuple[str, ...] = ()


def _avaliar_confirmacao(texto: str) -> tuple[bool, bool]:
    """Devolve (encontrada, válida). Válida quando o documento existe e o
    campo 'Confirmação dos serviços' — quando presente — está como 'Sim';
    documento existente sem esse subcampo também conta como válido (layout
    mais antigo, mesmo critério de tolerância já usado no resto do parser —
    cobre também a Prestação de Contas de Membro, cujo formulário não tem
    esse subcampo com este nome exato, verificado contra PDF real)."""
    segmento = ultimo_segmento(texto, _PADRAO_TITULO_CONFIRMACAO)
    if segmento is None:
        return False, False

    campo = _buscar_campo(
        r"Confirma[çc][ãa]o dos [Ss]ervi[çc]os", segmento, _PADRAO_CAMPO_CONFIRMACAO_VALOR
    )
    if campo is None:
        return True, True
    return True, campo.group(1).strip().lower() == "sim"


def _avaliar_comprovante(texto: str) -> SituacaoComprovante:
    """Três desfechos (não mais dois): um título que sobrevive aos dois
    filtros (execução financeira/cancelada) mas não contém nenhuma palavra
    reconhecível vira PENDENTE — precisa de revisão humana, nunca é aceito
    nem rejeitado automaticamente. AUSENTE só quando nenhum anexo genérico
    passa pelos filtros. A regra de reconhecimento automático em si (quais
    palavras contam) continua exatamente a mesma."""
    encontrou_generico = False
    for correspondencia in _PADRAO_TITULO_ANEXO_GENERICO.finditer(texto):
        titulo = correspondencia.group(1).strip()
        if _PADRAO_CODIGO_EXECUCAO_FINANCEIRA.search(titulo):
            continue
        if _PADRAO_CANCELADA.search(titulo):
            continue
        if _PALAVRAS_COMPROVANTE.search(titulo):
            return SituacaoComprovante.ENCONTRADO
        encontrou_generico = True
    return SituacaoComprovante.PENDENTE if encontrou_generico else SituacaoComprovante.AUSENTE


_MOTIVO_PENDENCIA_COMPROVANTE = (
    "Não foi possível identificar automaticamente o comprovante necessário "
    "para este processo. Revise os documentos antes de decidir."
)


def avaliar(texto: str) -> AvaliacaoElegibilidade:
    confirmacao_encontrada, confirmacao_valida = _avaliar_confirmacao(texto)
    situacao_comprovante = _avaliar_comprovante(texto)
    comprovante_encontrado = situacao_comprovante is SituacaoComprovante.ENCONTRADO
    ordem_bancaria_encontrada = bool(_INICIO_ORDEM_BANCARIA.search(texto))

    apto = confirmacao_valida and comprovante_encontrado
    pendente_analitico = confirmacao_valida and situacao_comprovante is SituacaoComprovante.PENDENTE

    motivo: str | None = None
    if not apto:
        if pendente_analitico:
            motivo = _MOTIVO_PENDENCIA_COMPROVANTE
        elif confirmacao_valida:
            # situacao_comprovante só pode ser AUSENTE aqui (ENCONTRADO já
            # seria apto; PENDENTE já foi tratado acima).
            motivo = "Confirmação encontrada, mas nenhum comprovante/anexo foi identificado."
        elif situacao_comprovante is SituacaoComprovante.ENCONTRADO:
            motivo = "Comprovante identificado, mas a Confirmação de Diárias não está válida."
        elif situacao_comprovante is SituacaoComprovante.PENDENTE:
            motivo = (
                "Confirmação de Diárias não está válida, e o comprovante também não "
                "pôde ser identificado automaticamente."
            )
        else:
            motivo = "Confirmação de Diárias não encontrada."

    alertas: list[str] = []
    if not confirmacao_valida:
        alertas.append(
            "Confirmação dos Serviços/Prestação de Contas não identificada ou não está válida."
        )
    if situacao_comprovante is SituacaoComprovante.PENDENTE:
        alertas.append(
            "Comprovante anexado, mas o título não permite confirmação automática — revisar manualmente."
        )
    elif situacao_comprovante is SituacaoComprovante.AUSENTE:
        alertas.append("Nenhum comprovante/anexo foi identificado.")

    return AvaliacaoElegibilidade(
        confirmacao_encontrada=confirmacao_encontrada,
        confirmacao_valida=confirmacao_valida,
        comprovante_encontrado=comprovante_encontrado,
        situacao_comprovante=situacao_comprovante,
        ordem_bancaria_encontrada=ordem_bancaria_encontrada,
        apto=apto,
        pendente_analitico=pendente_analitico,
        motivo=motivo,
        alertas=tuple(alertas),
    )
