"""P0 FINAL (2026-08-09) — preparação estrutural automática da Planilha
Oficial, ANTES de qualquer gravação (`escritor_planilha._preparar_estrutura_
futura`). Causa raiz real do Complemento inoperante: `CategoriaResultado.
LINHA_SEM_FORMULAS_NECESSARIAS` sem rótulo em `pasta_resultados._ROTULO_
CATEGORIA` (ver `test_pasta_resultados.py`) — a correção completa também
elimina, na origem, essa categoria como falha do dia a dia: em vez de
abortar um item quando a linha livre não tem N/P/R/S/V/Z/AA pré-copiados, o
sistema agora repara a estrutura automaticamente ANTES de gravar, em
QUALQUER fluxo (Padrão e Complemento), copiando (e traduzindo, como um
'arrastar fórmula' do Excel) da linha íntegra mais próxima acima.

Letras entre parênteses nos nomes dos testes referem-se à lista C-N/O/P do
pedido do usuário (A/B ficam em `test_pasta_resultados.py`; Q/R são cobertos
pelos testes já existentes de integridade financeira/Central Analítica, sem
necessidade de duplicar aqui)."""

import os
from datetime import date

import pytest
from openpyxl import Workbook, load_workbook

from app.domain.entities.diaria import Diaria
from app.domain.entities.modo_processamento import ModoProcessamento
from app.domain.entities.processo import Processo, StatusProcesso
from app.domain.entities.tipo_processo import TipoProcesso
from app.planilha.escritor_planilha import (
    EstruturaFuturaIndisponivel,
    preencher,
)

_CABECALHO = [
    "DH", "SEI", "DOC ORIGEM", "CPF", "PREVIDÊNCIA", "NOME", "CARGO",
    "PERÍODO INICIAL", "PERÍODO FINAL", "TRECHO", "TRANSPORTE", "MOTIVO",
    "VALOR DA PASSAGEM", "QUANT. DIÁRIA INTEGRAL", "QUANT. DIÁRIA PARCIAL",
    "VALOR TOTAL DAS DIÁRIAS", "LOCAL", "VALOR DAS DIÁRIAS INTEGRAIS",
    "VALOR DAS DIÁRIAS PARCIAIS", "DMTC", "DMOF", "PASSAR DIA",
    "RESTITUIÇÃO", "COMPROVANTES", "CONFIRMAÇÃO DE DIÁRIAS", "CONCATENAÇÃO",
    "AVISO ", "AVISO AUXILIAR",
]  # A..AB, mesma ordem real confirmada na Planilha Oficial


def _planilha_base(tmp_path, nome_arquivo="planilha.xlsx") -> str:
    workbook = Workbook()
    planilha = workbook.active
    planilha.title = "Controle de Diárias"
    planilha.append(_CABECALHO)
    workbook.create_sheet("Dados")
    tabela_valores = workbook.create_sheet("Tabela Valores")
    tabela_valores.append(["PERNAMBUCO", 308.19, 154.09])
    caminho = tmp_path / nome_arquivo
    workbook.save(caminho)
    return str(caminho)


