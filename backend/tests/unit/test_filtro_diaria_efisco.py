"""Plano de Migração E-Fisco, Sprint A (+ Micro-sprint de fechamento) —
testes da regra de identificação de diária elegível
(`filtro_diaria_efisco.diaria_elegivel`). Todos os dados são sintéticos
(CPF/CNPJ/nomes/OB/DH fictícios, conforme a política de dados sintéticos
do projeto) — nenhum dado real do cliente é usado em fixture, inclusive os
casos que reproduzem a ESTRUTURA do achado real `2026OB700001`
(ressarcimento de transporte) usam OB/DH/CPF/nome sintéticos diferentes,
deliberadamente, para provar que a regra reage à SEMÂNTICA do texto, não a
um registro específico hardcoded."""

from datetime import date, datetime

from app.domain.entities.linha_efisco import LinhaEfisco
from app.domain.relatorio_transparencia.filtro_diaria_efisco import (
    MARCADOR_FORTE_DIARIA,
    MARCADORES_FRACOS_EVIDENCIA_VIAGEM,
    NATUREZA_DIARIA_PADRAO,
    NATUREZA_EXERCICIOS_ANTERIORES,
    TERMOS_EXCLUSAO_NAO_DIARIA,
    diaria_elegivel,
)

_CPF_SINTETICO = "111.222.333-44"
_CNPJ_SINTETICO = "11.222.333/0001-81"


def _linha(
    *,
    linha=10,
    ob="2026OB000001",
    dh="2026DH000001",
    situacao="Paga",
    natureza=NATUREZA_DIARIA_PADRAO,
    documento_credor=_CPF_SINTETICO,
    credor="FULANO DE TAL",
    data_ob=date(2026, 2, 10),
    data_pagamento_devolucao=datetime(2026, 2, 10, 9, 1, 40),
    valor_bruto=154.09,
    observacao="PAGTO 2026LE000001 SEI 19.20.0001.0000001/2026-01 FULANO DE TAL UMA DIARIA PARCIAL, DEST RECIFE",
) -> LinhaEfisco:
    return LinhaEfisco(
        linha=linha,
        ob=ob,
        dh=dh,
        situacao=situacao,
        natureza=natureza,
        documento_credor=documento_credor,
        credor=credor,
        data_ob=data_ob,
        data_pagamento_devolucao=data_pagamento_devolucao,
        valor_bruto=valor_bruto,
        observacao=observacao,
    )


# --- 1. Natureza 33901400 — nunca precisa de evidência textual, ramo -----
# intocado nesta Micro-sprint (nenhuma evidência de erro encontrada nele) --


def test_33901400_paga_cpf_e_elegivel():
    assert diaria_elegivel(_linha(natureza="33901400", situacao="Paga", documento_credor=_CPF_SINTETICO)) is True


def test_33901400_paga_cnpj_nao_e_elegivel():
    assert diaria_elegivel(_linha(natureza="33901400", situacao="Paga", documento_credor=_CNPJ_SINTETICO)) is False


def test_33901400_devolvida_nao_e_elegivel_mesmo_com_data_pagamento_preenchida():
    """Achado real: uma OB Devolvida no E-Fisco pode ter Data Pagto./Devol.
    preenchida (a data da devolução) — isso nunca pode virar diária paga."""
    linha = _linha(
        natureza="33901400",
        situacao="Devolvida",
        data_pagamento_devolucao=datetime(2026, 2, 10, 9, 1, 40),
    )
    assert diaria_elegivel(linha) is False


def test_33901400_cancelada_nao_e_elegivel():
    assert diaria_elegivel(_linha(natureza="33901400", situacao="Cancelada")) is False


def test_33901400_gerada_nao_e_elegivel():
    linha = _linha(natureza="33901400", situacao="Gerada", data_pagamento_devolucao=None)
    assert diaria_elegivel(linha) is False


# --- 2. Natureza 33909200 — marcador forte (DIARIA) sozinho já basta ------


