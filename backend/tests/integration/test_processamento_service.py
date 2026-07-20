from app.domain.entities.fonte_transporte import FonteTransporte
from app.domain.entities.processo import StatusProcesso
from app.services.processamento_service import processar_lote


def test_processa_lote_com_pdfs_reais(pdfs_exemplo):
    lote = processar_lote(pdfs_exemplo)

    assert lote.total == len(pdfs_exemplo)
    assert lote.sucesso == len(pdfs_exemplo)  # todos os PDFs de exemplo são válidos
    assert lote.erro == 0
    for processo in lote.processos:
        assert processo.status is StatusProcesso.SUCESSO
        assert processo.diaria is not None


def test_arquivo_inexistente_vira_processo_com_erro_sem_derrubar_o_lote(pdfs_exemplo):
    caminhos = [*pdfs_exemplo, "C:/caminho/que/nao/existe.pdf"]

    lote = processar_lote(caminhos)

    assert lote.total == len(caminhos)
    assert lote.sucesso == len(pdfs_exemplo)
    assert lote.erro == 1
    processo_com_erro = next(p for p in lote.processos if p.status is StatusProcesso.ERRO)
    assert "Falha ao ler o PDF" in processo_com_erro.erro.motivos[0]


def _por_arquivo(lote, nome_arquivo):
    return next(p for p in lote.processos if p.arquivo_origem == nome_arquivo)


def test_sprint03_enriquecimento_com_pdfs_reais(pdfs_exemplo):
    """Validação com os PDFs reais do legado (Sprint 03 + 03.1): o único
    processo que já chegou à Nota de Liquidação tem DH; os outros ficam sem
    DH e isso é esperado. Local do destino resolve para os casos claros,
    inclusive o erro de digitação real (correspondência aproximada), e fica
    em branco no caso genuinamente ambíguo (nome de cidade que existe em
    mais de um estado, sem UF explícita para desempatar).

    Nenhum dos 8 PDFs de exemplo tem evidência TEXTUAL de transporte — mas
    todos resolvem o destino para Pernambuco (nenhum é Petrolina), então a
    regra operacional de fallback (Sprint 04.1) preenche CARRO em todos,
    com a fonte marcada como regra operacional, não evidência documental."""
    lote = processar_lote(pdfs_exemplo)
    assert lote.sucesso == len(pdfs_exemplo)

    garanhuns = _por_arquivo(lote, "SEI_19.20.0001.0000102_2025_02.pdf")
    assert garanhuns.diaria.documento_habil == "2025DH000102"
    assert garanhuns.diaria.estado_destino == "PERNAMBUCO"

    nazare_da_mata = _por_arquivo(lote, "SEI_19.20.0001.0000101_2025_01.pdf")
    assert nazare_da_mata.diaria.documento_habil is None
    assert nazare_da_mata.diaria.estado_destino == "PERNAMBUCO"

    # "Bonito" existe em Pernambuco, Bahia, Mato Grosso do Sul e Pará — o
    # PDF não traz UF, mas a cidade de origem ("Recife") é inequivocamente
    # pernambucana, e isso desempata "Bonito" por contexto (Sprint 03.1 —
    # caso do processo SEI 19.20.0001.0000112/2025-12 na homologação).
    bonito = _por_arquivo(lote, "SEI_19.20.0001.0000112_2025_12.pdf")
    assert bonito.diaria.cidade_origem == "Recife"
    assert bonito.diaria.estado_destino == "PERNAMBUCO"
    assert any("Desambiguação por contexto" in aviso for aviso in bonito.avisos)

    # "Cabo de Santo Augustinho" é erro de digitação real no PDF (correto
    # seria "Agostinho") — a correspondência aproximada (Sprint 03.1) agora
    # resolve isso com segurança, porque só há um candidato de alta
    # confiança e ele é inequivocamente pernambucano.
    cabo_palmares = _por_arquivo(lote, "SEI_19.20.0001.0000113_2025_13.pdf")
    assert cabo_palmares.diaria.estado_destino == "PERNAMBUCO"

    # Nenhum dos 8 PDFs de exemplo tem evidência TEXTUAL de transporte — mas
    # todos resolvem para Pernambuco (nenhum é Petrolina), então a regra
    # operacional de fallback preenche CARRO em todos, sem exceção.
    assert all(processo.diaria.transporte == "CARRO" for processo in lote.processos)
    assert all(
        processo.diaria.transporte_fonte is FonteTransporte.REGRA_OPERACIONAL
        for processo in lote.processos
    )


def test_regressao_processo_sei_19_20_0222_0000179_2026_03(caminho_pdf):
    """Regressão do caso investigado na homologação (SEI
    19.20.0001.0000111/2026-11): o campo real 'CIDADE(S) DESTINO:' é
    'Sanharó - PE' — uma única cidade com UF explícita, separada por hífen.
    O que apareceu como 'Recife - PE - Sanharó - PE' na descrição do
    problema é o TRECHO (origem + destino concatenados para exibição), não
    o campo de destino em si; o parser nunca recebe essa string combinada.
    Este teste trava o comportamento correto já confirmado na investigação:
    o estado resolve para PERNAMBUCO sem ambiguidade."""
    lote = processar_lote([caminho_pdf("SEI_19.20.0001.0000111_2026_11.pdf")])

    assert lote.sucesso == 1
    processo = lote.processos[0]
    diaria = processo.diaria

    assert diaria.sei == "19.20.0001.0000111/2026-11"
    assert diaria.cidade_origem == "Recife - PE"
    assert diaria.cidade_destino == "Sanharó - PE"
    assert diaria.documento_habil == "2026DH000111"
    assert diaria.estado_destino == "PERNAMBUCO"
    assert not any("estado" in aviso.lower() for aviso in processo.avisos)
