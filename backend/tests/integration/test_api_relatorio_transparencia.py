"""Micro-sprint 3D — testes de API do Relatório de Diárias — Portal da
Transparência. Dados 100% sintéticos (identificadores fictícios, sem
nenhuma base real)."""

from datetime import date

from fastapi.testclient import TestClient
from openpyxl import Workbook

from app.main import app

client = TestClient(app)

_BASE_URL = "/api/v1/relatorio-transparencia"

_CABECALHO_BASE_OB = [
    "DH",
    "OB",
    "SITUAÇÃO",
    "DATA OB",
    "SEI",
    "CPF",
    "NOME",
    "CARGO",
    "PERÍODO INICIAL",
    "PERÍODO FINAL",
    "TRECHO",
    "TRANSPORTE",
    "MOTIVO",
    "VALOR DA DIÁRIA",
    "RESTITUIÇÃO",
    "DUPLICIDADE",
    "ITEM DE GASTO",
]


def _linha_ob(
    *,
    dh,
    ob,
    cpf=11111111111,
    periodo_inicial=date(2026, 5, 10),
    periodo_final=date(2026, 5, 10),
    trecho="RECIFE - GARANHUNS",
    valor=154.09,
    data_ob="15/05/2026 09:00:00",
    motivo="Motivo de teste",
):
    return [
        dh, ob, "Paga", data_ob, "19.20.0001.0000001/2026-01", cpf, "FULANO DE TAL",
        "Cargo de Teste", periodo_inicial, periodo_final, trecho, "CARRO", motivo,
        valor, None, "Único", "33901401",
    ]


def _criar_base_ob(caminho, linhas):
    wb = Workbook()
    ws = wb.active
    ws.title = "Sheet1"
    ws.append(_CABECALHO_BASE_OB)
    for linha in linhas:
        ws.append(linha)
    wb.save(caminho)


def _criar_controle_vazio(caminho):
    wb = Workbook()
    ws = wb.active
    ws.title = "Controle de Diárias"
    wb.save(caminho)


def _payload_base(caminho_base_ob, caminho_controle, caminho_decisoes, mes_referencia=5):
    return {
        "caminho_base_ordens_bancarias": str(caminho_base_ob),
        "caminho_controle_dimcac": str(caminho_controle),
        "ano_exercicio": 2026,
        "mes_referencia": mes_referencia,
        "caminho_decisoes": str(caminho_decisoes),
    }


def _preparar_fontes(tmp_path, linhas):
    caminho_base_ob = tmp_path / "base_ob.xlsx"
    caminho_controle = tmp_path / "controle.xlsx"
    _criar_base_ob(caminho_base_ob, linhas)
    _criar_controle_vazio(caminho_controle)
    caminho_decisoes = tmp_path / "decisoes.json"
    return caminho_base_ob, caminho_controle, caminho_decisoes


# --- Contrato básico: POST /preparar ----------------------------------------


def test_preparar_via_api_sem_revisao(tmp_path):
    caminho_base_ob, caminho_controle, caminho_decisoes = _preparar_fontes(
        tmp_path, [_linha_ob(dh="2026DH000001", ob="2026OB000001")]
    )

    resposta = client.post(f"{_BASE_URL}/preparar", json=_payload_base(caminho_base_ob, caminho_controle, caminho_decisoes))

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["total_candidatos_normais"] == 1
    assert corpo["total_revisoes"] == 0
    assert corpo["pode_gerar_relatorio"] is True


def test_preparar_via_api_com_revisao_nao_expoe_fingerprint(tmp_path):
    linhas = [
        _linha_ob(dh="2026DH000002", ob="2026OB000002", cpf=22222222222, valor=308.19, trecho="RECIFE - ARCOVERDE", periodo_inicial=date(2026, 5, 11), periodo_final=date(2026, 5, 11)),
        _linha_ob(dh="2026DH000003", ob="2026OB000003", cpf=22222222222, valor=308.19, trecho="RECIFE - ARCOVERDE", periodo_inicial=date(2026, 5, 11), periodo_final=date(2026, 5, 11)),
    ]
    caminho_base_ob, caminho_controle, caminho_decisoes = _preparar_fontes(tmp_path, linhas)

    resposta = client.post(f"{_BASE_URL}/preparar", json=_payload_base(caminho_base_ob, caminho_controle, caminho_decisoes))

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["total_revisoes"] == 1
    assert corpo["pode_gerar_relatorio"] is False
    texto_bruto = resposta.text.lower()
    assert "fingerprint" not in texto_bruto


