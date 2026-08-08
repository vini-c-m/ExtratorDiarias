import re
from dataclasses import dataclass, field, replace
from enum import Enum

from openpyxl import load_workbook
from openpyxl.styles import Alignment, Border, Font, Side
from openpyxl.worksheet.worksheet import Worksheet

from app.domain.entities.diaria import Diaria
from app.extraction.enriquecimento.local_destino import remover_sufixo_uf
from app.domain.entities.fonte_doc_origem import FonteDocOrigem
from app.domain.entities.fonte_transporte import FonteTransporte
from app.domain.entities.modo_processamento import ModoProcessamento
from app.domain.entities.processo import Processo
from app.domain.entities.tipo_processo import TipoProcesso

NOME_ABA = "Controle de Diárias"
COLUNA_LINHA_LIVRE = "B"
PRIMEIRA_LINHA_DADOS = 2

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
        workbook.save(caminho_planilha)

    return ResultadoPreenchimento(
        total_gravado=total_gravado,
        duplicadas_ignoradas=len(itens) - total_gravado,
        linha_inicial=linha_inicial or 0,
        linha_final=(linha - 1) if total_gravado else 0,
        itens=itens,
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


def _localizar_proxima_linha_livre(planilha: Worksheet) -> int:
    """A coluna B é a primeira que o próprio extrator preenche, então uma
    célula B vazia indica com segurança que a linha ainda não recebeu dados
    deste fluxo (validado contra a planilha real — a coluna A tem linhas
    preenchidas com A vazio, o que a tornaria um indicador não confiável)."""
    linha = PRIMEIRA_LINHA_DADOS
    while planilha[f"{COLUNA_LINHA_LIVRE}{linha}"].value not in (None, ""):
        linha += 1
    return linha


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
