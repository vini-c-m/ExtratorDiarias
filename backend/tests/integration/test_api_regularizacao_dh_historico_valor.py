"""Micro-sprint C ("Histórico e-Fisco + Valor na Central de Regularização
de DH") — casos A-P do pedido, mais a comprovação de não-recálculo (N/O/P)
e o teste de não-complemento (§22)."""

from datetime import date

import pytest
from fastapi.testclient import TestClient

from app.consulta import base_local_sqlite
from app.consulta.repositorio_diarias import ResultadoDiariasCompletas
from app.domain.entities.registro_diaria_indexada import RegistroDiariaIndexada
from app.domain.entities.servidor import Servidor
from app.domain.rules.historico_efisco import montar_historico
from app.main import app

client = TestClient(app)

_HOJE_TESTE = date.today()


def _registro(sei, cpf, periodo_inicial, periodo_final, cidade_origem, cidade_destino, motivo, *,
              transporte=None, valor=None, linha=2, doc_origem="PJTESTE", dh=None):
    return RegistroDiariaIndexada(
        linha=linha, sei=sei, doc_origem=doc_origem, cpf=cpf,
        periodo_inicial=periodo_inicial, periodo_final=periodo_final,
        cidade_origem=cidade_origem, cidade_destino=cidade_destino,
        motivo=motivo, transporte=transporte, valor_total_diarias=valor, dh=dh,
    )


def _sincronizar_base_sqlite(registros, servidores):
    resultado = ResultadoDiariasCompletas(
        diarias={registro.sei: registro for registro in registros}, avisos=[], linhas_ignoradas=0
    )
    sinal_frescor = base_local_sqlite.SinalFrescor(
        tamanho_bytes=1, mtime=1.0, linhas_controle_diarias=len(registros) + 1
    )
    destino = base_local_sqlite.caminho_base_local_sqlite()
    base_local_sqlite.reconstruir(resultado, servidores, sinal_frescor, origem="teste", caminho_destino=destino)
    return destino


_MARIA_SERVIDOR = Servidor(
    cpf="11111111111", nome="Maria Souza", cargo="Analista Judiciário", previdencia="RGPS",
    matricula="1001", situacao="Em exercício",
)
_HERBET_MEMBRO = Servidor(
    cpf="22222222222", nome="Herbet Gonçalves Santos", cargo="Promotor de Justiça de 1a. Entrancia",
    previdencia="FUNAFIN", matricula="1002", situacao="Em exercício",
)


def _detalhar(sei: str):
    resposta = client.get(f"/api/v1/regularizacao-dh/{sei}")
    assert resposta.status_code == 200
    return resposta.json()


# --- HISTÓRICO -----------------------------------------------------------


def test_a_servidor_historico_normal_gerado_identico_ao_gerador_homologado():
    registro = _registro(
        "19.20.0010.0000001/2026-01", "11111111111",
        date(2026, 7, 21), date(2026, 7, 23), "RECIFE", "GARANHUNS", "Reunião", dh=None,
    )
    _sincronizar_base_sqlite([registro], {"11111111111": _MARIA_SERVIDOR})

    corpo = _detalhar(registro.sei)

    esperado = montar_historico(
        sei=registro.sei, nome_servidor="Maria Souza",
        periodo_inicial=registro.periodo_inicial, periodo_final=registro.periodo_final,
        destino="GARANHUNS",
    )
    assert corpo["historico"]["situacao"] == "gerado"
    assert corpo["historico"]["texto"] == esperado
    assert corpo["historico"]["texto"].startswith("19.20.0010.0000001/2026-01 MARIA SOUZA")


def test_b_membro_historico_normal_gerado():
    registro = _registro(
        "19.20.0010.0000002/2026-02", "22222222222",
        date(2026, 1, 16), date(2026, 1, 17), "RECIFE", "FORTALEZA", "Solenidade", dh=None,
    )
    _sincronizar_base_sqlite([registro], {"22222222222": _HERBET_MEMBRO})

    corpo = _detalhar(registro.sei)

    assert corpo["historico"]["situacao"] == "gerado"
    assert "HERBET GONÇALVES SANTOS" in corpo["historico"]["texto"]


