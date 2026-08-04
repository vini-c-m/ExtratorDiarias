from datetime import date, timedelta

from app.domain.analitica.diagnostico import classificar, diagnosticar_recorte, diagnosticar_registro
from app.domain.entities.registro_analitico import RegistroAnalitico
from app.domain.entities.servidor import Servidor

_SERVIDOR_COMPLETO = Servidor(
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
    cidade_origem="RECIFE",
    cidade_destino="GARANHUNS",
    motivo="Reunião",
    valor=200.0,
    servidor=_SERVIDOR_COMPLETO,
    dh="12345",
):
    # `periodo_final` relativo a `periodo_inicial` por padrão (nunca um
    # valor fixo independente) — evita que testes que só variam
    # `periodo_inicial` (ex.: PASSAR DIA) acabem sem querer também
    # disparando "Período inválido".
    if periodo_final is None:
        periodo_final = periodo_inicial + timedelta(days=2)
    return RegistroAnalitico(
        sei=sei,
        doc_origem="processo.pdf",
        cpf=cpf,
        periodo_inicial=periodo_inicial,
        periodo_final=periodo_final,
        cidade_origem=cidade_origem,
        cidade_destino=cidade_destino,
        motivo=motivo,
        transporte="CARRO",
        valor_total_diarias=valor,
        linha_planilha=2,
        servidor=servidor,
        dh=dh,
    )


def _titulos(casos):
    return {caso.titulo for caso in casos}


class TestPeriodoInvalido:
    def test_periodo_valido_nao_gera_caso(self):
        registro = _registro(periodo_inicial=date(2026, 8, 1), periodo_final=date(2026, 8, 3))
        assert "Período inválido" not in _titulos(diagnosticar_registro(registro, _HOJE))

    def test_periodo_invalido_gera_inconsistencia(self):
        registro = _registro(periodo_inicial=date(2026, 8, 10), periodo_final=date(2026, 8, 1))
        casos = diagnosticar_registro(registro, _HOJE)
        caso = next(c for c in casos if c.titulo == "Período inválido")
        assert caso.classificacao == "inconsistencia"
        assert caso.campo == "periodo_final"


class TestServidorSemCadastro:
    def test_com_cadastro_nao_gera_caso(self):
        registro = _registro(servidor=_SERVIDOR_COMPLETO)
        assert "Servidor sem cadastro" not in _titulos(diagnosticar_registro(registro, _HOJE))

    def test_sem_cadastro_gera_esperado(self):
        registro = _registro(servidor=None)
        casos = diagnosticar_registro(registro, _HOJE)
        caso = next(c for c in casos if c.titulo == "Servidor sem cadastro")
        assert caso.classificacao == "esperado"
        assert caso.campo == "cpf"


class TestValorAusente:
    def test_valor_presente_nao_gera_caso(self):
        registro = _registro(valor=200.0)
        assert "Valor das diárias ausente" not in _titulos(diagnosticar_registro(registro, _HOJE))

    def test_valor_ausente_gera_atencao(self):
        registro = _registro(valor=None)
        casos = diagnosticar_registro(registro, _HOJE)
        caso = next(c for c in casos if c.titulo == "Valor das diárias ausente")
        assert caso.classificacao == "atencao"
        assert caso.campo == "valor_total_diarias"


