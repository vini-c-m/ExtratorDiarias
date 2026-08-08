import csv
import logging
import sqlite3
from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient
from openpyxl import Workbook, load_workbook

from app.consulta import base_local, base_local_sqlite, repositorio_analitico
from app.consulta.repositorio_analitico import PaginaDeRegistros
from app.consulta.repositorio_diarias import ResultadoDiariasCompletas
from app.domain.entities.aviso_linha_ignorada import AvisoLinhaIgnorada
from app.domain.entities.registro_analitico import RegistroAnalitico
from app.domain.entities.registro_diaria_indexada import RegistroDiariaIndexada
from app.domain.entities.servidor import Servidor
from app.infra.config import configuracao_app
from app.main import app
from app.services import analitica_service

# A fixture autouse `_isolar_base_local_da_appdata_real` (tests/conftest.py)
# já garante que `VAR_AMBIENTE_USER_DATA` aponta para um diretório
# temporário isolado por teste — não precisamos configurar isso aqui.
client = TestClient(app)


def _registro(sei, cpf, periodo_inicial, periodo_final, cidade_origem, cidade_destino, motivo, *,
              transporte=None, valor=None, linha=2, doc_origem="PJTESTE", dh=None):
    return RegistroDiariaIndexada(
        linha=linha, sei=sei, doc_origem=doc_origem, cpf=cpf,
        periodo_inicial=periodo_inicial, periodo_final=periodo_final,
        cidade_origem=cidade_origem, cidade_destino=cidade_destino,
        motivo=motivo, transporte=transporte, valor_total_diarias=valor, dh=dh,
    )


REGISTROS = [
    _registro("19.20.0001.0000001/2026-01", "11111111111", date(2026, 1, 8), date(2026, 1, 10), "RECIFE", "GARANHUNS", "Reunião", transporte="CARRO", valor=200.0, linha=2),
    _registro("19.20.0001.0000002/2026-02", "22222222222", date(2026, 2, 1), date(2026, 2, 3), "RECIFE", "ARARIPINA", "Fiscalização", transporte="AVIAO", valor=350.5, linha=3),
    _registro("19.20.0001.0000003/2026-03", "33333333333", date(2026, 3, 5), date(2026, 3, 6), "CARUARU", "RECIFE", "Reunião", linha=4),
    _registro("19.20.0001.0000004/2026-04", "44444444444", date(2026, 4, 10), date(2026, 4, 12), "OLINDA", "RECIFE", "Auditoria", transporte="CARRO", valor=180.25, linha=5),
]

SERVIDORES = {
    "11111111111": Servidor(cpf="11111111111", nome="Maria Souza", cargo="Analista", previdencia="RPPS", matricula="1001", situacao="Em exercício"),
    "22222222222": Servidor(cpf="22222222222", nome="João Silva", cargo="Técnico", previdencia="RGPS", matricula="1002", situacao="Em exercício"),
    "33333333333": Servidor(cpf="33333333333", nome="Ana Costa", cargo="Analista", previdencia="RPPS", matricula="1003", situacao="Licença"),
    # 44444444444 propositalmente ausente — diária sem cadastro em Dados.
}


_SINAL_FRESCOR_PADRAO = base_local_sqlite.SinalFrescor(tamanho_bytes=1, mtime=1.0, linhas_controle_diarias=len(REGISTROS) + 1)


def _sincronizar_base_sqlite(registros=REGISTROS, servidores=SERVIDORES, avisos=None, sinal=None):
    resultado = ResultadoDiariasCompletas(
        diarias={registro.sei: registro for registro in registros}, avisos=avisos or [], linhas_ignoradas=0
    )
    sinal_frescor = sinal or base_local_sqlite.SinalFrescor(
        tamanho_bytes=1, mtime=1.0, linhas_controle_diarias=len(registros) + 1
    )
    destino = base_local_sqlite.caminho_base_local_sqlite()
    base_local_sqlite.reconstruir(resultado, servidores, sinal_frescor, origem="teste", caminho_destino=destino)
    return destino


def test_diarias_sem_filtros_retorna_todas_paginadas():
    _sincronizar_base_sqlite()
    resposta = client.get("/api/v1/analitica/diarias")

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["paginacao"]["total_itens"] == len(REGISTROS)
    assert corpo["paginacao"]["pagina_atual"] == 1
    assert len(corpo["itens"]) == len(REGISTROS)
    assert corpo["sincronizacao"]["sincronizado_em"]
    assert corpo["sincronizacao"]["total_avisos"] == 0


def test_diarias_campos_opcionais_da_configuracao_de_colunas_preenchidos():
    """Sprint 19.5.7.1 — REGISTROS[0] tem origem, transporte e servidor
    cadastrado com situação; confirma que os 4 campos novos chegam
    corretos e que o CPF nunca aparece completo."""
    _sincronizar_base_sqlite()
    resposta = client.get("/api/v1/analitica/diarias", params={"sei": REGISTROS[0].sei})

    assert resposta.status_code == 200
    item = resposta.json()["itens"][0]
    assert item["origem"] == "RECIFE"
    assert item["doc_origem"] == "PJTESTE"
    assert item["transporte"] == "CARRO"
    assert item["servidor"]["situacao"] == "Em exercício"
    assert item["cpf_mascarado"] == "***.***.***-11"
    assert "cpf" not in item


def test_diarias_campos_opcionais_nulos_quando_transporte_ausente():
    """REGISTROS[2] (CARUARU -> RECIFE) não tem transporte informado."""
    _sincronizar_base_sqlite()
    resposta = client.get("/api/v1/analitica/diarias", params={"sei": REGISTROS[2].sei})

    assert resposta.status_code == 200
    item = resposta.json()["itens"][0]
    assert item["transporte"] is None
    assert item["origem"] == "CARUARU"
    assert item["cpf_mascarado"] == "***.***.***-33"


def test_diarias_situacao_ausente_quando_servidor_sem_cadastro():
    """REGISTROS[3] (44444444444) não tem cadastro em SERVIDORES —
    `servidor` inteiro é `None`, então `situacao` nunca aparece
    isoladamente sem o restante do objeto."""
    _sincronizar_base_sqlite()
    resposta = client.get("/api/v1/analitica/diarias", params={"sei": REGISTROS[3].sei})

    assert resposta.status_code == 200
    item = resposta.json()["itens"][0]
    assert item["servidor"] is None
    # Mesmo sem cadastro de servidor, o CPF da diária em si existe e
    # continua sendo mascarado normalmente — são dados independentes.
    assert item["cpf_mascarado"] == "***.***.***-44"


def test_diarias_nunca_retorna_cpf_completo_de_nenhum_registro():
    """Sprint 19.5.7.1 — regra absoluta (`ui-arquitetura.md` § 0.7): varre
    o corpo bruto da resposta e confirma que nenhum dos 4 CPFs reais da
    massa de teste aparece como sequência de 11 dígitos consecutivos."""
    _sincronizar_base_sqlite()
    resposta = client.get("/api/v1/analitica/diarias")

    assert resposta.status_code == 200
    corpo_bruto = resposta.text
    cpfs_completos = {"11111111111", "22222222222", "33333333333", "44444444444"}
    for cpf in cpfs_completos:
        assert cpf not in corpo_bruto

    # Confirma que as versões mascaradas, essas sim, estão presentes —
    # não é uma ausência de dado, é uma ausência do dado *completo*.
    assert "***.***.***-11" in corpo_bruto
    assert "***.***.***-44" in corpo_bruto


def test_diarias_com_registro_de_cpf_none_nao_gera_500_e_devolve_cpf_mascarado_null(
    monkeypatch,
):
    """Sprint 19.5.7.1.1 — reproduz, com um dublê controlado, o achado da
    Auditoria Técnica da 19.5.7.1: a coluna `cpf` do SQLite é `NOT NULL`,
    então nenhum fluxo real de sincronização produz um `RegistroAnalitico`
    com `cpf=None` — mas o código precisa tolerar essa condição sem
    quebrar (defesa em profundidade), caso essa garantia mude no futuro.
    Antes da correção 19.5.7.1.1, isso derrubava a rota com 500
    (`TypeError` não tratada dentro de `mascarar_cpf`)."""
    _sincronizar_base_sqlite()

    registro_cpf_none = RegistroAnalitico(
        sei="19.20.9999.0000000/2026-99",
        doc_origem="PJTESTE",
        cpf=None,  # type: ignore[arg-type]  — cenário controlado, fora do tipo declarado, de propósito
        periodo_inicial=date(2026, 1, 1),
        periodo_final=date(2026, 1, 2),
        cidade_origem="RECIFE",
        cidade_destino="OLINDA",
        motivo="Cenário de teste — cpf None",
        transporte=None,
        valor_total_diarias=None,
        linha_planilha=999,
        servidor=None,
    )

    def _listar_diarias_com_cpf_none(*_args, **_kwargs):
        return PaginaDeRegistros(itens=[registro_cpf_none], total_itens=1)

    monkeypatch.setattr(repositorio_analitico, "listar_diarias", _listar_diarias_com_cpf_none)

    resposta = client.get("/api/v1/analitica/diarias")

    assert resposta.status_code == 200
    item = resposta.json()["itens"][0]
    assert item["cpf_mascarado"] is None


def test_diarias_categoria_funcional_servidor_por_padrao_para_cargos_administrativos():
    """Nenhum cargo de `SERVIDORES` é membro (Analista/Técnico) — sem
    filtro, cada item já vem com `categoria_funcional` calculada; o
    registro sem cadastro (CPF 44444444444) vem `NAO_IDENTIFICADO`."""
    _sincronizar_base_sqlite()
    resposta = client.get("/api/v1/analitica/diarias")

    assert resposta.status_code == 200
    por_sei = {item["sei"]: item["categoria_funcional"] for item in resposta.json()["itens"]}
    assert por_sei[REGISTROS[0].sei] == "SERVIDOR"
    assert por_sei[REGISTROS[3].sei] == "NAO_IDENTIFICADO"


def test_diarias_filtro_categoria_funcional_membro_end_to_end():
    """Filtro primário "Todos | Membros | Servidores" (Sprint 20) —
    adiciona um cadastro/diária de membro real (Promotor de Justiça) e
    confirma que `categoria_funcional=MEMBRO` isola só esse registro."""
    registros = [
        *REGISTROS,
        _registro(
            "19.20.0001.0000005/2026-05", "55555555555",
            date(2026, 5, 1), date(2026, 5, 2), "RECIFE", "CARUARU", "Correição",
            linha=6,
        ),
    ]
    servidores = {
        **SERVIDORES,
        "55555555555": Servidor(
            cpf="55555555555", nome="Carlos Mendes", cargo="Procurador de Justiça",
            previdencia="FUNAFIN", matricula="2001", situacao="Em exercício",
        ),
    }
    _sincronizar_base_sqlite(registros=registros, servidores=servidores)

    resposta = client.get("/api/v1/analitica/diarias", params={"categoria_funcional": "MEMBRO"})

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["paginacao"]["total_itens"] == 1
    assert corpo["itens"][0]["sei"] == "19.20.0001.0000005/2026-05"
    assert corpo["itens"][0]["categoria_funcional"] == "MEMBRO"

    resposta_todos = client.get("/api/v1/analitica/diarias")
    assert resposta_todos.json()["paginacao"]["total_itens"] == len(registros)


def test_diarias_filtro_categoria_funcional_invalido_retorna_422():
    _sincronizar_base_sqlite()
    resposta = client.get("/api/v1/analitica/diarias", params={"categoria_funcional": "NAO_IDENTIFICADO"})
    assert resposta.status_code == 422


def test_diarias_filtro_sei_end_to_end():
    _sincronizar_base_sqlite()
    resposta = client.get("/api/v1/analitica/diarias", params={"sei": REGISTROS[0].sei})

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["paginacao"]["total_itens"] == 1
    assert corpo["itens"][0]["sei"] == REGISTROS[0].sei
    assert corpo["itens"][0]["servidor"]["nome"] == "Maria Souza"
    assert corpo["itens"][0]["servidor"]["matricula"] == "1001"


def test_diarias_filtro_municipio_end_to_end():
    _sincronizar_base_sqlite()
    resposta = client.get("/api/v1/analitica/diarias", params={"municipio": "araripina"})

    assert resposta.status_code == 200
    assert resposta.json()["paginacao"]["total_itens"] == 1


def test_diarias_combinacao_de_filtros_end_to_end():
    _sincronizar_base_sqlite()
    resposta = client.get(
        "/api/v1/analitica/diarias", params={"motivo": "Reunião", "municipio": "recife"}
    )

    assert resposta.status_code == 200
    assert resposta.json()["paginacao"]["total_itens"] == 2


def test_diarias_filtro_origem_end_to_end():
    """REGISTROS[3] (OLINDA -> RECIFE) é a única diária com origem OLINDA
    — prova que `origem` isola a ponta de partida, diferente de
    `municipio` (que casaria origem OU destino)."""
    _sincronizar_base_sqlite()
    resposta = client.get("/api/v1/analitica/diarias", params={"origem": "olinda"})

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["paginacao"]["total_itens"] == 1
    assert corpo["itens"][0]["sei"] == REGISTROS[3].sei


def test_diarias_filtro_destino_end_to_end():
    """REGISTROS[0] (RECIFE -> GARANHUNS) é a única diária com destino
    GARANHUNS."""
    _sincronizar_base_sqlite()
    resposta = client.get("/api/v1/analitica/diarias", params={"destino": "garanhuns"})

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["paginacao"]["total_itens"] == 1
    assert corpo["itens"][0]["sei"] == REGISTROS[0].sei


def test_diarias_filtro_trecho_end_to_end():
    """REGISTROS[2] é CARUARU -> RECIFE — prova que `trecho` casa a
    concatenação "origem - destino", não cada cidade isoladamente."""
    _sincronizar_base_sqlite()
    resposta = client.get("/api/v1/analitica/diarias", params={"trecho": "caruaru - recife"})

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["paginacao"]["total_itens"] == 1
    assert corpo["itens"][0]["sei"] == REGISTROS[2].sei


def test_diarias_filtro_valor_minimo_end_to_end():
    """valor >= 200: REGISTROS[0] (200.0) e REGISTROS[1] (350.5)."""
    _sincronizar_base_sqlite()
    resposta = client.get("/api/v1/analitica/diarias", params={"valor_minimo": 200})

    assert resposta.status_code == 200
    seis = {item["sei"] for item in resposta.json()["itens"]}
    assert seis == {REGISTROS[0].sei, REGISTROS[1].sei}


def test_diarias_filtro_valor_maximo_end_to_end():
    """valor <= 200: REGISTROS[0] (200.0) e REGISTROS[3] (180.25);
    REGISTROS[2] (sem valor) nunca casa com uma faixa de valor."""
    _sincronizar_base_sqlite()
    resposta = client.get("/api/v1/analitica/diarias", params={"valor_maximo": 200})

    assert resposta.status_code == 200
    seis = {item["sei"] for item in resposta.json()["itens"]}
    assert seis == {REGISTROS[0].sei, REGISTROS[3].sei}


def test_diarias_valor_maximo_menor_que_valor_minimo_retorna_422():
    """Mesma disciplina já aplicada a período (`_periodo_valido`) — a
    validação cruzada acontece na camada de schema, antes de qualquer
    consulta à Base Local."""
    _sincronizar_base_sqlite()
    resposta = client.get(
        "/api/v1/analitica/diarias", params={"valor_minimo": 300, "valor_maximo": 100}
    )
    assert resposta.status_code == 422


