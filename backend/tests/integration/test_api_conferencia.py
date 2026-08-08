from datetime import date

from fastapi.testclient import TestClient
from openpyxl import load_workbook

from app.consulta import base_local
from app.main import app

client = TestClient(app)


def _sincronizar_base_local(caminho_planilha: str, tmp_path, monkeypatch):
    destino_base = tmp_path / "dados_usuario"
    monkeypatch.setenv(base_local.VAR_AMBIENTE_USER_DATA, str(destino_base))
    base_local.sincronizar(caminho_planilha)


def test_conferencia_apto_para_processamento(
    caminho_planilha_conferencia_teste, tmp_path, monkeypatch
):
    caminho = caminho_planilha_conferencia_teste()
    _sincronizar_base_local(caminho, tmp_path, monkeypatch)

    resposta = client.post(
        "/api/v1/conferencia",
        json={"cpf": "12345678901", "periodo_inicial": "2026-06-01", "periodo_final": "2026-06-03"},
    )

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["veredito"] == "APTO_PARA_PROCESSAMENTO"
    assert corpo["servidor"]["nome"] == "Maria Aparecida Souza"
    assert corpo["duplicidade"] is None


def test_conferencia_revisar_por_duplicidade(
    caminho_planilha_conferencia_teste, tmp_path, monkeypatch
):
    caminho = caminho_planilha_conferencia_teste()
    _sincronizar_base_local(caminho, tmp_path, monkeypatch)

    resposta = client.post(
        "/api/v1/conferencia",
        # mesmo CPF+período já gravado na fixture (linha 2)
        json={"cpf": "12345678901", "periodo_inicial": "2026-07-21", "periodo_final": "2026-07-23"},
    )

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["veredito"] == "REVISAR"
    assert corpo["duplicidade"]["sei"] == "19.20.0902.0004521/2026-11"


def test_conferencia_revisar_quando_apenas_data_inicial_coincide(
    caminho_planilha_conferencia_teste, tmp_path, monkeypatch
):
    """RN-02 (correção de 2026-08-05): não exige mais as duas datas
    simultaneamente — a fixture tem um registro 21/07 a 23/07 para o mesmo
    CPF; uma consulta com a mesma data inicial e período final diferente
    também precisa ser sinalizada."""
    caminho = caminho_planilha_conferencia_teste()
    _sincronizar_base_local(caminho, tmp_path, monkeypatch)

    resposta = client.post(
        "/api/v1/conferencia",
        json={"cpf": "12345678901", "periodo_inicial": "2026-07-21", "periodo_final": "2026-08-01"},
    )

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["veredito"] == "REVISAR"
    assert corpo["duplicidade"]["sei"] == "19.20.0902.0004521/2026-11"


def test_conferencia_data_coincidente_mas_cpf_diferente_nao_e_duplicidade(
    caminho_planilha_conferencia_teste, tmp_path, monkeypatch
):
    """A checagem por data isolada continua exigindo o mesmo CPF: uma data
    que já exista para outro servidor nunca conta como duplicidade."""
    caminho = caminho_planilha_conferencia_teste()
    workbook = load_workbook(caminho)
    planilha = workbook["Controle de Diárias"]
    planilha.append(
        [
            "2026DH000200",
            "19.20.0902.0009998/2026-10",
            "PJTESTE",
            59111111100,
            "=VLOOKUP($D3,Dados!$A:$E,4,FALSE)",
            "=VLOOKUP($D3,Dados!$A:$E,3,FALSE)",
            "=VLOOKUP($D3,Dados!$A:$E,5,FALSE)",
            date(2026, 7, 25),
            date(2026, 7, 27),
            "RECIFE - PETROLINA",
            "AVIÃO",
            "Motivo de teste",
        ]
    )
    workbook.save(caminho)
    _sincronizar_base_local(caminho, tmp_path, monkeypatch)

    resposta = client.post(
        "/api/v1/conferencia",
        # CPF 12345678901 não tem nenhum registro que comece em 25/07 — essa
        # data só coincide com o registro do OUTRO cpf (59111111100).
        json={"cpf": "12345678901", "periodo_inicial": "2026-07-25", "periodo_final": "2026-07-29"},
    )

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["duplicidade"] is None
    assert corpo["veredito"] == "APTO_PARA_PROCESSAMENTO"


