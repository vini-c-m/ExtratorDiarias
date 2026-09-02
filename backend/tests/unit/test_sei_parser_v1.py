from app.domain.rules.validacao_diaria import validar
from app.domain.entities.processo import StatusProcesso
from app.extraction import pdf_reader
from app.extraction.parsers.sei_parser_v1 import SeiParserV1


def _campos(texto: str):
    return SeiParserV1().extrair(texto)


def test_extrai_campos_chave_de_pdf_real(caminho_pdf):
    texto = pdf_reader.ler_texto(caminho_pdf("SEI_19.20.0001.0000101_2025_01.pdf"))
    campos = SeiParserV1().extrair(texto)

    assert campos.sei == "19.20.0001.0000101/2025-01"
    assert campos.cpf == "11111111101"
    assert campos.doc_origem == "UNIDADE TESTE"
    assert campos.cidade_origem == "Recife"
    assert campos.periodo_inicial == "12/09/2025"
    assert campos.periodo_final == "12/09/2025"
    assert campos.motivo


def test_usa_fallback_de_unidade_solicitante_quando_nao_ha_lotacao(caminho_pdf):
    # Nenhum dos PDFs de exemplo tem "LOTAÇÃO:" -- todos caem no fallback
    # "UNIDADE SOLICITANTE:", igual ao script legado.
    texto = pdf_reader.ler_texto(caminho_pdf("SEI_19.20.0001.0000102_2025_02.pdf"))
    campos = SeiParserV1().extrair(texto)

    assert campos.doc_origem == "Coordenação de Sede da PJ Modelo"


def test_todos_os_pdfs_exemplo_tem_campos_chave_extraidos(pdfs_exemplo):
    parser = SeiParserV1()
    for caminho in pdfs_exemplo:
        texto = pdf_reader.ler_texto(caminho)
        campos = parser.extrair(texto)

        assert campos.sei, f"SEI não encontrado em {caminho}"
        assert campos.cpf, f"CPF não encontrado em {caminho}"
        assert campos.periodo_inicial, f"Período inicial não encontrado em {caminho}"
        assert campos.periodo_final, f"Período final não encontrado em {caminho}"


# --- Sprint 04.2 — Caso 1: múltiplos requerimentos de diária -------------


def test_processo_real_com_dois_requerimentos_membro_usa_so_o_ultimo(
    caminho_pdf_multiplos_requerimentos_membro,
):
    """Processo 19.20.0001.0000103/2026-03: o primeiro 'CMFC - Requerimento
    de Diária - Membro' tem a data de ida com o ano errado (2025); um
    despacho da DIMCAC pede a correção, e um segundo requerimento (2026) é
    anexado depois. O período extraído deve vir só do segundo."""
    texto = pdf_reader.ler_texto(caminho_pdf_multiplos_requerimentos_membro)
    campos = _campos(texto)

    assert campos.periodo_inicial == "11/05/2026"
    assert campos.periodo_final == "12/05/2026"


def test_dois_requerimentos_membro_texto_inline_usa_o_ultimo():
    texto = """
    CMFC - Requerimento de Diária - Membro - 1000001
    CIDADE ORIGEM:
      Recife
    CIDADE(S) DESTINO:
      Salvador
    DATA INICIAL:
      10/03/2025
    CMFC - Requerimento de Diária - Membro 1000001         SEI 19.20.0000.0000001/2026-00 / pg. 1

    CMFC - Requerimento de Diária - Membro - 1000002
    CIDADE ORIGEM:
      Recife
    CIDADE(S) DESTINO:
      Salvador
    DATA INICIAL:
      10/03/2026
    CMFC - Requerimento de Diária - Membro 1000002         SEI 19.20.0000.0000001/2026-00 / pg. 2
    """
    campos = _campos(texto)
    assert campos.periodo_inicial == "10/03/2026"


