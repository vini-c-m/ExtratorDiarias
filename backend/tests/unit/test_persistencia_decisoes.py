from datetime import date, datetime, timezone

import pytest

from app.consulta.persistencia_decisoes import (
    VERSAO_ESQUEMA_ATUAL,
    PersistenciaDecisoesCorrompida,
    VersaoEsquemaIncompativel,
    carregar_decisoes,
    salvar_decisao,
)
from app.domain.entities.ordem_bancaria import OrdemBancaria
from app.domain.relatorio_transparencia.decisao import AcaoDecisao, registrar_decisao
from app.domain.relatorio_transparencia.motor_decisao import OcorrenciaFinanceira, RevisaoNecessaria


def _ordem(ob="2026OB000001", valor=154.09):
    return OrdemBancaria(
        linha=2,
        dh="2026DH000001",
        ob=ob,
        credor="FULANO DE TAL",
        situacao="Paga",
        data_pagamento=datetime(2026, 5, 15, 9, 0, 0),
        sei="19.20.0001.0000001/2026-01",
        cpf="11111111111",
        nome="FULANO DE TAL",
        cargo="Cargo de Teste",
        periodo_inicial=date(2026, 5, 10),
        periodo_final=date(2026, 5, 10),
        cidade_origem=None,
        cidade_destino=None,
        transporte="CARRO",
        motivo="Motivo de teste",
        valor=valor,
        valor_bruto_sem_formula=valor,
        restituicao=None,
        duplicidade="Único",
        item_de_gasto="33901401",
        trecho="RECIFE-GARANHUNS",
    )


def _revisao():
    return RevisaoNecessaria(
        regra="RN07",
        motivo="Motivo de teste",
        ocorrencias=[
            OcorrenciaFinanceira(dh="2026DH000001", ordem_bancaria=_ordem(ob="2026OB000001")),
            OcorrenciaFinanceira(dh="2026DH000002", ordem_bancaria=_ordem(ob="2026OB000002")),
        ],
    )


# --- 17. Arquivo inexistente -----------------------------------------------


def test_arquivo_inexistente_devolve_dicionario_vazio(tmp_path):
    caminho = tmp_path / "decisoes.json"
    assert carregar_decisoes(caminho) == {}


# --- 18. Arquivo persistido válido / roundtrip -----------------------------


def test_salvar_e_carregar_roundtrip(tmp_path):
    caminho = tmp_path / "decisoes.json"
    decisao = registrar_decisao(
        _revisao(),
        acao=AcaoDecisao.PUBLICAR,
        autor="servidor.teste",
        obs_publicaveis=["2026OB000001"],
        observacao="Publiquei só a primeira.",
        agora=datetime(2026, 8, 23, 10, 0, 0, tzinfo=timezone.utc),
    )

    salvar_decisao(caminho, decisao)
    carregadas = carregar_decisoes(caminho)

    assert decisao.identidade_grupo in carregadas
    recuperada = carregadas[decisao.identidade_grupo]
    assert recuperada.acao is AcaoDecisao.PUBLICAR
    assert recuperada.obs_publicaveis == frozenset({"2026OB000001"})
    assert recuperada.fingerprint_evidencias == decisao.fingerprint_evidencias
    assert recuperada.regra == "RN07"


# --- 19. Escrita atômica ----------------------------------------------------


def test_escrita_e_atomica_nao_deixa_arquivo_temporario(tmp_path):
    caminho = tmp_path / "decisoes.json"
    decisao = registrar_decisao(_revisao(), acao=AcaoDecisao.ADIAR, autor="servidor.teste")

    salvar_decisao(caminho, decisao)

    assert caminho.is_file()
    assert not caminho.with_suffix(caminho.suffix + ".tmp").exists()