def test_diarias_pesquisa_textual_q_end_to_end():
    _sincronizar_base_sqlite()
    resposta = client.get("/api/v1/analitica/diarias", params={"q": "costa"})

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["paginacao"]["total_itens"] == 1
    assert corpo["itens"][0]["servidor"]["nome"] == "Ana Costa"


def test_diarias_sem_resultado_retorna_200_lista_vazia():
    _sincronizar_base_sqlite()
    resposta = client.get("/api/v1/analitica/diarias", params={"motivo": "Motivo Inexistente"})

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["itens"] == []
    assert corpo["paginacao"]["total_itens"] == 0
    assert corpo["paginacao"]["total_paginas"] == 0


def test_diarias_registro_sem_cadastro_tem_servidor_nulo():
    _sincronizar_base_sqlite()
    resposta = client.get("/api/v1/analitica/diarias", params={"sei": REGISTROS[3].sei})

    assert resposta.status_code == 200
    assert resposta.json()["itens"][0]["servidor"] is None


def test_diarias_servidor_com_matricula_nula_retorna_200_sem_validation_error():
    """Correção 18.6.2 (bug B1 da auditoria final): antes desta correção,
    `ServidorResumoResposta.matricula` era `str` obrigatório — um servidor
    com `nome` preenchido e `matricula` nula (permitido pelo domínio,
    `Servidor.matricula: str | None`) fazia a construção da resposta
    lançar `ValidationError`, virando HTTP 500 em `GET /diarias`. Mesma
    decisão já homologada para `ServidorCompletoResposta` (17.4.4.1),
    agora também aplicada a `ServidorResumoResposta`."""
    sei = "19.20.0001.0000008/2026-08"
    registro = _registro(sei, "88888888888", date(2026, 8, 1), date(2026, 8, 2), "RECIFE", "CARUARU", "Reunião", linha=9)
    servidor_sem_matricula = Servidor(
        cpf="88888888888", nome="Paulo Rocha", cargo="Analista", previdencia="RPPS",
        matricula=None, situacao="Em exercício",
    )
    _sincronizar_base_sqlite(registros=[registro], servidores={"88888888888": servidor_sem_matricula})

    resposta = client.get("/api/v1/analitica/diarias", params={"sei": sei})

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["paginacao"]["total_itens"] == 1
    item = corpo["itens"][0]
    assert item["sei"] == sei
    assert item["servidor"] is not None
    assert item["servidor"]["nome"] == "Paulo Rocha"
    assert item["servidor"]["matricula"] is None
    # Restante da resposta preservado — a correção não muda nenhum outro campo.
    assert item["destino"] == "CARUARU"
    assert item["motivo"] == "Reunião"


def test_diarias_servidor_com_matricula_preenchida_comportamento_anterior_preservado():
    """Correção 18.6.2 — guarda de regressão: servidor com `matricula`
    preenchida continua se comportando exatamente como antes da correção
    (campo obrigatório `str` sempre foi satisfeito nesse caso)."""
    _sincronizar_base_sqlite()
    resposta = client.get("/api/v1/analitica/diarias", params={"sei": REGISTROS[0].sei})

    assert resposta.status_code == 200
    servidor = resposta.json()["itens"][0]["servidor"]
    assert servidor["nome"] == "Maria Souza"
    assert servidor["matricula"] == "1001"
    assert isinstance(servidor["matricula"], str)


def test_diarias_e_detalhamento_consistentes_para_servidor_sem_e_com_matricula():
    """Correção 18.6.2 — confirma que o detalhamento por SEI (`GET
    /diarias/{sei}`, já corrigido desde a 17.4.4.1) e a listagem (`GET
    /diarias`, corrigida agora) concordam nos dois cenários: matrícula
    nula e matrícula preenchida."""
    sei_sem_matricula = "19.20.0001.0000009/2026-09"
    registro_sem_matricula = _registro(
        sei_sem_matricula, "99999999999", date(2026, 9, 1), date(2026, 9, 2), "RECIFE", "OLINDA", "Reunião", linha=10,
    )
    servidor_sem_matricula = Servidor(
        cpf="99999999999", nome="Renata Alves", cargo="Técnico", previdencia="RGPS",
        matricula=None, situacao="Em exercício",
    )
    _sincronizar_base_sqlite(
        registros=[registro_sem_matricula], servidores={"99999999999": servidor_sem_matricula}
    )

    resposta_lista = client.get("/api/v1/analitica/diarias", params={"sei": sei_sem_matricula})
    resposta_detalhe = client.get(f"/api/v1/analitica/diarias/{sei_sem_matricula}")

    assert resposta_lista.status_code == 200
    assert resposta_detalhe.status_code == 200
    assert resposta_lista.json()["itens"][0]["servidor"]["matricula"] is None
    assert resposta_detalhe.json()["servidor"]["matricula"] is None

    # Cenário com matrícula preenchida (dado já sincronizado no teste
    # anterior a este arquivo, `REGISTROS[0]`/`SERVIDORES["11111111111"]`).
    sei_com_matricula = REGISTROS[0].sei
    _sincronizar_base_sqlite()
    resposta_lista_preenchida = client.get("/api/v1/analitica/diarias", params={"sei": sei_com_matricula})
    resposta_detalhe_preenchida = client.get(f"/api/v1/analitica/diarias/{sei_com_matricula}")

    assert resposta_lista_preenchida.status_code == 200
    assert resposta_detalhe_preenchida.status_code == 200
    assert resposta_lista_preenchida.json()["itens"][0]["servidor"]["matricula"] == "1001"
    assert resposta_detalhe_preenchida.json()["servidor"]["matricula"] == "1001"


def test_diarias_paginacao_e_ordenacao_end_to_end():
    _sincronizar_base_sqlite()
    resposta = client.get(
        "/api/v1/analitica/diarias",
        params={"ordenar_por": "sei", "ordem": "asc", "pagina": 2, "tamanho_pagina": 2},
    )

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["paginacao"]["pagina_atual"] == 2
    assert corpo["paginacao"]["total_paginas"] == 2
    assert len(corpo["itens"]) == 2
    assert corpo["itens"][0]["sei"] == REGISTROS[2].sei
    assert corpo["itens"][1]["sei"] == REGISTROS[3].sei


def test_diarias_pagina_invalida_retorna_422():
    _sincronizar_base_sqlite()
    resposta = client.get("/api/v1/analitica/diarias", params={"pagina": 0})
    assert resposta.status_code == 422


def test_diarias_tamanho_pagina_acima_do_teto_retorna_422():
    _sincronizar_base_sqlite()
    resposta = client.get("/api/v1/analitica/diarias", params={"tamanho_pagina": 101})
    assert resposta.status_code == 422


def test_diarias_ordenar_por_invalido_retorna_422():
    _sincronizar_base_sqlite()
    resposta = client.get("/api/v1/analitica/diarias", params={"ordenar_por": "coisa_invalida"})
    assert resposta.status_code == 422


def test_diarias_periodo_final_antes_do_inicial_retorna_422():
    _sincronizar_base_sqlite()
    resposta = client.get(
        "/api/v1/analitica/diarias",
        params={"periodo_inicial": "2026-05-01", "periodo_final": "2026-01-01"},
    )
    assert resposta.status_code == 422


def test_diarias_base_local_inexistente_retorna_503():
    # Nenhuma sincronização feita — diretório isolado do teste está vazio.
    resposta = client.get("/api/v1/analitica/diarias")
    assert resposta.status_code == 503


def test_diarias_base_local_invalida_retorna_503():
    caminho = base_local_sqlite.caminho_base_local_sqlite()
    caminho.parent.mkdir(parents=True, exist_ok=True)
    caminho.write_bytes(b"isto nao e um banco sqlite")

    resposta = client.get("/api/v1/analitica/diarias")
    assert resposta.status_code == 503


def test_detalhar_diaria_sei_existente_retorna_200_resposta_completa():
    _sincronizar_base_sqlite()
    sei = REGISTROS[0].sei
    resposta = client.get(f"/api/v1/analitica/diarias/{sei}")

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["sei"] == sei
    assert corpo["periodo"] == {"inicial": "2026-01-08", "final": "2026-01-10"}
    assert corpo["destino"] == "GARANHUNS"
    assert corpo["motivo"] == "Reunião"
    assert corpo["valor_total_diarias"] == 200.0
    assert corpo["doc_origem"] == "PJTESTE"
    assert corpo["cpf"] == "11111111111"
    assert corpo["trecho"] == {"origem": "RECIFE", "destino": "GARANHUNS"}
    assert corpo["transporte"] == "CARRO"
    assert corpo["referencia_administrativa"] == {"linha_planilha": 2}
    assert corpo["servidor"] == {
        "nome": "Maria Souza",
        "cargo": "Analista",
        "previdencia": "RPPS",
        "matricula": "1001",
        "situacao": "Em exercício",
    }
    assert corpo["sincronizacao"]["sincronizado_em"]
    assert corpo["sincronizacao"]["total_avisos"] == 0


def test_detalhar_diaria_sem_cadastro_tem_servidor_nulo():
    _sincronizar_base_sqlite()
    sei = REGISTROS[3].sei
    resposta = client.get(f"/api/v1/analitica/diarias/{sei}")

    assert resposta.status_code == 200
    assert resposta.json()["servidor"] is None


def test_detalhar_diaria_servidor_com_matricula_e_situacao_nulas_retorna_200():
    """Sprint 17.4.4.1 — decisão arquitetural defensiva
    (`docs/central-analitica/api-plano-tecnico.md § 8`): `matricula`/
    `situacao` são `str | None` no contrato; um servidor com esses dois
    campos nulos não pode ser descartado nem quebrar a serialização."""
    sei = "19.20.0001.0000006/2026-06"
    registro = _registro(sei, "66666666666", date(2026, 6, 1), date(2026, 6, 2), "RECIFE", "PETROLINA", "Reunião", linha=7)
    servidor_incompleto = Servidor(
        cpf="66666666666", nome="Carlos Lima", cargo="Analista", previdencia="RPPS",
        matricula=None, situacao=None,
    )
    _sincronizar_base_sqlite(registros=[registro], servidores={"66666666666": servidor_incompleto})

    resposta = client.get(f"/api/v1/analitica/diarias/{sei}")

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["servidor"] is not None
    assert corpo["servidor"]["nome"] == "Carlos Lima"
    assert corpo["servidor"]["matricula"] is None
    assert corpo["servidor"]["situacao"] is None


def test_detalhar_diaria_servidor_com_matricula_e_situacao_vazias_retorna_200():
    sei = "19.20.0001.0000007/2026-07"
    registro = _registro(sei, "77777777777", date(2026, 7, 1), date(2026, 7, 2), "RECIFE", "SERRA TALHADA", "Fiscalização", linha=8)
    servidor_incompleto = Servidor(
        cpf="77777777777", nome="Beatriz Nunes", cargo="Técnico", previdencia="RGPS",
        matricula="", situacao="",
    )
    _sincronizar_base_sqlite(registros=[registro], servidores={"77777777777": servidor_incompleto})

    resposta = client.get(f"/api/v1/analitica/diarias/{sei}")

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["servidor"] is not None
    assert corpo["servidor"]["nome"] == "Beatriz Nunes"
    assert corpo["servidor"]["matricula"] == ""
    assert corpo["servidor"]["situacao"] == ""


def test_detalhar_diaria_sem_nenhum_caso_aplicavel_devolve_diagnosticos_vazio():
    """Critério de aceite explícito da 19.8.3."""
    sei = "19.20.0001.0000008/2026-08"
    registro = _registro(
        sei, "88888888888", date(2026, 1, 1), date(2026, 1, 3), "RECIFE", "PETROLINA", "Reunião",
        transporte="CARRO", valor=150.0, linha=9, dh="DH-999",
    )
    servidor = Servidor(cpf="88888888888", nome="Rita Alves", cargo="Analista", previdencia="RPPS", matricula="2001", situacao="Em exercício")
    _sincronizar_base_sqlite(registros=[registro], servidores={"88888888888": servidor})

    resposta = client.get(f"/api/v1/analitica/diarias/{sei}")

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert "diagnosticos" in corpo
    assert corpo["diagnosticos"] == []


def test_detalhar_diaria_com_caso_aplicavel_devolve_diagnostico_correspondente():
    sei = "19.20.0001.0000009/2026-09"
    registro = _registro(
        sei, "88888888888", date(2026, 1, 1), date(2026, 1, 3), "RECIFE", "PETROLINA", "Reunião",
        transporte="CARRO", valor=150.0, linha=10, dh=None,
    )
    servidor = Servidor(cpf="88888888888", nome="Rita Alves", cargo="Analista", previdencia="RPPS", matricula="2001", situacao="Em exercício")
    _sincronizar_base_sqlite(registros=[registro], servidores={"88888888888": servidor})

    resposta = client.get(f"/api/v1/analitica/diarias/{sei}")

    assert resposta.status_code == 200
    diagnosticos = resposta.json()["diagnosticos"]
    assert len(diagnosticos) == 1
    caso = diagnosticos[0]
    assert caso["titulo"] == "Documento Hábil ausente — motivo não identificado"
    assert caso["campo"] == "dh"
    assert set(caso.keys()) == {"campo", "titulo", "motivo", "acao_recomendada"}


def test_detalhar_diaria_diagnosticos_nunca_inclui_duplicidade():
    """Decisão registrada em `analitica_service.detalhar_diaria`:
    duplicidade depende de comparar contra outros registros de um
    recorte, que este endpoint de SEI único não tem — mesmo com outro
    registro idêntico em CPF/período existindo na base, `diagnosticos`
    nunca inclui 'Possível duplicidade' aqui (só `GET /diagnostico` faz
    essa checagem, sobre um recorte explícito)."""
    sei_a = "19.20.0001.0000010/2026-10"
    sei_b = "19.20.0001.0000011/2026-11"
    registro_a = _registro(sei_a, "88888888888", date(2026, 1, 1), date(2026, 1, 3), "RECIFE", "PETROLINA", "Reunião", valor=150.0, linha=11, dh="DH-A")
    registro_b = _registro(sei_b, "88888888888", date(2026, 1, 1), date(2026, 1, 3), "RECIFE", "PETROLINA", "Reunião", valor=150.0, linha=12, dh="DH-B")
    servidor = Servidor(cpf="88888888888", nome="Rita Alves", cargo="Analista", previdencia="RPPS", matricula="2001", situacao="Em exercício")
    _sincronizar_base_sqlite(registros=[registro_a, registro_b], servidores={"88888888888": servidor})

    resposta = client.get(f"/api/v1/analitica/diarias/{sei_a}")

    assert resposta.status_code == 200
    titulos = {caso["titulo"] for caso in resposta.json()["diagnosticos"]}
    assert "Possível duplicidade" not in titulos


def test_detalhar_diaria_sei_inexistente_retorna_404():
    _sincronizar_base_sqlite()
    resposta = client.get("/api/v1/analitica/diarias/19.20.0001.9999999/2026-99")

    assert resposta.status_code == 404
    assert resposta.json()["detail"]


