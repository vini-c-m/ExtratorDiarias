"""Cadastro de servidor/membro na aba `Dados` da Planilha Oficial, a partir
da Central de Conferência (RN-11 preservada: este módulo é o único ponto de
escrita desta feature — `app/api/conferencia.py` continua 100% leitura).

Isolado de `escritor_planilha.py` (que continua exclusivo de `Controle de
Diárias`, sem nenhuma alteração): a captura/reinjeção de cache de fórmulas é
genérica por construção (recebe `workbook`/`caminho_planilha` como
parâmetro, varre todas as abas), então este módulo reaproveita as duas
funções por import cross-module — mesmo padrão já usado neste projeto para
`_cpf_normalizado` (5 módulos diferentes) — em vez de mover/duplicar código
já homologado pela correção P0 de integridade financeira.
"""

import os
import re
import threading
import unicodedata
from copy import copy
from dataclasses import dataclass
from enum import Enum

from openpyxl import load_workbook
from openpyxl.worksheet.worksheet import Worksheet

from app.planilha.escritor_planilha import (  # noqa: PLC2701 — reuso deliberado, ver docstring do módulo
    _capturar_cache_formulas,
    _cpf_normalizado,
    _reinjetar_cache_formulas,
)

NOME_ABA = "Dados"
PRIMEIRA_LINHA_DADOS = 2

# Mesmo layout já lido por `app/consulta/repositorio_servidores.py` — este
# módulo escreve exatamente as mesmas 8 colunas, nunca outras.
COLUNA_CPF = "A"
COLUNA_MATRICULA = "B"
COLUNA_NOME = "C"
COLUNA_PREVIDENCIA = "D"
COLUNA_CARGO = "E"
COLUNA_ORGAO_ORIGEM = "F"
COLUNA_REGIME_PREVIDENCIA = "G"
COLUNA_SITUACAO = "H"

# Auditoria real (2026-08-10) contra a Planilha Oficial hoje configurada:
# MATRÍCULA (coluna B) usa o mesmo `number_format` Excel em 1622/1622
# linhas — "000000\-0" (dígitos + hífen antes do último dígito), 100% de
# consistência, nenhuma exceção. Nunca uma máscara inventada: só o
# `number_format` já usado pelos registros reais, aplicado ao valor
# numérico puro — mesmo princípio já usado para CPF logo abaixo (só o
# número, nunca o hífen embutido no texto/valor em si). A quantidade de
# dígitos varia legitimamente entre registros reais (6/7/8 observados, 7 é
# o mais comum) — nunca força uma quantidade fixa.
_NUMBER_FORMAT_MATRICULA = "000000\\-0"
# Mesmo literal já usado por `_escrever_linha_dados` para CPF (coluna A) —
# extraído para constante só para `_reordenar_dados_por_nome` reaplicar
# exatamente o mesmo valor a QUALQUER linha reordenada, sem depender do
# `number_format` que porventura já estivesse na linha de referência (que,
# ao contrário do arquivo real, pode nunca ter sido definido em fixtures
# de teste sintéticas).
_NUMBER_FORMAT_CPF = "00000000000"

# Auditoria real contra a Planilha Oficial hoje configurada (1624 linhas de
# dado, zero lacunas em A) — ao contrário de `Controle de Diárias` (que usa
# a coluna B por causa de lacunas reais em A), aqui A é um indicador seguro
# de "linha ocupada".
_COLUNA_LINHA_LIVRE = COLUNA_CPF

# Protege a sequência inteira de leitura+escrita (checar duplicidade,
# localizar próxima linha livre, salvar, promover) contra duas chamadas
# concorrentes de cadastro colidindo na mesma linha livre — sem isso, duas
# requisições quase simultâneas poderiam escrever CPFs diferentes na mesma
# linha, e a segunda a promover apagaria a primeira (nenhuma delas seria
# duplicidade de CPF, então a checagem de duplicidade sozinha não pega esse
# caso).
_LOCK_ESCRITA_DADOS = threading.Lock()


