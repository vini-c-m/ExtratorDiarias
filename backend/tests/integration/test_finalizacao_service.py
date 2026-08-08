from openpyxl import load_workbook
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

from app.services.finalizacao_service import (
    ItemConfirmacao,
    StatusFinalizacao,
    analisar_lote,
    confirmar,
)

# Fixtures 100% sintéticas (sem dado real) — mesma política de
# `tests/fixtures/gerar_fixtures_sinteticas.py`, geradas aqui mesmo por não
# precisarem de campos do formulário de Solicitação (esta funcionalidade só
# lê SEI/Confirmação/Comprovante, nunca CPF/período/motivo).


def _gerar_pdf(caminho: str, paginas: list[list[str]]) -> None:
    c = canvas.Canvas(caminho, pagesize=A4)
    _largura, altura = A4
    for pagina in paginas:
        y = altura - 50
        for linha in pagina:
            c.drawString(50, y, linha)
            y -= 14
        c.showPage()
    c.save()


def _pdf_confirmacao_e_recibo(tmp_path, sei: str, nome_arquivo: str = "processo.pdf") -> str:
    caminho = str(tmp_path / nome_arquivo)
    _gerar_pdf(
        caminho,
        [
            [
                "CMFC - Confirmação dos Serviços - Diária -Servidor - 1000001",
                "Confirmação dos serviços:",
                "Sim",
                f"CMFC - Confirmação dos Serviços - Diária -Servidor 1000001 SEI {sei} / pg. 1",
            ],
            [f"Recibo (1000002) SEI {sei} / pg. 2"],
        ],
    )
    return caminho


def _pdf_sem_confirmacao(tmp_path, sei: str, nome_arquivo: str = "sem_confirmacao.pdf") -> str:
    caminho = str(tmp_path / nome_arquivo)
    _gerar_pdf(caminho, [[f"CMFC - Solicitação de Diária - Servidor {sei} SEI {sei} / pg. 1"]])
    return caminho


def _planilha_com_linhas(caminho_planilha_teste, linhas: list[tuple[str, object, object]]) -> str:
    """`linhas`: lista de (sei, x, y), uma por linha a partir da linha 4."""
    caminho = caminho_planilha_teste()
    workbook = load_workbook(caminho)
    planilha = workbook["Controle de Diárias"]
    for indice, (sei, x, y) in enumerate(linhas):
        linha = 4 + indice
        planilha[f"B{linha}"] = sei
        if x is not None:
            planilha[f"X{linha}"] = x
        if y is not None:
            planilha[f"Y{linha}"] = y
    workbook.save(caminho)
    return caminho


# --- analisar_lote -----------------------------------------------------------


def test_analisar_lote_processo_sem_confirmacao(tmp_path, caminho_planilha_teste):
    caminho_planilha = caminho_planilha_teste()
    sei = "19.20.0002.0000001/2026-01"
    pdf = _pdf_sem_confirmacao(tmp_path, sei)

    itens = analisar_lote([pdf], caminho_planilha)

    assert len(itens) == 1
    assert itens[0].sei == sei
    assert itens[0].status is StatusFinalizacao.SEM_CONFIRMACAO
    assert itens[0].candidatos == []


def test_analisar_lote_apto_mas_sei_nao_encontrado_na_planilha(tmp_path, caminho_planilha_teste):
    caminho_planilha = caminho_planilha_teste()
    sei = "19.20.0002.0000002/2026-02"
    pdf = _pdf_confirmacao_e_recibo(tmp_path, sei)

    itens = analisar_lote([pdf], caminho_planilha)

    assert itens[0].status is StatusFinalizacao.SEI_NAO_ENCONTRADO
    assert itens[0].avaliacao.apto