def test_dois_requerimentos_servidor_texto_inline_usa_o_ultimo():
    """A mesma regra do Caso 1 vale igualmente para Diária de Servidor."""
    texto = """
    CMFC - Solicitação de Diária - Servidor - 2000001
    CIDADE ORIGEM:
      Caruaru
    CIDADE(S) DESTINO:
      Recife
    DATA INICIAL:
      05/01/2025
    DATA DE RETORNO:
      05/01/2025
    CMFC - Solicitação de Diária - Servidor 2000001         SEI 19.20.0000.0000002/2026-00 / pg. 1

    CMFC - Solicitação de Diária - Servidor - 2000002
    CIDADE ORIGEM:
      Caruaru
    CIDADE(S) DESTINO:
      Recife
    DATA INICIAL:
      05/01/2026
    DATA DE RETORNO:
      06/01/2026
    CMFC - Solicitação de Diária - Servidor 2000002         SEI 19.20.0000.0000002/2026-00 / pg. 2
    """
    campos = _campos(texto)
    assert campos.periodo_inicial == "05/01/2026"
    assert campos.periodo_final == "06/01/2026"


def test_um_unico_requerimento_continua_extraido_normalmente(pdfs_exemplo):
    """Nenhuma regressão: processos com um único Requerimento/Solicitação —
    todo o conjunto homologado até esta Sprint — continuam extraídos
    exatamente como antes (`ultimo_segmento` não encontra um segundo título
    e o parser usa o texto inteiro, igual ao comportamento pré-Sprint 04.2)."""
    parser = SeiParserV1()
    for caminho in pdfs_exemplo:
        texto = pdf_reader.ler_texto(caminho)
        campos = parser.extrair(texto)
        assert campos.periodo_inicial, f"Período inicial não encontrado em {caminho}"
        assert campos.periodo_final, f"Período final não encontrado em {caminho}"


# --- Sprint 04.2 — Caso 2: data de retorno partida por quebra de página --


def test_processo_real_data_de_retorno_nao_confunde_com_confirmacao_dos_servicos(
    caminho_pdf_data_retorno_confirmacao_servicos,
):
    """Processo 19.20.0001.0000104/2026-04: 'DATA DE RETORNO: 22/05/2026' na
    Solicitação cai bem numa quebra de página (o valor começa na página
    seguinte, depois do rodapé do SEI) — antes desta Sprint, isso fazia o
    're.search' pular direto para a 'Confirmação dos Serviços', um
    documento diferente preenchido depois com um erro de digitação
    ('22/06/2026'). O valor extraído tem que ser o da Solicitação."""
    texto = pdf_reader.ler_texto(caminho_pdf_data_retorno_confirmacao_servicos)
    campos = _campos(texto)

    assert campos.periodo_inicial == "22/05/2026"
    assert campos.periodo_final == "22/05/2026"


def test_valor_de_campo_partido_por_rodape_de_pagina_e_encontrado_mesmo_assim():
    """Reprodução mínima, sem PDF real: o valor do campo cai logo após um
    rodapé de página do SEI ('<documento>         SEI <processo> / pg.
    <n>') — a extração tem que atravessar essa linha, não pular para a
    próxima ocorrência do mesmo rótulo."""
    texto = (
        "CMFC - Solicitação de Diária - Servidor - 3000001\n"
        "CIDADE ORIGEM:\n  Recife\n"
        "CIDADE(S) DESTINO:\n  Salvador\n"
        "DATA INICIAL:\n  01/02/2026\n"
        "DATA DE RETORNO:\n"
        "CMFC - Solicitação de Diária - Servidor 3000001         SEI 19.20.0000.0000003/2026-00 / pg. 1\n"
        "  01/02/2026\n"
        "CMFC - Solicitação de Diária - Servidor 3000001         SEI 19.20.0000.0000003/2026-00 / pg. 2\n"
    )
    campos = _campos(texto)
    assert campos.periodo_final == "01/02/2026"


