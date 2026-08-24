"""Micro-sprint 3F — gerador do XLSX final do Relatório de Diárias — Portal
da Transparência. Nenhuma regra de negócio aqui: recebe um `ResultadoRevisado`
já resolvido pelo backend homologado (RN01-RN07 + decisões humanas válidas,
Micro-sprints 3B/3C) e só escreve. Nunca recalcula duplicidade, competência,
restituição, conflito, fingerprint ou revisão.

Estratégia (aprovada, item 2 da especificação): MODELO OFICIAL como
template — nunca um workbook novo construído "no olho". A geração sempre
parte de uma CÓPIA do arquivo apontado por `caminho_template`; o template
original nunca é aberto em modo de escrita, nunca é sobrescrito.

Mapeamento de colunas (investigação read-only do modelo oficial real,
confirmado célula a célula — ver relatório da Micro-sprint 3F):

    A Ordem Bancária          <- OrdemBancaria.ob
    B Data de Pagamento       <- OrdemBancaria.data_pagamento (DATA OB, RN05),
                                  escrita como TEXTO "DD/MM/YYYY HH:MM:SS"
                                  (Micro-sprint 3F.1: o modelo real armazena
                                  esta coluna como texto em 100% das linhas,
                                  nunca como data/serial Excel)
    C Nome                    <- OrdemBancaria.nome
    D Cargo                   <- OrdemBancaria.cargo
    E Período (inicial)       <- OrdemBancaria.periodo_inicial
    F Período (final)         <- OrdemBancaria.periodo_final
    G Trecho                  <- OrdemBancaria.trecho (ORIGINAL — nunca o
                                  trecho_normalizado, que é só um artefato
                                  interno do detector RN07)
    H Transporte              <- OrdemBancaria.transporte
    I Motivo                  <- OrdemBancaria.motivo
    J Valor da Passagem       <- SEMPRE "-" (decisão institucional
                                  confirmada, Micro-sprint 3F: valor da
                                  passagem não é responsabilidade do DIMCAC;
                                  este gerador nunca calcula, infere ou lê
                                  esse valor de nenhuma fonte)
    K Nº Diárias Integral     <- resolver_quantidade_diarias(...).integral
    L Nº Diárias Parcial      <- resolver_quantidade_diarias(...).parcial
                                  (Controle DIMCAC colunas N/O, já
                                  calculadas por processo anterior — nunca
                                  recalculadas aqui; ver `app/domain/
                                  relatorio_transparencia/quantidade_diarias.py`)
    M Valor total diárias     <- OrdemBancaria.valor (RN02: sempre o valor
                                  bruto da Base OB, nunca ajustado por
                                  restituição)
"""

import os
import shutil
import tempfile
from copy import copy
from dataclasses import dataclass
from datetime import date, datetime

from openpyxl import load_workbook
from openpyxl.worksheet.cell_range import CellRange
from openpyxl.worksheet.worksheet import Worksheet

from app.domain.entities.ordem_bancaria import OrdemBancaria
from app.domain.relatorio_transparencia.decisao import ResultadoRevisado
from app.domain.relatorio_transparencia.motor_decisao import CandidatoNormal
from app.domain.relatorio_transparencia.quantidade_diarias import resolver_quantidade_diarias

__all__ = [
    "RelatorioBloqueadoPorPendencias",
    "DestinoJaExiste",
    "TemplateEstruturalmenteInvalido",
    "RelatorioGeradoResultado",
    "gerar_xlsx_relatorio_transparencia",
]

_NOME_ABA_DADOS = "Controle de Diárias"
_PRIMEIRA_LINHA_DADOS = 7
_ROTULO_LINHA_TOTAL_PREFIXO = "Total"
_VALOR_PASSAGEM_PLACEHOLDER = "-"

_MESES_EXTENSO = [
    "JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO",
    "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO",
]


class RelatorioBloqueadoPorPendencias(Exception):
    """G05 aplicado na camada de geração: nunca gera XLSX enquanto existir
    revisão sem decisão válida (pendente, adiada ou desatualizada) — mesma
    garantia mesmo chamando esta função diretamente, sem passar pela API."""


class DestinoJaExiste(Exception):
    """Item 17 — nunca sobrescreve silenciosamente um arquivo já existente
    no destino."""