class TestMatriculaESituacaoAusentes:
    def test_matricula_ausente_com_cadastro_gera_atencao(self):
        servidor = Servidor(cpf="11111111111", nome="Maria Souza", cargo="Analista", previdencia="RPPS", matricula=None, situacao="Em exercício")
        registro = _registro(servidor=servidor)
        casos = diagnosticar_registro(registro, _HOJE)
        caso = next(c for c in casos if c.titulo == "Matrícula ausente")
        assert caso.classificacao == "atencao"

    def test_situacao_ausente_com_cadastro_gera_atencao(self):
        servidor = Servidor(cpf="11111111111", nome="Maria Souza", cargo="Analista", previdencia="RPPS", matricula="1001", situacao=None)
        registro = _registro(servidor=servidor)
        casos = diagnosticar_registro(registro, _HOJE)
        caso = next(c for c in casos if c.titulo == "Situação do servidor ausente")
        assert caso.classificacao == "atencao"

    def test_sem_cadastro_nao_duplica_caso_de_matricula_ou_situacao(self):
        """Servidor `None` já é o caso 'Servidor sem cadastro' — nunca
        também dispara 'Matrícula ausente'/'Situação ausente' (que exigem
        cadastro existente, § 8.2)."""
        registro = _registro(servidor=None)
        titulos = _titulos(diagnosticar_registro(registro, _HOJE))
        assert "Matrícula ausente" not in titulos
        assert "Situação do servidor ausente" not in titulos


class TestTrecho:
    def test_origem_e_destino_presentes_nao_gera_caso(self):
        registro = _registro(cidade_origem="RECIFE", cidade_destino="GARANHUNS")
        titulos = _titulos(diagnosticar_registro(registro, _HOJE))
        assert "Origem e destino ausentes" not in titulos
        assert "Trecho incompleto" not in titulos

    def test_origem_e_destino_ausentes_gera_caso_unico(self):
        registro = _registro(cidade_origem=None, cidade_destino=None)
        casos = diagnosticar_registro(registro, _HOJE)
        relevantes = [c for c in casos if c.titulo in ("Origem e destino ausentes", "Trecho incompleto")]
        assert len(relevantes) == 1
        assert relevantes[0].titulo == "Origem e destino ausentes"
        assert relevantes[0].classificacao == "atencao"

    def test_so_origem_ausente_gera_trecho_incompleto(self):
        registro = _registro(cidade_origem=None, cidade_destino="GARANHUNS")
        casos = diagnosticar_registro(registro, _HOJE)
        caso = next(c for c in casos if c.titulo == "Trecho incompleto")
        assert caso.campo == "origem"

    def test_so_destino_ausente_gera_trecho_incompleto(self):
        registro = _registro(cidade_origem="RECIFE", cidade_destino=None)
        casos = diagnosticar_registro(registro, _HOJE)
        caso = next(c for c in casos if c.titulo == "Trecho incompleto")
        assert caso.campo == "destino"


class TestDhVazio:
    def test_dh_preenchido_nao_gera_caso(self):
        registro = _registro(dh="12345")
        assert "Documento Hábil (DH) ainda não emitido" not in _titulos(diagnosticar_registro(registro, _HOJE))

    def test_dh_vazio_gera_sempre_atencao(self):
        """Sem limiar de 'processo antigo' definido (§ 9, pergunta 3/6),
        a classificação é sempre 'atenção' — nunca 'esperado' nem
        'inconsistência'."""
        registro = _registro(dh=None)
        casos = diagnosticar_registro(registro, _HOJE)
        caso = next(c for c in casos if c.titulo == "Documento Hábil (DH) ainda não emitido")
        assert caso.classificacao == "atencao"
        assert caso.campo == "dh"


class TestPassarDia:
    def test_dentro_da_janela_gera_esperado(self):
        # período inicial em 16 dias a partir de hoje -> data de liberação
        # é amanhã (hoje + 1), ainda dentro da janela (RN-10: só libera
        # quando hoje >= data de liberação).
        registro = _registro(periodo_inicial=_HOJE + timedelta(days=16))
        casos = diagnosticar_registro(registro, _HOJE)
        caso = next(c for c in casos if c.titulo == "Aguardando liberação")
        assert caso.classificacao == "esperado"
        assert caso.campo is None

    def test_no_limite_exato_de_liberacao_nao_gera_caso(self):
        # RN-10: limite inclusivo — hoje == data de liberação já é liberado.
        registro = _registro(periodo_inicial=_HOJE + timedelta(days=15))
        casos = diagnosticar_registro(registro, _HOJE + timedelta(days=15))
        assert "Aguardando liberação" not in _titulos(casos)

    def test_apos_liberado_nao_gera_caso(self):
        registro = _registro(periodo_inicial=date(2026, 1, 1))
        assert "Aguardando liberação" not in _titulos(diagnosticar_registro(registro, _HOJE))