# --- Sprint de Correção Crítica — extração incorreta de CPF ----------------
#
# Bug original (processo real, hoje substituído por dados fictícios — ver
# `gerar_fixtures_sinteticas.py`, Sprint 10): o PDF trazia um CPF com um
# espaço comum (U+0020) no lugar do ponto entre o 2º e o 3º grupo
# ("CPF:\n333.333 333-01"), confirmado com dois extratores independentes
# (pdfplumber, usado em produção, e PyMuPDF, o fallback do próprio
# `pdf_reader.py`) — o que descartou bug de biblioteca. Não era o rodapé do
# SEI nem quebra de página (o valor estava inteiro numa única linha); o
# mesmo CPF aparecia corretamente pontuado mais adiante no mesmo documento
# -- evidência de que era uma inconsistência de como aquele campo específico
# do formulário tinha sido preenchido, não um padrão estrutural do PDF.
#
# A regex antiga (`[\d.-]+`) não reconhecia espaço como parte de um CPF e
# parava exatamente aí: capturava só o 1º e o 2º grupo -> depois de
# `_somente_numeros`, um fragmento de 6 dígitos. O valor final gravado na
# planilha nascia quando esse fragmento passava pelo formato numérico já
# homologado de gravação do CPF (`_escrever_celula(..., cpf=True)`, máscara
# "00000000000" de 11 dígitos) -- ver `test_escritor_planilha.py`.
#
# Correção (`_PADRAO_VALOR_CPF` em `sei_parser_v1.py`): a regex do valor do
# CPF deixou de ser uma classe de caracteres genérica e passou a ser o
# formato fixo de um CPF -- três grupos de 3 dígitos e um de 2, cada
# separador aceitando no máximo um entre `.`, `-` ou espaço. Isso recupera o
# CPF correto quando o separador é um espaço (o caso real) e, como efeito
# colateral desejável, também deixa de "vazar" para dentro de um campo
# vizinho quando o CPF está colado a outro número sem separador nenhum (a
# forma antiga de `[\d.-]+` conseguia estourar; a nova, com tamanho fixo,
# não tem como). A validação de 11 dígitos (`validacao_diaria._cpf_valido`)
# continua intacta como última barreira, para qualquer causa de corrupção
# que a regex não cubra.


def test_cpf_com_mascara_e_extraido_sem_pontuacao():
    texto = (
        "CPF: 333.333.333-01\n"
        "CIDADE ORIGEM:\n  Recife\n"
    )
    campos = _campos(texto)
    assert campos.cpf == "33333333301"


def test_cpf_sem_mascara_e_extraido_igual():
    texto = "CPF: 33333333301\nCIDADE ORIGEM:\n  Recife\n"
    campos = _campos(texto)
    assert campos.cpf == "33333333301"


def test_cpf_iniciado_por_zero_preserva_o_zero_a_esquerda():
    texto = "CPF: 012.345.678-90\nCIDADE ORIGEM:\n  Recife\n"
    campos = _campos(texto)
    assert campos.cpf == "01234567890"
    assert len(campos.cpf) == 11


def test_processo_real_cpf_com_espaco_interno_e_extraido_corretamente(
    caminho_pdf_cpf_com_espaco_interno,
):
    """Reprodução do bug via fixture de PDF (dados fictícios, ver
    `gerar_fixtures_sinteticas.py`): `pdf_reader.ler_texto` devolve
    'CPF:\\n333.333 333-01' -- o espaço substitui o ponto entre o 2º e o 3º
    grupo. `_PADRAO_VALOR_CPF` reconhece o espaço como um separador válido e
    recupera o CPF completo."""
    texto = pdf_reader.ler_texto(caminho_pdf_cpf_com_espaco_interno)
    assert "333.333 333-01" in texto  # confirma que o texto bruto tem o espaço

    campos = _campos(texto)
    assert campos.cpf == "33333333301"

    processo = validar("SEI_19.20.0001.0000108_2026_08.pdf", campos)
    assert processo.status is StatusProcesso.SUCESSO
    assert processo.diaria.cpf == "33333333301"


def test_cpf_com_espaco_simples_entre_grupos_e_extraido_corretamente():
    """Reprodução mínima do caso original (sem depender do PDF): um único
    espaço no lugar do ponto entre o 2º e o 3º grupo -- exatamente o
    separador reproduzido na fixture `caminho_pdf_cpf_com_espaco_interno`."""
    texto = "CPF: 333.333 333-01\nCIDADE ORIGEM:\n  Recife\n"
    campos = _campos(texto)
    assert campos.cpf == "33333333301"


def test_cpf_partido_por_quebra_de_linha_no_meio_do_valor_nao_e_aceito():
    """Uma quebra de linha crua (não um espaço, não o rodapé do SEI) entre o
    2º e o 3º grupo continua fora do padrão aceito -- `_PADRAO_VALOR_CPF` só
    tolera `.`, `-` ou um espaço simples como separador, nunca `\\n`. Sem
    casar o valor completo, o parser corretamente não encontra nada (`None`)
    em vez de produzir um fragmento -- e isso cai no fluxo de erro já
    existente para CPF ausente, seguro do mesmo jeito."""
    texto = (
        "CPF: 333.333.\n"
        "004-68\n"
        "CIDADE ORIGEM:\n  Recife\n"
    )
    campos = _campos(texto)
    assert campos.cpf is None

    processo = validar("arquivo.pdf", campos)
    assert processo.status is StatusProcesso.ERRO
    assert "CPF não encontrado" in processo.erro.motivos


