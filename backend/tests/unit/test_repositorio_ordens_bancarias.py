from datetime import date, datetime

import pytest
from openpyxl import Workbook

from app.consulta.repositorio_ordens_bancarias import (
    OrdensBancariasEstruturalmenteInvalida,
    ordens_bancarias_por_dh,
    validar_estrutura,
)

_CABECALHO = [
    "DH",
    "CREDOR",
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
    "BRUTO SEM FORMULA",
]

_DH_PADRAO = "2026DH000001"
_OB_PADRAO = "2026OB000001"


def _nova_planilha(cabecalho: list[str] | None = None):
    workbook = Workbook()
    planilha = workbook.active
    planilha.title = "Sheet1"
    planilha.append(cabecalho if cabecalho is not None else _CABECALHO)
    return workbook, planilha


def _escrever_linha_ob(
    planilha,
    linha,
    *,
    dh=_DH_PADRAO,
    credor="FULANO DE TAL",
    ob=_OB_PADRAO,
    situacao="Paga",
    data_ob="12/05/2026 08:38:14",
    sei="19.20.0001.0000001/2026-01",
    cpf=11111111111,
    nome="FULANO DE TAL",
    cargo="Cargo de Teste",
    periodo_inicial=date(2026, 5, 13),
    periodo_final=date(2026, 5, 16),
    trecho="RECIFE - GARANHUNS",
    transporte="CARRO",
    motivo="Motivo de teste",
    valor=154.09,
    restituicao=None,
    duplicidade="Único",
    item_de_gasto="33901401",
    bruto_sem_formula=None,
):
    linha_valores = {
        "DH": dh,
        "CREDOR": credor,
        "OB": ob,
        "SITUAÇÃO": situacao,
        "DATA OB": data_ob,
        "SEI": sei,
        "CPF": cpf,
        "NOME": nome,
        "CARGO": cargo,
        "PERÍODO INICIAL": periodo_inicial,
        "PERÍODO FINAL": periodo_final,
        "TRECHO": trecho,
        "TRANSPORTE": transporte,
        "MOTIVO": motivo,
        "VALOR DA DIÁRIA": valor,
        "RESTITUIÇÃO": restituicao,
        "DUPLICIDADE": duplicidade,
        "ITEM DE GASTO": item_de_gasto,
        "BRUTO SEM FORMULA": bruto_sem_formula,
    }
    for coluna_idx, rotulo in enumerate(_CABECALHO, start=1):
        planilha.cell(row=linha, column=coluna_idx, value=linha_valores.get(rotulo))


# --- 1. Base OB válida --------------------------------------------------


def test_linha_bem_formada_e_lida_corretamente():
    _, planilha = _nova_planilha()
    _escrever_linha_ob(planilha, 2)

    resultado = ordens_bancarias_por_dh(planilha)

    assert _DH_PADRAO in resultado.por_dh
    registros = resultado.por_dh[_DH_PADRAO]
    assert len(registros) == 1
    registro = registros[0]
    assert registro.linha == 2
    assert registro.ob == _OB_PADRAO
    assert registro.credor == "FULANO DE TAL"
    assert registro.situacao == "Paga"
    assert registro.data_pagamento == datetime(2026, 5, 12, 8, 38, 14)
    assert registro.sei == "19.20.0001.0000001/2026-01"
    assert registro.cpf == "11111111111"
    assert registro.nome == "FULANO DE TAL"
    assert registro.cargo == "Cargo de Teste"
    assert registro.periodo_inicial == date(2026, 5, 13)
    assert registro.periodo_final == date(2026, 5, 16)
    assert registro.cidade_origem == "RECIFE"
    assert registro.cidade_destino == "GARANHUNS"
    assert registro.transporte == "CARRO"
    assert registro.motivo == "Motivo de teste"
    assert registro.valor == 154.09
    assert registro.restituicao is None
    assert registro.duplicidade == "Único"
    assert registro.item_de_gasto == "33901401"
    assert resultado.linhas_ignoradas == 0
    assert resultado.avisos == []


