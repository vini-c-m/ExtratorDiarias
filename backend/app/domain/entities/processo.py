from dataclasses import dataclass, field
from enum import Enum
from uuid import uuid4

from .diaria import Diaria
from .erro_extracao import ErroExtracao


class StatusProcesso(str, Enum):
    SUCESSO = "sucesso"
    ERRO = "erro"


@dataclass
class Processo:
    """Um PDF dentro de um lote. Sempre termina com diaria OU erro, nunca os dois."""

    arquivo_origem: str
    status: StatusProcesso
    diaria: Diaria | None = None
    erro: ErroExtracao | None = None
    id: str = field(default_factory=lambda: uuid4().hex)
    avisos: list[str] = field(default_factory=list)

    def __post_init__(self) -> None:
        if self.status is StatusProcesso.SUCESSO and self.diaria is None:
            raise ValueError("Processo com status SUCESSO precisa de uma Diaria")
        if self.status is StatusProcesso.ERRO and self.erro is None:
            raise ValueError("Processo com status ERRO precisa de um ErroExtracao")
