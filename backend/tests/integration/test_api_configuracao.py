import os

from fastapi.testclient import TestClient

from app.consulta import base_local_sqlite
from app.infra.config import configuracao_app as config
from app.main import app

client = TestClient(app)


def _isolar_diretorio_configuracao(monkeypatch, tmp_path):
    monkeypatch.setenv(config.VAR_AMBIENTE_USER_DATA, str(tmp_path / "dados_usuario"))


def test_get_configuracao_quando_nunca_configurado(monkeypatch, tmp_path):
    _isolar_diretorio_configuracao(monkeypatch, tmp_path)

    resposta = client.get("/api/v1/configuracao")

    assert resposta.status_code == 200
    assert resposta.json() == {"configurado": False}


def test_post_configuracao_planilha_invalida_nao_persiste(monkeypatch, tmp_path):
    _isolar_diretorio_configuracao(monkeypatch, tmp_path)

    resposta = client.post(
        "/api/v1/configuracao",
        json={"caminho_planilha_oficial": str(tmp_path / "nao_existe.xlsx")},
    )

    assert resposta.status_code == 422
    assert "não encontrado" in resposta.json()["detail"]
    assert config.carregar(diretorio_base=tmp_path / "dados_usuario") is None


def test_post_configuracao_valida_persiste_e_responde_configurado(
    monkeypatch, tmp_path, caminho_planilha_configuracao_teste
):
    _isolar_diretorio_configuracao(monkeypatch, tmp_path)
    caminho_planilha = caminho_planilha_configuracao_teste()

    resposta = client.post(
        "/api/v1/configuracao",
        json={"caminho_planilha_oficial": caminho_planilha},
    )

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["configurado"] is True
    assert corpo["planilha_acessivel"] is True
    assert corpo["requer_revalidacao"] is False
    assert corpo["caminho_planilha_oficial"] == caminho_planilha
    assert "configurado_em" in corpo

    assert config.carregar(diretorio_base=tmp_path / "dados_usuario") is not None


def test_get_configuracao_apos_configurar_segue_acessivel(
    monkeypatch, tmp_path, caminho_planilha_configuracao_teste
):
    _isolar_diretorio_configuracao(monkeypatch, tmp_path)
    caminho_planilha = caminho_planilha_configuracao_teste()
    client.post("/api/v1/configuracao", json={"caminho_planilha_oficial": caminho_planilha})

    resposta = client.get("/api/v1/configuracao")

    assert resposta.status_code == 200
    corpo = resposta.json()
    # Organização Automática de PDFs — pastas operacionais aditivas, ainda
    # não configuradas neste teste: todas `None`/bloqueadas.
    assert corpo == {
        "configurado": True,
        "planilha_acessivel": True,
        "requer_revalidacao": False,
        "caminho_planilha_oficial": caminho_planilha,
        "configurado_em": corpo["configurado_em"],
        "caminho_pdfs_a_processar": None,
        "caminho_pdfs_complemento_a_processar": None,
        "caminho_pdfs_processados": None,
        "caminho_pdfs_diarias_a_confirmar": None,
        "prontidao_pastas": {
            "processamento_padrao": {
                "liberado": False,
                "pastas_faltando": ["PDFs a Processar", "PDFs Processados"],
            },
            "complemento": {
                "liberado": False,
                "pastas_faltando": ["PDFs de Complemento a Processar", "PDFs Processados"],
            },
            "finalizacao": {
                "liberado": False,
                "pastas_faltando": ["PDFs de Diárias a Confirmar"],
            },
        },
    }


