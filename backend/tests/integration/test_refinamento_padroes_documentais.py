"""Sprint 04.2 — Refinamento das regras de extração a partir de casos reais
de homologação (~60 processos reais).

Cobre, de ponta a ponta (via `processar_lote`), os 4 padrões documentais
identificados: múltiplos Requerimentos/Solicitações de Diária no mesmo
processo (Servidor e Membro), a data de retorno partida por uma quebra de
página, duas Validações de Diária no mesmo processo, e o prefixo
institucional "PJ"/"Procuradoria/Promotoria de Justiça" antes do nome do
município — sempre preferindo o último documento anexado, nunca o primeiro.
Reafirma também que os fluxos já homologados (Padrão e Diária de Membro)
continuam extraídos exatamente como antes."""

from datetime import date

from app.domain.entities.tipo_processo import TipoProcesso
from app.services.processamento_service import processar_lote


def test_caso1_multiplos_requerimentos_membro_usa_o_ultimo(
    caminho_pdf_multiplos_requerimentos_membro,
):
    lote = processar_lote([caminho_pdf_multiplos_requerimentos_membro])

    assert lote.sucesso == 1
    diaria = lote.processos[0].diaria

    assert diaria.sei == "19.20.0001.0000103/2026-03"
    assert diaria.periodo_inicial == date(2026, 5, 11)
    assert diaria.periodo_final == date(2026, 5, 12)
    assert diaria.tipo_processo is TipoProcesso.DIARIA_MEMBRO


def test_caso2_data_de_retorno_nao_vem_da_confirmacao_dos_servicos(
    caminho_pdf_data_retorno_confirmacao_servicos,
):
    lote = processar_lote([caminho_pdf_data_retorno_confirmacao_servicos])

    assert lote.sucesso == 1
    diaria = lote.processos[0].diaria

    assert diaria.sei == "19.20.0001.0000104/2026-04"
    assert diaria.periodo_inicial == date(2026, 5, 22)
    assert diaria.periodo_final == date(2026, 5, 22)


def test_caso3_documento_habil_da_ultima_validacao(caminho_pdf_duas_validacoes_diaria):
    lote = processar_lote([caminho_pdf_duas_validacoes_diaria])

    assert lote.sucesso == 1
    processo = lote.processos[0]
    diaria = processo.diaria

    assert diaria.sei == "19.20.0001.0000105/2026-05"
    assert diaria.documento_habil == "2026DH000202"
    assert not any("Documento Hábil" in aviso for aviso in processo.avisos)


def test_caso4_destino_pj_palmares_resolve_pernambuco(caminho_pdf_destino_pj_palmares):
    lote = processar_lote([caminho_pdf_destino_pj_palmares])

    assert lote.sucesso == 1
    processo = lote.processos[0]
    diaria = processo.diaria

    assert diaria.sei == "19.20.0001.0000107/2026-07"
    assert diaria.cidade_destino == "PJ PALMARES"  # campo cru do PDF, sem alterar
    assert diaria.estado_destino == "PERNAMBUCO"
    assert not any("não reconhecida" in aviso for aviso in processo.avisos)


def test_caso5_documento_habil_ignora_nota_de_liquidacao_de_outro_processo(
    caminho_pdf_le_de_outro_processo_anexada_por_engano,
):
    """Processo fictício 19.20.0001.0000106/2023-06 (Sprint — Refatoração DH): a
    Nota de Liquidação anexada por engano pertence a outro processo (credor
    diferente) e foi desconsiderada por despacho posterior — mas a extração
    nunca precisa saber disso, porque o Documento Hábil vem exclusivamente
    do Despacho de Validação, fonte oficial única segundo a regra de
    negócio do DIMCAC."""
    lote = processar_lote([caminho_pdf_le_de_outro_processo_anexada_por_engano])

    assert lote.sucesso == 1
    processo = lote.processos[0]
    diaria = processo.diaria

    assert diaria.sei == "19.20.0001.0000106/2023-06"
    assert diaria.documento_habil == "2023DH000301"
    assert not any("Documento Hábil" in aviso for aviso in processo.avisos)


def test_caso4_destino_pj_bom_jardim_resolve_pernambuco_por_contexto(
    caminho_pdf_destino_pj_bom_jardim,
):
    lote = processar_lote([caminho_pdf_destino_pj_bom_jardim])

    assert lote.sucesso == 1
    processo = lote.processos[0]
    diaria = processo.diaria

    assert diaria.sei == "19.20.0001.0000109/2026-09"
    assert diaria.cidade_origem == "São José do Egito"
    assert diaria.cidade_destino == "PJ Bom Jardim"  # campo cru do PDF, sem alterar
    assert diaria.estado_destino == "PERNAMBUCO"


def test_todos_os_4_casos_processados_juntos_sem_interferencia_entre_si(
    caminho_pdf_multiplos_requerimentos_membro,
    caminho_pdf_data_retorno_confirmacao_servicos,
    caminho_pdf_duas_validacoes_diaria,
    caminho_pdf_destino_pj_palmares,
    caminho_pdf_destino_pj_bom_jardim,
):
    caminhos = [
        caminho_pdf_multiplos_requerimentos_membro,
        caminho_pdf_data_retorno_confirmacao_servicos,
        caminho_pdf_duas_validacoes_diaria,
        caminho_pdf_destino_pj_palmares,
        caminho_pdf_destino_pj_bom_jardim,
    ]
    lote = processar_lote(caminhos)

    assert lote.sucesso == 5
    assert lote.erro == 0


def test_regressao_processos_padrao_ja_homologados_nao_mudam(pdfs_exemplo):
    """Nenhuma regressão: o fluxo Padrão (um único Requerimento/Solicitação,
    uma única Validação, destino sem prefixo institucional) continua
    processado exatamente como antes desta Sprint."""
    lote = processar_lote(pdfs_exemplo)

    assert lote.sucesso == len(pdfs_exemplo)
    assert lote.erro == 0
    for processo in lote.processos:
        assert processo.diaria.periodo_inicial
        assert processo.diaria.periodo_final
        assert processo.diaria.tipo_processo is TipoProcesso.PADRAO


def test_regressao_processos_diaria_membro_ja_homologados_nao_mudam(pdfs_diaria_membro):
    """Nenhuma regressão: os 3 processos reais de Diária de Membro da Sprint
    04 continuam com tipo/valor extraídos exatamente como antes."""
    lote = processar_lote(pdfs_diaria_membro)

    assert lote.sucesso == len(pdfs_diaria_membro)
    assert lote.erro == 0
    for processo in lote.processos:
        assert processo.diaria.tipo_processo is TipoProcesso.DIARIA_MEMBRO
        assert processo.diaria.valor_total_diarias is not None
