from datetime import date

from app.domain.entities.ordem_bancaria import OrdemBancaria
from app.domain.entities.registro_controle import ClassificacaoSei, RegistroControle
from app.domain.relatorio_transparencia.motor_reconciliacao import reconciliar


def _registro_controle(
    *,
    dh,
    sei="19.20.0001.0000001/2026-01",
    linha=2,
    cpf="11111111111",
    periodo_inicial=date(2026, 5, 13),
    periodo_final=date(2026, 5, 16),
    cidade_origem="ITAPETIM",
    cidade_destino="RECIFE",
    trecho="ITAPETIM - RECIFE",
    motivo="Motivo de teste",
    transporte="CARRO",
    valor_total_diarias=801.85,
    sei_classificacao=ClassificacaoSei.VALIDO,
):
    return RegistroControle(
        linha=linha,
        dh=dh,
        sei=sei,
        sei_classificacao=sei_classificacao,
        doc_origem="PJTESTE",
        cpf=cpf,
        periodo_inicial=periodo_inicial,
        periodo_final=periodo_final,
        cidade_origem=cidade_origem,
        cidade_destino=cidade_destino,
        trecho=trecho,
        motivo=motivo,
        transporte=transporte,
        valor_total_diarias=valor_total_diarias,
    )


def _ordem_bancaria(
    *,
    dh,
    ob,
    linha=2,
    valor=154.09,
    situacao="Paga",
    duplicidade="Único",
):
    return OrdemBancaria(
        linha=linha,
        dh=dh,
        ob=ob,
        credor="FULANO DE TAL",
        situacao=situacao,
        data_pagamento=None,
        sei="19.20.0001.0000001/2026-01",
        cpf="11111111111",
        nome="FULANO DE TAL",
        cargo="Cargo de Teste",
        periodo_inicial=date(2026, 5, 13),
        periodo_final=date(2026, 5, 16),
        cidade_origem="ITAPETIM",
        cidade_destino="RECIFE",
        transporte="CARRO",
        motivo="Motivo de teste",
        valor=valor,
        valor_bruto_sem_formula=valor,
        restituicao=None,
        duplicidade=duplicidade,
        item_de_gasto="33901401",
    )


# --- 1 DH -> 1 OB ------------------------------------------------------


def test_um_dh_para_uma_ob():
    controle = {"2026DH000001": [_registro_controle(dh="2026DH000001")]}
    ordens = {"2026DH000001": [_ordem_bancaria(dh="2026DH000001", ob="2026OB000001")]}

    resultado = reconciliar(controle, ordens)

    documento = resultado.documentos["2026DH000001"]
    assert len(documento.controle) == 1
    assert len(documento.ordens_bancarias) == 1
    assert documento.ordens_bancarias[0].ob == "2026OB000001"


# --- 1 DH -> N OBs (R03: pagamento fracionado é legítimo) ---------------


def test_um_dh_para_multiplas_obs_generico():
    controle = {"2026DH000001": [_registro_controle(dh="2026DH000001")]}
    ordens = {
        "2026DH000001": [
            _ordem_bancaria(dh="2026DH000001", ob="2026OB000001", valor=308.19),
            _ordem_bancaria(dh="2026DH000001", ob="2026OB000002", valor=154.09),
        ]
    }

    resultado = reconciliar(controle, ordens)

    documento = resultado.documentos["2026DH000001"]
    assert len(documento.ordens_bancarias) == 2
    assert {ob.ob for ob in documento.ordens_bancarias} == {"2026OB000001", "2026OB000002"}


# --- Caso de regressão obrigatório: DH com pagamento fracionado ---------
# (padrão real recorrente na auditoria — parcela principal + saldo;
# identificadores abaixo são fictícios, não correspondem a nenhum
# DH/OB/SEI real do MPPE)


def test_dh_com_multiplas_obs_preserva_todas_as_obs():
    """Padrão real recorrente na auditoria: um DH com duas OBs legítimas
    (parcela principal 801,25 + saldo 0,60, somando 801,85 = valor total
    do Controle). Nenhuma das duas pode desaparecer na reconciliação — a
    decisão de como publicá-las (R03) é de uma Micro-sprint futura, esta
    aqui só prova que a associação preserva as duas."""
    controle = {
        "2026DH900001": [
            _registro_controle(
                dh="2026DH900001",
                sei="99.99.9999.9999999/2099-99",
                valor_total_diarias=801.85,
            )
        ]
    }
    ordens = {
        "2026DH900001": [
            _ordem_bancaria(dh="2026DH900001", ob="2026OB900001", valor=801.25),
            _ordem_bancaria(dh="2026DH900001", ob="2026OB900002", valor=0.60),
        ]
    }

    resultado = reconciliar(controle, ordens)

    documento = resultado.documentos["2026DH900001"]
    assert len(documento.controle) == 1
    assert documento.controle[0].valor_total_diarias == 801.85
    obs = {ob.ob: ob.valor for ob in documento.ordens_bancarias}
    assert obs == {"2026OB900001": 801.25, "2026OB900002": 0.60}


