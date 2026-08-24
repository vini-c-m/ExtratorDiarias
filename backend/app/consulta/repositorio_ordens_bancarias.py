"""Micro-sprint 1 (Relatório de Diárias — Portal da Transparência) — leitura
isolada da Base de Ordens Bancárias, sem nenhuma regra de negócio de
reconciliação (R01-R10, ainda não implementadas). Só recebe/valida/lê/
normaliza; nunca decide se uma OB deve ou não ser publicada.

Diferente de `repositorio_diarias.py`/`repositorio_servidores.py`, que leem
uma aba do Controle de Diárias (arquivo controlado por este próprio
projeto, com nome de aba e posição de coluna estáveis), a Base de Ordens
Bancárias é um export de um sistema externo — a posição das colunas e o
nome da aba não são garantia estável. Por isso a leitura aqui resolve
colunas por **nome do cabeçalho** (normalizado), não por letra fixa, e a
validação estrutural (`validar_estrutura`) é uma condição de entrada
explícita, não uma suposição.

Achado real da auditoria (arquivo real de referência,
`base de dados 2 ORDENS BANCARIAS.xlsx`): o mesmo arquivo tem
'QUANT. DIÁRIA INTEGRAL' (com espaço após o ponto) e 'QUANT.DIÁRIA PARCIAL'
(sem espaço) — inconsistência de digitação na própria fonte. `_chave_cabecalho`
normaliza removendo todo espaço em branco antes de comparar, para não
tratar isso como "coluna ausente"."""

import logging
import os
import re
from dataclasses import dataclass, field
from datetime import date, datetime

from openpyxl import load_workbook
from openpyxl.workbook.workbook import Workbook
from openpyxl.worksheet.worksheet import Worksheet

from app.consulta.repositorio_diarias import (
    _como_data,  # noqa: PLC2701 — mesmo reuso já praticado em repositorio_tabela_valores.py
    _dividir_trecho,  # noqa: PLC2701
    _valor_como_numero,  # noqa: PLC2701
)
from app.domain.entities.aviso_linha_ignorada import AvisoLinhaIgnorada
from app.domain.entities.ordem_bancaria import OrdemBancaria
from app.planilha.escritor_planilha import _cpf_normalizado  # noqa: PLC2701 — nunca duplicar a normalização de CPF já homologada

__all__ = [
    "RUBRICAS_OBRIGATORIAS",
    "OrdensBancariasEstruturalmenteInvalida",
    "ResultadoLeituraOrdensBancarias",
    "abrir_base_ordens_bancarias",
    "ordens_bancarias_por_dh",
    "validar_estrutura",
]

_logger = logging.getLogger(__name__)

# Rótulos exigidos no cabeçalho (linha 1) da Base de Ordens Bancárias, na
# forma como aparecem na fonte real — a comparação em si é sempre feita via
# `_chave_cabecalho` (normalizada), nunca por igualdade literal.
RUBRICAS_OBRIGATORIAS = (
    "DH",
    "OB",
    "SITUAÇÃO",
    "DATA OB",
    "SEI",
    "CPF",
    "NOME",
    "CARGO",
    "PERÍODO INICIAL",
    "PERÍODO FINAL",
    "TRECHO",
    "TRANSPORTE",
    "MOTIVO",
    "VALOR DA DIÁRIA",
    "RESTITUIÇÃO",
    "DUPLICIDADE",
    "ITEM DE GASTO",
)


class OrdensBancariasEstruturalmenteInvalida(Exception):
    """Erro estrutural que impede leitura confiável: arquivo ausente,
    extensão errada, workbook corrompido/bloqueado, ou colunas obrigatórias
    ausentes na aba lida. Nunca é uma decisão de regra de negócio (isso é o
    motor de reconciliação, fora do escopo desta Micro-sprint) — só
    sinaliza que a Base de Ordens Bancárias fornecida não tem o mínimo
    necessário para ser lida com confiança. A mensagem já é adequada para
    exibição direta ao usuário (mesmo padrão de `PlanilhaInvalida`,
    `app/infra/config/configuracao_app.py`)."""


