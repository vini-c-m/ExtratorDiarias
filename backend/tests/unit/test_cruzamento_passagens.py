"""Sprint 2 (plano "Valor da Passagem no XLSX Oficial + Não Publicadas") —
testes do cruzamento exato por OB entre Base OB e Planilha de Passagens.
Dados 100% sintéticos — o leitor da Sprint 1 já foi validado contra o arquivo
real (ver `test_repositorio_planilha_passagens.py`); aqui o foco é a lógica
de cruzamento em si (correspondência exata, ausência de fallback, Transporte
sempre da Base OB, multiplicidade física preservada)."""

from datetime import date, datetime

from app.domain.entities.linha_passagem import EstadoPassagem, LinhaPassagem
from app.domain.entities.ordem_bancaria import OrdemBancaria
from app.domain.relatorio_transparencia.cruzamento_passagens import (
    ROTULO_SEM_CORRESPONDENCIA,
    anexar_passagens_ao_resultado,
    cobertura_unica_por_ob,
    contagem_por_estado,
    contagem_por_transporte_e_estado,
    cruzar_passagens_por_ob,
)
from app.domain.relatorio_transparencia.motor_decisao import (
    CandidatoNormal,
    DiagnosticoRepeticaoFisica,
    OcorrenciaFinanceira,
    ResultadoRelatorio,
    RevisaoNecessaria,
)


def _ordem(*, ob="2026OB000001", transporte="CARRO", linha=2, dh="2026DH000001", nome="FULANO DE TAL"):
    return OrdemBancaria(
        linha=linha,
        dh=dh,
        ob=ob,
        credor=nome,
        situacao="Paga",
        data_pagamento=datetime(2026, 5, 15, 9, 0, 0),
        sei="19.20.0001.0000001/2026-01",
        cpf="11111111111",
        nome=nome,
        cargo="Cargo de Teste",
        periodo_inicial=date(2026, 5, 10),
        periodo_final=date(2026, 5, 10),
        cidade_origem=None,
        cidade_destino=None,
        transporte=transporte,
        motivo="Motivo de teste",
        valor=154.09,
        valor_bruto_sem_formula=154.09,
        restituicao=None,
        duplicidade="Único",
        item_de_gasto="33901401",
        trecho="RECIFE-GARANHUNS",
    )


def _linha_passagem(*, ob, estado, valor=None, transporte="AVIÃO", bruto=None, linha=10):
    return LinhaPassagem(linha=linha, ob=ob, transporte=transporte, estado=estado, valor=valor, bruto=bruto)


def _passagens(*linhas: LinhaPassagem) -> dict[str, LinhaPassagem]:
    return {linha.ob: linha for linha in linhas}


# --- Cruzamento exato por OB, todos os 5 estados ---


def test_cruza_todos_os_estados_a_e():
    ordens = [
        _ordem(ob="2026OB000001", transporte="AVIÃO"),  # A
        _ordem(ob="2026OB000002", transporte="CARRO"),  # B
        _ordem(ob="2026OB000003", transporte="AVIÃO"),  # C
        _ordem(ob="2026OB000004", transporte="CARRO"),  # D
        _ordem(ob="2026OB000005", transporte="AVIÃO"),  # E — sem linha na Planilha de Passagens
    ]
    passagens = _passagens(
        _linha_passagem(ob="2026OB000001", estado=EstadoPassagem.NUMERICO, valor=1657.76),
        _linha_passagem(ob="2026OB000002", estado=EstadoPassagem.AUSENTE, bruto="-"),
        _linha_passagem(ob="2026OB000003", estado=EstadoPassagem.NAO_SE_APLICA, bruto="NÃO SE APLICA"),
        _linha_passagem(ob="2026OB000004", estado=EstadoPassagem.INVALIDO, bruto="#VALOR!"),
    )

    resultado = cruzar_passagens_por_ob(ordens, passagens)

    rotulos = {c.ob: c.rotulo_estado for c in resultado.cruzamentos}
    assert rotulos["2026OB000001"] == "numerico"
    assert rotulos["2026OB000002"] == "ausente"
    assert rotulos["2026OB000003"] == "nao_se_aplica"
    assert rotulos["2026OB000004"] == "invalido"
    assert rotulos["2026OB000005"] == ROTULO_SEM_CORRESPONDENCIA

    cruzamento_e = next(c for c in resultado.cruzamentos if c.ob == "2026OB000005")
    assert cruzamento_e.linha_passagem is None


