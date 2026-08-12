"""Micro-sprint B ("Central de Regularização de DH", SOMENTE LEITURA).

Casos A-K do pedido, mais o teste de invariante mais importante (§17): a
Central de Regularização precisa devolver exatamente o mesmo conjunto de
SEIs que `GET /analitica/documentos-habeis-pendentes` — nunca uma segunda
regra, nunca uma contagem divergente."""

from datetime import date, timedelta

import openpyxl
import pytest
from fastapi.testclient import TestClient

from app.consulta import base_local, base_local_sqlite
from app.consulta.repositorio_diarias import ResultadoDiariasCompletas
from app.domain.entities.registro_diaria_indexada import RegistroDiariaIndexada
from app.domain.entities.servidor import Servidor
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
_JOAO_SERVIDOR = Servidor(
    cpf="33333333333", nome="João Pereira", cargo="Técnico Judiciário", previdencia="RGPS",
    matricula="1003", situacao="Em exercício",
)

# 1 aguardando_liberacao (Servidor), 1 revisao_manual_necessaria (Membro), 1
# com DH já preenchido (nunca deve aparecer em nenhuma das duas Centrais).
_REGISTROS_MISTOS = [
    _registro(
        "19.20.0009.0000001/2026-01", "11111111111",
        _HOJE_TESTE + timedelta(days=20), _HOJE_TESTE + timedelta(days=22),
        "RECIFE", "GARANHUNS", "Reunião", linha=2, dh=None,
    ),
    _registro(
        "19.20.0009.0000002/2026-02", "22222222222",
        _HOJE_TESTE - timedelta(days=30), _HOJE_TESTE - timedelta(days=28),
        "RECIFE", "FORTALEZA", "Solenidade", linha=3, dh=None,
    ),
    _registro(
        "19.20.0009.0000003/2026-03", "33333333333",
        _HOJE_TESTE - timedelta(days=5), _HOJE_TESTE - timedelta(days=3),
        "RECIFE", "CARUARU", "Diligência", linha=4, dh="2026DH000999",
    ),
]
_SERVIDORES_MISTOS = {
    "11111111111": _MARIA_SERVIDOR,
    "22222222222": _HERBET_MEMBRO,
    "33333333333": _JOAO_SERVIDOR,
}


def test_a_lista_com_um_dh_pendente():
    _sincronizar_base_sqlite(
        registros=[_REGISTROS_MISTOS[0], _REGISTROS_MISTOS[2]], servidores=_SERVIDORES_MISTOS
    )
    resposta = client.get("/api/v1/regularizacao-dh")

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["total"] == 1
    assert corpo["processos"][0]["sei"] == "19.20.0009.0000001/2026-01"


def test_b_lista_com_varios():
    _sincronizar_base_sqlite(registros=_REGISTROS_MISTOS, servidores=_SERVIDORES_MISTOS)
    resposta = client.get("/api/v1/regularizacao-dh")

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["total"] == 2
    seis = {p["sei"] for p in corpo["processos"]}
    assert seis == {"19.20.0009.0000001/2026-01", "19.20.0009.0000002/2026-02"}


def test_c_lista_vazia():
    _sincronizar_base_sqlite(registros=[_REGISTROS_MISTOS[2]], servidores=_SERVIDORES_MISTOS)
    resposta = client.get("/api/v1/regularizacao-dh")

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["total"] == 0
    assert corpo["processos"] == []


def test_d_servidor_categoria_funcional_correta():
    _sincronizar_base_sqlite(registros=[_REGISTROS_MISTOS[0]], servidores=_SERVIDORES_MISTOS)
    resposta = client.get("/api/v1/regularizacao-dh")

    processo = resposta.json()["processos"][0]
    assert processo["categoria_funcional"] == "SERVIDOR"
    assert processo["servidor_nome"] == "Maria Souza"


def test_e_membro_categoria_funcional_correta():
    _sincronizar_base_sqlite(registros=[_REGISTROS_MISTOS[1]], servidores=_SERVIDORES_MISTOS)
    resposta = client.get("/api/v1/regularizacao-dh")

    processo = resposta.json()["processos"][0]
    assert processo["categoria_funcional"] == "MEMBRO"
    assert processo["servidor_nome"] == "Herbet Gonçalves Santos"


def test_f_dados_disponiveis_corretamente():
    _sincronizar_base_sqlite(registros=[_REGISTROS_MISTOS[0]], servidores=_SERVIDORES_MISTOS)
    resposta = client.get("/api/v1/regularizacao-dh")

    processo = resposta.json()["processos"][0]
    assert processo["sei"] == "19.20.0009.0000001/2026-01"
    assert processo["cpf_mascarado"] == "***.***.***-11"
    assert "cpf" not in processo
    assert processo["periodo"]["inicial"] == (_HOJE_TESTE + timedelta(days=20)).isoformat()
    assert processo["periodo"]["final"] == (_HOJE_TESTE + timedelta(days=22)).isoformat()
    assert processo["trecho"]["origem"] == "RECIFE"
    assert processo["trecho"]["destino"] == "GARANHUNS"
    assert processo["situacao"] == "aguardando_liberacao"


def test_g_base_local_indisponivel_503(tmp_path, monkeypatch):
    monkeypatch.setenv(base_local.VAR_AMBIENTE_USER_DATA, str(tmp_path / "vazio_nunca_sincronizado"))

    resposta = client.get("/api/v1/regularizacao-dh")

    assert resposta.status_code == 503