@dataclass(frozen=True)
class ResultadoLeituraOrdensBancarias:
    """Mesma filosofia de `ResultadoDiariasCompletas`
    (`app/consulta/repositorio_diarias.py`): `avisos` é um superconjunto de
    `linhas_ignoradas` — inclui também linhas mantidas em `por_dh` cujo
    trecho/valor/restituição não pôde ser totalmente interpretado (dado
    degradado nunca é silenciado, mesmo quando a linha não é descartada).

    `por_dh` agrupa por DH preservando **todas** as OBs lidas, na ordem em
    que aparecem na planilha — nunca deduplicado por número de OB nem por
    campo DUPLICIDADE: essa decisão pertence ao motor de reconciliação
    (R04), não a esta leitura."""

    por_dh: dict[str, list[OrdemBancaria]] = field(default_factory=dict)
    avisos: list[AvisoLinhaIgnorada] = field(default_factory=list)
    linhas_ignoradas: int = 0


def _chave_cabecalho(texto: object) -> str:
    """Normaliza um rótulo de cabeçalho para comparação: remove todo espaço
    em branco e converte para maiúsculas. Deliberadamente não remove
    acentos — os rótulos reais e os exigidos usam a mesma acentuação, só a
    presença/ausência de espaço diverge entre eles."""
    return re.sub(r"\s+", "", str(texto or "")).upper()


def validar_estrutura(planilha: Worksheet) -> None:
    """Confere só que as colunas de `RUBRICAS_OBRIGATORIAS` existem no
    cabeçalho (linha 1) — comparação por nome normalizado, nunca por
    posição: ver docstring do módulo sobre por que a Base OB não pode ser
    lida por letra fixa de coluna, ao contrário do Controle de Diárias."""
    cabecalho = next(planilha.iter_rows(min_row=1, max_row=1, values_only=True), ())
    presentes = {_chave_cabecalho(valor) for valor in cabecalho if valor}
    faltantes = [
        rotulo for rotulo in RUBRICAS_OBRIGATORIAS if _chave_cabecalho(rotulo) not in presentes
    ]
    if faltantes:
        raise OrdensBancariasEstruturalmenteInvalida(
            "Base de Ordens Bancárias: colunas obrigatórias ausentes no "
            f"cabeçalho — {', '.join(faltantes)}"
        )


def _selecionar_aba(workbook: Workbook) -> Worksheet:
    """A Base OB real de referência tem uma única aba, com o nome genérico
    'Sheet1' (nome de exportação, não escolhido por ninguém) — não é seguro
    exigir esse nome literal como estrutura obrigatória. Se houver só uma
    aba, usa-a; se houver mais de uma, usa a primeira cujo cabeçalho
    satisfaça `RUBRICAS_OBRIGATORIAS`."""
    abas = workbook.worksheets
    if len(abas) == 1:
        return abas[0]
    for aba in abas:
        try:
            validar_estrutura(aba)
        except OrdensBancariasEstruturalmenteInvalida:
            continue
        return aba
    raise OrdensBancariasEstruturalmenteInvalida(
        "Nenhuma aba do arquivo tem as colunas mínimas exigidas da Base de "
        "Ordens Bancárias."
    )


def abrir_base_ordens_bancarias(caminho: str) -> Worksheet:
    """Abre e valida um arquivo `.xlsx` de Base de Ordens Bancárias,
    devolvendo a `Worksheet` pronta para `ordens_bancarias_por_dh`. Mesma
    ordem de checagem de `configuracao_app.validar_planilha` (existência →
    extensão → abertura → estrutura), mas sem fingerprint estrutural — a
    Base OB é um arquivo novo a cada competência, não uma configuração
    estável (decisão confirmada com o usuário: nenhuma persistência de
    caminho neste momento).

    `read_only=True` (leitura sequencial, arquivo pode ter milhares de
    linhas) e `data_only=True` (queremos o valor já calculado da célula,
    nunca o texto de uma fórmula — ao contrário do Controle de Diárias,
    a Base OB é um export de outro sistema, sem o mecanismo de
    preservação de cache de fórmula que `escritor_planilha` mantém para a
    Planilha Oficial)."""
    if not os.path.isfile(caminho):
        raise OrdensBancariasEstruturalmenteInvalida(f"Arquivo não encontrado: {caminho}")
    if not caminho.lower().endswith(".xlsx"):
        raise OrdensBancariasEstruturalmenteInvalida(
            "Formato não suportado — selecione um arquivo .xlsx"
        )
    try:
        workbook = load_workbook(caminho, read_only=True, data_only=True)
    except Exception as erro:  # abrangente de propósito — qualquer falha de
        # leitura (arquivo corrompido, senha, permissão) vira o mesmo erro
        # estrutural explícito, nunca uma exceção genérica não tratada.
        raise OrdensBancariasEstruturalmenteInvalida(
            "Não foi possível abrir a Base de Ordens Bancárias — arquivo "
            f"corrompido ou bloqueado ({erro})"
        ) from erro

    planilha = _selecionar_aba(workbook)
    validar_estrutura(planilha)
    return planilha


