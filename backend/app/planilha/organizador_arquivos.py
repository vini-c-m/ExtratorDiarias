"""Organização automática de PDFs após operações bem-sucedidas (Processamento/
Complemento movem para "PDFs Processados"; Finalização exclui da pasta de
origem) — módulo isolado, só filesystem. Nunca decide categoria/status de
negócio: quem chama (`planilha_service.preencher_planilha`,
`finalizacao_service.confirmar`) decide QUANDO organizar; este módulo só
executa, com uma guarda de pertencimento à pasta configurada antes de
qualquer mover/excluir. Uma falha aqui nunca vira exceção — sempre um
`ResultadoOrganizacao(sucesso=False, ...)`, para nunca transformar um
resultado administrativo já gravado em erro de processamento."""

import hashlib
import logging
import os
import shutil
from dataclasses import dataclass
from enum import Enum
from pathlib import Path

_logger = logging.getLogger(__name__)


class StatusOrganizacao(str, Enum):
    MOVIDO = "movido"
    EXCLUIDO = "excluido"
    # Mesmo conteúdo (SHA-256) já presente no destino — a cópia redundante
    # da origem foi removida; o arquivo já estava seguro no destino antes
    # mesmo desta chamada.
    JA_EXISTIA_REMOVIDO_DA_ORIGEM = "ja_existia_removido_da_origem"
    # Mesmo conteúdo no destino, mas a remoção da cópia da origem falhou —
    # nunca reportado como falha de processamento (o destino já está
    # seguro), só um status informativo distinto de JA_EXISTIA_REMOVIDO_DA_ORIGEM.
    JA_EXISTIA_ORIGEM_MANTIDA = "ja_existia_origem_mantida"
    PASTA_NAO_CONFIGURADA = "pasta_nao_configurada"
    ARQUIVO_FORA_DA_PASTA = "arquivo_fora_da_pasta"
    ARQUIVO_NAO_ENCONTRADO = "arquivo_nao_encontrado"
    FALHA_PERMISSAO = "falha_permissao"
    FALHA_FILESYSTEM = "falha_filesystem"


@dataclass(frozen=True)
class ResultadoOrganizacao:
    sucesso: bool
    status: StatusOrganizacao
    detalhe: str | None = None


def pertence_a_pasta(caminho_arquivo: str, pasta: str) -> bool:
    """Comparação Windows-safe (path.resolve + relative_to — nunca prefixo
    de string ingênuo): normaliza os dois caminhos e verifica se o arquivo
    está dentro da árvore da pasta. Case-insensitive no Windows (`NTFS`
    preserva caixa mas não é sensível a ela)."""
    if not pasta:
        return False
    try:
        caminho_resolvido = Path(caminho_arquivo).resolve()
        pasta_resolvida = Path(pasta).resolve()
    except OSError:
        return False

    if os.name == "nt":
        caminho_resolvido = Path(str(caminho_resolvido).lower())
        pasta_resolvida = Path(str(pasta_resolvida).lower())

    try:
        caminho_resolvido.relative_to(pasta_resolvida)
    except ValueError:
        return False
    return True


def _hash_arquivo(caminho: str) -> str:
    digest = hashlib.sha256()
    with open(caminho, "rb") as arquivo:
        for bloco in iter(lambda: arquivo.read(1024 * 1024), b""):
            digest.update(bloco)
    return digest.hexdigest()


def _mesmo_conteudo(caminho_a: str, caminho_b: str) -> bool:
    try:
        return _hash_arquivo(caminho_a) == _hash_arquivo(caminho_b)
    except OSError:
        return False


def _destino_com_sufixo_seguro(destino: str) -> str:
    """Conteúdo diferente com o mesmo nome já no destino — nunca sobrescreve
    (§ Conflito de nome): acrescenta um sufixo numérico até encontrar um
    nome livre."""
    base, extensao = os.path.splitext(destino)
    contador = 1
    candidato = f"{base} ({contador}){extensao}"
    while os.path.exists(candidato):
        contador += 1
        candidato = f"{base} ({contador}){extensao}"
    return candidato


def _resultado_falha_generica(erro: Exception) -> ResultadoOrganizacao:
    if isinstance(erro, PermissionError):
        return ResultadoOrganizacao(False, StatusOrganizacao.FALHA_PERMISSAO, str(erro))
    return ResultadoOrganizacao(False, StatusOrganizacao.FALHA_FILESYSTEM, str(erro))


