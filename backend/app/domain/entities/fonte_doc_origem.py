from enum import Enum


class FonteDocOrigem(str, Enum):
    """De onde veio o valor da coluna C (DOC DE ORIGEM): o histórico já
    homologado pela própria planilha oficial do DIMCAC — localizado pelo CPF
    do servidor, Prioridade 1 — ou a extração do PDF do processo, lógica já
    homologada e mantida como fallback (Prioridade 2) para quando aquele CPF
    ainda não tem histórico na planilha."""

    HISTORICO_DIMCAC = "HISTORICO_DIMCAC"
    EXTRACAO_PDF = "EXTRACAO_PDF"


_ROTULOS: dict[FonteDocOrigem, str] = {
    FonteDocOrigem.HISTORICO_DIMCAC: "Histórico DIMCAC",
    FonteDocOrigem.EXTRACAO_PDF: "Extração do processo",
}


def rotulo(fonte: FonteDocOrigem) -> str:
    return _ROTULOS[fonte]