def test_cpf_partido_por_rodape_sei_no_meio_do_valor_nao_e_aceito():
    """Mesma garantia do teste anterior, mas com o rodapé real do SEI
    (documento + 'SEI <processo> / pg. <n>') no meio -- continua fora do
    padrão aceito (não é `.`, `-` nem espaço) e continua caindo com
    segurança no fluxo de erro, sem inventar um valor."""
    texto = (
        "CMFC - Requerimento de Diária - Membro - 9000138\n"
        "CPF: 333.333.\n"
        "CMFC - Requerimento de Diária - Membro 9000138         "
        "SEI 19.20.0001.0000108/2026-08 / pg. 1\n"
        "004-68\n"
        "CIDADE ORIGEM:\n  Recife\n"
    )
    campos = _campos(texto)
    assert campos.cpf is None

    processo = validar("SEI_19.20.0001.0000108_2026_08.pdf", campos)
    assert processo.status is StatusProcesso.ERRO
    assert "CPF não encontrado" in processo.erro.motivos


def test_pdf_com_mais_de_um_cpf_usa_o_do_ultimo_requerimento():
    """Mesma regra já validada para período (Sprint 04.2, Caso 1) vale para
    CPF: quando há mais de um Requerimento/Solicitação anexado, o CPF tem que
    vir exclusivamente do último -- nunca do primeiro, substituído."""
    texto = """
    CMFC - Requerimento de Diária - Membro - 4000001
    CPF: 111.111.111-11
    CIDADE ORIGEM:
      Recife
    CMFC - Requerimento de Diária - Membro 4000001         SEI 19.20.0000.0000004/2026-00 / pg. 1

    CMFC - Requerimento de Diária - Membro - 4000002
    CPF: 333.333.333-01
    CIDADE ORIGEM:
      Recife
    CMFC - Requerimento de Diária - Membro 4000002         SEI 19.20.0000.0000004/2026-00 / pg. 2
    """
    campos = _campos(texto)
    assert campos.cpf == "33333333301"


def test_numero_administrativo_logo_antes_do_cpf_nao_contamina_a_captura():
    """Um número administrativo (matrícula) sem máscara, colado logo antes
    do rótulo CPF, não pode vazar para dentro da captura -- a regex é ancorada
    em 'CPF:', então só o que vem depois desse rótulo pode entrar."""
    texto = (
        "MATRÍCULA: 0000333333\n"
        "CPF: 333.333.333-01\n"
        "CIDADE ORIGEM:\n  Recife\n"
    )
    campos = _campos(texto)
    assert campos.cpf == "33333333301"


def test_cpf_colado_a_outro_numero_nao_vaza_para_a_captura():
    """Se o CPF estiver colado (sem espaço nem quebra de linha) a outro
    número administrativo pontuado -- ex.: o próprio número do processo,
    sem separador -- a regex antiga (`[\\d.-]+`, uma classe de caracteres
    genérica) capturava os dois como um só trecho maior que 11 dígitos
    (cenário "regex capturando um trecho maior que o CPF"). `_PADRAO_VALOR_
    CPF`, por exigir o formato fixo 3-3-3-2, para exatamente no 2º grupo de
    2 dígitos e não avança para dentro do número colado em seguida -- o CPF
    certo é extraído mesmo com o vizinho grudado, sem precisar da
    validação para descartar um valor inflado."""
    texto = "CPF:333.333.333-0119.20.0001.0000108\nCIDADE ORIGEM:\n  Recife\n"
    campos = _campos(texto)
    assert campos.cpf == "33333333301"

    # O CPF em si já é válido (11 dígitos corretos) -- não precisa do
    # fallback de "CPF inválido" da validação para este caso.
    processo = validar("arquivo.pdf", campos)
    assert not any("CPF" in m for m in (processo.erro.motivos if processo.erro else []))