def test_33909200_paga_cpf_com_palavra_diaria_e_elegivel():
    """Diária verdadeira: 17 das 19 linhas 33909200 reais confirmadas
    (registro completo no Controle DIMCAC) contêm a palavra DIÁRIA/DIARIA
    explicitamente."""
    linha = _linha(
        natureza=NATUREZA_EXERCICIOS_ANTERIORES,
        situacao="Paga",
        documento_credor=_CPF_SINTETICO,
        observacao="PAGTO 2026LE000099 ; 25617/2025-25 FULANO DE TAL 01 (UMA) DIARIA INTEGRAL, DEST RECIFE",
    )
    assert diaria_elegivel(linha) is True


def test_33909200_sem_nenhuma_evidencia_nao_e_elegivel():
    linha = _linha(
        natureza=NATUREZA_EXERCICIOS_ANTERIORES,
        situacao="Paga",
        observacao="PAGTO 2026LE000099; SEI: 12345/2026-11, REF. À AQUISIÇÃO DE MATERIAL DE ESCRITÓRIO",
    )
    assert diaria_elegivel(linha) is False


def test_33909200_observacao_vazia_nao_e_elegivel():
    linha = _linha(natureza=NATUREZA_EXERCICIOS_ANTERIORES, situacao="Paga", observacao=None)
    assert diaria_elegivel(linha) is False


def test_marcador_forte_diaria_isolado_ja_basta():
    linha = _linha(
        natureza=NATUREZA_EXERCICIOS_ANTERIORES,
        situacao="Paga",
        observacao=f"PAGTO 2026LE000099 ; texto qualquer contendo {MARCADOR_FORTE_DIARIA} no meio",
    )
    assert diaria_elegivel(linha) is True


def test_marcadores_fracos_reconhecidos_individualmente_sem_ressarcimento():
    """Diária real confirmada sem a palavra DIÁRIA (`2026OB700002` no
    achado real): padrão estrutural "COM DESTINO <cidade> EM <data>" —
    cada marcador fraco, isoladamente, ainda basta quando NÃO há termo de
    exclusão no texto."""
    for marcador in MARCADORES_FRACOS_EVIDENCIA_VIAGEM:
        linha = _linha(
            natureza=NATUREZA_EXERCICIOS_ANTERIORES,
            situacao="Paga",
            observacao=f"PAGTO 2026LE000099 ; texto qualquer contendo {marcador} no meio",
        )
        assert diaria_elegivel(linha) is True, f"marcador fraco {marcador!r} deveria tornar a linha elegível"


def test_transporte_isolado_nao_e_mais_marcador_valido():
    """Achado real (Micro-sprint de fechamento): 'TRANSPORTE' foi removido
    da lista de marcadores — nas 39 linhas 33909200+Paga+CPF reais, nunca
    foi o único marcador presente em nenhuma diária confirmada; a única vez
    que apareceu sozinho foi no ressarcimento de transporte (não-diária).
    'TRANSPORTE' sozinho, sem nenhum outro marcador, não torna mais nada
    elegível."""
    linha = _linha(
        natureza=NATUREZA_EXERCICIOS_ANTERIORES,
        situacao="Paga",
        observacao="PAGTO 2026LE000099; REF. A QUALQUER COISA COM A PALAVRA TRANSPORTE NO MEIO",
    )
    assert diaria_elegivel(linha) is False


# --- 3. Ressarcimento de transporte — reprodução estrutural do achado real,
# com identificadores sintéticos DIFERENTES (prova de que a regra reage à
# semântica do texto, nunca a um registro específico hardcoded) -----------


def test_ressarcimento_de_transporte_estrutural_nao_e_elegivel_ob_a():
    """Caso sintético A — mesma estrutura textual do achado real
    (`2026OB700001`), OB/DH/CPF/nome inteiramente diferentes e fictícios."""
    linha = _linha(
        ob="2026OB900001",
        dh="2026DH900001",
        natureza=NATUREZA_EXERCICIOS_ANTERIORES,
        situacao="Paga",
        documento_credor="222.333.444-55",
        credor="CICLANO DA SILVA SINTETICO",
        valor_bruto=9999.99,
        observacao=(
            "PAGTO 2026LE900001; SEI 1111/2025-01, REF. AO RESSARCIMENTO DE TRANSPORTE - 2025 "
            "(CICLANO DA SILVA SINTETICO), CONF. DESPACHO PGJ Nº 9999999/2025 - GABPGJ."
        ),
    )
    assert diaria_elegivel(linha) is False


