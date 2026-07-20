from dataclasses import dataclass, field


@dataclass(frozen=True)
class ErroExtracao:
    """O que impediu um arquivo de virar uma Diaria válida."""

    arquivo: str
    motivos: list[str] = field(default_factory=list)
