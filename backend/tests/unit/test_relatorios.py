from datetime import date

from app.domain.analitica.relatorios import compor_relatorio
from app.domain.entities.registro_analitico import RegistroAnalitico
from app.domain.entities.servidor import Servidor

_MARIA = Servidor(cpf="11111111111", nome="Maria Souza", cargo="Analista", previdencia="RPPS", situacao="Em exercício")
_JOAO = Servidor(cpf="22222222222", nome="João Silva", cargo="Técnico", previdencia="RGPS", situacao="Licença")


def _registro(
    *,
    cpf="11111111111",
    sei="19.20.0001.0000001/2026-01",
    periodo_inicial=date(2026, 1, 8),
    periodo_final=date(2026, 1, 10),
    cidade_origem="RECIFE",
    cidade_destino="GARANHUNS",
    motivo="Reunião",
    valor=100.0,
    servidor=None,
):
    return RegistroAnalitico(
        sei=sei,
        doc_origem="processo.pdf",
        cpf=cpf,
        periodo_inicial=periodo_inicial,
        periodo_final=periodo_final,
        cidade_origem=cidade_origem,
        cidade_destino=cidade_destino,
        motivo=motivo,
        transporte=None,
        valor_total_diarias=valor,
        linha_planilha=2,
        servidor=servidor,
    )


_REGISTROS = [
    _registro(sei="1", cpf="11111111111", servidor=_MARIA, cidade_destino="GARANHUNS", valor=100.0),
    _registro(sei="2", cpf="22222222222", servidor=_JOAO, cidade_destino="RECIFE", valor=200.0),
]


def test_recorte_vazio_devolve_indicadores_e_distribuicoes_vazios_para_qualquer_tipo():
    for tipo in (
        "executivo",
        "detalhado",
        "financeiro",
        "por_servidor",
        "por_municipio",
        "por_situacao",
        "visao_executiva",
    ):
        resultado = compor_relatorio([], tipo)
        assert resultado.indicadores.total_diarias == 0
        assert resultado.indicadores.valor_total is None
        assert all(distribuicao.pontos == [] for distribuicao in resultado.distribuicoes)
        assert resultado.registros == []


def test_indicadores_reaproveita_calcular_indicadores_nunca_recalcula():
    resultado = compor_relatorio(_REGISTROS, "detalhado")

    assert resultado.indicadores.total_diarias == 2
    assert resultado.indicadores.total_servidores == 2
    assert resultado.indicadores.valor_total == 300.0
    assert resultado.indicadores.valor_medio == 150.0


class TestExecutivo:
    def test_contem_indicadores_e_a_dimensao_periodo_sem_tabela(self):
        resultado = compor_relatorio(_REGISTROS, "executivo")

        assert resultado.tipo == "executivo"
        assert [distribuicao.dimensao for distribuicao in resultado.distribuicoes] == ["periodo"]
        assert resultado.registros == []


class TestDetalhado:
    def test_contem_todas_as_6_dimensoes_e_a_tabela_completa(self):
        resultado = compor_relatorio(_REGISTROS, "detalhado")

        dimensoes = {distribuicao.dimensao for distribuicao in resultado.distribuicoes}
        assert dimensoes == {"periodo", "servidor", "municipio", "motivo", "situacao", "origem_destino"}
        assert resultado.registros == _REGISTROS


class TestFinanceiro:
    def test_contem_indicadores_periodo_e_municipio_sem_dado_cadastral_do_servidor(self):
        resultado = compor_relatorio(_REGISTROS, "financeiro")

        dimensoes = {distribuicao.dimensao for distribuicao in resultado.distribuicoes}
        assert dimensoes == {"periodo", "municipio"}
        # Nenhuma dimensão que identifique um servidor específico
        # ("servidor"/"situacao") nem a tabela bruta — critério de aceite
        # literal da 19.7.1 ("Financeiro nunca inclui dado cadastral do
        # servidor").
        assert "servidor" not in dimensoes
        assert "situacao" not in dimensoes
        assert resultado.registros == []


class TestPorServidor:
    def test_contem_indicadores_e_só_a_dimensao_servidor_sem_tabela(self):
        resultado = compor_relatorio(_REGISTROS, "por_servidor")

        assert [distribuicao.dimensao for distribuicao in resultado.distribuicoes] == ["servidor"]
        rotulos = {ponto.rotulo for distribuicao in resultado.distribuicoes for ponto in distribuicao.pontos}
        assert rotulos == {"Maria Souza", "João Silva"}
        assert resultado.registros == []


class TestPorMunicipio:
    def test_contem_indicadores_e_só_a_dimensao_municipio_sem_tabela(self):
        resultado = compor_relatorio(_REGISTROS, "por_municipio")

        assert [distribuicao.dimensao for distribuicao in resultado.distribuicoes] == ["municipio"]
        rotulos = {ponto.rotulo for distribuicao in resultado.distribuicoes for ponto in distribuicao.pontos}
        assert rotulos == {"GARANHUNS", "RECIFE"}
        assert resultado.registros == []


class TestPorSituacao:
    def test_contem_indicadores_e_só_a_dimensao_situacao_sem_tabela(self):
        resultado = compor_relatorio(_REGISTROS, "por_situacao")

        assert [distribuicao.dimensao for distribuicao in resultado.distribuicoes] == ["situacao"]
        rotulos = {ponto.rotulo for distribuicao in resultado.distribuicoes for ponto in distribuicao.pontos}
        assert rotulos == {"Em exercício", "Licença"}
        assert resultado.registros == []


class TestVisaoExecutiva:
    """Sprint 21.9 (Modo Executivo — PDF executivo) — tipo novo, dedicado,
    que nunca reaproveita nem altera a composição já homologada de
    "executivo" (Sprint 19.7.1) nem de "detalhado" (usado pelo Dashboard
    operacional)."""

    def test_contem_as_8_dimensoes_da_grade_executiva_sem_a_dimensao_servidor_e_sem_tabela(self):
        resultado = compor_relatorio(_REGISTROS, "visao_executiva")

        dimensoes = {distribuicao.dimensao for distribuicao in resultado.distribuicoes}
        assert dimensoes == {
            "periodo",
            "categoria_funcional",
            "municipio",
            "motivo",
            "situacao",
            "origem_destino",
            "transporte",
            "doc_origem",
        }
        assert "servidor" not in dimensoes
        assert resultado.registros == []

    def test_nunca_altera_a_composicao_ja_homologada_de_executivo_nem_de_detalhado(self):
        # Confirma que os 2 tipos vizinhos continuam exatamente como já
        # homologado — a Sprint 21.9 é 100% aditiva.
        executivo = compor_relatorio(_REGISTROS, "executivo")
        assert [d.dimensao for d in executivo.distribuicoes] == ["periodo"]

        detalhado = compor_relatorio(_REGISTROS, "detalhado")
        assert {d.dimensao for d in detalhado.distribuicoes} == {
            "periodo", "servidor", "municipio", "motivo", "situacao", "origem_destino",
        }
        assert detalhado.registros == _REGISTROS