def test_salvar_preserva_decisoes_de_outros_grupos(tmp_path):
    caminho = tmp_path / "decisoes.json"
    decisao_1 = registrar_decisao(_revisao(), acao=AcaoDecisao.ADIAR, autor="servidor.a")
    outra_revisao = RevisaoNecessaria(
        regra="RN04",
        motivo="Outro motivo",
        ocorrencias=[OcorrenciaFinanceira(dh="2026DH000003", ordem_bancaria=_ordem(ob="2026OB000003"))],
    )
    decisao_2 = registrar_decisao(outra_revisao, acao=AcaoDecisao.PUBLICAR, autor="servidor.b", obs_publicaveis=["2026OB000003"])

    salvar_decisao(caminho, decisao_1)
    salvar_decisao(caminho, decisao_2)
    carregadas = carregar_decisoes(caminho)

    assert set(carregadas) == {decisao_1.identidade_grupo, decisao_2.identidade_grupo}


# --- 20. Arquivo corrompido falha explicitamente ---------------------------


def test_json_invalido_levanta_erro_explicito(tmp_path):
    caminho = tmp_path / "decisoes.json"
    caminho.write_text("{isso nao e json valido", encoding="utf-8")

    with pytest.raises(PersistenciaDecisoesCorrompida):
        carregar_decisoes(caminho)


def test_estrutura_inesperada_levanta_erro_explicito(tmp_path):
    caminho = tmp_path / "decisoes.json"
    caminho.write_text('{"nada_a_ver": true}', encoding="utf-8")

    with pytest.raises(PersistenciaDecisoesCorrompida):
        carregar_decisoes(caminho)


def test_campo_obrigatorio_ausente_levanta_erro_explicito(tmp_path):
    caminho = tmp_path / "decisoes.json"
    caminho.write_text(
        '{"versao_esquema": 1, "decisoes": {"abc": {"regra": "RN07"}}}', encoding="utf-8"
    )

    with pytest.raises(PersistenciaDecisoesCorrompida):
        carregar_decisoes(caminho)


# --- 21. Versão de esquema incompatível -------------------------------------


def test_versao_esquema_incompativel_levanta_erro_especifico(tmp_path):
    caminho = tmp_path / "decisoes.json"
    caminho.write_text('{"versao_esquema": 999, "decisoes": {}}', encoding="utf-8")

    with pytest.raises(VersaoEsquemaIncompativel):
        carregar_decisoes(caminho)


def test_versao_esquema_incompativel_e_subclasse_de_corrompida(tmp_path):
    caminho = tmp_path / "decisoes.json"
    caminho.write_text('{"versao_esquema": 999, "decisoes": {}}', encoding="utf-8")

    with pytest.raises(PersistenciaDecisoesCorrompida):
        carregar_decisoes(caminho)


def test_versao_esquema_atual_e_estavel():
    assert VERSAO_ESQUEMA_ATUAL == 1


# --- 22-23. Autor, data/hora e observação preservados -----------------------


def test_autor_data_hora_e_observacao_preservados(tmp_path):
    caminho = tmp_path / "decisoes.json"
    momento = datetime(2026, 8, 23, 14, 30, 0, tzinfo=timezone.utc)
    decisao = registrar_decisao(
        _revisao(),
        acao=AcaoDecisao.PUBLICAR,
        autor="maria.servidora",
        obs_publicaveis=["2026OB000001", "2026OB000002"],
        observacao="Confirmado com a CMFC: são duas viagens distintas.",
        agora=momento,
    )

    salvar_decisao(caminho, decisao)
    recuperada = carregar_decisoes(caminho)[decisao.identidade_grupo]

    assert recuperada.autor == "maria.servidora"
    assert recuperada.decidido_em == momento
    assert recuperada.observacao == "Confirmado com a CMFC: são duas viagens distintas."


# --- Minimização de dados sensíveis (§12) -----------------------------------


def test_json_persistido_nao_contem_cpf_nem_motivo_em_claro(tmp_path):
    caminho = tmp_path / "decisoes.json"
    decisao = registrar_decisao(
        _revisao(), acao=AcaoDecisao.PUBLICAR, autor="servidor.teste", obs_publicaveis=["2026OB000001"]
    )

    salvar_decisao(caminho, decisao)
    conteudo_bruto = caminho.read_text(encoding="utf-8")

    assert "11111111111" not in conteudo_bruto  # CPF usado no fingerprint, nunca em claro
    assert "Motivo de teste" not in conteudo_bruto  # motivo da OB, só entra no hash
    assert "RECIFE-GARANHUNS" not in conteudo_bruto  # trecho, só entra no hash