# --- Programa de Validação Evolutiva (2026-08-05) — SEI errado por citação
# alheia num anexo posterior ---------------------------------------------


def test_citacao_de_sei_alheio_em_anexo_posterior_nao_contamina_a_extracao():
    """Processo real SEI 19.20.100000001.0014706/2026-11 (reprodução
    sintética — Política de Dados Sintéticos, `CONTRIBUTING.md`): um anexo
    "EXTERNO CONFIRMAÇÃO DE SERVIÇO ASSINADA VIA GOV.BR" reproduz o
    cabeçalho da própria Solicitação (mesmo id do documento), fazendo
    `ultimo_segmento` reabrir o segmento a partir dele e arrastar para
    dentro conteúdo bem posterior do processo — no caso real, um Diário
    Oficial Eletrônico que cita, em prosa, o número de um processo
    totalmente diferente ("...atestada nos autos do SEI
    19.20.9999.9999999/2026-00..."). Antes da correção, `re.search(r"SEI\\s*
    ([\\d./-]+)")` (sem âncora além da palavra "SEI") casava com essa
    citação alheia primeiro. Agora o parser prefere o padrão de rodapé
    "SEI <NUP> / pg. <N>" — que só o próprio sistema SEI grava, nunca uma
    citação em prosa —, então o rodapé genuíno da Solicitação (mais
    adiante no mesmo texto) é encontrado primeiro."""
    texto = (
        "CMFC - Solicitação de Diária - Servidor - 1523645\n"
        "CIDADE ORIGEM:\n  Caruaru\n"
        "CIDADE(S) DESTINO:\n  Recife\n"
        "DATA INICIAL:\n  06/08/2026\n"
        "DATA DE RETORNO:\n  07/08/2026\n"
        "CMFC - Solicitação de Diária - Servidor 1523645"
        "         SEI 19.20.7777.0000001/2026-77 / pg. 1\n"
        # Reprodução do mesmo documento (mesmo id "1523645") — dispara
        # `ultimo_segmento` a reabrir o segmento aqui.
        "CMFC - Solicitação de Diária - Servidor - 1523645\n"
        "CIDADE ORIGEM:\n  Caruaru\n"
        "CIDADE(S) DESTINO:\n  Recife\n"
        "DATA INICIAL:\n  06/08/2026\n"
        "DATA DE RETORNO:\n  07/08/2026\n"
        # Conteúdo alheio (anexado depois, dentro do mesmo segmento
        # bloat) citando, em prosa, um processo TOTALMENTE diferente —
        # sem o sufixo "/ pg. N" que só um rodapé de página tem.
        "CONSIDERANDO a disponibilidade orçamentária, devidamente atestada "
        "nos autos do SEI 19.20.9999.9999999/2026-00, RESOLVE...\n"
        "CMFC - Solicitação de Diária - Servidor 1523645"
        "         SEI 19.20.7777.0000001/2026-77 / pg. 3\n"
    )

    campos = _campos(texto)

    assert campos.sei == "19.20.7777.0000001/2026-77"
    assert campos.cidade_origem == "Caruaru"
    assert campos.cidade_destino == "Recife"


def test_layout_antigo_sem_rodape_de_pagina_continua_usando_o_padrao_solto():
    """Sem nenhum rodapé "SEI ... / pg. N" no texto (layout antigo, já
    homologado antes desta correção), o parser cai de volta no padrão
    solto original — comportamento intocado para esse caso."""
    texto = "SEI 19.20.0001.0000109/2026-09\nCIDADE ORIGEM:\n  Recife\n"

    campos = _campos(texto)

    assert campos.sei == "19.20.0001.0000109/2026-09"


# --- Programa Permanente de QA Evolutivo (2026-08-06) — FINALIDADE DA
# VIAGEM quebrada em duas linhas no PDF ------------------------------------