def test_detalhar_diaria_sql_injection_via_sei_retorna_404_sem_afetar_a_base():
    _sincronizar_base_sqlite()
    resposta = client.get("/api/v1/analitica/diarias/x'; DROP TABLE diarias; --")
    assert resposta.status_code == 404

    # confirma que a tabela sobreviveu — se a injeção tivesse funcionado,
    # a listagem abaixo levantaria erro ou devolveria 0 itens.
    resposta_listagem = client.get("/api/v1/analitica/diarias")
    assert resposta_listagem.status_code == 200
    assert resposta_listagem.json()["paginacao"]["total_itens"] == len(REGISTROS)


def test_detalhar_diaria_caracteres_especiais_retorna_404_sem_erro_interno():
    _sincronizar_base_sqlite()
    resposta = client.get("/api/v1/analitica/diarias/19.20.0001.0000099/2026-çãé%")
    assert resposta.status_code == 404


def test_detalhar_diaria_base_local_inexistente_retorna_503():
    resposta = client.get(f"/api/v1/analitica/diarias/{REGISTROS[0].sei}")
    assert resposta.status_code == 503


def test_detalhar_diaria_base_local_invalida_retorna_503():
    caminho = base_local_sqlite.caminho_base_local_sqlite()
    caminho.parent.mkdir(parents=True, exist_ok=True)
    caminho.write_bytes(b"isto nao e um banco sqlite")

    resposta = client.get(f"/api/v1/analitica/diarias/{REGISTROS[0].sei}")
    assert resposta.status_code == 503


def test_opcoes_filtro_retorna_valores_distintos_ordenados_end_to_end():
    _sincronizar_base_sqlite()
    resposta = client.get("/api/v1/analitica/opcoes-filtro")

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["motivos"] == ["Auditoria", "Fiscalização", "Reunião"]
    assert corpo["situacoes"] == ["Em exercício", "Licença"]
    assert corpo["municipios"] == ["ARARIPINA", "CARUARU", "GARANHUNS", "OLINDA", "RECIFE"]
    # "Opções de Filtro" não embute carimbo de sincronização (contrato
    # aprovado, Fase 4 de `api-arquitetura.md`) — diferente de
    # `GET /diarias`/`GET /diarias/{sei}`.
    assert "sincronizacao" not in corpo


def test_opcoes_filtro_base_vazia_retorna_200_listas_vazias():
    _sincronizar_base_sqlite(registros=[], servidores={})
    resposta = client.get("/api/v1/analitica/opcoes-filtro")

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo == {"motivos": [], "situacoes": [], "municipios": []}


def test_opcoes_filtro_base_local_inexistente_retorna_503():
    resposta = client.get("/api/v1/analitica/opcoes-filtro")
    assert resposta.status_code == 503


def test_opcoes_filtro_base_local_invalida_retorna_503():
    caminho = base_local_sqlite.caminho_base_local_sqlite()
    caminho.parent.mkdir(parents=True, exist_ok=True)
    caminho.write_bytes(b"isto nao e um banco sqlite")

    resposta = client.get("/api/v1/analitica/opcoes-filtro")
    assert resposta.status_code == 503


def test_opcoes_filtro_valores_sao_utilizaveis_como_filtro_em_diarias():
    """Sprint 17.4.5.1 — consistência cruzada: `api-arquitetura.md`
    (linha 209) restringe motivo/situação a "correspondência exata,
    restrita aos valores devolvidos por GET /opcoes-filtro" — um valor
    da resposta deste endpoint precisa funcionar como filtro real em
    GET /diarias. Não assume ordem fixa: usa o primeiro item de cada
    lista, seja qual for."""
    _sincronizar_base_sqlite()
    opcoes = client.get("/api/v1/analitica/opcoes-filtro").json()
    assert opcoes["motivos"] and opcoes["situacoes"] and opcoes["municipios"]

    motivo = opcoes["motivos"][0]
    resposta_motivo = client.get("/api/v1/analitica/diarias", params={"motivo": motivo})
    assert resposta_motivo.status_code == 200
    corpo_motivo = resposta_motivo.json()
    assert corpo_motivo["paginacao"]["total_itens"] > 0
    # `motivo` já é exposto em DiariaResumoResposta — dá para checar direto.
    assert all(item["motivo"] == motivo for item in corpo_motivo["itens"])

    situacao = opcoes["situacoes"][0]
    resposta_situacao = client.get("/api/v1/analitica/diarias", params={"situacao": situacao})
    assert resposta_situacao.status_code == 200
    corpo_situacao = resposta_situacao.json()
    assert corpo_situacao["paginacao"]["total_itens"] > 0
    # `situacao` não aparece em DiariaResumoResposta (Fase 4) — confirma via
    # o detalhamento (GET /diarias/{sei}, já homologado) de cada item.
    for item in corpo_situacao["itens"]:
        detalhe = client.get(f"/api/v1/analitica/diarias/{item['sei']}").json()
        assert detalhe["servidor"] is not None
        assert detalhe["servidor"]["situacao"] == situacao

    municipio = opcoes["municipios"][0]
    resposta_municipio = client.get("/api/v1/analitica/diarias", params={"municipio": municipio})
    assert resposta_municipio.status_code == 200
    corpo_municipio = resposta_municipio.json()
    assert corpo_municipio["paginacao"]["total_itens"] > 0
    # `municipio` filtra origem OU destino, mas o resumo só expõe destino —
    # confirma via detalhamento (`trecho.origem`/`trecho.destino`).
    for item in corpo_municipio["itens"]:
        detalhe = client.get(f"/api/v1/analitica/diarias/{item['sei']}").json()
        assert municipio in (detalhe["trecho"]["origem"], detalhe["trecho"]["destino"])


# ---------------------------------------------------------------------------
# Sprint 17.4.6 — GET /sincronizacao
# ---------------------------------------------------------------------------


def test_estado_sincronizacao_nunca_sincronizado():
    resposta = client.get("/api/v1/analitica/sincronizacao")

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["status"] == "nunca_sincronizado"
    assert corpo["sincronizado_em"] is None
    assert corpo["origem"] is None
    assert corpo["possivelmente_desatualizado"] is True
    assert corpo["total_avisos"] == 0


def test_estado_sincronizacao_atualizado(monkeypatch):
    _sincronizar_base_sqlite()
    monkeypatch.setattr(configuracao_app, "resolver_caminho_para_preenchimento", lambda: "planilha.xlsx")
    monkeypatch.setattr(base_local_sqlite, "capturar_sinal_frescor", lambda caminho: _SINAL_FRESCOR_PADRAO)

    resposta = client.get("/api/v1/analitica/sincronizacao")

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["status"] == "atualizado"
    assert corpo["possivelmente_desatualizado"] is False
    assert corpo["sincronizado_em"]
    assert corpo["origem"] == "teste"
    assert corpo["total_avisos"] == 0


def test_estado_sincronizacao_possivelmente_desatualizado(monkeypatch):
    _sincronizar_base_sqlite()
    sinal_diferente = base_local_sqlite.SinalFrescor(tamanho_bytes=999, mtime=999.0, linhas_controle_diarias=999)
    monkeypatch.setattr(configuracao_app, "resolver_caminho_para_preenchimento", lambda: "planilha.xlsx")
    monkeypatch.setattr(base_local_sqlite, "capturar_sinal_frescor", lambda caminho: sinal_diferente)

    resposta = client.get("/api/v1/analitica/sincronizacao")

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["status"] == "possivelmente_desatualizado"
    assert corpo["possivelmente_desatualizado"] is True


def test_estado_sincronizacao_schema_desatualizado_reporta_possivelmente_desatualizado(monkeypatch):
    """Sprint 19.9 (achado da auditoria — Electron real + Planilha Oficial
    real): mesmo com o sinal de CONTEÚDO idêntico (Planilha Oficial não
    mudou), um `.sqlite` com `PRAGMA user_version` desatualizado (schema de
    uma versão anterior do código) precisa reportar
    `possivelmente_desatualizado=true` — sem isto, `GET /sincronizacao`
    dizia "atualizado" enquanto `GET /diarias`/`/indicadores` quebravam com
    `sqlite3.OperationalError` (coluna ausente)."""
    _sincronizar_base_sqlite()
    monkeypatch.setattr(configuracao_app, "resolver_caminho_para_preenchimento", lambda: "planilha.xlsx")
    monkeypatch.setattr(base_local_sqlite, "capturar_sinal_frescor", lambda caminho: _SINAL_FRESCOR_PADRAO)
    monkeypatch.setattr(base_local_sqlite, "esquema_desatualizado", lambda caminho: True)

    resposta = client.get("/api/v1/analitica/sincronizacao")

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["status"] == "possivelmente_desatualizado"
    assert corpo["possivelmente_desatualizado"] is True


# --- URGENTE — Central Analítica (2026-08-06): achado real do 2º
# rastreamento — o app instalado ("Automatizador de Diárias") continuou
# usando o binário empacotado ANTIGO por mais de meia hora depois da
# correção de código já estar pronta, porque nem o sinal de conteúdo (a
# Planilha Oficial não mudou) nem `esquema_desatualizado` (formato das
# tabelas não mudou) detectam "o código de importação mudou, mas os dados
# de entrada e o formato de saída continuam idênticos". `versao_app`
# fecha essa lacuna: compara a versão do Electron que gravou a última
# sincronização com a versão rodando agora. ---------------------------


def test_estado_sincronizacao_versao_app_diferente_reporta_possivelmente_desatualizado(monkeypatch):
    resultado = ResultadoDiariasCompletas(
        diarias={registro.sei: registro for registro in REGISTROS}, avisos=[], linhas_ignoradas=0
    )
    base_local_sqlite.reconstruir(
        resultado, SERVIDORES, _SINAL_FRESCOR_PADRAO,
        origem="teste", caminho_destino=base_local_sqlite.caminho_base_local_sqlite(),
        versao_app="2.0.0",
    )
    monkeypatch.setattr(configuracao_app, "resolver_caminho_para_preenchimento", lambda: "planilha.xlsx")
    monkeypatch.setattr(base_local_sqlite, "capturar_sinal_frescor", lambda caminho: _SINAL_FRESCOR_PADRAO)
    monkeypatch.setenv(base_local.VAR_AMBIENTE_VERSAO_APP, "2.1.0")

    resposta = client.get("/api/v1/analitica/sincronizacao")

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["status"] == "possivelmente_desatualizado"
    assert corpo["possivelmente_desatualizado"] is True


def test_estado_sincronizacao_versao_app_igual_nao_afeta_frescor(monkeypatch):
    resultado = ResultadoDiariasCompletas(
        diarias={registro.sei: registro for registro in REGISTROS}, avisos=[], linhas_ignoradas=0
    )
    base_local_sqlite.reconstruir(
        resultado, SERVIDORES, _SINAL_FRESCOR_PADRAO,
        origem="teste", caminho_destino=base_local_sqlite.caminho_base_local_sqlite(),
        versao_app="2.1.0",
    )
    monkeypatch.setattr(configuracao_app, "resolver_caminho_para_preenchimento", lambda: "planilha.xlsx")
    monkeypatch.setattr(base_local_sqlite, "capturar_sinal_frescor", lambda caminho: _SINAL_FRESCOR_PADRAO)
    monkeypatch.setenv(base_local.VAR_AMBIENTE_VERSAO_APP, "2.1.0")

    resposta = client.get("/api/v1/analitica/sincronizacao")

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["status"] == "atualizado"
    assert corpo["possivelmente_desatualizado"] is False


def test_estado_sincronizacao_versao_app_ausente_no_ambiente_nunca_e_falso_positivo(monkeypatch):
    """Backend rodando sem Electron (standalone/dev/teste) nunca conhece
    `EXTRATOR_DIARIAS_APP_VERSION` — ausência não pode virar
    `possivelmente_desatualizado=true` por si só (isso derrubaria todo
    ambiente de desenvolvimento/CI que nunca passa essa variável)."""
    _sincronizar_base_sqlite()
    monkeypatch.setattr(configuracao_app, "resolver_caminho_para_preenchimento", lambda: "planilha.xlsx")
    monkeypatch.setattr(base_local_sqlite, "capturar_sinal_frescor", lambda caminho: _SINAL_FRESCOR_PADRAO)
    monkeypatch.delenv(base_local.VAR_AMBIENTE_VERSAO_APP, raising=False)

    resposta = client.get("/api/v1/analitica/sincronizacao")

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["status"] == "atualizado"
    assert corpo["possivelmente_desatualizado"] is False


def test_estado_sincronizacao_planilha_nao_configurada_reporta_desatualizado_sem_erro():
    """RN-E: sem conseguir provar frescor (planilha oficial não
    configurada nesta pasta isolada), a resposta continua 200 —
    possivelmente_desatualizado=true "por segurança", nunca 422 (essa
    rota nunca expõe PlanilhaOficialIndisponivel como erro HTTP)."""
    _sincronizar_base_sqlite()

    resposta = client.get("/api/v1/analitica/sincronizacao")

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["status"] == "possivelmente_desatualizado"
    assert corpo["possivelmente_desatualizado"] is True


def test_estado_sincronizacao_falha_na_comparacao_de_frescor_e_logada(monkeypatch, caplog):
    """Sprint 17.4.6.1 — achado da auditoria da 17.4.6: o `except
    Exception` da comparação ao vivo agora loga (nível WARNING, não
    ERROR — esta condição inclui casos comuns/esperados) para
    diagnóstico, sem deixar de responder 200/possivelmente_desatualizado."""
    _sincronizar_base_sqlite()
    monkeypatch.setattr(configuracao_app, "resolver_caminho_para_preenchimento", lambda: "planilha.xlsx")

    def _capturar_com_erro(caminho):
        raise KeyError("aba inesperadamente ausente")

    monkeypatch.setattr(base_local_sqlite, "capturar_sinal_frescor", _capturar_com_erro)

    with caplog.at_level(logging.WARNING, logger="app.services.analitica_service"):
        resposta = client.get("/api/v1/analitica/sincronizacao")

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["possivelmente_desatualizado"] is True
    assert "comparar o frescor" in caplog.text
    assert "KeyError" in caplog.text  # exc_info=True — traceback presente no log


def test_estado_sincronizacao_base_local_invalida_retorna_503():
    caminho = base_local_sqlite.caminho_base_local_sqlite()
    caminho.parent.mkdir(parents=True, exist_ok=True)
    caminho.write_bytes(b"isto nao e um banco sqlite")

    resposta = client.get("/api/v1/analitica/sincronizacao")
    assert resposta.status_code == 503


def test_estado_sincronizacao_nunca_reporta_falha_na_ultima_sincronizacao(monkeypatch):
    """Achado § 2.1: a tabela `sincronizacoes` só grava sucesso — esta
    rota nunca deveria alcançar o 4º valor de status, só POST faz isso."""
    _sincronizar_base_sqlite()
    monkeypatch.setattr(configuracao_app, "resolver_caminho_para_preenchimento", lambda: "planilha.xlsx")
    monkeypatch.setattr(base_local_sqlite, "capturar_sinal_frescor", lambda caminho: _SINAL_FRESCOR_PADRAO)

    resposta = client.get("/api/v1/analitica/sincronizacao")
    assert resposta.json()["status"] != "falha_na_ultima_sincronizacao"