def test_ressarcimento_de_transporte_estrutural_nao_e_elegivel_ob_b():
    """Caso sintético B — segundo registro, terceiro conjunto de
    identificadores, mesma prova de generalização (não é uma exceção
    pontual codificada para um único OB)."""
    linha = _linha(
        ob="2026OB900002",
        dh="2026DH900002",
        natureza=NATUREZA_EXERCICIOS_ANTERIORES,
        situacao="Paga",
        documento_credor="333.444.555-66",
        credor="BELTRANO PEREIRA SINTETICO",
        valor_bruto=5321.00,
        observacao=(
            "PAGTO 2026LE900002; SEI 2222/2025-02, REF. AO RESSARCIMENTO DE TRANSPORTE - 2026 "
            "(BELTRANO PEREIRA SINTETICO), CONF. DESPACHO PGJ Nº 8888888/2026 - GABPGJ."
        ),
    )
    assert diaria_elegivel(linha) is False


def test_ressarcimento_de_combustivel_tambem_nao_e_elegivel():
    """Achado real (busca ampla): RESSARCIMENTO DE COMBUSTÍVEL é a mesma
    categoria de pagamento a pessoa física, não diária — mesmo termo de
    exclusão cobre a família inteira, não só 'de transporte'."""
    linha = _linha(
        natureza=NATUREZA_EXERCICIOS_ANTERIORES,
        situacao="Paga",
        observacao="PAGTO 2026LE900003 SEI: 3333/2025-03, REF. A RESSARCIMENTO DE COMBUSTIVEL AO MEMBRO",
    )
    assert diaria_elegivel(linha) is False


def test_ressarcimento_com_marcador_fraco_isolado_nao_e_elegivel():
    """Sinal textual isolado (marcador fraco) não é suficiente para
    classificar um ressarcimento como diária — prova direta do mecanismo
    de veto, isolada de qualquer OB específico."""
    for marcador in MARCADORES_FRACOS_EVIDENCIA_VIAGEM:
        linha = _linha(
            natureza=NATUREZA_EXERCICIOS_ANTERIORES,
            situacao="Paga",
            observacao=f"PAGTO ; REF. AO RESSARCIMENTO DE ALGUMA COISA COM {marcador} NO MEIO",
        )
        assert diaria_elegivel(linha) is False, (
            f"RESSARCIMENTO + marcador fraco {marcador!r} não deveria tornar a linha elegível"
        )


def test_termos_exclusao_expostos_para_documentacao_e_teste():
    assert TERMOS_EXCLUSAO_NAO_DIARIA == ("RESSARCIMENTO",)


# --- 4. Outras naturezas — nunca elegíveis, mesmo com "DIÁRIA" no texto ---


def test_outra_natureza_nao_e_elegivel():
    linha = _linha(natureza="33903000", situacao="Paga", observacao="qualquer texto")
    assert diaria_elegivel(linha) is False


def test_palavra_diaria_em_outra_natureza_nao_torna_elegivel():
    """IMPORTANTE (regra aprovada): busca textual NUNCA é a regra
    principal — só participa do caso 33909200. Uma natureza qualquer que
    nem sequer é 33901400/33909200 nunca vira diária só por a Observação
    mencionar 'DIÁRIA'."""
    linha = _linha(
        natureza="33903700",
        situacao="Paga",
        observacao="PAGTO REF. A DIÁRIAS DE VIAGEM PARA MANUTENÇÃO DE CONTRATO",
    )
    assert diaria_elegivel(linha) is False


def test_natureza_ausente_nao_e_elegivel():
    linha = _linha(natureza=None, situacao="Paga")
    assert diaria_elegivel(linha) is False


def test_natureza_vazia_nao_e_elegivel():
    linha = _linha(natureza="", situacao="Paga")
    assert diaria_elegivel(linha) is False