def test_c_multiplas_integrais():
    registro = _registro(
        "19.20.0010.0000003/2026-03", "11111111111",
        date(2026, 3, 1), date(2026, 3, 5), "RECIFE", "PETROLINA", "Auditoria", dh=None,
    )
    _sincronizar_base_sqlite([registro], {"11111111111": _MARIA_SERVIDOR})

    corpo = _detalhar(registro.sei)

    assert "04 (QUATRO) DIÁRIAS INTEGRAIS E UMA PARCIAL" in corpo["historico"]["texto"]


def test_d_integral_mais_parcial():
    registro = _registro(
        "19.20.0010.0000004/2026-04", "11111111111",
        date(2026, 4, 1), date(2026, 4, 2), "RECIFE", "CARUARU", "Diligência", dh=None,
    )
    _sincronizar_base_sqlite([registro], {"11111111111": _MARIA_SERVIDOR})

    corpo = _detalhar(registro.sei)

    assert "01 (UMA) DIÁRIA INTEGRAL E UMA PARCIAL" in corpo["historico"]["texto"]


def test_e_parcial_isolada_usa_texto_do_fluxo_padrao_nunca_de_complemento():
    """RN-04/P1 — período no mesmo dia (0 integrais): o texto correto do
    contexto NORMAL é 'UMA DIÁRIA PARCIAL,' — 'UMA PARCIAL,' (sem 'DIÁRIA')
    é exclusivo do modo Complemento, nunca usado aqui (item 4/22 do
    pedido)."""
    registro = _registro(
        "19.20.0010.0000005/2026-05", "11111111111",
        date(2026, 5, 10), date(2026, 5, 10), "RECIFE", "GARANHUNS", "Reunião", dh=None,
    )
    _sincronizar_base_sqlite([registro], {"11111111111": _MARIA_SERVIDOR})

    corpo = _detalhar(registro.sei)

    assert "UMA DIÁRIA PARCIAL," in corpo["historico"]["texto"]
    assert "DIÁRIAS INTEGRAIS" not in corpo["historico"]["texto"]


def test_f_contexto_complemento_nunca_e_aplicado_comparacao_direta():
    """§22 — teste de regressão explícito: o texto da Central de
    Regularização precisa ser BYTE A BYTE igual ao gerador homologado
    chamado com `contexto_complemento=False`, e DIFERENTE do que o mesmo
    gerador produziria com `contexto_complemento=True` para os mesmos
    dados (período de 0 integrais, onde a diferença textual existe)."""
    registro = _registro(
        "19.20.0010.0000006/2026-06", "11111111111",
        date(2026, 6, 1), date(2026, 6, 1), "RECIFE", "GARANHUNS", "Reunião", dh=None,
    )
    _sincronizar_base_sqlite([registro], {"11111111111": _MARIA_SERVIDOR})

    corpo = _detalhar(registro.sei)
    texto_real = corpo["historico"]["texto"]

    texto_normal = montar_historico(
        sei=registro.sei, nome_servidor="Maria Souza",
        periodo_inicial=registro.periodo_inicial, periodo_final=registro.periodo_final,
        destino="GARANHUNS", contexto_complemento=False,
    )
    texto_complemento = montar_historico(
        sei=registro.sei, nome_servidor="Maria Souza",
        periodo_inicial=registro.periodo_inicial, periodo_final=registro.periodo_final,
        destino="GARANHUNS", quantidade_diaria_parcial=0, contexto_complemento=True,
    )

    assert texto_real == texto_normal
    assert texto_real != texto_complemento


def test_g_ausencia_de_destino_marca_historico_indisponivel_sem_quebrar_o_resto():
    """Trecho histórico não separável em origem/destino (achado real já
    documentado, `repositorio_diarias._dividir_trecho`) — `cidade_destino`
    fica `None`; Histórico vira indisponível, mas o resto do detalhe
    continua íntegro (item 9/11/12 do pedido)."""
    registro = _registro(
        "19.20.0010.0000007/2026-07", "11111111111",
        date(2026, 7, 1), date(2026, 7, 3), "RECIFE", None, "Reunião", dh=None,
    )
    _sincronizar_base_sqlite([registro], {"11111111111": _MARIA_SERVIDOR})

    corpo = _detalhar(registro.sei)

    assert corpo["historico"]["situacao"] == "indisponivel"
    assert corpo["historico"]["texto"] is None
    assert corpo["historico"]["motivo"]
    assert corpo["sei"] == registro.sei  # o resto do detalhe continua presente


