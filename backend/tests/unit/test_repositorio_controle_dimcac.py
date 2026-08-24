from datetime import date

from openpyxl import Workbook

from app.domain.entities.registro_controle import ClassificacaoSei
from app.consulta.repositorio_controle_dimcac import controle_dimcac_por_dh
from app.consulta.repositorio_ordens_bancarias import ordens_bancarias_por_dh
from app.domain.relatorio_transparencia.motor_reconciliacao import reconciliar

_SEI_PADRAO = "19.20.0001.0000001/2026-01"
_DH_PADRAO = "2026DH000001"


def _nova_planilha():
    workbook = Workbook()
    planilha = workbook.active
    planilha.title = "Controle de Diárias"
    return workbook, planilha


def _escrever_linha_controle(
    planilha,
    linha,
    *,
    dh=_DH_PADRAO,
    sei=_SEI_PADRAO,
    doc_origem="PJTESTE",
    cpf=11111111111,
    periodo_inicial=date(2026, 1, 8),
    periodo_final=date(2026, 1, 10),
    trecho="RECIFE - GARANHUNS",
    motivo="Motivo de teste",
    transporte="CARRO",
    valor_diarias=None,
    quantidade_integral=None,
    quantidade_parcial=None,
):
    if dh is not None:
        planilha[f"A{linha}"] = dh
    if sei is not None:
        planilha[f"B{linha}"] = sei
    if doc_origem is not None:
        planilha[f"C{linha}"] = doc_origem
    if cpf is not None:
        planilha[f"D{linha}"] = cpf
    if periodo_inicial is not None:
        planilha[f"H{linha}"] = periodo_inicial
    if periodo_final is not None:
        planilha[f"I{linha}"] = periodo_final
    if trecho is not None:
        planilha[f"J{linha}"] = trecho
    if transporte is not None:
        planilha[f"K{linha}"] = transporte
    if motivo is not None:
        planilha[f"L{linha}"] = motivo
    if valor_diarias is not None:
        planilha[f"P{linha}"] = valor_diarias
    if quantidade_integral is not None:
        planilha[f"N{linha}"] = quantidade_integral
    if quantidade_parcial is not None:
        planilha[f"O{linha}"] = quantidade_parcial


# --- 1. 1 DH -> 1 linha de Controle --------------------------------------


def test_um_dh_para_uma_linha_de_controle():
    _, planilha = _nova_planilha()
    _escrever_linha_controle(planilha, 2)

    resultado = controle_dimcac_por_dh(planilha)

    assert _DH_PADRAO in resultado.por_dh
    registros = resultado.por_dh[_DH_PADRAO]
    assert len(registros) == 1
    registro = registros[0]
    assert registro.linha == 2
    assert registro.sei == _SEI_PADRAO
    assert registro.sei_classificacao is ClassificacaoSei.VALIDO
    assert registro.cpf == "11111111111"
    assert registro.cidade_origem == "RECIFE"
    assert registro.cidade_destino == "GARANHUNS"
    assert registro.trecho == "RECIFE - GARANHUNS"
    assert resultado.total_linhas == 1
    assert resultado.linhas_sem_dh == 0
    assert resultado.linhas_vazias_ignoradas == 0


# --- 2. 1 DH -> múltiplas linhas de Controle ------------------------------


def test_um_dh_para_multiplas_linhas_de_controle():
    _, planilha = _nova_planilha()
    _escrever_linha_controle(planilha, 2, sei="19.20.0001.0000001/2026-01")
    _escrever_linha_controle(planilha, 3, sei="19.20.0001.0000002/2026-02")

    resultado = controle_dimcac_por_dh(planilha)

    registros = resultado.por_dh[_DH_PADRAO]
    assert len(registros) == 2
    assert {r.linha for r in registros} == {2, 3}
    assert resultado.total_linhas == 2


# --- 3. Mesmo SEI -> DHs diferentes ---------------------------------------


def test_mesmo_sei_em_dhs_diferentes_sobrevive_nos_dois():
    _, planilha = _nova_planilha()
    _escrever_linha_controle(planilha, 2, dh="2026DH000001", sei=_SEI_PADRAO)
    _escrever_linha_controle(planilha, 3, dh="2026DH000002", sei=_SEI_PADRAO)

    resultado = controle_dimcac_por_dh(planilha)

    assert resultado.por_dh["2026DH000001"][0].sei == _SEI_PADRAO
    assert resultado.por_dh["2026DH000002"][0].sei == _SEI_PADRAO
    assert resultado.total_linhas == 2