# ---------------------------------------------------------------------------
# Sprint 17.4.6 — POST /sincronizacao
# ---------------------------------------------------------------------------


def test_post_sincronizacao_sucesso_real(monkeypatch, caminho_planilha_conferencia_teste):
    caminho_planilha = caminho_planilha_conferencia_teste()
    monkeypatch.setattr(configuracao_app, "resolver_caminho_para_preenchimento", lambda: caminho_planilha)

    resposta = client.post("/api/v1/analitica/sincronizacao")

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["status"] == "sucesso"
    assert corpo["sincronizado_em"]
    assert corpo["linhas_diarias"] >= 1
    assert corpo["linhas_servidores_lidos"] >= 1
    assert corpo["linhas_ignoradas"] == 0
    assert corpo["total_avisos"] == 0

    # confirma de ponta a ponta: a base ficou realmente disponível para os
    # demais endpoints já homologados, e a origem gravada é "manual"
    # (Sprint 17.4.6.1 — POST /sincronizacao passa origem="manual" para
    # base_local.sincronizar(), nunca "pos_preenchimento").
    resposta_estado = client.get("/api/v1/analitica/sincronizacao")
    assert resposta_estado.json()["origem"] == "manual"


def test_post_sincronizacao_planilha_nao_configurada_retorna_422():
    resposta = client.post("/api/v1/analitica/sincronizacao")
    assert resposta.status_code == 422
    assert resposta.json()["detail"]


def test_post_sincronizacao_falha_simulada_etapa_sqlite_primeira_sincronizacao(monkeypatch, tmp_path):
    """Mesma técnica de `test_sincronizar_planilha_sem_abas_esperadas_nao_quebra_copia_xlsx`
    (`test_base_local.py`): planilha sem as abas esperadas faz a etapa
    SQLite de `sincronizar()` levantar uma exceção engolida
    internamente — o sinal físico do `.sqlite` nunca muda (nem chega a
    existir, neste caso), e a falha deve ser corretamente inferida."""
    origem = tmp_path / "planilha_sem_abas.xlsx"
    Workbook().save(origem)
    monkeypatch.setattr(configuracao_app, "resolver_caminho_para_preenchimento", lambda: str(origem))

    resposta = client.post("/api/v1/analitica/sincronizacao")

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["status"] == "falha"
    assert corpo["sincronizado_em"] is None
    assert corpo["linhas_diarias"] is None
    assert corpo["linhas_servidores_lidos"] is None
    assert corpo["linhas_ignoradas"] is None
    assert corpo["total_avisos"] is None


def test_post_sincronizacao_falha_simulada_preserva_base_anterior(monkeypatch, tmp_path):
    """RN-D: falha nunca apaga a Base Local válida anterior. Diferente do
    teste acima, aqui já existe uma base local válida antes da tentativa
    — o sinal físico (mtime/tamanho/inode) precisa permanecer idêntico
    para a falha ser inferida corretamente."""
    _sincronizar_base_sqlite()
    caminho_sqlite = base_local_sqlite.caminho_base_local_sqlite()
    mtime_antes = caminho_sqlite.stat().st_mtime_ns

    origem = tmp_path / "planilha_sem_abas.xlsx"
    Workbook().save(origem)
    monkeypatch.setattr(configuracao_app, "resolver_caminho_para_preenchimento", lambda: str(origem))

    resposta = client.post("/api/v1/analitica/sincronizacao")

    assert resposta.status_code == 200
    assert resposta.json()["status"] == "falha"
    assert caminho_sqlite.stat().st_mtime_ns == mtime_antes

    resposta_estado = client.get("/api/v1/analitica/sincronizacao")
    assert resposta_estado.json()["status"] in ("atualizado", "possivelmente_desatualizado")


def test_post_sincronizacao_falha_inesperada_em_sincronizar_e_logada(monkeypatch, caplog):
    """Decisão confirmada da 17.4.6: exceção inesperada durante
    base_local.sincronizar() vira falha inferida (200), nunca um 500 —
    e é logada com stack trace completo (logger.exception)."""

    def _sincronizar_com_erro(caminho_planilha, **kwargs):
        raise OSError("arquivo de origem sumiu no meio da cópia")

    monkeypatch.setattr(configuracao_app, "resolver_caminho_para_preenchimento", lambda: "planilha.xlsx")
    monkeypatch.setattr(base_local, "sincronizar", _sincronizar_com_erro)

    with caplog.at_level(logging.ERROR, logger="app.services.analitica_service"):
        resposta = client.post("/api/v1/analitica/sincronizacao")

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["status"] == "falha"
    assert corpo["sincronizado_em"] is None
    assert "Falha inesperada durante sincronização manual" in caplog.text


def test_post_sincronizacao_sinal_fisico_ok_mas_leitura_pos_sync_falha_retorna_503(
    monkeypatch, caminho_planilha_conferencia_teste
):
    """Decisão confirmada na auditoria da Sprint 17.4.6, coberta pela
    17.4.6.1: sincronização física bem-sucedida (sinal do `.sqlite`
    indica substituição real, via `base_local.sincronizar()` de
    verdade), mas a leitura subsequente de `sincronizacoes` falha —
    tratado como indisponibilidade da Base Local (`503`), nunca como
    `status="falha"` no corpo (a base pode estar corrompida para todos
    os endpoints, não só para esta chamada)."""
    caminho_planilha = caminho_planilha_conferencia_teste()
    monkeypatch.setattr(configuracao_app, "resolver_caminho_para_preenchimento", lambda: caminho_planilha)

    def _leitura_com_erro(caminho_sqlite):
        raise sqlite3.DatabaseError("simulado: leitura pós-sincronização falhou")

    monkeypatch.setattr(repositorio_analitico, "estado_sincronizacao_registrado", _leitura_com_erro)

    resposta = client.post("/api/v1/analitica/sincronizacao")

    assert resposta.status_code == 503
    assert resposta.json()["detail"]


def test_post_sincronizacao_concorrencia_retorna_409():
    adquirido = analitica_service._lock_sincronizacao.acquire(blocking=False)
    assert adquirido, "pré-condição do teste: lock deveria estar livre"
    try:
        resposta = client.post("/api/v1/analitica/sincronizacao")
        assert resposta.status_code == 409
        assert resposta.json()["detail"]
    finally:
        analitica_service._lock_sincronizacao.release()


def test_post_sincronizacao_lock_nao_trava_permanentemente_apos_falha_precoce(
    monkeypatch, caminho_planilha_conferencia_teste
):
    """O `finally` precisa liberar o lock mesmo quando
    PlanilhaOficialIndisponivel é levantada antes de sincronizar() ser
    chamado — confirmado chamando de novo, com sucesso, em seguida."""
    resposta_422 = client.post("/api/v1/analitica/sincronizacao")
    assert resposta_422.status_code == 422

    caminho_planilha = caminho_planilha_conferencia_teste()
    monkeypatch.setattr(configuracao_app, "resolver_caminho_para_preenchimento", lambda: caminho_planilha)
    resposta_200 = client.post("/api/v1/analitica/sincronizacao")
    assert resposta_200.status_code == 200
    assert resposta_200.json()["status"] == "sucesso"


# ---------------------------------------------------------------------------
# Sprint 17.4.6 — GET /sincronizacao/avisos
# ---------------------------------------------------------------------------


def test_avisos_de_sincronizacao_lista_paginada():
    avisos = [
        AvisoLinhaIgnorada(aba="Controle de Diárias", linha=10, motivo="SEI ausente"),
        AvisoLinhaIgnorada(aba="Dados", linha=20, motivo="CPF inválido"),
    ]
    _sincronizar_base_sqlite(avisos=avisos)

    resposta = client.get("/api/v1/analitica/sincronizacao/avisos")

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["paginacao"]["total_itens"] == 2
    assert len(corpo["itens"]) == 2
    assert {item["motivo"] for item in corpo["itens"]} == {"SEI ausente", "CPF inválido"}


def test_avisos_de_sincronizacao_paginacao():
    avisos = [
        AvisoLinhaIgnorada(aba="Controle de Diárias", linha=i, motivo=f"Motivo {i}") for i in range(5)
    ]
    _sincronizar_base_sqlite(avisos=avisos)

    resposta = client.get("/api/v1/analitica/sincronizacao/avisos", params={"pagina": 2, "tamanho_pagina": 2})

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["paginacao"]["total_itens"] == 5
    assert corpo["paginacao"]["total_paginas"] == 3
    assert len(corpo["itens"]) == 2


def test_avisos_de_sincronizacao_sincronizado_sem_avisos_retorna_lista_vazia():
    _sincronizar_base_sqlite()
    resposta = client.get("/api/v1/analitica/sincronizacao/avisos")
    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["itens"] == []
    assert corpo["paginacao"]["total_itens"] == 0


def test_avisos_de_sincronizacao_nunca_sincronizado_retorna_503():
    """Decisão confirmada da 17.4.6: diferente de GET /sincronizacao,
    aqui 'nunca sincronizado' é indisponibilidade técnica (503), não
    estado de negócio."""
    resposta = client.get("/api/v1/analitica/sincronizacao/avisos")
    assert resposta.status_code == 503


def test_avisos_de_sincronizacao_base_local_invalida_retorna_503():
    caminho = base_local_sqlite.caminho_base_local_sqlite()
    caminho.parent.mkdir(parents=True, exist_ok=True)
    caminho.write_bytes(b"isto nao e um banco sqlite")

    resposta = client.get("/api/v1/analitica/sincronizacao/avisos")
    assert resposta.status_code == 503


def test_avisos_de_sincronizacao_pagina_invalida_retorna_422():
    _sincronizar_base_sqlite()
    resposta = client.get("/api/v1/analitica/sincronizacao/avisos", params={"pagina": 0})
    assert resposta.status_code == 422


def test_avisos_de_sincronizacao_tamanho_pagina_acima_do_teto_retorna_422():
    _sincronizar_base_sqlite()
    resposta = client.get("/api/v1/analitica/sincronizacao/avisos", params={"tamanho_pagina": 101})
    assert resposta.status_code == 422


# Sprint 19.6.2 (`v2-plano-tecnico.md` § 12.2, § 18) — `GET /indicadores`.
# Fecha a lacuna de cobertura do serviço `calcular_indicadores` apontada
# pela Auditoria Técnica da 19.6.1: estes testes exercitam a cadeia real
# (API real via `TestClient` -> serviço -> repositório -> domínio -> SQLite
# de fixture), nunca mockando `calcular_indicadores` nem `agregar_indicadores`.
#
# Valores de referência da massa `REGISTROS` (sem filtro):
#   total_diarias=4, total_servidores=4 (cpfs distintos),
#   valor_total=200.0+350.5+180.25=730.75 (REGISTROS[2] sem valor, ignorado),
#   valor_medio=730.75/3=243.58333...


def test_indicadores_sem_filtros_calcula_sobre_o_recorte_inteiro():
    _sincronizar_base_sqlite()
    resposta = client.get("/api/v1/analitica/indicadores")

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["total_diarias"] == 4
    assert corpo["total_servidores"] == 4
    assert corpo["valor_total"] == 730.75
    assert corpo["valor_medio"] == pytest.approx(730.75 / 3)
    assert corpo["sincronizacao"]["sincronizado_em"]
    assert corpo["sincronizacao"]["total_avisos"] == 0


def test_indicadores_filtro_motivo_traduzido_corretamente():
    """REGISTROS[0] e REGISTROS[2] têm motivo "Reunião"; só REGISTROS[0]
    tem valor preenchido (200.0) — prova que o filtro `motivo` chega
    corretamente a `FiltrosDiaria` e que o cálculo ignora o valor ausente
    da 2ª diária, exatamente como o domínio (19.6.1) já garante."""
    _sincronizar_base_sqlite()
    resposta = client.get("/api/v1/analitica/indicadores", params={"motivo": "Reunião"})

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["total_diarias"] == 2
    assert corpo["total_servidores"] == 2
    assert corpo["valor_total"] == 200.0
    assert corpo["valor_medio"] == 200.0


# Sprint 19.6.2.1 — correção do achado de cobertura da Auditoria Técnica da
# 19.6.2: `q`, `sei`, `servidor_matricula` e `situacao` ainda não tinham
# nenhum teste próprio em `/indicadores` (só apareciam agregados no
# parametrize de paridade, abaixo). Cada teste aqui prova a tradução
# correta e específica desse filtro, não só a contagem.
def test_indicadores_filtro_q_traduzido_corretamente():
    """"costa" (pesquisa textual) só bate com Ana Costa (REGISTROS[2]),
    que não tem valor preenchido — mesmo caso já coberto para `/diarias`
    em `test_diarias_pesquisa_textual_q_end_to_end`."""
    _sincronizar_base_sqlite()
    resposta = client.get("/api/v1/analitica/indicadores", params={"q": "costa"})

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["total_diarias"] == 1
    assert corpo["total_servidores"] == 1
    assert corpo["valor_total"] is None
    assert corpo["valor_medio"] is None


def test_indicadores_filtro_sei_traduzido_corretamente():
    _sincronizar_base_sqlite()
    resposta = client.get("/api/v1/analitica/indicadores", params={"sei": REGISTROS[0].sei})

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["total_diarias"] == 1
    assert corpo["total_servidores"] == 1
    assert corpo["valor_total"] == 200.0
    assert corpo["valor_medio"] == 200.0


def test_indicadores_filtro_servidor_matricula_traduzido_corretamente():
    """Matrícula "1001" pertence só a Maria Souza (cpf 11111111111,
    REGISTROS[0])."""
    _sincronizar_base_sqlite()
    resposta = client.get("/api/v1/analitica/indicadores", params={"servidor_matricula": "1001"})

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["total_diarias"] == 1
    assert corpo["total_servidores"] == 1
    assert corpo["valor_total"] == 200.0
    assert corpo["valor_medio"] == 200.0


def test_indicadores_filtro_situacao_traduzido_corretamente():
    """"Em exercício" bate com Maria Souza e João Silva (REGISTROS[0] e
    REGISTROS[1]) — Ana Costa está "Licença", e o cpf de REGISTROS[3] não
    tem cadastro em `SERVIDORES`."""
    _sincronizar_base_sqlite()
    resposta = client.get("/api/v1/analitica/indicadores", params={"situacao": "Em exercício"})

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["total_diarias"] == 2
    assert corpo["total_servidores"] == 2
    assert corpo["valor_total"] == pytest.approx(200.0 + 350.5)
    assert corpo["valor_medio"] == pytest.approx((200.0 + 350.5) / 2)


def test_indicadores_filtro_periodo_valido_traduzido_corretamente():
    """`periodo_inicial`/`periodo_final` válidos (não só a validação 422 já
    coberta em `test_indicadores_periodo_final_antes_do_inicial_retorna_422`)
    — a janela 2026-01-01..2026-02-28 sobrepõe REGISTROS[0] (jan) e
    REGISTROS[1] (fev), exclui REGISTROS[2] (mar) e REGISTROS[3] (abr)."""
    _sincronizar_base_sqlite()
    resposta = client.get(
        "/api/v1/analitica/indicadores",
        params={"periodo_inicial": "2026-01-01", "periodo_final": "2026-02-28"},
    )

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["total_diarias"] == 2
    assert corpo["total_servidores"] == 2
    assert corpo["valor_total"] == pytest.approx(200.0 + 350.5)
    assert corpo["valor_medio"] == pytest.approx((200.0 + 350.5) / 2)


