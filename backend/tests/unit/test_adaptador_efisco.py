"""Plano de Migração E-Fisco, Sprint B — testes de `adaptador_efisco.py`
(`LinhaEfisco` + Controle DIMCAC → `OrdemBancaria`). Dados sintéticos."""

from datetime import date, datetime

from app.domain.entities.linha_efisco import LinhaEfisco
from app.domain.entities.registro_controle import ClassificacaoSei, RegistroControle
from app.domain.relatorio_transparencia.adaptador_efisco import (
    linha_para_ordem_bancaria,
    ordens_bancarias_por_dh_via_efisco,
)


def _linha_efisco(
    *,
    linha=10,
    ob="2026OB000001",
    dh="2026DH000001",
    situacao="Paga",
    natureza="33901400",
    documento_credor="111.222.333-44",
    credor="FULANO DE TAL",
    data_ob=date(2026, 2, 10),
    data_pagamento_devolucao=datetime(2026, 2, 10, 9, 1, 40),
    valor_bruto=154.09,
    observacao="PAGTO 2026LE000001 UMA DIARIA PARCIAL, DEST RECIFE",
) -> LinhaEfisco:
    return LinhaEfisco(
        linha=linha, ob=ob, dh=dh, situacao=situacao, natureza=natureza,
        documento_credor=documento_credor, credor=credor, data_ob=data_ob,
        data_pagamento_devolucao=data_pagamento_devolucao, valor_bruto=valor_bruto,
        observacao=observacao,
    )


def _registro_controle(
    *,
    linha=5,
    dh="2026DH000001",
    sei="19.20.0001.0000001/2026-01",
    sei_classificacao=ClassificacaoSei.VALIDO,
    doc_origem="PJRECIFE - Promotoria de Justiça do Recife",
    cpf="11122233344",
    periodo_inicial=date(2026, 2, 7),
    periodo_final=date(2026, 2, 7),
    cidade_origem="RECIFE",
    cidade_destino="GARANHUNS",
    trecho="RECIFE-GARANHUNS",
    motivo="Motivo administrativo de teste",
    transporte="CARRO",
    valor_total_diarias=154.09,
    quantidade_diaria_integral=0,
    quantidade_diaria_parcial=1,
    cargo="Cargo de Teste",
) -> RegistroControle:
    return RegistroControle(
        linha=linha, dh=dh, sei=sei, sei_classificacao=sei_classificacao, doc_origem=doc_origem,
        cpf=cpf, periodo_inicial=periodo_inicial, periodo_final=periodo_final,
        cidade_origem=cidade_origem, cidade_destino=cidade_destino, trecho=trecho, motivo=motivo,
        transporte=transporte, valor_total_diarias=valor_total_diarias,
        quantidade_diaria_integral=quantidade_diaria_integral, quantidade_diaria_parcial=quantidade_diaria_parcial,
        cargo=cargo,
    )


# --- 1. Mapeamento básico, DIMCAC presente (1 registro, sem conflito) -----


def test_linha_efisco_com_dimcac_completo_produz_ordem_bancaria_completa():
    linha = _linha_efisco()
    registro = _registro_controle()

    ordem = linha_para_ordem_bancaria(linha, [registro])

    assert ordem.linha == linha.linha
    assert ordem.ob == "2026OB000001"
    assert ordem.dh == "2026DH000001"
    assert ordem.credor == "FULANO DE TAL"
    assert ordem.situacao == "Paga"
    assert ordem.cpf == "11122233344"
    assert ordem.item_de_gasto == "33901400"


def test_nome_vem_do_credor_efisco_nunca_de_outra_fonte():
    """RegistroControle (Controle DIMCAC) não tem campo `nome` — achado
    real da auditoria de domínio. `nome` e `credor` usam a MESMA fonte
    (Razão Social do Credor do E-Fisco)."""
    linha = _linha_efisco(credor="CICLANO DA SILVA")
    ordem = linha_para_ordem_bancaria(linha, [])
    assert ordem.nome == "CICLANO DA SILVA"
    assert ordem.nome == ordem.credor


