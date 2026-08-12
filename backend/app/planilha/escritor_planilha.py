import datetime
import re
import zipfile
from dataclasses import dataclass, field, replace
from enum import Enum
from xml.etree import ElementTree
from xml.sax.saxutils import escape as _escapar_texto_xml

from openpyxl import load_workbook
from openpyxl.styles import Alignment, Border, Font, Side
from openpyxl.utils.datetime import to_excel as _para_serial_excel
from openpyxl.worksheet.worksheet import Worksheet

from app import diagnostico_complemento_temp as diag  # DIAGNÓSTICO TEMPORÁRIO — remover após causa raiz confirmada/corrigida
from app.domain.entities.diaria import Diaria
from app.extraction.enriquecimento.local_destino import remover_sufixo_uf
from app.domain.entities.fonte_doc_origem import FonteDocOrigem
from app.domain.entities.fonte_transporte import FonteTransporte
from app.domain.entities.modo_processamento import ModoProcessamento
from app.domain.entities.processo import Processo
from app.domain.entities.tipo_processo import TipoProcesso

NOME_ABA = "Controle de Diárias"
PRIMEIRA_LINHA_DADOS = 2

# P0 FINAL (2026-08-09) — margem permanente de linhas futuras que a
# preparação estrutural automática garante além do próprio lote (item 5 do
# pedido do usuário): tamanho_do_lote + esta margem, sempre. Existe para que
# o PRÓXIMO lote processado (mesmo minutos depois) já encontre uma zona de
# inserção pronta, sem depender de alguém ter aberto a planilha no Excel
# entretanto.
MARGEM_ESTRUTURAL_LINHAS_FUTURAS = 20

# Mesmo mapeamento validado no script legado (legado/extrair_diárias.py) —
# só estas colunas são escritas, o resto da planilha (estrutura, abas,
# fórmulas de E/F/G, cabeçalhos) permanece intocado.
COLUNA_SEI = "B"
COLUNA_DOC_ORIGEM = "C"
COLUNA_CPF = "D"
COLUNA_PERIODO_INICIAL = "H"
COLUNA_PERIODO_FINAL = "I"
COLUNA_TRECHO = "J"
COLUNA_MOTIVO = "L"

# Sprint 03 — colunas opcionais (só escritas quando há evidência segura).
# COLUNA_TRANSPORTE é K, não E: E é "PREVIDÊNCIA", uma fórmula VLOOKUP —
# confirmado direto no cabeçalho real da planilha, escrever nela quebraria a
# fórmula.
COLUNA_DH = "A"
COLUNA_TRANSPORTE = "K"
COLUNA_LOCAL = "Q"

# Sprint 04 — Diária de Membro. COLUNA_VALOR_DIARIAS só é escrita quando
# diaria.tipo_processo é DIARIA_MEMBRO (ver `_escrever_linha`); para
# qualquer outro tipo de processo — inclusive o fluxo Padrão já homologado —
# a coluna P permanece intocada, exatamente como antes desta Sprint.
COLUNA_VALOR_DIARIAS = "P"

# Modo Complemento de Diárias (decisão institucional revisada, ver
# `docs/central-conferencia/README.md` RN-14) — as duas únicas colunas
# extras escritas, e só neste modo. `COLUNA_QUANTIDADE_PARCIAL` (O) nunca é
# tocada no modo Padrão (permanece preenchimento manual humano, como hoje).
# `COLUNA_AVISO` (AA) é normalmente a fórmula nativa `=VLOOKUP(...)` de
# alerta de duplicidade da própria planilha (RN-02 "espelhada" em Excel) —
# só é sobrescrita com texto fixo no modo Complemento, reproduzindo em
# código a mesma ação que hoje um humano da CMFC já faz manualmente ao
# reconhecer um complemento legítimo.
COLUNA_QUANTIDADE_PARCIAL = "O"
COLUNA_AVISO = "AA"
AVISO_COMPLEMENTO_DE_DIARIAS = "COMPLEMENTO DE DIÁRIAS"

# Colunas cuja fórmula de cálculo financeiro/duplicidade precisa já estar
# pré-copiada na linha livre ANTES de gravar um Complemento de Diárias
# (auditoria obrigatória, decisão do usuário) — nunca no modo Padrão, cujo
# comportamento de gravação permanece o já homologado.
_COLUNAS_FORMULA_NECESSARIAS_COMPLEMENTO = ("N", "P", "R", "S", "V", "Z", "AA")

_BORDA_FINA = Border(
    left=Side(style="thin"),
    right=Side(style="thin"),
    top=Side(style="thin"),
    bottom=Side(style="thin"),
)
_ALINHAMENTO = Alignment(horizontal="center", vertical="center", wrap_text=True)
_FONTE = Font(name="Calibri", size=11)


class CategoriaResultado(str, Enum):
    INSERIDO = "inserido"
    DUPLICADO_NO_LOTE = "duplicado_no_lote"
    DUPLICADO_NA_PLANILHA = "duplicado_na_planilha"
    # Modo Complemento de Diárias — a linha livre encontrada não tinha as
    # fórmulas de cálculo/duplicidade pré-copiadas (ver
    # `_linha_possui_formulas_necessarias`). Nunca ocorre no modo Padrão.
    # Item NÃO gravado (mesmo espírito de DUPLICADO_*, mas por um motivo
    # técnico, não de duplicidade) — decisão do usuário: nunca gravar um
    # complemento de forma incompleta.
    LINHA_SEM_FORMULAS_NECESSARIAS = "linha_sem_formulas_necessarias"


