import os
from dataclasses import dataclass
from enum import Enum

from openpyxl import load_workbook

from app.domain.rules.finalizacao_diarias import AvaliacaoElegibilidade, avaliar
from app.extraction import pdf_reader
from app.extraction.parsers.parser_factory import obter_parser
from app.planilha.escritor_planilha import NOME_ABA
from app.planilha.finalizador_planilha import (
    CandidatoLinhaFinalizacao,
    EstadoLinhaFinalizacao,
    gravar_finalizacao,
    localizar_candidatos,
)


class ErroFinalizacaoDiarias(Exception):
    pass


class StatusFinalizacao(str, Enum):
    PRONTO = "pronto"
    SEM_COMPROVANTE = "sem_comprovante"
    SEM_CONFIRMACAO = "sem_confirmacao"
    SEI_NAO_EXTRAIDO = "sei_nao_extraido"
    SEI_NAO_ENCONTRADO = "sei_nao_encontrado"
    JA_FINALIZADO = "ja_finalizado"
    ESTADO_PARCIAL = "estado_parcial"
    ERRO_LEITURA = "erro_leitura"


_MENSAGENS_LINHA = {
    StatusFinalizacao.SEI_NAO_ENCONTRADO: "SEI não localizado na Planilha Oficial.",
    StatusFinalizacao.JA_FINALIZADO: "Já finalizado anteriormente.",
    StatusFinalizacao.ESTADO_PARCIAL: "Estado parcial — revisão manual necessária.",
}


@dataclass(frozen=True)
class ItemAnaliseFinalizacao:
    arquivo_origem: str
    sei: str | None
    status: StatusFinalizacao
    motivo: str | None
    avaliacao: AvaliacaoElegibilidade | None
    candidatos: list[CandidatoLinhaFinalizacao]


def _status_documental(avaliacao: AvaliacaoElegibilidade) -> StatusFinalizacao:
    if avaliacao.apto:
        return StatusFinalizacao.PRONTO
    if avaliacao.confirmacao_valida:
        return StatusFinalizacao.SEM_COMPROVANTE
    return StatusFinalizacao.SEM_CONFIRMACAO


def _status_linha(
    candidatos: list[CandidatoLinhaFinalizacao],
) -> StatusFinalizacao:
    """A regra é do PROCESSO (SEI), não da linha isolada (ajuste de
    2026-08-07): quando o mesmo SEI corresponde a mais de uma linha (ex.:
    diária original + Complemento de Diárias), todas são tratadas como um
    conjunto atômico — nunca uma escolha manual de qual linha vale.

    Qualquer linha em estado PARCIAL bloqueia o SEI inteiro (revisão
    manual). Sem nenhuma PARCIAL: se TODAS já estiverem finalizadas, o SEI
    conta como já finalizado; caso contrário (todas prontas, ou uma mistura
    de prontas e já finalizadas) o SEI está pronto — `confirmar` grava só
    as linhas ainda vazias, mantendo as que já eram SIM/SIM como estão."""
    if not candidatos:
        return StatusFinalizacao.SEI_NAO_ENCONTRADO
    estados = {candidato.estado for candidato in candidatos}
    if EstadoLinhaFinalizacao.PARCIAL in estados:
        return StatusFinalizacao.ESTADO_PARCIAL
    if estados == {EstadoLinhaFinalizacao.JA_FINALIZADA}:
        return StatusFinalizacao.JA_FINALIZADO
    return StatusFinalizacao.PRONTO


def analisar_lote(caminhos: list[str], caminho_planilha: str) -> list[ItemAnaliseFinalizacao]:
    """Para cada PDF: extrai o SEI (mesmo parser já homologado), avalia a
    elegibilidade documental (confirmação + comprovante) e, só quando apto,
    localiza a(s) linha(s) candidata(s) na Planilha Oficial pelo SEI. Nunca
    grava nada — só leitura."""
    if not os.path.isfile(caminho_planilha):
        raise ErroFinalizacaoDiarias(f"Planilha não encontrada: {caminho_planilha}")

    parser = obter_parser()
    try:
        workbook = load_workbook(caminho_planilha)
    except Exception as erro:
        raise ErroFinalizacaoDiarias(f"Não foi possível abrir a planilha oficial: {erro}") from erro

    try:
        planilha = workbook[NOME_ABA]
    except KeyError:
        workbook.close()
        raise ErroFinalizacaoDiarias(f"Aba '{NOME_ABA}' não encontrada na planilha") from None

    itens: list[ItemAnaliseFinalizacao] = []
    for caminho in caminhos:
        nome_arquivo = os.path.basename(caminho)
        try:
            texto = pdf_reader.ler_texto(caminho)
        except Exception as erro:
            itens.append(
                ItemAnaliseFinalizacao(
                    arquivo_origem=nome_arquivo,
                    sei=None,
                    status=StatusFinalizacao.ERRO_LEITURA,
                    motivo=f"Falha ao ler o PDF: {erro}",
                    avaliacao=None,
                    candidatos=[],
                )
            )
            continue

        sei = parser.extrair(texto).sei
        if not sei:
            itens.append(
                ItemAnaliseFinalizacao(
                    arquivo_origem=nome_arquivo,
                    sei=None,
                    status=StatusFinalizacao.SEI_NAO_EXTRAIDO,
                    motivo="Número SEI não identificado no processo.",
                    avaliacao=None,
                    candidatos=[],
                )
            )
            continue

        avaliacao = avaliar(texto)
        if not avaliacao.apto:
            itens.append(
                ItemAnaliseFinalizacao(
                    arquivo_origem=nome_arquivo,
                    sei=sei,
                    status=_status_documental(avaliacao),
                    motivo=avaliacao.motivo,
                    avaliacao=avaliacao,
                    candidatos=[],
                )
            )
            continue

        candidatos = localizar_candidatos(planilha, sei)
        status = _status_linha(candidatos)
        itens.append(
            ItemAnaliseFinalizacao(
                arquivo_origem=nome_arquivo,
                sei=sei,
                status=status,
                motivo=_MENSAGENS_LINHA.get(status),
                avaliacao=avaliacao,
                candidatos=candidatos,
            )
        )

    workbook.close()
    return itens