def test_estado_e_nunca_inventa_valor():
    ordens = [_ordem(ob="2026OB999999")]
    passagens = _passagens()  # planilha vazia — nenhuma OB encontrada

    resultado = cruzar_passagens_por_ob(ordens, passagens)

    cruzamento = resultado.cruzamentos[0]
    assert cruzamento.linha_passagem is None
    assert cruzamento.rotulo_estado == ROTULO_SEM_CORRESPONDENCIA


# --- Sem fallback por Nome/CPF/SEI/DH/Trecho ---


def test_nenhum_fallback_por_nome_cpf_dh_ou_trecho():
    """Duas ocorrências com Nome, CPF, DH e Trecho IDÊNTICOS mas OB
    DIFERENTE nunca se cruzam entre si — só a OB decide."""
    ordem_a = _ordem(ob="2026OB000001", dh="2026DH000001", nome="FULANO DE TAL")
    ordem_b = _ordem(ob="2026OB000002", dh="2026DH000001", nome="FULANO DE TAL")
    passagens = _passagens(_linha_passagem(ob="2026OB000001", estado=EstadoPassagem.NUMERICO, valor=100.0))

    resultado = cruzar_passagens_por_ob([ordem_a, ordem_b], passagens)

    rotulos = {c.ob: c.rotulo_estado for c in resultado.cruzamentos}
    assert rotulos["2026OB000001"] == "numerico"
    assert rotulos["2026OB000002"] == ROTULO_SEM_CORRESPONDENCIA


# --- Transporte sempre da Base OB, nunca da Planilha de Passagens ---


def test_transporte_sempre_vem_da_base_ob():
    ordem = _ordem(ob="2026OB000001", transporte="CARRO")
    # Planilha de Passagens diverge no Transporte (achado hipotético de
    # inconsistência de fonte) — o cruzamento nunca deve adotar esse valor.
    passagens = _passagens(
        _linha_passagem(ob="2026OB000001", estado=EstadoPassagem.NUMERICO, valor=100.0, transporte="AVIÃO")
    )

    resultado = cruzar_passagens_por_ob([ordem], passagens)

    assert resultado.cruzamentos[0].transporte == "CARRO"


def test_transporte_ausente_na_base_ob_fica_none():
    ordem = _ordem(ob="2026OB000001", transporte=None)
    passagens = _passagens()

    resultado = cruzar_passagens_por_ob([ordem], passagens)

    assert resultado.cruzamentos[0].transporte is None


# --- Multiplicidade física preservada (nunca deduplicar) ---


def test_ob_fisicamente_repetida_na_base_ob_gera_dois_cruzamentos():
    ordem_1 = _ordem(ob="2026OB000001", linha=10)
    ordem_2 = _ordem(ob="2026OB000001", linha=11)
    passagens = _passagens(_linha_passagem(ob="2026OB000001", estado=EstadoPassagem.NUMERICO, valor=100.0))

    resultado = cruzar_passagens_por_ob([ordem_1, ordem_2], passagens)

    assert len(resultado.cruzamentos) == 2
    assert all(c.ob == "2026OB000001" and c.rotulo_estado == "numerico" for c in resultado.cruzamentos)


# --- Diagnóstico agregado ---


