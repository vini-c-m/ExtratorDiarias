from app.services.analitica_service import mascarar_cpf


def test_mascara_cpf_valido_de_11_digitos_mantendo_so_os_2_ultimos_visiveis():
    assert mascarar_cpf("12345678911") == "***.***.***-11"


def test_aceita_cpf_ja_formatado_removendo_pontuacao_antes_de_mascarar():
    assert mascarar_cpf("123.456.789-11") == "***.***.***-11"


def test_entrada_com_menos_de_11_digitos_devolve_none_sem_lancar():
    """Diferente de `mascararCpf.ts` (que devolve o valor original) — aqui
    o resultado alimenta `cpf_mascarado`, campo que nunca pode carregar o
    CPF completo; `None` é o único resultado seguro para entrada
    malformada (Sprint 19.5.7.1)."""
    assert mascarar_cpf("123") is None


def test_entrada_com_mais_de_11_digitos_devolve_none_sem_lancar():
    assert mascarar_cpf("123456789112233") is None


def test_string_vazia_devolve_none_sem_lancar():
    assert mascarar_cpf("") is None


def test_entrada_so_com_caracteres_nao_numericos_devolve_none_sem_lancar():
    assert mascarar_cpf("abc") is None
    assert mascarar_cpf("...---") is None


def test_entrada_none_devolve_none_sem_lancar():
    """Sprint 19.5.7.1.1 — correção do achado da Auditoria Técnica da
    19.5.7.1: `mascarar_cpf(None)` levantava `TypeError` antes desta
    correção (a assinatura declarava `cpf: str`, mas nada impedia `None`
    de chegar em runtime). Reproduz exatamente o cenário do bug."""
    assert mascarar_cpf(None) is None


def test_nunca_devolve_o_valor_original_para_entrada_invalida():
    """Confirma explicitamente a divergência deliberada em relação ao par
    do frontend — o valor de entrada malformado nunca aparece no retorno,
    nem mascarado nem cru."""
    entrada_invalida = "12345"
    resultado = mascarar_cpf(entrada_invalida)
    assert resultado != entrada_invalida
    assert resultado is None
