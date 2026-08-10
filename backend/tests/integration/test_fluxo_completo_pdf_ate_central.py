"""Pré-release — bateria de regressão (item 7): cenário integrado real,
ponta a ponta, com PDFs de verdade (não planilha sintética isolada):

PDF (fixture) → extração → preenchimento → preparação estrutural → save
→ preservação de cache → sincronização → SQLite → consulta da Central.

Repetido 3 vezes em sequência (Padrão, Padrão com outro lote, Complemento
reaproveitando SEI já existente) — exatamente o padrão de uso real ao
longo de um dia — para pegar qualquer problema que só apareça a partir da
segunda/terceira execução (margem já preparada por um lote anterior, cache
acumulado, etc.), sem duplicar os testes unitários já existentes que
cobrem cada etapa isoladamente."""

from dataclasses import replace
from datetime import date

from app.consulta import base_local_sqlite, repositorio_analitico
from app.consulta.repositorio_analitico import FiltrosDiaria
from app.domain.entities.modo_processamento import ModoProcessamento
from app.services.planilha_service import preencher_planilha
from app.services.processamento_service import processar_lote


def test_fluxo_completo_pdf_ate_central_em_execucoes_consecutivas(
    tmp_path, caminho_planilha_teste, pdfs_exemplo, pdfs_diaria_membro
):
    caminho_planilha = caminho_planilha_teste()
    caminho_sqlite = base_local_sqlite.caminho_base_local_sqlite()
    filtros = FiltrosDiaria(periodo_inicial=date(2000, 1, 1), periodo_final=date(2030, 12, 31))

    # --- Execução 1: lote Padrão (SERVIDOR) ---------------------------------
    # `pdfs_exemplo` inclui intencionalmente um arquivo duplicado (fixture
    # de teste de duplicidade, "(1).pdf") — total_gravado é a fonte da
    # verdade de quantos viram linha nova, nunca a contagem de arquivos.
    lote1 = processar_lote(pdfs_exemplo)
    assert lote1.erro == 0
    resultado1, _ = preencher_planilha(caminho_planilha, lote1.processos, [])
    assert 0 < resultado1.total_gravado <= len(lote1.processos)
    assert resultado1.sincronizacao_analitica_falhou is False

    registros1 = repositorio_analitico.agregar_indicadores(caminho_sqlite, filtros)
    # A fixture já vem com 2 linhas históricas próprias, sincronizadas
    # junto — usar delta a partir daqui em vez de contagem absoluta, para
    # não acoplar este teste ao conteúdo exato dela.
    total_baseline = len(registros1) - resultado1.total_gravado
    valores_apos_1 = {r.sei: r.valor_total_diarias for r in registros1}

    # --- Execução 2: lote Padrão (MEMBRO), distinto do anterior -------------
    lote2 = processar_lote(pdfs_diaria_membro)
    assert lote2.erro == 0
    resultado2, _ = preencher_planilha(caminho_planilha, lote2.processos, [])
    assert resultado2.total_gravado == len(pdfs_diaria_membro)

    registros2 = repositorio_analitico.agregar_indicadores(caminho_sqlite, filtros)
    assert len(registros2) == total_baseline + resultado1.total_gravado + resultado2.total_gravado
    # Nenhum valor da execução 1 pode ter sido perdido pela execução 2 —
    # o próprio bug histórico (941k -> 482k) era exatamente isto.
    por_sei_2 = {r.sei: r.valor_total_diarias for r in registros2}
    for sei, valor in valores_apos_1.items():
        assert por_sei_2[sei] == valor

    # --- Execução 3: Complemento reaproveitando o mesmo lote Padrão ---------
    # Complemento nunca bloqueia por SEI duplicado (RN-14) — mesmo com o
    # arquivo duplicado do lote 1, TODOS os processos deste lote viram
    # INSERIDO agora.
    lote3 = processar_lote(pdfs_exemplo)
    for processo in lote3.processos:
        processo.diaria = replace(
            processo.diaria,
            quantidade_diaria_parcial_complementar=0,
            fonte_quantidade_complementar="Padrão institucional do modo Complemento de Diárias.",
        )
    resultado3, _ = preencher_planilha(
        caminho_planilha, lote3.processos, [], modo=ModoProcessamento.COMPLEMENTO
    )
    assert resultado3.total_gravado == len(lote3.processos)

    registros3 = repositorio_analitico.agregar_indicadores(caminho_sqlite, filtros)
    # As novas linhas do Complemento reaproveitam os MESMOS SEIs da
    # execução 1 (é o propósito do Complemento) — `diarias_completas`
    # deduplica por SEI mantendo a primeira ocorrência, então a contagem
    # de registros na Central não muda; o que importa aqui é que nada
    # quebrou e nenhum valor foi perdido.
    assert len(registros3) == len(registros2)
    por_sei_3 = {r.sei: r.valor_total_diarias for r in registros3}
    for sei, valor in valores_apos_1.items():
        assert por_sei_3[sei] == valor  # execução 1 continua intacta após 2 gravações a mais