def _escrever_linha_historica(
    caminho: str,
    linha: int,
    *,
    sei: str,
    cpf: int,
    formulas_completas: bool,
    sobrescrever_p_com_valor: float | None = None,
) -> None:
    """Monta uma linha "já existente" (histórica) na planilha — com ou sem
    as 7 fórmulas estruturais completas. `sobrescrever_p_com_valor` simula
    uma diária de MEMBRO que legitimamente sobrescreveu P com um número
    (mesmo achado real da auditoria: torna a linha um modelo inválido)."""
    workbook = load_workbook(caminho)
    planilha = workbook["Controle de Diárias"]
    planilha[f"B{linha}"] = sei
    planilha[f"C{linha}"] = "PJTESTE"
    planilha[f"D{linha}"] = cpf
    planilha[f"H{linha}"] = date(2026, 1, 8)
    planilha[f"I{linha}"] = date(2026, 1, 10)
    planilha[f"J{linha}"] = "ORIGEM-DESTINO"
    planilha[f"L{linha}"] = "Motivo histórico"
    planilha[f"Q{linha}"] = "PERNAMBUCO"
    if formulas_completas:
        planilha[f"N{linha}"] = f"=I{linha}-H{linha}"
        planilha[f"P{linha}"] = f"=R{linha}+S{linha}"
        planilha[f"R{linha}"] = (
            f"=(VLOOKUP(Q{linha},'Tabela Valores'!A:C,2,FALSE()))*N{linha}"
        )
        planilha[f"S{linha}"] = (
            f"=(VLOOKUP(Q{linha},'Tabela Valores'!A:C,3,FALSE()))*O{linha}"
        )
        planilha[f"V{linha}"] = f"=CONCATENATE(D{linha},H{linha},I{linha})"
        planilha[f"Z{linha}"] = f"=H{linha}-15"
        planilha[f"AA{linha}"] = f"=VLOOKUP(Z{linha},Z$1:AB{linha - 1},3,0)"
    if sobrescrever_p_com_valor is not None:
        planilha[f"P{linha}"] = sobrescrever_p_com_valor
    workbook.save(caminho)
    workbook.close()


def _diaria(sei: str, **overrides) -> Diaria:
    base = dict(
        sei=sei,
        doc_origem="PJNOVO",
        cpf="99999999999",
        periodo_inicial=date(2026, 3, 1),
        periodo_final=date(2026, 3, 3),
        cidade_origem="RECIFE",
        cidade_destino="OLINDA",
        motivo="Diligência de teste",
    )
    base.update(overrides)
    return Diaria(**base)


def _processo(diaria: Diaria, arquivo: str = "arquivo.pdf") -> Processo:
    return Processo(arquivo_origem=arquivo, status=StatusProcesso.SUCESSO, diaria=diaria)


# --- C) Linha imediatamente anterior íntegra → usada como modelo -----------


def test_c_linha_anterior_integra_e_usada_como_modelo(tmp_path):
    caminho = _planilha_base(tmp_path)
    _escrever_linha_historica(caminho, 2, sei="SEI-1", cpf=11111111111, formulas_completas=True)

    resultado = preencher(caminho, [_processo(_diaria("SEI-NOVO"))])

    assert resultado.total_gravado == 1
    workbook = load_workbook(caminho)
    planilha = workbook["Controle de Diárias"]
    assert planilha["N3"].value == "=I3-H3"
    assert planilha["P3"].value == "=R3+S3"
    assert planilha["Z3"].value == "=H3-15"
    assert planilha["AA3"].value == "=VLOOKUP(Z3,Z$1:AB2,3,0)"
    assert 3 in resultado.linhas_estrutura_reparadas


# --- D) Linha anterior é Membro com fórmula sobrescrita → rejeitada --------


def test_d_linha_anterior_membro_quebrada_e_rejeitada_busca_continua_acima(tmp_path):
    caminho = _planilha_base(tmp_path)
    _escrever_linha_historica(caminho, 2, sei="SEI-1", cpf=11111111111, formulas_completas=True)
    _escrever_linha_historica(
        caminho, 3, sei="SEI-2", cpf=22222222222,
        formulas_completas=True, sobrescrever_p_com_valor=500.00,
    )

    resultado = preencher(caminho, [_processo(_diaria("SEI-NOVO"))])

    assert resultado.total_gravado == 1
    workbook = load_workbook(caminho)
    planilha = workbook["Controle de Diárias"]
    # Se o modelo tivesse sido (erradamente) a linha 3, o deslocamento seria
    # 1, não 2 — a referência AB do intervalo de AA denuncia qual foi usada.
    assert planilha["AA4"].value == "=VLOOKUP(Z4,Z$1:AB3,3,0)"
    # A linha 3 (Membro, histórica) nunca é tocada.
    assert planilha["P3"].value == 500.00


# --- E) Linha válida várias linhas acima → tradução correta ----------------


