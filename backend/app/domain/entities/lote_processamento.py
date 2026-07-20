from dataclasses import dataclass, field
from uuid import uuid4

from .processo import Processo, StatusProcesso


@dataclass
class LoteProcessamento:
    """Agregado raiz do sistema (regra 10) — a unidade principal nunca é um PDF sozinho."""

    processos: list[Processo] = field(default_factory=list)
    id: str = field(default_factory=lambda: uuid4().hex)

    @property
    def total(self) -> int:
        return len(self.processos)

    @property
    def sucesso(self) -> int:
        return sum(1 for p in self.processos if p.status is StatusProcesso.SUCESSO)

    @property
    def erro(self) -> int:
        return sum(1 for p in self.processos if p.status is StatusProcesso.ERRO)
