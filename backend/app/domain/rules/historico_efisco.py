from datetime import date

from app.domain.rules._numero_extenso import numero_por_extenso_feminino

_FORMATO_DATA = "%d/%m/%Y"


def montar_historico(
    *,
    sei: str,
    nome_servidor: str,
    periodo_inicial: date,
    periodo_final: date,
    origem: str,
    destino: str,
) -> str:
    """RN-13 — texto contínuo do histórico do e-Fisco, sem título, sem
    quebra de linha, sem formatação. `sei` nunca é alterado (RN-12): trafega
    exatamente como recebido, com toda a pontuação oficial.

    Sanidade de entrada (SEI/nome não vazios, origem != destino, período
    válido) é responsabilidade da camada de schema (`app/schemas/conferencia.py`)
    — esta função pura assume que já recebeu dados válidos, mesmo padrão de
    `app/domain/rules/validacao_diaria.py` (a regra de domínio não repete
    validação que já é garantida antes de chegar até ela).

    Diárias integrais (RN-03, N = período final − período inicial) mudam a
    frase em 3 casos confirmados pelo DIMCAC — diárias parciais (RN-04, O
    sempre 1) nunca variam ("E UMA PARCIAL" é sempre literal)."""
    dias_integrais = (periodo_final - periodo_inicial).days

    if dias_integrais <= 0:
        trecho_diarias = "UMA DIÁRIA PARCIAL,"
    elif dias_integrais == 1:
        trecho_diarias = "01 (UMA) DIÁRIA INTEGRAL E UMA PARCIAL,"
    else:
        extenso = numero_por_extenso_feminino(dias_integrais)
        trecho_diarias = f"{dias_integrais:02d} ({extenso}) DIÁRIAS INTEGRAIS E UMA PARCIAL,"

    # Mesmo formato já gravado hoje pela coluna TRECHO da planilha oficial
    # (`COLUNA_TRECHO`, `app/planilha/escritor_planilha.py`) — decisão de
    # padronização registrada em RN-13, já que os exemplos ilustrativos do
    # DIMCAC usaram separadores diferentes entre si.
    trecho = f"{origem.strip().upper()} - {destino.strip().upper()}"
    periodo_texto = (
        f"NO PERÍODO DE {periodo_inicial.strftime(_FORMATO_DATA)} "
        f"A {periodo_final.strftime(_FORMATO_DATA)}."
    )

    return (
        f"{sei} {nome_servidor.strip().upper()} {trecho_diarias} "
        f"DEST. {trecho}, {periodo_texto}"
    )