class TemplateEstruturalmenteInvalido(Exception):
    """Template não tem a aba/estrutura mínima esperada — erro explícito,
    nunca uma exceção genérica do openpyxl não tratada."""


@dataclass(frozen=True)
class RelatorioGeradoResultado:
    caminho_arquivo: str
    total_ocorrencias: int
    total_valor_diarias: float
    primeira_linha_dados: int
    ultima_linha_dados: int
    linha_total: int


def _localizar_linha_total(ws: Worksheet) -> int:
    """A linha de totais é identificada pelo próprio conteúdo do template
    (coluna A começa com "Total" — confirmado: `A1819 = 'Total (j)'` no
    modelo real), nunca por um número de linha fixo — assim o gerador
    continua funcionando mesmo que o template ganhe/perca linhas
    históricas no futuro."""
    for linha in range(_PRIMEIRA_LINHA_DADOS, ws.max_row + 1):
        valor = ws[f"A{linha}"].value
        if isinstance(valor, str) and valor.strip().startswith(_ROTULO_LINHA_TOTAL_PREFIXO):
            return linha
    raise TemplateEstruturalmenteInvalido(
        f"Não foi possível localizar a linha de totais (coluna A iniciando com "
        f"{_ROTULO_LINHA_TOTAL_PREFIXO!r}) no template."
    )


def _copiar_estilo_linha(ws: Worksheet, linha_origem: int, linha_destino: int, colunas: str) -> None:
    """Copia fonte/preenchimento/borda/alinhamento/formato numérico de uma
    linha-modelo para outra. `copy.copy()` é necessário aqui (não é só
    estilo): depois de `ws.insert_rows`, o acesso `célula.font` de uma
    célula pré-existente pode devolver um `StyleProxy` interno do openpyxl
    em vez do `Font`/`Border`/... imutável direto, e atribuir esse proxy a
    outra célula quebra com `TypeError: unhashable type: 'StyleProxy'`
    dentro da lista indexada de estilos do workbook — `copy.copy()` sempre
    devolve o objeto de estilo real, nunca o proxy."""
    origem = ws.row_dimensions[linha_origem]
    destino = ws.row_dimensions[linha_destino]
    destino.height = origem.height
    for coluna in colunas:
        cel_origem = ws[f"{coluna}{linha_origem}"]
        cel_destino = ws[f"{coluna}{linha_destino}"]
        cel_destino.font = copy(cel_origem.font)
        cel_destino.fill = copy(cel_origem.fill)
        cel_destino.border = copy(cel_origem.border)
        cel_destino.alignment = copy(cel_origem.alignment)
        cel_destino.number_format = cel_origem.number_format


def _realinhar_merges(ws: Worksheet, linha_referencia: int, deslocamento: int) -> None:
    """`Worksheet.insert_rows`/`delete_rows` do openpyxl só realinham o
    CONTEÚDO das células (via `_move_cells`, biblioteca) — `merged_cells.
    ranges` NUNCA é tocado, uma limitação documentada da biblioteca. Sem
    esta correção manual, toda mesclagem abaixo do ponto de inserção/
    remoção (linha de Total, "Fonte de Informação", "Data da última
    atualização", notas de rodapé) fica ancorada na posição ANTIGA — o que
    não só desalinha visualmente essas mesclagens do seu próprio conteúdo
    (que foi movido corretamente), como também corrompe o ESTILO das
    linhas de dados novas/deslocadas: o openpyxl só persiste o estilo da
    célula-âncora de uma mesclagem ao salvar; as demais células dentro de
    uma mesclagem têm o estilo limpo. Sempre chamada logo após
    `insert_rows`/`delete_rows`, nunca antes."""
    # Manipula `ws.merged_cells` (a coleção `MultiCellRange`) diretamente
    # via `.remove`/`.add`, NUNCA via `ws.unmerge_cells`/`ws.merge_cells`:
    # esses métodos de conveniência também tentam apagar/criar entradas em
    # `ws._cells` para as células cobertas — mas `delete_rows` já apagou
    # fisicamente as células da "sobra" final (as últimas `amount` linhas,
    # ver `_gutter`/`_move_cells` da biblioteca), então `unmerge_cells`
    # levantaria `KeyError` ao tentar apagar uma célula que já não existe.
    # Aqui só a METADADO da mesclagem é corrigido — o conteúdo das células
    # já foi movido corretamente por `insert_rows`/`delete_rows`.
    afetadas = []
    for intervalo in list(ws.merged_cells.ranges):
        min_row, max_row = intervalo.min_row, intervalo.max_row
        if max_row < linha_referencia:
            continue
        if min_row < linha_referencia <= max_row:
            raise TemplateEstruturalmenteInvalido(
                f"Mesclagem {intervalo} atravessa o ponto de inserção/remoção de "
                f"linhas (linha {linha_referencia}) — realinhamento automático não "
                f"é seguro; é necessária investigação manual do template."
            )
        novo_min_row, novo_max_row = min_row + deslocamento, max_row + deslocamento
        if novo_min_row < _PRIMEIRA_LINHA_DADOS:
            raise TemplateEstruturalmenteInvalido(
                f"Realinhamento da mesclagem {intervalo} produziria uma posição "
                f"inválida (linha {novo_min_row}) — abortando geração."
            )
        afetadas.append((intervalo, novo_min_row, intervalo.min_col, novo_max_row, intervalo.max_col))

    for intervalo, *_ in afetadas:
        ws.merged_cells.remove(intervalo)
    for _, novo_min_row, min_col, novo_max_row, max_col in afetadas:
        ws.merged_cells.add(
            CellRange(min_row=novo_min_row, min_col=min_col, max_row=novo_max_row, max_col=max_col)
        )