class EstadoCadastro(str, Enum):
    SALVO = "salvo"
    DUPLICADO = "duplicado"
    NAO_SALVO = "nao_salvo"


@dataclass(frozen=True)
class ResultadoCadastroDados:
    estado: EstadoCadastro
    linha: int | None = None
    cpf_normalizado: str | None = None
    mensagem: str | None = None


def cadastrar_servidor(
    caminho_planilha: str,
    *,
    cpf: str,
    nome: str,
    matricula: str,
    cargo: str,
    previdencia: str | None = None,
    orgao_origem: str | None = None,
    regime_previdencia: str | None = None,
    situacao: str | None = None,
) -> ResultadoCadastroDados:
    """Grava uma nova linha na aba `Dados`, com escrita atômica: o arquivo
    original nunca é aberto em modo escrita — tudo é salvo primeiro num
    arquivo temporário no mesmo diretório (mesmo volume, para o
    `os.replace` final ser atômico de verdade), validado, e só então
    promovido sobre o original. Qualquer falha antes da promoção deixa o
    original intocado — nunca um cadastro parcial."""
    cpf_normalizado = _cpf_normalizado(cpf)

    with _LOCK_ESCRITA_DADOS:
        workbook = load_workbook(caminho_planilha)
        try:
            aba_dados = workbook[NOME_ABA]

            linha_existente = _cpf_ja_cadastrado(aba_dados, cpf_normalizado)
            if linha_existente is not None:
                return ResultadoCadastroDados(
                    estado=EstadoCadastro.DUPLICADO,
                    linha=linha_existente,
                    cpf_normalizado=cpf_normalizado,
                    mensagem="Este CPF já está cadastrado na aba Dados.",
                )

            linha = _localizar_proxima_linha_livre_dados(aba_dados)
            _escrever_linha_dados(
                aba_dados,
                linha,
                cpf_normalizado=cpf_normalizado,
                nome=nome,
                matricula=matricula,
                cargo=cargo,
                previdencia=previdencia,
                orgao_origem=orgao_origem,
                regime_previdencia=regime_previdencia,
                situacao=situacao,
            )

            # Ordena a região cadastral real (2..`linha`, nunca o cabeçalho
            # nem nada além) por NOME (coluna C), A→Z, movendo a LINHA
            # INTEIRA — item 4 do pedido "Ajuste Funcional + UX". Sempre
            # ANTES da captura de cache abaixo: como a aba `Dados` em si
            # nunca tem fórmula nenhuma (só `Controle de Diárias` tem, e
            # aquelas fazem VLOOKUP por VALOR de CPF, nunca por posição de
            # linha — reordenar `Dados` não invalida nenhum cache
            # capturado ali), a ordem entre os dois passos não afeta a
            # integridade do cache, só precisa vir antes da validação
            # abaixo (que agora procura o CPF em vez de assumir uma linha
            # fixa, já que a reordenação pode ter movido a linha nova).
            _reordenar_dados_por_nome(aba_dados, PRIMEIRA_LINHA_DADOS, linha)

            # Lê o cache de TODA fórmula pré-existente (qualquer aba) do
            # ORIGINAL, ainda intocado no disco neste ponto — mesma
            # sequência já homologada em `escritor_planilha.preencher`.
            cache_formulas = _capturar_cache_formulas(workbook, caminho_planilha)

            caminho_tmp = _caminho_temporario(caminho_planilha)
            try:
                workbook.save(caminho_tmp)
            except Exception:
                _remover_tmp_se_existir(caminho_tmp)
                return ResultadoCadastroDados(
                    estado=EstadoCadastro.NAO_SALVO,
                    cpf_normalizado=cpf_normalizado,
                    mensagem="Não foi possível salvar o cadastro na Planilha Oficial.",
                )
        finally:
            workbook.close()

        try:
            _reinjetar_cache_formulas(caminho_tmp, cache_formulas)
        except Exception:
            _remover_tmp_se_existir(caminho_tmp)
            return ResultadoCadastroDados(
                estado=EstadoCadastro.NAO_SALVO,
                cpf_normalizado=cpf_normalizado,
                mensagem="Não foi possível preservar os valores calculados da Planilha Oficial durante o cadastro.",
            )

        linha_final = _validar_tmp(caminho_tmp, cpf_normalizado, cache_formulas)
        if linha_final is None:
            _remover_tmp_se_existir(caminho_tmp)
            return ResultadoCadastroDados(
                estado=EstadoCadastro.NAO_SALVO,
                cpf_normalizado=cpf_normalizado,
                mensagem="A validação do cadastro falhou antes de substituir a Planilha Oficial.",
            )

        try:
            os.replace(caminho_tmp, caminho_planilha)
        except OSError:
            _remover_tmp_se_existir(caminho_tmp)
            return ResultadoCadastroDados(
                estado=EstadoCadastro.NAO_SALVO,
                cpf_normalizado=cpf_normalizado,
                mensagem="Não foi possível substituir a Planilha Oficial pelo arquivo atualizado.",
            )

    return ResultadoCadastroDados(estado=EstadoCadastro.SALVO, linha=linha_final, cpf_normalizado=cpf_normalizado)