@dataclass(frozen=True)
class ItemResultado:
    """Resultado de um PDF dentro do lote de preenchimento — uma entrada por
    arquivo enviado, na mesma ordem em que foi recebido. `linha` é a linha
    gravada (INSERIDO) ou a linha onde o SEI já existia (DUPLICADO_NA_PLANILHA);
    fica None para DUPLICADO_NO_LOTE, que não aponta para nenhuma linha."""

    arquivo_origem: str
    sei: str
    categoria: CategoriaResultado
    linha: int | None = None
    # Sprint 04 / 04.1 — só para exibição no relatório (ver
    # `planilha/relatorio.py`); não influencia gravação, deduplicação nem
    # nenhuma regra já homologada.
    tipo_processo: TipoProcesso = TipoProcesso.PADRAO
    valor_total_diarias: str | None = None
    transporte: str | None = None
    transporte_fonte: FonteTransporte | None = None
    # Sprint 05.1 — só para o relatório distinguir "inserido sem pendência"
    # de "inserido, mas precisa de revisão da coluna LOCAL".
    estado_destino: str | None = None
    # Sprint 06 — de onde veio o valor gravado na coluna C (DOC DE ORIGEM):
    # histórico da própria planilha do DIMCAC (Prioridade 1) ou extração do
    # PDF (Prioridade 2, fallback). None só ocorre para itens não gravados
    # (duplicados), onde a coluna C nunca chega a ser escrita.
    doc_origem_fonte: FonteDocOrigem | None = None
    # Modo Complemento de Diárias — linha onde este mesmo SEI já existia
    # (na planilha ou mais cedo neste lote) no momento da gravação. Só
    # populado quando `modo` é COMPLEMENTO E o SEI já existia — nesse modo
    # a duplicidade por SEI deixa de ser bloqueante (categoria continua
    # INSERIDO, a linha é gravada normalmente), mas este campo mantém a
    # informação visível para quem for revisar o resultado. Sempre `None`
    # no modo Padrão, onde SEI duplicado nunca chega a ser INSERIDO.
    sei_ja_existente_em_linha: int | None = None


@dataclass(frozen=True)
class ResultadoPreenchimento:
    total_gravado: int
    duplicadas_ignoradas: int
    linha_inicial: int
    linha_final: int
    itens: list[ItemResultado] = field(default_factory=list)
    # ETAPA 2 (Auditoria P0, 2026-08-09) — gravação da Planilha e
    # sincronização da Central Analítica são resultados DISTINTOS (ver
    # `planilha_service.preencher_planilha`, quem preenche este campo):
    # `total_gravado`/`itens` continuam refletindo só a gravação em si,
    # que nunca é reportada como falha só porque a Base Local em SQLite
    # não pôde ser atualizada. Default `False` preserva 100% os
    # construtores existentes deste dataclass (todos os testes/chamadores
    # atuais, que nunca passam este argumento).
    sincronizacao_analitica_falhou: bool = False
    # P0 FINAL (2026-08-09) — linhas da zona futura de inserção que a
    # preparação estrutural automática precisou reparar (fórmula ausente ou
    # quebrada) antes desta gravação. Vazio no caso comum (nada precisou de
    # manutenção) — ver `_preparar_estrutura_futura`. Só existe para o
    # relatório poder registrar a manutenção quando ela de fato ocorre
    # (item 9 do pedido); nunca influencia gravação/deduplicação.
    linhas_estrutura_reparadas: list[int] = field(default_factory=list)

    @property
    def gravados(self) -> list[ItemResultado]:
        return [item for item in self.itens if item.categoria is CategoriaResultado.INSERIDO]

    @property
    def duplicados_no_lote(self) -> list[ItemResultado]:
        return [
            item for item in self.itens if item.categoria is CategoriaResultado.DUPLICADO_NO_LOTE
        ]

    @property
    def duplicados_na_planilha(self) -> list[ItemResultado]:
        return [
            item
            for item in self.itens
            if item.categoria is CategoriaResultado.DUPLICADO_NA_PLANILHA
        ]


_NS_PRINCIPAL = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
_NS_RELACIONAMENTOS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"

# Auditoria P0 (2026-08-09) — causa raiz confirmada por reprodução executável
# (planilha sintética com fórmula+cache real → `preencher()` → cache
# perdido): `openpyxl` só sabe preservar, ao salvar, o que carregou em
# memória. Aberto sem `data_only=True` (obrigatório aqui — é o que preserva
# fórmulas em células que este módulo nunca toca), toda célula de fórmula
# vira só o texto da fórmula; o `<v>` com o último valor calculado pelo
# Excel (histórico real: 1.419 de 1.446 diárias de SERVIDOR usam fórmula na
# coluna P, quase todas com cache válido) nunca chega a ser carregado — e
# `workbook.save()` reescreve o arquivo inteiro sem ele, apagando o cache de
# TODA fórmula pré-existente, não só das linhas novas gravadas aqui.
#
# Correção: capturar esse cache ANTES de salvar (`_capturar_cache_formulas`,
# segunda leitura só-leitura com `data_only=True`, nunca recalcula nada,
# só copia o que o Excel já tinha calculado) e reescrevê-lo no XML do
# arquivo já salvo (`_reinjetar_cache_formulas`, mesma técnica já usada por
# `tests/unit/test_escritor_planilha.py::injetar_cache_formula` para
# simular o que o Excel real grava). Fórmulas continuam fórmulas — nenhuma
# vira número fixo, nenhum cálculo é inventado; só o `<v>` que já existia
# antes desta gravação é devolvido ao lugar. Não depende de Excel instalado
# (manipulação pura de XML/zip). Limitação conhecida: fórmulas
# compartilhadas (`<f t="shared" .../>` sem texto próprio) não são
# reinjetadas — o regex exige `<f...>texto</f>`; nesse caso a reinjeção
# simplesmente não encontra a célula e não faz nada (degrada para o
# comportamento antigo só nessas células, nunca corrompe).
def _capturar_cache_formulas(workbook, caminho_planilha: str) -> dict[str, dict[str, object]]:
    """Varre o workbook (já em memória, `data_only=False`, ainda não salvo)
    por toda célula que hoje é fórmula, em qualquer aba — e busca o valor em
    cache de cada uma numa segunda leitura `data_only=True` do arquivo NO
    DISCO (ainda intocado nesta chamada, já que roda antes de
    `workbook.save()`). Células de fórmula sem cache (genuinamente nunca
    calculadas pelo Excel) não entram no resultado — nunca inventamos um
    valor que não existia."""
    coordenadas_por_aba: dict[str, list[str]] = {}
    for nome_aba in workbook.sheetnames:
        aba = workbook[nome_aba]
        coordenadas = [
            celula.coordinate
            for linha in aba.iter_rows()
            for celula in linha
            if isinstance(celula.value, str) and celula.value.startswith("=")
        ]
        if coordenadas:
            coordenadas_por_aba[nome_aba] = coordenadas

    if not coordenadas_por_aba:
        return {}

    cache: dict[str, dict[str, object]] = {}
    workbook_valores = load_workbook(caminho_planilha, data_only=True)
    try:
        for nome_aba, coordenadas in coordenadas_por_aba.items():
            aba_valores = workbook_valores[nome_aba]
            cache_aba = {
                referencia: valor
                for referencia in coordenadas
                if (valor := aba_valores[referencia].value) is not None
            }
            if cache_aba:
                cache[nome_aba] = cache_aba
    finally:
        workbook_valores.close()

    return cache


