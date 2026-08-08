from datetime import date

from app.domain.analitica.distribuicoes import calcular_distribuicao
from app.domain.entities.registro_analitico import RegistroAnalitico
from app.domain.entities.servidor import Servidor


def _registro(
    *,
    cpf="11111111111",
    sei="19.20.0001.0000001/2026-01",
    periodo_inicial=date(2026, 1, 8),
    periodo_final=date(2026, 1, 10),
    cidade_origem="RECIFE",
    cidade_destino="GARANHUNS",
    motivo="Reunião",
    valor=None,
    servidor=None,
    doc_origem="processo.pdf",
    transporte=None,
    categoria_funcional="NAO_IDENTIFICADO",
):
    return RegistroAnalitico(
        sei=sei,
        doc_origem=doc_origem,
        cpf=cpf,
        periodo_inicial=periodo_inicial,
        periodo_final=periodo_final,
        cidade_origem=cidade_origem,
        cidade_destino=cidade_destino,
        motivo=motivo,
        transporte=transporte,
        valor_total_diarias=valor,
        linha_planilha=2,
        servidor=servidor,
        categoria_funcional=categoria_funcional,
    )


_MARIA = Servidor(cpf="11111111111", nome="Maria Souza", cargo="Analista", previdencia="RPPS", situacao="Em exercício")
_JOAO = Servidor(cpf="22222222222", nome="João Silva", cargo="Técnico", previdencia="RGPS", situacao="Licença")


def test_recorte_vazio_devolve_lista_de_pontos_vazia():
    for dimensao in (
        "periodo",
        "servidor",
        "municipio",
        "motivo",
        "situacao",
        "origem_destino",
        "categoria_funcional",
        "doc_origem",
        "transporte",
    ):
        resultado = calcular_distribuicao([], dimensao)
        assert resultado.dimensao == dimensao
        assert resultado.pontos == []


class TestDimensaoPeriodo:
    def test_agrupa_por_ano_mes_da_periodo_inicial(self):
        registros = [
            _registro(sei="1", periodo_inicial=date(2026, 1, 8), periodo_final=date(2026, 1, 10), valor=100.0),
            _registro(sei="2", periodo_inicial=date(2026, 1, 20), periodo_final=date(2026, 1, 22), valor=50.0),
            _registro(sei="3", periodo_inicial=date(2026, 2, 1), periodo_final=date(2026, 2, 3), valor=200.0),
        ]

        resultado = calcular_distribuicao(registros, "periodo")

        assert [ponto.rotulo for ponto in resultado.pontos] == ["2026-01", "2026-02"]
        assert resultado.pontos[0].contagem == 2
        assert resultado.pontos[0].valor == 150.0
        assert resultado.pontos[1].contagem == 1
        assert resultado.pontos[1].valor == 200.0

    def test_ordem_e_cronologica_ascendente_mesmo_com_meses_fora_de_ordem(self):
        registros = [
            _registro(sei="1", periodo_inicial=date(2026, 6, 1), periodo_final=date(2026, 6, 2)),
            _registro(sei="2", periodo_inicial=date(2026, 1, 1), periodo_final=date(2026, 1, 2)),
            _registro(sei="3", periodo_inicial=date(2026, 3, 1), periodo_final=date(2026, 3, 2)),
        ]

        resultado = calcular_distribuicao(registros, "periodo")

        assert [ponto.rotulo for ponto in resultado.pontos] == ["2026-01", "2026-03", "2026-06"]

    def test_meses_de_anos_diferentes_nunca_se_confundem(self):
        registros = [
            _registro(sei="1", periodo_inicial=date(2025, 12, 1), periodo_final=date(2025, 12, 2)),
            _registro(sei="2", periodo_inicial=date(2026, 1, 1), periodo_final=date(2026, 1, 2)),
        ]

        resultado = calcular_distribuicao(registros, "periodo")

        assert [ponto.rotulo for ponto in resultado.pontos] == ["2025-12", "2026-01"]

    def test_diarias_sem_valor_sao_ignoradas_da_soma_nunca_tratadas_como_zero(self):
        registros = [
            _registro(sei="1", valor=100.0),
            _registro(sei="2", valor=None),
        ]

        resultado = calcular_distribuicao(registros, "periodo")

        assert resultado.pontos[0].contagem == 2
        assert resultado.pontos[0].valor == 100.0

    def test_todas_as_diarias_do_mes_sem_valor_devolve_none_nunca_zero(self):
        registros = [_registro(sei="1", valor=None), _registro(sei="2", valor=None)]

        resultado = calcular_distribuicao(registros, "periodo")

        assert resultado.pontos[0].valor is None