@pytest.mark.parametrize(
    "params",
    [
        {},
        {"motivo": "Reunião"},
        {"municipio": "recife"},
        {"origem": "olinda"},
        {"destino": "garanhuns"},
        {"trecho": "caruaru - recife"},
        {"valor_minimo": 200},
        {"valor_maximo": 200},
        {"cpf": "22222222222"},
        {"servidor_nome": "Souza"},
        {"motivo": "Reunião", "municipio": "recife"},
        {"motivo": "Motivo Inexistente"},
        {"q": "costa"},
        {"sei": REGISTROS[0].sei},
        {"servidor_matricula": "1001"},
        {"situacao": "Em exercício"},
        {"periodo_inicial": "2026-01-01", "periodo_final": "2026-02-28"},
    ],
)
def test_indicadores_traduz_cada_filtro_igual_a_diarias_sem_divergencia(params):
    """Requisito explícito da Auditoria Técnica da 19.6.1: nenhuma
    divergência entre os filtros da listagem (`/diarias`) e dos
    indicadores (`/indicadores`) — o `total_diarias` de um precisa ser
    sempre igual ao `total_itens` do outro, para qualquer filtro (ou
    combinação), incluindo o recorte vazio."""
    _sincronizar_base_sqlite()

    resposta_diarias = client.get("/api/v1/analitica/diarias", params={**params, "tamanho_pagina": 100})
    resposta_indicadores = client.get("/api/v1/analitica/indicadores", params=params)

    assert resposta_diarias.status_code == 200
    assert resposta_indicadores.status_code == 200
    assert resposta_indicadores.json()["total_diarias"] == resposta_diarias.json()["paginacao"]["total_itens"]


def test_indicadores_recorte_vazio_devolve_zero_e_valores_none():
    _sincronizar_base_sqlite()
    resposta = client.get("/api/v1/analitica/indicadores", params={"motivo": "Motivo Inexistente"})

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["total_diarias"] == 0
    assert corpo["total_servidores"] == 0
    assert corpo["valor_total"] is None
    assert corpo["valor_medio"] is None


def test_indicadores_carimbo_de_sincronizacao_e_o_mesmo_de_diarias():
    """Os indicadores e a listagem leem a mesma Base Local publicada —
    nesta massa de teste (sem sincronização concorrente), o carimbo tem
    que ser idêntico nos dois endpoints."""
    _sincronizar_base_sqlite()

    corpo_diarias = client.get("/api/v1/analitica/diarias").json()
    corpo_indicadores = client.get("/api/v1/analitica/indicadores").json()

    assert corpo_indicadores["sincronizacao"]["sincronizado_em"] == corpo_diarias["sincronizacao"]["sincronizado_em"]
    assert corpo_indicadores["sincronizacao"]["total_avisos"] == corpo_diarias["sincronizacao"]["total_avisos"]


def test_indicadores_base_local_inexistente_retorna_503():
    # Nenhuma sincronização feita — diretório isolado do teste está vazio.
    resposta = client.get("/api/v1/analitica/indicadores")
    assert resposta.status_code == 503


def test_indicadores_base_local_invalida_retorna_503():
    caminho = base_local_sqlite.caminho_base_local_sqlite()
    caminho.parent.mkdir(parents=True, exist_ok=True)
    caminho.write_bytes(b"isto nao e um banco sqlite")

    resposta = client.get("/api/v1/analitica/indicadores")
    assert resposta.status_code == 503


def test_indicadores_periodo_final_antes_do_inicial_retorna_422():
    _sincronizar_base_sqlite()
    resposta = client.get(
        "/api/v1/analitica/indicadores",
        params={"periodo_inicial": "2026-05-01", "periodo_final": "2026-01-01"},
    )
    assert resposta.status_code == 422


def test_indicadores_valor_maximo_menor_que_valor_minimo_retorna_422():
    _sincronizar_base_sqlite()
    resposta = client.get(
        "/api/v1/analitica/indicadores",
        params={"valor_minimo": 300, "valor_maximo": 100},
    )
    assert resposta.status_code == 422


def test_indicadores_nunca_aceita_parametro_de_paginacao_ou_ordenacao():
    """`ParametrosIndicadoresQuery` (schema) não declara `pagina`/
    `tamanho_pagina`/`ordenar_por`/`ordem` — o FastAPI ignora parâmetros de
    query não declarados no schema (não é um 422), então esta prova é
    sobre o *resultado*: passar esses parâmetros não muda nada, porque o
    endpoint nunca os lê. Confirma que o "recorte inteiro" não é afetado
    por paginação, mesmo que alguém tente enviá-la por engano."""
    _sincronizar_base_sqlite()

    resposta_sem = client.get("/api/v1/analitica/indicadores")
    resposta_com = client.get(
        "/api/v1/analitica/indicadores", params={"pagina": 2, "tamanho_pagina": 1, "ordenar_por": "valor"}
    )

    assert resposta_sem.status_code == 200
    assert resposta_com.status_code == 200
    assert resposta_sem.json()["total_diarias"] == resposta_com.json()["total_diarias"]


# Sprint 19.6.3 (`v2-plano-tecnico.md` § 12.3, § 18) — `GET /distribuicoes`.
# Exercita a cadeia real (API real via `TestClient` -> serviço ->
# repositório -> domínio -> SQLite de fixture), nunca mockando
# `calcular_distribuicoes`/`agregar_distribuicao`/`calcular_distribuicao`.
#
# Valores de referência da massa `REGISTROS` (sem filtro), por dimensão:
#   periodo: 2026-01(1,200.0) 2026-02(1,350.5) 2026-03(1,None) 2026-04(1,180.25)
#   servidor: Ana Costa(1,None) João Silva(1,350.5) Maria Souza(1,200.0)
#             Servidor sem cadastro(1,180.25) — REGISTROS[2] (Ana) não tem
#             valor, REGISTROS[3] (sem cadastro) tem 180.25.
#   municipio (destino): RECIFE(2,180.25) ARARIPINA(1,350.5) GARANHUNS(1,200.0)
#   motivo: Reunião(2,200.0) Auditoria(1,180.25) Fiscalização(1,350.5)
#   situacao: Em exercício(2,None) Licença(1,None) Situação não informada(1,None)
#   origem_destino: CARUARU → RECIFE(1,None) OLINDA → RECIFE(1,180.25)
#                   RECIFE → ARARIPINA(1,350.5) RECIFE → GARANHUNS(1,200.0)


def test_distribuicoes_periodo_sem_filtro_agrega_por_ano_mes_em_ordem_cronologica():
    _sincronizar_base_sqlite()
    resposta = client.get("/api/v1/analitica/distribuicoes", params={"dimensao": "periodo"})

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["dimensao"] == "periodo"
    assert corpo["pontos"] == [
        {"rotulo": "2026-01", "contagem": 1, "valor": 200.0},
        {"rotulo": "2026-02", "contagem": 1, "valor": 350.5},
        {"rotulo": "2026-03", "contagem": 1, "valor": None},
        {"rotulo": "2026-04", "contagem": 1, "valor": 180.25},
    ]


def test_distribuicoes_servidor_agrupa_por_nome_e_bucket_sem_cadastro():
    _sincronizar_base_sqlite()
    resposta = client.get("/api/v1/analitica/distribuicoes", params={"dimensao": "servidor"})

    assert resposta.status_code == 200
    pontos_por_rotulo = {ponto["rotulo"]: ponto for ponto in resposta.json()["pontos"]}
    assert pontos_por_rotulo["Maria Souza"] == {"rotulo": "Maria Souza", "contagem": 1, "valor": 200.0}
    assert pontos_por_rotulo["João Silva"] == {"rotulo": "João Silva", "contagem": 1, "valor": 350.5}
    assert pontos_por_rotulo["Ana Costa"] == {"rotulo": "Ana Costa", "contagem": 1, "valor": None}
    assert pontos_por_rotulo["Servidor sem cadastro"] == {
        "rotulo": "Servidor sem cadastro",
        "contagem": 1,
        "valor": 180.25,
    }


def test_distribuicoes_municipio_agrupa_exclusivamente_por_cidade_destino():
    """Decisão formal da 19.6.3: nunca união origem/destino. RECIFE
    aparece 2x como destino (REGISTROS[2]/[3]) — sua ocorrência como
    origem (REGISTROS[0]/[1]) nunca conta para esta dimensão."""
    _sincronizar_base_sqlite()
    resposta = client.get("/api/v1/analitica/distribuicoes", params={"dimensao": "municipio"})

    assert resposta.status_code == 200
    pontos_por_rotulo = {ponto["rotulo"]: ponto for ponto in resposta.json()["pontos"]}
    assert pontos_por_rotulo["RECIFE"]["contagem"] == 2
    assert pontos_por_rotulo["RECIFE"]["valor"] == 180.25
    assert pontos_por_rotulo["ARARIPINA"] == {"rotulo": "ARARIPINA", "contagem": 1, "valor": 350.5}
    assert pontos_por_rotulo["GARANHUNS"] == {"rotulo": "GARANHUNS", "contagem": 1, "valor": 200.0}
    assert "OLINDA" not in pontos_por_rotulo
    assert "CARUARU" not in pontos_por_rotulo


def test_distribuicoes_motivo_agrega_corretamente():
    _sincronizar_base_sqlite()
    resposta = client.get("/api/v1/analitica/distribuicoes", params={"dimensao": "motivo"})

    assert resposta.status_code == 200
    pontos_por_rotulo = {ponto["rotulo"]: ponto for ponto in resposta.json()["pontos"]}
    assert pontos_por_rotulo["Reunião"] == {"rotulo": "Reunião", "contagem": 2, "valor": 200.0}
    assert pontos_por_rotulo["Fiscalização"] == {"rotulo": "Fiscalização", "contagem": 1, "valor": 350.5}
    assert pontos_por_rotulo["Auditoria"] == {"rotulo": "Auditoria", "contagem": 1, "valor": 180.25}


def test_distribuicoes_situacao_agrega_corretamente_valor_sempre_none():
    _sincronizar_base_sqlite()
    resposta = client.get("/api/v1/analitica/distribuicoes", params={"dimensao": "situacao"})

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert all(ponto["valor"] is None for ponto in corpo["pontos"])
    pontos_por_rotulo = {ponto["rotulo"]: ponto for ponto in corpo["pontos"]}
    assert pontos_por_rotulo["Em exercício"]["contagem"] == 2
    assert pontos_por_rotulo["Licença"]["contagem"] == 1
    assert pontos_por_rotulo["Situação não informada"]["contagem"] == 1


def test_distribuicoes_origem_destino_agrupa_por_par_real():
    _sincronizar_base_sqlite()
    resposta = client.get("/api/v1/analitica/distribuicoes", params={"dimensao": "origem_destino"})

    assert resposta.status_code == 200
    pontos_por_rotulo = {ponto["rotulo"]: ponto for ponto in resposta.json()["pontos"]}
    assert pontos_por_rotulo["RECIFE → GARANHUNS"] == {"rotulo": "RECIFE → GARANHUNS", "contagem": 1, "valor": 200.0}
    assert pontos_por_rotulo["RECIFE → ARARIPINA"] == {"rotulo": "RECIFE → ARARIPINA", "contagem": 1, "valor": 350.5}
    assert pontos_por_rotulo["CARUARU → RECIFE"] == {"rotulo": "CARUARU → RECIFE", "contagem": 1, "valor": None}
    assert pontos_por_rotulo["OLINDA → RECIFE"] == {"rotulo": "OLINDA → RECIFE", "contagem": 1, "valor": 180.25}


def test_distribuicoes_categoria_funcional_agrega_membros_x_servidores():
    """Sprint 21.1 (Modo Executivo) — gráfico "Membros × Servidores".
    Nenhum cadastro de `SERVIDORES` é membro (Analista/Técnico); REGISTROS[3]
    (CPF sem cadastro) cai em NAO_IDENTIFICADO — mesmo recorte já usado
    pelos demais testes de `/distribuicoes`, sem massa de dado nova."""
    _sincronizar_base_sqlite()
    resposta = client.get("/api/v1/analitica/distribuicoes", params={"dimensao": "categoria_funcional"})

    assert resposta.status_code == 200
    pontos_por_rotulo = {ponto["rotulo"]: ponto for ponto in resposta.json()["pontos"]}
    assert pontos_por_rotulo["SERVIDOR"]["contagem"] == 3
    assert pontos_por_rotulo["SERVIDOR"]["valor"] == 550.5
    assert pontos_por_rotulo["NAO_IDENTIFICADO"]["contagem"] == 1
    assert pontos_por_rotulo["NAO_IDENTIFICADO"]["valor"] == 180.25


def test_distribuicoes_doc_origem_agrega_por_documento_de_origem():
    """Sprint 21.1 (Modo Executivo) — gráfico "Unidade solicitante
    (documento de origem)". Todas as `REGISTROS` de teste usam o mesmo
    `doc_origem` padrão ("PJTESTE") — o teste confirma a agregação, não a
    variedade de rótulos (já coberta em `test_distribuicoes.py`, unitário)."""
    _sincronizar_base_sqlite()
    resposta = client.get("/api/v1/analitica/distribuicoes", params={"dimensao": "doc_origem"})

    assert resposta.status_code == 200
    pontos_por_rotulo = {ponto["rotulo"]: ponto for ponto in resposta.json()["pontos"]}
    assert pontos_por_rotulo["PJTESTE"]["contagem"] == len(REGISTROS)
    assert pontos_por_rotulo["PJTESTE"]["valor"] == 730.75


def test_distribuicoes_transporte_agrega_e_agrupa_ausente():
    """Sprint 21.1 (Modo Executivo) — gráfico "Meio de transporte".
    REGISTROS[2] não tem transporte — cai no bucket "Transporte não
    identificado", nunca omitido do total."""
    _sincronizar_base_sqlite()
    resposta = client.get("/api/v1/analitica/distribuicoes", params={"dimensao": "transporte"})

    assert resposta.status_code == 200
    pontos_por_rotulo = {ponto["rotulo"]: ponto for ponto in resposta.json()["pontos"]}
    assert pontos_por_rotulo["CARRO"]["contagem"] == 2
    assert pontos_por_rotulo["CARRO"]["valor"] == 380.25
    assert pontos_por_rotulo["AVIAO"]["contagem"] == 1
    assert pontos_por_rotulo["Transporte não identificado"]["contagem"] == 1
    assert sum(ponto["contagem"] for ponto in resposta.json()["pontos"]) == len(REGISTROS)


def test_distribuicoes_recorte_vazio_devolve_lista_de_pontos_vazia():
    _sincronizar_base_sqlite()
    resposta = client.get(
        "/api/v1/analitica/distribuicoes", params={"dimensao": "motivo", "motivo": "Motivo Inexistente"}
    )

    assert resposta.status_code == 200
    assert resposta.json()["pontos"] == []


def test_distribuicoes_resposta_nunca_embute_carimbo_de_sincronizacao():
    """Contrato aprovado (§ 12.3) declara só `dimensao`/`pontos` — decisão
    já tomada no plano técnico, diferente de `IndicadoresResposta`."""
    _sincronizar_base_sqlite()
    resposta = client.get("/api/v1/analitica/distribuicoes", params={"dimensao": "motivo"})

    assert resposta.status_code == 200
    assert set(resposta.json().keys()) == {"dimensao", "pontos"}