def _mapear_abas_para_xml_interno(caminho_planilha: str) -> dict[str, str]:
    """`xl/workbook.xml` só lista as abas por nome+`r:id`; o nome do arquivo
    XML de cada aba (`xl/worksheets/sheetN.xml`) vem de
    `xl/_rels/workbook.xml.rels` — a ordem de criação das abas não garante
    que a aba N corresponda a `sheetN.xml` (por isso não hardcodamos
    `sheet1.xml` como o fixture de teste faz para um caso sintético
    controlado)."""
    with zipfile.ZipFile(caminho_planilha, "r") as arquivo_zip:
        workbook_xml = arquivo_zip.read("xl/workbook.xml")
        rels_xml = arquivo_zip.read("xl/_rels/workbook.xml.rels")

    rid_para_alvo = {
        relacionamento.get("Id"): relacionamento.get("Target")
        for relacionamento in ElementTree.fromstring(rels_xml)
        if relacionamento.get("Id") and relacionamento.get("Target")
    }

    mapa: dict[str, str] = {}
    sheets_el = ElementTree.fromstring(workbook_xml).find(f"{{{_NS_PRINCIPAL}}}sheets")
    if sheets_el is None:
        return mapa
    for sheet_el in sheets_el:
        nome = sheet_el.get("name")
        rid = sheet_el.get(f"{{{_NS_RELACIONAMENTOS}}}id")
        alvo = rid_para_alvo.get(rid) if rid else None
        if nome and alvo:
            # `Target` em `xl/_rels/workbook.xml.rels` é relativo à pasta
            # `xl/` (ex.: `worksheets/sheet1.xml`) — só prefixamos `xl/`
            # quando o valor ainda não o inclui, para nunca duplicar.
            alvo_normalizado = alvo.lstrip("/")
            mapa[nome] = alvo_normalizado if alvo_normalizado.startswith("xl/") else f"xl/{alvo_normalizado}"
    return mapa


# Auditoria P0 — regressão de performance (2026-08-09): a versão original
# de `_reinjetar_cache_formulas` compilava e buscava um regex NOVO por
# célula (`re.compile` + `.subn` dentro de um laço sobre
# `cache_celulas.items()`), cada busca varrendo o XML inteiro da aba —
# O(N × tamanho do XML) para N células de fórmula. Reproduzido: ~10s para
# 1.800 células de cache numa planilha sintética de 2.000 linhas —
# suficiente para explicar a queda de conexão relatada no Complemento
# real. Este padrão substitui isso por UMA ÚNICA passada pelo XML de cada
# aba (`re.sub` com callback, um `re.Match` por ocorrência real de
# `<f>...</f><v/>` no documento, nunca um novo regex por célula do
# cache) — O(tamanho do XML) + O(1) por ocorrência (lookup em dicionário).
# Mesma semântica exata: fórmula nunca vira número, cache nunca é
# inventado para célula fora do dicionário capturado.
#
# P0 FINAL (2026-08-10) — causa raiz real do "Base Local não sincroniza"
# (achado por instrumentação de runtime contra a planilha de testes
# configurada, nunca a produção): esta função sempre escreveu `<v>{valor}
# </v>` cru, presumindo implicitamente que `valor` é sempre numérico —
# verdade só para a coluna P (o caso original do Etapa 1). Fórmulas que
# retornam TEXTO (ex.: `E` = `VLOOKUP(...)` → "FUNAFIN", "INSS"; `F`/`G` =
# NOME/CARGO; `V` = CONCATENATE) geravam `<c ...><v>FUNAFIN</v></c>` SEM
# `t="str"` — XML tecnicamente inválido: sem essa marcação, o tipo padrão
# de célula é numérico, e `openpyxl`/Excel tentam interpretar o texto como
# número e quebram (`ValueError: invalid literal for int() with base 10:
# 'FUNAFIN'`, capturado ao vivo em `base_local.sincronizar` — a primeira
# vez que `preencher()` completou o ciclo salvar+reinjetar contra uma
# planilha real, já que tentativas anteriores falhavam antes de chegar
# aqui). Nunca pego pelos testes porque nenhum deles injetava cache
# textual — só números (ex. `462.28`). Corrigido: `valor` agora é
# despachado por tipo — numérico grava exatamente como antes; texto grava
# com `t="str"` adicionado ao `<c>` e com escaping XML (`&`, `<`, `>`),
# nunca aplicado antes; booleano grava como `t="b"`/`0`|`1` (tipo Excel
# nativo, nunca "True"/"False" como texto cru). `<f>` (a fórmula em si)
# nunca é tocado em nenhum caso — mesma garantia de sempre.
_PADRAO_CELULA_FORMULA_SEM_CACHE = re.compile(
    r'<c r="([A-Za-z]+[0-9]+)"([^>]*)>(<f[^>]*>[^<]*</f>)<v\s*/>'
)