# --- GET /revisoes -----------------------------------------------------------


def test_get_revisoes_via_api(tmp_path):
    linhas = [
        _linha_ob(dh="2026DH000002", ob="2026OB000002", cpf=22222222222, valor=308.19),
        _linha_ob(dh="2026DH000003", ob="2026OB000003", cpf=22222222222, valor=308.19),
    ]
    caminho_base_ob, caminho_controle, caminho_decisoes = _preparar_fontes(tmp_path, linhas)

    resposta = client.get(f"{_BASE_URL}/revisoes", params=_payload_base(caminho_base_ob, caminho_controle, caminho_decisoes))

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["total"] == 1
    assert corpo["revisoes"][0]["regra"] == "RN07"
    assert corpo["revisoes"][0]["estado"] == "pendente"


# --- Erros seguem o padrão da aplicação (item 28) ---------------------------


def test_base_ob_inexistente_devolve_404(tmp_path):
    caminho_controle = tmp_path / "controle.xlsx"
    _criar_controle_vazio(caminho_controle)

    resposta = client.post(
        f"{_BASE_URL}/preparar",
        json=_payload_base(tmp_path / "nao_existe.xlsx", caminho_controle, tmp_path / "decisoes.json"),
    )
    assert resposta.status_code == 404


def test_controle_inexistente_devolve_404(tmp_path):
    caminho_base_ob = tmp_path / "base_ob.xlsx"
    _criar_base_ob(caminho_base_ob, [_linha_ob(dh="2026DH000001", ob="2026OB000001")])

    resposta = client.post(
        f"{_BASE_URL}/preparar",
        json=_payload_base(caminho_base_ob, tmp_path / "nao_existe.xlsx", tmp_path / "decisoes.json"),
    )
    assert resposta.status_code == 404


def test_mes_referencia_invalido_devolve_422(tmp_path):
    caminho_base_ob, caminho_controle, caminho_decisoes = _preparar_fontes(
        tmp_path, [_linha_ob(dh="2026DH000001", ob="2026OB000001")]
    )
    payload = _payload_base(caminho_base_ob, caminho_controle, caminho_decisoes)
    payload["mes_referencia"] = 13

    resposta = client.post(f"{_BASE_URL}/preparar", json=payload)
    assert resposta.status_code == 422


def test_acao_desconhecida_devolve_422(tmp_path):
    linhas = [
        _linha_ob(dh="2026DH000002", ob="2026OB000002", cpf=22222222222, valor=308.19),
        _linha_ob(dh="2026DH000003", ob="2026OB000003", cpf=22222222222, valor=308.19),
    ]
    caminho_base_ob, caminho_controle, caminho_decisoes = _preparar_fontes(tmp_path, linhas)
    payload = _payload_base(caminho_base_ob, caminho_controle, caminho_decisoes)
    payload.update({"acao": "aprovar_tudo", "autor": "servidor.teste", "obs_selecionadas": []})

    resposta = client.post(f"{_BASE_URL}/revisoes/qualquer-identidade/decisao", json=payload)
    assert resposta.status_code == 422


def test_grupo_inexistente_devolve_404(tmp_path):
    caminho_base_ob, caminho_controle, caminho_decisoes = _preparar_fontes(
        tmp_path, [_linha_ob(dh="2026DH000001", ob="2026OB000001")]
    )
    payload = _payload_base(caminho_base_ob, caminho_controle, caminho_decisoes)
    payload.update({"acao": "publicar", "autor": "servidor.teste", "obs_selecionadas": ["2026OB000001"]})

    resposta = client.post(f"{_BASE_URL}/revisoes/grupo-inexistente/decisao", json=payload)
    assert resposta.status_code == 404


