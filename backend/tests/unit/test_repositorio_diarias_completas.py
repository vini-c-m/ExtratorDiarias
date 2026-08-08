from datetime import date

from openpyxl import Workbook

from app.consulta.repositorio_diarias import diarias_completas

_SEI_PADRAO = "19.20.0001.0000001/2026-01"


def _nova_planilha():
    workbook = Workbook()
    planilha = workbook.active
    planilha.title = "Controle de Diárias"
    return workbook, planilha


def _escrever_linha_diaria(
    planilha,
    linha,
    *,
    sei=_SEI_PADRAO,
    doc_origem="PJTESTE",
    cpf=11111111111,
    periodo_inicial=date(2026, 1, 8),
    periodo_final=date(2026, 1, 10),
    trecho="RECIFE - GARANHUNS",
    motivo="Motivo de teste",
    transporte="CARRO",
    valor_diarias=None,
    dh=None,
):
    if dh is not None:
        planilha[f"A{linha}"] = dh
    planilha[f"B{linha}"] = sei
    planilha[f"C{linha}"] = doc_origem
    planilha[f"D{linha}"] = cpf
    planilha[f"H{linha}"] = periodo_inicial
    planilha[f"I{linha}"] = periodo_final
    planilha[f"J{linha}"] = trecho
    planilha[f"K{linha}"] = transporte
    planilha[f"L{linha}"] = motivo
    if valor_diarias is not None:
        planilha[f"P{linha}"] = valor_diarias


def test_diarias_completas_le_registro_bem_formado():
    _, planilha = _nova_planilha()
    _escrever_linha_diaria(planilha, 2)

    resultado = diarias_completas(planilha)

    assert _SEI_PADRAO in resultado.diarias
    registro = resultado.diarias[_SEI_PADRAO]
    assert registro.linha == 2
    assert registro.cpf == "11111111111"
    assert registro.cidade_origem == "RECIFE"
    assert registro.cidade_destino == "GARANHUNS"
    assert registro.motivo == "Motivo de teste"
    assert registro.transporte == "CARRO"
    assert registro.valor_total_diarias is None
    assert resultado.linhas_ignoradas == 0
    assert resultado.avisos == []


def test_diarias_completas_sei_vazio_gera_aviso_e_ignora_linha():
    _, planilha = _nova_planilha()
    _escrever_linha_diaria(planilha, 2, sei="")

    resultado = diarias_completas(planilha)

    assert resultado.diarias == {}
    assert resultado.linhas_ignoradas == 1
    assert "SEI ausente" in resultado.avisos[0].motivo


def test_diarias_completas_sei_duplicado_mantem_primeira_ocorrencia():
    _, planilha = _nova_planilha()
    _escrever_linha_diaria(planilha, 2, sei=_SEI_PADRAO, cpf=11111111111)
    _escrever_linha_diaria(planilha, 3, sei=_SEI_PADRAO, cpf=22222222222)

    resultado = diarias_completas(planilha)

    assert len(resultado.diarias) == 1
    assert resultado.diarias[_SEI_PADRAO].cpf == "11111111111"
    assert resultado.linhas_ignoradas == 1
    assert "SEI duplicado" in resultado.avisos[0].motivo


def test_diarias_completas_trecho_malformado_mantem_linha_com_aviso():
    _, planilha = _nova_planilha()
    _escrever_linha_diaria(planilha, 2, trecho="RECIFE/GARANHUNS")

    resultado = diarias_completas(planilha)

    assert _SEI_PADRAO in resultado.diarias
    registro = resultado.diarias[_SEI_PADRAO]
    assert registro.cidade_origem is None
    assert registro.cidade_destino is None
    assert resultado.linhas_ignoradas == 0  # linha mantida, não descartada
    assert any("Trecho não separável" in aviso.motivo for aviso in resultado.avisos)


# --- Sprint 19.10 — achado da homologação com a Planilha Oficial real:
# hífen sem espaço ao redor (dado histórico digitado manualmente, nunca
# escrito por este sistema) precisa ser reconhecido quando inequívoco (um
# único hífen no texto inteiro), mas 2+ hífens continuam "não separável"
# (nunca uma adivinhação de qual segmento é origem/destino). -------------


def test_diarias_completas_trecho_com_hifen_sem_espaco_e_reconhecido():
    _, planilha = _nova_planilha()
    _escrever_linha_diaria(planilha, 2, trecho="RECIFE-FORTALEZA")

    resultado = diarias_completas(planilha)

    registro = resultado.diarias[_SEI_PADRAO]
    assert registro.cidade_origem == "RECIFE"
    assert registro.cidade_destino == "FORTALEZA"
    assert resultado.avisos == []


def test_diarias_completas_trecho_com_hifen_espaco_assimetrico_e_reconhecido():
    _, planilha = _nova_planilha()
    _escrever_linha_diaria(planilha, 2, trecho="RECIFE- SANHARO")

    resultado = diarias_completas(planilha)

    registro = resultado.diarias[_SEI_PADRAO]
    assert registro.cidade_origem == "RECIFE"
    assert registro.cidade_destino == "SANHARO"