def test_distribuicoes_dimensao_completude_ainda_nao_e_aceita():
    """Decisão formal desta Sprint: `completude` depende da definição
    fechada de "registro incompleto" (§ 9 pergunta 7 / § 14 pergunta 5),
    ainda pendente do DIMCAC — omitida deliberadamente, mesmo critério já
    homologado na 19.6.1 para os KPIs pendentes."""
    _sincronizar_base_sqlite()
    resposta = client.get("/api/v1/analitica/distribuicoes", params={"dimensao": "completude"})
    assert resposta.status_code == 422


def test_distribuicoes_dimensao_invalida_retorna_422():
    _sincronizar_base_sqlite()
    resposta = client.get("/api/v1/analitica/distribuicoes", params={"dimensao": "municipio_inexistente"})
    assert resposta.status_code == 422


def test_distribuicoes_sem_dimensao_retorna_422():
    _sincronizar_base_sqlite()
    resposta = client.get("/api/v1/analitica/distribuicoes")
    assert resposta.status_code == 422


def test_distribuicoes_base_local_inexistente_retorna_503():
    resposta = client.get("/api/v1/analitica/distribuicoes", params={"dimensao": "periodo"})
    assert resposta.status_code == 503


def test_distribuicoes_base_local_invalida_retorna_503():
    caminho = base_local_sqlite.caminho_base_local_sqlite()
    caminho.parent.mkdir(parents=True, exist_ok=True)
    caminho.write_bytes(b"isto nao e um banco sqlite")

    resposta = client.get("/api/v1/analitica/distribuicoes", params={"dimensao": "periodo"})
    assert resposta.status_code == 503


def test_distribuicoes_periodo_final_antes_do_inicial_retorna_422():
    _sincronizar_base_sqlite()
    resposta = client.get(
        "/api/v1/analitica/distribuicoes",
        params={"dimensao": "periodo", "periodo_inicial": "2026-05-01", "periodo_final": "2026-01-01"},
    )
    assert resposta.status_code == 422


def test_distribuicoes_valor_maximo_menor_que_valor_minimo_retorna_422():
    _sincronizar_base_sqlite()
    resposta = client.get(
        "/api/v1/analitica/distribuicoes",
        params={"dimensao": "periodo", "valor_minimo": 300, "valor_maximo": 100},
    )
    assert resposta.status_code == 422


def test_distribuicoes_nunca_aceita_parametro_de_paginacao_ou_ordenacao():
    """Mesmo critério de `test_indicadores_nunca_aceita_parametro_de_paginacao_ou_ordenacao`:
    `ParametrosDistribuicaoQuery` não declara `pagina`/`tamanho_pagina`/
    `ordenar_por`/`ordem` — passar esses parâmetros não muda o resultado,
    porque o endpoint nunca os lê."""
    _sincronizar_base_sqlite()

    resposta_sem = client.get("/api/v1/analitica/distribuicoes", params={"dimensao": "motivo"})
    resposta_com = client.get(
        "/api/v1/analitica/distribuicoes",
        params={"dimensao": "motivo", "pagina": 2, "tamanho_pagina": 1, "ordenar_por": "valor"},
    )

    assert resposta_sem.status_code == 200
    assert resposta_com.status_code == 200
    assert resposta_sem.json()["pontos"] == resposta_com.json()["pontos"]


@pytest.mark.parametrize(
    "params",
    [
        {},
        {"motivo": "Reunião"},
        {"municipio": "recife"},
        {"origem": "olinda"},
        {"destino": "garanhuns"},
        {"trecho": "caruaru - recife"},
        {"valor_minimo": 200},
        {"cpf": "22222222222"},
        {"servidor_nome": "Souza"},
        {"q": "costa"},
        {"sei": REGISTROS[0].sei},
        {"servidor_matricula": "1001"},
        {"situacao": "Em exercício"},
        {"periodo_inicial": "2026-01-01", "periodo_final": "2026-02-28"},
        {"motivo": "Motivo Inexistente"},
    ],
)
@pytest.mark.parametrize("dimensao", ["periodo", "servidor", "municipio", "motivo", "situacao", "origem_destino"])
def test_distribuicoes_soma_das_contagens_bate_com_total_itens_de_diarias_para_qualquer_filtro(params, dimensao):
    """Nenhuma divergência entre o filtro traduzido em `/diarias` e em
    `/distribuicoes`, para nenhuma das 6 dimensões: a soma de `contagem`
    de todos os pontos precisa ser sempre igual ao `total_itens` de
    `/diarias` com o mesmo filtro — cada registro do recorte aparece em
    exatamente um ponto da distribuição, nunca duplicado nem perdido."""
    _sincronizar_base_sqlite()

    resposta_diarias = client.get("/api/v1/analitica/diarias", params={**params, "tamanho_pagina": 100})
    resposta_distribuicoes = client.get(
        "/api/v1/analitica/distribuicoes", params={**params, "dimensao": dimensao}
    )

    assert resposta_diarias.status_code == 200
    assert resposta_distribuicoes.status_code == 200
    total_itens = resposta_diarias.json()["paginacao"]["total_itens"]
    soma_contagens = sum(ponto["contagem"] for ponto in resposta_distribuicoes.json()["pontos"])
    assert soma_contagens == total_itens


# --- Sprint 19.8.2 — GET /diagnostico -------------------------------------

# Massa dedicada (não a REGISTROS/SERVIDORES globais, reaproveitadas por
# dezenas de testes de /diarias, /indicadores, /distribuicoes): aqui o
# valor de `dh` importa para o resultado, então cada cenário controla
# explicitamente o que precisa.
_MARIA = Servidor(cpf="11111111111", nome="Maria Souza", cargo="Analista", previdencia="RPPS", matricula="1001", situacao="Em exercício")

_REGISTROS_DIAGNOSTICO = [
    # "Perfeito" — nenhum caso aplicável (esperado, lista de casos vazia).
    _registro("19.20.0002.0000001/2026-01", "11111111111", date(2026, 1, 8), date(2026, 1, 10), "RECIFE", "GARANHUNS", "Reunião", transporte="CARRO", valor=200.0, linha=2, dh="DH-001"),
    # CPF sem cadastro em Dados -> esperado (o único caso aplicável, e é "esperado").
    _registro("19.20.0002.0000002/2026-02", "99999999999", date(2026, 2, 1), date(2026, 2, 3), "RECIFE", "ARARIPINA", "Fiscalização", transporte="AVIAO", valor=350.5, linha=3, dh="DH-002"),
    # DH vazio -> atenção.
    _registro("19.20.0002.0000003/2026-03", "11111111111", date(2026, 3, 5), date(2026, 3, 6), "CARUARU", "RECIFE", "Reunião", dh=None, linha=4),
    # Período inválido (final < inicial) -> inconsistência.
    _registro("19.20.0002.0000004/2026-04", "11111111111", date(2026, 4, 12), date(2026, 4, 10), "OLINDA", "RECIFE", "Auditoria", transporte="CARRO", valor=180.25, linha=5, dh="DH-004"),
]
_SERVIDORES_DIAGNOSTICO = {"11111111111": _MARIA}


def test_diagnostico_sem_filtros_calcula_sobre_o_recorte_inteiro():
    _sincronizar_base_sqlite(registros=_REGISTROS_DIAGNOSTICO, servidores=_SERVIDORES_DIAGNOSTICO)
    resposta = client.get("/api/v1/analitica/diagnostico")

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert len(corpo["registros"]) == 4
    assert "sincronizacao" not in corpo


def test_diagnostico_resumo_bate_com_a_soma_dos_casos_individuais():
    """Critério de aceite explícito da 19.8.2."""
    _sincronizar_base_sqlite(registros=_REGISTROS_DIAGNOSTICO, servidores=_SERVIDORES_DIAGNOSTICO)
    resposta = client.get("/api/v1/analitica/diagnostico")

    corpo = resposta.json()
    resumo = corpo["resumo"]
    assert resumo["esperado"] + resumo["atencao"] + resumo["inconsistencia"] == len(corpo["registros"])
    contagem_real = {"esperado": 0, "atencao": 0, "inconsistencia": 0}
    for registro in corpo["registros"]:
        contagem_real[registro["classificacao"]] += 1
    assert contagem_real == resumo


def test_diagnostico_classifica_cada_cenario_corretamente():
    _sincronizar_base_sqlite(registros=_REGISTROS_DIAGNOSTICO, servidores=_SERVIDORES_DIAGNOSTICO)
    resposta = client.get("/api/v1/analitica/diagnostico")

    por_sei = {registro["sei"]: registro for registro in resposta.json()["registros"]}

    perfeito = por_sei["19.20.0002.0000001/2026-01"]
    assert perfeito["classificacao"] == "esperado"
    assert perfeito["casos"] == []

    sem_cadastro = por_sei["19.20.0002.0000002/2026-02"]
    assert sem_cadastro["classificacao"] == "esperado"
    assert [c["titulo"] for c in sem_cadastro["casos"]] == ["Servidor sem cadastro"]

    dh_vazio = por_sei["19.20.0002.0000003/2026-03"]
    assert dh_vazio["classificacao"] == "atencao"
    assert "Documento Hábil ausente — motivo não identificado" in [c["titulo"] for c in dh_vazio["casos"]]

    periodo_invalido = por_sei["19.20.0002.0000004/2026-04"]
    assert periodo_invalido["classificacao"] == "inconsistencia"
    assert "Período inválido" in [c["titulo"] for c in periodo_invalido["casos"]]


def test_diagnostico_caso_nunca_expoe_campo_classificacao_proprio():
    """Só `RegistroDiagnosticado.classificacao` (agregado) existe no
    contrato — `CasoDiagnostico` individual nunca carrega esse campo
    (§ 12.4)."""
    _sincronizar_base_sqlite(registros=_REGISTROS_DIAGNOSTICO, servidores=_SERVIDORES_DIAGNOSTICO)
    resposta = client.get("/api/v1/analitica/diagnostico")

    dh_vazio = next(r for r in resposta.json()["registros"] if r["sei"] == "19.20.0002.0000003/2026-03")
    caso = dh_vazio["casos"][0]
    assert set(caso.keys()) == {"campo", "titulo", "motivo", "acao_recomendada"}


def test_diagnostico_caso_tem_todos_os_campos_do_contrato():
    _sincronizar_base_sqlite(registros=_REGISTROS_DIAGNOSTICO, servidores=_SERVIDORES_DIAGNOSTICO)
    resposta = client.get("/api/v1/analitica/diagnostico")

    dh_vazio = next(r for r in resposta.json()["registros"] if r["sei"] == "19.20.0002.0000003/2026-03")
    caso = next(c for c in dh_vazio["casos"] if c["titulo"] == "Documento Hábil ausente — motivo não identificado")
    assert caso["campo"] == "dh"
    assert caso["titulo"]
    assert caso["motivo"]
    assert caso["acao_recomendada"]


def test_diagnostico_filtro_motivo_traduzido_corretamente():
    _sincronizar_base_sqlite(registros=_REGISTROS_DIAGNOSTICO, servidores=_SERVIDORES_DIAGNOSTICO)
    resposta = client.get("/api/v1/analitica/diagnostico", params={"motivo": "Reunião"})

    assert resposta.status_code == 200
    seis = {registro["sei"] for registro in resposta.json()["registros"]}
    assert seis == {"19.20.0002.0000001/2026-01", "19.20.0002.0000003/2026-03"}


def test_diagnostico_recorte_vazio_devolve_resumo_zerado_nunca_erro():
    """Critério de aceite explícito da 19.8.2."""
    _sincronizar_base_sqlite(registros=_REGISTROS_DIAGNOSTICO, servidores=_SERVIDORES_DIAGNOSTICO)
    resposta = client.get("/api/v1/analitica/diagnostico", params={"motivo": "Motivo Inexistente"})

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["resumo"] == {"esperado": 0, "atencao": 0, "inconsistencia": 0}
    assert corpo["registros"] == []


def test_diagnostico_base_local_inexistente_retorna_503():
    resposta = client.get("/api/v1/analitica/diagnostico")
    assert resposta.status_code == 503


def test_diagnostico_base_local_invalida_retorna_503():
    caminho = base_local_sqlite.caminho_base_local_sqlite()
    caminho.parent.mkdir(parents=True, exist_ok=True)
    caminho.write_bytes(b"isto nao e um banco sqlite")

    resposta = client.get("/api/v1/analitica/diagnostico")
    assert resposta.status_code == 503


def test_diagnostico_periodo_final_antes_do_inicial_retorna_422():
    _sincronizar_base_sqlite(registros=_REGISTROS_DIAGNOSTICO, servidores=_SERVIDORES_DIAGNOSTICO)
    resposta = client.get(
        "/api/v1/analitica/diagnostico",
        params={"periodo_inicial": "2026-05-01", "periodo_final": "2026-01-01"},
    )
    assert resposta.status_code == 422


def test_diagnostico_valor_maximo_menor_que_valor_minimo_retorna_422():
    _sincronizar_base_sqlite(registros=_REGISTROS_DIAGNOSTICO, servidores=_SERVIDORES_DIAGNOSTICO)
    resposta = client.get(
        "/api/v1/analitica/diagnostico",
        params={"valor_minimo": 300, "valor_maximo": 100},
    )
    assert resposta.status_code == 422


def test_diagnostico_nunca_aceita_parametro_de_paginacao_ou_ordenacao():
    _sincronizar_base_sqlite(registros=_REGISTROS_DIAGNOSTICO, servidores=_SERVIDORES_DIAGNOSTICO)

    resposta_sem = client.get("/api/v1/analitica/diagnostico")
    resposta_com = client.get(
        "/api/v1/analitica/diagnostico", params={"pagina": 2, "tamanho_pagina": 1, "ordenar_por": "valor"}
    )

    assert resposta_sem.status_code == 200
    assert resposta_com.status_code == 200
    assert resposta_sem.json() == resposta_com.json()


@pytest.mark.parametrize(
    "params",
    [
        {},
        {"motivo": "Reunião"},
        {"cpf": "11111111111"},
        {"municipio": "recife"},
        {"motivo": "Motivo Inexistente"},
    ],
)
def test_diagnostico_traduz_cada_filtro_igual_a_diarias_sem_divergencia(params):
    """Mesmo requisito já provado para `/indicadores`/`/distribuicoes`:
    o recorte diagnosticado precisa ser idêntico ao de `/diarias` com o
    mesmo filtro."""
    _sincronizar_base_sqlite(registros=_REGISTROS_DIAGNOSTICO, servidores=_SERVIDORES_DIAGNOSTICO)

    resposta_diarias = client.get("/api/v1/analitica/diarias", params={**params, "tamanho_pagina": 100})
    resposta_diagnostico = client.get("/api/v1/analitica/diagnostico", params=params)

    assert resposta_diarias.status_code == 200
    assert resposta_diagnostico.status_code == 200
    assert resposta_diagnostico.json()["resumo"]["esperado"] + resposta_diagnostico.json()["resumo"]["atencao"] + resposta_diagnostico.json()["resumo"]["inconsistencia"] == resposta_diarias.json()["paginacao"]["total_itens"]


