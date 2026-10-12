"""Organização Automática de PDFs — testes do módulo isolado de filesystem
(`app.planilha.organizador_arquivos`). Todos usam `tmp_path`: nunca tocam
PDFs/pastas reais."""

import os

import pytest

from app.planilha import organizador_arquivos as org


# --- pertence_a_pasta — guarda Windows-safe (path.resolve + relative_to) ---


def test_pertence_a_pasta_arquivo_dentro_da_pasta(tmp_path):
    pasta = tmp_path / "origem"
    pasta.mkdir()
    arquivo = pasta / "processo.pdf"
    arquivo.write_bytes(b"conteudo")

    assert org.pertence_a_pasta(str(arquivo), str(pasta)) is True


def test_pertence_a_pasta_arquivo_em_subpasta(tmp_path):
    pasta = tmp_path / "origem"
    subpasta = pasta / "sub"
    subpasta.mkdir(parents=True)
    arquivo = subpasta / "processo.pdf"
    arquivo.write_bytes(b"conteudo")

    assert org.pertence_a_pasta(str(arquivo), str(pasta)) is True


def test_pertence_a_pasta_arquivo_fora_da_pasta(tmp_path):
    pasta_a = tmp_path / "pasta_a"
    pasta_b = tmp_path / "pasta_b"
    pasta_a.mkdir()
    pasta_b.mkdir()
    arquivo_externo = pasta_b / "processo.pdf"
    arquivo_externo.write_bytes(b"conteudo")

    assert org.pertence_a_pasta(str(arquivo_externo), str(pasta_a)) is False


def test_pertence_a_pasta_nao_e_prefixo_ingenuo_de_string(tmp_path):
    """`Pasta A` não deve ser considerada "pai" de `Pasta A-outra` só porque
    a string começa com o mesmo prefixo — exatamente o motivo de usar
    resolve+relative_to em vez de `str.startswith`."""
    pasta = tmp_path / "Pasta A"
    pasta_parecida = tmp_path / "Pasta A-outra"
    pasta.mkdir()
    pasta_parecida.mkdir()
    arquivo = pasta_parecida / "processo.pdf"
    arquivo.write_bytes(b"conteudo")

    assert org.pertence_a_pasta(str(arquivo), str(pasta)) is False


def test_pertence_a_pasta_sem_pasta_configurada():
    assert org.pertence_a_pasta("C:/qualquer/arquivo.pdf", "") is False


# --- organizar_processamento -------------------------------------------


def test_organizar_processamento_move_arquivo(tmp_path):
    origem = tmp_path / "a_processar"
    destino = tmp_path / "processados"
    origem.mkdir()
    destino.mkdir()
    arquivo = origem / "processo.pdf"
    arquivo.write_bytes(b"conteudo")

    resultado = org.organizar_processamento(str(arquivo), str(origem), str(destino))

    assert resultado.sucesso is True
    assert resultado.status is org.StatusOrganizacao.MOVIDO
    assert not arquivo.exists()
    assert (destino / "processo.pdf").exists()


def test_organizar_processamento_sem_caminho_absoluto(tmp_path):
    destino = tmp_path / "processados"
    destino.mkdir()

    resultado = org.organizar_processamento(None, str(tmp_path / "origem"), str(destino))

    assert resultado.sucesso is False
    assert resultado.status is org.StatusOrganizacao.ARQUIVO_NAO_ENCONTRADO


def test_organizar_processamento_sem_pastas_configuradas(tmp_path):
    arquivo = tmp_path / "processo.pdf"
    arquivo.write_bytes(b"conteudo")

    resultado = org.organizar_processamento(str(arquivo), None, None)

    assert resultado.sucesso is False
    assert resultado.status is org.StatusOrganizacao.PASTA_NAO_CONFIGURADA
    assert arquivo.exists()  # nunca mexe no arquivo quando a pasta não está configurada


def test_organizar_processamento_arquivo_fora_da_pasta_origem(tmp_path):
    origem = tmp_path / "a_processar"
    outra_pasta = tmp_path / "outra"
    destino = tmp_path / "processados"
    origem.mkdir()
    outra_pasta.mkdir()
    destino.mkdir()
    arquivo_externo = outra_pasta / "processo.pdf"
    arquivo_externo.write_bytes(b"conteudo")

    resultado = org.organizar_processamento(str(arquivo_externo), str(origem), str(destino))

    assert resultado.sucesso is False
    assert resultado.status is org.StatusOrganizacao.ARQUIVO_FORA_DA_PASTA
    assert arquivo_externo.exists()  # bloqueado antes de qualquer mover/excluir


def test_organizar_processamento_conteudo_diferente_usa_sufixo_seguro(tmp_path):
    origem = tmp_path / "a_processar"
    destino = tmp_path / "processados"
    origem.mkdir()
    destino.mkdir()
    arquivo = origem / "processo.pdf"
    arquivo.write_bytes(b"conteudo novo")
    (destino / "processo.pdf").write_bytes(b"conteudo antigo, diferente")

    resultado = org.organizar_processamento(str(arquivo), str(origem), str(destino))

    assert resultado.sucesso is True
    assert resultado.status is org.StatusOrganizacao.MOVIDO
    assert not arquivo.exists()
    # Nunca sobrescreve — o arquivo antigo continua intacto...
    assert (destino / "processo.pdf").read_bytes() == b"conteudo antigo, diferente"
    # ...e o novo ganhou um sufixo numérico seguro.
    assert (destino / "processo (1).pdf").read_bytes() == b"conteudo novo"


