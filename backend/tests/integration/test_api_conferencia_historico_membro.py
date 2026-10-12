"""Histórico e-Fisco de Membro — a Central de Conferência não lê o despacho
do GABPGJ, então quando a categoria funcional classificada
(`classificar_categoria_funcional`) é MEMBRO, o usuário informa manualmente
as quantidades de integrais/parcial concedidas, usadas exclusivamente para
compor o texto do Histórico (`POST /conferencia/historico` e
`POST /conferencia/historico-complemento`). Para SERVIDOR, nada muda — ver
`test_api_conferencia.py`/`test_api_conferencia_complemento.py` (intocados
por esta melhoria, cobrem o comportamento legado)."""

from fastapi.testclient import TestClient
from openpyxl import Workbook

from app.consulta import base_local
from app.main import app

client = TestClient(app)

_CABECALHO_CONTROLE = [
    "DH", "SEI", "DOC ORIGEM", "CPF", "PREVIDÊNCIA", "NOME", "CARGO",
    "PERÍODO INICIAL", "PERÍODO FINAL", "TRECHO", "TRANSPORTE", "MOTIVO",
]
_CABECALHO_DADOS = [
    "SEI", "MATRÍCULA", "NOME", "PREVIDÊNCIA", "CARGO",
    "ÓRGÃO DE ORIGEM", "REGIME DE PREVIDÊNCIA", "SITUAÇÃO DO SERVIDOR",
]

_CARGO_SERVIDOR = "Analista Judiciário"
_CARGO_MEMBRO = "Promotor de Justiça de 1a. Entrancia"

_CPF_MEMBRO = 12345678901
_CPF_SERVIDOR = 59111111100


def _montar_planilha(tmp_path):
    workbook = Workbook()
    controle = workbook.active
    controle.title = "Controle de Diárias"
    controle.append(_CABECALHO_CONTROLE)

    dados = workbook.create_sheet("Dados")
    dados.append(_CABECALHO_DADOS)
    dados.append([_CPF_MEMBRO, 1001, "Herbet Gonçalves Santos", "FUNAFIN", _CARGO_MEMBRO, None, "RPPS", "Em exercício"])
    dados.append([_CPF_SERVIDOR, 1002, "Maria Aparecida Souza", "FUNAFIN", _CARGO_SERVIDOR, None, "RPPS", "Em exercício"])

    caminho = tmp_path / "planilha_historico_membro.xlsx"
    workbook.save(caminho)
    return str(caminho)


def _sincronizar_base_local(caminho_planilha: str, tmp_path, monkeypatch):
    destino_base = tmp_path / "dados_usuario"
    monkeypatch.setenv(base_local.VAR_AMBIENTE_USER_DATA, str(destino_base))
    base_local.sincronizar(caminho_planilha)


def _preparar(tmp_path, monkeypatch):
    caminho = _montar_planilha(tmp_path)
    _sincronizar_base_local(caminho, tmp_path, monkeypatch)


def _requisitar_historico(**overrides):
    corpo = {
        "cpf": str(_CPF_MEMBRO),
        "periodo_inicial": "2026-08-01",
        "periodo_final": "2026-08-01",
        "sei": "19.20.0000.0000000/2026-00",
        "destino": "Recife",
    }
    corpo.update(overrides)
    return client.post("/api/v1/conferencia/historico", json=corpo)


def _requisitar_historico_complemento(**overrides):
    corpo = {
        "cpf": str(_CPF_MEMBRO),
        "periodo_inicial": "2026-08-01",
        "periodo_final": "2026-08-01",
        "sei": "19.20.0000.0000000/2026-00",
        "destino": "Recife",
    }
    corpo.update(overrides)
    return client.post("/api/v1/conferencia/historico-complemento", json=corpo)


def test_c_membro_padrao_uma_integral_zero_parcial(tmp_path, monkeypatch):
    """01/08 -> 01/08, GABPGJ concedeu 1 integral/0 parcial: o texto precisa
    mencionar a diária integral (não uma parcial inferida do período de 1
    dia), preservando exatamente o período consultado."""
    _preparar(tmp_path, monkeypatch)

    resposta = _requisitar_historico(
        quantidade_diaria_integral_membro=1, quantidade_diaria_parcial_membro=0
    )

    assert resposta.status_code == 200
    texto = resposta.json()["texto"]
    assert "01 (UMA) DIÁRIA INTEGRAL," in texto
    assert "PARCIAL" not in texto
    assert "NO PERÍODO DE 01/08/2026 A 01/08/2026." in texto