def _caminho_temporario(caminho_planilha: str) -> str:
    """Mantém a extensão original (`.xlsx`) no nome do temporário —
    `openpyxl.load_workbook` valida a extensão do arquivo e rejeita `.tmp`
    puro (usado pela validação em `_validar_tmp`, que reabre o temporário
    antes de promovê-lo)."""
    diretorio = os.path.dirname(caminho_planilha) or "."
    nome_base = os.path.basename(caminho_planilha)
    raiz, extensao = os.path.splitext(nome_base)
    return os.path.join(diretorio, f".{raiz}.cadastro.tmp{extensao}")


def _remover_tmp_se_existir(caminho_tmp: str) -> None:
    try:
        if os.path.exists(caminho_tmp):
            os.remove(caminho_tmp)
    except OSError:
        pass


def _localizar_proxima_linha_livre_dados(planilha: Worksheet) -> int:
    linha = PRIMEIRA_LINHA_DADOS
    while planilha[f"{_COLUNA_LINHA_LIVRE}{linha}"].value not in (None, ""):
        linha += 1
    return linha


def _cpf_ja_cadastrado(planilha: Worksheet, cpf_normalizado: str) -> int | None:
    for linha in range(PRIMEIRA_LINHA_DADOS, planilha.max_row + 1):
        valor = planilha[f"{COLUNA_CPF}{linha}"].value
        if valor in (None, ""):
            continue
        if _cpf_normalizado(valor) == cpf_normalizado:
            return linha
    return None


def _escrever_linha_dados(
    planilha: Worksheet,
    linha: int,
    *,
    cpf_normalizado: str,
    nome: str,
    matricula: str,
    cargo: str,
    previdencia: str | None,
    orgao_origem: str | None,
    regime_previdencia: str | None,
    situacao: str | None,
) -> None:
    """Escreve SOMENTE as 8 células desta linha (A-H) — nenhuma outra
    célula/linha/aba é tocada. CPF gravado como número com máscara de zeros
    à esquerda, mesmo padrão já usado para a coluna D de `Controle de
    Diárias` (`escritor_planilha._escrever_celula(..., cpf=True)`) — a
    base real mistura `int`/`str` na coluna A, então isso é seguro; a
    leitura sempre renormaliza via `_cpf_normalizado`."""
    celula_cpf = planilha[f"{COLUNA_CPF}{linha}"]
    celula_cpf.value = int(cpf_normalizado)
    celula_cpf.number_format = _NUMBER_FORMAT_CPF

    celula_matricula = planilha[f"{COLUNA_MATRICULA}{linha}"]
    digitos_matricula = _matricula_normalizada(matricula)
    if digitos_matricula:
        celula_matricula.value = int(digitos_matricula)
        celula_matricula.number_format = _NUMBER_FORMAT_MATRICULA
    else:
        # Nunca deveria acontecer (matrícula é obrigatória e só dígitos são
        # esperados) — mas nunca quebra: grava o texto bruto em vez de
        # tentar `int("")`.
        celula_matricula.value = matricula

    planilha[f"{COLUNA_NOME}{linha}"] = nome
    planilha[f"{COLUNA_CARGO}{linha}"] = cargo
    if previdencia:
        planilha[f"{COLUNA_PREVIDENCIA}{linha}"] = previdencia
    if orgao_origem:
        planilha[f"{COLUNA_ORGAO_ORIGEM}{linha}"] = orgao_origem
    if regime_previdencia:
        planilha[f"{COLUNA_REGIME_PREVIDENCIA}{linha}"] = regime_previdencia
    if situacao:
        planilha[f"{COLUNA_SITUACAO}{linha}"] = situacao