class TestDimensaoServidor:
    def test_agrupa_por_nome_do_servidor(self):
        registros = [
            _registro(sei="1", cpf="11111111111", servidor=_MARIA, valor=100.0),
            _registro(sei="2", cpf="11111111111", servidor=_MARIA, valor=50.0),
            _registro(sei="3", cpf="22222222222", servidor=_JOAO, valor=200.0),
        ]

        resultado = calcular_distribuicao(registros, "servidor")

        pontos_por_rotulo = {ponto.rotulo: ponto for ponto in resultado.pontos}
        assert pontos_por_rotulo["Maria Souza"].contagem == 2
        assert pontos_por_rotulo["Maria Souza"].valor == 150.0
        assert pontos_por_rotulo["João Silva"].contagem == 1
        assert pontos_por_rotulo["João Silva"].valor == 200.0

    def test_servidor_sem_cadastro_agrupa_num_rotulo_generico_nunca_expoe_cpf_cru(self):
        registros = [
            _registro(sei="1", cpf="99999999999", servidor=None, valor=100.0),
            _registro(sei="2", cpf="88888888888", servidor=None, valor=50.0),
        ]

        resultado = calcular_distribuicao(registros, "servidor")

        assert len(resultado.pontos) == 1
        assert resultado.pontos[0].rotulo == "Servidor sem cadastro"
        assert resultado.pontos[0].contagem == 2
        assert "99999999999" not in [ponto.rotulo for ponto in resultado.pontos]
        assert "88888888888" not in [ponto.rotulo for ponto in resultado.pontos]

    def test_ordem_e_decrescente_por_contagem(self):
        registros = [
            _registro(sei="1", cpf="11111111111", servidor=_MARIA),
            _registro(sei="2", cpf="22222222222", servidor=_JOAO),
            _registro(sei="3", cpf="22222222222", servidor=_JOAO),
        ]

        resultado = calcular_distribuicao(registros, "servidor")

        assert [ponto.rotulo for ponto in resultado.pontos] == ["João Silva", "Maria Souza"]


class TestDimensaoMunicipio:
    def test_agrupa_exclusivamente_por_cidade_destino_nunca_uniao_com_origem(self):
        # Decisão formal desta Sprint: `municipio` = "Top N cidade_destino"
        # (§ 6.2), nunca união origem/destino (essa é a semântica do
        # *filtro* "Município"/do KPI pendente "Total de municípios").
        registros = [
            _registro(sei="1", cidade_origem="ARARIPINA", cidade_destino="RECIFE", valor=100.0),
            _registro(sei="2", cidade_origem="RECIFE", cidade_destino="GARANHUNS", valor=200.0),
        ]

        resultado = calcular_distribuicao(registros, "municipio")

        rotulos = {ponto.rotulo for ponto in resultado.pontos}
        assert rotulos == {"RECIFE", "GARANHUNS"}
        # "RECIFE" aparece 1x como destino (registro 1) — a ocorrência como
        # origem (registro 2) nunca conta para esta dimensão.
        pontos_por_rotulo = {ponto.rotulo: ponto for ponto in resultado.pontos}
        assert pontos_por_rotulo["RECIFE"].contagem == 1

    def test_destino_ausente_agrupa_num_rotulo_generico_nunca_e_omitido_do_total(self):
        registros = [
            _registro(sei="1", cidade_destino="RECIFE"),
            _registro(sei="2", cidade_destino=None),
        ]

        resultado = calcular_distribuicao(registros, "municipio")

        pontos_por_rotulo = {ponto.rotulo: ponto for ponto in resultado.pontos}
        assert pontos_por_rotulo["Sem destino informado"].contagem == 1
        assert sum(ponto.contagem for ponto in resultado.pontos) == 2


class TestDimensaoMotivo:
    def test_agrupa_por_motivo_nunca_precisa_de_bucket_de_ausente(self):
        registros = [
            _registro(sei="1", motivo="Reunião", valor=100.0),
            _registro(sei="2", motivo="Reunião", valor=50.0),
            _registro(sei="3", motivo="Fiscalização", valor=200.0),
        ]

        resultado = calcular_distribuicao(registros, "motivo")

        pontos_por_rotulo = {ponto.rotulo: ponto for ponto in resultado.pontos}
        assert pontos_por_rotulo["Reunião"].contagem == 2
        assert pontos_por_rotulo["Reunião"].valor == 150.0
        assert pontos_por_rotulo["Fiscalização"].contagem == 1