def test_h_falha_de_historico_nao_remove_o_processo_da_listagem():
    registro = _registro(
        "19.20.0010.0000008/2026-08", "11111111111",
        date(2026, 8, 1), date(2026, 8, 3), "RECIFE", None, "Reunião", dh=None,
    )
    _sincronizar_base_sqlite([registro], {"11111111111": _MARIA_SERVIDOR})

    resposta_lista = client.get("/api/v1/regularizacao-dh")
    assert resposta_lista.status_code == 200
    assert resposta_lista.json()["total"] == 1
    assert resposta_lista.json()["processos"][0]["sei"] == registro.sei


# --- VALOR -----------------------------------------------------------


def test_i_servidor_valor_existente():
    registro = _registro(
        "19.20.0010.0000009/2026-09", "11111111111",
        date(2026, 9, 1), date(2026, 9, 3), "RECIFE", "GARANHUNS", "Reunião", valor=462.28, dh=None,
    )
    _sincronizar_base_sqlite([registro], {"11111111111": _MARIA_SERVIDOR})

    corpo = _detalhar(registro.sei)

    assert corpo["valor"]["situacao"] == "disponivel"
    assert corpo["valor"]["valor"] == "462.28"


def test_j_membro_valor_existente():
    registro = _registro(
        "19.20.0010.0000010/2026-10", "22222222222",
        date(2026, 1, 16), date(2026, 1, 17), "RECIFE", "FORTALEZA", "Solenidade", valor=1560.66, dh=None,
    )
    _sincronizar_base_sqlite([registro], {"22222222222": _HERBET_MEMBRO})

    corpo = _detalhar(registro.sei)

    assert corpo["valor"]["situacao"] == "disponivel"
    assert corpo["valor"]["valor"] == "1560.66"


def test_k_valor_decimal_correto():
    registro = _registro(
        "19.20.0010.0000011/2026-11", "11111111111",
        date(2026, 11, 1), date(2026, 11, 3), "RECIFE", "GARANHUNS", "Reunião", valor=1386.81, dh=None,
    )
    _sincronizar_base_sqlite([registro], {"11111111111": _MARIA_SERVIDOR})

    corpo = _detalhar(registro.sei)

    assert corpo["valor"]["valor"] == "1386.81"


def test_l_valor_ausente():
    registro = _registro(
        "19.20.0010.0000012/2026-12", "11111111111",
        date(2026, 12, 1), date(2026, 12, 3), "RECIFE", "GARANHUNS", "Reunião", valor=None, dh=None,
    )
    _sincronizar_base_sqlite([registro], {"11111111111": _MARIA_SERVIDOR})

    corpo = _detalhar(registro.sei)

    assert corpo["valor"]["situacao"] == "indisponivel"
    assert corpo["valor"]["valor"] is None
    assert corpo["valor"]["motivo"] == "Valor da diária não disponível no registro."
    # Histórico continua disponível — independência entre os dois blocos.
    assert corpo["historico"]["situacao"] == "gerado"


def test_m_valor_zero_e_valor_valido_nunca_tratado_como_ausente():
    registro = _registro(
        "19.20.0011.0000001/2026-01", "11111111111",
        date(2026, 1, 5), date(2026, 1, 7), "RECIFE", "GARANHUNS", "Reunião", valor=0.0, dh=None,
    )
    _sincronizar_base_sqlite([registro], {"11111111111": _MARIA_SERVIDOR})

    corpo = _detalhar(registro.sei)

    assert corpo["valor"]["situacao"] == "disponivel"
    assert corpo["valor"]["valor"] == "0.00"


