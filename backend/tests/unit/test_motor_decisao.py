from datetime import date, datetime

from app.domain.entities.ordem_bancaria import OrdemBancaria
from app.domain.entities.registro_controle import ClassificacaoSei, RegistroControle
from app.domain.relatorio_transparencia.competencia import intervalo_acumulado
from app.domain.relatorio_transparencia.entidades import DocumentoHabil
from app.domain.relatorio_transparencia.motor_decisao import (
    CandidatoNormal,
    DiagnosticoRepeticaoFisica,
    RevisaoNecessaria,
    classificar,
)
from app.domain.relatorio_transparencia.motor_reconciliacao import ResultadoReconciliacao

_INTERVALO_PADRAO = intervalo_acumulado(2026, 5)


def _ordem(
    *,
    dh="2026DH000001",
    ob="2026OB000001",
    linha=2,
    cpf="11111111111",
    periodo_inicial=date(2026, 5, 10),
    periodo_final=date(2026, 5, 10),
    trecho="RECIFE-GARANHUNS",
    valor=154.09,
    data_pagamento=datetime(2026, 5, 15, 9, 0, 0),
    situacao="Paga",
    restituicao=None,
    duplicidade="Único",
    motivo="Motivo de teste",
):
    return OrdemBancaria(
        linha=linha,
        dh=dh,
        ob=ob,
        credor="FULANO DE TAL",
        situacao=situacao,
        data_pagamento=data_pagamento,
        sei="19.20.0001.0000001/2026-01",
        cpf=cpf,
        nome="FULANO DE TAL",
        cargo="Cargo de Teste",
        periodo_inicial=periodo_inicial,
        periodo_final=periodo_final,
        cidade_origem=None,
        cidade_destino=None,
        transporte="CARRO",
        motivo=motivo,
        valor=valor,
        valor_bruto_sem_formula=valor,
        restituicao=restituicao,
        duplicidade=duplicidade,
        item_de_gasto="33901401",
        trecho=trecho,
    )


def _registro_controle(*, dh="2026DH000001", sei="19.20.0001.0000001/2026-01", linha=2, motivo="Motivo de teste"):
    return RegistroControle(
        linha=linha,
        dh=dh,
        sei=sei,
        sei_classificacao=ClassificacaoSei.VALIDO,
        doc_origem="PJTESTE",
        cpf="11111111111",
        periodo_inicial=date(2026, 5, 10),
        periodo_final=date(2026, 5, 10),
        cidade_origem="RECIFE",
        cidade_destino="GARANHUNS",
        trecho="RECIFE-GARANHUNS",
        motivo=motivo,
        transporte="CARRO",
        valor_total_diarias=154.09,
    )


def _documento(dh, *, ordens=None, controle=None):
    return DocumentoHabil(dh=dh, controle=controle or [], ordens_bancarias=ordens or [])


def _resultado(*documentos):
    return ResultadoReconciliacao(documentos={d.dh: d for d in documentos})


# --- 1. OB normal -----------------------------------------------------


def test_ob_normal_vira_candidato_normal():
    resultado = _resultado(_documento("2026DH000001", ordens=[_ordem()], controle=[_registro_controle()]))

    saida = classificar(resultado, _INTERVALO_PADRAO)

    assert len(saida.candidatos_normais) == 1
    assert saida.revisoes_necessarias == []
    candidato = saida.candidatos_normais[0]
    assert candidato.ocorrencia.ordem_bancaria.ob == "2026OB000001"
    assert candidato.registros_controle[0].dh == "2026DH000001"


# --- 2. 1 DH com N OBs legítimas ----------------------------------------


def test_um_dh_com_multiplas_obs_legitimas_todas_preservadas():
    ordens = [
        _ordem(ob="2026OB000001", valor=801.25),
        _ordem(ob="2026OB000002", valor=0.60),
    ]
    resultado = _resultado(_documento("2026DH000001", ordens=ordens, controle=[_registro_controle()]))

    saida = classificar(resultado, _INTERVALO_PADRAO)

    assert len(saida.candidatos_normais) == 2
    assert {c.ocorrencia.ordem_bancaria.ob for c in saida.candidatos_normais} == {
        "2026OB000001",
        "2026OB000002",
    }


# --- 3. Marcador DUPLICIDADE isolado → normal ---------------------------


def test_duplicidade_isolada_nao_gera_revisao():
    ordem = _ordem(duplicidade="Duplicado")
    resultado = _resultado(_documento("2026DH000001", ordens=[ordem]))

    saida = classificar(resultado, _INTERVALO_PADRAO)

    assert len(saida.candidatos_normais) == 1
    assert saida.revisoes_necessarias == []


# --- 4. Registro do Controle com conteúdo descritivo isolado → normal ---