def _validar_tmp(
    caminho_tmp: str,
    cpf_normalizado: str,
    cache_formulas: dict[str, dict[str, object]],
) -> int | None:
    """Nunca assume sucesso só porque o arquivo temporário existe: reabre
    para confirmar que o CPF novo foi de fato gravado (e que TODO valor de
    cache capturado antes de salvar — qualquer aba, inclusive `Controle de
    Diárias` — ainda está presente depois da reinjeção, nunca só uma
    amostra), devolvendo a linha em que o CPF foi encontrado — ou `None`
    se a validação falhar em qualquer ponto.

    Busca o CPF em vez de checar uma linha fixa: `_reordenar_dados_por_nome`
    (chamada antes deste ponto, ainda dentro de `cadastrar_servidor`) pode
    ter movido a linha recém-gravada para qualquer posição da região
    cadastral — a linha onde a escrita ACONTECEU deixou de ser a linha
    onde o registro efetivamente FICA."""
    try:
        workbook = load_workbook(caminho_tmp)
        try:
            aba_dados = workbook[NOME_ABA]
            linha_encontrada = _cpf_ja_cadastrado(aba_dados, cpf_normalizado)
            if linha_encontrada is None:
                return None
        finally:
            workbook.close()

        if cache_formulas:
            workbook_valores = load_workbook(caminho_tmp, data_only=True)
            try:
                for nome_aba, celulas in cache_formulas.items():
                    aba_valores = workbook_valores[nome_aba]
                    for referencia, valor_esperado in celulas.items():
                        if aba_valores[referencia].value != valor_esperado:
                            return None
            finally:
                workbook_valores.close()
    except Exception:
        return None

    return linha_encontrada


def _matricula_normalizada(matricula: str) -> str:
    """Extrai só os dígitos digitados/colados (mesmo padrão de
    `_cpf_normalizado`) — a formatação real da coluna B (hífen antes do
    último dígito) nunca é escrita no valor em si, só aplicada via
    `number_format` da célula (`_NUMBER_FORMAT_MATRICULA`)."""
    return re.sub(r"\D", "", matricula or "")


def _chave_ordenacao_nome(nome: object) -> str:
    """Chave de ordenação alfabética (A→Z) acento-insensível: decompõe
    (Unicode NFD) e descarta os sinais diacríticos (categoria Unicode
    "Mn" — marca de combinação), nunca depende de locale do sistema
    operacional (frágil/inconsistente entre máquinas/SO) — "Álvaro" ordena
    junto de "Alvaro"/"Ana", nunca isolado depois de "Zélia"."""
    texto = str(nome or "").strip().upper()
    decomposto = unicodedata.normalize("NFD", texto)
    return "".join(caractere for caractere in decomposto if unicodedata.category(caractere) != "Mn")


_TOTAL_COLUNAS_DADOS = 8  # A-H — mesmas 8 colunas sempre lidas/escritas por este módulo.