class TestDimensaoSituacao:
    def test_agrupa_por_situacao_do_servidor_valor_e_sempre_none(self):
        registros = [
            _registro(sei="1", cpf="11111111111", servidor=_MARIA, valor=100.0),
            _registro(sei="2", cpf="11111111111", servidor=_MARIA, valor=50.0),
            _registro(sei="3", cpf="22222222222", servidor=_JOAO, valor=200.0),
        ]

        resultado = calcular_distribuicao(registros, "situacao")

        pontos_por_rotulo = {ponto.rotulo: ponto for ponto in resultado.pontos}
        assert pontos_por_rotulo["Em exercício"].contagem == 2
        assert pontos_por_rotulo["Em exercício"].valor is None
        assert pontos_por_rotulo["Licença"].contagem == 1
        assert pontos_por_rotulo["Licença"].valor is None

    def test_servidor_sem_cadastro_e_servidor_com_situacao_nula_caem_no_mesmo_bucket(self):
        servidor_sem_situacao = Servidor(cpf="33333333333", nome="Ana Costa", cargo="Analista", previdencia="RPPS", situacao=None)
        registros = [
            _registro(sei="1", cpf="99999999999", servidor=None),
            _registro(sei="2", cpf="33333333333", servidor=servidor_sem_situacao),
        ]

        resultado = calcular_distribuicao(registros, "situacao")

        assert len(resultado.pontos) == 1
        assert resultado.pontos[0].rotulo == "Situação não informada"
        assert resultado.pontos[0].contagem == 2

    def test_nunca_devolve_zero_inventado_mesmo_quando_ha_diarias_com_valor(self):
        # A dimensão inteira é "sem sentido financeiro" (§ 6.2 só declara
        # "× contagem" para "Distribuição por situação") — `valor` nunca é
        # `0.0`/somado, mesmo que as diárias daquele grupo tenham valor
        # preenchido.
        registros = [_registro(sei="1", cpf="11111111111", servidor=_MARIA, valor=999.0)]

        resultado = calcular_distribuicao(registros, "situacao")

        assert resultado.pontos[0].valor is None


class TestDimensaoOrigemDestino:
    def test_agrupa_por_par_real_origem_destino(self):
        registros = [
            _registro(sei="1", cidade_origem="RECIFE", cidade_destino="ARARIPINA", valor=100.0),
            _registro(sei="2", cidade_origem="RECIFE", cidade_destino="ARARIPINA", valor=50.0),
            _registro(sei="3", cidade_origem="RECIFE", cidade_destino="PETROLINA", valor=200.0),
        ]

        resultado = calcular_distribuicao(registros, "origem_destino")

        pontos_por_rotulo = {ponto.rotulo: ponto for ponto in resultado.pontos}
        assert pontos_por_rotulo["RECIFE → ARARIPINA"].contagem == 2
        assert pontos_por_rotulo["RECIFE → ARARIPINA"].valor == 150.0
        assert pontos_por_rotulo["RECIFE → PETROLINA"].contagem == 1

    def test_nunca_vira_contagem_de_municipio_unico_mesmo_par_e_bidirecional(self):
        # "Recife -> Araripina" e "Araripina -> Recife" são pares
        # DIFERENTES — nunca mesclados como se fossem o mesmo município
        # (essa mescla seria a interpretação de união, explicitamente
        # descartada para esta dimensão).
        registros = [
            _registro(sei="1", cidade_origem="RECIFE", cidade_destino="ARARIPINA"),
            _registro(sei="2", cidade_origem="ARARIPINA", cidade_destino="RECIFE"),
        ]

        resultado = calcular_distribuicao(registros, "origem_destino")

        rotulos = {ponto.rotulo for ponto in resultado.pontos}
        assert rotulos == {"RECIFE → ARARIPINA", "ARARIPINA → RECIFE"}

    def test_origem_ou_destino_ausente_agrupa_num_rotulo_generico_nunca_e_omitido(self):
        registros = [
            _registro(sei="1", cidade_origem=None, cidade_destino="ARARIPINA"),
            _registro(sei="2", cidade_origem="RECIFE", cidade_destino=None),
        ]

        resultado = calcular_distribuicao(registros, "origem_destino")

        rotulos = {ponto.rotulo for ponto in resultado.pontos}
        assert rotulos == {"Sem origem informada → ARARIPINA", "RECIFE → Sem destino informado"}