# --- 4. Mesmo SEI -> mesmo DH ---------------------------------------------


def test_mesmo_sei_repetido_no_mesmo_dh_sobrevive_nas_duas_linhas():
    _, planilha = _nova_planilha()
    _escrever_linha_controle(planilha, 2, dh=_DH_PADRAO, sei=_SEI_PADRAO, cpf=11111111111)
    _escrever_linha_controle(planilha, 3, dh=_DH_PADRAO, sei=_SEI_PADRAO, cpf=22222222222)

    resultado = controle_dimcac_por_dh(planilha)

    registros = resultado.por_dh[_DH_PADRAO]
    assert len(registros) == 2
    assert [r.sei for r in registros] == [_SEI_PADRAO, _SEI_PADRAO]
    assert {r.cpf for r in registros} == {"11111111111", "22222222222"}


# --- 5. Valores divergentes no mesmo DH -----------------------------------


def test_valores_divergentes_no_mesmo_dh_sao_preservados():
    _, planilha = _nova_planilha()
    _escrever_linha_controle(
        planilha, 2, dh=_DH_PADRAO, sei="19.20.0001.0000001/2026-01", valor_diarias=801.25
    )
    _escrever_linha_controle(
        planilha, 3, dh=_DH_PADRAO, sei="19.20.0001.0000002/2026-02", valor_diarias=0.60
    )

    resultado = controle_dimcac_por_dh(planilha)

    valores = {r.valor_total_diarias for r in resultado.por_dh[_DH_PADRAO]}
    assert valores == {801.25, 0.60}


# --- 6. Trechos divergentes no mesmo DH -----------------------------------


def test_trechos_divergentes_no_mesmo_dh_sao_preservados():
    _, planilha = _nova_planilha()
    _escrever_linha_controle(
        planilha, 2, dh=_DH_PADRAO, sei="19.20.0001.0000001/2026-01", trecho="RECIFE - GARANHUNS"
    )
    _escrever_linha_controle(
        planilha, 3, dh=_DH_PADRAO, sei="19.20.0001.0000002/2026-02", trecho="RECIFE - ARCOVERDE"
    )

    resultado = controle_dimcac_por_dh(planilha)

    trechos = {r.trecho for r in resultado.por_dh[_DH_PADRAO]}
    assert trechos == {"RECIFE - GARANHUNS", "RECIFE - ARCOVERDE"}


# --- 7. SEI malformado -----------------------------------------------------


def test_sei_malformado_e_classificado_e_linha_e_preservada():
    _, planilha = _nova_planilha()
    _escrever_linha_controle(planilha, 2, sei="DIMOT")

    resultado = controle_dimcac_por_dh(planilha)

    registro = resultado.por_dh[_DH_PADRAO][0]
    assert registro.sei == "DIMOT"
    assert registro.sei_classificacao is ClassificacaoSei.MALFORMADO
    assert any("SEI malformado" in aviso.motivo for aviso in resultado.avisos)


# --- 8. SEI ausente com DH presente ----------------------------------------


def test_sei_ausente_com_dh_presente_preserva_a_linha():
    _, planilha = _nova_planilha()
    _escrever_linha_controle(planilha, 2, sei="")

    resultado = controle_dimcac_por_dh(planilha)

    assert _DH_PADRAO in resultado.por_dh
    registro = resultado.por_dh[_DH_PADRAO][0]
    assert registro.sei is None
    assert registro.sei_classificacao is ClassificacaoSei.AUSENTE


# --- 9. Linha totalmente vazia ignorada explicitamente ----------------------


def test_linha_totalmente_vazia_e_ignorada_e_contabilizada():
    _, planilha = _nova_planilha()
    _escrever_linha_controle(planilha, 2, dh=None, sei="", cpf=None)

    resultado = controle_dimcac_por_dh(planilha)

    assert resultado.por_dh == {}
    assert resultado.linhas_vazias_ignoradas == 1
    assert resultado.linhas_sem_dh == 0
    assert resultado.total_linhas == 1