# --- Correção de foco (2026-08-05) — GET /documentos-habeis-pendentes ----
#
# Substitui a experiência antes exposta pelo botão "Análise Rápida
# (Diagnóstico)": só registros com `dh` vazio, nunca o catálogo geral de
# anomalias. Datas relativas a `date.today()` (não absolutas como em
# `_REGISTROS_DIAGNOSTICO` acima) — os cenários de "aguardando liberação"
# vs. "revisão manual" dependem de comparar `periodo_inicial - 15 dias`
# contra o dia real em que a suíte roda, então usar datas fixas do
# calendário de 2026 tornaria os testes frágeis a partir do dia em que
# deixarem de estar no "futuro".

_JOAO = Servidor(cpf="22222222222", nome="João Silva", cargo="Técnico", previdencia="RGPS", matricula="1002", situacao="Em exercício")
_ANA = Servidor(cpf="33333333333", nome="Ana Costa", cargo="Analista", previdencia="RPPS", matricula="1003", situacao="Licença")
_HOJE_TESTE = date.today()

_REGISTROS_DH_PENDENTES = [
    # DH preenchido -> nunca aparece nesta lista.
    _registro(
        "19.20.0003.0000001/2026-01", "11111111111",
        _HOJE_TESTE + timedelta(days=1), _HOJE_TESTE + timedelta(days=3),
        "RECIFE", "GARANHUNS", "Reunião", transporte="CARRO", valor=200.0, linha=2, dh="DH-001",
    ),
    # DH vazio, período inicial daqui a 20 dias -> libera em 5 dias (RN-06) -> aguardando_liberacao.
    _registro(
        "19.20.0003.0000002/2026-02", "22222222222",
        _HOJE_TESTE + timedelta(days=20), _HOJE_TESTE + timedelta(days=22),
        "RECIFE", "ARARIPINA", "Fiscalização", transporte="AVIAO", valor=350.5, linha=3, dh=None,
    ),
    # DH vazio, período inicial há 30 dias -> data de liberação (período - 15) há 45 dias, já ultrapassada -> revisao_manual_necessaria.
    _registro(
        "19.20.0003.0000003/2026-03", "33333333333",
        _HOJE_TESTE - timedelta(days=30), _HOJE_TESTE - timedelta(days=28),
        "CARUARU", "RECIFE", "Reunião", dh=None, linha=4,
    ),
]
_SERVIDORES_DH_PENDENTES = {"11111111111": _MARIA, "22222222222": _JOAO, "33333333333": _ANA}


def test_documentos_habeis_pendentes_so_retorna_registros_com_dh_vazio():
    _sincronizar_base_sqlite(registros=_REGISTROS_DH_PENDENTES, servidores=_SERVIDORES_DH_PENDENTES)
    resposta = client.get("/api/v1/analitica/documentos-habeis-pendentes")

    assert resposta.status_code == 200
    seis = {registro["sei"] for registro in resposta.json()["registros"]}
    assert seis == {"19.20.0003.0000002/2026-02", "19.20.0003.0000003/2026-03"}
    assert "19.20.0003.0000001/2026-01" not in seis


def test_documentos_habeis_pendentes_nunca_retorna_dh_preenchido_nem_com_filtro_amplo():
    """Mesmo sem nenhum filtro que isole os 3 registros, o registro com
    `dh` preenchido nunca aparece — a exclusão é sobre o campo, não sobre
    o filtro de busca."""
    _sincronizar_base_sqlite(registros=_REGISTROS_DH_PENDENTES, servidores=_SERVIDORES_DH_PENDENTES)
    resposta = client.get("/api/v1/analitica/documentos-habeis-pendentes", params={"cpf": "11111111111"})

    assert resposta.status_code == 200
    assert resposta.json()["registros"] == []


def test_documentos_habeis_pendentes_classifica_aguardando_liberacao():
    _sincronizar_base_sqlite(registros=_REGISTROS_DH_PENDENTES, servidores=_SERVIDORES_DH_PENDENTES)
    resposta = client.get("/api/v1/analitica/documentos-habeis-pendentes")

    aguardando = next(r for r in resposta.json()["registros"] if r["sei"] == "19.20.0003.0000002/2026-02")
    assert aguardando["situacao"] == "aguardando_liberacao"
    assert aguardando["dias_restantes"] == 5
    assert aguardando["dias_atraso"] is None
    assert aguardando["texto_contagem"] is not None
    assert aguardando["mensagem"] == "Documento Hábil ainda não disponível. Aguardar a data de liberação."


def test_documentos_habeis_pendentes_classifica_revisao_manual_necessaria():
    _sincronizar_base_sqlite(registros=_REGISTROS_DH_PENDENTES, servidores=_SERVIDORES_DH_PENDENTES)
    resposta = client.get("/api/v1/analitica/documentos-habeis-pendentes")

    revisao = next(r for r in resposta.json()["registros"] if r["sei"] == "19.20.0003.0000003/2026-03")
    assert revisao["situacao"] == "revisao_manual_necessaria"
    assert revisao["dias_atraso"] == 45
    assert revisao["dias_restantes"] is None
    assert revisao["texto_contagem"] is None
    assert revisao["mensagem"] == (
        "Documento Hábil pendente. A data de liberação já foi atingida. Recomenda-se análise manual."
    )


def test_documentos_habeis_pendentes_resumo_bate_com_a_lista():
    _sincronizar_base_sqlite(registros=_REGISTROS_DH_PENDENTES, servidores=_SERVIDORES_DH_PENDENTES)
    resposta = client.get("/api/v1/analitica/documentos-habeis-pendentes")

    corpo = resposta.json()
    contagem_real = {"aguardando_liberacao": 0, "revisao_manual_necessaria": 0}
    for registro in corpo["registros"]:
        contagem_real[registro["situacao"]] += 1
    assert contagem_real == corpo["resumo"]
    assert corpo["resumo"] == {"aguardando_liberacao": 1, "revisao_manual_necessaria": 1}


def test_documentos_habeis_pendentes_cpf_sempre_mascarado():
    _sincronizar_base_sqlite(registros=_REGISTROS_DH_PENDENTES, servidores=_SERVIDORES_DH_PENDENTES)
    resposta = client.get("/api/v1/analitica/documentos-habeis-pendentes")

    for registro in resposta.json()["registros"]:
        assert "cpf" not in registro
        assert registro["cpf_mascarado"] is None or "*" in registro["cpf_mascarado"]


def test_documentos_habeis_pendentes_ordenacao_revisao_manual_antes_de_aguardando():
    _sincronizar_base_sqlite(registros=_REGISTROS_DH_PENDENTES, servidores=_SERVIDORES_DH_PENDENTES)
    resposta = client.get("/api/v1/analitica/documentos-habeis-pendentes")

    seis_em_ordem = [registro["sei"] for registro in resposta.json()["registros"]]
    assert seis_em_ordem == ["19.20.0003.0000003/2026-03", "19.20.0003.0000002/2026-02"]


def test_documentos_habeis_pendentes_filtro_motivo_traduzido_corretamente():
    _sincronizar_base_sqlite(registros=_REGISTROS_DH_PENDENTES, servidores=_SERVIDORES_DH_PENDENTES)
    resposta = client.get("/api/v1/analitica/documentos-habeis-pendentes", params={"motivo": "Fiscalização"})

    assert resposta.status_code == 200
    seis = {registro["sei"] for registro in resposta.json()["registros"]}
    assert seis == {"19.20.0003.0000002/2026-02"}


def test_documentos_habeis_pendentes_filtro_municipio_traduzido_corretamente():
    _sincronizar_base_sqlite(registros=_REGISTROS_DH_PENDENTES, servidores=_SERVIDORES_DH_PENDENTES)
    resposta = client.get("/api/v1/analitica/documentos-habeis-pendentes", params={"municipio": "caruaru"})

    assert resposta.status_code == 200
    seis = {registro["sei"] for registro in resposta.json()["registros"]}
    assert seis == {"19.20.0003.0000003/2026-03"}


def test_documentos_habeis_pendentes_filtro_periodo_traduzido_corretamente():
    _sincronizar_base_sqlite(registros=_REGISTROS_DH_PENDENTES, servidores=_SERVIDORES_DH_PENDENTES)
    resposta = client.get(
        "/api/v1/analitica/documentos-habeis-pendentes",
        params={
            "periodo_inicial": (_HOJE_TESTE + timedelta(days=15)).isoformat(),
            "periodo_final": (_HOJE_TESTE + timedelta(days=25)).isoformat(),
        },
    )

    assert resposta.status_code == 200
    seis = {registro["sei"] for registro in resposta.json()["registros"]}
    assert seis == {"19.20.0003.0000002/2026-02"}


def test_documentos_habeis_pendentes_filtro_servidor_nome_traduzido_corretamente():
    _sincronizar_base_sqlite(registros=_REGISTROS_DH_PENDENTES, servidores=_SERVIDORES_DH_PENDENTES)
    resposta = client.get("/api/v1/analitica/documentos-habeis-pendentes", params={"servidor_nome": "Ana Costa"})

    assert resposta.status_code == 200
    seis = {registro["sei"] for registro in resposta.json()["registros"]}
    assert seis == {"19.20.0003.0000003/2026-03"}


def test_documentos_habeis_pendentes_filtro_categoria_funcional_traduzido_corretamente():
    """`categoria_funcional` (Sprint 20) já é calculada em
    `base_local_sqlite.reconstruir` a partir do cargo — nenhum registro
    desta massa tem cargo do catálogo fechado de MEMBRO, então filtrar por
    "MEMBRO" precisa devolver o recorte vazio, nunca um erro."""
    _sincronizar_base_sqlite(registros=_REGISTROS_DH_PENDENTES, servidores=_SERVIDORES_DH_PENDENTES)
    resposta = client.get("/api/v1/analitica/documentos-habeis-pendentes", params={"categoria_funcional": "MEMBRO"})

    assert resposta.status_code == 200
    assert resposta.json()["registros"] == []


def test_documentos_habeis_pendentes_recorte_vazio_devolve_resumo_zerado_nunca_erro():
    _sincronizar_base_sqlite(registros=_REGISTROS_DH_PENDENTES, servidores=_SERVIDORES_DH_PENDENTES)
    resposta = client.get(
        "/api/v1/analitica/documentos-habeis-pendentes", params={"motivo": "Motivo Inexistente"}
    )

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["resumo"] == {"aguardando_liberacao": 0, "revisao_manual_necessaria": 0}
    assert corpo["registros"] == []


def test_documentos_habeis_pendentes_base_local_inexistente_retorna_503():
    resposta = client.get("/api/v1/analitica/documentos-habeis-pendentes")
    assert resposta.status_code == 503


def test_documentos_habeis_pendentes_base_local_invalida_retorna_503():
    caminho = base_local_sqlite.caminho_base_local_sqlite()
    caminho.parent.mkdir(parents=True, exist_ok=True)
    caminho.write_bytes(b"isto nao e um banco sqlite")

    resposta = client.get("/api/v1/analitica/documentos-habeis-pendentes")
    assert resposta.status_code == 503


def test_documentos_habeis_pendentes_periodo_final_antes_do_inicial_retorna_422():
    _sincronizar_base_sqlite(registros=_REGISTROS_DH_PENDENTES, servidores=_SERVIDORES_DH_PENDENTES)
    resposta = client.get(
        "/api/v1/analitica/documentos-habeis-pendentes",
        params={"periodo_inicial": "2026-05-01", "periodo_final": "2026-01-01"},
    )
    assert resposta.status_code == 422


def test_documentos_habeis_pendentes_valor_maximo_menor_que_valor_minimo_retorna_422():
    _sincronizar_base_sqlite(registros=_REGISTROS_DH_PENDENTES, servidores=_SERVIDORES_DH_PENDENTES)
    resposta = client.get(
        "/api/v1/analitica/documentos-habeis-pendentes",
        params={"valor_minimo": 300, "valor_maximo": 100},
    )
    assert resposta.status_code == 422


def test_documentos_habeis_pendentes_nunca_aceita_parametro_de_paginacao_ou_ordenacao():
    _sincronizar_base_sqlite(registros=_REGISTROS_DH_PENDENTES, servidores=_SERVIDORES_DH_PENDENTES)

    resposta_sem = client.get("/api/v1/analitica/documentos-habeis-pendentes")
    resposta_com = client.get(
        "/api/v1/analitica/documentos-habeis-pendentes",
        params={"pagina": 2, "tamanho_pagina": 1, "ordenar_por": "valor"},
    )

    assert resposta_sem.status_code == 200
    assert resposta_com.status_code == 200
    assert resposta_sem.json() == resposta_com.json()


def test_documentos_habeis_pendentes_registro_tem_todos_os_campos_do_contrato():
    _sincronizar_base_sqlite(registros=_REGISTROS_DH_PENDENTES, servidores=_SERVIDORES_DH_PENDENTES)
    resposta = client.get("/api/v1/analitica/documentos-habeis-pendentes")

    registro = resposta.json()["registros"][0]
    assert set(registro.keys()) == {
        "sei", "servidor_nome", "cpf_mascarado", "periodo", "destino",
        "data_liberacao_prevista", "situacao", "dias_restantes", "dias_atraso",
        "texto_contagem", "mensagem",
    }
    assert "sincronizacao" not in resposta.json()


# --- Sprint 19.7.2 — POST /relatorios -----------------------------------


def _corpo_relatorio(*, tipo="executivo", formato="pdf", modo="final", filtros=None, **overrides):
    """`incluir_graficos` deliberadamente NÃO tem `False` como padrão no
    schema (regra `_graficos_apenas_em_pdf`) — qualquer teste que use um
    `formato` diferente de `"pdf"` precisa passá-lo explicitamente,
    exatamente como o próprio formulário (19.7.3) terá que fazer."""
    corpo = {"filtros": filtros or {}, "tipo": tipo, "formato": formato, "modo": modo}
    corpo.update(overrides)
    return corpo


def _extrair_texto_pdf(caminho: str) -> str:
    import pdfplumber

    with pdfplumber.open(caminho) as pdf:
        return "\n".join(pagina.extract_text() or "" for pagina in pdf.pages)


def test_relatorios_pdf_gera_arquivo_valido_e_abrivel():
    _sincronizar_base_sqlite()
    resposta = client.post("/api/v1/analitica/relatorios", json=_corpo_relatorio(tipo="executivo", formato="pdf"))

    assert resposta.status_code == 200
    corpo = resposta.json()
    caminho = corpo["caminho_arquivo_temporario"]
    assert caminho.endswith(".pdf")
    conteudo_bruto = open(caminho, "rb").read()
    assert conteudo_bruto.startswith(b"%PDF-")

    texto = _extrair_texto_pdf(caminho)
    assert "Relatório Executivo" in texto
    assert "Indicadores" in texto
    assert "Evolução por período" in texto


# --- Sprint 21.9 (Modo Executivo) — tipo "visao_executiva" + insights --


def test_relatorios_visao_executiva_contem_as_dimensoes_da_grade_executiva():
    _sincronizar_base_sqlite()
    resposta = client.post(
        "/api/v1/analitica/relatorios", json=_corpo_relatorio(tipo="visao_executiva", formato="pdf")
    )

    assert resposta.status_code == 200
    caminho = resposta.json()["caminho_arquivo_temporario"]
    texto = _extrair_texto_pdf(caminho)
    assert "Relatório Visão Executiva" in texto
    assert "Membros" in texto and "Servidores" in texto  # dimensão categoria_funcional
    assert "Unidade solicitante (documento de origem)" in texto
    assert "Meio de transporte" in texto