def test_contagem_por_estado():
    ordens = [
        _ordem(ob="2026OB000001"),
        _ordem(ob="2026OB000002"),
        _ordem(ob="2026OB000003"),
    ]
    passagens = _passagens(
        _linha_passagem(ob="2026OB000001", estado=EstadoPassagem.NUMERICO, valor=100.0),
        _linha_passagem(ob="2026OB000002", estado=EstadoPassagem.NUMERICO, valor=200.0),
    )

    resultado = cruzar_passagens_por_ob(ordens, passagens)

    assert contagem_por_estado(resultado) == {"numerico": 2, ROTULO_SEM_CORRESPONDENCIA: 1}


def test_contagem_por_transporte_e_estado():
    ordens = [
        _ordem(ob="2026OB000001", transporte="AVIÃO"),
        _ordem(ob="2026OB000002", transporte="AVIÃO"),
        _ordem(ob="2026OB000003", transporte="CARRO"),
    ]
    passagens = _passagens(
        _linha_passagem(ob="2026OB000001", estado=EstadoPassagem.NUMERICO, valor=100.0),
        _linha_passagem(ob="2026OB000002", estado=EstadoPassagem.NAO_SE_APLICA, bruto="NÃO SE APLICA"),
    )

    resultado = cruzar_passagens_por_ob(ordens, passagens)
    tabela = contagem_por_transporte_e_estado(resultado)

    assert tabela[("AVIÃO", "numerico")] == 1
    assert tabela[("AVIÃO", "nao_se_aplica")] == 1
    assert tabela[("CARRO", ROTULO_SEM_CORRESPONDENCIA)] == 1


# --- Sprint 3 (HOMO-RT-06) — anexar_passagens_ao_resultado -----------------


def _ordem_para_motor(*, ob="2026OB000001", linha=2, dh="2026DH000001"):
    from datetime import date, datetime

    return OrdemBancaria(
        linha=linha,
        dh=dh,
        ob=ob,
        credor="FULANO DE TAL",
        situacao="Paga",
        data_pagamento=datetime(2026, 5, 15, 9, 0, 0),
        sei="19.20.0001.0000001/2026-01",
        cpf="11111111111",
        nome="FULANO DE TAL",
        cargo="Cargo de Teste",
        periodo_inicial=date(2026, 5, 10),
        periodo_final=date(2026, 5, 10),
        cidade_origem=None,
        cidade_destino=None,
        transporte="CARRO",
        motivo="Motivo de teste",
        valor=154.09,
        valor_bruto_sem_formula=154.09,
        restituicao=None,
        duplicidade="Único",
        item_de_gasto="33901401",
        trecho="RECIFE-GARANHUNS",
    )


def test_anexar_passagens_preenche_candidatos_normais():
    ocorrencia = OcorrenciaFinanceira(dh="2026DH000001", ordem_bancaria=_ordem_para_motor(ob="2026OB000001"))
    resultado = ResultadoRelatorio(candidatos_normais=[CandidatoNormal(ocorrencia=ocorrencia)])
    passagens_por_ob = _passagens(_linha_passagem(ob="2026OB000001", estado=EstadoPassagem.NUMERICO, valor=100.0))

    enriquecido = anexar_passagens_ao_resultado(resultado, passagens_por_ob)

    assert enriquecido.candidatos_normais[0].ocorrencia.passagem is not None
    assert enriquecido.candidatos_normais[0].ocorrencia.passagem.valor == 100.0


