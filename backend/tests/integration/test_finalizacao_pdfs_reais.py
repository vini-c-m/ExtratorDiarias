"""Validação com os dois processos reais de referência da funcionalidade
"Finalizar Diárias" (SEI 19.20.0001.0000375/2026-24 — Recibo;
19.20.0001.0000639/2026-96 — Anexo Comprovante). Roda só nesta máquina, contra
uma CÓPIA SEGURA da Planilha Oficial real (nunca o arquivo original) — pulado
automaticamente onde os dois arquivos não estiverem disponíveis (ex.: CI)."""

import shutil
from pathlib import Path

import pytest
from openpyxl import load_workbook

from app.services.finalizacao_service import ItemConfirmacao, StatusFinalizacao, analisar_lote, confirmar

_LEGADO_DIR = Path("C:/Users/usuario/Workspace/legado/pdfs")
_PLANILHA_OFICIAL_REAL = Path(
    "C:/Users/usuario/Workspace/planilha/"
    "CONTROLE DIARIAS EXEMPLO - Banco de Dados 2026 (1).xlsx"
)

_CASOS = [
    ("19.20.0001.0000375/2026-24", "SEI_19.20.0001.0000375_2026_24.pdf"),
    ("19.20.0001.0000639/2026-96", "SEI_19.20.0001.0000639_2026_96.pdf"),
]

pytestmark = pytest.mark.skipif(
    not _LEGADO_DIR.is_dir() or not _PLANILHA_OFICIAL_REAL.is_file(),
    reason="PDFs/planilha reais de referência não disponíveis nesta máquina",
)


@pytest.fixture
def copia_segura_planilha_oficial(tmp_path):
    """Copia a Planilha Oficial real para uma pasta temporária e zera X/Y só
    das duas linhas de teste na CÓPIA — o arquivo original nunca é aberto em
    modo de escrita por este teste."""
    destino = tmp_path / "planilha_copia.xlsx"
    shutil.copy(_PLANILHA_OFICIAL_REAL, destino)

    workbook = load_workbook(destino)
    planilha = workbook["Controle de Diárias"]
    seis_do_teste = {sei for sei, _arquivo in _CASOS}
    linha_por_sei = {}
    for linha in range(2, planilha.max_row + 1):
        valor = str(planilha[f"B{linha}"].value or "").strip()
        if valor in seis_do_teste:
            linha_por_sei[valor] = linha
            planilha[f"X{linha}"] = None
            planilha[f"Y{linha}"] = None
    workbook.save(destino)

    assert set(linha_por_sei) == seis_do_teste, "SEIs de referência não encontrados na planilha real"
    return str(destino), linha_por_sei


def test_dois_processos_reais_sao_identificados_como_aptos(copia_segura_planilha_oficial):
    caminho_planilha, _linha_por_sei = copia_segura_planilha_oficial
    caminhos_pdf = [str(_LEGADO_DIR / arquivo) for _sei, arquivo in _CASOS]

    itens = analisar_lote(caminhos_pdf, caminho_planilha)

    assert len(itens) == 2
    for item in itens:
        assert item.avaliacao is not None
        assert item.avaliacao.confirmacao_valida, item.sei
        assert item.avaliacao.comprovante_encontrado, item.sei
        assert item.status is StatusFinalizacao.PRONTO, (item.sei, item.status, item.motivo)
        assert len(item.candidatos) == 1


def test_dois_processos_reais_confirmacao_grava_x_e_y_sem_alterar_o_resto(
    copia_segura_planilha_oficial,
):
    caminho_planilha, linha_por_sei = copia_segura_planilha_oficial
    caminhos_pdf = [str(_LEGADO_DIR / arquivo) for _sei, arquivo in _CASOS]

    antes = load_workbook(caminho_planilha)["Controle de Diárias"]
    instantaneos_antes = {
        sei: [antes.cell(row=linha, column=c).value for c in range(1, 24)]
        for sei, linha in linha_por_sei.items()
    }

    itens = analisar_lote(caminhos_pdf, caminho_planilha)
    confirmacoes = [
        ItemConfirmacao(arquivo_origem=item.arquivo_origem, sei=item.sei) for item in itens
    ]
    resultado = confirmar(confirmacoes, caminho_planilha)

    assert resultado.total_finalizado == 2
    assert resultado.total_ignorado == 0

    depois = load_workbook(caminho_planilha)["Controle de Diárias"]
    for sei, linha in linha_por_sei.items():
        assert depois[f"X{linha}"].value == "SIM", sei
        assert depois[f"Y{linha}"].value == "SIM", sei
        # Nenhuma outra coluna (A..W, colunas 1-23) foi alterada.
        instantaneo_depois = [depois.cell(row=linha, column=c).value for c in range(1, 24)]
        assert instantaneo_depois == instantaneos_antes[sei], sei