def _serializar_valor_cache(valor: object, atributos_celula: str) -> tuple[str, str]:
    """Devolve `(atributos_da_celula, conteudo_de_v)` corretos para o tipo
    real do valor — nunca presume numérico. `atributos_celula` já vem sem
    `t="..."` (nunca duplicamos um atributo de tipo que talvez já exista,
    embora `workbook.save()` do openpyxl nunca grave um `t` para célula de
    fórmula, então este caminho é preventivo, não observado em produção)."""
    if isinstance(valor, bool):
        # Checar bool ANTES de (int, float): bool é subclasse de int em
        # Python, mas no XML do Excel é um tipo próprio (`t="b"`,
        # `<v>1</v>`/`<v>0</v>` — nunca a string "True"/"False").
        if 't="b"' not in atributos_celula:
            atributos_celula = f'{atributos_celula} t="b"'
        return atributos_celula, "1" if valor else "0"
    if isinstance(valor, (datetime.date, datetime.time, datetime.timedelta)):
        # P0 (2026-08-10) — achado ao vivo contra a Planilha Oficial real
        # (nunca pego pelos testes, que só usam fixtures sintéticas sem
        # fórmula retornando data): fórmulas de data (ex.: coluna V de
        # `Controle de Diárias`) têm o cache capturado como
        # `datetime.datetime`/`datetime.date` (leitura `data_only=True`) e
        # caíam no branch de texto abaixo, virando `t="str"` com
        # `str(datetime(...))` — ao reler o `.tmp` para validar, a célula
        # voltava como STRING, nunca mais como data, divergindo do valor
        # original e derrubando `_validar_tmp`
        # (`escritor_dados._validar_tmp`) mesmo com o cadastro em si já
        # gravado corretamente na linha nova. `datetime.datetime` é
        # subclasse de `datetime.date` — um único `isinstance` cobre os
        # dois. Serial numérico do Excel (nunca texto): a célula já carrega
        # a formatação de data original (nunca tocada aqui), então ao reler
        # com `data_only=True` o openpyxl reconstrói o mesmo
        # `datetime`/`date` sozinho a partir do número — sem precisar de
        # `t="..."` (numérico é o tipo padrão de célula).
        return atributos_celula, str(_para_serial_excel(valor))
    if isinstance(valor, (int, float)):
        return atributos_celula, str(valor)
    # Texto (achado real 2026-08-10: VLOOKUP retornando PREVIDÊNCIA/NOME/
    # CARGO) — precisa de `t="str"` para não ser lido como número, e
    # escaping XML (nunca feito antes — um nome/cargo com `&`, `<` ou `>`
    # já corromperia o XML mesmo com `t="str"` certo).
    if 't="str"' not in atributos_celula:
        atributos_celula = f'{atributos_celula} t="str"'
    return atributos_celula, _escapar_texto_xml(str(valor))


def _reinjetar_cache_formulas(caminho_planilha: str, cache_por_aba: dict[str, dict[str, object]]) -> None:
    """Reescreve, numa única travessia por aba (não uma busca por
    célula), o `<v>` vazio (`<v />`) que `openpyxl` acabou de gravar para
    cada fórmula capturada por `_capturar_cache_formulas` — nunca toca
    `<f>` (a fórmula em si permanece exatamente a mesma), nunca escreve
    numa célula que não estava no cache capturado antes de salvar. Tipo do
    valor (numérico/texto/booleano) é sempre respeitado — ver
    `_serializar_valor_cache`."""
    if not cache_por_aba:
        return

    mapa_aba_para_xml = _mapear_abas_para_xml_interno(caminho_planilha)

    with zipfile.ZipFile(caminho_planilha, "r") as arquivo_zip:
        entradas = {info.filename: arquivo_zip.read(info.filename) for info in arquivo_zip.infolist()}

    houve_alteracao = False
    for nome_aba, cache_celulas in cache_por_aba.items():
        arquivo_interno = mapa_aba_para_xml.get(nome_aba)
        if arquivo_interno is None or arquivo_interno not in entradas:
            continue

        alterou_esta_aba = {"valor": False}

        def _substituir(encontro: re.Match, cache_celulas=cache_celulas, alterou_esta_aba=alterou_esta_aba) -> str:
            referencia, atributos, tag_formula = encontro.group(1), encontro.group(2), encontro.group(3)
            valor = cache_celulas.get(referencia)
            if valor is None:
                return encontro.group(0)
            alterou_esta_aba["valor"] = True
            atributos, conteudo_v = _serializar_valor_cache(valor, atributos)
            return f'<c r="{referencia}"{atributos}>{tag_formula}<v>{conteudo_v}</v>'

        conteudo = entradas[arquivo_interno].decode("utf-8")
        conteudo_novo = _PADRAO_CELULA_FORMULA_SEM_CACHE.sub(_substituir, conteudo)

        if alterou_esta_aba["valor"]:
            entradas[arquivo_interno] = conteudo_novo.encode("utf-8")
            houve_alteracao = True

    if not houve_alteracao:
        return

    with zipfile.ZipFile(caminho_planilha, "w", zipfile.ZIP_DEFLATED) as arquivo_zip:
        for nome, dado in entradas.items():
            arquivo_zip.writestr(nome, dado)


class EstruturaFuturaIndisponivel(Exception):
    """Nenhuma linha estruturalmente íntegra (fórmulas completas de
    N/P/R/S/V/Z/AA — mesmo conjunto já exigido pela auditoria do
    Complemento) foi encontrada para servir de modelo da preparação
    automática — sem uma origem confiável, `preencher()` aborta ANTES de
    gravar qualquer diária deste lote (nunca inventa fórmula do zero)."""


@dataclass(frozen=True)
class ResultadoPreparacaoEstrutura:
    linhas_reparadas: list[int] = field(default_factory=list)


def _localizar_linha_modelo(planilha: Worksheet, abaixo_de: int) -> int | None:
    """Procura, de baixo para cima a partir da linha imediatamente anterior
    a `abaixo_de`, a primeira linha com TODAS as colunas estruturais
    (N/P/R/S/V/Z/AA) como fórmula. NUNCA assume que a linha imediatamente
    anterior serve — uma diária de MEMBRO pode ter sobrescrito
    legitimamente uma dessas colunas com um valor (ex.: P com o total já
    calculado manualmente), o que a torna um modelo inválido; a busca
    simplesmente continua subindo até achar uma linha genuinamente íntegra
    (mesmo critério de `_linha_possui_formulas_necessarias`, já usado pela
    auditoria obrigatória do Complemento)."""
    for candidata in range(abaixo_de - 1, PRIMEIRA_LINHA_DADOS - 1, -1):
        if _linha_possui_formulas_necessarias(planilha, candidata):
            return candidata
    return None


