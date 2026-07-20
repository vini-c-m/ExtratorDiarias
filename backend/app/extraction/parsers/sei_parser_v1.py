import re

from app.domain.entities.campos_extraidos import CamposExtraidos
from app.extraction.segmentacao_documentos import ultimo_segmento

from .base_parser import ParserSei


def _somente_numeros(valor: str) -> str:
    return re.sub(r"\D", "", valor)


# Sprint 04.2 — Caso 1 (múltiplos requerimentos): quando o processo tem mais
# de um Requerimento/Solicitação de Diária anexado (o primeiro teve erro e
# foi substituído, por exemplo), todo campo abaixo deve vir exclusivamente
# do último — nunca de uma mistura entre um requerimento já substituído e o
# vigente. Cobre os três nomes usados pelo SEI para este formulário, tanto
# Servidor quanto Membro ("CMFC - Requerimento de Diária - Membro - <id>",
# "CMFC - Solicitação de Diária - Servidor - <id>").
_PADRAO_TITULO_REQUERIMENTO = re.compile(
    r"(?:Requerimento|Solicita[çc][ãa]o) de Di[áa]ria", re.IGNORECASE
)

# Sprint 04.2 — Caso 2 (data de retorno lida errada): o rodapé que o SEI
# repete no fim de cada página ("<documento>         SEI <processo> / pg.
# <n>") pode cair exatamente entre o rótulo de um campo e o seu valor,
# quando o valor começa só na página seguinte. Nesse caso `\s*` sozinho não
# alcança o valor (o rodapé tem letras, não é espaço em branco) — o
# `re.search` original falhava ali, silenciosamente, e passava a valer a
# PRÓXIMA ocorrência do mesmo rótulo no texto, que pode pertencer a um
# documento totalmente diferente (ex.: uma Confirmação dos Serviços
# preenchida depois, com erro de digitação próprio — foi exatamente assim
# que "22/05/2026" virou "22/06/2026" no processo de referência do Caso 2).
# Este padrão intercala, opcionalmente, uma linha de rodapé entre o rótulo
# e o valor, então o valor correto — mesmo quebrado entre páginas — é
# sempre encontrado primeiro.
_RODAPE_SEI_OPCIONAL = r"(?:[ \t]*\n[^\n]*SEI\s+[\d./\-]+\s*/\s*pg\.\s*\d+[^\n]*)?"

# Sprint de Correção Crítica — CPF interrompido por um separador atípico
# ENTRE os grupos de dígitos. Processo real 19.20.0001.0000138/2026-34:
# `pdf_reader.ler_texto` devolve "CPF:\n111.111 111-11" — confirmado, com o
# PDF real, que o caractere entre "582" e "004" é um espaço comum (U+0020),
# não uma quebra de linha nem o rodapé do SEI (`_RODAPE_SEI_OPCIONAL`, acima,
# não se aplica aqui — não há nenhum "SEI ... / pg. N" envolvido). Dois
# extratores independentes (pdfplumber e PyMuPDF) produzem o mesmo espaço, e
# o mesmo CPF aparece corretamente pontuado mais adiante no próprio
# documento — evidência de que é uma inconsistência de como aquele campo
# específico do PDF foi preenchido, não um padrão de quebra de página.
#
# A regex antiga (`[\d.-]+`) não reconhece espaço como parte de um CPF e
# parava exatamente aí, produzindo um fragmento de 6 dígitos.
#
# Esta regex é deliberadamente o formato fixo de um CPF — três grupos de 3
# dígitos e um de 2, sempre nessa ordem — e cada separador entre grupos
# aceita, no máximo, UM entre `.`, `-` ou espaço (nunca os três juntos, nunca
# repetido, nunca quebra de linha). Não é uma classe de caracteres genérica:
# o padrão exige exatamente 11 dígitos na posição certa, então não tem como
# "correr" para dentro de um campo vizinho (matrícula, número de processo
# etc.) do jeito que `[\d.-]+` conseguia (ver o caso de captura maior que o
# CPF, coberto em `test_sei_parser_v1.py`). Continua não sendo suficiente por
# si só — a defesa definitiva contra CPF corrompido continua sendo a
# validação de 11 dígitos em `validacao_diaria._cpf_valido`, mantida
# intacta; esta regex só reduz quantos processos legítimos caem
# desnecessariamente em revisão manual por causa deste separador específico.
_PADRAO_VALOR_CPF = r"(\d{3}[.\- ]?\d{3}[.\- ]?\d{3}[.\- ]?\d{2})"


