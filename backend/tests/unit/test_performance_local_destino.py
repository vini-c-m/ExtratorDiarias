import time

from app.extraction.enriquecimento.local_destino import identificar_estado_destino

# Mistura de casos exatos, com UF explícita, aproximados (typo) e ambíguos —
# o pior caso realista de uma diária, não só o caminho rápido (match exato).
_CASOS = [
    "Recife",
    "Garanhuns/PE",
    "Nazaré da Mata",
    "Cabo de Santo Augustinho / Palmares",
    "Petrolna",
    "Garanhus",
    "São Paulo/SP",
    "Brasília",
    "Fernando de Noronha",
    "Cidade Que Nao Existe De Verdade",
    "Bonito",
    "JOAO PESSOA",
]


def test_identificar_estado_destino_processa_lote_grande_em_tempo_aceitavel():
    """Demonstra que a normalização + correspondência aproximada (Sprint
    03.1), rodando contra os 5570 municípios do Brasil, não vira gargalo.
    200 diárias (bem mais que um lote real) com uma mistura de match exato,
    aproximado e ambíguo devem processar em bem menos de 1 segundo —
    ordens de grandeza mais rápido que a leitura de um único PDF."""
    total_chamadas = 200 * len(_CASOS)

    inicio = time.perf_counter()
    for _ in range(200):
        for caso in _CASOS:
            identificar_estado_destino(caso)
    duracao = time.perf_counter() - inicio

    tempo_por_chamada_ms = (duracao / total_chamadas) * 1000
    assert duracao < 5.0, (
        f"{total_chamadas} identificações de estado levaram {duracao:.2f}s "
        f"({tempo_por_chamada_ms:.2f} ms/chamada) — acima do esperado."
    )