# P0 FINAL — tradução de referência relativa, mesma semântica de "arrastar
# fórmula" no Excel: `$?[A-Za-z]{1,3}\$?\d+` casa uma referência de célula
# opcionalmente ancorada em coluna (`$` antes da letra) e/ou em linha (`$`
# antes do número). Só a linha é deslocada aqui (a preparação estrutural só
# arrasta para BAIXO, nunca para os lados); uma referência com `$` antes do
# número da linha (linha absoluta) nunca se move. Comportamento confirmado
# empiricamente pela própria fórmula real da coluna AA — `=VLOOKUP(Z2,Z$1:
# AB1,3,0)` na linha 2 vira `=VLOOKUP(Z3,Z$1:AB2,3,0)` na linha 3 (`Z$1`
# fica parado, `Z2`/`AB1` avançam) — ver `tests/unit/
# test_escritor_planilha_complemento.py`.
_PADRAO_REFERENCIA_CELULA = re.compile(r"(\$?)([A-Za-z]{1,3})(\$?)(\d+)")


def _traduzir_formula(formula: str, deslocamento_linhas: int) -> str:
    """Traduz toda referência de célula não ancorada em linha, deslocando o
    número da linha em `deslocamento_linhas` — nunca toca coluna, nunca
    toca uma referência com linha ancorada (`$`), nunca recalcula nada
    (só reescreve texto de fórmula)."""

    def _traduzir_referencia(encontro: re.Match) -> str:
        dolar_coluna, coluna, dolar_linha, linha_str = encontro.groups()
        if dolar_linha == "$":
            return encontro.group(0)
        nova_linha = int(linha_str) + deslocamento_linhas
        return f"{dolar_coluna}{coluna}{dolar_linha}{nova_linha}"

    return _PADRAO_REFERENCIA_CELULA.sub(_traduzir_referencia, formula)


def _preparar_estrutura_futura(
    planilha: Worksheet, linha_inicial: int, quantidade_a_garantir: int
) -> ResultadoPreparacaoEstrutura:
    """Garante que TODA a faixa `[linha_inicial, linha_inicial +
    quantidade_a_garantir)` — sempre livre, nunca uma linha histórica, já
    que começa exatamente em `linha_inicial` — tenha as colunas estruturais
    (N/P/R/S/V/Z/AA) com fórmula válida, ANTES de qualquer gravação deste
    lote (item 6 do pedido do usuário).

    Só toca uma célula que ainda não seja fórmula (`fórmula já correta →
    NÃO sobrescrever`, item 5); a fórmula-modelo vem da linha
    estruturalmente íntegra mais próxima acima de `linha_inicial` (nunca
    necessariamente a linha imediatamente anterior — ver
    `_localizar_linha_modelo`), traduzida por linha como um 'arrastar
    fórmula' do Excel (`_traduzir_formula`). Nunca toca conteúdo fora
    dessas 7 colunas, nunca toca uma linha < `linha_inicial` (histórico
    intocável, item 10)."""
    if quantidade_a_garantir <= 0:
        return ResultadoPreparacaoEstrutura()

    linha_modelo = _localizar_linha_modelo(planilha, linha_inicial)
    if linha_modelo is None:
        raise EstruturaFuturaIndisponivel(
            "Não foi possível preparar automaticamente a estrutura de fórmulas da "
            "Planilha Oficial: nenhuma linha anterior com as fórmulas estruturais "
            "completas (N/P/R/S/V/Z/AA) foi encontrada para servir de modelo. "
            "Verifique manualmente a planilha antes de tentar novamente."
        )

    formulas_modelo = {
        coluna: planilha[f"{coluna}{linha_modelo}"].value
        for coluna in _COLUNAS_FORMULA_NECESSARIAS_COMPLEMENTO
    }

    linhas_reparadas: list[int] = []
    for linha in range(linha_inicial, linha_inicial + quantidade_a_garantir):
        deslocamento = linha - linha_modelo
        reparou_esta_linha = False
        for coluna in _COLUNAS_FORMULA_NECESSARIAS_COMPLEMENTO:
            celula = planilha[f"{coluna}{linha}"]
            if isinstance(celula.value, str) and celula.value.startswith("="):
                continue
            celula.value = _traduzir_formula(formulas_modelo[coluna], deslocamento)
            reparou_esta_linha = True
        if reparou_esta_linha:
            linhas_reparadas.append(linha)

    return ResultadoPreparacaoEstrutura(linhas_reparadas=linhas_reparadas)


def _contar_potencialmente_gravaveis(
    processos: list[Processo], seis_planilha: dict[str, int], modo: ModoProcessamento
) -> int:
    """Quantas linhas novas este lote vai efetivamente consumir — calculado
    ANTES de escrever qualquer coisa, só para saber quanto preparar
    estruturalmente (itens 5/6 do pedido: a preparação acontece antes da
    primeira gravação, então ainda não sabemos `total_gravado` real).
    Replica a MESMA regra de duplicidade do laço principal, sem gravar
    nada. Modo Complemento nunca bloqueia por SEI duplicado (RN-14): todo
    item é potencialmente gravável, então a contagem é trivial."""
    if modo is ModoProcessamento.COMPLEMENTO:
        return len(processos)

    seis_no_lote: set[str] = set()
    contagem = 0
    for processo in processos:
        assert processo.diaria is not None
        sei = processo.diaria.sei.strip()
        if sei in seis_planilha or sei in seis_no_lote:
            continue
        seis_no_lote.add(sei)
        contagem += 1
    return contagem