# --- 2. Valor: sempre E-Fisco, nunca DIMCAC -------------------------------


def test_valor_da_diaria_vem_do_efisco_mesmo_quando_dimcac_diverge():
    """Achado real (auditoria de cruzamento): DIMCAC guarda um valor
    PRÉ-CALCULADO (`valor_total_diarias`), que pode divergir do valor
    efetivamente pago no E-Fisco — E-Fisco é a autoridade financeira,
    sempre prevalece, DIMCAC nunca é sequer consultado para este campo."""
    linha = _linha_efisco(valor_bruto=999.99)
    registro = _registro_controle(valor_total_diarias=1.00)

    ordem = linha_para_ordem_bancaria(linha, [registro])

    assert ordem.valor == 999.99


def test_data_de_pagamento_vem_do_efisco():
    dt = datetime(2026, 3, 15, 10, 30, 0)
    linha = _linha_efisco(data_pagamento_devolucao=dt)
    ordem = linha_para_ordem_bancaria(linha, [])
    assert ordem.data_pagamento == dt


# --- 3. SEI/campos administrativos: sempre DIMCAC, nunca inventados ------


def test_sei_vem_do_dimcac_nunca_do_efisco():
    """E-Fisco não tem coluna SEI estruturada (achado da Sprint A) — SEI
    só pode vir do Controle DIMCAC, nunca de parsing de texto livre."""
    linha = _linha_efisco()
    registro = _registro_controle(sei="19.20.9999.0009999/2026-99")
    ordem = linha_para_ordem_bancaria(linha, [registro])
    assert ordem.sei == "19.20.9999.0009999/2026-99"


def test_campos_administrativos_vem_todos_do_dimcac():
    linha = _linha_efisco()
    registro = _registro_controle(
        cargo="POLICIAL MILITAR", trecho="OLINDA-SURUBIM", cidade_origem="OLINDA",
        cidade_destino="SURUBIM", transporte="AVIÃO", motivo="Segurança aproximada",
        periodo_inicial=date(2026, 1, 1), periodo_final=date(2026, 1, 2),
    )
    ordem = linha_para_ordem_bancaria(linha, [registro])
    assert ordem.cargo == "POLICIAL MILITAR"
    assert ordem.trecho == "OLINDA-SURUBIM"
    assert ordem.cidade_origem == "OLINDA"
    assert ordem.cidade_destino == "SURUBIM"
    assert ordem.transporte == "AVIÃO"
    assert ordem.motivo == "Segurança aproximada"
    assert ordem.periodo_inicial == date(2026, 1, 1)
    assert ordem.periodo_final == date(2026, 1, 2)


# --- 4. DIMCAC ausente — diária NUNCA desaparece --------------------------


def test_diaria_sem_correspondencia_no_dimcac_ainda_e_produzida():
    """Achado real: uma diária Paga válida no E-Fisco não pode deixar de
    existir só porque o Controle DIMCAC está desatualizado — a
    OrdemBancaria continua sendo criada, só com os campos administrativos
    None (RN04/revisão, já homologado, decide o que fazer depois — nunca
    esta função)."""
    linha = _linha_efisco(ob="2026OB999999", valor_bruto=500.00)

    ordem = linha_para_ordem_bancaria(linha, [])

    assert ordem.ob == "2026OB999999"
    assert ordem.valor == 500.00
    assert ordem.sei is None
    assert ordem.cargo is None
    assert ordem.trecho is None
    assert ordem.periodo_inicial is None
    assert ordem.motivo is None


# --- 5. Múltiplos RegistroControle para o mesmo DH ------------------------