def test_organizar_processamento_mesmo_conteudo_remove_copia_redundante(tmp_path):
    origem = tmp_path / "a_processar"
    destino = tmp_path / "processados"
    origem.mkdir()
    destino.mkdir()
    arquivo = origem / "processo.pdf"
    conteudo = b"mesmo conteudo"
    arquivo.write_bytes(conteudo)
    (destino / "processo.pdf").write_bytes(conteudo)

    resultado = org.organizar_processamento(str(arquivo), str(origem), str(destino))

    assert resultado.sucesso is True
    assert resultado.status is org.StatusOrganizacao.JA_EXISTIA_REMOVIDO_DA_ORIGEM
    assert not arquivo.exists()
    assert (destino / "processo.pdf").read_bytes() == conteudo


def test_organizar_processamento_mesmo_conteudo_falha_ao_remover_origem(tmp_path, monkeypatch):
    """§ Conflito de Nome — remoção da cópia redundante falha: o destino já
    está seguro (nunca seria sobrescrito), mas o resultado da organização é
    reportado como falha/parcial (`sucesso=False`), nunca como sucesso
    silencioso."""
    origem = tmp_path / "a_processar"
    destino = tmp_path / "processados"
    origem.mkdir()
    destino.mkdir()
    arquivo = origem / "processo.pdf"
    conteudo = b"mesmo conteudo"
    arquivo.write_bytes(conteudo)
    (destino / "processo.pdf").write_bytes(conteudo)

    def _remove_falha(caminho):
        raise PermissionError("arquivo em uso")

    monkeypatch.setattr(org.os, "remove", _remove_falha)

    resultado = org.organizar_processamento(str(arquivo), str(origem), str(destino))

    assert resultado.sucesso is False
    assert resultado.status is org.StatusOrganizacao.JA_EXISTIA_ORIGEM_MANTIDA
    assert arquivo.exists()  # a origem nunca é removida quando a exclusão falha
    assert (destino / "processo.pdf").read_bytes() == conteudo  # destino continua seguro


def test_organizar_processamento_arquivo_origem_nao_encontrado(tmp_path):
    origem = tmp_path / "a_processar"
    destino = tmp_path / "processados"
    origem.mkdir()
    destino.mkdir()
    caminho_inexistente = str(origem / "nao_existe.pdf")

    resultado = org.organizar_processamento(caminho_inexistente, str(origem), str(destino))

    assert resultado.sucesso is False
    assert resultado.status is org.StatusOrganizacao.ARQUIVO_NAO_ENCONTRADO


def test_organizar_processamento_pasta_destino_inacessivel(tmp_path):
    origem = tmp_path / "a_processar"
    origem.mkdir()
    arquivo = origem / "processo.pdf"
    arquivo.write_bytes(b"conteudo")
    destino_inexistente = str(tmp_path / "nao_existe")

    resultado = org.organizar_processamento(str(arquivo), str(origem), destino_inexistente)

    assert resultado.sucesso is False
    assert resultado.status is org.StatusOrganizacao.PASTA_NAO_CONFIGURADA
    assert arquivo.exists()


# --- organizar_finalizacao ----------------------------------------------


def test_organizar_finalizacao_exclui_arquivo(tmp_path):
    origem = tmp_path / "a_confirmar"
    origem.mkdir()
    arquivo = origem / "processo.pdf"
    arquivo.write_bytes(b"conteudo")

    resultado = org.organizar_finalizacao(str(arquivo), str(origem))

    assert resultado.sucesso is True
    assert resultado.status is org.StatusOrganizacao.EXCLUIDO
    assert not arquivo.exists()


def test_organizar_finalizacao_arquivo_fora_da_pasta_nunca_exclui(tmp_path):
    origem = tmp_path / "a_confirmar"
    outra_pasta = tmp_path / "outra"
    origem.mkdir()
    outra_pasta.mkdir()
    arquivo_externo = outra_pasta / "processo.pdf"
    arquivo_externo.write_bytes(b"conteudo")

    resultado = org.organizar_finalizacao(str(arquivo_externo), str(origem))

    assert resultado.sucesso is False
    assert resultado.status is org.StatusOrganizacao.ARQUIVO_FORA_DA_PASTA
    assert arquivo_externo.exists()


def test_organizar_finalizacao_sem_pasta_configurada(tmp_path):
    arquivo = tmp_path / "processo.pdf"
    arquivo.write_bytes(b"conteudo")

    resultado = org.organizar_finalizacao(str(arquivo), None)

    assert resultado.sucesso is False
    assert resultado.status is org.StatusOrganizacao.PASTA_NAO_CONFIGURADA
    assert arquivo.exists()


def test_organizar_finalizacao_arquivo_ja_ausente_e_idempotente(tmp_path):
    origem = tmp_path / "a_confirmar"
    origem.mkdir()
    caminho_inexistente = str(origem / "ja_removido.pdf")

    resultado = org.organizar_finalizacao(caminho_inexistente, str(origem))

    # Objetivo (não sobrar na origem) já cumprido — nunca reportado como falha.
    assert resultado.sucesso is True
    assert resultado.status is org.StatusOrganizacao.ARQUIVO_NAO_ENCONTRADO


def test_organizar_finalizacao_sem_caminho_absoluto():
    resultado = org.organizar_finalizacao(None, "C:/qualquer/pasta")

    assert resultado.sucesso is False
    assert resultado.status is org.StatusOrganizacao.ARQUIVO_NAO_ENCONTRADO