class TestDimensaoCategoriaFuncional:
    """Sprint 21.1 (Modo Executivo) — gráfico "Membros × Servidores"."""

    def test_agrupa_por_categoria_funcional_ja_calculada(self):
        registros = [
            _registro(sei="1", categoria_funcional="MEMBRO", valor=100.0),
            _registro(sei="2", categoria_funcional="SERVIDOR", valor=50.0),
            _registro(sei="3", categoria_funcional="SERVIDOR", valor=200.0),
        ]

        resultado = calcular_distribuicao(registros, "categoria_funcional")

        pontos_por_rotulo = {ponto.rotulo: ponto for ponto in resultado.pontos}
        assert pontos_por_rotulo["MEMBRO"].contagem == 1
        assert pontos_por_rotulo["MEMBRO"].valor == 100.0
        assert pontos_por_rotulo["SERVIDOR"].contagem == 2
        assert pontos_por_rotulo["SERVIDOR"].valor == 250.0

    def test_nao_identificado_e_um_bucket_normal_nunca_omitido(self):
        # Diferente de `servidor`/`situacao`, `categoria_funcional` nunca
        # precisa de um rótulo de "ausente" próprio — o próprio valor
        # `NAO_IDENTIFICADO` já é essa condição (RN-01, sem cadastro).
        registros = [
            _registro(sei="1", categoria_funcional="NAO_IDENTIFICADO"),
            _registro(sei="2", categoria_funcional="MEMBRO"),
        ]

        resultado = calcular_distribuicao(registros, "categoria_funcional")

        pontos_por_rotulo = {ponto.rotulo: ponto for ponto in resultado.pontos}
        assert pontos_por_rotulo["NAO_IDENTIFICADO"].contagem == 1
        assert sum(ponto.contagem for ponto in resultado.pontos) == 2

    def test_ordem_e_decrescente_por_contagem(self):
        registros = [
            _registro(sei="1", categoria_funcional="MEMBRO"),
            _registro(sei="2", categoria_funcional="SERVIDOR"),
            _registro(sei="3", categoria_funcional="SERVIDOR"),
        ]

        resultado = calcular_distribuicao(registros, "categoria_funcional")

        assert [ponto.rotulo for ponto in resultado.pontos] == ["SERVIDOR", "MEMBRO"]


class TestDimensaoDocOrigem:
    """Sprint 21.1 (Modo Executivo) — gráfico "Unidade solicitante
    (documento de origem)". Decisão de fechamento 9: é literalmente
    `doc_origem`, sem nenhuma reinterpretação institucional."""

    def test_agrupa_por_doc_origem(self):
        registros = [
            _registro(sei="1", doc_origem="GABPGJ - Gabinete do Procurador-Geral de Justiça", valor=100.0),
            _registro(sei="2", doc_origem="GABPGJ - Gabinete do Procurador-Geral de Justiça", valor=50.0),
            _registro(sei="3", doc_origem="SECCGMP - Secretarias da Corregedoria", valor=200.0),
        ]

        resultado = calcular_distribuicao(registros, "doc_origem")

        pontos_por_rotulo = {ponto.rotulo: ponto for ponto in resultado.pontos}
        assert pontos_por_rotulo["GABPGJ - Gabinete do Procurador-Geral de Justiça"].contagem == 2
        assert pontos_por_rotulo["GABPGJ - Gabinete do Procurador-Geral de Justiça"].valor == 150.0
        assert pontos_por_rotulo["SECCGMP - Secretarias da Corregedoria"].contagem == 1

    def test_doc_origem_vazio_agrupa_num_rotulo_generico_nunca_e_omitido(self):
        # `doc_origem` nunca é `None` no esquema (`RegistroAnalitico.
        # doc_origem: str`), mas pode ser `""` quando a célula da planilha
        # está em branco (`repositorio_diarias.py`) — tratado como ausente,
        # nunca como um rótulo vazio na distribuição.
        registros = [
            _registro(sei="1", doc_origem="GABPGJ - Gabinete do Procurador-Geral de Justiça"),
            _registro(sei="2", doc_origem=""),
        ]

        resultado = calcular_distribuicao(registros, "doc_origem")

        pontos_por_rotulo = {ponto.rotulo: ponto for ponto in resultado.pontos}
        assert pontos_por_rotulo["Unidade solicitante não informada"].contagem == 1
        assert sum(ponto.contagem for ponto in resultado.pontos) == 2


class TestDimensaoTransporte:
    """Sprint 21.1 (Modo Executivo) — gráfico "Meio de transporte"."""

    def test_agrupa_por_transporte(self):
        registros = [
            _registro(sei="1", transporte="CARRO", valor=100.0),
            _registro(sei="2", transporte="CARRO", valor=50.0),
            _registro(sei="3", transporte="AVIAO", valor=200.0),
        ]

        resultado = calcular_distribuicao(registros, "transporte")

        pontos_por_rotulo = {ponto.rotulo: ponto for ponto in resultado.pontos}
        assert pontos_por_rotulo["CARRO"].contagem == 2
        assert pontos_por_rotulo["CARRO"].valor == 150.0
        assert pontos_por_rotulo["AVIAO"].contagem == 1

    def test_transporte_ausente_agrupa_num_rotulo_generico_nunca_e_omitido(self):
        registros = [
            _registro(sei="1", transporte="CARRO"),
            _registro(sei="2", transporte=None),
        ]

        resultado = calcular_distribuicao(registros, "transporte")

        pontos_por_rotulo = {ponto.rotulo: ponto for ponto in resultado.pontos}
        assert pontos_por_rotulo["Transporte não identificado"].contagem == 1
        assert sum(ponto.contagem for ponto in resultado.pontos) == 2