def test_h_registro_com_dh_preenchido_nao_aparece():
    _sincronizar_base_sqlite(registros=_REGISTROS_MISTOS, servidores=_SERVIDORES_MISTOS)
    resposta = client.get("/api/v1/regularizacao-dh")

    seis = {p["sei"] for p in resposta.json()["processos"]}
    assert "19.20.0009.0000003/2026-03" not in seis


def test_i_mesma_regra_da_central_analitica_mesma_contagem():
    _sincronizar_base_sqlite(registros=_REGISTROS_MISTOS, servidores=_SERVIDORES_MISTOS)

    resposta_analitica = client.get("/api/v1/analitica/documentos-habeis-pendentes")
    resposta_regularizacao = client.get("/api/v1/regularizacao-dh")

    total_analitica = (
        resposta_analitica.json()["resumo"]["aguardando_liberacao"]
        + resposta_analitica.json()["resumo"]["revisao_manual_necessaria"]
    )
    assert total_analitica == resposta_regularizacao.json()["total"]


def test_j_mesmos_seis_da_central_analitica_invariante():
    """O teste mais importante desta Sprint (§17 do pedido): não basta a
    quantidade bater — o CONJUNTO de SEIs precisa ser idêntico."""
    _sincronizar_base_sqlite(registros=_REGISTROS_MISTOS, servidores=_SERVIDORES_MISTOS)

    resposta_analitica = client.get("/api/v1/analitica/documentos-habeis-pendentes")
    resposta_regularizacao = client.get("/api/v1/regularizacao-dh")

    seis_analitica = {r["sei"] for r in resposta_analitica.json()["registros"]}
    seis_regularizacao = {p["sei"] for p in resposta_regularizacao.json()["processos"]}

    assert seis_analitica == seis_regularizacao
    assert len(seis_analitica) == 2  # nunca vazio por acidente de fixture


def test_k_nenhum_metodo_de_escrita_e_chamado(monkeypatch):
    """P0 desta Sprint: SOMENTE LEITURA. Qualquer tentativa de gravar a
    Planilha ou sincronizar a Base Local a partir da listagem/detalhe faz
    este teste falhar imediatamente."""
    _sincronizar_base_sqlite(registros=_REGISTROS_MISTOS, servidores=_SERVIDORES_MISTOS)

    def _falhar_se_chamado(*args, **kwargs):
        raise AssertionError("Central de Regularização de DH (somente leitura) tentou escrever algo.")

    monkeypatch.setattr(openpyxl.Workbook, "save", _falhar_se_chamado)
    monkeypatch.setattr(base_local, "sincronizar", _falhar_se_chamado)

    resposta_lista = client.get("/api/v1/regularizacao-dh")
    assert resposta_lista.status_code == 200

    resposta_detalhe = client.get(f"/api/v1/regularizacao-dh/{_REGISTROS_MISTOS[0].sei}")
    assert resposta_detalhe.status_code == 200


# --- Detalhe -----------------------------------------------------------


def test_detalhe_processo_ainda_aguardando_dh():
    _sincronizar_base_sqlite(registros=[_REGISTROS_MISTOS[0]], servidores=_SERVIDORES_MISTOS)

    resposta = client.get("/api/v1/regularizacao-dh/19.20.0009.0000001/2026-01")

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["sei"] == "19.20.0009.0000001/2026-01"
    assert corpo["servidor_nome"] == "Maria Souza"
    assert corpo["ainda_aguardando_dh"] is True
    assert corpo["situacao"] == "aguardando_liberacao"
    assert corpo["trecho"] == {"origem": "RECIFE", "destino": "GARANHUNS"}


def test_detalhe_item_11_d_registro_ja_possui_dh_nao_e_erro():
    """Item 11 D do pedido: o registro deixou de ser pendente entre a
    consulta da lista e o clique no detalhe — estado de negócio legítimo,
    nunca um 404/500."""
    _sincronizar_base_sqlite(registros=[_REGISTROS_MISTOS[2]], servidores=_SERVIDORES_MISTOS)

    resposta = client.get("/api/v1/regularizacao-dh/19.20.0009.0000003/2026-03")

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["ainda_aguardando_dh"] is False
    assert corpo["situacao"] is None
    assert "já possui Documento Hábil" in corpo["mensagem"]


def test_detalhe_sei_nao_encontrado_404():
    _sincronizar_base_sqlite(registros=_REGISTROS_MISTOS, servidores=_SERVIDORES_MISTOS)

    resposta = client.get("/api/v1/regularizacao-dh/19.20.9999.9999999/2099-99")

    assert resposta.status_code == 404


def test_detalhe_base_local_indisponivel_503(tmp_path, monkeypatch):
    monkeypatch.setenv(base_local.VAR_AMBIENTE_USER_DATA, str(tmp_path / "vazio_nunca_sincronizado"))

    resposta = client.get("/api/v1/regularizacao-dh/19.20.0009.0000001/2026-01")

    assert resposta.status_code == 503


def test_lista_nunca_aceita_paginacao_ou_filtro_oculto():
    """A listagem desta Sprint é sempre o recorte inteiro (mesma base de
    comparação da invariante §17) — parâmetros de query são simplesmente
    ignorados pelo FastAPI (nenhum declarado no schema), nunca usados para
    filtrar silenciosamente."""
    _sincronizar_base_sqlite(registros=_REGISTROS_MISTOS, servidores=_SERVIDORES_MISTOS)

    resposta = client.get("/api/v1/regularizacao-dh", params={"pagina": 2, "cpf": "11111111111"})

    assert resposta.status_code == 200
    assert resposta.json()["total"] == 2