def test_finalidade_da_viagem_quebrada_em_duas_linhas_nao_e_truncada():
    """Processo real SEI 19.20.0001.0001165/2026-47 (reprodução sintética —
    Política de Dados Sintéticos, `CONTRIBUTING.md`): "FINALIDADE DA VIAGEM"
    é o único campo de texto livre do formulário, então é o único que
    ocasionalmente quebra em mais de uma linha no PDF. Antes da correção, o
    padrão de valor padrão de `_buscar_campo` (`(.*)`, sem DOTALL) parava no
    primeiro '\\n' e perdia silenciosamente "municipalidade." — sem erro,
    sem aviso, só um MOTIVO cortado no meio da frase gravado na planilha."""
    texto = (
        "FINALIDADE DA VIAGEM:\n"
        "Realizar a notificação para a audiência de custódia, bem como "
        "proceder à entrega de ofício à\n"
        "municipalidade.\n"
        "CIDADE ORIGEM:\n"
        "Ouricuri\n"
        "CIDADE(S) DESTINO:\n"
        "Santa Filomena/PE\n"
        "DATA INICIAL:\n"
        "21/01/2026\n"
        "DATA DE RETORNO:\n"
        "21/01/2026\n"
        "SEI 19.20.4444.0000001/2026-44 / pg. 1\n"
    )

    campos = _campos(texto)

    assert campos.motivo == (
        "Realizar a notificação para a audiência de custódia, bem como "
        "proceder à entrega de ofício à municipalidade."
    )
    # O sufixo de UF do campo bruto continua intacto aqui — só a
    # apresentação em TRECHO remove ("escritor_planilha.remover_sufixo_uf",
    # ver `test_local_destino.py`); a resolução de estado/cidade depende
    # dele para desambiguar.
    assert campos.cidade_destino == "Santa Filomena/PE"


def test_finalidade_da_viagem_de_uma_linha_so_continua_intocada():
    """Garantia de não regressão: o caso comum (motivo em uma linha só)
    continua funcionando exatamente como antes — o novo padrão multilinha
    para no próximo rótulo conhecido tanto para um valor de uma linha
    quanto de várias."""
    texto = (
        "FINALIDADE DA VIAGEM:\n"
        "Acompanhar a SGMP para assunto Institucional.\n"
        "CIDADE ORIGEM:\n"
        "Recife\n"
        "SEI 19.20.4444.0000002/2026-45 / pg. 1\n"
    )

    campos = _campos(texto)

    assert campos.motivo == "Acompanhar a SGMP para assunto Institucional."


# --- Sprint de Correção Crítica (Plan Mode revisado) — extração robusta da
# última ocorrência quando ela tem o rodapé sobreposto/corrompido pelo
# próprio SEI (processo real 19.20.100000001.0016125/2026-70). Regra de
# negócio inegociável, verificada em TODOS os testes abaixo: o último
# documento sempre vence — nunca há recuo para uma Solicitação/Requerimento
# anterior, mesmo quando a última é difícil de extrair. A única exceção é o
# SEI, que é metadado do PROCESSO (idêntico em toda página), não do
# documento — por isso pode ter uma fonte estrutural fora do segmento
# (`_sei_por_consenso_estrutural`), nunca os demais campos. -----------------


def test_campo_ausente_no_segundo_requerimento_nunca_recupera_do_primeiro():
    """Caso C: o segundo (vigente) Requerimento não tem CIDADE(S) DESTINO —
    o valor fica ausente (é dele que a extração continua vindo), nunca
    recuperado do primeiro, mesmo que o primeiro tivesse o campo preenchido."""
    texto = """
    CMFC - Solicitação de Diária - Servidor - 7000001
    CIDADE ORIGEM:
      Recife
    CIDADE(S) DESTINO:
      Garanhuns
    DATA INICIAL:
      01/10/2026
    DATA DE RETORNO:
      01/10/2026
    CMFC - Solicitação de Diária - Servidor 7000001         SEI 19.20.0000.0000007/2026-00 / pg. 1

    CMFC - Solicitação de Diária - Servidor - 7000002
    CIDADE ORIGEM:
      Recife
    DATA INICIAL:
      02/10/2026
    DATA DE RETORNO:
      02/10/2026
    CMFC - Solicitação de Diária - Servidor 7000002         SEI 19.20.0000.0000007/2026-00 / pg. 2
    """
    campos = _campos(texto)

    assert campos.periodo_inicial == "02/10/2026"
    assert campos.cidade_destino is None  # nunca "Garanhuns", herdado do primeiro


