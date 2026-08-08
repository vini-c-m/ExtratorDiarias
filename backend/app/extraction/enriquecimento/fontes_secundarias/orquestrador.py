from dataclasses import replace

from app.domain.entities.diaria import Diaria

from .base import FonteSecundariaDeEvidencia
from .registro import FONTES_SECUNDARIAS


def aplicar_fontes_secundarias(
    diaria: Diaria,
    texto: str,
    fontes: tuple[FonteSecundariaDeEvidencia, ...] = FONTES_SECUNDARIAS,
) -> tuple[Diaria, list[str]]:
    """Aplica cada Fonte Secundária registrada, nesta ordem, a uma `Diaria`
    já resolvida pela fonte primária (Solicitação de Diária) e por toda a
    regra de enriquecimento existente (`enriquecimento/__init__.py`) —
    inclusive fallbacks já homologados, como a regra operacional de
    transporte. Só chama uma fonte quando pelo menos um dos campos que ela
    declara em `campos_suportados` ainda está `None` nesta `Diaria`; nunca
    aplica um valor a um campo já preenchido, mesmo que a fonte devolva
    evidência para ele — a checagem é centralizada aqui, nenhuma fonte
    concreta precisa reimplementá-la.

    Quando duas fontes (presente ou futuramente) declaram o mesmo campo, a
    primeira da lista que tiver evidência vence — a ordem de
    `FONTES_SECUNDARIAS` é a fonte de verdade dessa prioridade, nunca
    alterada silenciosamente por esta função.

    `fontes` é injetável (por padrão, o registro real) só para testes
    isolarem o orquestrador de fontes concretas específicas.

    Devolve a `Diaria` (possivelmente) complementada e a lista de avisos
    descrevendo exatamente o que foi complementado, por qual fonte e por
    quê — nunca uma alteração silenciosa. Lista vazia quando nenhuma fonte
    complementou nada."""
    atualizacoes: dict[str, str] = {}
    avisos: list[str] = []

    for fonte in fontes:
        campos_pendentes = {
            campo
            for campo in fonte.campos_suportados
            if getattr(diaria, campo, None) is None and campo not in atualizacoes
        }
        if not campos_pendentes:
            continue

        evidencias = fonte.buscar_evidencias(texto)
        for campo, evidencia in evidencias.items():
            if campo not in campos_pendentes:
                # Campo já resolvido pela fonte primária, ou por uma fonte
                # secundária anterior nesta mesma aplicação — nunca
                # sobrescrito, mesmo que esta fonte tenha evidência própria.
                continue
            atualizacoes[campo] = evidencia.valor
            avisos.append(
                f'Campo "{campo}" complementado por fonte secundária de evidência '
                f"({fonte.nome}): {evidencia.justificativa}"
            )

    if not atualizacoes:
        return diaria, avisos
    return replace(diaria, **atualizacoes), avisos