# --- 2. DH com múltiplas OBs (1 DH -> N OBs preservado) -----------------


def test_dh_com_multiplas_obs_preserva_as_duas_linhas():
    _, planilha = _nova_planilha()
    _escrever_linha_ob(planilha, 2, ob="2026OB000001", valor=801.25)
    _escrever_linha_ob(planilha, 3, ob="2026OB000002", valor=0.60)

    resultado = ordens_bancarias_por_dh(planilha)

    registros = resultado.por_dh[_DH_PADRAO]
    assert len(registros) == 2
    assert [r.ob for r in registros] == ["2026OB000001", "2026OB000002"]
    assert [r.valor for r in registros] == [801.25, 0.60]


def test_mesma_ob_repetida_para_o_mesmo_dh_nao_e_deduplicada():
    """R04 (deduplicar por campo DUPLICIDADE) é responsabilidade do motor de
    reconciliação, ainda não implementado — esta leitura nunca decide qual
    linha manter, sempre preserva as duas."""
    _, planilha = _nova_planilha()
    _escrever_linha_ob(planilha, 2, ob=_OB_PADRAO, duplicidade="Único")
    _escrever_linha_ob(planilha, 3, ob=_OB_PADRAO, duplicidade="Duplicado")

    resultado = ordens_bancarias_por_dh(planilha)

    assert len(resultado.por_dh[_DH_PADRAO]) == 2
    assert resultado.linhas_ignoradas == 0


# --- 3. Valor monetário normal -------------------------------------------


def test_valor_numerico_direto():
    _, planilha = _nova_planilha()
    _escrever_linha_ob(planilha, 2, valor=652.96)

    resultado = ordens_bancarias_por_dh(planilha)

    assert resultado.por_dh[_DH_PADRAO][0].valor == 652.96


# --- 4. Valor armazenado como texto (achados reais da auditoria) --------


def test_valor_texto_formato_brasileiro():
    _, planilha = _nova_planilha()
    _escrever_linha_ob(planilha, 2, valor="652,96")

    resultado = ordens_bancarias_por_dh(planilha)

    assert resultado.por_dh[_DH_PADRAO][0].valor == 652.96
    assert resultado.avisos == []


def test_valor_texto_com_prefixo_moeda():
    _, planilha = _nova_planilha()
    _escrever_linha_ob(planilha, 2, valor="R$ 154,09")

    resultado = ordens_bancarias_por_dh(planilha)

    assert resultado.por_dh[_DH_PADRAO][0].valor == 154.09


def test_valor_texto_nao_numerico_gera_aviso_mas_mantem_linha():
    """Achado real da auditoria: texto de outra coluna colado por engano na
    célula de valor ('DIMOT') — a linha continua em `por_dh` (DH/OB
    presentes), só o campo valor fica `None`, com aviso registrado."""
    _, planilha = _nova_planilha()
    _escrever_linha_ob(planilha, 2, valor="DIMOT")

    resultado = ordens_bancarias_por_dh(planilha)

    assert _DH_PADRAO in resultado.por_dh
    assert resultado.por_dh[_DH_PADRAO][0].valor is None
    assert resultado.linhas_ignoradas == 0
    assert any("Valor da diária" in aviso.motivo and "DIMOT" in aviso.motivo for aviso in resultado.avisos)


# --- 5. CPF ---------------------------------------------------------------


def test_cpf_numerico_normalizado_com_zero_a_esquerda():
    _, planilha = _nova_planilha()
    _escrever_linha_ob(planilha, 2, cpf=1234567890)  # 10 dígitos — zero à esquerda perdido no Excel

    resultado = ordens_bancarias_por_dh(planilha)

    assert resultado.por_dh[_DH_PADRAO][0].cpf == "01234567890"