def test_e_linha_valida_varias_linhas_acima_formulas_traduzidas(tmp_path):
    caminho = _planilha_base(tmp_path)
    _escrever_linha_historica(caminho, 2, sei="SEI-1", cpf=11111111111, formulas_completas=True)
    for linha, sei, cpf in ((3, "SEI-2", 22222222222), (4, "SEI-3", 33333333333)):
        _escrever_linha_historica(
            caminho, linha, sei=sei, cpf=cpf,
            formulas_completas=True, sobrescrever_p_com_valor=100.00 * linha,
        )

    resultado = preencher(caminho, [_processo(_diaria("SEI-NOVO"))])

    assert resultado.total_gravado == 1
    workbook = load_workbook(caminho)
    planilha = workbook["Controle de Diárias"]
    assert planilha["N5"].value == "=I5-H5"
    assert planilha["AA5"].value == "=VLOOKUP(Z5,Z$1:AB4,3,0)"  # deslocamento 3 a partir da linha 2


# --- F) Linha futura já correta → não tocar ---------------------------------


def test_f_linha_futura_ja_correta_nao_e_tocada(tmp_path):
    caminho = _planilha_base(tmp_path)
    _escrever_linha_historica(caminho, 2, sei="SEI-1", cpf=11111111111, formulas_completas=True)
    # Linha 3 (livre) já preparada de antemão, com uma fórmula
    # propositalmente DIFERENTE da que a tradução geraria — só para provar
    # que ela não é sobrescrita.
    workbook = load_workbook(caminho)
    planilha = workbook["Controle de Diárias"]
    for coluna in ("N", "P", "R", "S", "V", "Z", "AA"):
        planilha[f"{coluna}3"] = f"=1+{coluna}9999"
    workbook.save(caminho)
    workbook.close()

    resultado = preencher(caminho, [_processo(_diaria("SEI-NOVO"))])

    assert resultado.total_gravado == 1
    workbook = load_workbook(caminho)
    planilha = workbook["Controle de Diárias"]
    for coluna in ("N", "P", "R", "S", "V", "Z", "AA"):
        assert planilha[f"{coluna}3"].value == f"=1+{coluna}9999"
    assert 3 not in resultado.linhas_estrutura_reparadas


# --- G) Uma fórmula faltando → reparar somente ela --------------------------


def test_g_uma_formula_faltando_repara_somente_ela(tmp_path):
    caminho = _planilha_base(tmp_path)
    _escrever_linha_historica(caminho, 2, sei="SEI-1", cpf=11111111111, formulas_completas=True)
    workbook = load_workbook(caminho)
    planilha = workbook["Controle de Diárias"]
    for coluna in ("N", "P", "R", "S", "V", "AA"):  # tudo, MENOS Z
        planilha[f"{coluna}3"] = f"=MARCA{coluna}3"
    workbook.save(caminho)
    workbook.close()

    resultado = preencher(caminho, [_processo(_diaria("SEI-NOVO"))])

    assert resultado.total_gravado == 1
    workbook = load_workbook(caminho)
    planilha = workbook["Controle de Diárias"]
    for coluna in ("N", "P", "R", "S", "V", "AA"):
        assert planilha[f"{coluna}3"].value == f"=MARCA{coluna}3"  # intocadas
    assert planilha["Z3"].value == "=H3-15"  # única reparada
    assert 3 in resultado.linhas_estrutura_reparadas


# --- H/I/J) Margem permanente: lote + 20 ------------------------------------