def test_conteudo_descritivo_do_controle_isolado_nao_influencia_classificacao():
    """RN03: nada do lado descritivo do Controle (motivo, avisos) é lido
    pelo motor de decisão para classificar — só a Base OB decide."""
    registro = _registro_controle(motivo="JÁ EXISTE DIÁRIA")
    resultado = _resultado(_documento("2026DH000001", ordens=[_ordem()], controle=[registro]))

    saida = classificar(resultado, _INTERVALO_PADRAO)

    assert len(saida.candidatos_normais) == 1
    assert saida.revisoes_necessarias == []


# --- 5. Restituição integral (valor Base OB = 0) → candidato normal, valor 0


def test_restituicao_integral_valor_zero_vira_candidato_normal_com_valor_zero():
    ordem = _ordem(valor=0, restituicao=154.09)
    resultado = _resultado(_documento("2026DH000001", ordens=[ordem]))

    saida = classificar(resultado, _INTERVALO_PADRAO)

    assert len(saida.candidatos_normais) == 1
    assert saida.candidatos_normais[0].ocorrencia.ordem_bancaria.valor == 0
    assert saida.revisoes_necessarias == []


# --- 6. Restituição ambígua/parcial → revisão RN02 -----------------------


def test_restituicao_parcial_ambigua_vira_revisao_rn02():
    ordem = _ordem(valor=154.09, restituicao=50.0)
    resultado = _resultado(_documento("2026DH000001", ordens=[ordem]))

    saida = classificar(resultado, _INTERVALO_PADRAO)

    assert saida.candidatos_normais == []
    assert len(saida.revisoes_necessarias) == 1
    assert saida.revisoes_necessarias[0].regra == "RN02"


# --- 7. Conflito material (valor ausente) → revisão RN04 -----------------


def test_valor_ausente_vira_revisao_rn04():
    ordem = _ordem(valor=None)
    resultado = _resultado(_documento("2026DH000001", ordens=[ordem]))

    saida = classificar(resultado, _INTERVALO_PADRAO)

    assert saida.candidatos_normais == []
    assert len(saida.revisoes_necessarias) == 1
    assert saida.revisoes_necessarias[0].regra == "RN04"


# --- 8. Viagem em exercício anterior paga no exercício atual (RN05) ------


def test_viagem_ano_anterior_paga_no_ano_atual_entra_pela_data_de_pagamento():
    ordem = _ordem(
        periodo_inicial=date(2025, 10, 7),
        periodo_final=date(2025, 10, 7),
        data_pagamento=datetime(2026, 5, 15, 9, 0, 0),
    )
    resultado = _resultado(_documento("2026DH000001", ordens=[ordem]))

    saida = classificar(resultado, _INTERVALO_PADRAO)

    assert len(saida.candidatos_normais) == 1


# --- 9. Pagamento posterior ao mês de referência → não entra -------------


def test_pagamento_posterior_ao_mes_de_referencia_nao_entra():
    ordem = _ordem(data_pagamento=datetime(2026, 6, 1, 9, 0, 0))  # intervalo padrão é até maio/2026
    resultado = _resultado(_documento("2026DH000001", ordens=[ordem]))

    saida = classificar(resultado, _INTERVALO_PADRAO)

    assert saida.candidatos_normais == []
    assert saida.revisoes_necessarias == []


# --- 10. Acumulativo janeiro → mês de referência --------------------------


def test_acumulativo_inclui_meses_anteriores_do_mesmo_exercicio():
    ordens = [
        _ordem(ob="2026OB000001", valor=154.09, data_pagamento=datetime(2026, 1, 10, 9, 0, 0)),
        _ordem(ob="2026OB000002", valor=308.19, data_pagamento=datetime(2026, 5, 10, 9, 0, 0)),
    ]
    resultado = _resultado(_documento("2026DH000001", ordens=ordens))

    saida = classificar(resultado, _INTERVALO_PADRAO)

    assert {c.ocorrencia.ordem_bancaria.ob for c in saida.candidatos_normais} == {
        "2026OB000001",
        "2026OB000002",
    }


# --- 11. Duas OBs distintas satisfazendo RN07 → revisão agrupada ---------


def test_duas_obs_distintas_com_mesmo_cpf_periodo_valor_trecho_viram_revisao_agrupada():
    ordens = [
        _ordem(dh="2026DH000001", ob="2026OB000001", data_pagamento=datetime(2026, 5, 15, 9, 0, 0)),
        _ordem(dh="2026DH000002", ob="2026OB000002", data_pagamento=datetime(2026, 5, 20, 9, 0, 0)),
    ]
    resultado = _resultado(
        _documento("2026DH000001", ordens=[ordens[0]]),
        _documento("2026DH000002", ordens=[ordens[1]]),
    )

    saida = classificar(resultado, _INTERVALO_PADRAO)

    assert saida.candidatos_normais == []
    assert len(saida.revisoes_necessarias) == 1
    revisao = saida.revisoes_necessarias[0]
    assert revisao.regra == "RN07"
    assert {oc.ordem_bancaria.ob for oc in revisao.ocorrencias} == {"2026OB000001", "2026OB000002"}