def test_n_calcular_valor_diaria_servidor_nunca_e_chamado(monkeypatch):
    from app.domain.rules import valor_diaria_servidor

    def _falhar_se_chamado(*args, **kwargs):
        raise AssertionError("calcular_valor_diaria_servidor foi chamado — a diária já existe, não recalcular.")

    monkeypatch.setattr(valor_diaria_servidor, "calcular_valor_diaria_servidor", _falhar_se_chamado)

    registro = _registro(
        "19.20.0011.0000002/2026-02", "11111111111",
        date(2026, 2, 1), date(2026, 2, 3), "RECIFE", "GARANHUNS", "Reunião", valor=200.0, dh=None,
    )
    _sincronizar_base_sqlite([registro], {"11111111111": _MARIA_SERVIDOR})

    corpo = _detalhar(registro.sei)
    assert corpo["valor"]["situacao"] == "disponivel"


def test_o_tabela_valores_nunca_e_consultada(monkeypatch):
    from app.consulta import repositorio_tabela_valores

    def _falhar_se_chamado(*args, **kwargs):
        raise AssertionError("Tabela Valores foi consultada — a diária já existe, o valor já está no registro.")

    monkeypatch.setattr(repositorio_tabela_valores, "carregar_tabela_valores", _falhar_se_chamado)

    registro = _registro(
        "19.20.0011.0000003/2026-03", "11111111111",
        date(2026, 3, 1), date(2026, 3, 3), "RECIFE", "GARANHUNS", "Reunião", valor=200.0, dh=None,
    )
    _sincronizar_base_sqlite([registro], {"11111111111": _MARIA_SERVIDOR})

    corpo = _detalhar(registro.sei)
    assert corpo["valor"]["situacao"] == "disponivel"


def test_p_resolvedor_cidade_para_uf_nunca_e_chamado_para_ler_valor(monkeypatch):
    from app.extraction.enriquecimento import local_destino

    def _falhar_se_chamado(*args, **kwargs):
        raise AssertionError("identificar_estado_destino foi chamado — leitura de valor não precisa de UF.")

    monkeypatch.setattr(local_destino, "identificar_estado_destino", _falhar_se_chamado)

    registro = _registro(
        "19.20.0011.0000004/2026-04", "11111111111",
        date(2026, 4, 1), date(2026, 4, 3), "RECIFE", "GARANHUNS", "Reunião", valor=200.0, dh=None,
    )
    _sincronizar_base_sqlite([registro], {"11111111111": _MARIA_SERVIDOR})

    corpo = _detalhar(registro.sei)
    assert corpo["valor"]["situacao"] == "disponivel"
    # Histórico usa `cidade_destino` diretamente do registro, nunca resolve
    # UF — confirma que o resolvedor genuinamente não entra em cena aqui.
    assert corpo["historico"]["situacao"] == "gerado"


# --- INVARIANTE DOS DHs (extensão do teste da Micro-sprint B) -----------


def test_invariante_falha_de_historico_e_valor_nao_alteram_a_populacao_da_central():
    registros = [
        _registro(  # historico + valor OK
            "19.20.0012.0000001/2026-01", "11111111111",
            date(2026, 1, 1), date(2026, 1, 3), "RECIFE", "GARANHUNS", "Reunião", valor=200.0, dh=None,
        ),
        _registro(  # historico indisponível (sem destino), valor OK
            "19.20.0012.0000002/2026-02", "11111111111",
            date(2026, 2, 1), date(2026, 2, 3), "RECIFE", None, "Reunião", valor=200.0, linha=3, dh=None,
        ),
        _registro(  # historico OK, valor ausente
            "19.20.0012.0000003/2026-03", "11111111111",
            date(2026, 3, 1), date(2026, 3, 3), "RECIFE", "GARANHUNS", "Reunião", valor=None, linha=4, dh=None,
        ),
    ]
    _sincronizar_base_sqlite(registros, {"11111111111": _MARIA_SERVIDOR})

    resposta_analitica = client.get("/api/v1/analitica/documentos-habeis-pendentes")
    resposta_regularizacao = client.get("/api/v1/regularizacao-dh")

    seis_analitica = {r["sei"] for r in resposta_analitica.json()["registros"]}
    seis_regularizacao = {p["sei"] for p in resposta_regularizacao.json()["processos"]}

    assert seis_analitica == seis_regularizacao
    assert len(seis_analitica) == 3