@pytest.mark.parametrize(
    ("tamanho_lote", "faixa_esperada"),
    [(1, 21), (20, 40), (37, 57)],
)
def test_hij_margem_permanente_lote_mais_vinte(tmp_path, tamanho_lote, faixa_esperada):
    caminho = _planilha_base(tmp_path)
    _escrever_linha_historica(caminho, 2, sei="SEI-1", cpf=11111111111, formulas_completas=True)

    processos = [_processo(_diaria(f"SEI-NOVO-{i}")) for i in range(tamanho_lote)]
    resultado = preencher(caminho, processos)

    assert resultado.total_gravado == tamanho_lote
    workbook = load_workbook(caminho)
    planilha = workbook["Controle de Diárias"]
    ultima_linha_garantida = 2 + faixa_esperada  # linha 3 é a primeira livre
    assert isinstance(planilha[f"N{ultima_linha_garantida}"].value, str)
    assert planilha[f"N{ultima_linha_garantida}"].value.startswith("=")
    linha_alem_da_margem = ultima_linha_garantida + 1
    assert planilha[f"N{linha_alem_da_margem}"].value is None


# --- K) Lote grande → toda a faixa fica pronta antes da primeira gravação --


def test_k_lote_grande_toda_faixa_pronta_antes_da_primeira_gravacao(tmp_path):
    caminho = _planilha_base(tmp_path)
    _escrever_linha_historica(caminho, 2, sei="SEI-1", cpf=11111111111, formulas_completas=True)

    processos = [_processo(_diaria(f"SEI-NOVO-{i}")) for i in range(100)]
    resultado = preencher(caminho, processos)

    assert resultado.total_gravado == 100
    workbook = load_workbook(caminho)
    planilha = workbook["Controle de Diárias"]
    # 100 + 20 de margem, a partir da linha 3.
    for linha in range(3, 3 + 120):
        for coluna in ("N", "P", "R", "S", "V", "Z", "AA"):
            valor = planilha[f"{coluna}{linha}"].value
            assert isinstance(valor, str) and valor.startswith("=")


# --- L) Lote misto Membro + Servidor ----------------------------------------


def test_l_lote_misto_membro_servidor_continua_gravando_conforme_regras_atuais(tmp_path):
    caminho = _planilha_base(tmp_path)
    _escrever_linha_historica(caminho, 2, sei="SEI-1", cpf=11111111111, formulas_completas=True)

    diaria_membro = _diaria(
        "SEI-MEMBRO", tipo_processo=TipoProcesso.DIARIA_MEMBRO, valor_total_diarias="500,00"
    )
    diaria_servidor = _diaria("SEI-SERVIDOR")

    resultado = preencher(caminho, [_processo(diaria_membro), _processo(diaria_servidor)])

    assert resultado.total_gravado == 2
    workbook = load_workbook(caminho)
    planilha = workbook["Controle de Diárias"]
    assert planilha["P3"].value == 500.00  # Membro: valor literal, regra atual preservada
    assert planilha["P4"].value == "=R4+S4"  # Servidor: fórmula estrutural preparada


# --- M) Membro sobrescreve legitimamente fórmula durante preenchimento -----


def test_m_membro_sobrescreve_formula_preparada_comportamento_atual_preservado(tmp_path):
    caminho = _planilha_base(tmp_path)
    _escrever_linha_historica(caminho, 2, sei="SEI-1", cpf=11111111111, formulas_completas=True)
    diaria_membro = _diaria(
        "SEI-MEMBRO", tipo_processo=TipoProcesso.DIARIA_MEMBRO, valor_total_diarias="652,96"
    )

    resultado = preencher(caminho, [_processo(diaria_membro)])

    assert resultado.total_gravado == 1
    workbook = load_workbook(caminho)
    planilha = workbook["Controle de Diárias"]
    assert planilha["P3"].value == 652.96
    assert "R$" in planilha["P3"].number_format


# --- N) Nenhuma linha-modelo íntegra → aborta antes da primeira gravação ---


def test_n_nenhuma_linha_modelo_integra_aborta_antes_da_primeira_gravacao(tmp_path):
    caminho = _planilha_base(tmp_path)
    # Linha 2 existe mas está estruturalmente quebrada — nenhuma linha
    # íntegra em lugar nenhum da planilha.
    _escrever_linha_historica(caminho, 2, sei="SEI-1", cpf=11111111111, formulas_completas=False)
    mtime_antes = os.path.getmtime(caminho)

    with pytest.raises(EstruturaFuturaIndisponivel):
        preencher(caminho, [_processo(_diaria("SEI-NOVO"))])

    mtime_depois = os.path.getmtime(caminho)
    assert mtime_antes == mtime_depois  # nada foi salvo — abortou antes de qualquer gravação
    workbook = load_workbook(caminho)
    planilha = workbook["Controle de Diárias"]
    assert planilha["B3"].value is None  # nenhuma linha nova foi criada


