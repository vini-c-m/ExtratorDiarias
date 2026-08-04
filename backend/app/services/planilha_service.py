import logging
import os

from app.consulta import base_local
from app.domain.entities.fonte_doc_origem import FonteDocOrigem
from app.domain.entities.processo import Processo
from app.planilha.escritor_planilha import NOME_ABA, ResultadoPreenchimento, preencher
from app.planilha.pasta_resultados import ArquivosGerados, montar
from app.planilha.relatorio import ItemAviso, ItemErro

# Sprint 06 — mesma redação sugerida para a Prioridade 2 (fallback de DOC DE
# ORIGEM): o CPF do servidor não tinha histórico na planilha oficial do
# DIMCAC, então a coluna C foi preenchida pela extração do PDF, já
# homologada. Isto não é um erro de processamento — é só um pedido de
# conferência, tratado como os demais avisos de revisão manual.
_logger = logging.getLogger(__name__)

_AVISO_DOC_ORIGEM_SEM_HISTORICO = (
    "DOC DE ORIGEM preenchido através da extração do processo. Não foi localizado "
    "histórico deste servidor na planilha oficial do DIMCAC. Recomenda-se conferir "
    "manualmente a nomenclatura institucional da unidade administrativa e, se "
    "necessário, substituí-la pela padronização atualmente utilizada pelo DIMCAC."
)


class ErroPreenchimentoPlanilha(Exception):
    pass


def _avisos_doc_origem_sem_historico(resultado: ResultadoPreenchimento) -> list[ItemAviso]:
    """Só sabemos se um CPF tinha histórico na planilha depois de `preencher`
    ter aberto o arquivo real — por isso este aviso nasce aqui, e não junto
    dos demais avisos vindos da extração (transporte, local, DH)."""
    return [
        ItemAviso(arquivo_origem=item.arquivo_origem, mensagens=[_AVISO_DOC_ORIGEM_SEM_HISTORICO])
        for item in resultado.gravados
        if item.doc_origem_fonte is FonteDocOrigem.EXTRACAO_PDF
    ]


def preencher_planilha(
    caminho_planilha: str,
    processos: list[Processo],
    erros: list[ItemErro],
    avisos: list[ItemAviso] | None = None,
    *,
    tempo_processamento_ms: int | None = None,
) -> tuple[ResultadoPreenchimento, ArquivosGerados]:
    if not os.path.isfile(caminho_planilha):
        raise ErroPreenchimentoPlanilha(f"Planilha não encontrada: {caminho_planilha}")

    try:
        resultado = preencher(caminho_planilha, processos)
    except KeyError:
        raise ErroPreenchimentoPlanilha(f"Aba '{NOME_ABA}' não encontrada na planilha")
    except PermissionError:
        raise ErroPreenchimentoPlanilha(
            "Não foi possível gravar a planilha — feche o arquivo no Excel e tente novamente"
        )

    avisos_completos = [*(avisos or []), *_avisos_doc_origem_sem_historico(resultado)]

    arquivos_gerados = montar(
        caminho_planilha,
        resultado,
        erros,
        avisos_completos,
        tempo_processamento_ms=tempo_processamento_ms,
    )

    # Sprint 13 — hook aditivo para a Central Inteligente de Conferência
    # (doc arquitetural § 4.2): ao lado da cópia com timestamp que já existe
    # acima, sobrescreve a Base Local de Consulta com a planilha recém
    # preenchida (Sprint 17.3: também reconstrói a materialização em
    # SQLite, usada pela Central Analítica). Só quando algo foi de fato
    # gravado — uma requisição que só encontrou duplicidade não paga o
    # custo de reindexar ~3 mil linhas. Nunca pode quebrar o fluxo de
    # preenchimento já homologado: qualquer falha aqui é registrada no log
    # (não mais engolida em silêncio) e nunca propagada.
    if resultado.total_gravado > 0:
        try:
            base_local.sincronizar(caminho_planilha)
        except Exception:
            _logger.exception("Falha ao sincronizar a Base Local de Consulta")

    return resultado, arquivos_gerados
