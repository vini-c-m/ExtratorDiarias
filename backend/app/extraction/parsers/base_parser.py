from abc import ABC, abstractmethod

from app.domain.entities.campos_extraidos import CamposExtraidos


class ParserSei(ABC):
    """Interface do Strategy Pattern (regra 4). Um novo layout do SEI vira uma
    nova classe aqui — o resto do sistema nunca precisa mudar."""

    @abstractmethod
    def extrair(self, texto: str) -> CamposExtraidos: ...
