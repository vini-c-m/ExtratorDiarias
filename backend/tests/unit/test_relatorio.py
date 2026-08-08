from app.domain.entities.fonte_doc_origem import FonteDocOrigem
from app.domain.entities.fonte_transporte import FonteTransporte
from app.domain.entities.tipo_processo import TipoProcesso
from app.planilha.escritor_planilha import CategoriaResultado, ItemResultado, ResultadoPreenchimento
from app.planilha.relatorio import ItemAviso, ItemErro, gerar_relatorio_html


def _item_sucesso(
    arquivo: str = "sucesso.pdf",
    sei: str = "19.20.0000.0000001/2025-00",
    linha: int = 4,
    tipo_processo: TipoProcesso = TipoProcesso.PADRAO,
    valor_total_diarias: str | None = None,
) -> ItemResultado:
    """Item totalmente resolvido: transporte e estado do destino presentes
    (e valor das diárias presente, se for Diária de Membro) — o único caso
    que deve cair em 'Inserido automaticamente', não em 'Revisão recomendada'."""
    return ItemResultado(
        arquivo_origem=arquivo,
        sei=sei,
        categoria=CategoriaResultado.INSERIDO,
        linha=linha,
        tipo_processo=tipo_processo,
        valor_total_diarias=valor_total_diarias,
        transporte="CARRO",
        transporte_fonte=FonteTransporte.EVIDENCIA_DOCUMENTAL,
        estado_destino="PERNAMBUCO",
    )


def _resultado(itens: list[ItemResultado]) -> ResultadoPreenchimento:
    return ResultadoPreenchimento(
        total_gravado=len(itens),
        duplicadas_ignoradas=0,
        linha_inicial=4,
        linha_final=4 + len(itens) - 1,
        itens=itens,
    )


def test_resumo_executivo_mostra_os_6_indicadores(tmp_path):
    resultado = _resultado([_item_sucesso()])
    erros = [ItemErro(arquivo_origem="quebrado.pdf", motivos=["SEI não encontrado"])]

    caminho_relatorio = str(tmp_path / "relatorio.html")
    gerar_relatorio_html(
        caminho_relatorio, "planilha.xlsx", resultado, erros, tempo_processamento_ms=65_000
    )

    conteudo = open(caminho_relatorio, encoding="utf-8").read()

    assert "PDFs analisados" in conteudo
    assert "Diárias inseridas" in conteudo
    assert "Duplicados" in conteudo
    assert "Revisões recomendadas" in conteudo
    assert "Necessitam inserção manual" in conteudo
    assert "Tempo de processamento" in conteudo
    assert "1min 5s" in conteudo


def test_sem_tempo_informado_mostra_traco(tmp_path):
    caminho_relatorio = str(tmp_path / "relatorio.html")
    gerar_relatorio_html(caminho_relatorio, "planilha.xlsx", _resultado([_item_sucesso()]), [])

    conteudo = open(caminho_relatorio, encoding="utf-8").read()
    assert "—" in conteudo


def test_item_totalmente_resolvido_e_sucesso_nao_atencao(tmp_path):
    item = _item_sucesso(
        tipo_processo=TipoProcesso.DIARIA_MEMBRO, valor_total_diarias="652,96"
    )
    caminho_relatorio = str(tmp_path / "relatorio.html")
    gerar_relatorio_html(caminho_relatorio, "planilha.xlsx", _resultado([item]), [])

    conteudo = open(caminho_relatorio, encoding="utf-8").read()

    assert "✔ Inserido automaticamente" in conteudo
    assert "⚠ Revisão recomendada" not in conteudo
    assert "Nenhuma diária inserida precisou de revisão adicional" in conteudo
    assert "Diária de Membro" in conteudo
    assert "R$ 652,96" in conteudo
    assert "Origem do Transporte" in conteudo
    assert "Evidência documental" in conteudo


# --- Sprint 07.2 — identidade unificada com o app, impressão, autossuficiência ---


def test_cabecalho_com_identidade_do_app_presente(tmp_path):
    """O cabeçalho do relatório passa a ser exatamente o mesmo bloco de
    marca do aplicativo desktop (logo + nome + tagline) — nenhuma
    referência institucional (MPPE/DIMCAC), conforme Sprint 07.2."""
    from datetime import datetime

    agora = datetime(2026, 7, 15, 14, 32, 18)
    caminho_relatorio = str(tmp_path / "relatorio.html")
    gerar_relatorio_html(
        caminho_relatorio, "planilha.xlsx", _resultado([_item_sucesso()]), [], agora=agora
    )

    conteudo = open(caminho_relatorio, encoding="utf-8").read()

    assert "Ministério Público de Pernambuco" not in conteudo
    assert "DIMCAC" not in conteudo
    assert "Automatizador de Diárias" in conteudo
    assert "Automação Inteligente de Processos" in conteudo
    assert 'aria-label="Automatizador de Diárias"' in conteudo  # logo (mesmo monograma do app)
    assert "Gerado em 15/07/2026 14:32:18" in conteudo
    assert "Planilha: planilha.xlsx" in conteudo


