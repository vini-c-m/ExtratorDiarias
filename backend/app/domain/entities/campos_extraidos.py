from dataclasses import dataclass


@dataclass(frozen=True)
class CamposExtraidos:
    """Saída crua do parser. Qualquer campo pode ser None — ainda não foi validado."""

    sei: str | None
    doc_origem: str | None
    cpf: str | None
    periodo_inicial: str | None
    periodo_final: str | None
    cidade_origem: str | None
    cidade_destino: str | None
    motivo: str | None
