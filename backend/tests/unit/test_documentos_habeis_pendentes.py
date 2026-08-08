from datetime import date, timedelta

from app.domain.analitica.documentos_habeis_pendentes import (
    _texto_contagem,
    listar_documentos_habeis_pendentes,
)
from app.domain.entities.registro_analitico import RegistroAnalitico
from app.domain.entities.servidor import Servidor

_SERVIDOR = Servidor(
    cpf="11111111111", nome="Maria Souza", cargo="Analista", previdencia="RPPS",
    matricula="1001", situacao="Em exercício",
)
_HOJE = date(2026, 8, 4)


def _registro(
    *,
    sei="19.20.0001.0000001/2026-01",
    cpf="11111111111",
    periodo_inicial=date(2026, 8, 1),
    periodo_final=None,
    cidade_destino="GARANHUNS",
    servidor=_SERVIDOR,
    dh=None,
):
    if periodo_final is None:
        periodo_final = periodo_inicial + timedelta(days=2)
    return RegistroAnalitico(
        sei=sei,
        doc_origem="processo.pdf",
        cpf=cpf,
        periodo_inicial=periodo_inicial,
        periodo_final=periodo_final,
        cidade_origem="RECIFE",
        cidade_destino=cidade_destino,
        motivo="Reunião",
        transporte="CARRO",
        valor_total_diarias=200.0,
        linha_planilha=2,
        servidor=servidor,
        dh=dh,
    )


class TestSoDhVazio:
    def test_dh_preenchido_nunca_aparece_na_lista(self):
        registro = _registro(dh="12345", periodo_inicial=_HOJE)
        assert listar_documentos_habeis_pendentes([registro], _HOJE) == []

    def test_dh_vazio_aparece_na_lista(self):
        registro = _registro(dh=None, periodo_inicial=_HOJE)
        pendentes = listar_documentos_habeis_pendentes([registro], _HOJE)
        assert len(pendentes) == 1
        assert pendentes[0].sei == registro.sei

    def test_recorte_com_mistura_devolve_so_os_vazios(self):
        com_dh = _registro(sei="SEI-1", dh="DH-1", periodo_inicial=_HOJE)
        sem_dh = _registro(sei="SEI-2", dh=None, periodo_inicial=_HOJE)
        pendentes = listar_documentos_habeis_pendentes([com_dh, sem_dh], _HOJE)
        assert [p.sei for p in pendentes] == ["SEI-2"]

    def test_recorte_vazio_devolve_lista_vazia(self):
        assert listar_documentos_habeis_pendentes([], _HOJE) == []


class TestAguardandoLiberacao:
    def test_dentro_da_janela_classifica_aguardando_liberacao(self):
        # RN-06: data_liberacao = periodo_inicial - 15 dias. hoje ainda
        # antes dessa data -> aguardando.
        registro = _registro(periodo_inicial=_HOJE + timedelta(days=20), dh=None)
        pendente = listar_documentos_habeis_pendentes([registro], _HOJE)[0]
        assert pendente.situacao == "aguardando_liberacao"
        assert pendente.dias_atraso is None
        assert pendente.mensagem == (
            "Documento Hábil ainda não disponível. Aguardar a data de liberação."
        )

    def test_liberacao_amanha(self):
        # data_liberacao = hoje + 1 <=> periodo_inicial = hoje + 1 + 15
        registro = _registro(periodo_inicial=_HOJE + timedelta(days=16), dh=None)
        pendente = listar_documentos_habeis_pendentes([registro], _HOJE)[0]
        assert pendente.dias_restantes == 1
        assert pendente.texto_contagem == "Liberação prevista para amanhã."

    def test_liberacao_em_varios_dias(self):
        registro = _registro(periodo_inicial=_HOJE + timedelta(days=19), dh=None)
        pendente = listar_documentos_habeis_pendentes([registro], _HOJE)[0]
        data_liberacao = pendente.data_liberacao_prevista
        assert pendente.dias_restantes == 4
        assert pendente.texto_contagem == (
            f"Liberação prevista para {data_liberacao.strftime('%d/%m/%Y')} — faltam 4 dias."
        )

    def test_liberacao_futura_distante_calcula_dias_corretamente(self):
        registro = _registro(periodo_inicial=_HOJE + timedelta(days=45), dh=None)
        pendente = listar_documentos_habeis_pendentes([registro], _HOJE)[0]
        assert pendente.dias_restantes == 30

    def test_virada_de_mes(self):
        # hoje = 2026-08-30; data_liberacao = 2026-09-02 (3 dias depois).
        hoje = date(2026, 8, 30)
        registro = _registro(periodo_inicial=date(2026, 9, 17), dh=None)
        pendente = listar_documentos_habeis_pendentes([registro], hoje)[0]
        assert pendente.data_liberacao_prevista == date(2026, 9, 2)
        assert pendente.dias_restantes == 3

    def test_virada_de_ano(self):
        # hoje = 2026-12-29; data_liberacao = 2027-01-02 (4 dias depois).
        hoje = date(2026, 12, 29)
        registro = _registro(periodo_inicial=date(2027, 1, 17), dh=None)
        pendente = listar_documentos_habeis_pendentes([registro], hoje)[0]
        assert pendente.data_liberacao_prevista == date(2027, 1, 2)
        assert pendente.dias_restantes == 4