def _indice_colunas(planilha: Worksheet) -> dict[str, int]:
    """Cabeçalho (linha 1) → posição (0-based) na tupla de valores que
    `iter_rows(values_only=True)` devolve por linha. Resolvido uma única vez
    por leitura, nunca por linha de dado."""
    cabecalho = next(planilha.iter_rows(min_row=1, max_row=1, values_only=True), ())
    return {_chave_cabecalho(valor): posicao for posicao, valor in enumerate(cabecalho) if valor}


def _campo(valores: tuple, indice: dict[str, int], rotulo: str) -> object:
    posicao = indice.get(_chave_cabecalho(rotulo))
    if posicao is None or posicao >= len(valores):
        return None
    return valores[posicao]


def _texto_ou_none(valor: object) -> str | None:
    texto = str(valor or "").strip()
    return texto or None


_PADRAO_DATA_HORA = re.compile(r"^(\d{2})/(\d{2})/(\d{4})[ T](\d{2}):(\d{2}):(\d{2})$")


def _data_pagamento_como_datetime(valor: object) -> datetime | None:
    """A coluna DATA OB, na Base OB real, vem como **texto**
    (`'12/05/2026 08:38:14'`), não como `datetime` do openpyxl — ao
    contrário de PERÍODO INICIAL/FINAL, que vêm como data de verdade na
    esmagadora maioria das linhas. Nunca propaga exceção: texto fora desse
    formato (ou vazio) vira `None`, mesma filosofia de `_como_data`."""
    if isinstance(valor, datetime):
        return valor
    if isinstance(valor, date):
        return datetime(valor.year, valor.month, valor.day)
    texto = str(valor or "").strip()
    if not texto:
        return None
    correspondencia = _PADRAO_DATA_HORA.match(texto)
    if not correspondencia:
        return None
    dia, mes, ano, hora, minuto, segundo = (int(grupo) for grupo in correspondencia.groups())
    try:
        return datetime(ano, mes, dia, hora, minuto, segundo)
    except ValueError:
        return None


def _e_placeholder_vazio(bruto: object) -> bool:
    """Achado real da auditoria: a Base OB usa o traço isolado (`'-'`) como
    convenção da própria fonte para "não se aplica"/"sem valor" em vários
    campos numéricos (RESTITUIÇÃO, VALOR DA PASSAGEM, DMTC, DMOF...) — na
    quase totalidade das ~1800 linhas reais, não é uma exceção pontual.
    Tratar como ausência (nunca gera aviso), não como dado ilegível —
    equivalente a célula vazia, não a um valor malformado."""
    return isinstance(bruto, str) and bruto.strip() == "-"


def _numero_com_aviso(
    bruto: object,
    *,
    rotulo: str,
    linha: int,
    aba: str,
    avisos: list[AvisoLinhaIgnorada],
) -> float | None:
    """Envolve `_valor_como_numero`: quando a célula tem conteúdo mas não é
    reconhecível como número (texto sem relação com valor, erro de fórmula
    propagado — achados reais já catalogados na auditoria), registra um
    aviso em vez de deixar o `None` passar em silêncio. Célula vazia
    (`bruto` em `(None, "")`) ou com o placeholder `'-'` da própria fonte
    (`_e_placeholder_vazio`) nunca gera aviso — ausência não é o mesmo que
    dado ilegível."""
    if _e_placeholder_vazio(bruto):
        return None
    numero = _valor_como_numero(bruto)
    if numero is None and bruto not in (None, ""):
        avisos.append(
            AvisoLinhaIgnorada(
                aba=aba,
                linha=linha,
                motivo=f"{rotulo} não reconhecido(a) como número: {bruto!r}",
            )
        )
    return numero