def test_get_configuracao_planilha_excluida_apos_configurar(
    monkeypatch, tmp_path, caminho_planilha_configuracao_teste
):
    _isolar_diretorio_configuracao(monkeypatch, tmp_path)
    caminho_planilha = caminho_planilha_configuracao_teste()
    client.post("/api/v1/configuracao", json={"caminho_planilha_oficial": caminho_planilha})

    os.remove(caminho_planilha)

    resposta = client.get("/api/v1/configuracao")

    assert resposta.status_code == 200
    # Organização Automática de PDFs — pastas operacionais aditivas, ainda
    # não configuradas neste teste: todas `None`/bloqueadas, independente
    # da planilha oficial estar inacessível.
    assert resposta.json() == {
        "configurado": True,
        "planilha_acessivel": False,
        "caminho_pdfs_a_processar": None,
        "caminho_pdfs_complemento_a_processar": None,
        "caminho_pdfs_processados": None,
        "caminho_pdfs_diarias_a_confirmar": None,
        "prontidao_pastas": {
            "processamento_padrao": {
                "liberado": False,
                "pastas_faltando": ["PDFs a Processar", "PDFs Processados"],
            },
            "complemento": {
                "liberado": False,
                "pastas_faltando": ["PDFs de Complemento a Processar", "PDFs Processados"],
            },
            "finalizacao": {
                "liberado": False,
                "pastas_faltando": ["PDFs de Diárias a Confirmar"],
            },
        },
    }


def test_get_configuracao_requer_revalidacao_apos_estrutura_divergir(
    monkeypatch, tmp_path, caminho_planilha_configuracao_teste
):
    from openpyxl import Workbook

    _isolar_diretorio_configuracao(monkeypatch, tmp_path)
    caminho_planilha = caminho_planilha_configuracao_teste()
    client.post("/api/v1/configuracao", json={"caminho_planilha_oficial": caminho_planilha})

    workbook = Workbook()
    workbook.active.title = "Controle de Diárias"
    workbook.save(caminho_planilha)

    resposta = client.get("/api/v1/configuracao")

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["configurado"] is True
    assert corpo["planilha_acessivel"] is True
    assert corpo["requer_revalidacao"] is True


def test_post_configuracao_valida_reconstroi_base_local_imediatamente(
    monkeypatch, tmp_path, caminho_planilha_configuracao_teste
):
    """Sprint 18.7 — a Central Analítica não pode mais depender de um
    processamento de PDF nem de um clique manual em "Sincronizar agora"
    para ficar disponível: salvar a Configuração Inicial já reconstrói a
    Base Local (Gatilho A), de forma síncrona."""
    _isolar_diretorio_configuracao(monkeypatch, tmp_path)
    caminho_planilha = caminho_planilha_configuracao_teste()

    resposta = client.post(
        "/api/v1/configuracao",
        json={"caminho_planilha_oficial": caminho_planilha},
    )

    assert resposta.status_code == 200

    caminho_sqlite = base_local_sqlite.caminho_base_local_sqlite(diretorio_base=tmp_path / "dados_usuario")
    assert caminho_sqlite.is_file()

    verificacao = client.get("/api/v1/analitica/sincronizacao")
    assert verificacao.status_code == 200
    corpo = verificacao.json()
    assert corpo["status"] != "nunca_sincronizado"
    assert corpo["origem"] == "configuracao_inicial"


def test_post_configuracao_persiste_mesmo_se_reconstrucao_da_base_local_falhar(
    monkeypatch, tmp_path, caminho_planilha_configuracao_teste
):
    """A reconstrução da Base Local (Gatilho A) é best-effort — uma falha
    nela nunca pode impedir a Configuração Inicial de ser salva (mesma
    garantia já homologada para o hook de `planilha_service.py`)."""
    _isolar_diretorio_configuracao(monkeypatch, tmp_path)
    caminho_planilha = caminho_planilha_configuracao_teste()

    def _sincronizar_com_falha(*args, **kwargs):
        raise RuntimeError("falha simulada na reconstrução da Base Local")

    monkeypatch.setattr("app.api.configuracao.base_local.sincronizar", _sincronizar_com_falha)

    resposta = client.post(
        "/api/v1/configuracao",
        json={"caminho_planilha_oficial": caminho_planilha},
    )

    assert resposta.status_code == 200
    assert config.carregar(diretorio_base=tmp_path / "dados_usuario") is not None