def test_n_planilha_totalmente_vazia_tambem_aborta(tmp_path):
    caminho = _planilha_base(tmp_path)  # nenhuma linha de dado — só cabeçalho

    with pytest.raises(EstruturaFuturaIndisponivel):
        preencher(caminho, [_processo(_diaria("SEI-NOVO"))])


# --- O/P) Processamento normal e Complemento usam a mesma preparação -------


def test_o_processamento_normal_usa_a_mesma_preparacao(tmp_path):
    caminho = _planilha_base(tmp_path)
    _escrever_linha_historica(caminho, 2, sei="SEI-1", cpf=11111111111, formulas_completas=True)

    resultado = preencher(caminho, [_processo(_diaria("SEI-NOVO"))], modo=ModoProcessamento.PADRAO)

    assert resultado.total_gravado == 1
    workbook = load_workbook(caminho)
    planilha = workbook["Controle de Diárias"]
    assert planilha["N3"].value == "=I3-H3"


def test_p_complemento_usa_a_mesma_preparacao(tmp_path):
    caminho = _planilha_base(tmp_path)
    _escrever_linha_historica(caminho, 2, sei="SEI-1", cpf=11111111111, formulas_completas=True)
    diaria = _diaria(
        "SEI-NOVO", quantidade_diaria_parcial_complementar=0,
        fonte_quantidade_complementar="Padrão institucional do modo Complemento de Diárias.",
    )

    resultado = preencher(caminho, [_processo(diaria)], modo=ModoProcessamento.COMPLEMENTO)

    assert resultado.total_gravado == 1
    workbook = load_workbook(caminho)
    planilha = workbook["Controle de Diárias"]
    assert planilha["N3"].value == "=I3-H3"


# --- Pré-release: múltiplos lotes consecutivos (gap da bateria de regressão) --


def test_multiplos_lotes_consecutivos_nunca_corrompem_nem_reduzem_margem(tmp_path):
    """3 chamadas de `preencher()` em sequência (padrão real: vários
    processamentos/complementos ao longo do dia) — cada uma precisa achar
    a estrutura já pronta (deixada pelo lote anterior) sem re-quebrar nada,
    sem duplicar SEI, e sempre mantendo pelo menos a margem de 20 linhas
    intocadas à frente do último item gravado."""
    caminho = _planilha_base(tmp_path)
    _escrever_linha_historica(caminho, 2, sei="SEI-0", cpf=10000000000, formulas_completas=True)

    linha_final_acumulada = 2
    for lote in range(3):
        processos = [_processo(_diaria(f"SEI-LOTE{lote}-{i}")) for i in range(3)]
        resultado = preencher(caminho, processos)
        assert resultado.total_gravado == 3
        assert resultado.linha_inicial == linha_final_acumulada + 1
        linha_final_acumulada = resultado.linha_final

        workbook = load_workbook(caminho)
        planilha = workbook["Controle de Diárias"]
        # margem de 20 linhas além do último item gravado, sempre com
        # fórmula pronta (nunca reduzida por lotes anteriores).
        for offset in range(1, 21):
            linha_margem = linha_final_acumulada + offset
            valor = planilha[f"N{linha_margem}"].value
            assert isinstance(valor, str) and valor.startswith("="), (
                f"lote {lote}: margem quebrada na linha {linha_margem}"
            )
        # nenhuma linha histórica de lotes anteriores foi alterada.
        assert planilha["B2"].value == "SEI-0"

    # 9 diárias no total (3 lotes de 3), todas com SEI único, sem colisão.
    workbook = load_workbook(caminho)
    planilha = workbook["Controle de Diárias"]
    seis_gravados = {
        planilha[f"B{linha}"].value
        for linha in range(3, linha_final_acumulada + 1)
        if planilha[f"B{linha}"].value
    }
    assert len(seis_gravados) == 9