def preencher(
    caminho_planilha: str,
    processos: list[Processo],
    modo: ModoProcessamento = ModoProcessamento.PADRAO,
) -> ResultadoPreenchimento:
    """Abre a planilha existente, localiza a próxima linha livre pela coluna B
    e grava apenas B, C, D, H, I, J, L de cada diária — sem criar abas, sem
    alterar cabeçalho, sem tocar em outras linhas ou fórmulas.

    O número do processo SEI é o identificador único de uma diária. Cada SEI é
    conferido em duas etapas, nesta ordem:
    1. Contra os SEIs já presentes na planilha (lidos uma única vez, antes do
       laço) — se já existir, vira DUPLICADO_NA_PLANILHA, com a linha onde foi
       encontrado.
    2. Contra os SEIs já gravados neste mesmo lote (acumulados a cada
       iteração) — se um SEI novo na planilha se repetir dentro do lote, só a
       primeira ocorrência vira linha nova; as demais viram
       DUPLICADO_NO_LOTE.
    Nos dois casos a diária não é escrita — EXCETO no `modo` COMPLEMENTO
    (decisão institucional revisada, RN-14): SEI nunca é chave obrigatória
    para um complemento, então nesse modo a checagem deixa de ser
    bloqueante — a linha é gravada normalmente (categoria INSERIDO) e
    `ItemResultado.sei_ja_existente_em_linha` guarda a linha do SEI
    repetido, só para visibilidade.

    Modo COMPLEMENTO também: (a) escreve `COLUNA_QUANTIDADE_PARCIAL` (O)
    quando a `Diaria` já resolveu essa quantidade e `COLUNA_AVISO` (AA)
    com o texto fixo "COMPLEMENTO DE DIÁRIAS"; (b) audita, ANTES de
    gravar, que a linha livre já tem as fórmulas de N/P/R/S/V/Z/AA
    pré-copiadas (`_linha_possui_formulas_necessarias`) — se não tiver,
    aborta a gravação daquele item (`LINHA_SEM_FORMULAS_NECESSARIAS`) em
    vez de gravar um complemento incompleto. Nenhum dos dois
    comportamentos ocorre no modo Padrão.

    P0 FINAL (2026-08-09) — preparação estrutural automática, ANTES de
    gravar qualquer diária deste lote, em AMBOS os modos (não é mais
    exclusiva do Complemento): garante que a faixa de linhas futuras que
    este lote vai efetivamente usar — mais uma margem permanente de
    `MARGEM_ESTRUTURAL_LINHAS_FUTURAS` linhas além do lote — tenha as
    colunas estruturais (N/P/R/S/V/Z/AA) com fórmula válida, copiando (e
    traduzindo, como um 'arrastar fórmula' do Excel) da linha íntegra mais
    próxima acima. Nunca sobrescreve fórmula já válida, nunca toca linha
    histórica, nunca inventa fórmula do zero — se nenhuma linha-modelo
    íntegra existir, `preencher()` levanta `EstruturaFuturaIndisponivel`
    antes de gravar a primeira diária (ver `_preparar_estrutura_futura`).
    Isto é o que elimina, na origem, o `LINHA_SEM_FORMULAS_NECESSARIAS`
    como uma falha do dia a dia no Complemento — o código que o trata
    continua existindo só como proteção de última linha.

    Sprint 06 — DOC DE ORIGEM (coluna C) por CPF: antes de gravar, a própria
    planilha oficial do DIMCAC é consultada pelo CPF do servidor (coluna D)
    nas linhas já existentes. Se houver um registro correspondente, o texto
    de DOC DE ORIGEM já homologado nesse registro é reaproveitado tal como
    está (Prioridade 1) — sem reconstruir, interpretar ou padronizar de
    novo. Só quando não há nenhum histórico daquele CPF é que a lógica de
    extração do PDF, já homologada, decide o valor (Prioridade 2, fallback
    nunca removido — ver `doc_origem_fonte` em `ItemResultado`)."""
    if not processos:
        return ResultadoPreenchimento(
            total_gravado=0, duplicadas_ignoradas=0, linha_inicial=0, linha_final=0
        )

    workbook = load_workbook(caminho_planilha)
    planilha = workbook[NOME_ABA]

    seis_planilha = _seis_existentes(planilha)
    doc_origem_historico = _historico_doc_origem_por_cpf(planilha)
    seis_no_lote: dict[str, int] = {}
    linha = _localizar_proxima_linha_livre(planilha)
    linha_inicial: int | None = None

    quantidade_potencialmente_gravavel = _contar_potencialmente_gravaveis(
        processos, seis_planilha, modo
    )
    linhas_estrutura_reparadas: list[int] = []
    if quantidade_potencialmente_gravavel:
        with diag.etapa(
            "preparacao_estrutura_futura",
            quantidade_a_garantir=quantidade_potencialmente_gravavel
            + MARGEM_ESTRUTURAL_LINHAS_FUTURAS,
        ):
            resultado_preparacao = _preparar_estrutura_futura(
                planilha,
                linha,
                quantidade_potencialmente_gravavel + MARGEM_ESTRUTURAL_LINHAS_FUTURAS,
            )
        linhas_estrutura_reparadas = resultado_preparacao.linhas_reparadas

    itens: list[ItemResultado] = []
    total_gravado = 0

    for processo in processos:
        assert processo.diaria is not None
        diaria = processo.diaria
        sei = diaria.sei.strip()

        linha_sei_existente = seis_planilha.get(sei, seis_no_lote.get(sei))

        if modo is ModoProcessamento.PADRAO:
            if sei in seis_planilha:
                itens.append(
                    ItemResultado(
                        arquivo_origem=processo.arquivo_origem,
                        sei=sei,
                        categoria=CategoriaResultado.DUPLICADO_NA_PLANILHA,
                        linha=seis_planilha[sei],
                        tipo_processo=diaria.tipo_processo,
                        valor_total_diarias=diaria.valor_total_diarias,
                        transporte=diaria.transporte,
                        transporte_fonte=diaria.transporte_fonte,
                        estado_destino=diaria.estado_destino,
                    )
                )
                continue

            if sei in seis_no_lote:
                itens.append(
                    ItemResultado(
                        arquivo_origem=processo.arquivo_origem,
                        sei=sei,
                        categoria=CategoriaResultado.DUPLICADO_NO_LOTE,
                        tipo_processo=diaria.tipo_processo,
                        valor_total_diarias=diaria.valor_total_diarias,
                        transporte=diaria.transporte,
                        transporte_fonte=diaria.transporte_fonte,
                        estado_destino=diaria.estado_destino,
                    )
                )
                continue

        if modo is ModoProcessamento.COMPLEMENTO and not _linha_possui_formulas_necessarias(
            planilha, linha
        ):
            itens.append(
                ItemResultado(
                    arquivo_origem=processo.arquivo_origem,
                    sei=sei,
                    categoria=CategoriaResultado.LINHA_SEM_FORMULAS_NECESSARIAS,
                    linha=linha,
                    tipo_processo=diaria.tipo_processo,
                    valor_total_diarias=diaria.valor_total_diarias,
                    transporte=diaria.transporte,
                    transporte_fonte=diaria.transporte_fonte,
                    estado_destino=diaria.estado_destino,
                )
            )
            continue

        doc_origem_do_historico = doc_origem_historico.get(_cpf_normalizado(diaria.cpf))
        if doc_origem_do_historico:
            diaria_a_gravar = replace(diaria, doc_origem=doc_origem_do_historico)
            doc_origem_fonte = FonteDocOrigem.HISTORICO_DIMCAC
        else:
            diaria_a_gravar = diaria
            doc_origem_fonte = FonteDocOrigem.EXTRACAO_PDF

        _escrever_linha(planilha, linha, diaria_a_gravar, modo)
        seis_no_lote[sei] = linha
        itens.append(
            ItemResultado(
                arquivo_origem=processo.arquivo_origem,
                sei=sei,
                categoria=CategoriaResultado.INSERIDO,
                linha=linha,
                tipo_processo=diaria.tipo_processo,
                valor_total_diarias=diaria.valor_total_diarias,
                transporte=diaria.transporte,
                transporte_fonte=diaria.transporte_fonte,
                estado_destino=diaria.estado_destino,
                doc_origem_fonte=doc_origem_fonte,
                sei_ja_existente_em_linha=(
                    linha_sei_existente if modo is ModoProcessamento.COMPLEMENTO else None
                ),
            )
        )
        total_gravado += 1
        if linha_inicial is None:
            linha_inicial = linha
        linha += 1

    if total_gravado:
        # Captura o cache de TODA fórmula pré-existente antes de salvar — o
        # arquivo no disco ainda está intocado neste ponto (ver comentário
        # de `_capturar_cache_formulas` acima: é isso que garante que o
        # valor capturado é sempre o que já estava lá, nunca inventado).
        with diag.etapa("captura_cache_formulas"):
            cache_formulas = _capturar_cache_formulas(workbook, caminho_planilha)
        with diag.etapa("workbook_save", total_gravado=total_gravado):
            workbook.save(caminho_planilha)
        with diag.etapa(
            "reinjecao_cache",
            celulas=sum(len(valores) for valores in cache_formulas.values()),
        ):
            _reinjetar_cache_formulas(caminho_planilha, cache_formulas)

    return ResultadoPreenchimento(
        total_gravado=total_gravado,
        duplicadas_ignoradas=len(itens) - total_gravado,
        linha_inicial=linha_inicial or 0,
        linha_final=(linha - 1) if total_gravado else 0,
        itens=itens,
        linhas_estrutura_reparadas=linhas_estrutura_reparadas,
    )