def test_alterar_planilha_oficial_tambem_reconstroi_a_base_local(
    monkeypatch, tmp_path, caminho_planilha_configuracao_teste
):
    """"Alterar Planilha Oficial" reusa `POST /api/v1/configuracao` — o
    Gatilho A dispara igualmente, não só na primeira configuração."""
    _isolar_diretorio_configuracao(monkeypatch, tmp_path)
    caminho_v1 = caminho_planilha_configuracao_teste(nome_arquivo="v1.xlsx")
    client.post("/api/v1/configuracao", json={"caminho_planilha_oficial": caminho_v1})

    caminho_v2 = caminho_planilha_configuracao_teste(nome_arquivo="v2.xlsx")
    resposta = client.post("/api/v1/configuracao", json={"caminho_planilha_oficial": caminho_v2})

    assert resposta.status_code == 200
    verificacao = client.get("/api/v1/analitica/sincronizacao")
    assert verificacao.json()["status"] != "nunca_sincronizado"


def test_alterar_planilha_oficial_reutiliza_o_mesmo_post(
    monkeypatch, tmp_path, caminho_planilha_configuracao_teste
):
    """'Alterar Planilha Oficial' (§8) é o mesmo endpoint — trocar a
    configuração não exige que o caminho anterior ainda esteja acessível."""
    _isolar_diretorio_configuracao(monkeypatch, tmp_path)
    caminho_v1 = caminho_planilha_configuracao_teste(nome_arquivo="v1.xlsx")
    client.post("/api/v1/configuracao", json={"caminho_planilha_oficial": caminho_v1})
    os.remove(caminho_v1)

    caminho_v2 = caminho_planilha_configuracao_teste(nome_arquivo="v2.xlsx")
    resposta = client.post("/api/v1/configuracao", json={"caminho_planilha_oficial": caminho_v2})

    assert resposta.status_code == 200
    assert resposta.json()["caminho_planilha_oficial"] == caminho_v2

    verificacao = client.get("/api/v1/configuracao")
    assert verificacao.json()["caminho_planilha_oficial"] == caminho_v2


# --- Organização Automática de PDFs — POST /configuracao/pastas ------------


def test_post_configuracao_pastas_sem_planilha_configurada_falha(monkeypatch, tmp_path):
    _isolar_diretorio_configuracao(monkeypatch, tmp_path)
    pasta = tmp_path / "a_processar"
    pasta.mkdir()

    resposta = client.post(
        "/api/v1/configuracao/pastas", json={"caminho_pdfs_a_processar": str(pasta)}
    )

    assert resposta.status_code == 422
    assert "planilha oficial" in resposta.json()["detail"]


def test_post_configuracao_pastas_persiste_e_libera_prontidao(
    monkeypatch, tmp_path, caminho_planilha_configuracao_teste
):
    _isolar_diretorio_configuracao(monkeypatch, tmp_path)
    caminho_planilha = caminho_planilha_configuracao_teste()
    client.post("/api/v1/configuracao", json={"caminho_planilha_oficial": caminho_planilha})

    pasta_a_processar = tmp_path / "a_processar"
    pasta_processados = tmp_path / "processados"
    pasta_a_processar.mkdir()
    pasta_processados.mkdir()

    resposta = client.post(
        "/api/v1/configuracao/pastas",
        json={"caminho_pdfs_a_processar": str(pasta_a_processar)},
    )
    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["caminho_pdfs_a_processar"] == str(pasta_a_processar.resolve())
    # Só uma das duas pastas exigidas por Processamento Padrão está
    # configurada até aqui — continua bloqueado.
    assert corpo["prontidao_pastas"]["processamento_padrao"]["liberado"] is False

    resposta2 = client.post(
        "/api/v1/configuracao/pastas",
        json={"caminho_pdfs_processados": str(pasta_processados)},
    )
    assert resposta2.status_code == 200
    corpo2 = resposta2.json()
    # A primeira pasta (já configurada na chamada anterior) foi preservada.
    assert corpo2["caminho_pdfs_a_processar"] == str(pasta_a_processar.resolve())
    assert corpo2["caminho_pdfs_processados"] == str(pasta_processados.resolve())
    assert corpo2["prontidao_pastas"]["processamento_padrao"] == {
        "liberado": True,
        "pastas_faltando": [],
    }
    # As demais funcionalidades continuam bloqueadas — nenhum efeito
    # colateral entre elas.
    assert corpo2["prontidao_pastas"]["complemento"]["liberado"] is False
    assert corpo2["prontidao_pastas"]["finalizacao"]["liberado"] is False


