from dataclasses import replace
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
    nome="FULANO DE TAL",
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
        nome=nome,
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


# --- 21. Confronto QA Codex / QA-RT-01 — equivalência material de
# repetição física da mesma OB. Achado real: a versão anterior só
# comparava trecho/motivo/situacao/data_pagamento, e só entre as linhas de
# valor NÃO-zero (deixando a linha zero inteiramente fora da checagem) —
# corrigido em `_resolver_repeticao_fisica`/`CAMPOS_EVIDENCIA_MATERIAL`.


def _duas_ocorrencias_mesma_ob(*, dh_a="2026DH000001", dh_b="2026DH000001", ordem_a=None, ordem_b=None):
    """Helper QA-RT-01 — monta duas linhas físicas da MESMA OB, cada uma
    sob seu próprio `dh` de agrupamento (`_documento`), reproduzindo
    exatamente como `classificar()` atribui `OcorrenciaFinanceira.dh` (a
    chave externa de `resultado.documentos`, não `OrdemBancaria.dh`)."""
    ordem_a = ordem_a or _ordem(ob="2026OB000001", linha=10)
    ordem_b = ordem_b or _ordem(ob="2026OB000001", linha=11)
    if dh_a == dh_b:
        return _resultado(_documento(dh_a, ordens=[ordem_a, ordem_b]))
    return _resultado(_documento(dh_a, ordens=[ordem_a]), _documento(dh_b, ordens=[ordem_b]))


def test_qa_rt01_zero_mais_real_equivalentes_continua_sem_revisao():
    """Comportamento ANTERIOR preservado — zero + valor real, resto
    idêntico, continua colapsando para 1 candidato sem revisão (mesmo
    cenário de `test_ob_fisicamente_repetida_equivalente_vira_diagnostico_e_um_candidato`,
    repetido aqui como regressão nomeada do confronto QA-RT-01)."""
    ordens = [_ordem(ob="2026OB000001", linha=10, valor=0), _ordem(ob="2026OB000001", linha=11, valor=154.09)]
    resultado = _resultado(_documento("2026DH000001", ordens=ordens))

    saida = classificar(resultado, _INTERVALO_PADRAO)

    assert saida.revisoes_necessarias == []
    assert len(saida.candidatos_normais) == 1
    assert saida.candidatos_normais[0].ocorrencia.ordem_bancaria.valor == 154.09
    assert len(saida.diagnosticos_repeticao_fisica) == 1
    assert len(saida.diagnosticos_repeticao_fisica[0].ocorrencias) == 2


def test_qa_rt01_zero_mais_real_com_motivo_divergente_vira_revisao():
    """Achado real do confronto — antes, a linha zero nunca entrava na
    comparação de `motivo`/`trecho` (só linhas de valor não-zero eram
    comparadas entre si); agora é detectado."""
    resultado = _duas_ocorrencias_mesma_ob(
        ordem_a=_ordem(ob="2026OB000001", linha=10, valor=0, motivo="Diária cancelada"),
        ordem_b=_ordem(ob="2026OB000001", linha=11, valor=154.09, motivo="Viagem completamente diferente"),
    )

    saida = classificar(resultado, _INTERVALO_PADRAO)

    assert saida.candidatos_normais == []
    assert len(saida.revisoes_necessarias) == 1
    assert saida.revisoes_necessarias[0].regra == "RN04"
    assert "motivo" in saida.revisoes_necessarias[0].evidencias["campos_divergentes"]


def test_qa_rt01_zero_mais_real_com_trecho_divergente_vira_revisao():
    resultado = _duas_ocorrencias_mesma_ob(
        ordem_a=_ordem(ob="2026OB000001", linha=10, valor=0, trecho="RECIFE-GARANHUNS"),
        ordem_b=_ordem(ob="2026OB000001", linha=11, valor=154.09, trecho="RECIFE-PETROLINA"),
    )

    saida = classificar(resultado, _INTERVALO_PADRAO)

    assert saida.candidatos_normais == []
    assert len(saida.revisoes_necessarias) == 1
    assert saida.revisoes_necessarias[0].regra == "RN04"
    assert "trecho" in saida.revisoes_necessarias[0].evidencias["campos_divergentes"]


