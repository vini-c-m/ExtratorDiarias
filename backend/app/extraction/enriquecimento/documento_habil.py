import re

from app.extraction.segmentacao_documentos import ultimo_segmento_ate_execucao_financeira

_PADRAO_DH = re.compile(r"\b(\d{4}DH\d{6})\b")

# Regra de negócio do DIMCAC: o Documento Hábil aparece em vários lugares do
# processo (Despacho de Validação, Nota de Liquidação, Ordem Bancária), mas a
# fonte oficial é sempre o Despacho de Validação — as demais ocorrências só
# reproduzem essa informação em etapas posteriores da execução financeira, e
# nunca devem ser a fonte da extração. Quando o processo tem mais de uma
# "Validação de Diária" anexada (a primeira foi corrigida e substituída por
# uma nova), a versão válida é sempre a última — mesma regra já aplicada a
# outros documentos do processo (ver `_PADRAO_TITULO_REQUERIMENTO` em
# `sei_parser_v1.py`).
_PADRAO_TITULO_VALIDACAO = re.compile(r"Valida[çc][ãa]o de Di[áa]ria", re.IGNORECASE)


def extrair_documento_habil(texto: str) -> tuple[str | None, str | None]:
    """Procura o número do Documento Hábil (formato AAAADHnnnnnn) no texto do
    processo, restrito ao segmento da ÚLTIMA Validação de Diária — sua fonte
    oficial única — sem nunca consultar Nota de Liquidação ou Ordem Bancária,
    mesmo quando anexadas depois dela. Isso elimina naturalmente qualquer DH
    de uma dessas duas — pertencente a uma execução financeira incorreta,
    cancelada ou até de outro processo anexado por engano — sem precisar
    reconhecer nenhuma frase específica de cancelamento.

    PDFs de layout mais antigo, sem a marcação de título da Validação, caem
    de volta para o texto inteiro do processo — comportamento idêntico ao de
    antes desta Sprint, preservado para não regredir nenhum processo já
    homologado.

    Processos que ainda não chegaram à fase de liquidação não têm DH — isso é
    esperado, não um erro, e a célula fica em branco."""
    segmento_validacao = ultimo_segmento_ate_execucao_financeira(texto, _PADRAO_TITULO_VALIDACAO)
    texto_busca = segmento_validacao if segmento_validacao is not None else texto

    valores = set(_PADRAO_DH.findall(texto_busca))

    if len(valores) == 1:
        return next(iter(valores)), None

    if len(valores) == 0:
        return (
            None,
            "Documento Hábil (DH) não localizado — processo provavelmente ainda "
            "não chegou à fase de liquidação.",
        )

    return (
        None,
        f"Mais de um Documento Hábil encontrado no processo ({', '.join(sorted(valores))}) "
        "— necessita revisão manual.",
    )