def _realinhar_alturas_de_linha(ws: Worksheet, linha_referencia: int, deslocamento: int) -> None:
    """Mesma limitação da biblioteca descrita em `_realinhar_merges`, mas
    para `row_dimensions` (altura/oculta/nível de contorno) — também nunca
    realinhado automaticamente por `insert_rows`/`delete_rows`. Lê todos
    os valores originais ANTES de limpar/escrever qualquer linha (evita
    qualquer ambiguidade de ordem entre linhas-origem que também são
    linhas-destino de outro deslocamento)."""
    linhas_afetadas = [linha for linha in list(ws.row_dimensions.keys()) if linha >= linha_referencia]
    valores_originais = {
        linha: (ws.row_dimensions[linha].height, ws.row_dimensions[linha].hidden, ws.row_dimensions[linha].outlineLevel)
        for linha in linhas_afetadas
    }
    for linha in linhas_afetadas:
        dimensao = ws.row_dimensions[linha]
        dimensao.height = None
        dimensao.hidden = False
        dimensao.outlineLevel = 0
    for linha, (altura, oculta, nivel) in valores_originais.items():
        linha_destino = linha + deslocamento
        if linha_destino < _PRIMEIRA_LINHA_DADOS:
            continue
        dimensao = ws.row_dimensions[linha_destino]
        dimensao.height = altura
        dimensao.hidden = oculta
        dimensao.outlineLevel = nivel


def _valor_data(valor: date | datetime | None):
    if isinstance(valor, datetime):
        return valor
    return valor


def _data_pagamento_como_texto(valor: datetime | None) -> str | None:
    """Micro-sprint 3F.1 — investigação célula a célula do modelo oficial
    real confirmou que a coluna B (Data de Pagamento) NUNCA armazena uma
    data/serial real: 100% das 1812 linhas de dados têm `data_type='s'`
    (texto), sempre no padrão literal `DD/MM/YYYY HH:MM:SS` — o
    `number_format` da célula é inconsistente entre linhas e irrelevante
    (Excel não aplica number_format a células de texto). Reproduzido aqui
    literalmente, nunca como `datetime`/serial Excel."""
    if valor is None:
        return None
    return valor.strftime("%d/%m/%Y %H:%M:%S")