class TestRevisaoManualNecessaria:
    def test_limite_exato_da_janela_ja_e_revisao_manual_nunca_aguardando(self):
        """RN-10 — limite inclusivo: no próprio dia da liberação o
        registro já deixou de ser 'aguardando', mesmo critério já
        homologado em `diagnostico._caso_dh_vazio`."""
        registro = _registro(periodo_inicial=_HOJE + timedelta(days=15), dh=None)
        pendente = listar_documentos_habeis_pendentes([registro], _HOJE)[0]
        assert pendente.situacao == "revisao_manual_necessaria"
        assert pendente.dias_atraso == 0
        assert pendente.dias_restantes is None
        assert pendente.texto_contagem is None

    def test_data_ja_ultrapassada_calcula_atraso_corretamente(self):
        registro = _registro(periodo_inicial=_HOJE - timedelta(days=5), dh=None)
        pendente = listar_documentos_habeis_pendentes([registro], _HOJE)[0]
        # data_liberacao = periodo_inicial - 15 = hoje - 20
        assert pendente.situacao == "revisao_manual_necessaria"
        assert pendente.dias_atraso == 20
        assert pendente.mensagem == (
            "Documento Hábil pendente. A data de liberação já foi atingida. "
            "Recomenda-se análise manual."
        )

    def test_nunca_assume_causa_alem_da_data_atingida(self):
        """Mesma disciplina de `diagnostico._caso_dh_vazio`: a mensagem
        nunca inventa uma causa específica, só relata a evidência
        objetiva (data de liberação já atingida)."""
        registro = _registro(periodo_inicial=_HOJE - timedelta(days=100), dh=None)
        pendente = listar_documentos_habeis_pendentes([registro], _HOJE)[0]
        assert "não identificado" not in pendente.mensagem
        assert "análise manual" in pendente.mensagem


class TestOrdenacao:
    def test_revisao_manual_mais_antiga_primeiro(self):
        recente = _registro(sei="RECENTE", periodo_inicial=_HOJE - timedelta(days=15), dh=None)  # atraso 0
        antiga = _registro(sei="ANTIGA", periodo_inicial=_HOJE - timedelta(days=45), dh=None)  # atraso 30
        pendentes = listar_documentos_habeis_pendentes([recente, antiga], _HOJE)
        assert [p.sei for p in pendentes] == ["ANTIGA", "RECENTE"]

    def test_revisao_manual_sempre_antes_de_aguardando(self):
        aguardando = _registro(sei="AGUARDANDO", periodo_inicial=_HOJE + timedelta(days=16), dh=None)
        revisao = _registro(sei="REVISAO", periodo_inicial=_HOJE - timedelta(days=15), dh=None)
        pendentes = listar_documentos_habeis_pendentes([aguardando, revisao], _HOJE)
        assert [p.sei for p in pendentes] == ["REVISAO", "AGUARDANDO"]

    def test_aguardando_ordenado_por_menor_dias_restantes(self):
        longe = _registro(sei="LONGE", periodo_inicial=_HOJE + timedelta(days=45), dh=None)  # 30 dias
        perto = _registro(sei="PERTO", periodo_inicial=_HOJE + timedelta(days=16), dh=None)  # 1 dia
        pendentes = listar_documentos_habeis_pendentes([longe, perto], _HOJE)
        assert [p.sei for p in pendentes] == ["PERTO", "LONGE"]

    def test_empate_desempatado_por_sei(self):
        b = _registro(sei="B", periodo_inicial=_HOJE + timedelta(days=16), dh=None)
        a = _registro(sei="A", periodo_inicial=_HOJE + timedelta(days=16), dh=None)
        pendentes = listar_documentos_habeis_pendentes([b, a], _HOJE)
        assert [p.sei for p in pendentes] == ["A", "B"]


class TestTextoContagem:
    def test_zero_dias_defensivo(self):
        assert _texto_contagem(0, date(2026, 8, 4)) == "Liberação prevista para hoje."

    def test_negativo_defensivo(self):
        assert _texto_contagem(-3, date(2026, 8, 4)) == "Liberação prevista para hoje."

    def test_um_dia(self):
        assert _texto_contagem(1, date(2026, 8, 5)) == "Liberação prevista para amanhã."

    def test_varios_dias_inclui_data_formatada_br(self):
        assert _texto_contagem(4, date(2026, 8, 12)) == (
            "Liberação prevista para 12/08/2026 — faltam 4 dias."
        )


class TestServidorSemCadastro:
    def test_servidor_none_nao_quebra_nem_perde_registro(self):
        registro = _registro(servidor=None, periodo_inicial=_HOJE + timedelta(days=16), dh=None)
        pendente = listar_documentos_habeis_pendentes([registro], _HOJE)[0]
        assert pendente.servidor_nome is None
        assert pendente.sei == registro.sei