# --- P0 (2026-08-11) — buracos no meio do histórico NUNCA são reaproveitados ---
#
# Regra de negócio definitiva: não importa se existe 1, 5 ou 100 linhas
# vazias no meio da planilha — se há diárias reais abaixo delas, essas
# linhas não são candidatas a inserção. A próxima diária sempre entra
# imediatamente depois da ÚLTIMA diária real (`_localizar_ultima_linha_
# real`, busca de baixo para cima). Causa raiz: `_localizar_proxima_linha_
# livre` procurava a primeira célula B vazia de CIMA para BAIXO — em uso
# normal isso sempre coincidia com "logo depois da última diária real" (só
# existe uma zona livre, no fim), mas a bateria de 81 diárias de teste
# (limpeza que deixou linhas vazias espalhadas pelo meio do histórico, não
# só no fim) expôs a premissa errada: 54 diárias reais e alheias ao teste
# foram sobrescritas porque `preencher()` gravou sequencialmente a partir da
# primeira vaga encontrada, sem checar se as linhas seguintes também
# estavam livres.


def test_buraco_intercalado_simples_nunca_e_reaproveitado(tmp_path):
    """Exemplo literal do pedido: linha 10 = diária, 11 = vazia, 12 =
    diária, 13 = vazia, 14 = diária. Lote de 3 diárias -> grava em 15/16/17;
    11 e 13 permanecem EXATAMENTE como estavam (nem SEI, nem fórmula)."""
    caminho = _planilha_base(tmp_path)
    for linha, sei, cpf in (
        (10, "SEI-A", 11111111111),
        (12, "SEI-B", 22222222222),
        (14, "SEI-C", 33333333333),
    ):
        _escrever_linha_historica(caminho, linha, sei=sei, cpf=cpf, formulas_completas=True)

    processos = [_processo(_diaria(f"SEI-NOVO-{i}")) for i in range(3)]
    resultado = preencher(caminho, processos)

    assert resultado.total_gravado == 3
    assert resultado.linha_inicial == 15
    assert resultado.linha_final == 17

    workbook = load_workbook(caminho)
    planilha = workbook["Controle de Diárias"]
    assert [planilha[f"B{linha}"].value for linha in (15, 16, 17)] == [
        "SEI-NOVO-0",
        "SEI-NOVO-1",
        "SEI-NOVO-2",
    ]
    for linha in (11, 13):
        assert planilha[f"B{linha}"].value is None
        assert planilha[f"A{linha}"].value is None
        for coluna in ("N", "P", "R", "S", "V", "Z", "AA"):
            assert planilha[f"{coluna}{linha}"].value is None
    # As diárias históricas reais (10/12/14) seguem intocadas.
    assert planilha["B10"].value == "SEI-A"
    assert planilha["B12"].value == "SEI-B"
    assert planilha["B14"].value == "SEI-C"
    workbook.close()


def test_dezenas_de_buracos_antes_do_ultimo_registro_real_sao_ignorados(tmp_path):
    """~100 diárias reais espalhadas a cada 5 linhas até a linha 500 (isto
    é, ~400 linhas vazias intercaladas entre elas) — a última diária real é
    a 500, então a próxima inserção tem que ser 501, nunca uma das vagas."""
    caminho = _planilha_base(tmp_path)
    linhas_reais = list(range(5, 501, 5))  # 5, 10, ..., 500
    for indice, linha in enumerate(linhas_reais):
        _escrever_linha_historica(
            caminho, linha, sei=f"SEI-{indice}", cpf=10000000000 + indice, formulas_completas=True
        )

    resultado = preencher(caminho, [_processo(_diaria("SEI-NOVO"))])

    assert resultado.total_gravado == 1
    assert resultado.linha_inicial == 501
    assert resultado.linha_final == 501

    workbook = load_workbook(caminho)
    planilha = workbook["Controle de Diárias"]
    assert planilha["B501"].value == "SEI-NOVO"
    # Amostra de buracos que precisam continuar vazios.
    for linha in (6, 7, 8, 9, 246, 247, 248, 249, 496, 497, 498, 499):
        assert planilha[f"B{linha}"].value is None
    workbook.close()