def _reordenar_dados_por_nome(planilha: Worksheet, primeira_linha: int, ultima_linha: int) -> None:
    """Ordena A→Z por NOME (coluna C) a região cadastral real — SÓ
    `primeira_linha..ultima_linha` (nunca o cabeçalho, nunca nada além:
    auditoria 2026-08-10 confirmou a região logo depois da última linha
    genuinamente vazia, sem subtotal/nota/estrutura nenhuma) — movendo a
    LINHA INTEIRA (as 8 colunas juntas, nunca só o nome sozinho).

    Implementado como reescrita de VALORES numa faixa fixa de linhas, não
    como movimentação de objetos `Cell`/linha do `openpyxl` (sem API
    nativa de "mover linha" preservando estilo). O estilo (fonte, borda,
    preenchimento, `number_format`) é reaplicado explicitamente a partir
    da linha de referência (`primeira_linha`, sempre íntegra na Planilha
    Oficial real) a CADA linha reescrita — nunca herdado do que já estava
    naquela posição: a linha recém-inserida pode ser totalmente nova (sem
    nenhum estilo ainda) ou pode acabar na posição de uma linha antiga já
    com estilo inconsistente (achado real da auditoria: a última linha
    hoje ocupada tem `number_format`/borda diferentes de todo o resto) —
    nos dois casos, o resultado fica visualmente idêntico aos demais
    registros depois da reordenação."""
    registros = [
        [planilha.cell(row=linha, column=coluna).value for coluna in range(1, _TOTAL_COLUNAS_DADOS + 1)]
        for linha in range(primeira_linha, ultima_linha + 1)
    ]
    registros.sort(key=lambda registro: _chave_ordenacao_nome(registro[2]))  # índice 2 = coluna C (NOME)

    # `number_format` de CPF/MATRÍCULA (colunas A/B) nunca vem da linha de
    # referência — usa sempre as constantes auditadas (`_NUMBER_FORMAT_CPF`/
    # `_NUMBER_FORMAT_MATRICULA`), as mesmas já aplicadas por
    # `_escrever_linha_dados`. Isso evita depender da linha de referência já
    # estar corretamente formatada (verdade na Planilha Oficial real, mas
    # não em fixtures sintéticas de teste que nunca setam `number_format`
    # explicitamente) — fonte/borda/preenchimento continuam vindo da linha
    # de referência (puramente visual, sem um "valor certo" a preservar).
    _NUMBER_FORMAT_POR_COLUNA = {1: _NUMBER_FORMAT_CPF, 2: _NUMBER_FORMAT_MATRICULA}

    # `cell.font`/`.border`/`.fill`/`.alignment` devolvem um `StyleProxy`
    # (view somente-leitura presa à célula original) — atribuir esse proxy
    # direto a OUTRA célula quebra (`TypeError: unhashable type:
    # 'StyleProxy'`, dedupe interno de estilos do openpyxl). `copy()` (o
    # jeito documentado pelo próprio openpyxl de "copiar o estilo de uma
    # célula para outra") devolve um objeto de estilo real e independente.
    estilos_referencia = []
    for coluna in range(1, _TOTAL_COLUNAS_DADOS + 1):
        celula_referencia = planilha.cell(row=primeira_linha, column=coluna)
        estilos_referencia.append(
            {
                "font": copy(celula_referencia.font),
                "border": copy(celula_referencia.border),
                "fill": copy(celula_referencia.fill),
                "alignment": copy(celula_referencia.alignment),
                "number_format": _NUMBER_FORMAT_POR_COLUNA.get(coluna, celula_referencia.number_format),
            }
        )

    for indice_linha, valores in enumerate(registros):
        linha_destino = primeira_linha + indice_linha
        for indice_coluna, valor in enumerate(valores):
            celula = planilha.cell(row=linha_destino, column=indice_coluna + 1)
            celula.value = valor
            estilo = estilos_referencia[indice_coluna]
            celula.font = estilo["font"]
            celula.border = estilo["border"]
            celula.fill = estilo["fill"]
            celula.alignment = estilo["alignment"]
            celula.number_format = estilo["number_format"]