def test_anexar_passagens_preenche_ocorrencias_de_revisoes():
    ocorrencia = OcorrenciaFinanceira(dh="2026DH000001", ordem_bancaria=_ordem_para_motor(ob="2026OB000002"))
    revisao = RevisaoNecessaria(regra="RN04", motivo="teste", ocorrencias=[ocorrencia])
    resultado = ResultadoRelatorio(revisoes_necessarias=[revisao])
    passagens_por_ob = _passagens(
        _linha_passagem(ob="2026OB000002", estado=EstadoPassagem.NAO_SE_APLICA, bruto="NÃO SE APLICA")
    )

    enriquecido = anexar_passagens_ao_resultado(resultado, passagens_por_ob)

    ocorrencia_enriquecida = enriquecido.revisoes_necessarias[0].ocorrencias[0]
    assert ocorrencia_enriquecida.passagem.estado == EstadoPassagem.NAO_SE_APLICA
    # nunca reclassifica: regra/motivo/estrutura da revisão preservados
    assert enriquecido.revisoes_necessarias[0].regra == "RN04"
    assert enriquecido.revisoes_necessarias[0].motivo == "teste"


def test_anexar_passagens_preenche_diagnosticos_repeticao_fisica():
    ocorrencia = OcorrenciaFinanceira(dh="2026DH000001", ordem_bancaria=_ordem_para_motor(ob="2026OB000003"))
    diagnostico = DiagnosticoRepeticaoFisica(ob="2026OB000003", ocorrencias=[ocorrencia])
    resultado = ResultadoRelatorio(diagnosticos_repeticao_fisica=[diagnostico])
    passagens_por_ob = _passagens(_linha_passagem(ob="2026OB000003", estado=EstadoPassagem.AUSENTE, bruto="-"))

    enriquecido = anexar_passagens_ao_resultado(resultado, passagens_por_ob)

    assert enriquecido.diagnosticos_repeticao_fisica[0].ocorrencias[0].passagem.estado == EstadoPassagem.AUSENTE


def test_anexar_passagens_estado_e_quando_ob_sem_correspondencia():
    ocorrencia = OcorrenciaFinanceira(dh="2026DH000001", ordem_bancaria=_ordem_para_motor(ob="2026OB999999"))
    resultado = ResultadoRelatorio(candidatos_normais=[CandidatoNormal(ocorrencia=ocorrencia)])

    enriquecido = anexar_passagens_ao_resultado(resultado, {})

    assert enriquecido.candidatos_normais[0].ocorrencia.passagem is None


def test_anexar_passagens_nunca_reclassifica_preserva_contagens():
    """Não adiciona, remove nem move ocorrência entre candidatos/revisões/
    diagnósticos — só enriquece o dado que já existe em cada uma."""
    candidato = CandidatoNormal(
        ocorrencia=OcorrenciaFinanceira(dh="2026DH000001", ordem_bancaria=_ordem_para_motor(ob="2026OB000001"))
    )
    revisao = RevisaoNecessaria(
        regra="RN07",
        motivo="teste",
        ocorrencias=[
            OcorrenciaFinanceira(dh="2026DH000002", ordem_bancaria=_ordem_para_motor(ob="2026OB000002", dh="2026DH000002"))
        ],
    )
    resultado = ResultadoRelatorio(candidatos_normais=[candidato], revisoes_necessarias=[revisao])

    enriquecido = anexar_passagens_ao_resultado(resultado, {})

    assert len(enriquecido.candidatos_normais) == 1
    assert len(enriquecido.revisoes_necessarias) == 1
    assert len(enriquecido.revisoes_necessarias[0].ocorrencias) == 1


def test_cobertura_unica_por_ob_nao_conta_repeticao_fisica_duas_vezes():
    ordens = [
        _ordem(ob="2026OB000001", linha=10),
        _ordem(ob="2026OB000001", linha=11),  # mesma OB, física repetida
        _ordem(ob="2026OB000002", linha=12),  # sem correspondência
    ]
    passagens = _passagens(_linha_passagem(ob="2026OB000001", estado=EstadoPassagem.NUMERICO, valor=100.0))

    resultado = cruzar_passagens_por_ob(ordens, passagens)
    cobertas, sem_correspondencia = cobertura_unica_por_ob(resultado)

    assert cobertas == 1  # só 1 OB única coberta, mesmo aparecendo 2x fisicamente
    assert sem_correspondencia == 1