@dataclass(frozen=True)
class ItemConfirmacao:
    """Um SEI confirmado pelo usuário — nunca uma linha isolada (ajuste de
    2026-08-07): `confirmar` sempre resolve, de novo, TODAS as linhas
    daquele SEI na planilha, no momento da gravação."""

    arquivo_origem: str
    sei: str


class CategoriaConfirmacao(str, Enum):
    FINALIZADO = "finalizado"
    IGNORADO = "ignorado"


@dataclass(frozen=True)
class ItemResultadoConfirmacao:
    arquivo_origem: str
    sei: str
    categoria: CategoriaConfirmacao
    # Linhas que passaram de vazio para SIM/SIM nesta chamada.
    linhas_atualizadas: list[int]
    # Linhas que já estavam SIM/SIM antes desta chamada (mantidas como
    # estão, nunca regravadas) — só populado quando o SEI foi finalizado
    # (ou já estava inteiramente finalizado).
    linhas_mantidas: list[int]
    motivo: str | None = None


@dataclass(frozen=True)
class ResultadoConfirmacao:
    total_finalizado: int
    total_ignorado: int
    itens: list[ItemResultadoConfirmacao]


def confirmar(itens: list[ItemConfirmacao], caminho_planilha: str) -> ResultadoConfirmacao:
    """Grava X=SIM/Y=SIM em TODAS as linhas de cada SEI confirmado pelo
    usuário — nunca uma linha isolada. Resolve as linhas do SEI de novo, no
    momento da gravação (nunca confia só na análise anterior, que pode
    estar desatualizada).

    Atômico por SEI (ajuste de 2026-08-07): se qualquer linha do SEI
    estiver em estado PARCIAL, nenhuma linha daquele SEI é gravada — nunca
    metade atualizada e metade pendente. Linhas já SIM/SIM são mantidas
    como estão, sem erro. Um SEI bloqueado nunca impede os demais itens do
    lote de serem gravados."""
    if not os.path.isfile(caminho_planilha):
        raise ErroFinalizacaoDiarias(f"Planilha não encontrada: {caminho_planilha}")

    try:
        workbook = load_workbook(caminho_planilha)
    except Exception as erro:
        raise ErroFinalizacaoDiarias(f"Não foi possível abrir a planilha oficial: {erro}") from erro

    try:
        planilha = workbook[NOME_ABA]
    except KeyError:
        workbook.close()
        raise ErroFinalizacaoDiarias(f"Aba '{NOME_ABA}' não encontrada na planilha") from None

    resultados: list[ItemResultadoConfirmacao] = []
    algum_gravado = False

    for item in itens:
        candidatos = localizar_candidatos(planilha, item.sei)
        if not candidatos:
            resultados.append(
                ItemResultadoConfirmacao(
                    arquivo_origem=item.arquivo_origem,
                    sei=item.sei,
                    categoria=CategoriaConfirmacao.IGNORADO,
                    linhas_atualizadas=[],
                    linhas_mantidas=[],
                    motivo="SEI não localizado na Planilha Oficial.",
                )
            )
            continue

        estados = {candidato.estado for candidato in candidatos}
        if EstadoLinhaFinalizacao.PARCIAL in estados:
            resultados.append(
                ItemResultadoConfirmacao(
                    arquivo_origem=item.arquivo_origem,
                    sei=item.sei,
                    categoria=CategoriaConfirmacao.IGNORADO,
                    linhas_atualizadas=[],
                    linhas_mantidas=[],
                    motivo="Estado parcial — revisão manual necessária.",
                )
            )
            continue

        linhas_prontas = [
            c.linha for c in candidatos if c.estado is EstadoLinhaFinalizacao.PRONTA
        ]
        linhas_ja_finalizadas = [
            c.linha for c in candidatos if c.estado is EstadoLinhaFinalizacao.JA_FINALIZADA
        ]

        if not linhas_prontas:
            resultados.append(
                ItemResultadoConfirmacao(
                    arquivo_origem=item.arquivo_origem,
                    sei=item.sei,
                    categoria=CategoriaConfirmacao.IGNORADO,
                    linhas_atualizadas=[],
                    linhas_mantidas=linhas_ja_finalizadas,
                    motivo="Já finalizado anteriormente.",
                )
            )
            continue

        for linha in linhas_prontas:
            gravar_finalizacao(planilha, linha)
        algum_gravado = True
        resultados.append(
            ItemResultadoConfirmacao(
                arquivo_origem=item.arquivo_origem,
                sei=item.sei,
                categoria=CategoriaConfirmacao.FINALIZADO,
                linhas_atualizadas=linhas_prontas,
                linhas_mantidas=linhas_ja_finalizadas,
            )
        )

    if algum_gravado:
        workbook.save(caminho_planilha)
    workbook.close()

    total_finalizado = sum(1 for r in resultados if r.categoria is CategoriaConfirmacao.FINALIZADO)
    return ResultadoConfirmacao(
        total_finalizado=total_finalizado,
        total_ignorado=len(resultados) - total_finalizado,
        itens=resultados,
    )
