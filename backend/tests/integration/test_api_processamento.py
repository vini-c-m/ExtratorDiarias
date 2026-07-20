from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_post_processamento_com_pdfs_reais(pdfs_exemplo):
    resposta = client.post("/api/v1/processamento", json={"arquivos": pdfs_exemplo})

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["total"] == len(pdfs_exemplo)
    assert corpo["sucesso"] == len(pdfs_exemplo)
    assert corpo["erro"] == 0
    assert len(corpo["processos"]) == len(pdfs_exemplo)
    assert all(p["status"] == "sucesso" for p in corpo["processos"])
    assert all(p["diaria"]["sei"] for p in corpo["processos"])


def test_post_processamento_lista_vazia():
    resposta = client.post("/api/v1/processamento", json={"arquivos": []})

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["total"] == 0


def test_post_processamento_diaria_de_membro_expoe_tipo_e_valor(pdfs_diaria_membro):
    resposta = client.post("/api/v1/processamento", json={"arquivos": pdfs_diaria_membro})

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["sucesso"] == len(pdfs_diaria_membro)

    for processo in corpo["processos"]:
        assert processo["diaria"]["tipo_processo"] == "DIARIA_MEMBRO"
        assert processo["diaria"]["valor_total_diarias"]


def test_post_processamento_padrao_expoe_tipo_padrao_sem_valor(pdfs_exemplo):
    resposta = client.post("/api/v1/processamento", json={"arquivos": pdfs_exemplo})

    assert resposta.status_code == 200
    corpo = resposta.json()

    for processo in corpo["processos"]:
        assert processo["diaria"]["tipo_processo"] == "PADRAO"
        assert processo["diaria"]["valor_total_diarias"] is None


def test_post_processamento_expoe_origem_do_transporte(pdfs_exemplo):
    """Sprint 04.1: nenhum dos PDFs de exemplo tem evidência textual de
    transporte, mas todos resolvem destino para Pernambuco (sem ser
    Petrolina) — a API deve expor 'REGRA_OPERACIONAL' como fonte."""
    resposta = client.post("/api/v1/processamento", json={"arquivos": pdfs_exemplo})

    assert resposta.status_code == 200
    corpo = resposta.json()

    for processo in corpo["processos"]:
        assert processo["diaria"]["transporte"] == "CARRO"
        assert processo["diaria"]["transporte_fonte"] == "REGRA_OPERACIONAL"