def test_relatorios_visao_executiva_com_insights_inclui_a_secao_no_pdf_verbatim():
    _sincronizar_base_sqlite()
    insights = [
        "🔼 Valor total +8% em relação a Julho/2026",
        "3 de 10 município(s) concentram 82% do valor total",
    ]
    resposta = client.post(
        "/api/v1/analitica/relatorios",
        json=_corpo_relatorio(tipo="visao_executiva", formato="pdf", insights=insights),
    )

    assert resposta.status_code == 200
    texto = _extrair_texto_pdf(resposta.json()["caminho_arquivo_temporario"])
    assert "Insights" in texto
    assert "Valor total +8% em relação a Julho/2026" in texto
    assert "3 de 10 município(s) concentram 82% do valor total" in texto


def test_relatorios_sem_insights_nunca_mostra_a_secao_insights():
    _sincronizar_base_sqlite()
    resposta = client.post(
        "/api/v1/analitica/relatorios", json=_corpo_relatorio(tipo="visao_executiva", formato="pdf")
    )

    texto = _extrair_texto_pdf(resposta.json()["caminho_arquivo_temporario"])
    assert "Insights" not in texto


def test_relatorios_insights_com_caractere_especial_nunca_quebra_o_pdf():
    # `&`/`<` dentro do texto do insight precisam ser escapados para XML
    # (mesmo tratamento já dado a `_resumo_filtros`) — nunca uma exceção.
    _sincronizar_base_sqlite()
    resposta = client.post(
        "/api/v1/analitica/relatorios",
        json=_corpo_relatorio(tipo="visao_executiva", formato="pdf", insights=["Motivo A & B < C"]),
    )

    assert resposta.status_code == 200
    texto = _extrair_texto_pdf(resposta.json()["caminho_arquivo_temporario"])
    assert "Motivo A & B" in texto


def test_relatorios_visao_executiva_tipo_ja_disponivel_nunca_retorna_422():
    # Diferente de "inconsistencias"/"qualidade_dados" (ainda bloqueados),
    # "visao_executiva" já está implementado desde a Sprint 21.9.
    _sincronizar_base_sqlite()
    resposta = client.post(
        "/api/v1/analitica/relatorios", json=_corpo_relatorio(tipo="visao_executiva", formato="pdf")
    )
    assert resposta.status_code == 200


def test_relatorios_visao_executiva_nunca_altera_o_pdf_ja_homologado_de_executivo():
    _sincronizar_base_sqlite()
    resposta = client.post("/api/v1/analitica/relatorios", json=_corpo_relatorio(tipo="executivo", formato="pdf"))

    assert resposta.status_code == 200
    texto = _extrair_texto_pdf(resposta.json()["caminho_arquivo_temporario"])
    assert "Relatório Executivo" in texto
    assert "Evolução por período" in texto
    # Continua sem as dimensões novas — composição intocada (Sprint 21.9 é
    # 100% aditiva, nunca mudou "executivo").
    assert "Meio de transporte" not in texto


def test_relatorios_excel_gera_arquivo_valido_e_abrivel():
    """Correção de 2026-08-05 (Bloco de Refinamento): o Excel passou a ter
    uma aba por seção (nunca tudo empilhado numa aba só, causa raiz do
    truncamento/falta de congelamento e autofiltro úteis relatada) — a
    aba "Resumo" traz título/indicadores, "Tabela do recorte" é uma aba
    própria."""
    _sincronizar_base_sqlite()
    resposta = client.post(
        "/api/v1/analitica/relatorios",
        json=_corpo_relatorio(tipo="detalhado", formato="excel", incluir_graficos=False),
    )

    assert resposta.status_code == 200
    caminho = resposta.json()["caminho_arquivo_temporario"]
    assert caminho.endswith(".xlsx")

    workbook = load_workbook(caminho)
    assert workbook.sheetnames == ["Resumo", "Tabela do recorte"]

    valores_resumo = [
        str(celula.value) for linha in workbook["Resumo"].iter_rows() for celula in linha if celula.value is not None
    ]
    assert "Indicadores" in valores_resumo

    aba_tabela = workbook["Tabela do recorte"]
    assert aba_tabela.freeze_panes == "A2"
    assert len(aba_tabela.tables) == 1


def test_relatorios_csv_gera_arquivo_valido_e_abrivel():
    _sincronizar_base_sqlite()
    resposta = client.post(
        "/api/v1/analitica/relatorios",
        json=_corpo_relatorio(tipo="por_municipio", formato="csv", incluir_graficos=False),
    )

    assert resposta.status_code == 200
    caminho = resposta.json()["caminho_arquivo_temporario"]
    assert caminho.endswith(".csv")

    conteudo = open(caminho, encoding="utf-8-sig").read()
    assert "Indicadores" in conteudo
    assert "Gerado em" in conteudo
    assert "Última sincronização" in conteudo


def test_relatorios_graficos_em_formato_nao_pdf_retorna_422():
    _sincronizar_base_sqlite()
    resposta = client.post(
        "/api/v1/analitica/relatorios",
        json=_corpo_relatorio(formato="excel", incluir_graficos=True),
    )
    assert resposta.status_code == 422


def test_relatorios_graficos_em_csv_retorna_422():
    _sincronizar_base_sqlite()
    resposta = client.post(
        "/api/v1/analitica/relatorios",
        json=_corpo_relatorio(formato="csv", incluir_graficos=True),
    )
    assert resposta.status_code == 422


@pytest.mark.parametrize("tipo", ["inconsistencias", "qualidade_dados"])
def test_relatorios_tipo_dependente_do_diagnostico_ainda_nao_implementado_retorna_422(tipo):
    """"Inconsistências"/"Qualidade dos dados" dependem de
    `app/domain/analitica/diagnostico.py` (Sprint 19.8), que ainda não
    existe — o contrato aceita o valor (`TipoRelatorio` tem os 8), mas o
    serviço recusa explicitamente, nunca uma composição inventada."""
    _sincronizar_base_sqlite()
    resposta = client.post(
        "/api/v1/analitica/relatorios",
        json=_corpo_relatorio(tipo=tipo, formato="csv", incluir_graficos=False),
    )
    assert resposta.status_code == 422


@pytest.mark.parametrize(
    ("tipo", "formato", "extensao"),
    [
        ("executivo", "pdf", ".pdf"),
        ("financeiro", "excel", ".xlsx"),
        ("por_situacao", "csv", ".csv"),
    ],
)
def test_relatorios_nome_sugerido_tem_a_extensao_correta_por_formato(tipo, formato, extensao):
    _sincronizar_base_sqlite()
    resposta = client.post(
        "/api/v1/analitica/relatorios",
        json=_corpo_relatorio(tipo=tipo, formato=formato, incluir_graficos=(formato == "pdf")),
    )

    assert resposta.status_code == 200
    assert resposta.json()["nome_sugerido"].endswith(extensao)


def test_relatorios_sincronizado_em_presente_e_igual_ao_de_diarias():
    """Regra vinculante herdada (`README.md § 0.1` item 6): timestamp de
    sincronização obrigatório em todo artefato exportado."""
    _sincronizar_base_sqlite()
    corpo_diarias = client.get("/api/v1/analitica/diarias").json()
    resposta = client.post("/api/v1/analitica/relatorios", json=_corpo_relatorio())

    assert resposta.status_code == 200
    assert resposta.json()["sincronizado_em"] == corpo_diarias["sincronizacao"]["sincronizado_em"]


def test_relatorios_modo_previsualizacao_gera_o_mesmo_tipo_de_artefato_que_final():
    """Decisão registrada em `analitica_service.gerar_relatorio`:
    `previsualizacao`/`final` produzem o mesmo artefato — nenhum documento
    homologado define um payload de prévia diferente."""
    _sincronizar_base_sqlite()
    resposta_previa = client.post("/api/v1/analitica/relatorios", json=_corpo_relatorio(modo="previsualizacao"))
    resposta_final = client.post("/api/v1/analitica/relatorios", json=_corpo_relatorio(modo="final"))

    assert resposta_previa.status_code == 200
    assert resposta_final.status_code == 200
    for corpo in (resposta_previa.json(), resposta_final.json()):
        assert open(corpo["caminho_arquivo_temporario"], "rb").read().startswith(b"%PDF-")
    # Caminhos distintos — cada geração escreve seu próprio arquivo,
    # nenhum dos dois modos sobrescreve o outro.
    assert resposta_previa.json()["caminho_arquivo_temporario"] != resposta_final.json()["caminho_arquivo_temporario"]


def test_relatorios_financeiro_nunca_inclui_secao_de_servidor_ou_situacao():
    """Critério de aceite literal da 19.7.1/19.7.2: "Financeiro" nunca
    inclui dado cadastral do servidor — aqui, verificado no artefato
    físico já escrito, não só na composição em memória."""
    _sincronizar_base_sqlite()
    resposta = client.post("/api/v1/analitica/relatorios", json=_corpo_relatorio(tipo="financeiro", formato="pdf"))

    assert resposta.status_code == 200
    texto = _extrair_texto_pdf(resposta.json()["caminho_arquivo_temporario"])
    assert "Ranking de servidores" not in texto
    assert "Distribuição por situação do servidor" not in texto
    assert "Evolução por período" in texto
    assert "Ranking de municípios" in texto


def test_relatorios_detalhado_tabela_mascara_cpf_nunca_expoe_cru():
    """Mesma regra vinculante de `test_diarias_nunca_retorna_cpf_completo_de_nenhum_registro`,
    agora sobre o artefato físico exportado (mais sensível que a resposta
    HTTP, porque vira um arquivo portátil que o usuário pode compartilhar)."""
    _sincronizar_base_sqlite()
    resposta = client.post(
        "/api/v1/analitica/relatorios",
        json=_corpo_relatorio(tipo="detalhado", formato="csv", incluir_graficos=False),
    )

    assert resposta.status_code == 200
    conteudo = open(resposta.json()["caminho_arquivo_temporario"], encoding="utf-8-sig").read()
    for registro in REGISTROS:
        assert registro.cpf not in conteudo
    assert "***.***.***-11" in conteudo


def test_relatorios_incluir_tabela_false_omite_tabela_mesmo_para_detalhado():
    _sincronizar_base_sqlite()
    resposta = client.post(
        "/api/v1/analitica/relatorios",
        json=_corpo_relatorio(tipo="detalhado", formato="csv", incluir_graficos=False, incluir_tabela=False),
    )

    assert resposta.status_code == 200
    conteudo = open(resposta.json()["caminho_arquivo_temporario"], encoding="utf-8-sig").read()
    assert "Tabela do recorte" not in conteudo
    assert REGISTROS[0].sei not in conteudo


def test_relatorios_incluir_indicadores_false_omite_secao_de_indicadores():
    _sincronizar_base_sqlite()
    resposta = client.post(
        "/api/v1/analitica/relatorios",
        json=_corpo_relatorio(tipo="executivo", formato="csv", incluir_graficos=False, incluir_indicadores=False),
    )

    assert resposta.status_code == 200
    conteudo = open(resposta.json()["caminho_arquivo_temporario"], encoding="utf-8-sig").read()
    assert "Indicadores" not in conteudo


def test_relatorios_filtro_motivo_traduzido_igual_a_diarias():
    """Mesmo critério de paridade já provado para `/indicadores`/
    `/distribuicoes`: o recorte usado para compor o relatório precisa ser
    idêntico ao de `/diarias` com o mesmo filtro."""
    _sincronizar_base_sqlite()
    resposta_diarias = client.get("/api/v1/analitica/diarias", params={"motivo": "Reunião"})
    resposta = client.post(
        "/api/v1/analitica/relatorios",
        json=_corpo_relatorio(tipo="detalhado", formato="csv", incluir_graficos=False, filtros={"motivo": "Reunião"}),
    )

    assert resposta.status_code == 200
    total_diarias_esperado = resposta_diarias.json()["paginacao"]["total_itens"]
    with open(resposta.json()["caminho_arquivo_temporario"], newline="", encoding="utf-8-sig") as arquivo:
        linhas = list(csv.reader(arquivo))
    indice_indicadores = linhas.index(["Total de diárias", str(total_diarias_esperado)])
    assert linhas[indice_indicadores - 1] == ["Indicador", "Valor"]


def test_relatorios_periodo_final_antes_do_inicial_retorna_422():
    _sincronizar_base_sqlite()
    resposta = client.post(
        "/api/v1/analitica/relatorios",
        json=_corpo_relatorio(filtros={"periodo_inicial": "2026-05-01", "periodo_final": "2026-01-01"}),
    )
    assert resposta.status_code == 422


def test_relatorios_valor_maximo_menor_que_valor_minimo_retorna_422():
    _sincronizar_base_sqlite()
    resposta = client.post(
        "/api/v1/analitica/relatorios",
        json=_corpo_relatorio(filtros={"valor_minimo": 300, "valor_maximo": 100}),
    )
    assert resposta.status_code == 422


def test_relatorios_tipo_invalido_retorna_422():
    """Mesmo critério de `test_distribuicoes_dimensao_invalida_retorna_422`
    — valor fora do `Literal[TipoRelatorio]` é rejeitado nativamente pelo
    Pydantic, antes de chegar em `gerar_relatorio`."""
    _sincronizar_base_sqlite()
    resposta = client.post(
        "/api/v1/analitica/relatorios",
        json=_corpo_relatorio(tipo="tipo-que-nao-existe", formato="csv", incluir_graficos=False),
    )
    assert resposta.status_code == 422


def test_relatorios_campo_obrigatorio_ausente_retorna_422():
    """Mesmo critério de `test_distribuicoes_sem_dimensao_retorna_422` —
    `modo` é obrigatório (sem valor padrão), diferente dos 4 `incluir_*`."""
    _sincronizar_base_sqlite()
    corpo = _corpo_relatorio()
    del corpo["modo"]
    resposta = client.post("/api/v1/analitica/relatorios", json=corpo)
    assert resposta.status_code == 422


def test_relatorios_base_local_inexistente_retorna_503():
    resposta = client.post("/api/v1/analitica/relatorios", json=_corpo_relatorio())
    assert resposta.status_code == 503


def test_relatorios_base_local_invalida_retorna_503():
    caminho = base_local_sqlite.caminho_base_local_sqlite()
    caminho.parent.mkdir(parents=True, exist_ok=True)
    caminho.write_bytes(b"isto nao e um banco sqlite")

    resposta = client.post("/api/v1/analitica/relatorios", json=_corpo_relatorio())
    assert resposta.status_code == 503


def test_relatorios_recorte_vazio_gera_artefato_sem_erro():
    """Recorte vazio (§ 15 do plano técnico, "nunca erro") — o relatório
    ainda é gerado, só com indicadores zerados/distribuições vazias."""
    _sincronizar_base_sqlite()
    resposta = client.post(
        "/api/v1/analitica/relatorios",
        json=_corpo_relatorio(filtros={"motivo": "Motivo Inexistente"}),
    )

    assert resposta.status_code == 200
    texto = _extrair_texto_pdf(resposta.json()["caminho_arquivo_temporario"])
    assert "Relatório Executivo" in texto
