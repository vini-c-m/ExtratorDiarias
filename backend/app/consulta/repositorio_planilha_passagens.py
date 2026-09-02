"""Sprint 1 (plano "Valor da Passagem no XLSX Oficial + Não Publicadas") — leitura
isolada da Planilha de Passagens, sem nenhuma integração ao motor de decisão
(RN01-RN07) nem à linha publicável/fingerprint (isso é Sprint 3, HOMO-RT-06).
Só abre/valida/lê/classifica; nunca decide o que é publicado.

Formato real: `.ods` (OpenDocument Spreadsheet), não `.xlsx` — investigação técnica
dedicada (ver plano) confirmou que exigir conversão manual para `.xlsx` não tem
justificativa técnica: `odfpy` é pure-Python, do mesmo perfil de empacotamento já
usado com sucesso para `openpyxl` neste projeto (PyInstaller `collect_all`).

Mesma filosofia de `repositorio_ordens_bancarias.py`: a Planilha de Passagens é um
export de um sistema externo (não controlado por este projeto) — colunas resolvidas
por NOME de cabeçalho normalizado, nunca por posição fixa; o cabeçalho real está na
linha 3 do arquivo real de referência (as duas primeiras linhas são
título/subtítulo "PAGAS ATÉ <MÊS>/<ANO>" — confirma que é um arquivo acumulado,
renovado mensalmente), então a posição do cabeçalho também não pode ser presumida
— este módulo procura a primeira linha cujas colunas obrigatórias batem.

Achado real da auditoria (arquivo real de referência, Julho/2026 — 1.812 linhas de
dados): a coluna "Valor da Passagem" mistura DOIS formatos de célula para o mesmo
dado numérico — células `float` nativas do ODF (22 casos) E strings formatadas em
moeda brasileira, `"R$ 1.657,76"` (38 casos) — inconsistência da própria fonte, não
um bug de leitura; os dois formatos são tratados aqui como o mesmo estado NUMERICO.
Também há 1.708 células `"-"`, 21 vazias (20 realmente vazias + 1 célula contendo
só um espaço em branco, mesma classificação), 22 `"NÃO SE APLICA"`, e 1 erro de
fórmula propagado da fonte (`"#VALOR!"`). Esses cinco estados (A-D deste módulo,
"E" — OB sem correspondência — é calculado depois, no cruzamento com a Base OB,
fora deste módulo) NUNCA são colapsados aqui: a decisão de como cada estado é
representado no XLSX oficial (célula vazia, valor numérico, ou pendente de decisão
de produto para o estado INVALIDO) é responsabilidade de uma camada posterior
(`linha_publicavel.py`, Sprint 3) — este leitor só classifica e preserva.

Mesclagem de células do ODF (`table:covered-table-cell`, usada pelo cabeçalho
mesclado real, ex. "Período" ocupando 2 colunas) É expandida aqui (ao contrário de
`table:number-columns-repeated`, que TAMBÉM é expandida) — sem isso, o índice de
coluna do cabeçalho fica desalinhado em relação aos dados (achado real,
investigado e confirmado célula a célula antes de escrever este módulo)."""

import os
import re
from dataclasses import dataclass, field
from odf.opendocument import load
from odf.table import Table, TableRow
from odf import teletype

from app.domain.entities.linha_passagem import EstadoPassagem, LinhaPassagem

__all__ = [
    "RUBRICAS_OBRIGATORIAS",
    "PlanilhaPassagensNaoEncontrada",
    "EstruturaPlanilhaPassagensInvalida",
    "EstadoPassagem",
    "LinhaPassagem",
    "ResultadoLeituraPlanilhaPassagens",
    "abrir_planilha_passagens",
    "linhas_passagens_por_ob",
    "validar_estrutura",
]

# Rótulos exigidos no cabeçalho da Planilha de Passagens — mínimo necessário para
# o Sprint 1 (cruzamento por OB + classificação do valor + diagnóstico por
# Transporte). Comparação sempre via `_chave_cabecalho` (normalizada), nunca por
# igualdade literal nem por posição.
RUBRICAS_OBRIGATORIAS = ("Ordem Bancária", "Transporte", "Valor da Passagem")

_PADRAO_OB = re.compile(r"^\d+OB\d+$")
_PADRAO_MOEDA_BRL = re.compile(r"^R\$\s*([\d.]+),(\d{2})$")


class PlanilhaPassagensNaoEncontrada(Exception):
    """Arquivo ausente, extensão diferente de `.ods`, ou workbook corrompido/
    bloqueado — nunca uma decisão de regra de negócio, só sinaliza que a fonte
    fornecida não pode ser aberta com confiança. Mesmo papel de
    `OrdensBancariasEstruturalmenteInvalida` para a etapa de abertura."""


