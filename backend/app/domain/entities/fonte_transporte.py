from enum import Enum


class FonteTransporte(str, Enum):
    """De onde veio o valor da coluna K (transporte): evidência textual
    direta encontrada no processo, ou a regra operacional de fallback do
    órgão (Sprint 04.1) — aplicada só quando não há nenhuma evidência
    textual. None (ausência do campo) significa que nem a evidência nem a
    regra conseguiram determinar o transporte."""

    EVIDENCIA_DOCUMENTAL = "EVIDENCIA_DOCUMENTAL"
    REGRA_OPERACIONAL = "REGRA_OPERACIONAL"


_ROTULOS: dict[FonteTransporte, str] = {
    FonteTransporte.EVIDENCIA_DOCUMENTAL: "Evidência documental",
    FonteTransporte.REGRA_OPERACIONAL: "Regra operacional do órgão",
}


def rotulo(fonte: FonteTransporte) -> str:
    return _ROTULOS[fonte]