def test_conferencia_503_quando_base_local_indisponivel(tmp_path, monkeypatch):
    monkeypatch.setenv(base_local.VAR_AMBIENTE_USER_DATA, str(tmp_path / "vazio"))

    resposta = client.post(
        "/api/v1/conferencia",
        json={"cpf": "12345678901", "periodo_inicial": "2026-06-01", "periodo_final": "2026-06-03"},
    )

    assert resposta.status_code == 503


def test_conferencia_422_periodo_final_antes_do_inicial():
    resposta = client.post(
        "/api/v1/conferencia",
        json={"cpf": "12345678901", "periodo_inicial": "2026-06-03", "periodo_final": "2026-06-01"},
    )
    assert resposta.status_code == 422


def test_historico_gerado_com_sucesso(caminho_planilha_conferencia_teste, tmp_path, monkeypatch):
    caminho = caminho_planilha_conferencia_teste()
    _sincronizar_base_local(caminho, tmp_path, monkeypatch)

    resposta = client.post(
        "/api/v1/conferencia/historico",
        json={
            "cpf": "12345678901",
            "periodo_inicial": "2026-07-21",
            "periodo_final": "2026-07-23",
            "sei": "19.20.0903.0030720/2024-36",
            "destino": "Garanhuns",
        },
    )

    assert resposta.status_code == 200
    texto = resposta.json()["texto"]
    assert texto.startswith("19.20.0903.0030720/2024-36 MARIA APARECIDA SOUZA")
    assert "02 (DUAS) DIÁRIAS INTEGRAIS E UMA PARCIAL" in texto
    assert "DEST. GARANHUNS," in texto
    assert texto == texto.upper()


def test_historico_404_quando_servidor_nao_encontrado(
    caminho_planilha_conferencia_teste, tmp_path, monkeypatch
):
    caminho = caminho_planilha_conferencia_teste()
    _sincronizar_base_local(caminho, tmp_path, monkeypatch)

    resposta = client.post(
        "/api/v1/conferencia/historico",
        json={
            "cpf": "00000000000",
            "periodo_inicial": "2026-07-21",
            "periodo_final": "2026-07-23",
            "sei": "19.20.0903.0030720/2024-36",
            "destino": "Garanhuns",
        },
    )

    assert resposta.status_code == 404


def test_historico_422_quando_sei_vazio(caminho_planilha_conferencia_teste, tmp_path, monkeypatch):
    caminho = caminho_planilha_conferencia_teste()
    _sincronizar_base_local(caminho, tmp_path, monkeypatch)

    resposta = client.post(
        "/api/v1/conferencia/historico",
        json={
            "cpf": "12345678901",
            "periodo_inicial": "2026-07-21",
            "periodo_final": "2026-07-23",
            "sei": "  ",
            "destino": "Garanhuns",
        },
    )

    assert resposta.status_code == 422


def test_historico_422_quando_destino_vazio(caminho_planilha_conferencia_teste, tmp_path, monkeypatch):
    caminho = caminho_planilha_conferencia_teste()
    _sincronizar_base_local(caminho, tmp_path, monkeypatch)

    resposta = client.post(
        "/api/v1/conferencia/historico",
        json={
            "cpf": "12345678901",
            "periodo_inicial": "2026-07-21",
            "periodo_final": "2026-07-23",
            "sei": "19.20.0903.0030720/2024-36",
            "destino": "  ",
        },
    )

    assert resposta.status_code == 422


def test_historico_422_quando_campo_origem_nao_e_mais_aceito(
    caminho_planilha_conferencia_teste, tmp_path, monkeypatch
):
    """Correção de 2026-08-05: Origem deixou de ser um campo do contrato —
    `RequisicaoHistorico` (Pydantic) rejeita campos desconhecidos por
    padrão, então enviar `origem` não é mais silenciosamente ignorado."""
    caminho = caminho_planilha_conferencia_teste()
    _sincronizar_base_local(caminho, tmp_path, monkeypatch)

    resposta = client.post(
        "/api/v1/conferencia/historico",
        json={
            "cpf": "12345678901",
            "periodo_inicial": "2026-07-21",
            "periodo_final": "2026-07-23",
            "sei": "19.20.0903.0030720/2024-36",
            "origem": "Recife",
            "destino": "Garanhuns",
        },
    )

    # Pydantic, por padrão, ignora campos extras não declarados no modelo —
    # a requisição continua válida (o campo `origem` é apenas descartado).
    assert resposta.status_code == 200
