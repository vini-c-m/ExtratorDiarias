from app.extraction.enriquecimento._texto import normalizar

_PETROLINA = normalizar("Petrolina")
_PERNAMBUCO = normalizar("PERNAMBUCO")
_PARAIBA = normalizar("PARAÍBA")


def aplicar_regra_operacional(estado_destino: str | None, municipio_destino: str | None) -> str | None:
    """Regra operacional consolidada do setor (Sprint 04.1) — usada por anos
    no preenchimento manual da planilha antes de haver qualquer automação.
    Funciona só como FALLBACK: só é chamada pelo orquestrador quando o
    processo não trouxe nenhuma evidência textual direta de transporte (ver
    `transporte.py`, que sempre tem prioridade e nunca é substituído por
    esta regra).

    - Destino Pernambuco, último município válido Petrolina -> AVIÃO
      (distância dentro do próprio estado que historicamente justifica
      passagem aérea).
    - Destino Pernambuco, qualquer outro município -> CARRO.
    - Destino Paraíba -> CARRO.
    - Qualquer outro estado -> AVIÃO.

    Sem estado de destino identificado, a regra não tem base para decidir e
    devolve None — a diária permanece sem transporte, exatamente como antes
    desta Sprint, sinalizada para revisão manual pelo aviso já existente."""
    if not estado_destino:
        return None

    estado_normalizado = normalizar(estado_destino)

    if estado_normalizado == _PERNAMBUCO:
        if municipio_destino and normalizar(municipio_destino) == _PETROLINA:
            return "AVIÃO"
        return "CARRO"

    if estado_normalizado == _PARAIBA:
        return "CARRO"

    return "AVIÃO"
