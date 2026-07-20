"""Segmentação de documentos repetidos dentro do mesmo PDF do processo SEI.

Um processo SEI é, na prática, uma sequência de formulários/documentos CMFC
concatenados num único PDF — e não é incomum que o MESMO tipo de documento
apareça mais de uma vez no mesmo processo (um requerimento que teve erro e
foi refeito, uma validação de diária corrigida por uma nova). Cada instância
desses formulários abre com uma linha de título no padrão
"CMFC - <descrição> - <id>" (ex.: "CMFC - Requerimento de Diária - Membro -
1466144", "CMFC - Validação de Diária - Servidores - 1468970"), repetida
também no rodapé de cada página que pertence a ela.

Sprint 04.2 — este módulo isola, a partir dessas linhas de título, o texto
do ÚLTIMO documento anexado que bate com um determinado padrão — nunca o
primeiro —, para que a extração de campos nunca misture informação de um
documento já substituído com a do documento vigente. Quando o texto não tem
nenhuma dessas linhas de título (PDFs de layout mais antigo, já cobertos
pelos testes homologados antes desta Sprint), as funções devolvem `None` e
quem chama deve continuar usando o texto completo — nenhum comportamento
anterior muda quando esse marcador simplesmente não existe.
"""

import re

_TITULO_DOCUMENTO_CMFC = re.compile(r"^[ \t]*CMFC - (.+?) - \d+[ \t]*$", re.MULTILINE)

# Sprint — Refatoração DH: início de uma Nota de Liquidação ou Ordem
# Bancária — os dois documentos de execução financeira que reproduzem, de
# forma posterior, uma informação (o Documento Hábil) cuja fonte oficial é
# sempre o Despacho de Validação. Diferente dos formulários CMFC, esses
# dois documentos são gerados por um sistema externo (e-Fisco/SIAFE) e só
# anexados ao processo — não carregam o título "CMFC - <descrição> - <id>",
# por isso precisam do próprio marcador de início para delimitar onde um
# segmento termina.
_INICIO_NOTA_LIQUIDACAO = re.compile(r"^[ \t]*NOTA DE LIQUIDA[ÇC][ÃA]O[ \t]*$", re.MULTILINE)
_INICIO_ORDEM_BANCARIA = re.compile(r"^[ \t]*ORDEM BANC[ÁA]RIA\b", re.MULTILINE)


def ultimo_segmento(texto: str, padrao_titulo: re.Pattern[str]) -> str | None:
    """Devolve o texto só do ÚLTIMO documento cujo título bate com
    `padrao_titulo` — da própria linha de título até a próxima linha de
    título de QUALQUER documento CMFC (ou fim do texto), nunca incluindo
    conteúdo de outro documento, seja anterior ou posterior.

    Usado para extrair campos que pertencem exclusivamente àquele
    documento (ex.: datas e cidades do último Requerimento/Solicitação de
    Diária) sem risco de vazar valores de um documento diferente anexado
    depois dele no mesmo processo. `None` quando nenhum título do processo
    bate com `padrao_titulo`."""
    todos = list(_TITULO_DOCUMENTO_CMFC.finditer(texto))
    indices_correspondentes = [
        indice for indice, marcador in enumerate(todos) if padrao_titulo.search(marcador.group(1))
    ]
    if not indices_correspondentes:
        return None

    indice = indices_correspondentes[-1]
    fim = todos[indice + 1].start() if indice + 1 < len(todos) else len(texto)
    return texto[todos[indice].start() : fim]


def texto_a_partir_do_ultimo_segmento(texto: str, padrao_titulo: re.Pattern[str]) -> str | None:
    """Devolve o texto do processo a partir do início do ÚLTIMO documento
    cujo título bate com `padrao_titulo` (inclusive) até o final do texto —
    ou seja, inclui também tudo que foi anexado depois dele (despachos de
    encaminhamento, nota de liquidação, ordem bancária). Usado quando a
    informação buscada pode estar tanto no próprio documento quanto em algo
    gerado a partir dele mais adiante no processo (ex.: o Documento Hábil,
    que aparece na Validação de Diária e, de forma redundante, na Nota de
    Liquidação gerada a partir dela) — descarta só o que veio ANTES,
    preservando fora da busca qualquer documento já substituído. `None`
    quando nenhum título do processo bate com `padrao_titulo`."""
    correspondentes = [
        marcador
        for marcador in _TITULO_DOCUMENTO_CMFC.finditer(texto)
        if padrao_titulo.search(marcador.group(1))
    ]
    if not correspondentes:
        return None
    return texto[correspondentes[-1].start() :]


def ultimo_segmento_ate_execucao_financeira(
    texto: str, padrao_titulo: re.Pattern[str]
) -> str | None:
    """Como `ultimo_segmento`: devolve só o texto do ÚLTIMO documento cujo
    título bate com `padrao_titulo`. A diferença é o fim do segmento —
    além de parar no próximo título CMFC (ou fim do texto), também para no
    início de uma Nota de Liquidação ou Ordem Bancária, mesmo quando nenhum
    outro documento CMFC vem depois no processo.

    Usado quando o campo buscado tem uma fonte oficial única e exclusiva
    (ex.: o Documento Hábil, cuja fonte é sempre o Despacho de Validação) —
    e qualquer reprodução posterior gerada a partir dele, mesmo que
    incorreta ou pertencente a outro processo anexado por engano, nunca
    deve ser consultada. `None` nas mesmas condições de `ultimo_segmento`."""
    todos = list(_TITULO_DOCUMENTO_CMFC.finditer(texto))
    indices_correspondentes = [
        indice for indice, marcador in enumerate(todos) if padrao_titulo.search(marcador.group(1))
    ]
    if not indices_correspondentes:
        return None

    indice = indices_correspondentes[-1]
    inicio = todos[indice].start()

    candidatos_fim = [len(texto)]
    if indice + 1 < len(todos):
        candidatos_fim.append(todos[indice + 1].start())
    proxima_nota_liquidacao = _INICIO_NOTA_LIQUIDACAO.search(texto, inicio)
    if proxima_nota_liquidacao:
        candidatos_fim.append(proxima_nota_liquidacao.start())
    proxima_ordem_bancaria = _INICIO_ORDEM_BANCARIA.search(texto, inicio)
    if proxima_ordem_bancaria:
        candidatos_fim.append(proxima_ordem_bancaria.start())

    return texto[inicio : min(candidatos_fim)]