def test_multiplos_registros_concordantes_resolvem_para_valor_unico():
    linha = _linha_efisco()
    r1 = _registro_controle(linha=5, sei="19.20.0001.0000001/2026-01", cargo="ANALISTA")
    r2 = _registro_controle(linha=6, sei="19.20.0001.0000001/2026-01", cargo="ANALISTA")

    ordem = linha_para_ordem_bancaria(linha, [r1, r2])

    assert ordem.sei == "19.20.0001.0000001/2026-01"
    assert ordem.cargo == "ANALISTA"


def test_multiplos_registros_divergentes_resolvem_para_none_nunca_escolhe_um():
    """Mesma filosofia de `linha_publicavel.valor_do_controle_com_fallback`
    (já homologada para cargo/transporte): divergência entre múltiplos
    RegistroControle do mesmo DH nunca escolhe um lado à toa — vira
    ausente, nunca uma aproximação silenciosa (ausência de matching fuzzy)."""
    linha = _linha_efisco()
    r1 = _registro_controle(linha=5, cargo="ANALISTA", sei="19.20.0001.0000001/2026-01")
    r2 = _registro_controle(linha=6, cargo="TÉCNICO", sei="19.20.0001.0000002/2026-02")

    ordem = linha_para_ordem_bancaria(linha, [r1, r2])

    assert ordem.cargo is None
    assert ordem.sei is None


def test_registro_com_cpf_diferente_do_efisco_nao_e_tratado_como_correspondencia_aproximada():
    """A correspondência é SOMENTE por DH (chave estrutural primária, I01)
    — nunca por CPF/nome aproximado. Um RegistroControle associado ao
    mesmo DH é usado mesmo que seu CPF divirja do documento do credor no
    E-Fisco (podem legitimamente ser pessoas diferentes num mesmo processo
    administrativo) — mas nunca há tentativa de "casar" por similaridade
    de nome/CPF quando o DH não bate; isso é coberto pelo teste de DIMCAC
    ausente acima (zero fuzzy matching, zero substituição)."""
    linha = _linha_efisco(documento_credor="111.222.333-44")
    registro = _registro_controle(cpf="99988877766")  # CPF administrativo diferente, mesmo DH

    ordem = linha_para_ordem_bancaria(linha, [registro])

    # sei/cargo/etc. do DIMCAC são usados normalmente — o cruzamento é por DH
    assert ordem.sei == registro.sei
    # cpf da OrdemBancaria continua vindo do E-Fisco, nunca substituído pelo do DIMCAC
    assert ordem.cpf == "11122233344"


# --- 6. Restituição — nunca inventada -------------------------------------


def test_restituicao_sempre_none():
    linha = _linha_efisco()
    ordem = linha_para_ordem_bancaria(linha, [_registro_controle()])
    assert ordem.restituicao is None


# --- 7. Agrupamento por DH (ordens_bancarias_por_dh_via_efisco) -----------


def test_agrupamento_por_dh_unico():
    linhas = [_linha_efisco(ob="2026OB000001", dh="2026DH000001")]
    resultado = ordens_bancarias_por_dh_via_efisco(linhas, {})
    assert "2026DH000001" in resultado.por_dh
    assert len(resultado.por_dh["2026DH000001"]) == 1
    assert resultado.sem_dh == 0


def test_agrupamento_preserva_parcelamento_um_dh_para_duas_obs():
    """Achado real (Sprint B): 4 casos de 1 DH -> N OBs (parcelamento) na
    fonte real — `motor_reconciliacao.reconciliar` já preserva isso
    (mesma forma de saída de `ordens_bancarias_por_dh`), sem nenhuma
    mudança necessária aqui."""
    linhas = [
        _linha_efisco(ob="2026OB000001", dh="2026DH000001"),
        _linha_efisco(ob="2026OB000002", dh="2026DH000001"),
    ]
    resultado = ordens_bancarias_por_dh_via_efisco(linhas, {})
    assert {o.ob for o in resultado.por_dh["2026DH000001"]} == {"2026OB000001", "2026OB000002"}