def test_d_membro_padrao_zero_integral_uma_parcial(tmp_path, monkeypatch):
    """Mesmo período, GABPGJ concede só a parcial: texto padrão institucional
    já existente para 0 integrais no fluxo Padrão ("UMA DIÁRIA PARCIAL")."""
    _preparar(tmp_path, monkeypatch)

    resposta = _requisitar_historico(
        quantidade_diaria_integral_membro=0, quantidade_diaria_parcial_membro=1
    )

    assert resposta.status_code == 200
    texto = resposta.json()["texto"]
    assert "UMA DIÁRIA PARCIAL," in texto
    assert "INTEGRAL" not in texto


def test_e_membro_complemento_usa_quantidades_manuais_preservando_contexto(tmp_path, monkeypatch):
    """Complemento de Membro: mesma regra textual já homologada do
    Complemento (contexto_complemento=True -> "UMA PARCIAL", nunca "UMA
    DIÁRIA PARCIAL"), só a fonte da quantidade muda para manual."""
    _preparar(tmp_path, monkeypatch)

    resposta = _requisitar_historico_complemento(
        quantidade_diaria_integral_membro=0, quantidade_diaria_parcial_membro=1
    )

    assert resposta.status_code == 200
    texto = resposta.json()["texto"]
    assert "UMA PARCIAL," in texto
    assert "UMA DIÁRIA PARCIAL" not in texto
    assert "INTEGRAL" not in texto


def test_e_membro_complemento_com_integrais_e_parcial_preserva_e_uma_parcial(tmp_path, monkeypatch):
    _preparar(tmp_path, monkeypatch)

    resposta = _requisitar_historico_complemento(
        quantidade_diaria_integral_membro=2, quantidade_diaria_parcial_membro=1
    )

    assert resposta.status_code == 200
    texto = resposta.json()["texto"]
    assert "02 (DUAS) DIÁRIAS INTEGRAIS E UMA PARCIAL," in texto


def test_f_membro_padrao_zero_mais_zero_e_rejeitado(tmp_path, monkeypatch):
    _preparar(tmp_path, monkeypatch)

    resposta = _requisitar_historico(
        quantidade_diaria_integral_membro=0, quantidade_diaria_parcial_membro=0
    )

    assert resposta.status_code == 422


def test_f_membro_complemento_zero_mais_zero_e_rejeitado(tmp_path, monkeypatch):
    _preparar(tmp_path, monkeypatch)

    resposta = _requisitar_historico_complemento(
        quantidade_diaria_integral_membro=0, quantidade_diaria_parcial_membro=0
    )

    assert resposta.status_code == 422


def test_membro_sem_informar_quantidades_e_rejeitado(tmp_path, monkeypatch):
    _preparar(tmp_path, monkeypatch)

    resposta = _requisitar_historico()

    assert resposta.status_code == 422


def test_membro_informa_so_uma_das_duas_quantidades_e_rejeitado(tmp_path, monkeypatch):
    _preparar(tmp_path, monkeypatch)

    resposta = _requisitar_historico(quantidade_diaria_integral_membro=1)

    assert resposta.status_code == 422


def test_g_membro_parcial_maior_que_um_e_rejeitado(tmp_path, monkeypatch):
    """Não existe cenário institucional de 2+ parciais para Membro — o
    schema já rejeita no formato (`Literal[0, 1]`), antes mesmo de chegar
    à regra de negócio."""
    _preparar(tmp_path, monkeypatch)

    resposta = _requisitar_historico(
        quantidade_diaria_integral_membro=0, quantidade_diaria_parcial_membro=2
    )

    assert resposta.status_code == 422


def test_g_membro_integral_negativo_e_rejeitado(tmp_path, monkeypatch):
    _preparar(tmp_path, monkeypatch)

    resposta = _requisitar_historico(
        quantidade_diaria_integral_membro=-1, quantidade_diaria_parcial_membro=0
    )

    assert resposta.status_code == 422