def _buscar_campo(rotulo: str, texto: str, padrao_valor: str = "(.*)") -> "re.Match[str] | None":
    """`re.search` para 'RÓTULO: valor', tolerando que o rodapé de página do
    SEI apareça entre os dois (ver `_RODAPE_SEI_OPCIONAL`) — quando não há
    quebra de página no meio, casa exatamente como antes."""
    return re.search(rf"{rotulo}:{_RODAPE_SEI_OPCIONAL}\s*{padrao_valor}", texto)


class SeiParserV1(ParserSei):
    """Portado do script legado (legado/extrair_diárias.py) e validado contra
    os 7 PDFs reais de legado/pdfs. Mesma regex, mesmos fallbacks.

    Sprint 04.2: quando o processo tem mais de um Requerimento/Solicitação
    de Diária anexado, a extração passa a olhar exclusivamente para o texto
    do último (`_PADRAO_TITULO_REQUERIMENTO` via `ultimo_segmento`) — antes
    desta Sprint todo campo usava `re.search` direto no texto inteiro do
    processo (primeira ocorrência), então um requerimento substituído e
    anexado ANTES do vigente sempre vencia. Processos com um único
    requerimento — todo o conjunto homologado até esta Sprint — não têm essa
    marcação repetida, e `ultimo_segmento` devolve `None`: o parser cai de
    volta no texto completo, comportamento idêntico ao de antes."""

    def extrair(self, texto: str) -> CamposExtraidos:
        texto = texto.replace("\r", "\n")
        texto = re.sub(r"[ \t]+", " ", texto)

        texto_requerimento = ultimo_segmento(texto, _PADRAO_TITULO_REQUERIMENTO) or texto

        sei = re.search(r"SEI\s*([\d./-]+)", texto_requerimento)

        doc_origem = _buscar_campo("LOTAÇÃO", texto_requerimento)
        if not doc_origem:
            doc_origem = _buscar_campo("UNIDADE SOLICITANTE", texto_requerimento)

        cpf = _buscar_campo("CPF", texto_requerimento, _PADRAO_VALOR_CPF)

        motivo = _buscar_campo("FINALIDADE DA VIAGEM", texto_requerimento)

        origem = _buscar_campo("CIDADE ORIGEM", texto_requerimento)
        destino = _buscar_campo(r"CIDADE\(S\) DESTINO", texto_requerimento)

        data_inicio = re.search(
            r"SAÍDA PREVISTA PARA[\s\S]*?DATA:\s*([\d/]+)", texto_requerimento, re.IGNORECASE
        )
        data_retorno = re.search(
            r"RETORNO PREVISTO PARA[\s\S]*?DATA:\s*([\d/]+)", texto_requerimento, re.IGNORECASE
        )
        if not data_inicio:
            data_inicio = _buscar_campo("DATA INICIAL", texto_requerimento, r"([\d/]+)")
        if not data_retorno:
            data_retorno = _buscar_campo("DATA DE RETORNO", texto_requerimento, r"([\d/]+)")

        return CamposExtraidos(
            sei=sei.group(1).strip() if sei else None,
            doc_origem=doc_origem.group(1).strip() if doc_origem else None,
            cpf=_somente_numeros(cpf.group(1)) if cpf else None,
            periodo_inicial=data_inicio.group(1).strip() if data_inicio else None,
            periodo_final=data_retorno.group(1).strip() if data_retorno else None,
            cidade_origem=origem.group(1).strip() if origem else None,
            cidade_destino=destino.group(1).strip() if destino else None,
            motivo=motivo.group(1).strip() if motivo else None,
        )