def _seis_existentes(planilha: Worksheet) -> dict[str, int]:
    """Todos os SEIs já presentes na coluna B, mapeados para a linha onde
    aparecem pela primeira vez — usados para detectar duplicidade contra a
    planilha e para relatar em qual linha o SEI já existe."""
    seis: dict[str, int] = {}
    for linha in range(PRIMEIRA_LINHA_DADOS, planilha.max_row + 1):
        valor = planilha[f"{COLUNA_SEI}{linha}"].value
        if valor not in (None, ""):
            seis.setdefault(str(valor).strip(), linha)
    return seis


def _cpf_normalizado(valor: object) -> str:
    """A coluna D é gravada como número (ver `_escrever_celula(..., cpf=True)`),
    então um CPF com zero à esquerda perde esse zero ao ser lido de volta como
    int/float — daqui vem o zfill(11). Entradas em texto (digitadas manualmente
    na planilha, com ou sem pontuação) só precisam ter a pontuação removida."""
    if isinstance(valor, (int, float)):
        return str(int(valor)).zfill(11)
    return re.sub(r"\D", "", str(valor or ""))


def _historico_doc_origem_por_cpf(planilha: Worksheet) -> dict[str, str]:
    """Sprint 06 — usa a própria planilha oficial do DIMCAC como fonte
    histórica de DOC DE ORIGEM: cada CPF (coluna D) que já tem uma linha
    anterior na planilha traz, na coluna C, a nomenclatura institucional já
    homologada para aquele servidor. Mapeado para a primeira ocorrência de
    cada CPF (mesmo critério de `_seis_existentes` para SEI) — só as linhas
    já existentes antes deste lote entram no mapa, nunca as que este mesmo
    `preencher` está prestes a gravar."""
    historico: dict[str, str] = {}
    for linha in range(PRIMEIRA_LINHA_DADOS, planilha.max_row + 1):
        cpf = planilha[f"{COLUNA_CPF}{linha}"].value
        doc_origem = planilha[f"{COLUNA_DOC_ORIGEM}{linha}"].value
        if cpf in (None, "") or doc_origem in (None, ""):
            continue
        cpf_normalizado = _cpf_normalizado(cpf)
        if cpf_normalizado:
            historico.setdefault(cpf_normalizado, str(doc_origem).strip())
    return historico