class TestDhEPassarDiaNuncaCompartilhamTexto:
    """Critério de aceite explícito da 19.8.1 — a única checagem
    considerada a mais arriscada de todo o plano técnico."""

    def test_dh_e_passar_dia_nunca_compartilham_texto(self):
        registro_dh_vazio = _registro(dh=None, periodo_inicial=date(2026, 1, 1))
        registro_passar_dia = _registro(dh="12345", periodo_inicial=_HOJE + timedelta(days=16))

        caso_dh = next(c for c in diagnosticar_registro(registro_dh_vazio, _HOJE) if c.titulo == "Documento Hábil (DH) ainda não emitido")
        caso_passar_dia = next(c for c in diagnosticar_registro(registro_passar_dia, _HOJE) if c.titulo == "Aguardando liberação")

        assert caso_dh.titulo != caso_passar_dia.titulo
        assert caso_dh.motivo != caso_passar_dia.motivo
        assert caso_dh.campo != caso_passar_dia.campo

        # Nenhum vocabulário de uma regra aparece na explicação da outra —
        # a fusão das duas é exatamente o risco que este teste existe para
        # capturar, não só nomes de campo distintos.
        assert "PASSAR DIA" not in caso_dh.titulo
        assert "PASSAR DIA" not in caso_dh.motivo
        assert "15 dias" not in caso_dh.motivo
        assert "RN-06" not in caso_dh.motivo
        assert "Documento Hábil" not in caso_passar_dia.titulo
        assert "Documento Hábil" not in caso_passar_dia.motivo
        assert "liquidação" not in caso_passar_dia.motivo
        assert "DH" not in caso_passar_dia.motivo

    def test_um_registro_pode_disparar_os_dois_casos_ao_mesmo_tempo_sem_se_confundirem(self):
        """Um processo pode legitimamente estar sem DH E ainda na janela
        de PASSAR DIA ao mesmo tempo — os dois casos coexistem na mesma
        lista, cada um com seu próprio texto, nunca fundidos num só."""
        registro = _registro(dh=None, periodo_inicial=_HOJE + timedelta(days=16))
        casos = diagnosticar_registro(registro, _HOJE)
        titulos = _titulos(casos)
        assert "Documento Hábil (DH) ainda não emitido" in titulos
        assert "Aguardando liberação" in titulos
        assert len([c for c in casos if c.titulo in titulos]) == len(casos)