def test_analisar_lote_apto_uma_linha_pronta(tmp_path, caminho_planilha_teste):
    sei = "19.20.0002.0000003/2026-03"
    caminho_planilha = _planilha_com_linhas(caminho_planilha_teste, [(sei, None, None)])
    pdf = _pdf_confirmacao_e_recibo(tmp_path, sei)

    itens = analisar_lote([pdf], caminho_planilha)

    assert itens[0].status is StatusFinalizacao.PRONTO
    assert len(itens[0].candidatos) == 1
    assert itens[0].candidatos[0].linha == 4


def test_analisar_lote_ja_finalizado(tmp_path, caminho_planilha_teste):
    sei = "19.20.0002.0000004/2026-04"
    caminho_planilha = _planilha_com_linhas(caminho_planilha_teste, [(sei, "SIM", "SIM")])
    pdf = _pdf_confirmacao_e_recibo(tmp_path, sei)

    itens = analisar_lote([pdf], caminho_planilha)

    assert itens[0].status is StatusFinalizacao.JA_FINALIZADO


def test_analisar_lote_estado_parcial(tmp_path, caminho_planilha_teste):
    sei = "19.20.0002.0000005/2026-05"
    caminho_planilha = _planilha_com_linhas(caminho_planilha_teste, [(sei, "SIM", None)])
    pdf = _pdf_confirmacao_e_recibo(tmp_path, sei)

    itens = analisar_lote([pdf], caminho_planilha)

    assert itens[0].status is StatusFinalizacao.ESTADO_PARCIAL


def test_analisar_lote_multiplas_linhas_mesmo_sei_todas_vazias_fica_pronto(
    tmp_path, caminho_planilha_teste
):
    """Ajuste de 2026-08-07 — RN do processo, não da linha: mesmo SEI em
    duas linhas (diária + Complemento de Diárias) e ambas vazias já conta
    como pronto para o SEI inteiro, sem exigir escolha manual."""
    sei = "19.20.0002.0000006/2026-06"
    caminho_planilha = _planilha_com_linhas(
        caminho_planilha_teste, [(sei, None, None), (sei, None, None)]
    )
    pdf = _pdf_confirmacao_e_recibo(tmp_path, sei)

    itens = analisar_lote([pdf], caminho_planilha)

    assert itens[0].status is StatusFinalizacao.PRONTO
    assert [c.linha for c in itens[0].candidatos] == [4, 5]


def test_analisar_lote_multiplas_linhas_mistura_pronta_e_ja_finalizada_fica_pronto(
    tmp_path, caminho_planilha_teste
):
    """Uma linha já SIM/SIM e outra vazia — o SEI ainda está pronto (a já
    finalizada só é mantida, nunca bloqueia as demais)."""
    sei = "19.20.0002.0000012/2026-12"
    caminho_planilha = _planilha_com_linhas(
        caminho_planilha_teste, [(sei, "SIM", "SIM"), (sei, None, None)]
    )
    pdf = _pdf_confirmacao_e_recibo(tmp_path, sei)

    itens = analisar_lote([pdf], caminho_planilha)

    assert itens[0].status is StatusFinalizacao.PRONTO


def test_analisar_lote_multiplas_linhas_uma_parcial_bloqueia_o_sei_inteiro(
    tmp_path, caminho_planilha_teste
):
    sei = "19.20.0002.0000013/2026-13"
    caminho_planilha = _planilha_com_linhas(
        caminho_planilha_teste, [(sei, None, None), (sei, "SIM", None)]
    )
    pdf = _pdf_confirmacao_e_recibo(tmp_path, sei)

    itens = analisar_lote([pdf], caminho_planilha)

    assert itens[0].status is StatusFinalizacao.ESTADO_PARCIAL


def test_analisar_lote_arquivo_ilegivel_vira_erro_leitura(caminho_planilha_teste):
    caminho_planilha = caminho_planilha_teste()
    itens = analisar_lote(["/caminho/inexistente.pdf"], caminho_planilha)

    assert itens[0].status is StatusFinalizacao.ERRO_LEITURA
    assert itens[0].sei is None


# --- confirmar ----------------------------------------------------------------