def organizar_processamento(
    caminho_absoluto: str | None,
    pasta_origem: str | None,
    pasta_destino: str | None,
) -> ResultadoOrganizacao:
    """Move um PDF já gravado com sucesso (categoria INSERIDO) da pasta de
    origem configurada para "PDFs Processados". Quem chama já decidiu que
    este item merece organização (só INSERIDO) — este módulo só executa a
    guarda de pasta + o filesystem em si."""
    try:
        if not caminho_absoluto:
            return ResultadoOrganizacao(
                False, StatusOrganizacao.ARQUIVO_NAO_ENCONTRADO, "Caminho de origem não informado."
            )
        if not pasta_origem or not pasta_destino:
            return ResultadoOrganizacao(
                False, StatusOrganizacao.PASTA_NAO_CONFIGURADA, "Pastas operacionais não configuradas."
            )
        if not pertence_a_pasta(caminho_absoluto, pasta_origem):
            return ResultadoOrganizacao(
                False,
                StatusOrganizacao.ARQUIVO_FORA_DA_PASTA,
                "Arquivo fora da pasta de origem configurada.",
            )
        if not os.path.isfile(caminho_absoluto):
            return ResultadoOrganizacao(
                False, StatusOrganizacao.ARQUIVO_NAO_ENCONTRADO, "Arquivo de origem não encontrado."
            )
        if not os.path.isdir(pasta_destino):
            return ResultadoOrganizacao(
                False, StatusOrganizacao.PASTA_NAO_CONFIGURADA, "Pasta de destino inacessível."
            )

        nome = os.path.basename(caminho_absoluto)
        destino = os.path.join(pasta_destino, nome)

        if os.path.exists(destino):
            if _mesmo_conteudo(caminho_absoluto, destino):
                try:
                    os.remove(caminho_absoluto)
                    return ResultadoOrganizacao(True, StatusOrganizacao.JA_EXISTIA_REMOVIDO_DA_ORIGEM)
                except OSError as erro:
                    _logger.warning(
                        "Não foi possível remover a cópia redundante da origem (%s) — o destino já "
                        "está seguro: %s",
                        caminho_absoluto,
                        erro,
                    )
                    # `sucesso=False` de propósito (organização falha/parcial,
                    # § "Conflito de Nome"): a remoção da origem falhou de
                    # fato. Nunca vira falha de PROCESSAMENTO — o chamador
                    # (`planilha_service`) nunca lê este resultado como
                    # motivo para desfazer a gravação já concluída; só o
                    # `status` deixa claro que o destino já está seguro.
                    return ResultadoOrganizacao(
                        False, StatusOrganizacao.JA_EXISTIA_ORIGEM_MANTIDA, str(erro)
                    )
            destino = _destino_com_sufixo_seguro(destino)

        shutil.move(caminho_absoluto, destino)
        return ResultadoOrganizacao(True, StatusOrganizacao.MOVIDO)
    except OSError as erro:
        return _resultado_falha_generica(erro)
    except Exception as erro:  # nunca deixa o organizador derrubar o chamador
        _logger.exception("Falha inesperada ao organizar PDF processado: %s", caminho_absoluto)
        return ResultadoOrganizacao(False, StatusOrganizacao.FALHA_FILESYSTEM, str(erro))


def organizar_finalizacao(
    caminho_absoluto: str | None,
    pasta_origem: str | None,
) -> ResultadoOrganizacao:
    """Exclui, da pasta de origem configurada, um PDF cujo processo acabou de
    ser finalizado/já estava confirmado. Quem chama já decidiu que este item
    merece organização (só FINALIZADO/JA_CONFIRMADO) — nunca chamado para
    IGNORADO."""
    try:
        if not caminho_absoluto:
            return ResultadoOrganizacao(
                False, StatusOrganizacao.ARQUIVO_NAO_ENCONTRADO, "Caminho de origem não informado."
            )
        if not pasta_origem:
            return ResultadoOrganizacao(
                False, StatusOrganizacao.PASTA_NAO_CONFIGURADA, "Pasta operacional não configurada."
            )
        if not pertence_a_pasta(caminho_absoluto, pasta_origem):
            return ResultadoOrganizacao(
                False,
                StatusOrganizacao.ARQUIVO_FORA_DA_PASTA,
                "Arquivo fora da pasta de origem configurada.",
            )
        if not os.path.isfile(caminho_absoluto):
            # Já não está mais na origem — o objetivo (não sobrar na pasta de
            # entrada) já está cumprido; nunca reportado como falha.
            return ResultadoOrganizacao(
                True,
                StatusOrganizacao.ARQUIVO_NAO_ENCONTRADO,
                "Arquivo já não estava na pasta de origem.",
            )

        os.remove(caminho_absoluto)
        return ResultadoOrganizacao(True, StatusOrganizacao.EXCLUIDO)
    except OSError as erro:
        return _resultado_falha_generica(erro)
    except Exception as erro:  # nunca deixa o organizador derrubar o chamador
        _logger.exception("Falha inesperada ao organizar PDF finalizado: %s", caminho_absoluto)
        return ResultadoOrganizacao(False, StatusOrganizacao.FALHA_FILESYSTEM, str(erro))