def _escrever_linha_ocorrencia(
    ws: Worksheet,
    linha: int,
    ordem: OrdemBancaria,
    registros_controle,
) -> float:
    quantidade = resolver_quantidade_diarias(registros_controle)

    ws[f"A{linha}"] = ordem.ob
    ws[f"B{linha}"] = _data_pagamento_como_texto(ordem.data_pagamento)
    ws[f"C{linha}"] = ordem.nome
    ws[f"D{linha}"] = ordem.cargo
    ws[f"E{linha}"] = _valor_data(ordem.periodo_inicial)
    ws[f"F{linha}"] = _valor_data(ordem.periodo_final)
    ws[f"G{linha}"] = ordem.trecho
    ws[f"H{linha}"] = ordem.transporte
    ws[f"I{linha}"] = ordem.motivo
    # Item institucional confirmado (Micro-sprint 3F): valor da passagem não
    # é responsabilidade do DIMCAC — nunca calculado/inferido, sempre o
    # mesmo placeholder já usado pela esmagadora maioria do histórico real.
    ws[f"J{linha}"] = _VALOR_PASSAGEM_PLACEHOLDER
    ws[f"K{linha}"] = quantidade.integral if quantidade else None
    ws[f"L{linha}"] = quantidade.parcial if quantidade else None
    ws[f"M{linha}"] = ordem.valor  # RN02 — sempre o valor bruto da Base OB, zero incluso

    return ordem.valor or 0.0


def _chave_ordenacao(candidato: CandidatoNormal):
    """Ordenação determinística (item 14): por DATA OB (RN05, a mesma
    competência financeira do relatório) e, em caso de empate, por número
    da OB. Investigação empírica contra o relatório histórico real (Micro-
    sprint 3F) não encontrou nenhuma chave única que reproduzisse a ordem
    histórica exatamente (nem OB, nem data de pagamento, isolados) — a
    ordem real parece refletir a sequência de inserção manual ao longo do
    tempo, não uma função pura dos dados. Esta é a ordenação mais próxima e
    100% determinística; divergências de ORDEM (não de conteúdo) contra o
    histórico são esperadas e reportadas como tal."""
    data = candidato.ocorrencia.ordem_bancaria.data_pagamento
    return (data is None, data or datetime.min, candidato.ocorrencia.ordem_bancaria.ob)