def test_rodape_com_identidade_do_app_presente(tmp_path):
    """Rodapé simples com a marca (Sprint 07.2), no lugar do rodapé
    institucional anterior."""
    from datetime import datetime

    agora = datetime(2026, 7, 15, 14, 32, 18)
    caminho_relatorio = str(tmp_path / "relatorio.html")
    gerar_relatorio_html(
        caminho_relatorio, "planilha.xlsx", _resultado([_item_sucesso()]), [], agora=agora
    )

    conteudo = open(caminho_relatorio, encoding="utf-8").read()

    assert 'class="rodape-marca"' in conteudo
    assert "Automatizador de Diárias" in conteudo
    assert "Automação Inteligente de Processos" in conteudo
    assert "Versão 2.0" in conteudo
    assert "Gerado em 15/07/2026 às 14:32:18" in conteudo


def test_botao_imprimir_presente_e_oculto_na_impressao(tmp_path):
    caminho_relatorio = str(tmp_path / "relatorio.html")
    gerar_relatorio_html(caminho_relatorio, "planilha.xlsx", _resultado([_item_sucesso()]), [])

    conteudo = open(caminho_relatorio, encoding="utf-8").read()

    assert 'onclick="window.print()"' in conteudo
    assert "@media print" in conteudo
    assert ".acoes-relatorio { display: none; }" in conteudo


def test_relatorio_e_autossuficiente_sem_recursos_externos(tmp_path):
    caminho_relatorio = str(tmp_path / "relatorio.html")
    gerar_relatorio_html(caminho_relatorio, "planilha.xlsx", _resultado([_item_sucesso()]), [])

    conteudo = open(caminho_relatorio, encoding="utf-8").read()

    assert "<link" not in conteudo
    assert "<script src" not in conteudo
    assert "http://" not in conteudo
    assert "https://" not in conteudo


def test_transporte_nao_identificado_gera_revisao_recomendada_com_orientacao(tmp_path):
    item = ItemResultado(
        arquivo_origem="sem_transporte.pdf",
        sei="19.20.0000.0000002/2025-00",
        categoria=CategoriaResultado.INSERIDO,
        linha=4,
        estado_destino="PERNAMBUCO",
        transporte=None,
    )
    caminho_relatorio = str(tmp_path / "relatorio.html")
    gerar_relatorio_html(caminho_relatorio, "planilha.xlsx", _resultado([item]), [])

    conteudo = open(caminho_relatorio, encoding="utf-8").read()

    assert "⚠ Revisão recomendada" in conteudo
    assert "Não foi possível determinar o transporte." in conteudo
    assert (
        "Conferir o despacho do processo e preencher manualmente a coluna TRANSPORTE."
        in conteudo
    )
    assert "Nenhuma diária inserida sem pendências nesta execução" in conteudo


def test_local_nao_identificado_gera_revisao_recomendada_com_orientacao(tmp_path):
    item = ItemResultado(
        arquivo_origem="sem_local.pdf",
        sei="19.20.0000.0000003/2025-00",
        categoria=CategoriaResultado.INSERIDO,
        linha=4,
        transporte="CARRO",
        transporte_fonte=FonteTransporte.EVIDENCIA_DOCUMENTAL,
        estado_destino=None,
    )
    caminho_relatorio = str(tmp_path / "relatorio.html")
    gerar_relatorio_html(caminho_relatorio, "planilha.xlsx", _resultado([item]), [])

    conteudo = open(caminho_relatorio, encoding="utf-8").read()

    assert "⚠ Revisão recomendada" in conteudo
    assert "Não foi possível identificar com segurança o município informado." in conteudo
    assert "Verifique o processo SEI e preencha manualmente a coluna LOCAL da planilha." in conteudo