# --- Confronto 3C.1: proveniência do Controle acompanha a ocorrência mesmo
# quando ela vai para REVISAO_NECESSARIA, não só para candidato normal -----


def test_ocorrencias_de_uma_revisao_carregam_registros_do_controle():
    ordens = [
        _ordem(dh="2026DH000001", ob="2026OB000001", data_pagamento=datetime(2026, 5, 15, 9, 0, 0)),
        _ordem(dh="2026DH000002", ob="2026OB000002", data_pagamento=datetime(2026, 5, 20, 9, 0, 0)),
    ]
    resultado = _resultado(
        _documento(
            "2026DH000001", ordens=[ordens[0]], controle=[_registro_controle(dh="2026DH000001", linha=2)]
        ),
        _documento(
            "2026DH000002", ordens=[ordens[1]], controle=[_registro_controle(dh="2026DH000002", linha=3)]
        ),
    )

    saida = classificar(resultado, _INTERVALO_PADRAO)

    revisao = saida.revisoes_necessarias[0]
    por_dh = {oc.dh: oc for oc in revisao.ocorrencias}
    assert por_dh["2026DH000001"].registros_controle[0].dh == "2026DH000001"
    assert por_dh["2026DH000002"].registros_controle[0].dh == "2026DH000002"


# --- 12-14. Alteração de só um campo não satisfaz RN07 --------------------


def test_valor_diferente_nao_satisfaz_rn07():
    ordens = [
        _ordem(dh="2026DH000001", ob="2026OB000001", valor=154.09),
        _ordem(dh="2026DH000002", ob="2026OB000002", valor=308.19),
    ]
    resultado = _resultado(
        _documento("2026DH000001", ordens=[ordens[0]]),
        _documento("2026DH000002", ordens=[ordens[1]]),
    )

    saida = classificar(resultado, _INTERVALO_PADRAO)

    assert saida.revisoes_necessarias == []
    assert len(saida.candidatos_normais) == 2


def test_periodo_diferente_nao_satisfaz_rn07():
    ordens = [
        _ordem(dh="2026DH000001", ob="2026OB000001", periodo_inicial=date(2026, 5, 10), periodo_final=date(2026, 5, 10)),
        _ordem(dh="2026DH000002", ob="2026OB000002", periodo_inicial=date(2026, 5, 11), periodo_final=date(2026, 5, 11)),
    ]
    resultado = _resultado(
        _documento("2026DH000001", ordens=[ordens[0]]),
        _documento("2026DH000002", ordens=[ordens[1]]),
    )

    saida = classificar(resultado, _INTERVALO_PADRAO)

    assert saida.revisoes_necessarias == []
    assert len(saida.candidatos_normais) == 2


def test_trecho_realmente_diferente_nao_satisfaz_rn07():
    ordens = [
        _ordem(dh="2026DH000001", ob="2026OB000001", trecho="ITAPETIM-PEDRA"),
        _ordem(dh="2026DH000002", ob="2026OB000002", trecho="ITAPETIM-TRIUNFO"),
    ]
    resultado = _resultado(
        _documento("2026DH000001", ordens=[ordens[0]]),
        _documento("2026DH000002", ordens=[ordens[1]]),
    )

    saida = classificar(resultado, _INTERVALO_PADRAO)

    assert saida.revisoes_necessarias == []
    assert len(saida.candidatos_normais) == 2


# --- 15. Diferença só de acento/espaço/hífen no trecho → satisfaz RN07 ---


def test_trecho_com_diferenca_so_de_acentuacao_satisfaz_rn07():
    ordens = [
        _ordem(dh="2026DH000001", ob="2026OB000001", trecho="BEZERROS - SANTA CRUZ DO CAPIBARIBE E JATAÚBA"),
        _ordem(dh="2026DH000002", ob="2026OB000002", trecho="BEZERROS-SANTA CRUZ DO CAPIBARIBE E JATAUBA"),
    ]
    resultado = _resultado(
        _documento("2026DH000001", ordens=[ordens[0]]),
        _documento("2026DH000002", ordens=[ordens[1]]),
    )

    saida = classificar(resultado, _INTERVALO_PADRAO)

    assert len(saida.revisoes_necessarias) == 1
    assert saida.revisoes_necessarias[0].regra == "RN07"