class TestDuplicidade:
    def test_mesmo_cpf_e_periodo_gera_caso_para_ambos(self):
        registro_a = _registro(sei="SEI-A", cpf="11111111111", periodo_inicial=date(2026, 6, 1), periodo_final=date(2026, 6, 3))
        registro_b = _registro(sei="SEI-B", cpf="11111111111", periodo_inicial=date(2026, 6, 1), periodo_final=date(2026, 6, 3))

        resultado = diagnosticar_recorte([registro_a, registro_b], _HOJE)

        assert "Possível duplicidade" in {c.titulo for c in resultado["SEI-A"]}
        assert "Possível duplicidade" in {c.titulo for c in resultado["SEI-B"]}
        caso_a = next(c for c in resultado["SEI-A"] if c.titulo == "Possível duplicidade")
        assert caso_a.classificacao == "atencao"
        assert "SEI-B" in caso_a.motivo

    def test_cpf_diferente_nao_gera_duplicidade(self):
        registro_a = _registro(sei="SEI-A", cpf="11111111111", periodo_inicial=date(2026, 6, 1), periodo_final=date(2026, 6, 3))
        registro_b = _registro(sei="SEI-B", cpf="22222222222", periodo_inicial=date(2026, 6, 1), periodo_final=date(2026, 6, 3))

        resultado = diagnosticar_recorte([registro_a, registro_b], _HOJE)

        assert "Possível duplicidade" not in {c.titulo for c in resultado["SEI-A"]}
        assert "Possível duplicidade" not in {c.titulo for c in resultado["SEI-B"]}

    def test_periodo_diferente_nao_gera_duplicidade(self):
        registro_a = _registro(sei="SEI-A", cpf="11111111111", periodo_inicial=date(2026, 6, 1), periodo_final=date(2026, 6, 3))
        registro_b = _registro(sei="SEI-B", cpf="11111111111", periodo_inicial=date(2026, 7, 1), periodo_final=date(2026, 7, 3))

        resultado = diagnosticar_recorte([registro_a, registro_b], _HOJE)

        assert "Possível duplicidade" not in {c.titulo for c in resultado["SEI-A"]}

    def test_grupo_de_3_gera_caso_para_todos_os_3(self):
        registros = [
            _registro(sei=f"SEI-{i}", cpf="11111111111", periodo_inicial=date(2026, 6, 1), periodo_final=date(2026, 6, 3))
            for i in range(3)
        ]
        resultado = diagnosticar_recorte(registros, _HOJE)
        for i in range(3):
            assert "Possível duplicidade" in {c.titulo for c in resultado[f"SEI-{i}"]}


class TestClassificar:
    def test_lista_vazia_e_esperado(self):
        assert classificar([]) == "esperado"

    def test_um_unico_esperado_permanece_esperado(self):
        registro = _registro(servidor=None)
        casos = [c for c in diagnosticar_registro(registro, _HOJE) if c.titulo == "Servidor sem cadastro"]
        assert classificar(casos) == "esperado"

    def test_atencao_vence_esperado(self):
        registro_esperado = _registro(servidor=None)
        registro_atencao = _registro(valor=None)
        casos = diagnosticar_registro(registro_esperado, _HOJE) + diagnosticar_registro(registro_atencao, _HOJE)
        assert classificar(casos) == "atencao"

    def test_inconsistencia_vence_atencao_e_esperado(self):
        registro = _registro(valor=None, periodo_inicial=date(2026, 8, 10), periodo_final=date(2026, 8, 1))
        casos = diagnosticar_registro(registro, _HOJE)
        assert classificar(casos) == "inconsistencia"


class TestDiagnosticarRecorte:
    def test_recorte_vazio_devolve_dict_vazio(self):
        assert diagnosticar_recorte([], _HOJE) == {}

    def test_registro_sem_nenhum_caso_aplicavel_devolve_lista_vazia(self):
        """Nenhum campo vazio, dh preenchido, período válido, fora da
        janela de PASSAR DIA — o registro "perfeito" devolve `[]`, nunca
        `None` nem uma lista com um caso "esperado" genérico inventado."""
        registro = _registro(periodo_inicial=date(2026, 1, 1), periodo_final=date(2026, 1, 3))
        resultado = diagnosticar_recorte([registro], _HOJE)
        assert resultado[registro.sei] == []
        assert classificar(resultado[registro.sei]) == "esperado"

    def test_diagnosticar_registro_isoladamente_bate_com_diagnosticar_recorte_para_o_mesmo_registro(self):
        """`diagnosticar_recorte` de um recorte só adiciona duplicidade em
        cima do que `diagnosticar_registro` já devolve — nenhum recálculo
        divergente entre os dois."""
        registro = _registro(servidor=None)
        isolado = diagnosticar_registro(registro, _HOJE)
        do_recorte = diagnosticar_recorte([registro], _HOJE)[registro.sei]
        assert isolado == do_recorte