# --- 5. CPF/CNPJ — normalização e ambiguidade -----------------------------


def test_documento_invalido_nao_e_elegivel():
    linha = _linha(natureza="33901400", situacao="Paga", documento_credor="abc")
    assert diaria_elegivel(linha) is False


def test_documento_ausente_nao_e_elegivel():
    linha = _linha(natureza="33901400", situacao="Paga", documento_credor=None)
    assert diaria_elegivel(linha) is False


def test_documento_vazio_nao_e_elegivel():
    linha = _linha(natureza="33901400", situacao="Paga", documento_credor="")
    assert diaria_elegivel(linha) is False


def test_cpf_sem_pontuacao_e_normalizado_e_aceito():
    linha = _linha(natureza="33901400", situacao="Paga", documento_credor="11122233344")
    assert diaria_elegivel(linha) is True


def test_cpf_com_pontuacao_diferente_e_normalizado_e_aceito():
    """A fonte real usa formatos distintos de pontuação para o mesmo
    número — a contagem de dígitos, não a pontuação literal, decide."""
    linha = _linha(natureza="33901400", situacao="Paga", documento_credor="111 222 333-44")
    assert diaria_elegivel(linha) is True


def test_cnpj_sem_pontuacao_e_normalizado_e_rejeitado():
    linha = _linha(natureza="33901400", situacao="Paga", documento_credor="11222333000181")
    assert diaria_elegivel(linha) is False


def test_cnpj_em_diaria_33909200_com_evidencia_forte_tambem_e_rejeitado():
    """CPF/CNPJ continua excluindo mesmo quando o ramo 33909200 já
    encontrou evidência textual forte — a ordem das condições nunca
    permite um CNPJ passar por causa do texto."""
    linha = _linha(
        natureza=NATUREZA_EXERCICIOS_ANTERIORES,
        situacao="Paga",
        documento_credor=_CNPJ_SINTETICO,
        observacao="PAGTO ; UMA DIARIA PARCIAL, DEST RECIFE",
    )
    assert diaria_elegivel(linha) is False


def test_documento_com_quantidade_ambigua_de_digitos_nao_e_tratado_como_cpf():
    """Nem 11, nem 14 — quantidade de dígitos que não corresponde a
    nenhum documento conhecido. Nunca assume CPF por omissão."""
    linha = _linha(natureza="33901400", situacao="Paga", documento_credor="123456")
    assert diaria_elegivel(linha) is False


# --- 6. Normalização de texto — acentos/caixa da evidência ----------------


def test_evidencia_textual_reconhece_com_e_sem_acento():
    for observacao in (
        "PAGTO ; UMA DIÁRIA PARCIAL, DEST RECIFE",
        "PAGTO ; UMA DIARIA PARCIAL, DEST RECIFE",
        "pagto ; uma diária parcial, dest recife",
        "PAGTO ; Uma Diária Parcial, Dest Recife",
    ):
        linha = _linha(natureza=NATUREZA_EXERCICIOS_ANTERIORES, situacao="Paga", observacao=observacao)
        assert diaria_elegivel(linha) is True, f"observação {observacao!r} deveria ser reconhecida"


def test_evidencia_textual_nao_reconhece_palavra_nao_relacionada():
    linha = _linha(
        natureza=NATUREZA_EXERCICIOS_ANTERIORES,
        situacao="Paga",
        observacao="PAGTO 2026LE000099; SEI: 12345/2026-11, REF. À AQUISIÇÃO DE MATERIAL DE ESCRITÓRIO",
    )
    assert diaria_elegivel(linha) is False


def test_ressarcimento_reconhecido_em_caixa_baixa_e_com_variacao():
    """O termo de exclusão também precisa ser reconhecido independente de
    caixa — mesma normalização usada para os marcadores positivos."""
    linha = _linha(
        natureza=NATUREZA_EXERCICIOS_ANTERIORES,
        situacao="Paga",
        observacao="pagto ; ref. ao ressarcimento de transporte, com destino a recife",
    )
    assert diaria_elegivel(linha) is False