class EstruturaPlanilhaPassagensInvalida(Exception):
    """Aba/cabeçalho sem as colunas mínimas exigidas, ou Ordem Bancária
    duplicada dentro da própria Planilha de Passagens. A duplicidade de OB
    NUNCA é resolvida escolhendo a primeira/última linha silenciosamente —
    invalida a fonte inteira (mesmo espírito da proteção contra identidade
    dependente de posição de leitura, já corrigida no motor de decisão via
    HOMO-RT-03 — aqui, do lado da leitura)."""


@dataclass(frozen=True)
class ResultadoLeituraPlanilhaPassagens:
    por_ob: dict[str, LinhaPassagem] = field(default_factory=dict)


def _chave_cabecalho(texto: object) -> str:
    """Mesma normalização de `repositorio_ordens_bancarias._chave_cabecalho`
    (remove espaços, uppercase, preserva acentuação) — nunca duplicar uma
    lógica de normalização já homologada com uma variante levemente
    diferente."""
    return re.sub(r"\s+", "", str(texto or "")).upper()


@dataclass(frozen=True)
class _Celula:
    tipo: str | None
    valor_float: float | None
    texto: str | None


_CELULA_VAZIA = _Celula(tipo=None, valor_float=None, texto=None)


def _celula_de(elemento) -> _Celula:
    tipo = elemento.getAttribute("valuetype")
    texto = teletype.extractText(elemento) or None
    if tipo == "float":
        bruto_valor = elemento.getAttribute("value")
        valor_float = float(bruto_valor) if bruto_valor is not None else None
        return _Celula(tipo=tipo, valor_float=valor_float, texto=texto)
    return _Celula(tipo=tipo, valor_float=None, texto=texto)


def _nome_local(elemento) -> str | None:
    qname = getattr(elemento, "qname", None)
    if qname is None:
        return None
    return qname[1] if isinstance(qname, tuple) else str(qname)


def _repeticoes(elemento, atributo: str) -> int:
    bruto = elemento.getAttribute(atributo)
    return int(bruto) if bruto else 1


def _celulas_expandidas(linha: TableRow, max_colunas: int) -> list[_Celula]:
    """Expande tanto `table:number-columns-repeated` (otimização de
    armazenamento do ODF para sequências de células idênticas) quanto
    `table:covered-table-cell` (células cobertas por mesclagem/`colspan`) —
    SEM as duas expansões, o índice de coluna do cabeçalho (que tem células
    mescladas reais no arquivo de referência) fica desalinhado em relação às
    linhas de dado (que não têm mesclagem) — achado confirmado célula a
    célula antes deste módulo existir. `max_colunas` evita materializar as
    dezenas de milhares de células repetidas em branco que o ODF usa para
    preencher o restante da planilha (achado real: uma única linha de
    preenchimento chegou a `number-rows-repeated="16351"`)."""
    celulas: list[_Celula] = []
    for filho in linha.childNodes:
        if len(celulas) >= max_colunas:
            break
        nome = _nome_local(filho)
        if nome == "table-cell":
            repeticoes = _repeticoes(filho, "numbercolumnsrepeated")
            celula = _celula_de(filho)
            celulas.extend([celula] * min(repeticoes, max_colunas - len(celulas)))
        elif nome == "covered-table-cell":
            repeticoes = _repeticoes(filho, "numbercolumnsrepeated")
            celulas.extend([_CELULA_VAZIA] * min(repeticoes, max_colunas - len(celulas)))
    return celulas


def _localizar_cabecalho(
    linhas: list[TableRow], *, max_linhas_busca: int = 20, max_colunas_busca: int = 20
) -> tuple[int | None, dict[str, int] | None]:
    """Procura, nas primeiras `max_linhas_busca` linhas físicas, a primeira cujas
    colunas normalizadas cobrem `RUBRICAS_OBRIGATORIAS` — nunca assume que o
    cabeçalho está na linha 1 (achado real: no arquivo de referência, as duas
    primeiras linhas são título/subtítulo do relatório, não cabeçalho de
    coluna)."""
    chaves_exigidas = {_chave_cabecalho(rotulo) for rotulo in RUBRICAS_OBRIGATORIAS}
    for indice, linha in enumerate(linhas[:max_linhas_busca]):
        celulas = _celulas_expandidas(linha, max_colunas_busca)
        indice_colunas: dict[str, int] = {}
        for posicao, celula in enumerate(celulas):
            if not celula.texto:
                continue
            chave = _chave_cabecalho(celula.texto)
            if chave not in indice_colunas:
                indice_colunas[chave] = posicao
        if chaves_exigidas <= set(indice_colunas):
            return indice, indice_colunas
    return None, None