def gerar_xlsx_relatorio_transparencia(
    resultado: ResultadoRevisado,
    *,
    caminho_template: str,
    caminho_destino: str,
    ano_exercicio: int,
    mes_referencia: int,
    hoje: date | None = None,
) -> RelatorioGeradoResultado:
    """Gera o XLSX final a partir do template oficial + do resultado já
    revisado pelo backend. G05 aplicado aqui (nunca só no frontend/service
    chamador): `resultado.pode_gerar_relatorio` precisa ser `True`."""
    if not resultado.pode_gerar_relatorio:
        motivos = "; ".join(resultado.motivos_bloqueio) or "revisões pendentes"
        raise RelatorioBloqueadoPorPendencias(
            f"Não é possível gerar o relatório: existem revisões sem decisão válida ({motivos})."
        )

    if not os.path.isfile(caminho_template):
        raise TemplateEstruturalmenteInvalido(f"Template não encontrado: {caminho_template}")

    if os.path.exists(caminho_destino):
        raise DestinoJaExiste(f"Já existe um arquivo no destino: {caminho_destino}")

    candidatos_ordenados = sorted(resultado.candidatos_publicaveis, key=_chave_ordenacao)

    destino_dir = os.path.dirname(os.path.abspath(caminho_destino)) or "."
    os.makedirs(destino_dir, exist_ok=True)

    # Item 17 — escrita segura: gera num temporário na MESMA pasta do
    # destino (garante que o `os.replace` final seja atômico, mesmo
    # sistema de arquivos), nunca deixa um arquivo final parcialmente
    # escrito no destino real.
    descritor_tmp, caminho_tmp = tempfile.mkstemp(suffix=".xlsx", dir=destino_dir)
    os.close(descritor_tmp)
    try:
        shutil.copy2(caminho_template, caminho_tmp)
        workbook = load_workbook(caminho_tmp, data_only=False)
        if _NOME_ABA_DADOS not in workbook.sheetnames:
            raise TemplateEstruturalmenteInvalido(
                f"Aba obrigatória ausente no template: {_NOME_ABA_DADOS!r}"
            )
        ws = workbook[_NOME_ABA_DADOS]

        linha_total_antiga = _localizar_linha_total(ws)
        quantidade_antiga = linha_total_antiga - _PRIMEIRA_LINHA_DADOS
        quantidade_nova = len(candidatos_ordenados)

        colunas_dados = "ABCDEFGHIJKLM"

        if quantidade_nova > quantidade_antiga:
            diferenca = quantidade_nova - quantidade_antiga
            ws.insert_rows(linha_total_antiga, amount=diferenca)
            _realinhar_merges(ws, linha_total_antiga, diferenca)
            _realinhar_alturas_de_linha(ws, linha_total_antiga, diferenca)
            for offset in range(diferenca):
                linha_nova = linha_total_antiga + offset
                _copiar_estilo_linha(ws, _PRIMEIRA_LINHA_DADOS, linha_nova, colunas_dados)
        elif quantidade_nova < quantidade_antiga:
            diferenca = quantidade_antiga - quantidade_nova
            inicio_remocao = _PRIMEIRA_LINHA_DADOS + quantidade_nova
            ws.delete_rows(inicio_remocao, amount=diferenca)
            _realinhar_merges(ws, inicio_remocao + diferenca, -diferenca)
            _realinhar_alturas_de_linha(ws, inicio_remocao + diferenca, -diferenca)

        linha_total_nova = _PRIMEIRA_LINHA_DADOS + quantidade_nova
        ultima_linha_dados = linha_total_nova - 1 if quantidade_nova > 0 else _PRIMEIRA_LINHA_DADOS - 1

        total_valor = 0.0
        for indice, candidato in enumerate(candidatos_ordenados):
            linha = _PRIMEIRA_LINHA_DADOS + indice
            total_valor += _escrever_linha_ocorrencia(
                ws, linha, candidato.ocorrencia.ordem_bancaria, candidato.registros_controle
            )

        # Fórmulas de total — sempre recalculadas para a faixa REAL de
        # dados desta geração (o histórico tinha uma faixa desatualizada,
        # ver relatório da investigação — G01, não reproduzido).
        if quantidade_nova > 0:
            ws[f"J{linha_total_nova}"] = f"=SUM(J{_PRIMEIRA_LINHA_DADOS}:J{ultima_linha_dados})"
            ws[f"M{linha_total_nova}"] = f"=SUM(M{_PRIMEIRA_LINHA_DADOS}:M{ultima_linha_dados})"
        else:
            ws[f"J{linha_total_nova}"] = 0
            ws[f"M{linha_total_nova}"] = 0

        # Título/competência (linha 3) e data de atualização (2 linhas
        # abaixo da linha de totais, mesmo deslocamento do template real).
        mes_nome = _MESES_EXTENSO[mes_referencia - 1]
        ws["A3"] = f"PAGAS ATÉ {mes_nome}/{ano_exercicio}"

        linha_atualizacao = linha_total_nova + 2
        data_referencia = hoje or date.today()
        celula_atualizacao = ws[f"A{linha_atualizacao}"]
        if isinstance(celula_atualizacao.value, str) and celula_atualizacao.value.startswith(
            "Data da última atualização"
        ):
            celula_atualizacao.value = (
                f"Data da última atualização: {data_referencia.strftime('%d.%m.%Y')}"
            )

        # Autofiltro cobre cabeçalho + dados (nunca a área de totais/notas
        # — decisão deliberada desta Micro-sprint, ver relatório).
        if quantidade_nova > 0:
            ws.auto_filter.ref = f"A5:O{ultima_linha_dados}"
        else:
            ws.auto_filter.ref = "A5:O5"

        workbook.save(caminho_tmp)
        workbook.close()

        # Validação mínima antes do replace: reabre o temporário e
        # confere que a aba e a contagem de linhas batem com o esperado —
        # nunca promove um arquivo que não passou por esta checagem.
        validacao = load_workbook(caminho_tmp, data_only=False)
        if _NOME_ABA_DADOS not in validacao.sheetnames:
            raise TemplateEstruturalmenteInvalido("Falha ao validar o arquivo gerado (aba ausente).")
        ws_validacao = validacao[_NOME_ABA_DADOS]
        if quantidade_nova > 0:
            assert ws_validacao[f"A{_PRIMEIRA_LINHA_DADOS}"].value == candidatos_ordenados[0].ocorrencia.ordem_bancaria.ob
        validacao.close()

        os.replace(caminho_tmp, caminho_destino)
    finally:
        if os.path.exists(caminho_tmp):
            os.remove(caminho_tmp)

    return RelatorioGeradoResultado(
        caminho_arquivo=caminho_destino,
        total_ocorrencias=quantidade_nova,
        total_valor_diarias=total_valor,
        primeira_linha_dados=_PRIMEIRA_LINHA_DADOS,
        ultima_linha_dados=ultima_linha_dados,
        linha_total=linha_total_nova,
    )
