from dataclasses import dataclass


@dataclass(frozen=True)
class AvisoLinhaIgnorada:
    """Uma linha da Base Local desconsiderada da indexação por trazer um
    dado historicamente inconsistente (ex.: período gravado como texto, não
    como data — erro de digitação antigo na planilha oficial). RN-11: um
    registro antigo inválido nunca pode impedir a Central de funcionar para
    as demais milhares de linhas — a linha é só pulada, nunca vira exceção.

    Guardada com aba, linha e motivo para uma futura tela de diagnóstico ou
    exportação para `app/infra/logging/` (hoje vazia) — por ora só existe
    internamente (`ResultadoConferencia.avisos_indexacao`), sem nenhuma
    mudança na resposta da API."""

    aba: str
    linha: int
    motivo: str
