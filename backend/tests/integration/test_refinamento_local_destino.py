"""Sprint 04.1 — Correção definitiva da identificação de LOCAL.

Processo fictício 19.20.0001.0000910/2025-10: o campo 'CIDADE(S) DESTINO:' vem
como 'Sta Cuz do Capibaribe' (abreviação administrativa 'Sta' + erro de
digitação real 'Cuz' por 'Cruz'). Antes desta Sprint, o sistema não
conseguia resolver PERNAMBUCO porque o filtro de tamanho da correspondência
aproximada excluía o município correto da lista de candidatos antes mesmo
da comparação por similaridade rodar. Ver `tests/unit/test_local_destino.py`
para a cobertura genérica da expansão de abreviações."""

from app.extraction import pdf_reader
from app.extraction.parsers.parser_factory import obter_parser
from app.services.processamento_service import processar_lote


def test_processo_real_sta_cuz_do_capibaribe_e_extraido_como_pernambuco(
    caminho_pdf_processo_sta_cruz_capibaribe,
):
    lote = processar_lote([caminho_pdf_processo_sta_cruz_capibaribe])

    assert lote.sucesso == 1
    processo = lote.processos[0]
    diaria = processo.diaria

    assert diaria.sei == "19.20.0001.0000910/2025-10"
    assert diaria.cidade_destino == "Sta Cuz do Capibaribe"
    assert diaria.estado_destino == "PERNAMBUCO"
    assert not any("estado" in aviso.lower() for aviso in processo.avisos)


def test_parser_extrai_o_campo_de_destino_verbatim_sem_corrigir_abreviacao(
    caminho_pdf_processo_sta_cruz_capibaribe,
):
    """Confirma onde a string abreviada nasce: o parser (Sprint 01/02) só lê
    o campo 'CIDADE(S) DESTINO:' do PDF, sem qualquer expansão — a correção
    é responsabilidade exclusiva do enriquecimento de LOCAL (Sprint 03/04.1),
    nunca do parser."""
    texto = pdf_reader.ler_texto(caminho_pdf_processo_sta_cruz_capibaribe)
    campos = obter_parser().extrair(texto)

    assert campos.cidade_destino == "Sta Cuz do Capibaribe"
    assert campos.cidade_origem == "Recife"