def validar_estrutura(tabela: Table) -> None:
    """Confere só que as colunas de `RUBRICAS_OBRIGATORIAS` existem em alguma
    das primeiras linhas do cabeçalho — mesmo papel de
    `repositorio_ordens_bancarias.validar_estrutura`, chamada explicitamente
    tanto por `_selecionar_aba` (quando há mais de uma aba, para escolher a
    certa) quanto por `abrir_planilha_passagens` (sempre, inclusive quando só
    há uma aba — que `_selecionar_aba` devolve sem validar, mesmo critério da
    Base OB: seleção de aba e validação de estrutura são responsabilidades
    separadas)."""
    linhas = tabela.getElementsByType(TableRow)
    indice, _ = _localizar_cabecalho(linhas)
    if indice is None:
        raise EstruturaPlanilhaPassagensInvalida(
            "Planilha de Passagens: colunas obrigatórias ausentes no cabeçalho — "
            f"{', '.join(RUBRICAS_OBRIGATORIAS)}"
        )


def _selecionar_aba(documento) -> Table:
    """Mesmo espírito de `repositorio_ordens_bancarias._selecionar_aba`: se
    houver só uma aba, usa-a (sem validar — validação é responsabilidade de
    `abrir_planilha_passagens`/`validar_estrutura`); senão, usa a primeira
    cujo cabeçalho satisfaça `RUBRICAS_OBRIGATORIAS`. O arquivo de referência
    real tem uma 2ª aba de rascunho ("Planilha1", só números soltos sem
    cabeçalho) que esta seleção descarta corretamente."""
    tabelas = documento.spreadsheet.getElementsByType(Table)
    if not tabelas:
        raise EstruturaPlanilhaPassagensInvalida("Nenhuma aba encontrada na Planilha de Passagens.")
    if len(tabelas) == 1:
        return tabelas[0]
    for tabela in tabelas:
        try:
            validar_estrutura(tabela)
        except EstruturaPlanilhaPassagensInvalida:
            continue
        return tabela
    raise EstruturaPlanilhaPassagensInvalida(
        "Nenhuma aba da Planilha de Passagens tem as colunas mínimas exigidas "
        f"({', '.join(RUBRICAS_OBRIGATORIAS)})."
    )


def abrir_planilha_passagens(caminho: str) -> Table:
    """Abre e valida um arquivo `.ods` de Planilha de Passagens, devolvendo a
    `Table` (aba) pronta para `linhas_passagens_por_ob`. Mesma ordem de
    checagem de `abrir_base_ordens_bancarias` (existência → extensão →
    abertura → estrutura)."""
    if not os.path.isfile(caminho):
        raise PlanilhaPassagensNaoEncontrada(f"Arquivo não encontrado: {caminho}")
    if not caminho.lower().endswith(".ods"):
        raise PlanilhaPassagensNaoEncontrada("Formato não suportado — selecione um arquivo .ods")
    try:
        documento = load(caminho)
    except Exception as erro:  # abrangente de propósito — qualquer falha de leitura
        # (arquivo corrompido, senha, permissão, XML malformado) vira o mesmo
        # erro estrutural explícito, nunca uma exceção genérica não tratada.
        raise PlanilhaPassagensNaoEncontrada(
            f"Não foi possível abrir a Planilha de Passagens — arquivo corrompido ou bloqueado ({erro})"
        ) from erro

    try:
        tabela = _selecionar_aba(documento)
    except AttributeError as erro:
        # `documento.spreadsheet` só existe se o arquivo ODF for de fato uma
        # planilha — um `.ods` que na verdade é outro tipo de documento
        # OpenDocument (texto, apresentação) cai aqui.
        raise PlanilhaPassagensNaoEncontrada(
            "O arquivo selecionado não é uma planilha OpenDocument válida."
        ) from erro

    validar_estrutura(tabela)
    return tabela