def test_qa_rt01_mesma_ob_com_dh_divergente_vira_revisao():
    """I01/I03 — duas linhas físicas da mesma OB sob DHs diferentes são,
    por definição, dois documentos administrativos distintos."""
    resultado = _duas_ocorrencias_mesma_ob(
        dh_a="2026DH000001",
        dh_b="2026DH999999",
        ordem_a=_ordem(ob="2026OB000001", linha=10, valor=154.09),
        ordem_b=_ordem(ob="2026OB000001", linha=11, valor=154.09),
    )

    saida = classificar(resultado, _INTERVALO_PADRAO)

    assert saida.candidatos_normais == []
    assert len(saida.revisoes_necessarias) == 1
    assert saida.revisoes_necessarias[0].regra == "RN04"
    assert "dh" in saida.revisoes_necessarias[0].evidencias["campos_divergentes"]


def test_qa_rt01_cpf_divergente_vira_revisao():
    """§1 — CPF divergente é a pessoa errada recebendo o pagamento."""
    resultado = _duas_ocorrencias_mesma_ob(
        ordem_a=_ordem(ob="2026OB000001", linha=10, valor=154.09, cpf="11111111111"),
        ordem_b=_ordem(ob="2026OB000001", linha=11, valor=154.09, cpf="99999999999"),
    )

    saida = classificar(resultado, _INTERVALO_PADRAO)

    assert saida.candidatos_normais == []
    assert len(saida.revisoes_necessarias) == 1
    assert saida.revisoes_necessarias[0].regra == "RN04"
    assert "cpf" in saida.revisoes_necessarias[0].evidencias["campos_divergentes"]


def test_qa_rt01_periodo_divergente_vira_revisao():
    resultado = _duas_ocorrencias_mesma_ob(
        ordem_a=_ordem(
            ob="2026OB000001", linha=10, valor=154.09,
            periodo_inicial=date(2026, 5, 10), periodo_final=date(2026, 5, 10),
        ),
        ordem_b=_ordem(
            ob="2026OB000001", linha=11, valor=154.09,
            periodo_inicial=date(2026, 5, 20), periodo_final=date(2026, 5, 22),
        ),
    )

    saida = classificar(resultado, _INTERVALO_PADRAO)

    assert saida.candidatos_normais == []
    assert len(saida.revisoes_necessarias) == 1
    assert saida.revisoes_necessarias[0].regra == "RN04"
    campos = saida.revisoes_necessarias[0].evidencias["campos_divergentes"]
    assert "periodo_inicial" in campos
    assert "periodo_final" in campos


def test_qa_rt01_sei_divergente_vira_revisao():
    resultado = _duas_ocorrencias_mesma_ob(
        ordem_a=_ordem(ob="2026OB000001", linha=10, valor=154.09),
        ordem_b=_ordem(ob="2026OB000001", linha=11, valor=154.09),
    )
    # `_ordem()` não tem parâmetro `sei` — cria as duas variantes na mão
    # a partir do objeto retornado, mesma técnica de `dataclasses.replace`.
    doc = list(resultado.documentos.values())[0]
    ordens = [replace(doc.ordens_bancarias[0], sei="19.20.0001.0000001/2026-01"),
              replace(doc.ordens_bancarias[1], sei="19.20.0009.0000999/2026-09")]
    resultado = _resultado(_documento("2026DH000001", ordens=ordens))

    saida = classificar(resultado, _INTERVALO_PADRAO)

    assert saida.candidatos_normais == []
    assert len(saida.revisoes_necessarias) == 1
    assert saida.revisoes_necessarias[0].regra == "RN04"
    assert "sei" in saida.revisoes_necessarias[0].evidencias["campos_divergentes"]


