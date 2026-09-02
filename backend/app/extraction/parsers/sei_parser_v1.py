import re
from collections import Counter

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
# ENTRE os grupos de dígitos, achado num processo real (SEI e CPF deste
# comentário sanitizados na varredura de privacidade QA-RT-06 — nenhum dado
# real permanece aqui, só a estrutura do bug):
# `pdf_reader.ler_texto` devolvia "CPF:\n111.111 111-11" — confirmado, com o
# PDF real, que o caractere entre o 2º e o 3º grupo de dígitos é um espaço
# comum (U+0020), não uma quebra de linha nem o rodapé do SEI
# (`_RODAPE_SEI_OPCIONAL`, acima, não se aplica aqui — não há nenhum "SEI
# ... / pg. N" envolvido). Dois extratores independentes (pdfplumber e
# PyMuPDF) produzem o mesmo espaço, e o mesmo CPF aparece corretamente
# pontuado mais adiante no próprio documento — evidência de que é uma
# inconsistência de como aquele campo específico do PDF foi preenchido, não
# um padrão de quebra de página.
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

# Correção de 2026-08-05 — Programa de Validação Evolutiva do Parser, caso
# real SEI 19.20.100000001.0014706/2026-11: um anexo "EXTERNO CONFIRMAÇÃO DE
# SERVIÇO ASSINADA VIA GOV.BR" reproduz o cabeçalho/corpo da própria
# Solicitação (mesmo id do documento, "1523645"), fazendo `ultimo_segmento`
# reabrir o segmento a partir dessa reprodução e arrastar para dentro dele
# conteúdo bem posterior do mesmo processo (no caso, o texto de um Diário
# Oficial Eletrônico anexado). Esse Diário Oficial cita, em prosa
# ("...atestada nos autos do SEI 19.20.0001.0004702/2026-93..."), o número de
# um processo TOTALMENTE DIFERENTE (a base legal orçamentária de uma
# Instrução Normativa) — e `re.search(r"SEI\s*([\d./-]+)")`, sem nenhuma
# âncora além da palavra "SEI", casava com essa citação alheia antes de
# alcançar o rodapé verdadeiro da própria Solicitação, mais adiante no
# mesmo segmento bloat.
#
# A defesa não mexe em `segmentacao_documentos.py` (módulo compartilhado,
# cujos testes já homologados tratam o id do título como não-significativo
# para a ordenação de versões — mudar esse contrato ali teria alcance maior
# e mais arriscado do que o necessário). Em vez disso, o SEI passa a
# preferir o padrão estrutural que o próprio sistema SEI grava em TODA
# página de TODO documento, sem exceção — o rodapé "SEI <NUP> / pg. <N>"
# (mesmo padrão já reconhecido por `_RODAPE_SEI_OPCIONAL`, acima) — porque
# uma citação avulsa a outro processo, dentro de um texto qualquer, nunca
# vem seguida de "/ pg. N": só o rodapé de página do próprio sistema SEI
# tem esse sufixo. Continua caindo de volta no padrão solto original
# (`_PADRAO_SEI_SOLTO`) quando não há nenhum rodapé nesse formato — layouts
# antigos, já homologados antes desta correção, continuam funcionando
# exatamente como antes.
_PADRAO_SEI_RODAPE = re.compile(r"SEI\s+([\d./-]+)\s*/\s*pg\.\s*\d+", re.IGNORECASE)
_PADRAO_SEI_SOLTO = re.compile(r"SEI\s*([\d./-]+)")

# Sprint de Correção Crítica — fallback estrutural de SEI (processo real
# 19.20.100000001.0016125/2026-70): quando a Solicitação vigente (a última —
# nunca uma anterior, ver `ultimo_segmento`) tem o próprio rodapé removido
# por `pdf_reader.py` (sobreposição física de duas páginas, ver comentário
# daquele módulo), a busca primária acima não encontra nada dentro do
# segmento. O SEI, ao contrário de todo campo de negócio, é metadado do
# PROCESSO — idêntico em toda página, não pertence a um documento específico
# — então é seguro (e só para ele) procurar fora do segmento, no texto
# completo, DESDE QUE a fonte continue sendo o mesmo rodapé estrutural do
# próprio SEI (`_PADRAO_SEI_RODAPE`, com o sufixo "/ pg. N"), nunca um regex
# solto: uma citação em prosa a outro processo dentro de um anexo/normativo
# (ex.: Diário Oficial) nunca tem esse sufixo, então nunca entra nesta
# contagem. Este é o único fallback do parser inteiro que olha fora do
# segmento da última ocorrência — todo campo de negócio continua vindo
# exclusivamente de `texto_requerimento` (ver `SeiParserV1.extrair`).
_PADRAO_SEI_NUP_MPPE = re.compile(r"SEI\s+MPPE\s+NUP:\s*([\d./-]+)", re.IGNORECASE)
_MINIMO_OCORRENCIAS_CONSENSO_SEI = 2