def test_confirmar_uma_linha_atualiza_uma(caminho_planilha_teste):
    sei = "19.20.0002.0000007/2026-07"
    caminho_planilha = _planilha_com_linhas(caminho_planilha_teste, [(sei, None, None)])
    workbook = load_workbook(caminho_planilha)
    planilha_antes = workbook["Controle de Diárias"]
    valores_linha_antes = [planilha_antes.cell(row=4, column=c).value for c in range(1, 13)]

    resultado = confirmar([ItemConfirmacao(arquivo_origem="p.pdf", sei=sei)], caminho_planilha)

    assert resultado.total_finalizado == 1
    assert resultado.total_ignorado == 0
    assert resultado.itens[0].linhas_atualizadas == [4]
    assert resultado.itens[0].linhas_mantidas == []

    planilha_depois = load_workbook(caminho_planilha)["Controle de Diárias"]
    assert planilha_depois["X4"].value == "SIM"
    assert planilha_depois["Y4"].value == "SIM"
    valores_linha_depois = [planilha_depois.cell(row=4, column=c).value for c in range(1, 13)]
    assert valores_linha_depois == valores_linha_antes


def test_confirmar_duas_linhas_mesmo_sei_atualiza_ambas(caminho_planilha_teste):
    sei = "19.20.0002.0000014/2026-14"
    caminho_planilha = _planilha_com_linhas(
        caminho_planilha_teste, [(sei, None, None), (sei, None, None)]
    )

    resultado = confirmar([ItemConfirmacao(arquivo_origem="p.pdf", sei=sei)], caminho_planilha)

    assert resultado.total_finalizado == 1
    assert sorted(resultado.itens[0].linhas_atualizadas) == [4, 5]

    planilha = load_workbook(caminho_planilha)["Controle de Diárias"]
    assert planilha["X4"].value == "SIM" and planilha["Y4"].value == "SIM"
    assert planilha["X5"].value == "SIM" and planilha["Y5"].value == "SIM"


def test_confirmar_tres_linhas_mesmo_sei_atualiza_todas(caminho_planilha_teste):
    sei = "19.20.0002.0000015/2026-15"
    caminho_planilha = _planilha_com_linhas(
        caminho_planilha_teste, [(sei, None, None), (sei, None, None), (sei, None, None)]
    )

    resultado = confirmar([ItemConfirmacao(arquivo_origem="p.pdf", sei=sei)], caminho_planilha)

    assert resultado.total_finalizado == 1
    assert sorted(resultado.itens[0].linhas_atualizadas) == [4, 5, 6]

    planilha = load_workbook(caminho_planilha)["Controle de Diárias"]
    for linha in (4, 5, 6):
        assert planilha[f"X{linha}"].value == "SIM"
        assert planilha[f"Y{linha}"].value == "SIM"


def test_confirmar_uma_ja_sim_sim_mantem_e_atualiza_as_demais(caminho_planilha_teste):
    sei = "19.20.0002.0000016/2026-16"
    caminho_planilha = _planilha_com_linhas(
        caminho_planilha_teste, [(sei, "SIM", "SIM"), (sei, None, None)]
    )

    resultado = confirmar([ItemConfirmacao(arquivo_origem="p.pdf", sei=sei)], caminho_planilha)

    assert resultado.total_finalizado == 1
    assert resultado.itens[0].linhas_atualizadas == [5]
    assert resultado.itens[0].linhas_mantidas == [4]

    planilha = load_workbook(caminho_planilha)["Controle de Diárias"]
    assert planilha["X4"].value == "SIM" and planilha["Y4"].value == "SIM"
    assert planilha["X5"].value == "SIM" and planilha["Y5"].value == "SIM"