def test_qa_rt01_cargo_divergente_vira_revisao():
    """Coluna D do XLSX final (`escritor_relatorio_transparencia.py`) —
    materialmente aplicável porque é conteúdo publicado, com fallback para
    a Base OB quando o Controle DIMCAC não resolve."""
    resultado = _duas_ocorrencias_mesma_ob(
        ordem_a=_ordem(ob="2026OB000001", linha=10, valor=154.09),
        ordem_b=_ordem(ob="2026OB000001", linha=11, valor=154.09),
    )
    doc = list(resultado.documentos.values())[0]
    ordens = [replace(doc.ordens_bancarias[0], cargo="Professor"),
              replace(doc.ordens_bancarias[1], cargo="Analista")]
    resultado = _resultado(_documento("2026DH000001", ordens=ordens))

    saida = classificar(resultado, _INTERVALO_PADRAO)

    assert saida.candidatos_normais == []
    assert len(saida.revisoes_necessarias) == 1
    assert "cargo" in saida.revisoes_necessarias[0].evidencias["campos_divergentes"]


def test_qa_rt01_transporte_divergente_vira_revisao():
    """Coluna H do XLSX final — mesmo raciocínio de `cargo` acima."""
    resultado = _duas_ocorrencias_mesma_ob(
        ordem_a=_ordem(ob="2026OB000001", linha=10, valor=154.09),
        ordem_b=_ordem(ob="2026OB000001", linha=11, valor=154.09),
    )
    doc = list(resultado.documentos.values())[0]
    ordens = [replace(doc.ordens_bancarias[0], transporte="CARRO"),
              replace(doc.ordens_bancarias[1], transporte="AVIÃO")]
    resultado = _resultado(_documento("2026DH000001", ordens=ordens))

    saida = classificar(resultado, _INTERVALO_PADRAO)

    assert saida.candidatos_normais == []
    assert len(saida.revisoes_necessarias) == 1
    assert "transporte" in saida.revisoes_necessarias[0].evidencias["campos_divergentes"]


def test_qa_rt01_restituicao_divergente_vira_revisao():
    """RN02 já trata RESTITUIÇÃO como campo sensível o bastante para
    sozinho forçar RN04 — divergência entre linhas físicas é o mesmo tipo
    de ambiguidade."""
    resultado = _duas_ocorrencias_mesma_ob(
        ordem_a=_ordem(ob="2026OB000001", linha=10, valor=154.09),
        ordem_b=_ordem(ob="2026OB000001", linha=11, valor=154.09),
    )
    doc = list(resultado.documentos.values())[0]
    ordens = [replace(doc.ordens_bancarias[0], restituicao=None),
              replace(doc.ordens_bancarias[1], restituicao=50.0)]
    resultado = _resultado(_documento("2026DH000001", ordens=ordens))

    saida = classificar(resultado, _INTERVALO_PADRAO)

    assert saida.candidatos_normais == []
    assert len(saida.revisoes_necessarias) == 1
    assert "restituicao" in saida.revisoes_necessarias[0].evidencias["campos_divergentes"]


def test_qa_rt01_repeticao_realmente_identica_nao_gera_revisao_indevida():
    """Controle negativo — mesmo valor não-zero, TUDO igual (não é o
    cenário zero+real): continua colapsando para 1 candidato, sem RN04
    espúrio."""
    ordens = [_ordem(ob="2026OB000001", linha=10, valor=154.09), _ordem(ob="2026OB000001", linha=11, valor=154.09)]
    resultado = _resultado(_documento("2026DH000001", ordens=ordens))

    saida = classificar(resultado, _INTERVALO_PADRAO)

    assert saida.revisoes_necessarias == []
    assert len(saida.candidatos_normais) == 1
    assert len(saida.diagnosticos_repeticao_fisica) == 1
    assert len(saida.diagnosticos_repeticao_fisica[0].ocorrencias) == 2


# --- 22. Revalidação Codex / NOVO-RT-07 — nome divergente em repetição
# física da mesma OB. Achado real: mesma OB + mesmo CPF + nome A != nome B
# colapsava silenciosamente (candidatos=1, revisões=[]), publicando uma das
# duas grafias sem qualquer sinal de revisão — nome é conteúdo publicado
# (coluna C do XLSX final) e agora entra em `CAMPOS_EVIDENCIA_MATERIAL`.


