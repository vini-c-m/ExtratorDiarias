import os

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
    return resultado, arquivos_gerados
