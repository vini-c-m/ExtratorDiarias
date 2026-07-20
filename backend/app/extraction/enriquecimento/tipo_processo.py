from app.domain.entities.tipo_processo import TipoProcesso
from app.extraction.enriquecimento._texto import normalizar

# Registro extensível de identificação de tipo de processo: cada entrada
# associa um tipo a um documento-marcador cuja presença no processo o
# identifica com segurança. Um novo tipo de diária entra como uma nova linha
# aqui — `identificar_tipo_processo` nunca precisa mudar.
#
# O despacho GABPGJ (Gabinete do Procurador-Geral de Justiça) NUNCA entra
# neste registro: ele só autoriza o valor das diárias (coluna P), não
# identifica o tipo do processo — ver `valor_diarias_membro.py`.
_MARCADORES: list[tuple[TipoProcesso, str]] = [
    (TipoProcesso.DIARIA_MEMBRO, normalizar("CMFC - Requerimento de Diária - Membro")),
]


def identificar_tipo_processo(texto: str) -> TipoProcesso:
    """Identifica o tipo de diária pela presença de um documento-marcador no
    processo. Sem nenhum marcador reconhecido, o processo é tratado como
    Diária Padrão — o fluxo já homologado, extraído exatamente como antes."""
    texto_normalizado = normalizar(texto)
    for tipo, marcador in _MARCADORES:
        if marcador in texto_normalizado:
            return tipo
    return TipoProcesso.PADRAO