def test_corrupcao_severa_atingindo_o_corpo_gera_erro_nunca_usa_o_primeiro():
    """Caso F: se a corrupção fosse severa o bastante para atingir também o
    corpo do formulário (não só o rodapé) e nenhum campo pudesse ser extraído
    da última ocorrência, o resultado é erro explícito -- nunca um fallback
    silencioso para os dados do primeiro documento."""
    texto = """
    CMFC - Solicitação de Diária - Servidor - 1100001
    CIDADE ORIGEM:
      Recife
    CIDADE(S) DESTINO:
      Garanhuns
    DATA INICIAL:
      01/11/2026
    DATA DE RETORNO:
      01/11/2026
    CPF:
      11111111111
    CMFC - Solicitação de Diária - Servidor 1100001         SEI 19.20.0000.0000011/2026-00 / pg. 1

    CMFC - Solicitação de Diária - Servidor - 1100002
    """
    campos = _campos(texto)

    assert campos.periodo_inicial is None
    assert campos.periodo_final is None
    assert campos.cpf is None
    assert campos.cidade_destino is None

    processo = validar("arquivo.pdf", campos)
    assert processo.status is StatusProcesso.ERRO
    assert "Período inicial não encontrado" in processo.erro.motivos
    assert "Período final não encontrado" in processo.erro.motivos
    assert "CPF não encontrado" in processo.erro.motivos


def test_processo_real_rodape_sobreposto_extrai_da_segunda_solicitacao_vigente(
    caminho_pdf_rodape_sobreposto,
):
    """Casos D/E/I: reprodução com fixture sintética (Caso 6) do padrão do
    processo real. A segunda Solicitação (páginas 3-4) tem o próprio rodapé
    sobreposto/corrompido, removido por `pdf_reader.py` — o parser extrai
    dela mesma assim (nunca recua para a primeira, página 1, que tem
    18/09/2026 em vez de 19/09/2026) e `DATA DE RETORNO` resolve
    corretamente mesmo com o valor partido pela quebra de página 3->4."""
    texto = pdf_reader.ler_texto(caminho_pdf_rodape_sobreposto)
    campos = _campos(texto)

    assert campos.periodo_inicial == "19/09/2026"
    assert campos.periodo_final == "19/09/2026"
    assert campos.cpf == "11122233396"
    assert campos.doc_origem == "UNIDADE TESTE"

    processo = validar("SEI_19.20.0001.0000117_2026_17.pdf", campos)
    assert processo.status is StatusProcesso.SUCESSO


def test_sei_primario_falha_mas_consenso_estrutural_do_processo_e_inequivoco():
    """Caso K: o segmento da última Solicitação não tem nenhum rodapé
    reconhecível (ex.: removido por `pdf_reader.py` por estar corrompido),
    mas o mesmo NUP aparece limpo, no formato de rodapé, em outras páginas do
    mesmo processo — maioria clara, sem ambiguidade, mínimo de 2 ocorrências."""
    texto = (
        "CMFC - Solicitação de Diária - Servidor - 8000001\n"
        "CIDADE ORIGEM:\n  Recife\n"
        "SEI 19.20.0000.0000008/2026-08 / pg. 1\n"
        "CMFC - Confirmação dos Serviços - Diária -Servidor - 8000002\n"
        "SEI 19.20.0000.0000008/2026-08 / pg. 2\n"
        "CMFC - Solicitação de Diária - Servidor - 8000003\n"
        "CIDADE ORIGEM:\n  Recife\n"
        "CIDADE(S) DESTINO:\n  Garanhuns\n"
        "DATA INICIAL:\n  03/10/2026\n"
        "DATA DE RETORNO:\n  03/10/2026\n"
    )

    campos = _campos(texto)

    assert campos.sei == "19.20.0000.0000008/2026-08"


def test_sei_primario_falha_com_apenas_uma_ocorrencia_estrutural_nao_adivinha():
    """Uma única ocorrência isolada do rodapé em todo o processo não é
    'consenso' — o mínimo de `_MINIMO_OCORRENCIAS_CONSENSO_SEI` (2) não é
    alcançado, então o fallback não retorna nada."""
    texto = (
        "CMFC - Confirmação dos Serviços - Diária -Servidor - 8100001\n"
        "SEI 19.20.0000.0000081/2026-81 / pg. 1\n"
        "CMFC - Solicitação de Diária - Servidor - 8100002\n"
        "CIDADE ORIGEM:\n  Recife\n"
        "DATA INICIAL:\n  06/10/2026\n"
        "DATA DE RETORNO:\n  06/10/2026\n"
    )

    campos = _campos(texto)

    assert campos.sei is None