def test_prontidao_pastas_bloqueia_de_novo_se_pasta_configurada_for_removida_depois(
    monkeypatch, tmp_path, caminho_planilha_configuracao_teste
):
    """§ Gate das Pastas — drive/pasta removido depois de configurado é
    detectado na próxima revalidação (mesmo princípio já vigente para a
    planilha oficial em `test_get_configuracao_planilha_excluida_apos_
    configurar`): nunca um booleano persistido, sempre recalculado a
    partir do filesystem a cada leitura."""
    _isolar_diretorio_configuracao(monkeypatch, tmp_path)
    caminho_planilha = caminho_planilha_configuracao_teste()
    client.post("/api/v1/configuracao", json={"caminho_planilha_oficial": caminho_planilha})

    pasta_a_confirmar = tmp_path / "a_confirmar"
    pasta_a_confirmar.mkdir()
    resposta = client.post(
        "/api/v1/configuracao/pastas",
        json={"caminho_pdfs_diarias_a_confirmar": str(pasta_a_confirmar)},
    )
    assert resposta.json()["prontidao_pastas"]["finalizacao"] == {"liberado": True, "pastas_faltando": []}

    import shutil

    shutil.rmtree(pasta_a_confirmar)

    verificacao = client.get("/api/v1/configuracao")
    assert verificacao.status_code == 200
    corpo = verificacao.json()
    # O caminho persistido continua o mesmo (nunca apagado sozinho) —
    # só a prontidão reflete que a pasta não existe mais.
    assert corpo["caminho_pdfs_diarias_a_confirmar"] == str(pasta_a_confirmar.resolve())
    assert corpo["prontidao_pastas"]["finalizacao"] == {
        "liberado": False,
        "pastas_faltando": ["PDFs de Diárias a Confirmar"],
    }
    # As demais funcionalidades, que nunca dependeram dessa pasta,
    # continuam com seu próprio estado — nenhum efeito colateral cruzado.
    assert corpo["prontidao_pastas"]["processamento_padrao"]["liberado"] is False


def test_post_configuracao_pastas_caminho_inexistente_e_rejeitado(
    monkeypatch, tmp_path, caminho_planilha_configuracao_teste
):
    _isolar_diretorio_configuracao(monkeypatch, tmp_path)
    caminho_planilha = caminho_planilha_configuracao_teste()
    client.post("/api/v1/configuracao", json={"caminho_planilha_oficial": caminho_planilha})

    resposta = client.post(
        "/api/v1/configuracao/pastas",
        json={"caminho_pdfs_a_processar": str(tmp_path / "nao_existe")},
    )

    assert resposta.status_code == 422
    assert config.carregar(diretorio_base=tmp_path / "dados_usuario").caminho_pdfs_a_processar is None