def test_linha_sem_dh_mas_com_sei_ou_cpf_nao_e_tratada_como_vazia():
    """Diferente da linha realmente vazia: SEI e/ou CPF preenchido sem DH é
    diária ainda não paga (condição esperada) — não entra em `por_dh` (não
    há DH para agrupar), mas também não é contada como 'vazia ignorada'."""
    _, planilha = _nova_planilha()
    _escrever_linha_controle(planilha, 2, dh=None, sei=_SEI_PADRAO)

    resultado = controle_dimcac_por_dh(planilha)

    assert resultado.por_dh == {}
    assert resultado.linhas_sem_dh == 1
    assert resultado.linhas_vazias_ignoradas == 0
    assert resultado.total_linhas == 1


# --- 10. Nenhuma linha com DH preenchido é descartada -----------------------


def test_nenhuma_linha_com_dh_preenchido_e_descartada_mesmo_com_outros_campos_malformados():
    _, planilha = _nova_planilha()
    # DH preenchido, todo o resto malformado/ausente — a linha precisa
    # sobreviver mesmo assim (regra absoluta da Micro-sprint 3).
    planilha["A2"] = _DH_PADRAO
    planilha["B2"] = "texto solto sem formato de SEI"
    planilha["H2"] = "22/05/0206"  # data malformada (achado real documentado)
    planilha["I2"] = "não é data"
    planilha["J2"] = "RECIFE/GARANHUNS"  # trecho sem separador " - "
    planilha["P2"] = "DIMOT"  # valor não numérico (achado real documentado)

    resultado = controle_dimcac_por_dh(planilha)

    assert _DH_PADRAO in resultado.por_dh
    registro = resultado.por_dh[_DH_PADRAO][0]
    assert registro.dh == _DH_PADRAO
    assert registro.sei_classificacao is ClassificacaoSei.MALFORMADO
    assert registro.periodo_inicial is None
    assert registro.periodo_final is None
    assert registro.cidade_origem is None
    assert registro.valor_total_diarias is None
    assert resultado.linhas_vazias_ignoradas == 0
    assert resultado.linhas_sem_dh == 0
    # Todas as anomalias viram evidência (avisos), nenhuma some em silêncio.
    assert len(resultado.avisos) >= 4


# --- 11. Integração com reconciliar() ---------------------------------------


def test_integracao_com_reconciliar_preserva_multiplas_linhas_de_controle():
    _, planilha_controle = _nova_planilha()
    _escrever_linha_controle(planilha_controle, 2, sei="19.20.0001.0000001/2026-01")
    _escrever_linha_controle(planilha_controle, 3, sei="19.20.0001.0000002/2026-02")
    resultado_controle = controle_dimcac_por_dh(planilha_controle)

    workbook_ob = Workbook()
    planilha_ob = workbook_ob.active
    planilha_ob.title = "Sheet1"
    planilha_ob.append(
        [
            "DH",
            "OB",
            "SITUAÇÃO",
            "DATA OB",
            "SEI",
            "CPF",
            "NOME",
            "CARGO",
            "PERÍODO INICIAL",
            "PERÍODO FINAL",
            "TRECHO",
            "TRANSPORTE",
            "MOTIVO",
            "VALOR DA DIÁRIA",
            "RESTITUIÇÃO",
            "DUPLICIDADE",
            "ITEM DE GASTO",
        ]
    )
    planilha_ob.append(
        [
            _DH_PADRAO,
            "2026OB000001",
            "Paga",
            "12/05/2026 08:38:14",
            _SEI_PADRAO,
            11111111111,
            "FULANO DE TAL",
            "Cargo Teste",
            date(2026, 1, 8),
            date(2026, 1, 10),
            "RECIFE - GARANHUNS",
            "CARRO",
            "Motivo de teste",
            801.25,
            None,
            "Único",
            "33901401",
        ]
    )
    resultado_ob = ordens_bancarias_por_dh(planilha_ob)

    resultado = reconciliar(resultado_controle.por_dh, resultado_ob.por_dh)

    documento = resultado.documentos[_DH_PADRAO]
    assert len(documento.controle) == 2
    assert len(documento.ordens_bancarias) == 1


# --- 12. 1 DH -> N OBs continua preservado (via reconciliar) ----------------