def test_cpf_texto_com_pontuacao_normalizado():
    _, planilha = _nova_planilha()
    _escrever_linha_ob(planilha, 2, cpf="111.111.111-11")

    resultado = ordens_bancarias_por_dh(planilha)

    assert resultado.por_dh[_DH_PADRAO][0].cpf == "11111111111"


def test_cpf_ausente_fica_none_sem_derrubar_a_linha():
    _, planilha = _nova_planilha()
    _escrever_linha_ob(planilha, 2, cpf=None)

    resultado = ordens_bancarias_por_dh(planilha)

    assert resultado.por_dh[_DH_PADRAO][0].cpf is None
    assert resultado.linhas_ignoradas == 0


# --- 6. Datas ---------------------------------------------------------------


def test_data_pagamento_texto_dd_mm_aaaa_hh_mm_ss():
    _, planilha = _nova_planilha()
    _escrever_linha_ob(planilha, 2, data_ob="20/07/2026 14:15:49")

    resultado = ordens_bancarias_por_dh(planilha)

    assert resultado.por_dh[_DH_PADRAO][0].data_pagamento == datetime(2026, 7, 20, 14, 15, 49)


def test_data_pagamento_malformada_fica_none_sem_derrubar_a_linha():
    _, planilha = _nova_planilha()
    _escrever_linha_ob(planilha, 2, data_ob="data invalida")

    resultado = ordens_bancarias_por_dh(planilha)

    assert resultado.por_dh[_DH_PADRAO][0].data_pagamento is None
    assert resultado.linhas_ignoradas == 0


def test_periodo_com_ano_corrompido_e_lido_tal_como_esta():
    """Achado real da auditoria (OB011648/DH003295): ano corrompido em
    Base OB vem como `datetime` de verdade, só com o ano implausível — esta
    leitura não julga plausibilidade (isso é R06, do motor de
    reconciliação), só representa o dado tal como está."""
    _, planilha = _nova_planilha()
    _escrever_linha_ob(planilha, 2, periodo_final=datetime(206, 5, 22))

    resultado = ordens_bancarias_por_dh(planilha)

    assert resultado.por_dh[_DH_PADRAO][0].periodo_final == date(206, 5, 22)
    assert resultado.avisos == []


# --- 7. Restituição ---------------------------------------------------------


def test_restituicao_numerica():
    _, planilha = _nova_planilha()
    _escrever_linha_ob(planilha, 2, valor=0, restituicao=154.09)

    resultado = ordens_bancarias_por_dh(planilha)

    registro = resultado.por_dh[_DH_PADRAO][0]
    assert registro.valor == 0
    assert registro.restituicao == 154.09


def test_restituicao_texto_nao_numerico_gera_aviso_mas_mantem_linha():
    _, planilha = _nova_planilha()
    _escrever_linha_ob(planilha, 2, restituicao="texto qualquer")

    resultado = ordens_bancarias_por_dh(planilha)

    assert _DH_PADRAO in resultado.por_dh
    assert resultado.por_dh[_DH_PADRAO][0].restituicao is None
    assert any("Restituição" in aviso.motivo for aviso in resultado.avisos)


def test_restituicao_ausente_fica_none_sem_aviso():
    _, planilha = _nova_planilha()
    _escrever_linha_ob(planilha, 2, restituicao=None)

    resultado = ordens_bancarias_por_dh(planilha)

    assert resultado.por_dh[_DH_PADRAO][0].restituicao is None
    assert resultado.avisos == []


def test_restituicao_com_traco_placeholder_da_fonte_fica_none_sem_aviso():
    """Achado real da auditoria: a Base OB usa o traço isolado ('-') como
    convenção própria da fonte para "não se aplica" em ~1800 das linhas
    reais — não pode gerar um aviso por linha (ruído, não sinal)."""
    _, planilha = _nova_planilha()
    _escrever_linha_ob(planilha, 2, restituicao="-")

    resultado = ordens_bancarias_por_dh(planilha)

    assert resultado.por_dh[_DH_PADRAO][0].restituicao is None
    assert resultado.avisos == []