def test_post_configuracao_pastas_duplicadas_e_rejeitado(
    monkeypatch, tmp_path, caminho_planilha_configuracao_teste
):
    _isolar_diretorio_configuracao(monkeypatch, tmp_path)
    caminho_planilha = caminho_planilha_configuracao_teste()
    client.post("/api/v1/configuracao", json={"caminho_planilha_oficial": caminho_planilha})

    pasta_unica = tmp_path / "so_uma_pasta"
    pasta_unica.mkdir()
    client.post(
        "/api/v1/configuracao/pastas",
        json={"caminho_pdfs_a_processar": str(pasta_unica)},
    )

    resposta = client.post(
        "/api/v1/configuracao/pastas",
        json={"caminho_pdfs_processados": str(pasta_unica)},
    )

    assert resposta.status_code == 422
    assert "mesmo caminho" in resposta.json()["detail"]


def test_post_configuracao_pastas_nenhum_campo_informado_e_rejeitado(
    monkeypatch, tmp_path, caminho_planilha_configuracao_teste
):
    _isolar_diretorio_configuracao(monkeypatch, tmp_path)
    caminho_planilha = caminho_planilha_configuracao_teste()
    client.post("/api/v1/configuracao", json={"caminho_planilha_oficial": caminho_planilha})

    resposta = client.post("/api/v1/configuracao/pastas", json={})

    assert resposta.status_code == 422


def test_alterar_planilha_oficial_preserva_pastas_operacionais_ja_configuradas(
    monkeypatch, tmp_path, caminho_planilha_configuracao_teste
):
    """Trocar a planilha via 'Alterar Planilha Oficial' nunca pode apagar
    silenciosamente as pastas operacionais já selecionadas pelo usuário."""
    _isolar_diretorio_configuracao(monkeypatch, tmp_path)
    caminho_v1 = caminho_planilha_configuracao_teste(nome_arquivo="v1.xlsx")
    client.post("/api/v1/configuracao", json={"caminho_planilha_oficial": caminho_v1})

    pasta_a_processar = tmp_path / "a_processar"
    pasta_a_processar.mkdir()
    client.post(
        "/api/v1/configuracao/pastas",
        json={"caminho_pdfs_a_processar": str(pasta_a_processar)},
    )

    caminho_v2 = caminho_planilha_configuracao_teste(nome_arquivo="v2.xlsx")
    resposta = client.post("/api/v1/configuracao", json={"caminho_planilha_oficial": caminho_v2})

    assert resposta.status_code == 200
    assert resposta.json()["caminho_pdfs_a_processar"] == str(pasta_a_processar.resolve())


def test_post_configuracao_pastas_nome_fisico_e_livre_nunca_precisa_bater_com_o_rotulo(
    monkeypatch, tmp_path, caminho_planilha_configuracao_teste
):
    """Regra definitiva (não uma preferência): os nomes exibidos nos campos
    ("PDFs a Processar" etc., `ROTULOS_PASTAS_OPERACIONAIS`) são só o papel
    funcional que o usuário atribui à pasta ao escolhê-la para aquele campo
    — nunca uma exigência sobre o nome físico do diretório. Uma pasta
    chamada 'pasta 1' (ou qualquer outro nome) deve ser aceita no campo
    "PDFs a Processar" exatamente como qualquer outra pasta válida. Este
    teste existe para nunca deixar essa validação por nome ser reintroduzida
    por engano no futuro."""
    _isolar_diretorio_configuracao(monkeypatch, tmp_path)
    caminho_planilha = caminho_planilha_configuracao_teste()
    client.post("/api/v1/configuracao", json={"caminho_planilha_oficial": caminho_planilha})

    nomes_arbitrarios = [
        "pasta 1",
        "Gabriel",
        "Diárias Agosto",
        "nome-com-hifen",
        "nome_com_underscore",
        "PDFs a Processar",  # o próprio rótulo também deve continuar aceito
    ]
    for nome in nomes_arbitrarios:
        pasta = tmp_path / nome
        pasta.mkdir()

        resposta = client.post(
            "/api/v1/configuracao/pastas",
            json={"caminho_pdfs_a_processar": str(pasta)},
        )

        assert resposta.status_code == 200, f"pasta com nome {nome!r} deveria ser aceita"
        assert resposta.json()["caminho_pdfs_a_processar"] == str(pasta.resolve())
