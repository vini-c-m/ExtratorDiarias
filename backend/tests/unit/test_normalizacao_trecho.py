from app.domain.relatorio_transparencia.normalizacao_trecho import normalizar_trecho


def test_none_e_vazio_viram_none():
    assert normalizar_trecho(None) is None
    assert normalizar_trecho("") is None
    assert normalizar_trecho("   ") is None


def test_uppercase():
    assert normalizar_trecho("Recife-Arcoverde") == "RECIFE-ARCOVERDE"


def test_remove_acentuacao():
    assert normalizar_trecho("NAZARÉ DA MATA-CARPINA") == "NAZARE DA MATA-CARPINA"
    assert normalizar_trecho("BEZERROS-SANTA CRUZ DO CAPIBARIBE E JATAUBA") == normalizar_trecho(
        "BEZERROS - SANTA CRUZ DO CAPIBARIBE E JATAÚBA"
    )


def test_padroniza_espaco_ao_redor_de_hifen():
    assert normalizar_trecho("RECIFE- SERRA TALHADA") == "RECIFE-SERRA TALHADA"
    assert normalizar_trecho("RECIFE - SERRA TALHADA") == "RECIFE-SERRA TALHADA"
    assert normalizar_trecho("RECIFE-SERRA TALHADA") == "RECIFE-SERRA TALHADA"


def test_colapsa_hifen_duplo():
    assert normalizar_trecho("RECIFE--BRASILIA") == "RECIFE-BRASILIA"


def test_colapsa_espacos_multiplos():
    assert normalizar_trecho("PALMARES  - RECIFE") == "PALMARES-RECIFE"


def test_trim():
    assert normalizar_trecho("  ITAPETIM-IBIMIRIM\n") == "ITAPETIM-IBIMIRIM"


def test_caso_confirmado_de_pagamento_duplicado_fica_equivalente():
    """Achado real da auditoria (identificadores fictícios abaixo): o par
    confirmado de pagamento duplicado só é reencontrado pelo detector RN07
    se a normalização absorver a diferença de acentuação/hífen entre as
    duas grafias do mesmo trecho."""
    a = normalizar_trecho("BEZERROS - SANTA CRUZ DO CAPIBARIBE E JATAÚBA")
    b = normalizar_trecho("BEZERROS-SANTA CRUZ DO CAPIBARIBE E JATAUBA")
    assert a == b


def test_ordem_das_localidades_nao_e_normalizada():
    """Proibido por decisão explícita (docs/relatorio-transparencia/README.md
    § 3): A-B nunca é considerado igual a B-A — achado real de um par de OBs
    onde a ida e a volta do mesmo evento têm trechos invertidos e não devem
    ser tratadas como o mesmo trecho."""
    assert normalizar_trecho("MACAPARANA-RECIFE") != normalizar_trecho("RECIFE-MACAPARANA")


def test_destinos_diferentes_nunca_colidem():
    assert normalizar_trecho("ITAPETIM-PEDRA") != normalizar_trecho("ITAPETIM-TRIUNFO")
    assert normalizar_trecho("SALGUEIRO-TRIUNFO") != normalizar_trecho("SALGUEIRO-FLORESTA")


def test_de_e_do_nao_sao_confundidos():
    assert normalizar_trecho("RECIFE-GLORIA DE GOITA") != normalizar_trecho("RECIFE-GLORIA DO GOITA")


def test_abreviacao_sta_sto_nao_e_expandida():
    """Decisão explícita: sem evidência de necessidade (3 ocorrências em
    1828 linhas reais, nenhuma delas parte de um grupo suspeito)."""
    assert normalizar_trecho("CABO DE STO. AGOSTINHO-RIBEIRÃO") != normalizar_trecho(
        "CABO DE SANTO AGOSTINHO-RIBEIRAO"
    )