def test_diaria_de_membro_sem_valor_gera_revisao_recomendada_com_orientacao(tmp_path):
    item = ItemResultado(
        arquivo_origem="sem_valor.pdf",
        sei="19.20.0000.0000004/2025-00",
        categoria=CategoriaResultado.INSERIDO,
        linha=4,
        tipo_processo=TipoProcesso.DIARIA_MEMBRO,
        valor_total_diarias=None,
        transporte="CARRO",
        transporte_fonte=FonteTransporte.EVIDENCIA_DOCUMENTAL,
        estado_destino="PERNAMBUCO",
    )
    caminho_relatorio = str(tmp_path / "relatorio.html")
    gerar_relatorio_html(caminho_relatorio, "planilha.xlsx", _resultado([item]), [])

    conteudo = open(caminho_relatorio, encoding="utf-8").read()

    assert "⚠ Revisão recomendada" in conteudo
    assert "Não foi possível identificar o valor das diárias no despacho do GABPGJ." in conteudo
    assert (
        "Verifique o despacho do processo e preencha manualmente a coluna "
        "VALOR TOTAL DAS DIÁRIAS." in conteudo
    )


def test_diaria_padrao_sem_valor_nao_gera_pendencia_de_valor(tmp_path):
    """Diária Padrão nunca preenche a coluna P — não faz sentido cobrar
    'revisão' de um campo que essa Sprint (04) nunca tenta preencher para
    esse tipo de processo."""
    item = _item_sucesso(tipo_processo=TipoProcesso.PADRAO, valor_total_diarias=None)
    caminho_relatorio = str(tmp_path / "relatorio.html")
    gerar_relatorio_html(caminho_relatorio, "planilha.xlsx", _resultado([item]), [])

    conteudo = open(caminho_relatorio, encoding="utf-8").read()

    assert "✔ Inserido automaticamente" in conteudo
    assert "VALOR TOTAL DAS DIÁRIAS" not in conteudo


def test_documento_habil_nao_localizado_e_esperado_nao_gera_pendencia(tmp_path):
    """DH ainda não localizado (processo não chegou à fase de liquidação) é
    esperado, não uma pendência — só o conflito de mais de um DH é."""
    item = _item_sucesso()
    avisos = [
        ItemAviso(
            arquivo_origem=item.arquivo_origem,
            mensagens=[
                "Documento Hábil (DH) não localizado — processo provavelmente ainda não "
                "chegou à fase de liquidação."
            ],
        )
    ]
    caminho_relatorio = str(tmp_path / "relatorio.html")
    gerar_relatorio_html(caminho_relatorio, "planilha.xlsx", _resultado([item]), [], avisos)

    conteudo = open(caminho_relatorio, encoding="utf-8").read()

    assert "✔ Inserido automaticamente" in conteudo
    assert "⚠ Revisão recomendada" not in conteudo
    # A mensagem original continua preservada na seção técnica recolhida.
    assert "Observações técnicas adicionais" in conteudo
    assert "ainda não" in conteudo


def test_conflito_de_documento_habil_gera_revisao_recomendada(tmp_path):
    item = _item_sucesso()
    avisos = [
        ItemAviso(
            arquivo_origem=item.arquivo_origem,
            mensagens=["Mais de um Documento Hábil encontrado no processo (2025DH000001, 2025DH000002)"],
        )
    ]
    caminho_relatorio = str(tmp_path / "relatorio.html")
    gerar_relatorio_html(caminho_relatorio, "planilha.xlsx", _resultado([item]), [], avisos)

    conteudo = open(caminho_relatorio, encoding="utf-8").read()

    assert "⚠ Revisão recomendada" in conteudo
    assert "Foi encontrado mais de um Documento Hábil no processo." in conteudo
    assert "confirme manualmente o número correto na coluna DH" in conteudo


def test_erro_de_extracao_e_critico_em_caixa_alta_com_motivo_e_acao(tmp_path):
    erros = [ItemErro(arquivo_origem="quebrado.pdf", motivos=["SEI não encontrado", "CPF não encontrado"])]
    caminho_relatorio = str(tmp_path / "relatorio.html")
    gerar_relatorio_html(caminho_relatorio, "planilha.xlsx", _resultado([]), erros)

    conteudo = open(caminho_relatorio, encoding="utf-8").read()

    assert "❌ NECESSITA INSERÇÃO MANUAL" in conteudo
    assert "quebrado.pdf" in conteudo
    assert "SEI não encontrado; CPF não encontrado" in conteudo
    assert "insira o registro manualmente na planilha" in conteudo
    assert 'class="selo critico"' in conteudo


def test_sem_erros_secao_critica_fica_vazia(tmp_path):
    caminho_relatorio = str(tmp_path / "relatorio.html")
    gerar_relatorio_html(caminho_relatorio, "planilha.xlsx", _resultado([_item_sucesso()]), [])

    conteudo = open(caminho_relatorio, encoding="utf-8").read()

    assert "❌ NECESSITA INSERÇÃO MANUAL" not in conteudo
    assert "Nenhum processo precisou de inserção manual" in conteudo