def test_fallback_de_sei_tambem_ignora_citacao_incidental_sem_sufixo_pg():
    """Caso L (fallback): mesmo quando a extração primária falha e o
    fallback estrutural entra em ação, uma citação incidental a outro
    processo (sem o sufixo "/ pg. N", igual ao Diário Oficial anexado no
    processo real) continua sendo ignorada — só o NUP com o rodapé de
    página genuíno pode vencer."""
    texto = (
        "CONSIDERANDO a disponibilidade orçamentária, devidamente atestada "
        "nos autos do SEI 19.20.9999.9999999/2026-99, RESOLVE...\n"
        "CMFC - Solicitação de Diária - Servidor - 9000001\n"
        "SEI 19.20.0000.0000009/2026-09 / pg. 1\n"
        "CMFC - Confirmação dos Serviços - Diária -Servidor - 9000002\n"
        "SEI 19.20.0000.0000009/2026-09 / pg. 2\n"
        "CMFC - Solicitação de Diária - Servidor - 9000003\n"
        "CIDADE ORIGEM:\n  Recife\n"
        "DATA INICIAL:\n  04/10/2026\n"
        "DATA DE RETORNO:\n  04/10/2026\n"
    )

    campos = _campos(texto)

    assert campos.sei == "19.20.0000.0000009/2026-09"


def test_fallback_de_sei_nao_adivinha_quando_ha_empate_entre_nups():
    """Caso M: dois NUPs diferentes aparecem o MESMO número de vezes (2) no
    formato de rodapé — ambíguo, o fallback não escolhe nenhum dos dois."""
    texto = (
        "CMFC - Confirmação dos Serviços - Diária -Servidor - 1000091\n"
        "SEI 19.20.0000.0000010/2026-10 / pg. 1\n"
        "CMFC - Confirmação dos Serviços - Diária -Servidor - 1000092\n"
        "SEI 19.20.0000.0000010/2026-10 / pg. 2\n"
        "CMFC - Confirmação dos Serviços - Diária -Servidor - 1000093\n"
        "SEI 19.20.0000.0000011/2026-11 / pg. 3\n"
        "CMFC - Confirmação dos Serviços - Diária -Servidor - 1000094\n"
        "SEI 19.20.0000.0000011/2026-11 / pg. 4\n"
        "CMFC - Solicitação de Diária - Servidor - 1000095\n"
        "CIDADE ORIGEM:\n  Recife\n"
        "DATA INICIAL:\n  05/10/2026\n"
        "DATA DE RETORNO:\n  05/10/2026\n"
    )

    campos = _campos(texto)

    assert campos.sei is None

    processo = validar("arquivo.pdf", campos)
    assert processo.status is StatusProcesso.ERRO
    assert "SEI não encontrado" in processo.erro.motivos


def test_sei_primario_funciona_fallback_nunca_e_acionado():
    """Caso J, reafirmado: quando a extração primária encontra o SEI dentro
    do segmento da última Solicitação, o fallback estrutural nunca entra em
    ação — mesmo que o texto completo tivesse outro NUP mais frequente em
    outro lugar, o valor do próprio segmento sempre vence."""
    texto = (
        "CMFC - Confirmação dos Serviços - Diária -Servidor - 1200001\n"
        "SEI 19.20.0000.0000099/2026-99 / pg. 1\n"
        "CMFC - Confirmação dos Serviços - Diária -Servidor - 1200002\n"
        "SEI 19.20.0000.0000099/2026-99 / pg. 2\n"
        "CMFC - Confirmação dos Serviços - Diária -Servidor - 1200003\n"
        "SEI 19.20.0000.0000099/2026-99 / pg. 3\n"
        "CMFC - Solicitação de Diária - Servidor - 1200004\n"
        "CIDADE ORIGEM:\n  Recife\n"
        "DATA INICIAL:\n  07/10/2026\n"
        "DATA DE RETORNO:\n  07/10/2026\n"
        "CMFC - Solicitação de Diária - Servidor 1200004"
        "         SEI 19.20.0000.0000012/2026-12 / pg. 4\n"
    )

    campos = _campos(texto)

    assert campos.sei == "19.20.0000.0000012/2026-12"