def _sei_por_consenso_estrutural(texto: str) -> str | None:
    """Só chamado quando a busca primária (restrita ao segmento da última
    Solicitação) não encontra nada. Conta, no texto INTEIRO do processo,
    quantas vezes cada NUP aparece no rodapé padrão "SEI <NUP> / pg. <N>" —
    só retorna um candidato com maioria clara (nunca em caso de empate) e
    pelo menos `_MINIMO_OCORRENCIAS_CONSENSO_SEI` ocorrências (uma única
    ocorrência isolada não é 'consenso'). Se existir também uma linha "SEI
    MPPE NUP: <NUP>" e ela discordar do candidato majoritário, trata como
    ambíguo — sinal de que algo está errado, nunca critério de desempate — e
    não retorna nada. Em qualquer dúvida, devolve `None`: nunca adivinha."""
    contagem = Counter(match.group(1) for match in _PADRAO_SEI_RODAPE.finditer(texto))
    if not contagem:
        return None

    mais_comuns = contagem.most_common(2)
    candidato, votos = mais_comuns[0]
    if votos < _MINIMO_OCORRENCIAS_CONSENSO_SEI:
        return None
    if len(mais_comuns) > 1 and mais_comuns[1][1] == votos:
        return None  # empate entre dois NUPs — não adivinha

    nup_do_despacho = _PADRAO_SEI_NUP_MPPE.search(texto)
    if nup_do_despacho and nup_do_despacho.group(1) != candidato:
        return None  # fontes estruturais discordam — ambíguo, não adivinha

    return candidato

# Programa Permanente de QA Evolutivo (2026-08-06) — caso real SEI
# 19.20.0001.0001165/2026-47: "FINALIDADE DA VIAGEM" é o único campo deste
# formulário que é texto livre, então é o único que ocasionalmente quebra em
# mais de uma linha no PDF ("...entrega de ofício à\nmunicipalidade."). O
# padrão de valor padrão de `_buscar_campo` (`(.*)`, sem DOTALL) para no
# primeiro "\n" — perdia silenciosamente tudo depois da quebra, sem sinalizar
# erro nem aviso. Os demais campos deste form (LOTAÇÃO, CPF, CIDADE ORIGEM
# etc.) são valores curtos de uma linha só e não precisam deste tratamento.
#
# A correção ancora no próximo rótulo conhecido deste form (nunca "qualquer
# linha em caixa alta", que arriscaria engolir a seção seguinte inteira) —
# mesmo princípio de nunca adivinhar já usado em todo o parser.
_PROXIMOS_ROTULOS_APOS_FINALIDADE = (
    r"CIDADE ORIGEM|CIDADE\(S\) DESTINO|SA[ÍI]DA PREVISTA PARA|"
    r"RETORNO PREVISTO PARA|DATA INICIAL|DATA DE RETORNO|OBSERVA[ÇC][ÕO]ES"
)
_PADRAO_VALOR_MULTILINHA_ATE_PROXIMO_ROTULO = (
    rf"([\s\S]*?)(?=\n(?:{_PROXIMOS_ROTULOS_APOS_FINALIDADE})\s*:|\n_{{5,}}|\Z)"
)


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

        sei_primario = _PADRAO_SEI_RODAPE.search(texto_requerimento) or _PADRAO_SEI_SOLTO.search(
            texto_requerimento
        )
        sei = sei_primario.group(1).strip() if sei_primario else _sei_por_consenso_estrutural(texto)

        doc_origem = _buscar_campo("LOTAÇÃO", texto_requerimento)
        if not doc_origem:
            doc_origem = _buscar_campo("UNIDADE SOLICITANTE", texto_requerimento)

        cpf = _buscar_campo("CPF", texto_requerimento, _PADRAO_VALOR_CPF)

        motivo = _buscar_campo(
            "FINALIDADE DA VIAGEM", texto_requerimento, _PADRAO_VALOR_MULTILINHA_ATE_PROXIMO_ROTULO
        )

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
            sei=sei,
            doc_origem=doc_origem.group(1).strip() if doc_origem else None,
            cpf=_somente_numeros(cpf.group(1)) if cpf else None,
            periodo_inicial=data_inicio.group(1).strip() if data_inicio else None,
            periodo_final=data_retorno.group(1).strip() if data_retorno else None,
            cidade_origem=origem.group(1).strip() if origem else None,
            cidade_destino=destino.group(1).strip() if destino else None,
            motivo=re.sub(r"\s+", " ", motivo.group(1)).strip() if motivo else None,
        )