def test_dh_ausente_e_contado_nunca_desaparece_silenciosamente():
    """Achado real: 0 casos em 2044 linhas elegíveis reais — mas o caso é
    tratado explicitamente, nunca presumido impossível."""
    linhas = [_linha_efisco(ob="2026OB000001", dh=None)]
    resultado = ordens_bancarias_por_dh_via_efisco(linhas, {})
    assert resultado.por_dh == {}
    assert resultado.sem_dh == 1


def test_agrupamento_usa_registro_controle_do_dh_correto():
    linhas = [
        _linha_efisco(ob="2026OB000001", dh="2026DH000001"),
        _linha_efisco(ob="2026OB000002", dh="2026DH000002"),
    ]
    controle_por_dh = {
        "2026DH000001": [_registro_controle(dh="2026DH000001", sei="SEI-A")],
        "2026DH000002": [_registro_controle(dh="2026DH000002", sei="SEI-B")],
    }
    resultado = ordens_bancarias_por_dh_via_efisco(linhas, controle_por_dh)
    ordem_1 = resultado.por_dh["2026DH000001"][0]
    ordem_2 = resultado.por_dh["2026DH000002"][0]
    assert ordem_1.sei == "SEI-A"
    assert ordem_2.sei == "SEI-B"


# --- 8. Compatibilidade estrutural com Passagens e RN01-RN07 --------------


def test_ordem_bancaria_produzida_e_compativel_com_cruzamento_de_passagens():
    """`cruzamento_passagens.cruzar_passagens_por_ob` casa exclusivamente
    por `ordem.ob` (string exata) — confirma que o adaptador produz esse
    campo no formato esperado, sem precisar alterar o módulo de Passagens."""
    from app.domain.entities.linha_passagem import EstadoPassagem, LinhaPassagem
    from app.domain.relatorio_transparencia.cruzamento_passagens import cruzar_passagens_por_ob

    linha = _linha_efisco(ob="2026OB000001")
    ordem = linha_para_ordem_bancaria(linha, [])
    passagem = LinhaPassagem(linha=1, ob="2026OB000001", transporte="AVIÃO", estado=EstadoPassagem.NUMERICO, valor=500.0, bruto="R$ 500,00")

    resultado = cruzar_passagens_por_ob([ordem], {"2026OB000001": passagem})

    assert len(resultado.cruzamentos) == 1
    assert resultado.cruzamentos[0].linha_passagem is passagem


def test_ordem_bancaria_produzida_e_compativel_com_motor_decisao_rn04():
    """RN04 (repetição física) permanece intacta e alcançável: se duas
    `OrdemBancaria` produzidas por este adaptador compartilharem a mesma
    OB com campo divergente (cenário hipotético — o adaptador não impede
    isso estruturalmente, já que opera linha a linha), `motor_decisao.
    classificar` ainda reage exatamente como já homologado."""
    from app.domain.relatorio_transparencia.competencia import intervalo_acumulado
    from app.domain.relatorio_transparencia.motor_decisao import classificar
    from app.domain.relatorio_transparencia.motor_reconciliacao import reconciliar
    from app.domain.relatorio_transparencia.entidades import DocumentoHabil

    linha_1 = _linha_efisco(ob="2026OB000001", dh="2026DH000001", valor_bruto=100.0)
    linha_2 = _linha_efisco(ob="2026OB000001", dh="2026DH000001", valor_bruto=200.0, linha=11)
    ordem_1 = linha_para_ordem_bancaria(linha_1, [])
    ordem_2 = linha_para_ordem_bancaria(linha_2, [])

    resultado_reconciliado = reconciliar({}, {"2026DH000001": [ordem_1, ordem_2]})
    intervalo = intervalo_acumulado(2026, 12)
    resultado = classificar(resultado_reconciliado, intervalo)

    assert len(resultado.revisoes_necessarias) == 1
    assert resultado.revisoes_necessarias[0].regra == "RN04"