@pytest.mark.parametrize("modo", [ModoProcessamento.PADRAO, ModoProcessamento.COMPLEMENTO])
def test_buracos_ignorados_em_qualquer_modo_e_tipo_membro_ou_servidor(tmp_path, modo):
    """Lote misto (Membro + Servidor), nos dois modos de processamento —
    nenhum fluxo pode usar uma vaga histórica no meio do caminho."""
    caminho = _planilha_base(tmp_path)
    for linha, sei, cpf in ((10, "SEI-A", 11111111111), (12, "SEI-B", 22222222222)):
        _escrever_linha_historica(caminho, linha, sei=sei, cpf=cpf, formulas_completas=True)
    # Linha 11 fica vazia — buraco intercalado entre as duas diárias reais.

    kwargs_complemento = (
        dict(
            quantidade_diaria_parcial_complementar=0,
            fonte_quantidade_complementar="Padrão institucional do modo Complemento de Diárias.",
        )
        if modo is ModoProcessamento.COMPLEMENTO
        else {}
    )
    diaria_membro = _diaria(
        "SEI-MEMBRO",
        tipo_processo=TipoProcesso.DIARIA_MEMBRO,
        valor_total_diarias="500,00",
        **kwargs_complemento,
    )
    diaria_servidor = _diaria("SEI-SERVIDOR", **kwargs_complemento)

    resultado = preencher(caminho, [_processo(diaria_membro), _processo(diaria_servidor)], modo=modo)

    assert resultado.total_gravado == 2
    assert resultado.linha_inicial == 13  # imediatamente após a última real (12) — nunca a linha 11
    assert resultado.linha_final == 14

    workbook = load_workbook(caminho)
    planilha = workbook["Controle de Diárias"]
    assert planilha["B11"].value is None  # o buraco continua vazio
    assert planilha["B13"].value == "SEI-MEMBRO"
    assert planilha["B14"].value == "SEI-SERVIDOR"
    workbook.close()


def test_preparacao_estrutural_nunca_altera_linha_igual_ou_anterior_a_ultima_real(tmp_path):
    """Invariante permanente (item 9 do pedido): nenhuma célula em linha
    <= última_linha_real pode ser alterada pela preparação estrutural
    automática de processamento de novas diárias. A linha 11 (buraco
    completo, sem NENHUMA fórmula) fica ENTRE duas diárias reais — se a
    preparação a "consertasse" (mesmo com boa intenção), isso já seria uma
    violação: só é permitido preparar a partir de última_real + 1."""
    caminho = _planilha_base(tmp_path)
    for linha, sei, cpf in ((10, "SEI-A", 11111111111), (12, "SEI-B", 22222222222)):
        _escrever_linha_historica(caminho, linha, sei=sei, cpf=cpf, formulas_completas=True)
    # Linha 11: buraco completo, nunca recebeu fórmula nenhuma.

    resultado = preencher(caminho, [_processo(_diaria("SEI-NOVO"))])

    assert resultado.total_gravado == 1
    assert resultado.linha_inicial == 13
    assert 11 not in resultado.linhas_estrutura_reparadas

    workbook = load_workbook(caminho)
    planilha = workbook["Controle de Diárias"]
    for coluna in ("N", "P", "R", "S", "V", "Z", "AA"):
        assert planilha[f"{coluna}11"].value is None
    # As duas diárias históricas reais também seguem 100% intocadas.
    assert planilha["B10"].value == "SEI-A"
    assert planilha["C10"].value == "PJTESTE"
    assert planilha["B12"].value == "SEI-B"
    assert planilha["C12"].value == "PJTESTE"
    workbook.close()