def test_h_quantidade_nao_e_validada_contra_duracao_do_periodo(tmp_path, monkeypatch):
    """Decisão institucional explícita: a quantidade concedida pelo GABPGJ
    prevalece mesmo divergindo do que o período (21/07 a 23/07 = 2 dias)
    "sugeriria" — e o período textual nunca é alterado pela quantidade."""
    _preparar(tmp_path, monkeypatch)

    resposta = _requisitar_historico(
        periodo_inicial="2026-07-21",
        periodo_final="2026-07-23",
        quantidade_diaria_integral_membro=5,
        quantidade_diaria_parcial_membro=1,
    )

    assert resposta.status_code == 200
    texto = resposta.json()["texto"]
    assert "05 (CINCO) DIÁRIAS INTEGRAIS E UMA PARCIAL," in texto
    assert "NO PERÍODO DE 21/07/2026 A 23/07/2026." in texto


def test_a_servidor_padrao_ignora_campos_de_membro_quando_enviados(tmp_path, monkeypatch):
    """Regressão comportamental: para SERVIDOR, mesmo se o cliente enviar os
    campos novos (não deveria, mas o backend não pode confiar cegamente no
    frontend — RN-11), o texto gerado precisa ser idêntico ao de sempre,
    porque a categoria não classifica como MEMBRO."""
    _preparar(tmp_path, monkeypatch)

    resposta_sem_campos = _requisitar_historico(
        cpf=str(_CPF_SERVIDOR),
        periodo_inicial="2026-07-21",
        periodo_final="2026-07-23",
    )
    resposta_com_campos = _requisitar_historico(
        cpf=str(_CPF_SERVIDOR),
        periodo_inicial="2026-07-21",
        periodo_final="2026-07-23",
        quantidade_diaria_integral_membro=0,
        quantidade_diaria_parcial_membro=0,
    )

    assert resposta_sem_campos.status_code == 200
    assert resposta_com_campos.status_code == 200
    assert resposta_sem_campos.json()["texto"] == resposta_com_campos.json()["texto"]
    assert "02 (DUAS) DIÁRIAS INTEGRAIS E UMA PARCIAL," in resposta_sem_campos.json()["texto"]


def test_b_servidor_complemento_ignora_campos_de_membro_quando_enviados(tmp_path, monkeypatch):
    _preparar(tmp_path, monkeypatch)

    resposta_sem_campos = _requisitar_historico_complemento(
        cpf=str(_CPF_SERVIDOR),
        periodo_inicial="2026-07-21",
        periodo_final="2026-07-23",
    )
    resposta_com_campos = _requisitar_historico_complemento(
        cpf=str(_CPF_SERVIDOR),
        periodo_inicial="2026-07-21",
        periodo_final="2026-07-23",
        quantidade_diaria_integral_membro=0,
        quantidade_diaria_parcial_membro=0,
    )

    assert resposta_sem_campos.status_code == 200
    assert resposta_com_campos.status_code == 200
    assert resposta_sem_campos.json()["texto"] == resposta_com_campos.json()["texto"]


def test_conferir_expoe_categoria_funcional_membro(tmp_path, monkeypatch):
    """Etapa 1 (`POST /conferencia`) — categoria já classificada, para o
    frontend decidir se exibe os campos manuais antes do clique em "Gerar
    Histórico"."""
    _preparar(tmp_path, monkeypatch)

    resposta = client.post(
        "/api/v1/conferencia",
        json={
            "cpf": str(_CPF_MEMBRO),
            "periodo_inicial": "2026-08-01",
            "periodo_final": "2026-08-01",
        },
    )

    assert resposta.status_code == 200
    assert resposta.json()["servidor"]["categoria_funcional"] == "MEMBRO"


def test_conferir_expoe_categoria_funcional_servidor(tmp_path, monkeypatch):
    _preparar(tmp_path, monkeypatch)

    resposta = client.post(
        "/api/v1/conferencia",
        json={
            "cpf": str(_CPF_SERVIDOR),
            "periodo_inicial": "2026-08-01",
            "periodo_final": "2026-08-01",
        },
    )

    assert resposta.status_code == 200
    assert resposta.json()["servidor"]["categoria_funcional"] == "SERVIDOR"