def test_diarias_completas_trecho_com_dois_hifens_permanece_nao_separavel():
    """Caso genuinamente ambíguo (ex. "RECIFE-JOAO PESSOA-PB", real na
    planilha oficial) — nunca adivinha qual segmento é origem/destino
    entre 3+, mesmo critério já usado para o separador `" - "`."""
    _, planilha = _nova_planilha()
    _escrever_linha_diaria(planilha, 2, trecho="RECIFE-GRAVATA-BEZERROS")

    resultado = diarias_completas(planilha)

    registro = resultado.diarias[_SEI_PADRAO]
    assert registro.cidade_origem is None
    assert registro.cidade_destino is None
    assert any("Trecho não separável" in aviso.motivo for aviso in resultado.avisos)


def test_diarias_completas_sem_trecho_nao_gera_aviso():
    _, planilha = _nova_planilha()
    _escrever_linha_diaria(planilha, 2, trecho="")

    resultado = diarias_completas(planilha)

    registro = resultado.diarias[_SEI_PADRAO]
    assert registro.cidade_origem is None
    assert registro.cidade_destino is None
    assert resultado.avisos == []


def test_diarias_completas_valor_numerico_direto():
    _, planilha = _nova_planilha()
    _escrever_linha_diaria(planilha, 2, valor_diarias=652.96)

    resultado = diarias_completas(planilha)

    assert resultado.diarias[_SEI_PADRAO].valor_total_diarias == 652.96


def test_diarias_completas_valor_texto_formato_brasileiro():
    _, planilha = _nova_planilha()
    _escrever_linha_diaria(planilha, 2, valor_diarias="652,96")

    resultado = diarias_completas(planilha)

    assert resultado.diarias[_SEI_PADRAO].valor_total_diarias == 652.96


# --- URGENTE — Central Analítica (2026-08-06): achados reais da auditoria
# de integridade financeira. `_valor_como_numero` cobria só o formato
# brasileiro puro (`"652,96"`); a Planilha Oficial real tem 3 linhas com o
# símbolo da moeda também no texto (`"R$ 154,09"`) e 1 linha com texto sem
# relação nenhuma com valor (`"DIMOT"`, provavelmente colado por engano de
# outra coluna) — os dois casos precisam de cobertura permanente. -------


def test_diarias_completas_valor_texto_com_prefixo_moeda():
    _, planilha = _nova_planilha()
    _escrever_linha_diaria(planilha, 2, valor_diarias="R$ 154,09")

    resultado = diarias_completas(planilha)

    assert resultado.diarias[_SEI_PADRAO].valor_total_diarias == 154.09


def test_diarias_completas_valor_texto_nao_numerico_permanece_none():
    _, planilha = _nova_planilha()
    _escrever_linha_diaria(planilha, 2, valor_diarias="DIMOT")

    resultado = diarias_completas(planilha)

    assert resultado.diarias[_SEI_PADRAO].valor_total_diarias is None


def test_diarias_completas_valor_como_texto_de_formula_nunca_e_interpretado_como_numero():
    """Reproduz o que `openpyxl` devolve para uma célula de fórmula quando
    o workbook é aberto sem `data_only=True` (a causa raiz do achado real
    desta auditoria, corrigida em `app/consulta/base_local.py`): o texto
    cru da fórmula (`"=R2+S2"`), nunca o valor calculado. Mesmo com `R`/`S`
    presentes na fórmula, o parser nunca deve tentar interpretar esse
    texto como número — ele não é decifrável sem executar a fórmula, e
    "inventar" o cálculo aqui violaria a regra de nunca estimar valor
    (quem resolve a fórmula é o Excel, nunca este parser)."""
    _, planilha = _nova_planilha()
    _escrever_linha_diaria(planilha, 2, valor_diarias="=R2+S2")

    resultado = diarias_completas(planilha)

    assert resultado.diarias[_SEI_PADRAO].valor_total_diarias is None


def test_diarias_completas_periodo_invalido_gera_aviso_e_ignora_linha():
    _, planilha = _nova_planilha()
    _escrever_linha_diaria(planilha, 2)
    planilha["I2"] = "22/05/0206"  # mesmo caso real já coberto em diarias_por_cpf

    resultado = diarias_completas(planilha)

    assert resultado.diarias == {}
    assert resultado.linhas_ignoradas == 1


def test_diarias_completas_cpf_ausente_gera_aviso_e_ignora_linha():
    _, planilha = _nova_planilha()
    _escrever_linha_diaria(planilha, 2, cpf=None)

    resultado = diarias_completas(planilha)

    assert resultado.diarias == {}
    assert resultado.linhas_ignoradas == 1
    assert "CPF ausente" in resultado.avisos[0].motivo


def test_diarias_completas_le_dh_preenchido():
    _, planilha = _nova_planilha()
    _escrever_linha_diaria(planilha, 2, dh="2026DH000100")

    resultado = diarias_completas(planilha)

    assert resultado.diarias[_SEI_PADRAO].dh == "2026DH000100"


def test_diarias_completas_dh_vazio_fica_none_sem_gerar_aviso():
    """DH vazio é esperado (processo ainda não chegou à fase de
    liquidação) — nunca deve virar `AvisoLinhaIgnorada`."""
    _, planilha = _nova_planilha()
    _escrever_linha_diaria(planilha, 2)  # dh não informado — célula A permanece vazia

    resultado = diarias_completas(planilha)

    assert resultado.diarias[_SEI_PADRAO].dh is None
    assert resultado.avisos == []