def test_paleta_da_marca_aplicada(tmp_path):
    """Sprint 07.2 — o relatório usa exatamente a paleta do Design System do
    aplicativo (fundo `#0F172A`, degradê azul→ciano→roxo), substituindo a
    paleta institucional dourada das Sprints anteriores."""
    caminho_relatorio = str(tmp_path / "relatorio.html")
    gerar_relatorio_html(caminho_relatorio, "planilha.xlsx", _resultado([_item_sucesso()]), [])

    conteudo = open(caminho_relatorio, encoding="utf-8").read()

    assert "#0F172A" in conteudo  # fundo da marca
    assert "#2563EB" in conteudo  # degradê — azul
    assert "#06B6D4" in conteudo  # degradê — ciano
    assert "#8B5CF6" in conteudo  # degradê — roxo
    assert "#9c7a24" not in conteudo  # dourado institucional antigo


def test_duplicados_continuam_listados(tmp_path):
    resultado = ResultadoPreenchimento(
        total_gravado=1,
        duplicadas_ignoradas=2,
        linha_inicial=4,
        linha_final=4,
        itens=[
            _item_sucesso(arquivo="original.pdf"),
            ItemResultado(
                arquivo_origem="duplicado_lote.pdf",
                sei="19.20.0000.0000005/2025-00",
                categoria=CategoriaResultado.DUPLICADO_NO_LOTE,
            ),
            ItemResultado(
                arquivo_origem="duplicado_planilha.pdf",
                sei="19.20.0000.0000006/2025-00",
                categoria=CategoriaResultado.DUPLICADO_NA_PLANILHA,
                linha=2,
            ),
        ],
    )
    caminho_relatorio = str(tmp_path / "relatorio.html")
    gerar_relatorio_html(caminho_relatorio, "planilha.xlsx", resultado, [])

    conteudo = open(caminho_relatorio, encoding="utf-8").read()

    assert "duplicado_lote.pdf" in conteudo
    assert "duplicado_planilha.pdf" in conteudo
    assert "Duplicados" in conteudo  # cartão do resumo executivo


# --- Sprint 06 — DOC DE ORIGEM: aviso só quando a Prioridade 2 (fallback) é usada ---


def test_doc_origem_do_historico_dimcac_nao_gera_pendencia(tmp_path):
    """Prioridade 1: quando o CPF já tinha histórico na planilha oficial do
    DIMCAC, não há nenhum aviso — a informação já é homologada."""
    item = _item_sucesso()  # doc_origem_fonte não informado (None) — sem pendência
    caminho_relatorio = str(tmp_path / "relatorio.html")
    gerar_relatorio_html(caminho_relatorio, "planilha.xlsx", _resultado([item]), [])

    conteudo = open(caminho_relatorio, encoding="utf-8").read()

    assert "✔ Inserido automaticamente" in conteudo
    assert "⚠ Revisão recomendada" not in conteudo
    assert "DOC DE ORIGEM preenchido através da extração do processo" not in conteudo


def test_doc_origem_por_extracao_do_pdf_gera_revisao_recomendada_com_orientacao(tmp_path):
    """Prioridade 2 (fallback): quando não há histórico do CPF na planilha
    oficial do DIMCAC, a coluna C continua preenchida normalmente pela
    extração do PDF, já homologada — mas o relatório sinaliza a
    conferência manual, sem tratar isso como erro de processamento."""
    item = ItemResultado(
        arquivo_origem="sem_historico.pdf",
        sei="19.20.0000.0000007/2025-00",
        categoria=CategoriaResultado.INSERIDO,
        linha=4,
        transporte="CARRO",
        transporte_fonte=FonteTransporte.EVIDENCIA_DOCUMENTAL,
        estado_destino="PERNAMBUCO",
        doc_origem_fonte=FonteDocOrigem.EXTRACAO_PDF,
    )
    caminho_relatorio = str(tmp_path / "relatorio.html")
    gerar_relatorio_html(caminho_relatorio, "planilha.xlsx", _resultado([item]), [])

    conteudo = open(caminho_relatorio, encoding="utf-8").read()

    assert "⚠ Revisão recomendada" in conteudo
    assert (
        "DOC DE ORIGEM preenchido através da extração do processo. Não foi localizado "
        "histórico deste servidor na planilha oficial do DIMCAC." in conteudo
    )
    assert (
        "Recomenda-se conferir manualmente a nomenclatura institucional da unidade "
        "administrativa" in conteudo
    )
    assert "❌ NECESSITA INSERÇÃO MANUAL" not in conteudo
