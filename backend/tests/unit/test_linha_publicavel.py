"""Sprint 3 (HOMO-RT-06, plano "Valor da Passagem no XLSX Oficial + Não
Publicadas") — testes de `valor_passagem_publicavel`, a função canônica ÚNICA
que resolve o Valor da Passagem efetivamente publicável, reaproveitada tanto
pelo fingerprint/identidade (`decisao.py`) quanto pelo escritor do XLSX
oficial (`escritor_relatorio_transparencia.py`).

Fechamento HOMO-RT-06 (decisão de produto final, substitui a versão
provisória): o estado D (INVALIDO) NUNCA bloqueia nada nesta camada — produz
célula vazia, igual a B/C/E — mas continua MARCADO como `inconsistente=True`,
distinto dos outros três, porque essa distinção participa do fingerprint
(ver `test_decisao.py`)."""

from app.domain.entities.linha_passagem import EstadoPassagem, LinhaPassagem
from app.domain.relatorio_transparencia.linha_publicavel import valor_passagem_publicavel


def _linha(*, ob="2026OB000001", estado, valor=None, bruto=None, transporte="AVIÃO", linha=10):
    return LinhaPassagem(linha=linha, ob=ob, transporte=transporte, estado=estado, valor=valor, bruto=bruto)


# --- Estado A — numérico -----------------------------------------------


def test_estado_numerico_publica_o_valor():
    resultado = valor_passagem_publicavel(_linha(estado=EstadoPassagem.NUMERICO, valor=1657.76))

    assert resultado.valor == 1657.76
    assert resultado.inconsistente is False


def test_estado_numerico_preserva_precisao():
    resultado = valor_passagem_publicavel(_linha(estado=EstadoPassagem.NUMERICO, valor=4964.32))

    assert resultado.valor == 4964.32


# --- Estados B e C — célula vazia, nunca "-"/texto/zero -----------------


def test_estado_ausente_fica_vazio():
    resultado = valor_passagem_publicavel(_linha(estado=EstadoPassagem.AUSENTE, bruto="-"))

    assert resultado.valor is None
    assert resultado.inconsistente is False


def test_estado_nao_se_aplica_fica_vazio_nunca_texto_literal():
    resultado = valor_passagem_publicavel(_linha(estado=EstadoPassagem.NAO_SE_APLICA, bruto="NÃO SE APLICA"))

    assert resultado.valor is None
    assert resultado.valor != "NÃO SE APLICA"
    assert resultado.valor != "-"
    assert resultado.valor != 0
    assert resultado.inconsistente is False


# --- Estado D — fechamento HOMO-RT-06: célula vazia, NUNCA bloqueia, mas
# permanece marcado como inconsistente (nunca colapsado em B/C/E) ----------


def test_estado_invalido_fica_vazio_nunca_texto_bruto_ou_zero():
    resultado = valor_passagem_publicavel(_linha(estado=EstadoPassagem.INVALIDO, bruto="#VALOR!"))

    assert resultado.valor is None
    assert resultado.valor != "#VALOR!"
    assert resultado.valor != 0


def test_estado_invalido_e_o_unico_marcado_como_inconsistente():
    resultado_invalido = valor_passagem_publicavel(_linha(estado=EstadoPassagem.INVALIDO, bruto="#VALOR!"))
    assert resultado_invalido.inconsistente is True

    for estado in (EstadoPassagem.NUMERICO, EstadoPassagem.AUSENTE, EstadoPassagem.NAO_SE_APLICA):
        kwargs = {"valor": 1.0} if estado is EstadoPassagem.NUMERICO else {}
        resultado = valor_passagem_publicavel(_linha(estado=estado, **kwargs))
        assert resultado.inconsistente is False


# --- Estado E — OB sem correspondência (linha_passagem=None) -------------


def test_estado_e_sem_correspondencia_fica_vazio():
    resultado = valor_passagem_publicavel(None)

    assert resultado.valor is None
    assert resultado.inconsistente is False


# --- B/C/D/E produzem a MESMA representação PÚBLICA (célula vazia) —
# decisão de produto (fechamento HOMO-RT-06): nenhum dos quatro tem um
# valor monetário confiável a publicar. B/C/E também são indistinguíveis
# ENTRE SI no domínio (nenhuma diferença administrativa relevante); D é
# publicamente igual a eles, mas permanece marcado internamente — ver o
# teste de distinção acima e os testes de fingerprint em test_decisao.py.


def test_todos_os_estados_sem_valor_numerico_produzem_celula_vazia():
    ausente = valor_passagem_publicavel(_linha(estado=EstadoPassagem.AUSENTE))
    nao_se_aplica = valor_passagem_publicavel(_linha(estado=EstadoPassagem.NAO_SE_APLICA))
    invalido = valor_passagem_publicavel(_linha(estado=EstadoPassagem.INVALIDO, bruto="#VALOR!"))
    sem_correspondencia = valor_passagem_publicavel(None)

    assert ausente.valor is None
    assert nao_se_aplica.valor is None
    assert invalido.valor is None
    assert sem_correspondencia.valor is None


def test_ausente_nao_se_aplica_e_sem_correspondencia_sao_indistinguiveis():
    """B/C/E — nenhuma diferença administrativa relevante entre si — ao
    contrário de D, que é sempre distinto (ver teste acima)."""
    ausente = valor_passagem_publicavel(_linha(estado=EstadoPassagem.AUSENTE))
    nao_se_aplica = valor_passagem_publicavel(_linha(estado=EstadoPassagem.NAO_SE_APLICA))
    sem_correspondencia = valor_passagem_publicavel(None)

    assert ausente == nao_se_aplica == sem_correspondencia


def test_invalido_e_distinto_de_ausente_apesar_da_mesma_celula_publica():
    ausente = valor_passagem_publicavel(_linha(estado=EstadoPassagem.AUSENTE))
    invalido = valor_passagem_publicavel(_linha(estado=EstadoPassagem.INVALIDO, bruto="#VALOR!"))

    assert ausente.valor == invalido.valor  # mesma célula pública (None)
    assert ausente != invalido  # mas nunca o mesmo objeto/estado interno