def test_ob_fora_do_grupo_devolve_422(tmp_path):
    linhas = [
        _linha_ob(dh="2026DH000001", ob="2026OB000001"),
        _linha_ob(dh="2026DH000002", ob="2026OB000002", cpf=22222222222, valor=308.19),
        _linha_ob(dh="2026DH000003", ob="2026OB000003", cpf=22222222222, valor=308.19),
    ]
    caminho_base_ob, caminho_controle, caminho_decisoes = _preparar_fontes(tmp_path, linhas)
    corpo_preparar = client.post(
        f"{_BASE_URL}/preparar", json=_payload_base(caminho_base_ob, caminho_controle, caminho_decisoes)
    ).json()
    identidade = corpo_preparar["revisoes"][0]["identidade_grupo"]

    payload = _payload_base(caminho_base_ob, caminho_controle, caminho_decisoes)
    payload.update({"acao": "publicar", "autor": "servidor.teste", "obs_selecionadas": ["2026OB000001"]})

    resposta = client.post(f"{_BASE_URL}/revisoes/{identidade}/decisao", json=payload)
    assert resposta.status_code == 422


def test_autor_vazio_devolve_422(tmp_path):
    linhas = [
        _linha_ob(dh="2026DH000002", ob="2026OB000002", cpf=22222222222, valor=308.19),
        _linha_ob(dh="2026DH000003", ob="2026OB000003", cpf=22222222222, valor=308.19),
    ]
    caminho_base_ob, caminho_controle, caminho_decisoes = _preparar_fontes(tmp_path, linhas)
    payload = _payload_base(caminho_base_ob, caminho_controle, caminho_decisoes)
    payload.update({"acao": "publicar", "autor": "  ", "obs_selecionadas": ["2026OB000002"]})

    resposta = client.post(f"{_BASE_URL}/revisoes/qualquer/decisao", json=payload)
    assert resposta.status_code == 422


# --- Micro-sprint 3E.2 — PUBLICAR com zero OBs exige justificativa --------
# Prova que a garantia vale também batendo direto na API (sem passar pelo
# frontend/React) — nenhuma UI pode contornar.


def test_publicar_zero_obs_sem_observacao_devolve_422(tmp_path):
    linhas = [
        _linha_ob(dh="2026DH000002", ob="2026OB000002", cpf=22222222222, valor=308.19),
        _linha_ob(dh="2026DH000003", ob="2026OB000003", cpf=22222222222, valor=308.19),
    ]
    caminho_base_ob, caminho_controle, caminho_decisoes = _preparar_fontes(tmp_path, linhas)
    corpo_preparar = client.post(
        f"{_BASE_URL}/preparar", json=_payload_base(caminho_base_ob, caminho_controle, caminho_decisoes)
    ).json()
    identidade = corpo_preparar["revisoes"][0]["identidade_grupo"]

    payload = _payload_base(caminho_base_ob, caminho_controle, caminho_decisoes)
    payload.update({"acao": "publicar", "autor": "servidor.teste", "obs_selecionadas": []})

    resposta = client.post(f"{_BASE_URL}/revisoes/{identidade}/decisao", json=payload)
    assert resposta.status_code == 422


def test_publicar_zero_obs_com_observacao_vazia_devolve_422(tmp_path):
    linhas = [
        _linha_ob(dh="2026DH000002", ob="2026OB000002", cpf=22222222222, valor=308.19),
        _linha_ob(dh="2026DH000003", ob="2026OB000003", cpf=22222222222, valor=308.19),
    ]
    caminho_base_ob, caminho_controle, caminho_decisoes = _preparar_fontes(tmp_path, linhas)
    corpo_preparar = client.post(
        f"{_BASE_URL}/preparar", json=_payload_base(caminho_base_ob, caminho_controle, caminho_decisoes)
    ).json()
    identidade = corpo_preparar["revisoes"][0]["identidade_grupo"]

    payload = _payload_base(caminho_base_ob, caminho_controle, caminho_decisoes)
    payload.update(
        {"acao": "publicar", "autor": "servidor.teste", "obs_selecionadas": [], "observacao": "   "}
    )

    resposta = client.post(f"{_BASE_URL}/revisoes/{identidade}/decisao", json=payload)
    assert resposta.status_code == 422


