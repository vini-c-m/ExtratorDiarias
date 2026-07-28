from dataclasses import dataclass, field
from datetime import date
from enum import Enum

from app.domain.entities.aviso_linha_ignorada import AvisoLinhaIgnorada
from app.domain.entities.registro_diaria_existente import RegistroDiariaExistente
from app.domain.entities.servidor import Servidor


class Veredito(str, Enum):
    """Só 2 valores de negócio (Sprint 12, aprovado pelo usuário) — nenhum
    veredito vermelho existe para um resultado de negócio; vermelho fica
    reservado exclusivamente para falha técnica da própria Central (Base
    Local indisponível), tratada como erro HTTP, nunca como um valor deste
    enum. Isto substitui o rascunho de 3 valores do § 4.4 da Sprint 11
    (APTO_PARA_REGISTRO/AGUARDAR_PROCESSAMENTO/NAO_APTO), que ficou superado
    pela decisão de veredito único da Sprint 12."""

    APTO_PARA_PROCESSAMENTO = "APTO_PARA_PROCESSAMENTO"
    REVISAR = "REVISAR"


@dataclass(frozen=True)
class ItemChecklist:
    """Uma linha "checável" do diagnóstico — só os itens com um `ok`
    booleano real entram aqui (cadastro_localizado, nome, cargo,
    duplicidade, janela_processamento). As linhas "Providência" e
    "Resultado" do checklist de 7 itens aprovado na Sprint 12 não são
    ItemChecklist: vêm de `ResultadoConferencia.providencia` e
    `ResultadoConferencia.veredito`, montadas pelo frontend."""

    item: str
    ok: bool
    valor: str | None = None


@dataclass(frozen=True)
class ResultadoConferencia:
    """Saída de `app.domain.rules.conferencia.conferir` — o diagnóstico
    completo de uma conferência (RN-01, RN-02, RN-06/RN-10, sob os
    princípios RN-08/RN-11: nunca decide, só informa)."""

    veredito: Veredito
    providencia: str
    checklist: list[ItemChecklist] = field(default_factory=list)
    servidor: Servidor | None = None
    duplicidade: RegistroDiariaExistente | None = None
    janela_liberada: bool = True
    data_liberacao: date | None = None
    # Linhas da Base Local desconsideradas nesta consulta por dado histórico
    # inconsistente (ver `AvisoLinhaIgnorada`) — não é serializado por
    # `app/schemas/conferencia.py` nem pela API hoje; existe para uma futura
    # tela de diagnóstico ou exportação de log, sem mudar o comportamento
    # atual (RN-08/RN-11: nunca bloqueia, só informa).
    avisos_indexacao: list[AvisoLinhaIgnorada] = field(default_factory=list)
