from app.extraction.enriquecimento.transporte_regra_operacional import aplicar_regra_operacional


def test_pernambuco_petrolina_e_aviao():
    assert aplicar_regra_operacional("PERNAMBUCO", "Petrolina") == "AVIÃO"


def test_pernambuco_petrolina_e_insensivel_a_caixa_e_acento():
    assert aplicar_regra_operacional("Pernambuco", "PETROLINA") == "AVIÃO"
    assert aplicar_regra_operacional("pernambuco", "petrolina") == "AVIÃO"


def test_pernambuco_qualquer_outro_municipio_e_carro():
    assert aplicar_regra_operacional("PERNAMBUCO", "Garanhuns") == "CARRO"
    assert aplicar_regra_operacional("PERNAMBUCO", "Recife") == "CARRO"


def test_pernambuco_sem_municipio_final_conhecido_e_carro():
    """Sem saber o município final, a regra ainda decide pelo estado — só
    Petrolina é exceção, então a falta do município cai no caso geral (CARRO)."""
    assert aplicar_regra_operacional("PERNAMBUCO", None) == "CARRO"


def test_paraiba_e_sempre_carro():
    assert aplicar_regra_operacional("PARAÍBA", None) == "CARRO"
    assert aplicar_regra_operacional("PARAÍBA", "João Pessoa") == "CARRO"
    assert aplicar_regra_operacional("Paraiba", "Campina Grande") == "CARRO"


def test_bahia_e_aviao():
    assert aplicar_regra_operacional("BAHIA", "Salvador") == "AVIÃO"


def test_sao_paulo_e_aviao():
    assert aplicar_regra_operacional("SÃO PAULO", "São Paulo") == "AVIÃO"


def test_amazonas_e_aviao():
    assert aplicar_regra_operacional("AMAZONAS", "Manaus") == "AVIÃO"


def test_sem_estado_destino_nao_ha_regra_a_aplicar():
    assert aplicar_regra_operacional(None, "Petrolina") is None