def _classificar_valor_passagem(celula: _Celula) -> tuple[EstadoPassagem, float | None, str | None]:
    """Classificação validada célula a célula contra o arquivo real de
    referência (1.812 linhas) — reproduz exatamente os 4 estados do gate do
    Sprint 1 (60 numéricos / 1.708 ausentes-traço / 21 ausentes-vazio / 22 NÃO
    SE APLICA / 1 inválido).

    Um valor numérico pode vir de DUAS formas na fonte real (achado, ver
    docstring do módulo): célula `float` nativa do ODF, OU string em moeda
    brasileira (`"R$ 1.657,76"`) — as duas são tratadas como o MESMO estado
    NUMERICO, nunca uma delas como inválida por acidente de formatação da
    fonte. Célula contendo só espaço em branco é tratada como AUSENTE (mesma
    categoria de célula vazia) — achado real: 1 dos 21 casos "vazios" do gate
    era, na verdade, uma célula com um único caractere de espaço, não uma
    célula genuinamente sem conteúdo."""
    if celula.tipo == "float":
        return EstadoPassagem.NUMERICO, celula.valor_float, celula.texto

    if celula.texto is None:
        return EstadoPassagem.AUSENTE, None, None

    normalizado = celula.texto.strip()
    if normalizado == "":
        return EstadoPassagem.AUSENTE, None, None
    if normalizado == "-":
        return EstadoPassagem.AUSENTE, None, normalizado
    if normalizado.upper() == "NÃO SE APLICA":
        return EstadoPassagem.NAO_SE_APLICA, None, normalizado

    correspondencia = _PADRAO_MOEDA_BRL.match(normalizado)
    if correspondencia:
        parte_inteira, parte_decimal = correspondencia.groups()
        valor = float(f"{parte_inteira.replace('.', '')}.{parte_decimal}")
        return EstadoPassagem.NUMERICO, valor, normalizado

    return EstadoPassagem.INVALIDO, None, normalizado


def linhas_passagens_por_ob(tabela: Table) -> ResultadoLeituraPlanilhaPassagens:
    """Lê toda a Planilha de Passagens já aberta (recebe a `Table`, nunca o
    caminho — mesmo padrão de `ordens_bancarias_por_dh`) e indexa por OB.

    Cruzamento por OB é EXATO (nenhum fuzzy matching por Nome/CPF/Trecho — ver
    plano) — por isso o índice aqui é `dict[str, LinhaPassagem]` (1 OB → no
    máximo 1 linha), ao contrário de `ordens_bancarias_por_dh` (1 DH → N OBs).
    Uma OB que se repete fisicamente dentro da própria Planilha de Passagens
    (não ocorre nos dados reais auditados, mas não pode ser assumida como
    impossível) invalida a fonte inteira — nunca escolhe qual das duas linhas
    usar."""
    linhas = tabela.getElementsByType(TableRow)
    indice_cabecalho, indice_colunas = _localizar_cabecalho(linhas)
    if indice_cabecalho is None or indice_colunas is None:
        raise EstruturaPlanilhaPassagensInvalida(
            "Planilha de Passagens: colunas obrigatórias ausentes no cabeçalho — "
            f"{', '.join(RUBRICAS_OBRIGATORIAS)}"
        )

    posicao_ob = indice_colunas[_chave_cabecalho("Ordem Bancária")]
    posicao_transporte = indice_colunas[_chave_cabecalho("Transporte")]
    posicao_valor = indice_colunas[_chave_cabecalho("Valor da Passagem")]
    max_colunas = max(posicao_ob, posicao_transporte, posicao_valor) + 1

    por_ob: dict[str, LinhaPassagem] = {}
    numero_linha = indice_cabecalho + 1

    for linha in linhas[indice_cabecalho + 1 :]:
        repeticoes = _repeticoes(linha, "numberrowsrepeated")
        celulas = _celulas_expandidas(linha, max_colunas)
        numero_linha += repeticoes

        ob_texto = celulas[posicao_ob].texto if posicao_ob < len(celulas) else None
        if not (isinstance(ob_texto, str) and _PADRAO_OB.match(ob_texto.strip())):
            # Linhas de título/legenda/rodapé (ex.: "Total (j)", texto de
            # fundamento legal) nunca têm o formato de OB — descartadas em
            # silêncio, mesmo critério de "não é dado, é moldura da
            # planilha" (não é uma linha de dado ignorada por erro).
            continue

        ob = ob_texto.strip()
        transporte_texto = celulas[posicao_transporte].texto if posicao_transporte < len(celulas) else None
        celula_valor = celulas[posicao_valor] if posicao_valor < len(celulas) else _CELULA_VAZIA
        estado, valor, bruto = _classificar_valor_passagem(celula_valor)

        for _ in range(repeticoes):
            if ob in por_ob:
                raise EstruturaPlanilhaPassagensInvalida(
                    f"Ordem Bancária duplicada na Planilha de Passagens: {ob}"
                )
            por_ob[ob] = LinhaPassagem(
                linha=numero_linha,
                ob=ob,
                transporte=transporte_texto.strip() if isinstance(transporte_texto, str) else None,
                estado=estado,
                valor=valor,
                bruto=bruto,
            )

    return ResultadoLeituraPlanilhaPassagens(por_ob=por_ob)