def test_confirmar_uma_linha_em_estado_parcial_aborta_todas(caminho_planilha_teste):
    """Atomicidade por SEI: uma linha parcial bloqueia TODO o SEI — mesmo
    as demais linhas, prontas, ficam sem alteração."""
    sei = "19.20.0002.0000005/2026-05"
    caminho_planilha = _planilha_com_linhas(
        caminho_planilha_teste, [(sei, None, None), (sei, "SIM", None)]
    )

    resultado = confirmar([ItemConfirmacao(arquivo_origem="p.pdf", sei=sei)], caminho_planilha)

    assert resultado.total_finalizado == 0
    assert resultado.itens[0].categoria.value == "ignorado"
    assert resultado.itens[0].motivo == "Estado parcial — revisão manual necessária."
    assert resultado.itens[0].linhas_atualizadas == []

    planilha = load_workbook(caminho_planilha)["Controle de Diárias"]
    assert planilha["X4"].value is None and planilha["Y4"].value is None
    assert planilha["X5"].value == "SIM" and planilha["Y5"].value is None


def test_confirmar_nao_altera_nenhuma_outra_coluna(caminho_planilha_teste):
    sei = "19.20.0002.0000017/2026-17"
    caminho_planilha = _planilha_com_linhas(
        caminho_planilha_teste, [(sei, None, None), (sei, None, None)]
    )
    antes = load_workbook(caminho_planilha)["Controle de Diárias"]
    instantaneo_antes = {
        linha: [antes.cell(row=linha, column=c).value for c in range(1, 24)] for linha in (4, 5)
    }

    confirmar([ItemConfirmacao(arquivo_origem="p.pdf", sei=sei)], caminho_planilha)

    depois = load_workbook(caminho_planilha)["Controle de Diárias"]
    for linha in (4, 5):
        instantaneo_depois = [depois.cell(row=linha, column=c).value for c in range(1, 24)]
        assert instantaneo_depois == instantaneo_antes[linha]


def test_confirmar_revalida_estado_no_momento_da_gravacao(caminho_planilha_teste):
    """SEI já finalizado por outra operação entre a análise e a confirmação
    — nunca regravado."""
    sei = "19.20.0002.0000009/2026-09"
    caminho_planilha = _planilha_com_linhas(caminho_planilha_teste, [(sei, "SIM", "SIM")])

    resultado = confirmar([ItemConfirmacao(arquivo_origem="p.pdf", sei=sei)], caminho_planilha)

    assert resultado.total_finalizado == 0
    assert resultado.itens[0].motivo == "Já finalizado anteriormente."
    assert resultado.itens[0].linhas_mantidas == [4]


def test_confirmar_multiplos_seis_um_bloqueado_nao_impede_os_demais(caminho_planilha_teste):
    """Outro SEI (do mesmo lote ou não) nunca é afetado pelo bloqueio de um
    SEI com estado parcial."""
    sei_bloqueado = "19.20.0002.0000010/2026-10"
    sei_ok = "19.20.0002.0000011/2026-11"
    caminho_planilha = _planilha_com_linhas(
        caminho_planilha_teste, [(sei_bloqueado, "SIM", None), (sei_ok, None, None)]
    )

    resultado = confirmar(
        [
            ItemConfirmacao(arquivo_origem="a.pdf", sei=sei_bloqueado),
            ItemConfirmacao(arquivo_origem="b.pdf", sei=sei_ok),
        ],
        caminho_planilha,
    )

    assert resultado.total_finalizado == 1
    assert resultado.total_ignorado == 1
    planilha = load_workbook(caminho_planilha)["Controle de Diárias"]
    assert planilha["X5"].value == "SIM" and planilha["Y5"].value == "SIM"
    # SEI bloqueado permanece intocado.
    assert planilha["X4"].value == "SIM" and planilha["Y4"].value is None


def test_confirmar_sei_nao_encontrado_na_planilha(caminho_planilha_teste):
    caminho_planilha = caminho_planilha_teste()

    resultado = confirmar(
        [ItemConfirmacao(arquivo_origem="p.pdf", sei="19.20.9999.9999999/2099-99")],
        caminho_planilha,
    )

    assert resultado.total_finalizado == 0
    assert resultado.itens[0].motivo == "SEI não localizado na Planilha Oficial."