# --- 8. DUPLICIDADE (a Base OB não tem coluna AVISO — só o Controle de
# Diárias tem; ver docstring do módulo/relatório da Micro-sprint) ----------


def test_duplicidade_e_preservada_tal_como_esta_sem_interpretacao():
    _, planilha = _nova_planilha()
    _escrever_linha_ob(planilha, 2, duplicidade="Duplicado")

    resultado = ordens_bancarias_por_dh(planilha)

    assert resultado.por_dh[_DH_PADRAO][0].duplicidade == "Duplicado"
    assert resultado.linhas_ignoradas == 0  # nunca filtra por esse campo nesta camada


# --- 9. Célula malformada (trecho) ------------------------------------------


def test_trecho_nao_separavel_mantem_linha_com_aviso():
    _, planilha = _nova_planilha()
    _escrever_linha_ob(planilha, 2, trecho="RECIFE/GARANHUNS")

    resultado = ordens_bancarias_por_dh(planilha)

    registro = resultado.por_dh[_DH_PADRAO][0]
    assert registro.cidade_origem is None
    assert registro.cidade_destino is None
    assert resultado.linhas_ignoradas == 0
    assert any("Trecho não separável" in aviso.motivo for aviso in resultado.avisos)


# --- 10. Coluna obrigatória ausente -----------------------------------------


def test_coluna_obrigatoria_ausente_levanta_erro_explicito():
    cabecalho_incompleto = [c for c in _CABECALHO if c != "RESTITUIÇÃO"]
    _, planilha = _nova_planilha(cabecalho_incompleto)

    with pytest.raises(OrdensBancariasEstruturalmenteInvalida, match="RESTITUIÇÃO"):
        validar_estrutura(planilha)

    with pytest.raises(OrdensBancariasEstruturalmenteInvalida):
        ordens_bancarias_por_dh(planilha)


def test_cabecalho_com_espacamento_inconsistente_e_reconhecido():
    """Achado real da auditoria: o mesmo arquivo real tem
    'QUANT. DIÁRIA INTEGRAL' (com espaço) e 'QUANT.DIÁRIA PARCIAL' (sem
    espaço) — aqui simulado com RESTITUIÇÃO/ITEM DE GASTO grafados com
    espaçamento diferente do canônico, para confirmar que a normalização de
    cabeçalho (`_chave_cabecalho`) absorve a diferença."""
    cabecalho_variante = [
        "  RESTITUIÇÃO  " if c == "RESTITUIÇÃO" else c for c in _CABECALHO
    ]
    _, planilha = _nova_planilha(cabecalho_variante)
    _escrever_linha_ob(planilha, 2)

    validar_estrutura(planilha)  # não levanta


# --- 11. Linha problemática nunca some silenciosamente ----------------------


def test_dh_ausente_gera_aviso_e_e_a_unica_linha_ignorada():
    _, planilha = _nova_planilha()
    _escrever_linha_ob(planilha, 2, dh=None)
    _escrever_linha_ob(planilha, 3, dh="2026DH000002")

    resultado = ordens_bancarias_por_dh(planilha)

    assert resultado.linhas_ignoradas == 1
    assert "DH ausente" in resultado.avisos[0].motivo
    assert resultado.avisos[0].linha == 2
    assert "2026DH000002" in resultado.por_dh  # a linha válida continua presente


def test_ob_ausente_gera_aviso_e_ignora_a_linha():
    _, planilha = _nova_planilha()
    _escrever_linha_ob(planilha, 2, ob=None)

    resultado = ordens_bancarias_por_dh(planilha)

    assert resultado.por_dh == {}
    assert resultado.linhas_ignoradas == 1
    assert "OB ausente" in resultado.avisos[0].motivo
