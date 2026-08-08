import re

from app.extraction.segmentacao_documentos import ultimo_segmento

# Só executado em ModoProcessamento.COMPLEMENTO — resolve
# `Diaria.quantidade_diaria_parcial_complementar` (coluna O na planilha).
#
# Regra institucional homologada (rotina real da CMFC, ~7 anos): complemento
# de diária é, em regra, só de diárias INTEGRAIS — o padrão é `0`. Só sobe
# de `0` com evidência documental explícita e inequívoca de uma diária
# PARCIAL complementar. Nunca inferido pelas datas, nunca criado
# automaticamente.
#
# Ordem de prioridade documental definida pelo usuário: (1) Documento Hábil
# complementar, (2) Validação de Diária mais recente, (3) Nota de
# Liquidação, (4) Despachos. Hoje só a fonte (2) tem exemplo real
# suficientemente estruturado e inequívoco para virar regra de extração
# (mesmo formulário "CMFC - Validação de Diária - Servidores" já usado por
# `fontes_secundarias/validacao_cmfc.py`, com seções INTEGRAL/PARCIAL e
# QUANTIDADE explícitas — confirmado nos dois processos reais investigados,
# SEI 19.20.0001.0004758/2026-36: PARCIAL="-" na Validação complementar,
# igual à quantidade institucional padrão). As fontes (1), (3) e (4) são só
# texto livre/prosa nos exemplos reais disponíveis — arriscado extrair por
# regex com apenas 1-2 amostras — ficam como extensão futura quando houver
# evidência real suficiente, nunca como suposição hoje.

_PADRAO_TITULO_VALIDACAO = re.compile(r"Valida[çc][ãa]o de Di[áa]ria", re.IGNORECASE)

_PADRAO_MODALIDADE_DENTRO_DO_ESTADO = re.compile(
    r"MODALIDADES\s*-\s*Dentro do Estado\s*:\s*\r?\n\s*(.*)", re.IGNORECASE
)
_PADRAO_MODALIDADE_FORA_DO_ESTADO = re.compile(
    r"MODALIDADES\s*-\s*Fora do Estado\s*:\s*\r?\n\s*(.*)", re.IGNORECASE
)
_MARCADOR_INICIO_FORA_DO_ESTADO = re.compile(
    r"MODALIDADES\s*-\s*Fora do Estado\s*:", re.IGNORECASE
)
_PADRAO_QUANTIDADE_PARCIAL = re.compile(
    r"PARCIAL.*?QUANTIDADE\s*:?\s*\r?\n\s*([^\r\n]+)", re.IGNORECASE | re.DOTALL
)

_JUSTIFICATIVA_PADRAO_INSTITUCIONAL = (
    "Padrão institucional do modo Complemento de Diárias: nenhum documento do "
    "processo trouxe evidência explícita de diária parcial complementar — "
    "complemento de diária é, em regra, composto só de diárias integrais."
)


def _modalidade_preenchida(correspondencia: "re.Match[str] | None") -> bool:
    if correspondencia is None:
        return False
    valor = correspondencia.group(1).strip()
    return bool(valor) and valor != "-"


def _bloco_modalidade_ativa(segmento: str) -> str | None:
    """Isola só o bloco da modalidade preenchida ("Dentro do Estado" ou
    "Fora do Estado") — nunca as duas juntas, para não misturar a seção
    PARCIAL de uma modalidade inativa (sempre "-") com a da modalidade
    ativa. `None` quando ambas ou nenhuma estão preenchidas (ambíguo — não
    decide)."""
    dentro = _modalidade_preenchida(_PADRAO_MODALIDADE_DENTRO_DO_ESTADO.search(segmento))
    fora = _modalidade_preenchida(_PADRAO_MODALIDADE_FORA_DO_ESTADO.search(segmento))
    if dentro == fora:
        return None

    marcador_fora = _MARCADOR_INICIO_FORA_DO_ESTADO.search(segmento)
    if dentro:
        return segmento[: marcador_fora.start()] if marcador_fora else segmento
    return segmento[marcador_fora.start() :] if marcador_fora else None


def _quantidade_parcial_do_bloco(bloco: str) -> int | None:
    correspondencia = _PADRAO_QUANTIDADE_PARCIAL.search(bloco)
    if correspondencia is None:
        return None
    valor = correspondencia.group(1).strip()
    if valor == "-":
        return 0
    try:
        return int(valor)
    except ValueError:
        return None  # texto inesperado — não é evidência inequívoca, não infere


def resolver_quantidade_parcial_complementar(texto: str) -> tuple[int, str]:
    """Resolve `quantidade_diaria_parcial_complementar` para o modo
    Complemento a partir do texto completo do processo. Sempre devolve um
    valor (nunca `None`) — `0` é o padrão institucional documentado, não
    ausência de dado. Segunda posição da tupla é a justificativa textual
    (nunca um score/probabilidade), destinada a
    `Diaria.fonte_quantidade_complementar`."""
    segmento = ultimo_segmento(texto, _PADRAO_TITULO_VALIDACAO)
    if segmento is not None:
        bloco = _bloco_modalidade_ativa(segmento)
        if bloco is not None:
            quantidade = _quantidade_parcial_do_bloco(bloco)
            if quantidade is not None:
                return quantidade, (
                    "Validação de Diária mais recente do processo: quantidade de "
                    f"diária parcial complementar = {quantidade}."
                )

    return 0, _JUSTIFICATIVA_PADRAO_INSTITUCIONAL