# --- 16. A-B vs B-A não satisfaz RN07 -------------------------------------


def test_trecho_invertido_nao_satisfaz_rn07():
    ordens = [
        _ordem(dh="2026DH000001", ob="2026OB000001", trecho="MACAPARANA-RECIFE"),
        _ordem(dh="2026DH000002", ob="2026OB000002", trecho="RECIFE-MACAPARANA"),
    ]
    resultado = _resultado(
        _documento("2026DH000001", ordens=[ordens[0]]),
        _documento("2026DH000002", ordens=[ordens[1]]),
    )

    saida = classificar(resultado, _INTERVALO_PADRAO)

    assert saida.revisoes_necessarias == []
    assert len(saida.candidatos_normais) == 2


# --- 17. Mesma OB repetida fisicamente, equivalente → diagnóstico --------


def test_ob_fisicamente_repetida_equivalente_vira_diagnostico_e_um_candidato():
    ordens = [
        _ordem(ob="2026OB000001", linha=10, valor=0),
        _ordem(ob="2026OB000001", linha=11, valor=154.09),
    ]
    resultado = _resultado(_documento("2026DH000001", ordens=ordens))

    saida = classificar(resultado, _INTERVALO_PADRAO)

    assert len(saida.candidatos_normais) == 1
    assert saida.candidatos_normais[0].ocorrencia.ordem_bancaria.valor == 154.09
    assert saida.revisoes_necessarias == []
    assert len(saida.diagnosticos_repeticao_fisica) == 1
    diagnostico = saida.diagnosticos_repeticao_fisica[0]
    assert isinstance(diagnostico, DiagnosticoRepeticaoFisica)
    assert diagnostico.ob == "2026OB000001"
    assert len(diagnostico.ocorrencias) == 2


# --- 18. Mesma OB repetida com divergência material → RN04 ---------------


def test_ob_fisicamente_repetida_com_divergencia_material_vira_revisao_rn04():
    ordens = [
        _ordem(ob="2026OB000001", linha=10, valor=1069.14, motivo="Curso obrigatório para o vitaliciamento"),
        _ordem(
            ob="2026OB000001",
            linha=11,
            valor=1069.14,
            motivo="PARTICIPAÇÃO EM ETAPA PRESENCIAL DO CURSO DE VITALICIAMENTO",
        ),
    ]
    resultado = _resultado(_documento("2026DH000001", ordens=ordens))

    saida = classificar(resultado, _INTERVALO_PADRAO)

    assert saida.candidatos_normais == []
    assert len(saida.revisoes_necessarias) == 1
    assert saida.revisoes_necessarias[0].regra == "RN04"
    assert "motivo" in saida.revisoes_necessarias[0].evidencias["campos_divergentes"]


# --- 19. Mesmo SEI entre DHs diferentes → nenhum desaparece ---------------


def test_mesmo_sei_entre_dhs_diferentes_nenhum_desaparece():
    sei_compartilhado = "19.20.0001.0000099/2026-99"
    doc1 = _documento(
        "2026DH000001",
        ordens=[_ordem(dh="2026DH000001", ob="2026OB000001", valor=700.0)],
        controle=[_registro_controle(dh="2026DH000001", sei=sei_compartilhado)],
    )
    doc2 = _documento(
        "2026DH000002",
        ordens=[
            _ordem(
                dh="2026DH000002",
                ob="2026OB000002",
                valor=200.0,
                periodo_inicial=date(2026, 5, 11),
                periodo_final=date(2026, 5, 11),
            )
        ],
        controle=[_registro_controle(dh="2026DH000002", sei=sei_compartilhado, linha=3)],
    )
    resultado = _resultado(doc1, doc2)

    saida = classificar(resultado, _INTERVALO_PADRAO)

    assert saida.revisoes_necessarias == []
    assert {c.ocorrencia.dh for c in saida.candidatos_normais} == {"2026DH000001", "2026DH000002"}


# --- 20. Nenhuma entrada potencialmente relevante é descartada em silêncio


def test_dh_so_no_controle_sem_ob_nao_vira_pagamento_ficticio_mas_nao_e_perdido():
    """RN01: registro administrativo sem OB paga não gera candidato nem
    revisão (não é caso atípico — é o estado normal de uma diária ainda
    não paga), mas continua acessível em `resultado.documentos` (a
    reconciliação em si, que o motor de decisão nunca modifica)."""
    resultado = _resultado(_documento("2026DH000001", controle=[_registro_controle()]))

    saida = classificar(resultado, _INTERVALO_PADRAO)

    assert saida.candidatos_normais == []
    assert saida.revisoes_necessarias == []
    assert resultado.documentos["2026DH000001"].controle[0].dh == "2026DH000001"