def test_novo_rt07_mesma_ob_mesmo_cpf_nome_divergente_vira_revisao():
    resultado = _duas_ocorrencias_mesma_ob(
        ordem_a=_ordem(ob="2026OB000001", linha=10, valor=154.09, cpf="11111111111", nome="FULANO DE TAL"),
        ordem_b=_ordem(ob="2026OB000001", linha=11, valor=154.09, cpf="11111111111", nome="FULANO D'TAL"),
    )

    saida = classificar(resultado, _INTERVALO_PADRAO)

    assert saida.candidatos_normais == []
    assert len(saida.revisoes_necessarias) == 1
    assert saida.revisoes_necessarias[0].regra == "RN04"
    assert "nome" in saida.revisoes_necessarias[0].evidencias["campos_divergentes"]


def test_novo_rt07_zero_mais_real_com_nome_divergente_vira_revisao():
    """Mesmo cenário zero+real do QA-RT-01 original, agora com nome como o
    único campo divergente — antes desta correção, `nome` não estava em
    `CAMPOS_EVIDENCIA_MATERIAL`, então este caso colapsava silenciosamente."""
    resultado = _duas_ocorrencias_mesma_ob(
        ordem_a=_ordem(ob="2026OB000001", linha=10, valor=0, nome="FULANO DE TAL"),
        ordem_b=_ordem(ob="2026OB000001", linha=11, valor=154.09, nome="OUTRO NOME COMPLETAMENTE DIFERENTE"),
    )

    saida = classificar(resultado, _INTERVALO_PADRAO)

    assert saida.candidatos_normais == []
    assert len(saida.revisoes_necessarias) == 1
    assert saida.revisoes_necessarias[0].regra == "RN04"
    assert "nome" in saida.revisoes_necessarias[0].evidencias["campos_divergentes"]


def test_novo_rt07_nome_igual_preserva_comportamento_anterior():
    """Controle — nome idêntico (junto de tudo mais idêntico) continua
    colapsando normalmente, sem RN04 espúria."""
    resultado = _duas_ocorrencias_mesma_ob(
        ordem_a=_ordem(ob="2026OB000001", linha=10, valor=0, nome="FULANO DE TAL"),
        ordem_b=_ordem(ob="2026OB000001", linha=11, valor=154.09, nome="FULANO DE TAL"),
    )

    saida = classificar(resultado, _INTERVALO_PADRAO)

    assert saida.revisoes_necessarias == []
    assert len(saida.candidatos_normais) == 1
    assert saida.candidatos_normais[0].ocorrencia.ordem_bancaria.valor == 154.09


def test_novo_rt07_repeticao_totalmente_equivalente_com_nome_continua_sem_revisao():
    """Controle negativo explícito — repetição totalmente equivalente
    (mesmo valor não-zero, tudo igual, nome incluso) continua sem RN04."""
    ordens = [
        _ordem(ob="2026OB000001", linha=10, valor=154.09, nome="FULANO DE TAL"),
        _ordem(ob="2026OB000001", linha=11, valor=154.09, nome="FULANO DE TAL"),
    ]
    resultado = _resultado(_documento("2026DH000001", ordens=ordens))

    saida = classificar(resultado, _INTERVALO_PADRAO)

    assert saida.revisoes_necessarias == []
    assert len(saida.candidatos_normais) == 1
    assert len(saida.diagnosticos_repeticao_fisica) == 1
    assert len(saida.diagnosticos_repeticao_fisica[0].ocorrencias) == 2


# --- Confronto QA Codex / HOMO-RT-01 — isolamento por competência --------
#
# Achado real (Codex, homologação multicenário): `_resolver_repeticao_fisica`
# (I11) rodava sobre TODO o acervo reconciliado, sem nenhum recorte
# temporal — uma OB fisicamente repetida com divergência em maio virava
# uma `RevisaoNecessaria` RN04 incondicional, presente em toda e qualquer
# janela, inclusive competências anteriores a maio (ex.: preparar janeiro
# mostrava — e bloqueava — uma pendência de maio). Corrigido filtrando por
# `intervalo` (R11, acumulativo) ANTES de montar `ocorrencias_por_ob`,
# nunca depois.

_INTERVALO_JANEIRO = intervalo_acumulado(2026, 1)
_INTERVALO_ABRIL = intervalo_acumulado(2026, 4)
_INTERVALO_MAIO = intervalo_acumulado(2026, 5)