def test_publicar_zero_obs_com_justificativa_valida_devolve_200(tmp_path):
    linhas = [
        _linha_ob(dh="2026DH000002", ob="2026OB000002", cpf=22222222222, valor=308.19),
        _linha_ob(dh="2026DH000003", ob="2026OB000003", cpf=22222222222, valor=308.19),
    ]
    caminho_base_ob, caminho_controle, caminho_decisoes = _preparar_fontes(tmp_path, linhas)
    corpo_preparar = client.post(
        f"{_BASE_URL}/preparar", json=_payload_base(caminho_base_ob, caminho_controle, caminho_decisoes)
    ).json()
    identidade = corpo_preparar["revisoes"][0]["identidade_grupo"]

    payload = _payload_base(caminho_base_ob, caminho_controle, caminho_decisoes)
    payload.update(
        {
            "acao": "publicar",
            "autor": "servidor.teste",
            "obs_selecionadas": [],
            "observacao": "Ambas as OBs excluídas até apuração interna.",
        }
    )

    resposta = client.post(f"{_BASE_URL}/revisoes/{identidade}/decisao", json=payload)
    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["revisoes"][0]["estado"] == "decidida"
    assert corpo["pode_gerar_relatorio"] is True


def test_publicar_com_obs_selecionadas_continua_sem_exigir_observacao(tmp_path):
    linhas = [
        _linha_ob(dh="2026DH000002", ob="2026OB000002", cpf=22222222222, valor=308.19),
        _linha_ob(dh="2026DH000003", ob="2026OB000003", cpf=22222222222, valor=308.19),
    ]
    caminho_base_ob, caminho_controle, caminho_decisoes = _preparar_fontes(tmp_path, linhas)
    corpo_preparar = client.post(
        f"{_BASE_URL}/preparar", json=_payload_base(caminho_base_ob, caminho_controle, caminho_decisoes)
    ).json()
    identidade = corpo_preparar["revisoes"][0]["identidade_grupo"]

    payload = _payload_base(caminho_base_ob, caminho_controle, caminho_decisoes)
    payload.update(
        {"acao": "publicar", "autor": "servidor.teste", "obs_selecionadas": ["2026OB000002"]}
    )

    resposta = client.post(f"{_BASE_URL}/revisoes/{identidade}/decisao", json=payload)
    assert resposta.status_code == 200


def test_adiar_continua_sem_exigir_observacao(tmp_path):
    linhas = [
        _linha_ob(dh="2026DH000002", ob="2026OB000002", cpf=22222222222, valor=308.19),
        _linha_ob(dh="2026DH000003", ob="2026OB000003", cpf=22222222222, valor=308.19),
    ]
    caminho_base_ob, caminho_controle, caminho_decisoes = _preparar_fontes(tmp_path, linhas)
    corpo_preparar = client.post(
        f"{_BASE_URL}/preparar", json=_payload_base(caminho_base_ob, caminho_controle, caminho_decisoes)
    ).json()
    identidade = corpo_preparar["revisoes"][0]["identidade_grupo"]

    payload = _payload_base(caminho_base_ob, caminho_controle, caminho_decisoes)
    payload.update({"acao": "adiar", "autor": "servidor.teste", "obs_selecionadas": []})

    resposta = client.post(f"{_BASE_URL}/revisoes/{identidade}/decisao", json=payload)
    assert resposta.status_code == 200
    assert resposta.json()["revisoes"][0]["estado"] == "adiada"


def test_persistencia_corrompida_devolve_503(tmp_path):
    caminho_base_ob, caminho_controle, caminho_decisoes = _preparar_fontes(
        tmp_path, [_linha_ob(dh="2026DH000001", ob="2026OB000001")]
    )
    caminho_decisoes.write_text("{isso nao e json valido", encoding="utf-8")

    resposta = client.post(f"{_BASE_URL}/preparar", json=_payload_base(caminho_base_ob, caminho_controle, caminho_decisoes))
    assert resposta.status_code == 503


# --- Teste ponta a ponta do backend (§13 da especificação) -----------------


