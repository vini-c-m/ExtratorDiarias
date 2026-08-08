from app.extraction.enriquecimento._texto import normalizar

# Evidências diretas do meio de transporte usado — nunca a palavra genérica
# "transporte" sozinha, porque "Departamento Ministerial de Transporte" é só
# o setor que assina as diárias e aparece em praticamente todo processo,
# independente do meio usado. Isso geraria falso positivo sistemático.
_PALAVRAS_AVIAO = [
    "PASSAGEM AEREA",
    "BILHETE AEREO",
    "TRECHO AEREO",
    "CIA AEREA",
    "COMPANHIA AEREA",
    "AEROPORTO",
    "CARTAO DE EMBARQUE",
    "GOL LINHAS AEREAS",
    "AZUL LINHAS AEREAS",
    "LATAM",
    "AVIANCA",
]

_PALAVRAS_CARRO = [
    "VEICULO OFICIAL",
    "LOCACAO DE VEICULO",
    "ALUGUEL DE VEICULO",
    "ABASTECIMENTO DE VEICULO",
    "QUILOMETRAGEM",
    "TRANSPORTE RODOVIARIO OFICIAL",
    # Correção de 2026-08-05 (caso real: SEI 19.20.0001.0014476/2026-35) —
    # anexo "Requisição de Veículo - Viagem" (formulário do chatbot que
    # solicita um veículo oficial e um motorista para a viagem). As duas
    # frases abaixo são inequívocas por si só (nunca aparecem descrevendo
    # outra coisa que não uso de veículo oficial) e deliberadamente NÃO
    # incluem a palavra genérica "VIAGEM" nem a palavra solta "MOTORISTA"
    # (que também aparece como CARGO de um servidor, ex. "Motorista Fixo" —
    # usar só "MOTORISTA" geraria falso positivo em toda diária de um
    # servidor cujo cargo seja motorista, independente do meio de transporte
    # realmente usado naquela viagem específica).
    "REQUISICAO DE VEICULO",
    "CONDUZIR O VEICULO",
]

# Evidência de um meio de transporte real, mas fora dos dois únicos valores
# aceitos (CARRO/AVIÃO) — também não pode ser preenchido por tentativa.
_PALAVRAS_OUTRO = [
    "PASSAGEM RODOVIARIA",
    "BILHETE RODOVIARIO",
    "ONIBUS INTERMUNICIPAL",
    "EMBARCACAO",
]

# Exposta (não só interna) para o orquestrador (`enriquecimento/__init__.py`)
# distinguir "nenhuma evidência textual" — o único caso em que a regra
# operacional de fallback (Sprint 04.1) pode ser aplicada — dos outros dois
# avisos (evidência conflitante ou fora de CARRO/AVIÃO), que continuam sem
# preenchimento algum: ali existe evidência real, só não é aproveitável.
AVISO_TRANSPORTE_NAO_IDENTIFICADO = (
    "Transporte não identificado no processo — necessita revisão manual."
)


def identificar_transporte(texto: str) -> tuple[str | None, str | None]:
    """Classifica o meio de transporte só quando há evidência textual direta
    no processo. Na ausência de evidência, ou diante de evidência conflitante
    ou fora de CARRO/AVIÃO, o campo fica vazio e é sinalizado para revisão
    manual — nunca é preenchido por suposição."""
    texto_normalizado = normalizar(texto)

    achou_aviao = any(palavra in texto_normalizado for palavra in _PALAVRAS_AVIAO)
    achou_carro = any(palavra in texto_normalizado for palavra in _PALAVRAS_CARRO)
    achou_outro = any(palavra in texto_normalizado for palavra in _PALAVRAS_OUTRO)

    if achou_aviao and achou_carro:
        return None, "Evidências conflitantes de transporte (carro e avião) — necessita revisão manual."

    if achou_aviao:
        return "AVIÃO", None

    if achou_carro:
        return "CARRO", None

    if achou_outro:
        return (
            None,
            "Meio de transporte identificado fora de CARRO/AVIÃO — necessita revisão manual.",
        )

    return None, AVISO_TRANSPORTE_NAO_IDENTIFICADO