# --- Ausência de deduplicação indevida ----------------------------------


def test_ob_com_mesma_numeracao_repetida_nao_e_deduplicada():
    """R04 (decidir qual das duas manter, via campo DUPLICIDADE) é de uma
    Micro-sprint futura — esta reconciliação nunca decide sozinha, sempre
    preserva as duas linhas."""
    controle = {"2026DH000001": [_registro_controle(dh="2026DH000001")]}
    ordens = {
        "2026DH000001": [
            _ordem_bancaria(dh="2026DH000001", ob="2026OB000001", duplicidade="Único"),
            _ordem_bancaria(dh="2026DH000001", ob="2026OB000001", duplicidade="Duplicado"),
        ]
    }

    resultado = reconciliar(controle, ordens)

    documento = resultado.documentos["2026DH000001"]
    assert len(documento.ordens_bancarias) == 2
    assert [ob.duplicidade for ob in documento.ordens_bancarias] == ["Único", "Duplicado"]


def test_controle_com_dh_duplicado_tambem_nao_e_deduplicado():
    """Achado real da auditoria: o próprio Controle DIMCAC tem o mesmo DH
    duplicado em duas linhas — a lista `controle` existe (em vez de um
    campo escalar) exatamente para não perder essa segunda linha por
    construção de tipo. Micro-sprint 3: as duas linhas também têm SEIs
    diferentes, e nenhuma delas é escolhida em detrimento da outra — SEI
    nunca é chave de deduplicação neste módulo."""
    controle = {
        "2026DH900002": [
            _registro_controle(dh="2026DH900002", sei="SEI-A", valor_total_diarias=1069.14),
            _registro_controle(dh="2026DH900002", sei="SEI-B", valor_total_diarias=1069.14),
        ]
    }
    ordens = {"2026DH900002": [_ordem_bancaria(dh="2026DH900002", ob="2026OB900003")]}

    resultado = reconciliar(controle, ordens)

    documento = resultado.documentos["2026DH900002"]
    assert len(documento.controle) == 2
    assert {r.sei for r in documento.controle} == {"SEI-A", "SEI-B"}


# --- Associação Controle x Base OB --------------------------------------


def test_dh_so_no_controle_fica_com_ordens_bancarias_vazia():
    controle = {"2026DH000001": [_registro_controle(dh="2026DH000001", sei="SEI-1")]}
    ordens: dict = {}

    resultado = reconciliar(controle, ordens)

    documento = resultado.documentos["2026DH000001"]
    assert documento.controle[0].sei == "SEI-1"
    assert documento.ordens_bancarias == []


def test_dh_so_na_base_ob_fica_com_controle_vazio():
    controle: dict = {}
    ordens = {"2026DH999999": [_ordem_bancaria(dh="2026DH999999", ob="2026OB999999")]}

    resultado = reconciliar(controle, ordens)

    documento = resultado.documentos["2026DH999999"]
    assert documento.controle == []
    assert documento.ordens_bancarias[0].ob == "2026OB999999"


# --- Isolamento entre DHs -------------------------------------------------


def test_obs_de_um_dh_nunca_vazam_para_outro_dh():
    controle = {
        "2026DH000001": [_registro_controle(dh="2026DH000001", sei="SEI-1")],
        "2026DH000002": [_registro_controle(dh="2026DH000002", sei="SEI-2")],
    }
    ordens = {
        "2026DH000001": [_ordem_bancaria(dh="2026DH000001", ob="2026OB000001")],
        "2026DH000002": [_ordem_bancaria(dh="2026DH000002", ob="2026OB000002")],
    }

    resultado = reconciliar(controle, ordens)

    assert len(resultado.documentos) == 2
    assert resultado.documentos["2026DH000001"].ordens_bancarias[0].ob == "2026OB000001"
    assert resultado.documentos["2026DH000002"].ordens_bancarias[0].ob == "2026OB000002"