def ordens_bancarias_por_dh(planilha: Worksheet) -> ResultadoLeituraOrdensBancarias:
    """Lê toda a Base de Ordens Bancárias já aberta (recebe a `Worksheet`,
    nunca o caminho — mesmo padrão de `repositorio_diarias.diarias_completas`)
    e agrupa por DH, preservando 1 DH → N OBs.

    As únicas duas condições que descartam uma linha por completo são DH
    ausente e OB ausente (as duas metades da chave de negócio, sem as quais
    a linha não pode ser posicionada em lugar nenhum); qualquer outro campo
    malformado mantém a linha em `por_dh`, com o problema registrado em
    `avisos` — nenhuma linha desaparece silenciosamente, e um erro em um
    campo não invalida os demais campos daquela mesma linha."""
    validar_estrutura(planilha)
    indice = _indice_colunas(planilha)
    aba = planilha.title or ""

    por_dh: dict[str, list[OrdemBancaria]] = {}
    avisos: list[AvisoLinhaIgnorada] = []
    linhas_ignoradas = 0

    for numero_linha, valores in enumerate(
        planilha.iter_rows(min_row=2, values_only=True), start=2
    ):
        dh = _texto_ou_none(_campo(valores, indice, "DH"))
        ob = _texto_ou_none(_campo(valores, indice, "OB"))
        if dh is None or ob is None:
            motivo = "DH ausente" if dh is None else "OB ausente"
            avisos.append(AvisoLinhaIgnorada(aba=aba, linha=numero_linha, motivo=motivo))
            linhas_ignoradas += 1
            _logger.warning("Linha %s de '%s' ignorada: %s", numero_linha, aba, motivo)
            continue

        cpf_bruto = _campo(valores, indice, "CPF")
        cpf = _cpf_normalizado(cpf_bruto) or None if cpf_bruto not in (None, "") else None

        periodo_inicial = _como_data(_campo(valores, indice, "PERÍODO INICIAL"))
        periodo_final = _como_data(_campo(valores, indice, "PERÍODO FINAL"))

        trecho_bruto = _texto_ou_none(_campo(valores, indice, "TRECHO"))
        cidade_origem: str | None = None
        cidade_destino: str | None = None
        if trecho_bruto:
            cidade_origem, cidade_destino = _dividir_trecho(trecho_bruto)
            if cidade_origem is None:
                avisos.append(
                    AvisoLinhaIgnorada(
                        aba=aba,
                        linha=numero_linha,
                        motivo=f"Trecho não separável em origem/destino: {trecho_bruto!r}",
                    )
                )

        valor = _numero_com_aviso(
            _campo(valores, indice, "VALOR DA DIÁRIA"),
            rotulo="Valor da diária",
            linha=numero_linha,
            aba=aba,
            avisos=avisos,
        )
        restituicao = _numero_com_aviso(
            _campo(valores, indice, "RESTITUIÇÃO"),
            rotulo="Restituição",
            linha=numero_linha,
            aba=aba,
            avisos=avisos,
        )
        # BRUTO SEM FORMULA é opcional (nem toda Base OB precisa ter essa
        # coluna) — se ausente, `_campo` já devolve `None`, e um `None` não
        # reconhecido como número aqui nunca gera aviso próprio (o valor
        # financeiro de referência é sempre "Valor da diária", não este).
        valor_bruto_sem_formula = _valor_como_numero(_campo(valores, indice, "BRUTO SEM FORMULA"))

        por_dh.setdefault(dh, []).append(
            OrdemBancaria(
                linha=numero_linha,
                dh=dh,
                ob=ob,
                credor=_texto_ou_none(_campo(valores, indice, "CREDOR")),
                situacao=_texto_ou_none(_campo(valores, indice, "SITUAÇÃO")),
                data_pagamento=_data_pagamento_como_datetime(_campo(valores, indice, "DATA OB")),
                sei=_texto_ou_none(_campo(valores, indice, "SEI")),
                cpf=cpf,
                nome=_texto_ou_none(_campo(valores, indice, "NOME")),
                cargo=_texto_ou_none(_campo(valores, indice, "CARGO")),
                periodo_inicial=periodo_inicial,
                periodo_final=periodo_final,
                cidade_origem=cidade_origem,
                cidade_destino=cidade_destino,
                transporte=_texto_ou_none(_campo(valores, indice, "TRANSPORTE")),
                motivo=_texto_ou_none(_campo(valores, indice, "MOTIVO")),
                valor=valor,
                valor_bruto_sem_formula=valor_bruto_sem_formula,
                restituicao=restituicao,
                duplicidade=_texto_ou_none(_campo(valores, indice, "DUPLICIDADE")),
                item_de_gasto=_texto_ou_none(_campo(valores, indice, "ITEM DE GASTO")),
                trecho=trecho_bruto,
            )
        )

    return ResultadoLeituraOrdensBancarias(por_dh=por_dh, avisos=avisos, linhas_ignoradas=linhas_ignoradas)