def test_ponta_a_ponta_preparar_decidir_reaproveitar_invalidar(tmp_path):
    linhas = [
        _linha_ob(
            dh="2026DH000002", ob="2026OB000002", cpf=22222222222, valor=308.19,
            trecho="RECIFE - ARCOVERDE", periodo_inicial=date(2026, 5, 11), periodo_final=date(2026, 5, 11),
        ),
        _linha_ob(
            dh="2026DH000003", ob="2026OB000003", cpf=22222222222, valor=308.19,
            trecho="RECIFE - ARCOVERDE", periodo_inicial=date(2026, 5, 11), periodo_final=date(2026, 5, 11),
        ),
        _linha_ob(
            dh="2026DH000004", ob="2026OB000004", cpf=33333333333, valor=200.00,
            trecho="RECIFE - CARUARU", periodo_inicial=date(2026, 5, 12), periodo_final=date(2026, 5, 12),
        ),
        _linha_ob(
            dh="2026DH000005", ob="2026OB000005", cpf=33333333333, valor=200.00,
            trecho="RECIFE - CARUARU", periodo_inicial=date(2026, 5, 12), periodo_final=date(2026, 5, 12),
        ),
    ]
    caminho_base_ob, caminho_controle, caminho_decisoes = _preparar_fontes(tmp_path, linhas)
    payload_fontes = _payload_base(caminho_base_ob, caminho_controle, caminho_decisoes)

    # PREPARAR -> existem 2 revisões, pode_gerar=False
    #
    # NÃO presumir que `revisoes[0]` é sempre o grupo OB2/OB3: a ordem de
    # `ResultadoReconciliacao.documentos` depende de `set(...) | set(...)`
    # (`motor_reconciliacao.reconciliar`), cuja iteração varia entre
    # processos por causa da randomização de hash de string do Python —
    # identificar cada grupo pelas OBs que ele de fato contém, nunca por
    # posição na lista.
    corpo = client.post(f"{_BASE_URL}/preparar", json=payload_fontes).json()
    assert corpo["total_revisoes"] == 2
    assert corpo["pode_gerar_relatorio"] is False

    def _revisao_do_grupo(corpo, obs_esperadas):
        return next(r for r in corpo["revisoes"] if {oc["ob"] for oc in r["ocorrencias"]} == obs_esperadas)

    obs_grupo_1 = {"2026OB000002", "2026OB000003"}
    obs_grupo_2 = {"2026OB000004", "2026OB000005"}
    identidade_1 = _revisao_do_grupo(corpo, obs_grupo_1)["identidade_grupo"]
    identidade_2 = _revisao_do_grupo(corpo, obs_grupo_2)["identidade_grupo"]

    # DECIDIR revisão 1 -> resta 1, pode_gerar=False
    payload_decisao_1 = dict(payload_fontes, acao="publicar", autor="servidor.teste", obs_selecionadas=sorted(obs_grupo_1))
    corpo = client.post(f"{_BASE_URL}/revisoes/{identidade_1}/decisao", json=payload_decisao_1).json()
    assert corpo["pode_gerar_relatorio"] is False
    estados = {r["identidade_grupo"]: r["estado"] for r in corpo["revisoes"]}
    assert estados[identidade_1] == "decidida"
    assert estados[identidade_2] == "pendente"

    # DECIDIR revisão 2 -> nenhuma pendência, pode_gerar=True
    payload_decisao_2 = dict(payload_fontes, acao="publicar", autor="servidor.teste", obs_selecionadas=sorted(obs_grupo_2))
    corpo = client.post(f"{_BASE_URL}/revisoes/{identidade_2}/decisao", json=payload_decisao_2).json()
    assert corpo["pode_gerar_relatorio"] is True

    # PREPARAR NOVAMENTE ("mês seguinte") -> decisões anteriores reaproveitadas
    payload_fontes_mes_seguinte = dict(payload_fontes, mes_referencia=8)
    corpo = client.post(f"{_BASE_URL}/preparar", json=payload_fontes_mes_seguinte).json()
    assert corpo["pode_gerar_relatorio"] is True
    assert all(r["estado"] == "decidida" for r in corpo["revisoes"])

    # Alterar materialmente uma evidência (motivo do grupo 1) -> decisão
    # correspondente vira DESATUALIZADA -> pode_gerar=False
    linhas_alteradas = list(linhas)
    linhas_alteradas[0] = _linha_ob(
        dh="2026DH000002", ob="2026OB000002", cpf=22222222222, valor=308.19,
        trecho="RECIFE - ARCOVERDE", periodo_inicial=date(2026, 5, 11), periodo_final=date(2026, 5, 11),
        motivo="Motivo revisado após o fechamento",
    )
    _criar_base_ob(caminho_base_ob, linhas_alteradas)

    corpo = client.post(f"{_BASE_URL}/preparar", json=payload_fontes_mes_seguinte).json()
    estados = {r["identidade_grupo"]: r["estado"] for r in corpo["revisoes"]}
    assert estados[identidade_1] == "desatualizada"
    assert estados[identidade_2] == "decidida"
    assert corpo["pode_gerar_relatorio"] is False