def test_um_dh_para_n_obs_continua_preservado_apos_integracao():
    _, planilha_controle = _nova_planilha()
    _escrever_linha_controle(planilha_controle, 2)
    resultado_controle = controle_dimcac_por_dh(planilha_controle)

    ordens_por_dh = {
        _DH_PADRAO: [
            _ob_generica(ob="2026OB900001", valor=801.25),
            _ob_generica(ob="2026OB900002", valor=0.60),
        ]
    }

    resultado = reconciliar(resultado_controle.por_dh, ordens_por_dh)

    documento = resultado.documentos[_DH_PADRAO]
    assert len(documento.controle) == 1
    assert {ob.ob for ob in documento.ordens_bancarias} == {"2026OB900001", "2026OB900002"}


# --- 13. Micro-sprint 3F — Nº Diárias Integral/Parcial (N/O) ---------------
# Fonte real confirmada empiricamente contra o relatório histórico real:
# Controle DIMCAC colunas N ("QUANT. DIÁRIA INTEGRAL") e O ("QUANT. DIÁRIA
# PARCIAL") — nunca recalculadas, só lidas (mesma filosofia de
# `valor_total_diarias`).


def test_quantidade_diaria_integral_e_parcial_lidas_da_planilha():
    _, planilha = _nova_planilha()
    _escrever_linha_controle(planilha, 2, quantidade_integral=3, quantidade_parcial=1)

    resultado = controle_dimcac_por_dh(planilha)

    registro = resultado.por_dh[_DH_PADRAO][0]
    assert registro.quantidade_diaria_integral == 3
    assert registro.quantidade_diaria_parcial == 1


def test_quantidade_diaria_zero_e_legitima_nunca_vira_none():
    _, planilha = _nova_planilha()
    _escrever_linha_controle(planilha, 2, quantidade_integral=0, quantidade_parcial=1)

    resultado = controle_dimcac_por_dh(planilha)

    registro = resultado.por_dh[_DH_PADRAO][0]
    assert registro.quantidade_diaria_integral == 0
    assert registro.quantidade_diaria_parcial == 1


def test_quantidade_diaria_ausente_vira_none_nunca_zero_adivinhado():
    _, planilha = _nova_planilha()
    _escrever_linha_controle(planilha, 2)  # N/O não preenchidos

    resultado = controle_dimcac_por_dh(planilha)

    registro = resultado.por_dh[_DH_PADRAO][0]
    assert registro.quantidade_diaria_integral is None
    assert registro.quantidade_diaria_parcial is None


def test_quantidade_diaria_com_texto_nao_numerico_vira_none():
    _, planilha = _nova_planilha()
    _escrever_linha_controle(planilha, 2)
    planilha["N2"] = "-"
    planilha["O2"] = "N/A"

    resultado = controle_dimcac_por_dh(planilha)

    registro = resultado.por_dh[_DH_PADRAO][0]
    assert registro.quantidade_diaria_integral is None
    assert registro.quantidade_diaria_parcial is None


def test_quantidade_diaria_como_texto_numerico_e_convertida():
    _, planilha = _nova_planilha()
    _escrever_linha_controle(planilha, 2)
    planilha["N2"] = "2"
    planilha["O2"] = "1"

    resultado = controle_dimcac_por_dh(planilha)

    registro = resultado.por_dh[_DH_PADRAO][0]
    assert registro.quantidade_diaria_integral == 2
    assert registro.quantidade_diaria_parcial == 1


def _ob_generica(*, ob, valor):
    from app.domain.entities.ordem_bancaria import OrdemBancaria

    return OrdemBancaria(
        linha=2,
        dh=_DH_PADRAO,
        ob=ob,
        credor="FULANO DE TAL",
        situacao="Paga",
        data_pagamento=None,
        sei=_SEI_PADRAO,
        cpf="11111111111",
        nome="FULANO DE TAL",
        cargo="Cargo de Teste",
        periodo_inicial=date(2026, 1, 8),
        periodo_final=date(2026, 1, 10),
        cidade_origem="RECIFE",
        cidade_destino="GARANHUNS",
        transporte="CARRO",
        motivo="Motivo de teste",
        valor=valor,
        valor_bruto_sem_formula=valor,
        restituicao=None,
        duplicidade="Único",
        item_de_gasto="33901401",
    )
