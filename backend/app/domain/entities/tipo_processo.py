from enum import Enum


class TipoProcesso(str, Enum):
    """Tipo de diária identificado no processo. PADRAO é o fluxo já
    homologado (nenhum documento-marcador de tipo especial encontrado) — o
    valor padrão de Diaria.tipo_processo, então processos já suportados
    continuam se comportando exatamente como antes desta Sprint.

    Um novo tipo de diária vira um novo membro aqui, mais uma entrada no
    registro de marcadores em
    `app.extraction.enriquecimento.tipo_processo`, sem alterar a lógica de
    identificação nem o resto do sistema."""

    PADRAO = "PADRAO"
    DIARIA_MEMBRO = "DIARIA_MEMBRO"


_ROTULOS: dict[TipoProcesso, str] = {
    TipoProcesso.PADRAO: "Diária Padrão",
    TipoProcesso.DIARIA_MEMBRO: "Diária de Membro",
}


def rotulo(tipo: TipoProcesso) -> str:
    return _ROTULOS[tipo]