def _ordens_repeticao_fisica_divergente_em_maio():
    """Mesma OB, duas linhas físicas, DATA OB de ambas em maio, motivo
    divergente — mesmo cenário de `test_ob_fisicamente_repetida_com_divergencia_material_vira_revisao_rn04`,
    só que com datas explícitas em maio (a data importa para este confronto)."""
    return [
        _ordem(
            ob="2026OB000001", linha=10, valor=1069.14,
            motivo="Curso obrigatório para o vitaliciamento",
            data_pagamento=datetime(2026, 5, 12, 9, 0, 0),
            periodo_inicial=date(2026, 5, 10), periodo_final=date(2026, 5, 10),
        ),
        _ordem(
            ob="2026OB000001", linha=11, valor=1069.14,
            motivo="PARTICIPAÇÃO EM ETAPA PRESENCIAL DO CURSO DE VITALICIAMENTO",
            data_pagamento=datetime(2026, 5, 13, 9, 0, 0),
            periodo_inicial=date(2026, 5, 10), periodo_final=date(2026, 5, 10),
        ),
    ]


def test_homo_rt01_pendencia_de_maio_nao_aparece_nem_bloqueia_janeiro():
    ordens = _ordens_repeticao_fisica_divergente_em_maio()
    resultado = _resultado(_documento("2026DH000001", ordens=ordens))

    saida_janeiro = classificar(resultado, _INTERVALO_JANEIRO)

    assert saida_janeiro.revisoes_necessarias == [], (
        "pendência RN04 de maio vazou para a janela de janeiro"
    )
    assert saida_janeiro.candidatos_normais == []
    assert saida_janeiro.diagnosticos_repeticao_fisica == []


def test_homo_rt01_pendencia_de_maio_tambem_nao_bloqueia_fevereiro_marco_abril():
    ordens = _ordens_repeticao_fisica_divergente_em_maio()
    resultado = _resultado(_documento("2026DH000001", ordens=ordens))

    for mes in (2, 3, 4):
        saida = classificar(resultado, intervalo_acumulado(2026, mes))
        assert saida.revisoes_necessarias == [], f"vazou para o mês {mes}"
        assert saida.candidatos_normais == []


def test_homo_rt01_maio_continua_detectando_sua_propria_pendencia():
    ordens = _ordens_repeticao_fisica_divergente_em_maio()
    resultado = _resultado(_documento("2026DH000001", ordens=ordens))

    saida_maio = classificar(resultado, _INTERVALO_MAIO)

    assert len(saida_maio.revisoes_necessarias) == 1
    assert saida_maio.revisoes_necessarias[0].regra == "RN04"
    assert "motivo" in saida_maio.revisoes_necessarias[0].evidencias["campos_divergentes"]
    assert {oc.ordem_bancaria.linha for oc in saida_maio.revisoes_necessarias[0].ocorrencias} == {10, 11}


def test_homo_rt01_competencia_sem_pendencias_continua_liberada():
    """Controle — nenhuma repetição física envolvida: candidatos normais
    de janeiro continuam aparecendo e liberados, sem nenhuma revisão
    espúria introduzida pela correção."""
    ordens_janeiro = [
        _ordem(ob="2026OB000010", linha=2, data_pagamento=datetime(2026, 1, 15, 9, 0, 0)),
    ]
    ordens_maio = [
        _ordem(ob="2026OB000020", linha=3, data_pagamento=datetime(2026, 5, 15, 9, 0, 0)),
    ]
    resultado = _resultado(
        _documento("2026DH000010", ordens=ordens_janeiro),
        _documento("2026DH000020", ordens=ordens_maio),
    )

    saida_janeiro = classificar(resultado, _INTERVALO_JANEIRO)

    assert saida_janeiro.revisoes_necessarias == []
    assert {c.ocorrencia.ordem_bancaria.ob for c in saida_janeiro.candidatos_normais} == {"2026OB000010"}