# P0 (2026-08-11) — regra de negócio definitiva: uma linha vazia no MEIO do
# histórico nunca é candidata a inserção, não importa quantas existam. A
# causa raiz do "buraco reaproveitado" descoberto na bateria de 81 diárias de
# teste era `_localizar_proxima_linha_livre` varrendo de CIMA para BAIXO a
# partir de `PRIMEIRA_LINHA_DADOS`, parando na primeira célula B vazia — em
# uso normal isso sempre coincidia com "logo depois da última diária real"
# (só existe uma zona livre, no fim), então o bug nunca se manifestou; mas a
# premissa (zona livre = sempre contígua e no fim) nunca foi verdadeira em
# geral, só na ausência de buracos no meio do histórico. Não há, no
# histórico deste repositório, uma implementação anterior "de baixo para
# cima" — este é o comportamento documentado desde o commit inicial
# (`8f9be7f`), então esta correção não é uma reversão, é uma correção de um
# bug latente nunca antes exercitado (nenhuma fixture de teste existente
# modela um buraco seguido de mais diárias reais).
def _localizar_ultima_linha_real(planilha: Worksheet) -> int:
    """Última linha da planilha que representa uma diária REAL — mesmo
    critério já homologado por `_seis_existentes` (coluna B/SEI preenchida;
    a coluna A tem linhas preenchidas com A vazio na planilha real, o que a
    tornaria um indicador não confiável). Varre de BAIXO para CIMA a partir
    da última linha existente no arquivo (`planilha.max_row` — que pode se
    estender bem além da última diária real, já que a preparação estrutural
    grava fórmula em N/P/R/S/V/Z/AA de linhas futuras ainda vazias) até
    `PRIMEIRA_LINHA_DADOS`, ignorando por completo qualquer linha vazia no
    meio do caminho — mesmo dezenas delas, mesmo já estruturalmente
    preparada: fórmula futura NUNCA torna uma linha uma diária real. Devolve
    `PRIMEIRA_LINHA_DADOS - 1` quando a planilha ainda não tem nenhuma
    diária (nenhuma linha com B preenchido)."""
    for linha in range(planilha.max_row, PRIMEIRA_LINHA_DADOS - 1, -1):
        if planilha[f"{COLUNA_SEI}{linha}"].value not in (None, ""):
            return linha
    return PRIMEIRA_LINHA_DADOS - 1


def _localizar_proxima_linha_livre(planilha: Worksheet) -> int:
    """Próxima linha disponível para gravação: SEMPRE imediatamente após a
    última diária real (`_localizar_ultima_linha_real` acima) — nunca uma
    linha vazia no meio do histórico, não importa quantas existam. Mantém
    o nome/assinatura já homologados (usado por `preencher()` e por todo o
    conjunto de testes existente) — só o critério de busca mudou."""
    return _localizar_ultima_linha_real(planilha) + 1


def _linha_possui_formulas_necessarias(planilha: Worksheet, linha: int) -> bool:
    """Auditoria obrigatória do modo Complemento (decisão do usuário): a
    linha livre encontrada por `_localizar_proxima_linha_livre` precisa já
    ter as fórmulas de cálculo financeiro (`N/P/R/S`), de janela
    operacional (`V`) e de alerta de duplicidade (`AA`) pré-copiadas —
    nunca gravar um complemento numa linha que deixaria a própria planilha
    incapaz de calcular o valor. `openpyxl` expõe uma fórmula como string
    iniciante em "=" quando o workbook é aberto sem `data_only` (como
    `preencher` sempre abre)."""
    for coluna in _COLUNAS_FORMULA_NECESSARIAS_COMPLEMENTO:
        valor = planilha[f"{coluna}{linha}"].value
        if not (isinstance(valor, str) and valor.startswith("=")):
            return False
    return True


def _escrever_linha(
    planilha: Worksheet, linha: int, diaria: Diaria, modo: ModoProcessamento = ModoProcessamento.PADRAO
) -> None:
    trecho = f"{remover_sufixo_uf(diaria.cidade_origem)} - {remover_sufixo_uf(diaria.cidade_destino)}"

    if diaria.documento_habil:
        _escrever_celula(planilha, COLUNA_DH, linha, diaria.documento_habil)
    _escrever_celula(planilha, COLUNA_SEI, linha, diaria.sei)
    _escrever_celula(planilha, COLUNA_DOC_ORIGEM, linha, diaria.doc_origem)
    _escrever_celula(planilha, COLUNA_CPF, linha, diaria.cpf, cpf=True)
    if diaria.transporte:
        _escrever_celula(planilha, COLUNA_TRANSPORTE, linha, diaria.transporte)
    _escrever_celula(planilha, COLUNA_PERIODO_INICIAL, linha, diaria.periodo_inicial, data=True)
    _escrever_celula(planilha, COLUNA_PERIODO_FINAL, linha, diaria.periodo_final, data=True)
    _escrever_celula(planilha, COLUNA_TRECHO, linha, trecho)
    _escrever_celula(planilha, COLUNA_MOTIVO, linha, diaria.motivo)
    if diaria.estado_destino:
        _escrever_celula(planilha, COLUNA_LOCAL, linha, diaria.estado_destino)
    # Coluna P só é preenchida para Diária de Membro — nenhum outro tipo de
    # processo grava nela, mesmo que valor_total_diarias esteja presente.
    if diaria.tipo_processo is TipoProcesso.DIARIA_MEMBRO and diaria.valor_total_diarias:
        _escrever_celula(
            planilha, COLUNA_VALOR_DIARIAS, linha, diaria.valor_total_diarias, moeda=True
        )

    # Modo Complemento de Diárias (RN-14) — únicas duas colunas extras,
    # nunca escritas no modo Padrão. O backend nunca calcula nem escreve
    # valor financeiro: N/P/R/S continuam fórmula, intocados aqui.
    if modo is ModoProcessamento.COMPLEMENTO:
        if diaria.quantidade_diaria_parcial_complementar is not None:
            _escrever_celula(
                planilha,
                COLUNA_QUANTIDADE_PARCIAL,
                linha,
                diaria.quantidade_diaria_parcial_complementar,
            )
        _escrever_celula(planilha, COLUNA_AVISO, linha, AVISO_COMPLEMENTO_DE_DIARIAS)


def _escrever_celula(
    planilha: Worksheet,
    coluna: str,
    linha: int,
    valor: object,
    *,
    cpf: bool = False,
    data: bool = False,
    moeda: bool = False,
) -> None:
    celula = planilha[f"{coluna}{linha}"]
    celula.value = valor
    celula.border = _BORDA_FINA
    celula.alignment = _ALINHAMENTO
    celula.font = _FONTE

    if cpf:
        try:
            celula.value = int(str(valor))
            celula.number_format = "00000000000"
        except (TypeError, ValueError):
            pass

    if data:
        celula.number_format = "DD/MM/YYYY"

    if moeda:
        try:
            celula.value = float(str(valor).replace(".", "").replace(",", "."))
            celula.number_format = '"R$" #,##0.00'
        except (TypeError, ValueError):
            pass
