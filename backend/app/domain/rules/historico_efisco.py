from datetime import date

from app.domain.rules._numero_extenso import numero_por_extenso_feminino

_FORMATO_DATA = "%d/%m/%Y"


def _trecho_diarias(
    quantidade_integral: int, quantidade_parcial: int, *, contexto_complemento: bool = False
) -> str:
    """RN-13, generalizada (2026-08-07): o modelo institucional do
    histórico é sempre o mesmo — o que muda é só a descrição da
    quantidade/modalidade efetivamente identificada. Fluxo Padrão sempre
    chama esta função com `quantidade_parcial=1` (RN-04, "sempre 1",
    inalterada); o modo Complemento passa a quantidade realmente
    documentada (0 por padrão institucional, ou o valor comprovado —
    ver `quantidade_complementar.py`), nunca um segundo modelo de texto.

    P1 (Sprint pré-build, 2026-08-11) — "parcial isolada": quando zero
    diárias integrais E pelo menos uma parcial, o texto SEM nenhuma integral
    na frase é ambíguo entre dois chamadores bem diferentes — (a) o fluxo
    Padrão, que sempre passa `quantidade_parcial=1` por default (RN-04,
    mesmo numericamente sem nenhum "isso é uma parcial de complemento"
    explícito) e cujo texto confirmado pelo DIMCAC é "UMA DIÁRIA PARCIAL"
    (ver `test_historico_zero_diarias_integrais_omite_mencao_a_integrais`,
    intocado); e (b) uma simulação de Complemento que o usuário marcou
    explicitamente como representando uma única parcial isolada, cujo texto
    pedido é só "UMA PARCIAL". `contexto_complemento` (default `False`,
    preserva 100% do texto do fluxo Padrão) é o único jeito de diferenciar
    os dois — os dois números de entrada são idênticos (0, 1) nos dois
    casos, então não há como decidir só a partir deles."""
    partes: list[str] = []

    if quantidade_integral == 1:
        partes.append("01 (UMA) DIÁRIA INTEGRAL")
    elif quantidade_integral >= 2:
        extenso = numero_por_extenso_feminino(quantidade_integral)
        partes.append(f"{quantidade_integral:02d} ({extenso}) DIÁRIAS INTEGRAIS")

    if quantidade_parcial >= 1:
        if partes:
            partes.append("E UMA PARCIAL")
        else:
            partes.append("UMA PARCIAL" if contexto_complemento else "UMA DIÁRIA PARCIAL")

    return f"{' '.join(partes)},"


def montar_historico(
    *,
    sei: str,
    nome_servidor: str,
    periodo_inicial: date,
    periodo_final: date,
    destino: str,
    quantidade_diaria_parcial: int = 1,
    contexto_complemento: bool = False,
) -> str:
    """RN-13 — texto contínuo do histórico do e-Fisco, sem título, sem
    quebra de linha, sem formatação. `sei` nunca é alterado (RN-12): trafega
    exatamente como recebido, com toda a pontuação oficial.

    **Correção de 2026-08-05:** a Etapa 2 deixou de pedir Origem — o
    histórico do e-Fisco usa apenas o destino (`DEST. {DESTINO}`, sem mais
    concatenar origem/destino com hífen). Também nesta correção: o e-Fisco só
    aceita texto em caixa alta, então todo o texto variável (nome do
    servidor, destino) é forçado para maiúsculas — `str.upper()` do Python é
    ciente de Unicode e preserva acentuação (`"ção".upper() ==
    "ÇÃO"`). `sei` nunca passa por `.upper()`: RN-12 exige preservação exata
    do que o servidor digitou, e um número de processo SEI é sempre
    numérico/pontuação, então isso nunca compromete a exigência do e-Fisco.

    Sanidade de entrada (SEI/nome/destino não vazios, período válido) é
    responsabilidade da camada de schema (`app/schemas/conferencia.py`) —
    esta função pura assume que já recebeu dados válidos, mesmo padrão de
    `app/domain/rules/validacao_diaria.py` (a regra de domínio não repete
    validação que já é garantida antes de chegar até ela).

    Diárias integrais (RN-03, N = período final − período inicial) mudam a
    frase em 3 casos confirmados pelo DIMCAC.

    **Generalização (2026-08-07, RN-16):** diárias parciais eram sempre
    `1` (RN-04) — comportamento **preservado integralmente** pelo default
    `quantidade_diaria_parcial=1` (nenhum chamador existente muda de
    comportamento). O modo Complemento de Diárias passa explicitamente a
    quantidade de parcial realmente identificada nos documentos (0 por
    padrão institucional, ou o valor comprovado) — o modelo do texto
    continua sendo exatamente este mesmo, nunca um segundo template."""
    dias_integrais = (periodo_final - periodo_inicial).days
    trecho_diarias = _trecho_diarias(
        dias_integrais, quantidade_diaria_parcial, contexto_complemento=contexto_complemento
    )

    periodo_texto = (
        f"NO PERÍODO DE {periodo_inicial.strftime(_FORMATO_DATA)} "
        f"A {periodo_final.strftime(_FORMATO_DATA)}."
    )

    return (
        f"{sei} {nome_servidor.strip().upper()} {trecho_diarias} "
        f"DEST. {destino.strip().upper()}, {periodo_texto}"
    )