def test_homo_rt01_mesma_ob_em_meses_diferentes_nao_contamina_competencias_anteriores():
    """A mesma OB física repetida, uma linha em janeiro e outra em maio
    (fronteira do acumulado crescendo mês a mês) — janeiro e abril veem
    só a linha de janeiro (candidato normal, sem repetição física
    detectável ainda); só a partir de maio, quando as DUAS linhas entram
    na janela acumulada, a divergência é detectada."""
    ordens = [
        _ordem(
            ob="2026OB000001", linha=10, valor=100.0, motivo="Motivo de janeiro",
            data_pagamento=datetime(2026, 1, 10, 9, 0, 0),
            periodo_inicial=date(2026, 1, 8), periodo_final=date(2026, 1, 8),
        ),
        _ordem(
            ob="2026OB000001", linha=11, valor=200.0, motivo="Motivo de maio, divergente",
            data_pagamento=datetime(2026, 5, 20, 9, 0, 0),
            periodo_inicial=date(2026, 5, 18), periodo_final=date(2026, 5, 18),
        ),
    ]
    resultado = _resultado(_documento("2026DH000001", ordens=ordens))

    saida_janeiro = classificar(resultado, _INTERVALO_JANEIRO)
    assert saida_janeiro.revisoes_necessarias == []
    assert len(saida_janeiro.candidatos_normais) == 1
    assert saida_janeiro.candidatos_normais[0].ocorrencia.ordem_bancaria.linha == 10

    saida_abril = classificar(resultado, _INTERVALO_ABRIL)
    assert saida_abril.revisoes_necessarias == []
    assert len(saida_abril.candidatos_normais) == 1
    assert saida_abril.candidatos_normais[0].ocorrencia.ordem_bancaria.linha == 10

    saida_maio = classificar(resultado, _INTERVALO_MAIO)
    assert saida_maio.candidatos_normais == []
    assert len(saida_maio.revisoes_necessarias) == 1
    assert saida_maio.revisoes_necessarias[0].regra == "RN04"
    assert {oc.ordem_bancaria.linha for oc in saida_maio.revisoes_necessarias[0].ocorrencias} == {10, 11}


def test_homo_rt01_identidade_do_grupo_e_estavel_independente_da_janela_que_o_expos():
    """A revisão só passa a existir a partir de maio (ver teste acima), mas
    quando existe, a identidade do grupo (regra + OBs) é exatamente a
    mesma calculada por `identidade_grupo` — decisões humanas persistidas
    continuam corretamente associadas à evidência certa, nunca a uma
    identidade diferente por causa de qual competência revelou o grupo."""
    from app.domain.relatorio_transparencia.decisao import identidade_grupo

    ordens = _ordens_repeticao_fisica_divergente_em_maio()
    resultado = _resultado(_documento("2026DH000001", ordens=ordens))

    saida_maio = classificar(resultado, _INTERVALO_MAIO)
    revisao = saida_maio.revisoes_necessarias[0]
    obs_do_grupo = [oc.ordem_bancaria.ob for oc in revisao.ocorrencias]

    assert identidade_grupo(revisao.regra, obs_do_grupo) == identidade_grupo("RN04", ["2026OB000001"])

    saida_junho = classificar(resultado, intervalo_acumulado(2026, 6))
    revisao_junho = saida_junho.revisoes_necessarias[0]
    obs_do_grupo_junho = [oc.ordem_bancaria.ob for oc in revisao_junho.ocorrencias]
    assert identidade_grupo(revisao.regra, obs_do_grupo) == identidade_grupo(
        revisao_junho.regra, obs_do_grupo_junho
    )


def test_homo_rt01_julho_preserva_comportamento_ja_homologado():
    """Controle — nenhuma OB fisicamente repetida no cenário; julho (mês 7)
    continua classificando normalmente, exatamente como antes desta
    correção (repetição física em escopo, sem nada fora da janela)."""
    ordens = [
        _ordem(ob="2026OB000030", linha=2, data_pagamento=datetime(2026, 7, 10, 9, 0, 0)),
    ]
    resultado = _resultado(_documento("2026DH000030", ordens=ordens))

    saida_julho = classificar(resultado, intervalo_acumulado(2026, 7))

    assert saida_julho.revisoes_necessarias == []
    assert len(saida_julho.candidatos_normais) == 1
    assert saida_julho.candidatos_normais[0].ocorrencia.ordem_bancaria.ob == "2026OB000030"
