from datetime import date, datetime, timezone
import itertools

import pytest

from app.domain.entities.ordem_bancaria import OrdemBancaria
from app.domain.entities.registro_controle import ClassificacaoSei, RegistroControle
from app.domain.relatorio_transparencia.decisao import (
    AcaoDecisao,
    DecisaoHumana,
    EstadoRevisao,
    _identidade_grupo_legado,
    aplicar_decisoes,
    calcular_fingerprint,
    contexto_para_exibicao,
    identidade_grupo,
    identidades_ocorrencias,
    registrar_decisao,
)
from app.domain.relatorio_transparencia.motor_decisao import (
    CandidatoNormal,
    OcorrenciaFinanceira,
    ResultadoRelatorio,
    RevisaoNecessaria,
)


def _ordem(
    *,
    ob="2026OB000001",
    linha=2,
    cpf="11111111111",
    nome="FULANO DE TAL",
    credor=None,
    sei="19.20.0001.0000001/2026-01",
    cargo="Cargo de Teste",
    transporte="CARRO",
    periodo_inicial=date(2026, 5, 10),
    periodo_final=date(2026, 5, 10),
    trecho="RECIFE-GARANHUNS",
    valor=154.09,
    data_pagamento=datetime(2026, 5, 15, 9, 0, 0),
    situacao="Paga",
    restituicao=None,
    duplicidade="Único",
    motivo="Motivo de teste",
):
    return OrdemBancaria(
        linha=linha,
        dh="2026DH000001",
        ob=ob,
        # HOMO-RT-05 — por padrão, `credor` acompanha `nome` (nunca produz
        # divergência por acaso quando um teste só varia `nome`); testes
        # de CREDOR sobrescrevem explicitamente.
        credor=credor if credor is not None else nome,
        situacao=situacao,
        data_pagamento=data_pagamento,
        sei=sei,
        cpf=cpf,
        nome=nome,
        cargo=cargo,
        periodo_inicial=periodo_inicial,
        periodo_final=periodo_final,
        cidade_origem=None,
        cidade_destino=None,
        transporte=transporte,
        motivo=motivo,
        valor=valor,
        valor_bruto_sem_formula=valor,
        restituicao=restituicao,
        duplicidade=duplicidade,
        item_de_gasto="33901401",
        trecho=trecho,
    )


def _oc(dh="2026DH000001", registros_controle=None, **kwargs) -> OcorrenciaFinanceira:
    return OcorrenciaFinanceira(dh=dh, ordem_bancaria=_ordem(**kwargs), registros_controle=registros_controle or [])


def _registro_controle(dh="2026DH000001", linha=2) -> RegistroControle:
    return RegistroControle(
        linha=linha,
        dh=dh,
        sei="19.20.0001.0000001/2026-01",
        sei_classificacao=ClassificacaoSei.VALIDO,
        doc_origem="PJTESTE",
        cpf="11111111111",
        periodo_inicial=date(2026, 5, 10),
        periodo_final=date(2026, 5, 10),
        cidade_origem="RECIFE",
        cidade_destino="GARANHUNS",
        trecho="RECIFE-GARANHUNS",
        motivo="Motivo de teste",
        transporte="CARRO",
        valor_total_diarias=154.09,
    )


def _registro_controle_flex(
    *,
    dh="2026DH000001",
    linha=2,
    cargo=None,
    transporte="CARRO",
    quantidade_diaria_integral=None,
    quantidade_diaria_parcial=None,
) -> RegistroControle:
    """HOMO-RT-05 — variante de `_registro_controle` que permite variar
    `cargo`/`transporte`/quantidade de diárias (o Controle DIMCAC — fonte
    PRIMÁRIA dessas 3 colunas do XLSX final, com precedência sobre a Base
    OB)."""
    return RegistroControle(
        linha=linha,
        dh=dh,
        sei="19.20.0001.0000001/2026-01",
        sei_classificacao=ClassificacaoSei.VALIDO,
        doc_origem="PJTESTE",
        cpf="11111111111",
        periodo_inicial=date(2026, 5, 10),
        periodo_final=date(2026, 5, 10),
        cidade_origem="RECIFE",
        cidade_destino="GARANHUNS",
        trecho="RECIFE-GARANHUNS",
        motivo="Motivo de teste",
        transporte=transporte,
        valor_total_diarias=154.09,
        quantidade_diaria_integral=quantidade_diaria_integral,
        quantidade_diaria_parcial=quantidade_diaria_parcial,
        cargo=cargo,
    )


def _revisao(regra="RN07", ocorrencias=None, motivo="Motivo de teste da revisão") -> RevisaoNecessaria:
    return RevisaoNecessaria(
        regra=regra,
        motivo=motivo,
        ocorrencias=ocorrencias or [_oc(ob="2026OB000001"), _oc(ob="2026OB000002")],
    )


def _resultado(*, candidatos=None, revisoes=None, diagnosticos=None) -> ResultadoRelatorio:
    return ResultadoRelatorio(
        candidatos_normais=candidatos or [],
        revisoes_necessarias=revisoes or [],
        diagnosticos_repeticao_fisica=diagnosticos or [],
    )


# --- 7. Identidade do grupo é independente da ordem das OBs --------------


def test_identidade_grupo_independe_da_ordem():
    a = identidade_grupo("RN07", ["2026OB000001", "2026OB000002"])
    b = identidade_grupo("RN07", ["2026OB000002", "2026OB000001"])
    assert a == b


def test_identidade_grupo_muda_com_a_regra_ou_com_as_obs():
    base = identidade_grupo("RN07", ["2026OB000001", "2026OB000002"])
    assert identidade_grupo("RN04", ["2026OB000001", "2026OB000002"]) != base
    assert identidade_grupo("RN07", ["2026OB000001", "2026OB000003"]) != base


# --- 11-13. Fingerprint muda com campos materiais -------------------------


def test_fingerprint_muda_com_valor_diferente():
    a = calcular_fingerprint([_oc(ob="2026OB000001", valor=154.09)])
    b = calcular_fingerprint([_oc(ob="2026OB000001", valor=308.19)])
    assert a != b


def test_fingerprint_muda_com_trecho_diferente():
    a = calcular_fingerprint([_oc(ob="2026OB000001", trecho="RECIFE-GARANHUNS")])
    b = calcular_fingerprint([_oc(ob="2026OB000001", trecho="RECIFE-ARCOVERDE")])
    assert a != b


def test_fingerprint_muda_com_periodo_diferente():
    a = calcular_fingerprint([_oc(ob="2026OB000001", periodo_inicial=date(2026, 5, 10))])
    b = calcular_fingerprint([_oc(ob="2026OB000001", periodo_inicial=date(2026, 5, 11))])
    assert a != b


# --- 14. Alteração irrelevante (linha) não invalida -----------------------


def test_fingerprint_ignora_numero_da_linha():
    a = calcular_fingerprint([_oc(ob="2026OB000001", linha=10)])
    b = calcular_fingerprint([_oc(ob="2026OB000001", linha=9999)])
    assert a == b


def test_fingerprint_independe_da_ordem_das_ocorrencias():
    ocs1 = [_oc(ob="2026OB000001", valor=154.09), _oc(ob="2026OB000002", valor=308.19)]
    ocs2 = list(reversed(ocs1))
    assert calcular_fingerprint(ocs1) == calcular_fingerprint(ocs2)


# --- Confronto QA Codex / QA-RT-02 — fingerprint determinístico também
# quando TODAS as ocorrências compartilham a MESMA OB (cenário RN04 de
# repetição física, I11). Achado real: `sorted(ocorrencias, key=lambda o:
# o.ordem_bancaria.ob)` só normaliza a ordem quando a OB difere entre as
# ocorrências — com a mesma OB, o `sorted()` estável do Python preservava a
# ordem de ENTRADA, e o fingerprint variava só por inverter a ordem física
# das linhas. Corrigido serializando cada ocorrência primeiro e ordenando
# as strings já serializadas.


def test_fingerprint_mesma_ob_independe_da_ordem_com_motivo_divergente():
    a = _oc(ob="2026OB000001", linha=10, motivo="Curso obrigatório para o vitaliciamento")
    b = _oc(ob="2026OB000001", linha=11, motivo="PARTICIPAÇÃO EM ETAPA PRESENCIAL DO CURSO")
    assert calcular_fingerprint([a, b]) == calcular_fingerprint([b, a])


def test_fingerprint_mesma_ob_independe_da_ordem_com_trecho_divergente():
    a = _oc(ob="2026OB000001", linha=10, trecho="RECIFE-GARANHUNS")
    b = _oc(ob="2026OB000001", linha=11, trecho="RECIFE-PETROLINA")
    assert calcular_fingerprint([a, b]) == calcular_fingerprint([b, a])


def test_fingerprint_mesma_ob_independe_da_ordem_com_dh_divergente():
    a = _oc(dh="2026DH000001", ob="2026OB000001", linha=10)
    b = _oc(dh="2026DH999999", ob="2026OB000001", linha=11)
    assert calcular_fingerprint([a, b]) == calcular_fingerprint([b, a])


def test_fingerprint_mesma_ob_independe_da_ordem_com_cpf_divergente():
    a = _oc(ob="2026OB000001", linha=10, cpf="11111111111")
    b = _oc(ob="2026OB000001", linha=11, cpf="99999999999")
    assert calcular_fingerprint([a, b]) == calcular_fingerprint([b, a])


def test_fingerprint_mesma_ob_independe_da_ordem_com_periodo_divergente():
    a = _oc(ob="2026OB000001", linha=10, periodo_inicial=date(2026, 5, 10))
    b = _oc(ob="2026OB000001", linha=11, periodo_inicial=date(2026, 5, 20))
    assert calcular_fingerprint([a, b]) == calcular_fingerprint([b, a])


def test_fingerprint_obs_distintas_continua_determinístico_apos_a_correcao():
    """Controle — o cenário RN07 (OBs distintas) já funcionava antes;
    confirma que a correção não regrediu esse caminho."""
    a = _oc(ob="2026OB000001", linha=10)
    b = _oc(dh="2026DH000002", ob="2026OB000002", linha=20)
    assert calcular_fingerprint([a, b]) == calcular_fingerprint([b, a])


def test_fingerprint_mudanca_material_real_continua_alterando_o_hash():
    """Controle — a correção não pode tornar o fingerprint insensível a
    mudanças de verdade (só à ORDEM de entrada)."""
    a = _oc(ob="2026OB000001", valor=154.09)
    b = _oc(ob="2026OB000001", valor=999.99)
    assert calcular_fingerprint([a]) != calcular_fingerprint([b])


# --- Revalidação Codex / NOVO-RT-08 — o fingerprint precisa mudar para
# TODO campo que `CAMPOS_EVIDENCIA_MATERIAL` (motor_decisao.py) já
# considera material para RN04, nunca só o subconjunto que a versão
# anterior desta função serializava manualmente. Cobre explicitamente
# todos os campos pedidos na revalidação, incluindo os que ficaram de fora
# antes da correção (SEI, cargo, transporte — o achado real do confronto —
# e DH/CPF/nome, testados aqui isoladamente além dos testes de
# independência de ordem já existentes acima).


@pytest.mark.parametrize(
    "campo_kwarg,valor_a,valor_b",
    [
        ("dh", "2026DH000001", "2026DH999999"),
        ("cpf", "11111111111", "99999999999"),
        ("nome", "FULANO DE TAL", "CICLANO DA SILVA"),
        ("sei", "19.20.0001.0000001/2026-01", "19.20.0009.0000999/2026-09"),
        ("periodo_final", date(2026, 5, 10), date(2026, 5, 22)),
        ("motivo", "Motivo de teste", "Motivo completamente diferente"),
        ("cargo", "Cargo de Teste", "Outro Cargo"),
        ("transporte", "CARRO", "AVIÃO"),
        ("restituicao", None, 50.0),
        ("data_pagamento", datetime(2026, 5, 15, 9, 0, 0), datetime(2026, 5, 20, 9, 0, 0)),
    ],
)
def test_fingerprint_muda_quando_campo_material_muda(campo_kwarg, valor_a, valor_b):
    """`dh` é parâmetro de `_oc` (a `OcorrenciaFinanceira.dh`, que é o que
    `CAMPOS_EVIDENCIA_MATERIAL["dh"]` de fato lê — nunca `OrdemBancaria.dh`,
    hardcoded no helper `_ordem`); os demais são parâmetros de `_ordem`,
    encaminhados por `_oc(**kwargs)`."""
    a = calcular_fingerprint([_oc(ob="2026OB000001", **{campo_kwarg: valor_a})])
    b = calcular_fingerprint([_oc(ob="2026OB000001", **{campo_kwarg: valor_b})])
    assert a != b


def test_fingerprint_muda_com_nome_diferente_mesma_ob_ordem_invertida():
    """Espelha os testes `test_fingerprint_mesma_ob_independe_da_ordem_com_*`
    já existentes, agora para `nome` (NOVO-RT-07): precisa ser
    simultaneamente order-independent E sensível à mudança — as duas
    garantias, não uma às custas da outra."""
    a = _oc(ob="2026OB000001", linha=10, nome="FULANO DE TAL")
    b = _oc(ob="2026OB000001", linha=11, nome="CICLANO DA SILVA")
    assert calcular_fingerprint([a, b]) == calcular_fingerprint([b, a])
    assert calcular_fingerprint([a, b]) != calcular_fingerprint([a, a])


# --- Revalidação Codex / NOVO-RT-08 — fluxo completo: RN04 real (não só
# `calcular_fingerprint` isolado) -> decisão registrada -> só o campo
# material muda na fonte -> revisão reconstruída -> decisões reaplicadas ->
# estado DESATUALIZADA. Cobre especificamente os 4 campos do achado real do
# confronto (SEI/cargo/transporte foram os citados pelo Codex; nome é o
# achado irmão do NOVO-RT-07).


def _revisao_rn04_mesma_ob(ordem_a, ordem_b) -> RevisaoNecessaria:
    """Grupo RN04 real de repetição física — as duas ocorrências
    compartilham a MESMA OB (`identidade_grupo` depende só do conjunto de
    OBs, nunca de quantas ocorrências físicas existem por trás dele)."""
    return RevisaoNecessaria(
        regra="RN04",
        motivo="Divergência material entre linhas físicas da mesma OB.",
        ocorrencias=[
            OcorrenciaFinanceira(dh="2026DH000001", ordem_bancaria=ordem_a),
            OcorrenciaFinanceira(dh="2026DH000001", ordem_bancaria=ordem_b),
        ],
    )


@pytest.mark.parametrize(
    "campo_kwarg,valor_a,valor_b",
    [
        ("nome", "FULANO DE TAL", "CICLANO DA SILVA"),
        ("sei", "19.20.0001.0000001/2026-01", "19.20.0009.0000999/2026-09"),
        ("cargo", "Cargo de Teste", "Outro Cargo"),
        ("transporte", "CARRO", "AVIÃO"),
    ],
)
def test_novo_rt08_fluxo_completo_ate_desatualizada(campo_kwarg, valor_a, valor_b):
    """1. produz um RN04 real de repetição física (via `_revisao_rn04_mesma_ob`,
    não uma revisão sintética arbitrária);
    2. registra uma decisão humana válida sobre ele;
    3. altera SÓ o campo material em questão na fonte (linha 11);
    4. reconstrói a revisão a partir da evidência "nova" (`_revisao_rn04_mesma_ob`
    de novo, com o campo alterado — equivalente a `_montar_resultado_revisado`
    relendo as fontes brutas na API real);
    5. reaplica as decisões persistidas (`aplicar_decisoes`);
    6. confirma que o estado é DESATUALIZADA — nunca reaproveitada como
    DECIDIDA com evidência diferente da que foi de fato decidida."""
    ordem_a = _ordem(ob="2026OB000001", linha=10, valor=154.09)
    ordem_b_original = _ordem(ob="2026OB000001", linha=11, valor=154.09, **{campo_kwarg: valor_a})
    revisao_original = _revisao_rn04_mesma_ob(ordem_a, ordem_b_original)

    decisao = registrar_decisao(
        revisao_original, acao=AcaoDecisao.PUBLICAR, autor="servidor.teste", obs_publicaveis=["2026OB000001"]
    )

    ordem_b_alterada = _ordem(ob="2026OB000001", linha=11, valor=154.09, **{campo_kwarg: valor_b})
    revisao_reconstruida = _revisao_rn04_mesma_ob(ordem_a, ordem_b_alterada)
    resultado = _resultado(revisoes=[revisao_reconstruida])

    revisado = aplicar_decisoes(resultado, {decisao.identidade_grupo: decisao})

    assert revisado.revisoes[0].estado is EstadoRevisao.DESATUALIZADA
    assert revisado.pode_gerar_relatorio is False
    assert revisado.candidatos_publicaveis == []


@pytest.mark.parametrize(
    "campo_kwarg",
    ["nome", "sei", "cargo", "transporte"],
)
def test_novo_rt08_fluxo_completo_sem_mudanca_permanece_decidida(campo_kwarg):
    """Controle negativo do fluxo completo acima — reconstruir a MESMA
    evidência (nenhum campo mudou) continua reaproveitando a decisão sem
    pedir revisão de novo (G06).

    HOMO-RT-02 — atualizado: as duas linhas físicas agora divergem em
    `motivo` (RN04 real só existe quando `_resolver_repeticao_fisica`
    encontra divergência de verdade — duas linhas idênticas colapsam antes
    de virar `RevisaoNecessaria`, nunca chegam aqui) e a decisão é
    registrada com a identidade POR OCORRÊNCIA (nunca `ob` isolada) — o
    formato correto para um grupo com repetição física depois desta
    correção. `ob` isolada aqui seria exatamente o caso ambíguo que
    HOMO-RT-02 passou a exigir nova decisão (`REQUER_NOVA_DECISAO`), não o
    que este teste quer verificar."""
    ordem_a = _ordem(ob="2026OB000001", linha=10, valor=154.09, motivo="Motivo da linha A")
    ordem_b = _ordem(ob="2026OB000001", linha=11, valor=154.09, motivo="Motivo da linha B")
    revisao_original = _revisao_rn04_mesma_ob(ordem_a, ordem_b)
    identidade_a = identidades_ocorrencias(revisao_original.ocorrencias)[0]

    decisao = registrar_decisao(
        revisao_original, acao=AcaoDecisao.PUBLICAR, autor="servidor.teste", obs_publicaveis=[identidade_a]
    )

    revisao_reconstruida = _revisao_rn04_mesma_ob(ordem_a, ordem_b)
    resultado = _resultado(revisoes=[revisao_reconstruida])

    revisado = aplicar_decisoes(resultado, {decisao.identidade_grupo: decisao})

    assert revisado.revisoes[0].estado is EstadoRevisao.DECIDIDA
    assert revisado.pode_gerar_relatorio is True


# --- Confronto 3C.1: DUPLICIDADE isolada não pode invalidar (RN03) --------


def test_fingerprint_ignora_duplicidade():
    """RN03: DUPLICIDADE é metadado, nunca decide nada sozinha — incluí-la
    no fingerprint forçaria revalidar uma decisão humana válida só porque
    esse campo mudou, contradizendo RN03 na prática."""
    a = calcular_fingerprint([_oc(ob="2026OB000001", duplicidade="Duplicado")])
    b = calcular_fingerprint([_oc(ob="2026OB000001", duplicidade="Único")])
    assert a == b


def test_decisao_permanece_valida_quando_so_duplicidade_muda():
    revisao_original = _revisao(
        ocorrencias=[_oc(ob="2026OB000001", duplicidade="Duplicado"), _oc(ob="2026OB000002")]
    )
    decisao = registrar_decisao(
        revisao_original, acao=AcaoDecisao.PUBLICAR, autor="servidor.teste", obs_publicaveis=["2026OB000001"]
    )
    # mesma identidade de grupo, tudo igual exceto DUPLICIDADE
    revisao_depois = _revisao(
        ocorrencias=[_oc(ob="2026OB000001", duplicidade="Único"), _oc(ob="2026OB000002")]
    )
    resultado = _resultado(revisoes=[revisao_depois])

    revisado = aplicar_decisoes(resultado, {decisao.identidade_grupo: decisao})

    assert revisado.revisoes[0].estado is EstadoRevisao.DECIDIDA
    assert revisado.pode_gerar_relatorio is True


def test_fingerprint_muda_com_situacao_diferente():
    """SITUAÇÃO continua material — sem RN que a declare irrelevante, e já
    é campo de divergência de RN04 (_campos_divergentes)."""
    a = calcular_fingerprint([_oc(ob="2026OB000001", situacao="Paga")])
    b = calcular_fingerprint([_oc(ob="2026OB000001", situacao="Estornada")])
    assert a != b


# --- 1. Revisão pendente bloqueia geração ---------------------------------


def test_revisao_pendente_bloqueia_geracao():
    resultado = _resultado(revisoes=[_revisao()])

    revisado = aplicar_decisoes(resultado, {})

    assert revisado.revisoes[0].estado is EstadoRevisao.PENDENTE
    assert revisado.pode_gerar_relatorio is False
    assert revisado.motivos_bloqueio  # não vazio


# --- 2. Decisão PUBLICAR TODAS libera o caso ------------------------------


def test_decisao_publicar_todas_libera_o_caso():
    revisao = _revisao()
    decisao = registrar_decisao(
        revisao,
        acao=AcaoDecisao.PUBLICAR,
        autor="servidor.teste",
        obs_publicaveis=["2026OB000001", "2026OB000002"],
    )
    resultado = _resultado(revisoes=[revisao])

    revisado = aplicar_decisoes(resultado, {decisao.identidade_grupo: decisao})

    assert revisado.revisoes[0].estado is EstadoRevisao.DECIDIDA
    assert revisado.pode_gerar_relatorio is True
    obs_publicadas = {c.ocorrencia.ordem_bancaria.ob for c in revisado.candidatos_publicaveis}
    assert obs_publicadas == {"2026OB000001", "2026OB000002"}
    assert revisado.ocorrencias_nao_publicaveis == []


# --- 3. Decisão selecionando apenas uma OB --------------------------------


def test_decisao_selecionando_apenas_uma_ob():
    revisao = _revisao()
    decisao = registrar_decisao(
        revisao, acao=AcaoDecisao.PUBLICAR, autor="servidor.teste", obs_publicaveis=["2026OB000001"]
    )
    resultado = _resultado(revisoes=[revisao])

    revisado = aplicar_decisoes(resultado, {decisao.identidade_grupo: decisao})

    obs_publicadas = {c.ocorrencia.ordem_bancaria.ob for c in revisado.candidatos_publicaveis}
    assert obs_publicadas == {"2026OB000001"}
    assert len(revisado.ocorrencias_nao_publicaveis) == 1
    assert revisado.ocorrencias_nao_publicaveis[0].ocorrencia.ordem_bancaria.ob == "2026OB000002"


# --- 4. Decisão selecionando múltiplas OBs de grupo com N > 2 -------------


def test_decisao_selecionando_multiplas_obs_de_grupo_com_tres():
    ocorrencias = [_oc(ob="2026OB000001"), _oc(ob="2026OB000002"), _oc(ob="2026OB000003")]
    revisao = _revisao(ocorrencias=ocorrencias)
    decisao = registrar_decisao(
        revisao,
        acao=AcaoDecisao.PUBLICAR,
        autor="servidor.teste",
        obs_publicaveis=["2026OB000001", "2026OB000003"],
    )
    resultado = _resultado(revisoes=[revisao])

    revisado = aplicar_decisoes(resultado, {decisao.identidade_grupo: decisao})

    obs_publicadas = {c.ocorrencia.ordem_bancaria.ob for c in revisado.candidatos_publicaveis}
    assert obs_publicadas == {"2026OB000001", "2026OB000003"}
    assert len(revisado.ocorrencias_nao_publicaveis) == 1
    assert revisado.ocorrencias_nao_publicaveis[0].ocorrencia.ordem_bancaria.ob == "2026OB000002"


# --- 5. ADIAR mantém pendência --------------------------------------------


def test_decisao_adiar_mantem_pendencia():
    revisao = _revisao()
    decisao = registrar_decisao(revisao, acao=AcaoDecisao.ADIAR, autor="servidor.teste")
    resultado = _resultado(revisoes=[revisao])

    revisado = aplicar_decisoes(resultado, {decisao.identidade_grupo: decisao})

    assert revisado.revisoes[0].estado is EstadoRevisao.ADIADA
    assert revisado.pode_gerar_relatorio is False
    assert revisado.candidatos_publicaveis == []
    assert revisado.ocorrencias_nao_publicaveis == []


# --- 6. OB não selecionada continua rastreável ----------------------------


def test_ob_nao_selecionada_continua_rastreavel_com_dados_completos():
    revisao = _revisao()
    decisao = registrar_decisao(
        revisao, acao=AcaoDecisao.PUBLICAR, autor="servidor.teste", obs_publicaveis=["2026OB000001"]
    )
    resultado = _resultado(revisoes=[revisao])

    revisado = aplicar_decisoes(resultado, {decisao.identidade_grupo: decisao})

    excluida = revisado.ocorrencias_nao_publicaveis[0]
    assert excluida.ocorrencia.ordem_bancaria.ob == "2026OB000002"
    assert excluida.ocorrencia.ordem_bancaria.valor == 154.09  # dado original preservado
    assert excluida.decisao.autor == "servidor.teste"


# --- Confronto 3C.1: proveniência do Controle sobrevive à decisão humana --


def test_registros_controle_sobrevivem_do_ob_a_revisao_ate_candidato_publicavel():
    """Cadeia completa pedida no confronto: OB + registros do Controle →
    REVISAO_NECESSARIA → decisão humana PUBLICAR → CandidatoNormal
    resultante → mesmos registros do Controle continuam presentes.
    Decisão humana muda PUBLICAÇÃO, nunca PROVENIÊNCIA."""
    registros_originais = [_registro_controle(dh="2026DH000001", linha=2)]
    revisao = _revisao(
        ocorrencias=[
            _oc(ob="2026OB000001", dh="2026DH000001", registros_controle=registros_originais),
            _oc(ob="2026OB000002", dh="2026DH000002"),
        ]
    )
    decisao = registrar_decisao(
        revisao, acao=AcaoDecisao.PUBLICAR, autor="servidor.teste", obs_publicaveis=["2026OB000001"]
    )
    resultado = _resultado(revisoes=[revisao])

    revisado = aplicar_decisoes(resultado, {decisao.identidade_grupo: decisao})

    assert revisado.revisoes[0].estado is EstadoRevisao.DECIDIDA
    candidato = next(c for c in revisado.candidatos_publicaveis if c.ocorrencia.ordem_bancaria.ob == "2026OB000001")
    assert candidato.registros_controle == registros_originais
    assert candidato.registros_controle[0].dh == "2026DH000001"


# --- 8-10. Fingerprint idêntico reaproveita; alterado desatualiza --------


def test_fingerprint_identico_reaproveita_decisao():
    revisao = _revisao()
    decisao = registrar_decisao(
        revisao, acao=AcaoDecisao.PUBLICAR, autor="servidor.teste", obs_publicaveis=["2026OB000001"]
    )
    resultado = _resultado(revisoes=[revisao])  # mesmas ocorrências, fingerprint idêntico

    revisado = aplicar_decisoes(resultado, {decisao.identidade_grupo: decisao})

    assert revisado.revisoes[0].estado is EstadoRevisao.DECIDIDA


def test_fingerprint_alterado_vira_desatualizada():
    revisao_original = _revisao()
    decisao = registrar_decisao(
        revisao_original, acao=AcaoDecisao.PUBLICAR, autor="servidor.teste", obs_publicaveis=["2026OB000001"]
    )
    # mesma identidade de grupo (mesmas OBs), mas valor mudou na fonte
    revisao_atualizada = _revisao(
        ocorrencias=[_oc(ob="2026OB000001", valor=999.99), _oc(ob="2026OB000002")]
    )
    resultado = _resultado(revisoes=[revisao_atualizada])

    revisado = aplicar_decisoes(resultado, {decisao.identidade_grupo: decisao})

    assert revisado.revisoes[0].estado is EstadoRevisao.DESATUALIZADA
    assert revisado.pode_gerar_relatorio is False
    # decisão desatualizada nunca é aplicada — nada publicado a partir dela
    assert revisado.candidatos_publicaveis == []
    assert revisado.ocorrencias_nao_publicaveis == []


# --- 15-16. Reaproveitamento entre competências ---------------------------


def test_decisao_reaproveitada_em_competencia_posterior_sem_re_perguntar():
    revisao_julho = _revisao()
    decisao = registrar_decisao(
        revisao_julho, acao=AcaoDecisao.PUBLICAR, autor="servidor.teste", obs_publicaveis=["2026OB000001"]
    )
    decisoes_persistidas = {decisao.identidade_grupo: decisao}

    # "agosto": mesma evidência reaparece no relatório acumulativo
    revisao_agosto = _revisao()
    resultado_agosto = _resultado(revisoes=[revisao_agosto])

    revisado = aplicar_decisoes(resultado_agosto, decisoes_persistidas)

    assert revisado.revisoes[0].estado is EstadoRevisao.DECIDIDA
    assert revisado.pode_gerar_relatorio is True


# --- 24-25. pode_gerar_relatorio ------------------------------------------


def test_zero_pendencias_libera_geracao():
    resultado = _resultado(candidatos=[CandidatoNormal(ocorrencia=_oc(ob="2026OB000009"))])
    revisado = aplicar_decisoes(resultado, {})
    assert revisado.pode_gerar_relatorio is True


def test_uma_pendencia_bloqueia_geracao():
    resultado = _resultado(revisoes=[_revisao()])
    revisado = aplicar_decisoes(resultado, {})
    assert revisado.pode_gerar_relatorio is False


# --- 26. Decisão aplicada não altera candidatos normais -------------------


def test_candidatos_normais_originais_permanecem_intactos():
    candidato_original = CandidatoNormal(ocorrencia=_oc(ob="2026OB000009"))
    revisao = _revisao()
    decisao = registrar_decisao(
        revisao, acao=AcaoDecisao.PUBLICAR, autor="servidor.teste", obs_publicaveis=["2026OB000001"]
    )
    resultado = _resultado(candidatos=[candidato_original], revisoes=[revisao])

    revisado = aplicar_decisoes(resultado, {decisao.identidade_grupo: decisao})

    assert candidato_original in revisado.candidatos_publicaveis


# --- 27. Decisão para grupo desconhecido não é aplicada silenciosamente --


def test_decisao_de_grupo_desconhecido_nao_afeta_outra_revisao():
    revisao = _revisao()
    decisao_de_outro_grupo = registrar_decisao(
        _revisao(ocorrencias=[_oc(ob="2026OB999001"), _oc(ob="2026OB999002")]),
        acao=AcaoDecisao.PUBLICAR,
        autor="servidor.teste",
        obs_publicaveis=["2026OB999001"],
    )
    resultado = _resultado(revisoes=[revisao])

    revisado = aplicar_decisoes(resultado, {decisao_de_outro_grupo.identidade_grupo: decisao_de_outro_grupo})

    assert revisado.revisoes[0].estado is EstadoRevisao.PENDENTE


# --- 28. Decisão com fingerprint que não corresponde não é aplicada ------


def test_decisao_com_fingerprint_desatualizado_nao_e_aplicada():
    revisao_original = _revisao()
    decisao = registrar_decisao(
        revisao_original, acao=AcaoDecisao.PUBLICAR, autor="servidor.teste", obs_publicaveis=["2026OB000001"]
    )
    revisao_com_trecho_novo = _revisao(
        ocorrencias=[_oc(ob="2026OB000001", trecho="RECIFE-ARCOVERDE"), _oc(ob="2026OB000002")]
    )
    resultado = _resultado(revisoes=[revisao_com_trecho_novo])

    revisado = aplicar_decisoes(resultado, {decisao.identidade_grupo: decisao})

    assert revisado.revisoes[0].estado is EstadoRevisao.DESATUALIZADA
    assert revisado.candidatos_publicaveis == []


# --- 29. Nenhuma OB desaparece sem rastreabilidade ------------------------


def test_nenhuma_ob_desaparece_sem_rastreabilidade():
    candidato_normal = CandidatoNormal(ocorrencia=_oc(ob="2026OB000009"))
    revisao_decidida = _revisao(ocorrencias=[_oc(ob="2026OB000001"), _oc(ob="2026OB000002")])
    revisao_pendente = _revisao(
        regra="RN04",
        ocorrencias=[_oc(ob="2026OB000003"), _oc(ob="2026OB000004")],
        motivo="Outro motivo",
    )
    decisao = registrar_decisao(
        revisao_decidida, acao=AcaoDecisao.PUBLICAR, autor="servidor.teste", obs_publicaveis=["2026OB000001"]
    )
    resultado = _resultado(
        candidatos=[candidato_normal],
        revisoes=[revisao_decidida, revisao_pendente],
    )

    revisado = aplicar_decisoes(resultado, {decisao.identidade_grupo: decisao})

    obs_candidatos = {c.ocorrencia.ordem_bancaria.ob for c in revisado.candidatos_publicaveis}
    obs_nao_publicaveis = {o.ocorrencia.ordem_bancaria.ob for o in revisado.ocorrencias_nao_publicaveis}
    obs_pendentes = {
        oc.ordem_bancaria.ob
        for r in revisado.revisoes
        if r.estado is EstadoRevisao.PENDENTE
        for oc in r.revisao.ocorrencias
    }
    todas = obs_candidatos | obs_nao_publicaveis | obs_pendentes
    assert todas == {"2026OB000009", "2026OB000001", "2026OB000002", "2026OB000003", "2026OB000004"}


# --- 30. Nenhuma decisão é automaticamente inventada ----------------------


def test_nenhuma_decisao_e_inventada_sem_entrada_correspondente():
    resultado = _resultado(revisoes=[_revisao(), _revisao(regra="RN04", motivo="Outro motivo")])

    revisado = aplicar_decisoes(resultado, {})

    assert all(r.estado is EstadoRevisao.PENDENTE for r in revisado.revisoes)
    assert all(r.decisao is None for r in revisado.revisoes)


# --- Contrato de exibição (§9 da especificação) ---------------------------


# --- HOMO-RT-02 — identidade por ocorrência ------------------------------
# Corrige o acoplamento de checkboxes de um grupo RN04 por repetição física
# (I11): duas ocorrências físicas com a MESMA OB precisam ser selecionáveis
# de forma independente (só A, só B, as duas, ou nenhuma) — algo impossível
# enquanto a publicação era decidida por `ob` isolada.


def test_identidades_ocorrencias_sem_repeticao_e_igual_a_ob():
    """RN07 (e qualquer grupo sem repetição física): identidade == ob,
    ZERO mudança de comportamento frente ao código anterior à correção."""
    ocorrencias = [_oc(ob="2026OB000001"), _oc(ob="2026OB000002")]
    assert identidades_ocorrencias(ocorrencias) == ["2026OB000001", "2026OB000002"]


def test_identidades_ocorrencias_com_repeticao_fisica_recebe_sufixo():
    a = _oc(ob="2026OB000001", linha=10, motivo="Motivo A")
    b = _oc(ob="2026OB000001", linha=11, motivo="Motivo B")
    identidades = identidades_ocorrencias([a, b])
    assert len(identidades) == 2
    assert len(set(identidades)) == 2  # nunca duas ocorrências com a mesma identidade
    assert all(identidade.startswith("2026OB000001#") for identidade in identidades)


def test_identidades_ocorrencias_deterministica_independente_da_ordem_de_entrada():
    """A identidade de cada ocorrência é função do CONTEÚDO serializado
    (mesma base de `calcular_fingerprint`), nunca da posição em que a
    ocorrência chegou nesta chamada — troca a ordem de entrada e a mesma
    ocorrência (mesmo motivo) deve continuar recebendo a mesma identidade."""
    a = _oc(ob="2026OB000001", linha=10, motivo="Motivo A")
    b = _oc(ob="2026OB000001", linha=11, motivo="Motivo B")

    identidades_ab = identidades_ocorrencias([a, b])
    identidades_ba = identidades_ocorrencias([b, a])

    mapa_ab = dict(zip(["a", "b"], identidades_ab))
    mapa_ba = dict(zip(["b", "a"], identidades_ba))
    assert mapa_ab["a"] == mapa_ba["a"]
    assert mapa_ab["b"] == mapa_ba["b"]


def test_identidades_ocorrencias_conteudo_identico_recebe_a_mesma_identidade():
    """HOMO-RT-03 (redesenho pós-confronto Codex) — duas ocorrências da
    mesma OB com conteúdo material IDÊNTICO (`linha` nunca conta, é só
    diagnóstico) NUNCA recebem uma identidade artificial que as distinga:
    não existe base lógica para dizer qual é "a primeira". As duas recebem
    a MESMA identidade (mesmo hash de conteúdo) — estruturalmente
    inseparáveis em `aplicar_decisoes` (uma decisão que publica essa
    identidade publica as duas; uma que exclui, exclui as duas — nunca
    "só uma delas" para um par indistinguível)."""
    a = _oc(ob="2026OB000001", linha=10)
    b = _oc(ob="2026OB000001", linha=20)

    identidade_a, identidade_b = identidades_ocorrencias([a, b])

    assert identidade_a == identidade_b
    # e o resultado independe de `linha`/ordem de entrada — função pura do
    # conteúdo, nunca da posição física ou da ordem em que chegou aqui.
    assert identidades_ocorrencias([b, a]) == [identidade_b, identidade_a]


def _revisao_rn04_repeticao_fisica(a=None, b=None) -> RevisaoNecessaria:
    a = a or _oc(ob="2026OB000001", linha=10, motivo="Motivo A")
    b = b or _oc(ob="2026OB000001", linha=11, motivo="Motivo B")
    return RevisaoNecessaria(
        regra="RN04",
        motivo="Divergência material entre linhas físicas da mesma OB.",
        ocorrencias=[a, b],
    )


def test_aplicar_decisoes_publica_somente_a_ocorrencia_a():
    a = _oc(ob="2026OB000001", linha=10, motivo="Motivo A")
    b = _oc(ob="2026OB000001", linha=11, motivo="Motivo B")
    revisao = _revisao_rn04_repeticao_fisica(a, b)
    identidade_a, identidade_b = identidades_ocorrencias(revisao.ocorrencias)

    decisao = registrar_decisao(
        revisao, acao=AcaoDecisao.PUBLICAR, autor="servidor.teste", obs_publicaveis=[identidade_a]
    )
    resultado = _resultado(revisoes=[revisao])

    revisado = aplicar_decisoes(resultado, {decisao.identidade_grupo: decisao})

    assert revisado.revisoes[0].estado is EstadoRevisao.DECIDIDA
    assert len(revisado.candidatos_publicaveis) == 1
    assert revisado.candidatos_publicaveis[0].ocorrencia is a
    assert len(revisado.ocorrencias_nao_publicaveis) == 1
    assert revisado.ocorrencias_nao_publicaveis[0].ocorrencia is b


def test_aplicar_decisoes_publica_somente_a_ocorrencia_b():
    a = _oc(ob="2026OB000001", linha=10, motivo="Motivo A")
    b = _oc(ob="2026OB000001", linha=11, motivo="Motivo B")
    revisao = _revisao_rn04_repeticao_fisica(a, b)
    identidade_a, identidade_b = identidades_ocorrencias(revisao.ocorrencias)

    decisao = registrar_decisao(
        revisao, acao=AcaoDecisao.PUBLICAR, autor="servidor.teste", obs_publicaveis=[identidade_b]
    )
    resultado = _resultado(revisoes=[revisao])

    revisado = aplicar_decisoes(resultado, {decisao.identidade_grupo: decisao})

    assert len(revisado.candidatos_publicaveis) == 1
    assert revisado.candidatos_publicaveis[0].ocorrencia is b
    assert len(revisado.ocorrencias_nao_publicaveis) == 1
    assert revisado.ocorrencias_nao_publicaveis[0].ocorrencia is a


def test_aplicar_decisoes_publica_as_duas_ocorrencias_fisicas():
    a = _oc(ob="2026OB000001", linha=10, motivo="Motivo A")
    b = _oc(ob="2026OB000001", linha=11, motivo="Motivo B")
    revisao = _revisao_rn04_repeticao_fisica(a, b)
    identidades = identidades_ocorrencias(revisao.ocorrencias)

    decisao = registrar_decisao(
        revisao, acao=AcaoDecisao.PUBLICAR, autor="servidor.teste", obs_publicaveis=identidades
    )
    resultado = _resultado(revisoes=[revisao])

    revisado = aplicar_decisoes(resultado, {decisao.identidade_grupo: decisao})

    assert len(revisado.candidatos_publicaveis) == 2
    assert revisado.ocorrencias_nao_publicaveis == []


def test_aplicar_decisoes_decisao_antiga_ambigua_volta_para_revisao():
    """Migração: uma decisão gravada ANTES desta correção usa `ob` puro em
    `obs_publicaveis` (não distinguia ocorrência). Para um grupo com
    repetição física isso nunca bate com nenhuma identidade nova
    (`ob#N`) — nunca reinterpretado como "publicar todas": some do
    candidato publicável, a revisão volta a bloquear, e a decisão antiga
    é preservada em `RevisaoComEstado.decisao` (histórico), nunca
    descartada silenciosamente."""
    revisao = _revisao_rn04_repeticao_fisica()
    decisao_antiga = registrar_decisao(
        revisao, acao=AcaoDecisao.PUBLICAR, autor="servidor.antigo", obs_publicaveis=["2026OB000001"]
    )
    resultado = _resultado(revisoes=[revisao])

    revisado = aplicar_decisoes(resultado, {decisao_antiga.identidade_grupo: decisao_antiga})

    assert revisado.revisoes[0].estado is EstadoRevisao.REQUER_NOVA_DECISAO
    assert revisado.revisoes[0].decisao is decisao_antiga  # preservada, nunca descartada
    assert revisado.pode_gerar_relatorio is False
    assert revisado.candidatos_publicaveis == []
    assert revisado.ocorrencias_nao_publicaveis == []


def test_aplicar_decisoes_decisao_antiga_sem_ambiguidade_continua_valida():
    """Controle — uma decisão em formato "antigo" (ob puro) sobre um grupo
    SEM repetição física (RN07, ou qualquer grupo onde toda OB aparece uma
    única vez) nunca é ambígua: identidade == ob para esses grupos, então
    a decisão continua válida sem pedir revisão de novo."""
    revisao = _revisao()  # RN07 padrão, duas OBs distintas
    decisao = registrar_decisao(
        revisao, acao=AcaoDecisao.PUBLICAR, autor="servidor.teste", obs_publicaveis=["2026OB000001"]
    )
    resultado = _resultado(revisoes=[revisao])

    revisado = aplicar_decisoes(resultado, {decisao.identidade_grupo: decisao})

    assert revisado.revisoes[0].estado is EstadoRevisao.DECIDIDA


def test_aplicar_decisoes_publicar_zero_ocorrencias_de_grupo_com_repeticao_nao_e_ambiguo():
    """Uma decisão nova, explícita, de "publicar nenhuma ocorrência" deste
    grupo (`obs_publicaveis` vazio) NUNCA é o caso ambíguo — vazio sempre
    significa "nenhuma", em qualquer formato, então é aplicada normalmente
    (RevisaoComEstado.DECIDIDA, tudo em `ocorrencias_nao_publicaveis`)."""
    revisao = _revisao_rn04_repeticao_fisica()
    decisao = registrar_decisao(
        revisao,
        acao=AcaoDecisao.PUBLICAR,
        autor="servidor.teste",
        obs_publicaveis=[],
        observacao="Nenhuma das duas ocorrências deve ser publicada.",
    )
    resultado = _resultado(revisoes=[revisao])

    revisado = aplicar_decisoes(resultado, {decisao.identidade_grupo: decisao})

    assert revisado.revisoes[0].estado is EstadoRevisao.DECIDIDA
    assert revisado.candidatos_publicaveis == []
    assert len(revisado.ocorrencias_nao_publicaveis) == 2


# --- HOMO-RT-03 — identidade estável, à prova de reordenação -------------
# Confronto QA Codex (achado real e BLOQUEANTE): a versão HOMO-RT-02 usava
# `"{ob}#{N}"`, onde N vinha de ordenar por conteúdo serializado com
# desempate por `linha`. Combinado com a perda de precisão de
# `_campo_serializavel` (`.2f` — corrigida nesta sprint para `repr(float)`),
# duas ocorrências com valores sintéticos 100.001/100.002 serializavam
# igual, o desempate caía em `linha`, e trocar a posição física das duas
# linhas na Base OB trocava qual delas recebia `#0`/`#1` — uma decisão
# feita para A passava a publicar B silenciosamente. Corrigido substituindo
# a identidade posicional por hash de conteúdo (`identidades_ocorrencias`),
# sem nenhum desempate por posição/ordem/linha. Estes testes travam a
# GARANTIA central: a identidade de uma ocorrência lógica nunca muda por
# reordenação, nunca é herdada por outra ocorrência, e nunca depende de
# quantas outras ocorrências existem no grupo.


def test_precisao_numerica_distingue_valores_que_colidiriam_em_duas_casas():
    """Reprodução exata do confronto Codex: 100.001 e 100.002 arredondavam
    para "100.00" na serialização antiga — precisavam continuar distintos
    (RN04 já os trata como divergentes por valor, via comparação exata em
    `motor_decisao._resolver_repeticao_fisica`, nunca arredondada)."""
    a = _oc(ob="2026OB000001", linha=10, valor=100.001)
    b = _oc(ob="2026OB000001", linha=11, valor=100.002)

    assert calcular_fingerprint([a]) != calcular_fingerprint([b])
    identidade_a, identidade_b = identidades_ocorrencias([a, b])
    assert identidade_a != identidade_b


@pytest.mark.parametrize(
    "valor_a,valor_b",
    [
        (100.001, 100.002),
        (0.001, 0.009),
        (1234.565, 1234.575),
        (99.995, 100.005),
        (0.1 + 0.2, 0.3),  # ruído clássico de ponto flutuante — ainda assim valores distintos
    ],
)
def test_identidades_ocorrencias_varias_precisoes_nunca_colidem(valor_a, valor_b):
    assert valor_a != valor_b  # premissa do teste — não faria sentido se colidissem de verdade
    a = _oc(ob="2026OB000001", linha=10, valor=valor_a)
    b = _oc(ob="2026OB000001", linha=11, valor=valor_b)

    identidade_a, identidade_b = identidades_ocorrencias([a, b])

    assert identidade_a != identidade_b


def test_identidades_ocorrencias_nunca_depende_de_linha_ou_ordem_de_entrada():
    """A mesma ocorrência lógica (mesmo conteúdo) recebe a mesma identidade
    seja qual for `linha` ou a posição em que chega na lista de entrada."""
    a = _oc(ob="2026OB000001", linha=10, motivo="Motivo A")
    b = _oc(ob="2026OB000001", linha=11, motivo="Motivo B")

    identidade_a_ab, identidade_b_ab = identidades_ocorrencias([a, b])
    identidade_b_ba, identidade_a_ba = identidades_ocorrencias([b, a])

    assert identidade_a_ab == identidade_a_ba
    assert identidade_b_ab == identidade_b_ba
    assert identidade_a_ab != identidade_b_ab


def test_identidades_ocorrencias_tres_ocorrencias_todas_as_permutacoes_sao_estaveis():
    """Generaliza o teste acima para 3 ocorrências e as 6 permutações
    possíveis — a identidade de cada uma nunca depende de onde as outras
    duas estão na lista, nem da ordem de entrada como um todo."""
    a = _oc(ob="2026OB000001", linha=10, motivo="Motivo A")
    b = _oc(ob="2026OB000001", linha=11, motivo="Motivo B")
    c = _oc(ob="2026OB000001", linha=12, motivo="Motivo C")
    nome_por_id = {id(a): "A", id(b): "B", id(c): "C"}

    identidade_base = dict(zip(["A", "B", "C"], identidades_ocorrencias([a, b, c])))
    assert len(set(identidade_base.values())) == 3  # três ocorrências distintas, três identidades

    for permutacao in itertools.permutations([a, b, c]):
        identidades = identidades_ocorrencias(list(permutacao))
        for oc, identidade in zip(permutacao, identidades):
            assert identidade == identidade_base[nome_por_id[id(oc)]]


def test_identidades_ocorrencias_adicionar_ocorrencia_nao_muda_as_existentes():
    a = _oc(ob="2026OB000001", linha=10, motivo="Motivo A")
    b = _oc(ob="2026OB000001", linha=11, motivo="Motivo B")
    identidade_a_antes, identidade_b_antes = identidades_ocorrencias([a, b])

    c = _oc(ob="2026OB000001", linha=12, motivo="Motivo C")
    identidade_a_depois, identidade_b_depois, _ = identidades_ocorrencias([a, b, c])

    assert identidade_a_antes == identidade_a_depois
    assert identidade_b_antes == identidade_b_depois


def test_identidades_ocorrencias_remover_ocorrencia_nao_muda_as_restantes():
    a = _oc(ob="2026OB000001", linha=10, motivo="Motivo A")
    b = _oc(ob="2026OB000001", linha=11, motivo="Motivo B")
    c = _oc(ob="2026OB000001", linha=12, motivo="Motivo C")
    identidade_a_antes, identidade_b_antes, _ = identidades_ocorrencias([a, b, c])

    identidade_a_depois, identidade_b_depois = identidades_ocorrencias([a, b])

    assert identidade_a_antes == identidade_a_depois
    assert identidade_b_antes == identidade_b_depois


def test_identidades_ocorrencias_reconstrucao_identica_produz_a_mesma_identidade():
    """"Reabertura do app"/nova leitura da mesma fonte: objetos NOVOS
    (nunca os mesmos `id()` Python), mesmo conteúdo — a identidade tem que
    bater, senão nenhuma decisão jamais seria reaproveitável."""
    identidades_1 = identidades_ocorrencias(
        [_oc(ob="2026OB000001", linha=10, motivo="Motivo A"), _oc(ob="2026OB000001", linha=11, motivo="Motivo B")]
    )
    identidades_2 = identidades_ocorrencias(
        [_oc(ob="2026OB000001", linha=10, motivo="Motivo A"), _oc(ob="2026OB000001", linha=11, motivo="Motivo B")]
    )

    assert identidades_1 == identidades_2


def test_identidades_ocorrencias_mudanca_material_muda_a_identidade():
    a_antes = _oc(ob="2026OB000001", linha=10, motivo="Motivo original")
    b = _oc(ob="2026OB000001", linha=11, motivo="Motivo B")
    identidade_a_antes, _ = identidades_ocorrencias([a_antes, b])

    a_depois = _oc(ob="2026OB000001", linha=10, motivo="Motivo alterado")
    identidade_a_depois, _ = identidades_ocorrencias([a_depois, b])

    assert identidade_a_antes != identidade_a_depois


def test_identidades_ocorrencias_conteudo_identico_dentro_de_grupo_maior_fica_inseparavel():
    """3 ocorrências, duas delas (X1/X2) com conteúdo IDÊNTICO entre si e
    divergente da terceira (Y) — o subconjunto idêntico recebe a MESMA
    identidade (nunca uma distinção inventada), a divergente recebe outra."""
    x1 = _oc(ob="2026OB000001", linha=10, motivo="Motivo X")
    x2 = _oc(ob="2026OB000001", linha=11, motivo="Motivo X")
    y = _oc(ob="2026OB000001", linha=12, motivo="Motivo Y")

    identidade_x1, identidade_x2, identidade_y = identidades_ocorrencias([x1, x2, y])

    assert identidade_x1 == identidade_x2
    assert identidade_x1 != identidade_y


def test_decisao_para_ocorrencia_a_nunca_publica_b_apos_troca_de_linhas_fisicas():
    """O teste central desta sprint — reprodução direta do achado do Codex,
    agora como regressão permanente: decisão publica só A; reconstrução com
    as linhas físicas TROCADAS (mesmo conteúdo, `linha` invertida, ordem de
    entrada também invertida) nunca pode publicar B no lugar de A."""
    a_linha10 = _oc(ob="2026OB000001", linha=10, valor=100.001, motivo="Motivo A")
    b_linha11 = _oc(ob="2026OB000001", linha=11, valor=100.002, motivo="Motivo B")
    revisao_original = _revisao_rn04_repeticao_fisica(a_linha10, b_linha11)
    identidade_a = identidades_ocorrencias(revisao_original.ocorrencias)[0]

    decisao = registrar_decisao(
        revisao_original, acao=AcaoDecisao.PUBLICAR, autor="servidor.teste", obs_publicaveis=[identidade_a]
    )

    # "Reexportação com linhas físicas trocadas": mesmo conteúdo lógico,
    # `linha` invertida e ordem de entrada também invertida.
    a_linha11 = _oc(ob="2026OB000001", linha=11, valor=100.001, motivo="Motivo A")
    b_linha10 = _oc(ob="2026OB000001", linha=10, valor=100.002, motivo="Motivo B")
    revisao_reordenada = _revisao_rn04_repeticao_fisica(b_linha10, a_linha11)
    resultado = _resultado(revisoes=[revisao_reordenada])

    revisado = aplicar_decisoes(resultado, {decisao.identidade_grupo: decisao})

    assert revisado.revisoes[0].estado is EstadoRevisao.DECIDIDA
    publicados = [c.ocorrencia for c in revisado.candidatos_publicaveis if c.ocorrencia.ordem_bancaria.ob == "2026OB000001"]
    assert len(publicados) == 1
    assert publicados[0].ordem_bancaria.motivo == "Motivo A"  # NUNCA "Motivo B"


def test_ocorrencia_adicionada_ao_grupo_ja_decidido_invalida_a_decisao():
    """I11a — nenhuma ocorrência pode ser silenciosamente incorporada a uma
    decisão já tomada: o fingerprint do GRUPO muda (3 linhas serializadas
    em vez de 2), então volta a bloquear, nunca herda a decisão antiga."""
    a = _oc(ob="2026OB000001", linha=10, motivo="Motivo A")
    b = _oc(ob="2026OB000001", linha=11, motivo="Motivo B")
    revisao_original = _revisao_rn04_repeticao_fisica(a, b)
    identidade_a = identidades_ocorrencias(revisao_original.ocorrencias)[0]
    decisao = registrar_decisao(
        revisao_original, acao=AcaoDecisao.PUBLICAR, autor="servidor.teste", obs_publicaveis=[identidade_a]
    )

    c = _oc(ob="2026OB000001", linha=12, motivo="Motivo C")
    revisao_com_c = RevisaoNecessaria(regra="RN04", motivo=revisao_original.motivo, ocorrencias=[a, b, c])
    resultado = _resultado(revisoes=[revisao_com_c])

    revisado = aplicar_decisoes(resultado, {decisao.identidade_grupo: decisao})

    assert revisado.revisoes[0].estado is EstadoRevisao.DESATUALIZADA
    assert revisado.candidatos_publicaveis == []


def test_ocorrencia_removida_do_grupo_ja_decidido_invalida_a_decisao():
    a = _oc(ob="2026OB000001", linha=10, motivo="Motivo A")
    b = _oc(ob="2026OB000001", linha=11, motivo="Motivo B")
    c = _oc(ob="2026OB000001", linha=12, motivo="Motivo C")
    revisao_original = RevisaoNecessaria(regra="RN04", motivo="Divergência material.", ocorrencias=[a, b, c])
    identidade_a = identidades_ocorrencias(revisao_original.ocorrencias)[0]
    decisao = registrar_decisao(
        revisao_original, acao=AcaoDecisao.PUBLICAR, autor="servidor.teste", obs_publicaveis=[identidade_a]
    )

    revisao_sem_c = _revisao_rn04_repeticao_fisica(a, b)
    resultado = _resultado(revisoes=[revisao_sem_c])

    revisado = aplicar_decisoes(resultado, {decisao.identidade_grupo: decisao})

    assert revisado.revisoes[0].estado is EstadoRevisao.DESATUALIZADA
    assert revisado.candidatos_publicaveis == []


def test_decisao_em_formato_ob_n_do_homo_rt_02_e_tratada_como_ambigua():
    """Seção 7 do confronto HOMO-RT-03: qualquer decisão gravada no formato
    posicional `"{ob}#{N}"` (HOMO-RT-02, abandonado por instável) precisa
    ser tratada conservadoramente — nunca reaplicada às cegas — mesmo que
    `N` coincida por acaso com o índice de uma ocorrência hoje. O formato
    novo é hash de conteúdo (64 caracteres hex); `#0`/`#1` nunca colide com
    ele por construção."""
    revisao = _revisao_rn04_repeticao_fisica()
    decisao_formato_antigo = registrar_decisao(
        revisao, acao=AcaoDecisao.PUBLICAR, autor="servidor.antigo", obs_publicaveis=["2026OB000001#0"]
    )
    resultado = _resultado(revisoes=[revisao])

    revisado = aplicar_decisoes(resultado, {decisao_formato_antigo.identidade_grupo: decisao_formato_antigo})

    assert revisado.revisoes[0].estado is EstadoRevisao.REQUER_NOVA_DECISAO
    assert revisado.revisoes[0].decisao is decisao_formato_antigo
    assert revisado.candidatos_publicaveis == []


def test_decisao_em_formato_hash_sem_versao_do_homo_rt_03_e_tratada_como_ambigua():
    """Idem ao teste acima, para o formato `"{ob}#{hash sem versão}"` do
    HOMO-RT-03 (canonicalização por delimitador, vulnerável à colisão
    estrutural que motivou o HOMO-RT-04) — também nunca reaplicado às
    cegas, mesmo "parecendo" um hash válido."""
    revisao = _revisao_rn04_repeticao_fisica()
    hash_sem_versao = "2026OB000001#" + "a" * 64  # formato antigo: sem "v2:"
    decisao_formato_antigo = registrar_decisao(
        revisao, acao=AcaoDecisao.PUBLICAR, autor="servidor.antigo", obs_publicaveis=[hash_sem_versao]
    )
    resultado = _resultado(revisoes=[revisao])

    revisado = aplicar_decisoes(resultado, {decisao_formato_antigo.identidade_grupo: decisao_formato_antigo})

    assert revisado.revisoes[0].estado is EstadoRevisao.REQUER_NOVA_DECISAO
    assert revisado.revisoes[0].decisao is decisao_formato_antigo


# --- HOMO-RT-04 — canonicalização estrutural inequívoca -------------------
# Confronto QA Codex (achado real e BLOQUEANTE): `_serializar_ocorrencia`
# juntava valores já formatados em texto com um caractere sentinela
# (`_SEPARADOR_CAMPO`, `\x1f`) sem escaping/estrutura. Contraexemplo
# comprovado: `motivo="X\x1fY", situacao="Z"` e `motivo="X",
# situacao="Y\x1fZ"` produziam a MESMA string serializada — a fronteira
# entre campos podia ser "empurrada" pelo conteúdo de um campo. `None` e
# `""` também colidiam. Corrigido com uma representação ESTRUTURAL
# (`_campo_canonico` + `json.dumps`) — a fronteira passa a ser a gramática
# do JSON, nunca um byte que possa aparecer dentro do próprio valor.


def test_contraexemplo_exato_do_codex_motivo_e_situacao_nunca_colidem():
    """O contraexemplo EXATO reportado: `motivo="X\\x1fY", situacao="Z"`
    vs. `motivo="X", situacao="Y\\x1fZ"` — antes da correção, as duas
    serializavam para a MESMA string; agora precisam ser inequivocamente
    distintas em fingerprint e identidade."""
    a = _oc(ob="2026OB000001", motivo="X\x1fY", situacao="Z")
    b = _oc(ob="2026OB000001", motivo="X", situacao="Y\x1fZ")

    assert calcular_fingerprint([a]) != calcular_fingerprint([b])
    identidade_a, identidade_b = identidades_ocorrencias([a, b])
    assert identidade_a != identidade_b


@pytest.mark.parametrize(
    "caractere_perigoso",
    ["\x1f", "\x1e", "|", ",", ":", '"', "\\", "\n"],
    ids=["unit-sep", "record-sep", "pipe", "virgula", "dois-pontos", "aspas", "barra-invertida", "quebra-linha"],
)
def test_canonicalizacao_nunca_confunde_fronteira_de_campo_com_conteudo(caractere_perigoso):
    """Generaliza o contraexemplo do Codex para qualquer caractere que já
    foi usado como separador em algum ponto desta função (ou é
    estruturalmente "perigoso" para um formato ingênuo baseado em
    separador/aspas) — redistribuindo o mesmo caractere entre dois campos
    adjacentes, o conteúdo TOTAL serializado nunca pode colidir."""
    a = _oc(ob="2026OB000001", motivo=f"X{caractere_perigoso}Y", situacao="Z")
    b = _oc(ob="2026OB000001", motivo="X", situacao=f"Y{caractere_perigoso}Z")

    assert calcular_fingerprint([a]) != calcular_fingerprint([b])
    identidade_a, identidade_b = identidades_ocorrencias([a, b])
    assert identidade_a != identidade_b


def test_canonicalizacao_distingue_none_de_string_vazia():
    """`None` (ausência do dado) e `""` (campo vazio, mas presente) são
    semanticamente diferentes no domínio (`OrdemBancaria` distingue os
    dois deliberadamente — ver docstring da entidade) e precisam continuar
    estruturalmente distintos na canonicalização."""
    a = _oc(ob="2026OB000001", motivo=None)
    b = _oc(ob="2026OB000001", motivo="")

    assert calcular_fingerprint([a]) != calcular_fingerprint([b])
    identidade_a, identidade_b = identidades_ocorrencias([a, b])
    assert identidade_a != identidade_b


def test_canonicalizacao_trata_int_e_float_do_mesmo_valor_como_equivalentes():
    """`motor_decisao._resolver_repeticao_fisica`/`_campos_divergentes` já
    comparam `valor`/campos materiais por igualdade NATIVA do Python, onde
    `100 == 100.0`. A canonicalização acompanha a MESMA semântica —
    nunca invalida uma decisão só por uma diferença de representação que o
    próprio motor de decisão já considera irrelevante."""
    a = _oc(ob="2026OB000001", valor=100)
    b = _oc(ob="2026OB000001", valor=100.0)
    assert calcular_fingerprint([a]) == calcular_fingerprint([b])


def test_canonicalizacao_trata_zero_positivo_e_negativo_como_o_mesmo_valor():
    a = _oc(ob="2026OB000001", valor=0.0)
    b = _oc(ob="2026OB000001", valor=-0.0)
    assert calcular_fingerprint([a]) == calcular_fingerprint([b])


@pytest.mark.parametrize(
    "valor_a,valor_b",
    [
        (100.001, 100.002),  # o caso exato que derrubou o HOMO-RT-03
        (0.1 + 0.2, 0.3),  # ruído clássico de ponto flutuante
        (0.0000001, 0.0000002),  # valores muito pequenos
        (123456789.123456, 123456789.123457),  # valores grandes com precisão adicional
        (50.001, 50.0019),  # restituição com precisão adicional além de 2 casas
    ],
)
def test_canonicalizacao_preserva_precisao_material_em_varias_escalas(valor_a, valor_b):
    assert valor_a != valor_b  # premissa do teste
    a = _oc(ob="2026OB000001", valor=valor_a)
    b = _oc(ob="2026OB000001", valor=valor_b)
    assert calcular_fingerprint([a]) != calcular_fingerprint([b])
    identidade_a, identidade_b = identidades_ocorrencias([a, b])
    assert identidade_a != identidade_b


def test_canonicalizacao_restituicao_preserva_precisao_material():
    a = _oc(ob="2026OB000001", restituicao=50.001)
    b = _oc(ob="2026OB000001", restituicao=50.002)
    assert calcular_fingerprint([a]) != calcular_fingerprint([b])


# --- HOMO-RT-04 — multiplicidade e independência de ordem no fingerprint --


def test_fingerprint_do_grupo_distingue_a_a_b_de_a_b():
    """`[A, A, B]` (A duplicada) nunca pode ter o mesmo fingerprint que
    `[A, B]` — multiplicidade é parte da evidência do grupo."""
    a1 = _oc(ob="2026OB000001", linha=10, motivo="Motivo A")
    a2 = _oc(ob="2026OB000001", linha=11, motivo="Motivo A")
    b = _oc(ob="2026OB000002", linha=12, motivo="Motivo B")

    fingerprint_aab = calcular_fingerprint([a1, a2, b])
    fingerprint_ab = calcular_fingerprint([a1, b])

    assert fingerprint_aab != fingerprint_ab


def test_fingerprint_do_grupo_a_b_a_igual_a_a_a_b():
    """Preserva multiplicidade, mas é independente da ORDEM de entrada."""
    a1 = _oc(ob="2026OB000001", linha=10, motivo="Motivo A")
    a2 = _oc(ob="2026OB000001", linha=11, motivo="Motivo A")
    b = _oc(ob="2026OB000002", linha=12, motivo="Motivo B")

    fingerprint_aba = calcular_fingerprint([a1, b, a2])
    fingerprint_aab = calcular_fingerprint([a1, a2, b])

    assert fingerprint_aba == fingerprint_aab


@pytest.mark.parametrize(
    "combinacao",
    [
        ["A", "B"],
        ["A", "B", "C"],
        ["A", "A", "B"],
        ["A", "B", "A"],
        ["A", "A"],
        ["A"],
    ],
)
def test_fingerprint_combinacoes_de_multiplicidade_sao_internamente_consistentes(combinacao):
    """Constrói cada combinação pedida no confronto e confirma que o
    fingerprint é determinístico (mesma combinação → mesmo fingerprint) e
    sensível à composição exata (combinações de tamanho/multiplicidade
    diferentes nunca colidem entre si nesta tabela)."""
    fabricas = {
        "A": lambda linha: _oc(ob="2026OB000001", linha=linha, motivo="Motivo A"),
        "B": lambda linha: _oc(ob="2026OB000002", linha=linha, motivo="Motivo B"),
        "C": lambda linha: _oc(ob="2026OB000003", linha=linha, motivo="Motivo C"),
    }
    ocorrencias = [fabricas[letra](10 + indice) for indice, letra in enumerate(combinacao)]

    fingerprint_1 = calcular_fingerprint(ocorrencias)
    fingerprint_2 = calcular_fingerprint(list(reversed(ocorrencias)))
    assert fingerprint_1 == fingerprint_2  # determinístico, independente de ordem


def test_fingerprints_de_combinacoes_distintas_de_multiplicidade_nao_colidem():
    a = lambda linha: _oc(ob="2026OB000001", linha=linha, motivo="Motivo A")  # noqa: E731
    b = lambda linha: _oc(ob="2026OB000002", linha=linha, motivo="Motivo B")  # noqa: E731

    combinacoes = {
        "AB": [a(10), b(11)],
        "ABC": [a(10), b(11), a(12)],  # na verdade A,B,A — nome mantido só como rótulo do dict
        "AAB": [a(10), a(11), b(12)],
        "AA": [a(10), a(11)],
        "A": [a(10)],
    }
    fingerprints = {nome: calcular_fingerprint(ocs) for nome, ocs in combinacoes.items()}

    assert fingerprints["AB"] != fingerprints["AAB"]
    assert fingerprints["AB"] != fingerprints["AA"]
    assert fingerprints["AB"] != fingerprints["A"]
    assert fingerprints["AAB"] != fingerprints["AA"]
    assert fingerprints["AAB"] == fingerprints["ABC"]  # A,B,A e A,A,B — mesma multiplicidade, ordem diferente


# --- HOMO-RT-04 — reordenação (A/B e as 6 permutações de A/B/C) -----------


def test_decisao_persistida_para_a_sobrevive_a_reconstrucao_como_b_a():
    """Fluxo pedido no confronto: A/B → decisão só para A → persistir →
    reconstruir a fonte como B/A → reload → reaplicar. A continua A, B
    continua B, fingerprint do grupo é o mesmo, decisão continua só para A."""
    a = _oc(ob="2026OB000001", linha=10, motivo="Motivo A")
    b = _oc(ob="2026OB000001", linha=11, motivo="Motivo B")
    revisao_ab = _revisao_rn04_repeticao_fisica(a, b)
    identidade_a = identidades_ocorrencias(revisao_ab.ocorrencias)[0]

    decisao = registrar_decisao(
        revisao_ab, acao=AcaoDecisao.PUBLICAR, autor="servidor.teste", obs_publicaveis=[identidade_a]
    )

    revisao_ba = _revisao_rn04_repeticao_fisica(b, a)  # "reconstruída como B/A"
    resultado = _resultado(revisoes=[revisao_ba])

    assert calcular_fingerprint(revisao_ba.ocorrencias) == decisao.fingerprint_evidencias

    revisado = aplicar_decisoes(resultado, {decisao.identidade_grupo: decisao})

    assert revisado.revisoes[0].estado is EstadoRevisao.DECIDIDA
    publicados = [c.ocorrencia.ordem_bancaria.motivo for c in revisado.candidatos_publicaveis]
    assert publicados == ["Motivo A"]


def test_identidades_ocorrencias_todas_as_permutacoes_de_abc_preservam_identidade_por_conteudo():
    a = _oc(ob="2026OB000001", linha=10, motivo="Motivo A")
    b = _oc(ob="2026OB000001", linha=11, motivo="Motivo B")
    c = _oc(ob="2026OB000001", linha=12, motivo="Motivo C")
    nome_por_id = {id(a): "A", id(b): "B", id(c): "C"}

    identidade_base = dict(zip(["A", "B", "C"], identidades_ocorrencias([a, b, c])))

    for permutacao in itertools.permutations([a, b, c]):
        identidades = identidades_ocorrencias(list(permutacao))
        for oc, identidade in zip(permutacao, identidades):
            assert identidade == identidade_base[nome_por_id[id(oc)]]


# --- HOMO-RT-04 — alteração material após decisão -------------------------


def test_alteracao_material_de_a_apos_decisao_nunca_publica_b():
    """Depois de decidir só por A: altera UM campo material de A (nunca de
    B). Esperado: fingerprint do grupo muda (DESATUALIZADA) — nunca
    DECIDIDA publicando a ocorrência errada."""
    a_original = _oc(ob="2026OB000001", linha=10, motivo="Motivo A original")
    b = _oc(ob="2026OB000001", linha=11, motivo="Motivo B")
    revisao_original = _revisao_rn04_repeticao_fisica(a_original, b)
    identidade_a = identidades_ocorrencias(revisao_original.ocorrencias)[0]
    decisao = registrar_decisao(
        revisao_original, acao=AcaoDecisao.PUBLICAR, autor="servidor.teste", obs_publicaveis=[identidade_a]
    )

    a_alterada = _oc(ob="2026OB000001", linha=10, motivo="Motivo A alterado")
    revisao_alterada = _revisao_rn04_repeticao_fisica(a_alterada, b)
    resultado = _resultado(revisoes=[revisao_alterada])

    revisado = aplicar_decisoes(resultado, {decisao.identidade_grupo: decisao})

    assert revisado.revisoes[0].estado is EstadoRevisao.DESATUALIZADA
    assert revisado.candidatos_publicaveis == []


# --- Micro-sprint corretiva HOMO-RT-05 — identidade da LINHA PUBLICÁVEL ---
# Achado do Codex: duas ocorrências idênticas em `CAMPOS_EVIDENCIA_MATERIAL`
# podem ter CREDOR diferente — como o Nome publicado no XLSX depende de
# `nome` E `credor` (`linha_publicavel.nome_publicado`), a mesma decisão
# podia continuar DECIDIDA e passar a publicar um Nome diferente do que o
# usuário viu. Auditoria estrutural encontrou o mesmo padrão para Cargo/
# Transporte (Controle DIMCAC tem precedência sobre a Base OB) e para
# Quantidade de Diárias Integral/Parcial (só existe no Controle DIMCAC).
# Corrigido incluindo os campos EFETIVAMENTE PUBLICÁVEIS na identidade/
# fingerprint, reaproveitando as MESMAS funções do escritor
# (`_campos_linha_publicavel`) — nunca uma reimplementação paralela.


def test_credor_diferente_muda_a_identidade_quando_nome_publicado_diverge():
    """Reprodução exata do HOMO-RT-05: mesma OB, `nome` idêntico, `credor`
    diferente o bastante para mudar o Nome efetivamente publicado
    (`credor` mais longo E prefixado por `nome` — a mesma condição de
    `nome_publicado`)."""
    a = _oc(ob="2026OB000001", linha=10, nome="MARIA DA SILVA SANTOS", credor="MARIA DA SILVA SANTOS")
    b = _oc(ob="2026OB000001", linha=11, nome="MARIA DA SILVA SANTOS", credor="MARIA DA SILVA SANTOS FILHA")

    assert calcular_fingerprint([a]) != calcular_fingerprint([b])
    identidade_a, identidade_b = identidades_ocorrencias([a, b])
    assert identidade_a != identidade_b


def test_credor_diferente_nao_muda_identidade_quando_nome_publicado_nao_muda():
    """Controle negativo — CREDOR bruto diferente, mas SEM relação de
    prefixo/truncamento com `nome` (a condição de `nome_publicado` nunca
    dispara): o Nome efetivamente publicado continua `nome` nos dois
    casos, então a identidade não pode divergir só por isso (nunca
    supersensibilizar além do que é realmente publicado)."""
    a = _oc(ob="2026OB000001", nome="MARIA DA SILVA SANTOS", credor="CREDOR SEM NENHUMA RELAÇÃO")
    b = _oc(ob="2026OB000001", nome="MARIA DA SILVA SANTOS", credor="OUTRO CREDOR TOTALMENTE DIFERENTE")

    assert calcular_fingerprint([a]) == calcular_fingerprint([b])


def test_cargo_do_controle_diferente_muda_a_identidade():
    """Cargo efetivamente publicado vem do Controle DIMCAC (PRIMÁRIO) —
    duas ocorrências idênticas em `CAMPOS_EVIDENCIA_MATERIAL` (inclusive
    `ordem.cargo`, igual/vazio nas duas) com `RegistroControle.cargo`
    diferente precisam ter identidades diferentes."""
    a = _oc(ob="2026OB000001", linha=10, cargo=None, registros_controle=[_registro_controle_flex(cargo="ANALISTA")])
    b = _oc(ob="2026OB000001", linha=11, cargo=None, registros_controle=[_registro_controle_flex(cargo="TÉCNICO")])

    assert calcular_fingerprint([a]) != calcular_fingerprint([b])
    identidade_a, identidade_b = identidades_ocorrencias([a, b])
    assert identidade_a != identidade_b


def test_transporte_do_controle_diferente_muda_a_identidade():
    a = _oc(
        ob="2026OB000001", linha=10, transporte=None,
        registros_controle=[_registro_controle_flex(transporte="CARRO")],
    )
    b = _oc(
        ob="2026OB000001", linha=11, transporte=None,
        registros_controle=[_registro_controle_flex(transporte="AVIÃO")],
    )

    assert calcular_fingerprint([a]) != calcular_fingerprint([b])
    identidade_a, identidade_b = identidades_ocorrencias([a, b])
    assert identidade_a != identidade_b


def test_quantidade_diarias_diferente_muda_a_identidade():
    """Nº de Diárias Integral/Parcial não existe na Base OB — vem só do
    Controle DIMCAC. Duas ocorrências idênticas na entrada, com
    quantidade diferente no Controle, precisam ter identidades
    diferentes."""
    a = _oc(
        ob="2026OB000001", linha=10,
        registros_controle=[_registro_controle_flex(quantidade_diaria_integral=2, quantidade_diaria_parcial=0)],
    )
    b = _oc(
        ob="2026OB000001", linha=11,
        registros_controle=[_registro_controle_flex(quantidade_diaria_integral=1, quantidade_diaria_parcial=1)],
    )

    assert calcular_fingerprint([a]) != calcular_fingerprint([b])
    identidade_a, identidade_b = identidades_ocorrencias([a, b])
    assert identidade_a != identidade_b


def test_quantidade_diarias_none_por_divergencia_e_estavel_e_distinta_de_valor_numerico():
    """Quando os `RegistroControle` do mesmo DH divergem entre si,
    `resolver_quantidade_diarias` devolve `None` (célula em branco) — isso
    precisa ser um valor de identidade ESTÁVEL (não pode virar "ambíguo"
    só por existir) e continuar distinto de um valor numérico real."""
    a = _oc(
        ob="2026OB000001", linha=10,
        registros_controle=[
            _registro_controle_flex(linha=2, quantidade_diaria_integral=2, quantidade_diaria_parcial=0),
            _registro_controle_flex(linha=3, quantidade_diaria_integral=1, quantidade_diaria_parcial=1),
        ],
    )
    b = _oc(
        ob="2026OB000001", linha=11,
        registros_controle=[_registro_controle_flex(quantidade_diaria_integral=2, quantidade_diaria_parcial=0)],
    )

    identidade_a_1, identidade_b_1 = identidades_ocorrencias([a, b])
    identidade_a_2, identidade_b_2 = identidades_ocorrencias([a, b])
    assert identidade_a_1 == identidade_a_2  # estável entre chamadas
    assert identidade_a_1 != identidade_b_1  # None (divergente) != valor numérico


def test_mudanca_em_campo_nao_publicado_nao_afeta_identidade_nem_fingerprint():
    """Controle negativo — `duplicidade` e `linha` nunca são publicados no
    XLSX; mudar qualquer um dos dois nunca pode afetar identidade/
    fingerprint (nenhuma supersensibilização)."""
    a = _oc(ob="2026OB000001", linha=10, duplicidade="Único")
    b = _oc(ob="2026OB000001", linha=999, duplicidade="Duplicado")

    assert calcular_fingerprint([a]) == calcular_fingerprint([b])


def test_rn04_continua_reagindo_so_a_evidencia_de_entrada_bruta():
    """RN04 (`motor_decisao._campos_divergentes`) nunca deve passar a
    disparar por uma diferença de Cargo do CONTROLE quando a Base OB é
    idêntica — mudar isso mudaria o escopo de RN01-RN07, fora desta
    correção. Testado diretamente contra `CAMPOS_EVIDENCIA_MATERIAL`
    (a mesma verificação que `_campos_divergentes` faz)."""
    from app.domain.relatorio_transparencia.motor_decisao import CAMPOS_EVIDENCIA_MATERIAL

    a = _oc(ob="2026OB000001", linha=10, cargo=None, registros_controle=[_registro_controle_flex(cargo="ANALISTA")])
    b = _oc(ob="2026OB000001", linha=11, cargo=None, registros_controle=[_registro_controle_flex(cargo="TÉCNICO")])

    divergentes = [nome for nome, extrator in CAMPOS_EVIDENCIA_MATERIAL.items() if extrator(a) != extrator(b)]
    assert divergentes == []  # nenhum campo de ENTRADA diverge — RN04 não vê o Controle


def test_decisao_antiga_especifica_vira_desatualizada_quando_so_cargo_do_controle_muda():
    """Migração conservadora: uma decisão específica registrada ANTES da
    correção (fingerprint sem os campos da linha publicável) — simulada
    aqui registrando sobre a evidência ORIGINAL e reconstruindo com só o
    Cargo do Controle alterado — precisa exigir nova decisão
    (`DESATUALIZADA`), nunca continuar `DECIDIDA` publicando Cargo
    diferente do que foi visto."""
    a_original = _oc(
        ob="2026OB000001", linha=10, cargo=None,
        registros_controle=[_registro_controle_flex(cargo="ANALISTA")],
    )
    b = _oc(ob="2026OB000001", linha=11, motivo="Motivo B")
    revisao_original = _revisao_rn04_repeticao_fisica(a_original, b)
    identidade_a = identidades_ocorrencias(revisao_original.ocorrencias)[0]
    decisao = registrar_decisao(
        revisao_original, acao=AcaoDecisao.PUBLICAR, autor="servidor.teste", obs_publicaveis=[identidade_a]
    )

    a_cargo_alterado = _oc(
        ob="2026OB000001", linha=10, cargo=None,
        registros_controle=[_registro_controle_flex(cargo="TÉCNICO")],
    )
    revisao_reconstruida = _revisao_rn04_repeticao_fisica(a_cargo_alterado, b)
    resultado = _resultado(revisoes=[revisao_reconstruida])

    revisado = aplicar_decisoes(resultado, {decisao.identidade_grupo: decisao})

    assert revisado.revisoes[0].estado is EstadoRevisao.DESATUALIZADA
    assert revisado.candidatos_publicaveis == []


def test_duplicatas_com_cargo_do_controle_diferente_deixam_de_ser_identicas():
    """Sob a nova definição, duas ocorrências iguais em
    `CAMPOS_EVIDENCIA_MATERIAL` mas diferentes em Cargo do Controle NÃO
    compartilham mais identidade — deixam de ser "idênticas", exatamente a
    garantia pedida (materialmente diferentes nunca podem ser tratadas
    como a mesma ocorrência)."""
    a = _oc(ob="2026OB000001", linha=10, cargo=None, registros_controle=[_registro_controle_flex(cargo="ANALISTA")])
    b = _oc(ob="2026OB000001", linha=11, cargo=None, registros_controle=[_registro_controle_flex(cargo="TÉCNICO")])

    identidade_a, identidade_b = identidades_ocorrencias([a, b])
    assert identidade_a != identidade_b  # nunca a mesma classe/identidade


def test_decisao_formato_v2_e_tratada_como_ambigua_apos_avanco_para_v3():
    """Seção 14 do confronto: uma decisão gravada no formato hash `v2`
    (HOMO-RT-04 — canonicalização estruturalmente segura, mas sem os
    campos da linha publicável) nunca pode ser reaplicada às cegas sob o
    formato `v3` — nenhuma coincidência textual entre os dois prefixos."""
    revisao = _revisao_rn04_repeticao_fisica()
    identidade_formato_v2 = "2026OB000001#v2:" + "a" * 64
    decisao_formato_antigo = registrar_decisao(
        revisao, acao=AcaoDecisao.PUBLICAR, autor="servidor.antigo", obs_publicaveis=[identidade_formato_v2]
    )
    resultado = _resultado(revisoes=[revisao])

    revisado = aplicar_decisoes(resultado, {decisao_formato_antigo.identidade_grupo: decisao_formato_antigo})

    assert revisado.revisoes[0].estado is EstadoRevisao.REQUER_NOVA_DECISAO
    assert revisado.revisoes[0].decisao is decisao_formato_antigo


# --- Micro-sprint "Duplicatas idênticas" — publicar no máximo 1 -----------
# Decisão de produto já tomada: ocorrências FISICAMENTE duplicadas e
# MATERIALMENTE IDÊNTICAS (mesma OB, mesmo conteúdo — `identidades_
# ocorrencias` já dá a elas a MESMA identidade) publicam NO MÁXIMO UMA
# representante quando essa identidade é selecionada — nunca N vezes o
# mesmo pagamento só porque a linha física se repetiu na fonte.


def _oc_identica(ob="2026OB000001", linha=10) -> OcorrenciaFinanceira:
    """Fábrica de ocorrências GARANTIDAMENTE idênticas em todo campo
    material — chamar várias vezes com `linha` diferente (só diagnóstico,
    nunca material) produz um grupo de duplicatas idênticas de verdade."""
    return _oc(ob=ob, linha=linha)


def test_duas_ocorrencias_identicas_publicar_uma_gera_exatamente_uma_candidata():
    a = _oc_identica(linha=10)
    b = _oc_identica(linha=11)
    revisao = _revisao_rn04_repeticao_fisica(a, b)
    identidade_classe = identidades_ocorrencias(revisao.ocorrencias)[0]
    assert identidades_ocorrencias(revisao.ocorrencias) == [identidade_classe, identidade_classe]

    decisao = registrar_decisao(
        revisao, acao=AcaoDecisao.PUBLICAR, autor="servidor.teste", obs_publicaveis=[identidade_classe]
    )
    resultado = _resultado(revisoes=[revisao])

    revisado = aplicar_decisoes(resultado, {decisao.identidade_grupo: decisao})

    assert revisado.revisoes[0].estado is EstadoRevisao.DECIDIDA
    assert len(revisado.candidatos_publicaveis) == 1  # NUNCA 2 — mesmo pagamento, uma vez só
    assert len(revisado.ocorrencias_nao_publicaveis) == 1  # a outra continua rastreável, I11a


def test_tres_ocorrencias_identicas_publicar_uma_gera_exatamente_uma_candidata():
    a, b, c = _oc_identica(linha=10), _oc_identica(linha=11), _oc_identica(linha=12)
    revisao = RevisaoNecessaria(regra="RN04", motivo="3 linhas físicas idênticas.", ocorrencias=[a, b, c])
    identidades = identidades_ocorrencias(revisao.ocorrencias)
    assert len(set(identidades)) == 1  # as 3 são a MESMA classe

    decisao = registrar_decisao(
        revisao, acao=AcaoDecisao.PUBLICAR, autor="servidor.teste", obs_publicaveis=[identidades[0]]
    )
    resultado = _resultado(revisoes=[revisao])

    revisado = aplicar_decisoes(resultado, {decisao.identidade_grupo: decisao})

    assert len(revisado.candidatos_publicaveis) == 1
    assert len(revisado.ocorrencias_nao_publicaveis) == 2


def test_duas_ocorrencias_identicas_nao_publicar_nenhuma():
    a, b = _oc_identica(linha=10), _oc_identica(linha=11)
    revisao = _revisao_rn04_repeticao_fisica(a, b)
    decisao = registrar_decisao(
        revisao,
        acao=AcaoDecisao.PUBLICAR,
        autor="servidor.teste",
        obs_publicaveis=[],
        observacao="Duplicata idêntica de exportação — nenhuma das duas deve ser publicada.",
    )
    resultado = _resultado(revisoes=[revisao])

    revisado = aplicar_decisoes(resultado, {decisao.identidade_grupo: decisao})

    assert revisado.revisoes[0].estado is EstadoRevisao.DECIDIDA
    assert revisado.candidatos_publicaveis == []
    assert len(revisado.ocorrencias_nao_publicaveis) == 2


def test_duas_ocorrencias_identicas_adiar_bloqueia():
    a, b = _oc_identica(linha=10), _oc_identica(linha=11)
    revisao = _revisao_rn04_repeticao_fisica(a, b)
    decisao = registrar_decisao(revisao, acao=AcaoDecisao.ADIAR, autor="servidor.teste")
    resultado = _resultado(revisoes=[revisao])

    revisado = aplicar_decisoes(resultado, {decisao.identidade_grupo: decisao})

    assert revisado.revisoes[0].estado is EstadoRevisao.ADIADA
    assert revisado.pode_gerar_relatorio is False
    assert revisado.candidatos_publicaveis == []


def test_classe_identica_mais_ocorrencia_distinta_sao_selecionaveis_independentemente():
    """[A, A, B]: A duplicada idêntica + B distinta. Selecionar a classe A
    (publicar 1) e TAMBÉM B publica exatamente 2 candidatas (1 de cada
    classe) — nunca 3."""
    a1, a2 = _oc_identica(linha=10), _oc_identica(linha=11)
    b = _oc(ob="2026OB000001", linha=12, motivo="Motivo B — divergente")
    revisao = RevisaoNecessaria(regra="RN04", motivo="Divergência material.", ocorrencias=[a1, a2, b])
    identidades = identidades_ocorrencias(revisao.ocorrencias)
    identidade_classe_a = identidades[0]
    identidade_b = identidades[2]
    assert identidades[0] == identidades[1] != identidade_b

    decisao = registrar_decisao(
        revisao,
        acao=AcaoDecisao.PUBLICAR,
        autor="servidor.teste",
        obs_publicaveis=[identidade_classe_a, identidade_b],
    )
    resultado = _resultado(revisoes=[revisao])

    revisado = aplicar_decisoes(resultado, {decisao.identidade_grupo: decisao})

    assert len(revisado.candidatos_publicaveis) == 2
    assert len(revisado.ocorrencias_nao_publicaveis) == 1  # a segunda cópia de A


def test_duplicatas_identicas_reordenacao_nao_altera_semantica():
    """Reordenar as linhas físicas de um grupo de duplicatas idênticas
    nunca muda quantas são publicadas nem o conteúdo publicado — as
    ocorrências são byte-a-byte idênticas, então QUALQUER uma servindo de
    representante produz o mesmo resultado observável."""
    a, b = _oc_identica(linha=10), _oc_identica(linha=11)
    revisao_ab = _revisao_rn04_repeticao_fisica(a, b)
    identidade_classe = identidades_ocorrencias(revisao_ab.ocorrencias)[0]
    decisao = registrar_decisao(
        revisao_ab, acao=AcaoDecisao.PUBLICAR, autor="servidor.teste", obs_publicaveis=[identidade_classe]
    )

    revisao_ba = _revisao_rn04_repeticao_fisica(b, a)  # ordem física invertida
    resultado = _resultado(revisoes=[revisao_ba])

    revisado = aplicar_decisoes(resultado, {decisao.identidade_grupo: decisao})

    assert revisado.revisoes[0].estado is EstadoRevisao.DECIDIDA
    assert len(revisado.candidatos_publicaveis) == 1
    valores_publicados = {c.ocorrencia.ordem_bancaria.valor for c in revisado.candidatos_publicaveis}
    assert valores_publicados == {154.09}  # valor default de `_oc`, nunca contado 2x


# --- Micro-sprint "Duplicatas idênticas" — RN07 (ocorrências distinguíveis,
# retestado explicitamente para as 5 combinações pedidas) ------------------


def test_rn07_publicar_somente_a_segunda_ob():
    revisao = _revisao()  # RN07 padrão: 2026OB000001 / 2026OB000002
    decisao = registrar_decisao(
        revisao, acao=AcaoDecisao.PUBLICAR, autor="servidor.teste", obs_publicaveis=["2026OB000002"]
    )
    resultado = _resultado(revisoes=[revisao])

    revisado = aplicar_decisoes(resultado, {decisao.identidade_grupo: decisao})

    obs_publicadas = {c.ocorrencia.ordem_bancaria.ob for c in revisado.candidatos_publicaveis}
    assert obs_publicadas == {"2026OB000002"}
    assert len(revisado.ocorrencias_nao_publicaveis) == 1
    assert revisado.ocorrencias_nao_publicaveis[0].ocorrencia.ordem_bancaria.ob == "2026OB000001"


def test_rn07_nao_publicar_nenhuma():
    revisao = _revisao()
    decisao = registrar_decisao(
        revisao,
        acao=AcaoDecisao.PUBLICAR,
        autor="servidor.teste",
        obs_publicaveis=[],
        observacao="Ambas as OBs são suspeitas — nenhuma deve ser publicada.",
    )
    resultado = _resultado(revisoes=[revisao])

    revisado = aplicar_decisoes(resultado, {decisao.identidade_grupo: decisao})

    assert revisado.revisoes[0].estado is EstadoRevisao.DECIDIDA
    assert revisado.candidatos_publicaveis == []
    assert len(revisado.ocorrencias_nao_publicaveis) == 2


# --- Micro-sprint "Duplicatas idênticas" — identidade_grupo segura --------
# `identidade_grupo` corrigida para a mesma canonicalização JSON estrutural
# de `_serializar_ocorrencia` (HOMO-RT-04) — achado reportado naquela
# sprint, corrigido agora. Cobre também o versionamento/compatibilidade:
# decisões gravadas com a chave ANTIGA (`_identidade_grupo_legado`) nunca
# somem silenciosamente.


def test_identidade_grupo_nunca_confunde_fronteira_entre_regra_e_obs():
    """Contraexemplo estrutural: uma OB contendo o separador antigo não
    pode fazer dois grupos LOGICAMENTE diferentes colidirem."""
    grupo_1 = identidade_grupo("RN04", ["A\x1fB", "C"])
    grupo_2 = identidade_grupo("RN04", ["A", "B\x1fC"])
    assert grupo_1 != grupo_2


def test_identidade_grupo_independe_da_ordem_com_tres_obs():
    grupo_1 = identidade_grupo("RN07", ["2026OB000001", "2026OB000002", "2026OB000003"])
    grupo_2 = identidade_grupo("RN07", ["2026OB000003", "2026OB000001", "2026OB000002"])
    assert grupo_1 == grupo_2


def test_identidade_grupo_versao_nova_diverge_da_legada_para_o_mesmo_grupo():
    """A migração depende disto: a chave NOVA e a chave LEGADA do MESMO
    grupo precisam ser valores DIFERENTES (senão não haveria nada para
    `aplicar_decisoes` "migrar" — a busca pela chave nova já encontraria
    tudo)."""
    nova = identidade_grupo("RN07", ["2026OB000001", "2026OB000002"])
    legada = _identidade_grupo_legado("RN07", ["2026OB000001", "2026OB000002"])
    assert nova != legada


def test_decisao_gravada_com_chave_legada_de_grupo_adiar_e_reaplicada_com_seguranca():
    """`ADIAR` nunca publica nada — reaplicar uma decisão antiga (chave de
    grupo legada) como ADIADA nunca tem risco material, mesmo sob uma
    hipotética colisão da chave antiga. Simula uma instalação existente:
    grava a decisão manualmente com `_identidade_grupo_legado` (nunca via
    `registrar_decisao`, que já usa a chave nova)."""
    revisao = _revisao()
    obs = [oc.ordem_bancaria.ob for oc in revisao.ocorrencias]
    decisao_legada = DecisaoHumana(
        identidade_grupo=_identidade_grupo_legado(revisao.regra, obs),
        regra=revisao.regra,
        obs_envolvidas=frozenset(obs),
        fingerprint_evidencias=calcular_fingerprint(revisao.ocorrencias),
        acao=AcaoDecisao.ADIAR,
        autor="servidor.antigo",
        decidido_em=datetime(2026, 1, 10, 9, 0, 0, tzinfo=timezone.utc),
    )
    resultado = _resultado(revisoes=[revisao])

    revisado = aplicar_decisoes(resultado, {decisao_legada.identidade_grupo: decisao_legada})

    assert revisado.revisoes[0].estado is EstadoRevisao.ADIADA
    assert revisado.revisoes[0].decisao is decisao_legada
    assert revisado.revisoes[0].decisao.autor == "servidor.antigo"  # histórico preservado


def test_decisao_gravada_com_chave_legada_publicar_zero_e_reaplicada_com_seguranca():
    """`PUBLICAR` com `obs_publicaveis` vazio também nunca publica nada —
    mesma garantia de segurança do ADIAR."""
    revisao = _revisao()
    obs = [oc.ordem_bancaria.ob for oc in revisao.ocorrencias]
    decisao_legada = DecisaoHumana(
        identidade_grupo=_identidade_grupo_legado(revisao.regra, obs),
        regra=revisao.regra,
        obs_envolvidas=frozenset(obs),
        fingerprint_evidencias=calcular_fingerprint(revisao.ocorrencias),
        acao=AcaoDecisao.PUBLICAR,
        autor="servidor.antigo",
        decidido_em=datetime(2026, 1, 10, 9, 0, 0, tzinfo=timezone.utc),
        obs_publicaveis=frozenset(),
        observacao="Nenhuma das duas deveria ser publicada.",
    )
    resultado = _resultado(revisoes=[revisao])

    revisado = aplicar_decisoes(resultado, {decisao_legada.identidade_grupo: decisao_legada})

    assert revisado.revisoes[0].estado is EstadoRevisao.DECIDIDA
    assert revisado.candidatos_publicaveis == []
    assert revisado.revisoes[0].decisao.autor == "servidor.antigo"
    assert revisado.revisoes[0].decisao.observacao == "Nenhuma das duas deveria ser publicada."


def test_decisao_gravada_com_chave_legada_publicar_especifica_exige_nova_decisao():
    """`PUBLICAR` com pelo menos uma OB selecionada, encontrada só pela
    chave LEGADA, NUNCA é reaplicada às cegas — sob uma hipotética colisão
    da chave antiga, isso poderia publicar conteúdo do grupo ERRADO.
    Histórico (autor/data/observação) continua preservado, nunca
    descartado."""
    revisao = _revisao()
    obs = [oc.ordem_bancaria.ob for oc in revisao.ocorrencias]
    decisao_legada = DecisaoHumana(
        identidade_grupo=_identidade_grupo_legado(revisao.regra, obs),
        regra=revisao.regra,
        obs_envolvidas=frozenset(obs),
        fingerprint_evidencias=calcular_fingerprint(revisao.ocorrencias),
        acao=AcaoDecisao.PUBLICAR,
        autor="servidor.antigo",
        decidido_em=datetime(2026, 1, 10, 9, 0, 0, tzinfo=timezone.utc),
        obs_publicaveis=frozenset(["2026OB000001"]),
    )
    resultado = _resultado(revisoes=[revisao])

    revisado = aplicar_decisoes(resultado, {decisao_legada.identidade_grupo: decisao_legada})

    assert revisado.revisoes[0].estado is EstadoRevisao.REQUER_NOVA_DECISAO
    assert revisado.candidatos_publicaveis == []
    assert revisado.revisoes[0].decisao is decisao_legada
    assert revisado.revisoes[0].decisao.autor == "servidor.antigo"


def test_decisao_gravada_com_chave_nova_tem_prioridade_sobre_a_legada():
    """Se por algum motivo existirem entradas para as duas chaves (nova e
    legada) do mesmo grupo, a busca pela chave NOVA sempre vence — nunca
    usa a legada quando a nova já responde."""
    revisao = _revisao()
    obs = [oc.ordem_bancaria.ob for oc in revisao.ocorrencias]
    decisao_nova = registrar_decisao(
        revisao, acao=AcaoDecisao.PUBLICAR, autor="servidor.novo", obs_publicaveis=obs
    )
    decisao_legada = DecisaoHumana(
        identidade_grupo=_identidade_grupo_legado(revisao.regra, obs),
        regra=revisao.regra,
        obs_envolvidas=frozenset(obs),
        fingerprint_evidencias=calcular_fingerprint(revisao.ocorrencias),
        acao=AcaoDecisao.ADIAR,
        autor="servidor.antigo",
        decidido_em=datetime(2026, 1, 10, 9, 0, 0, tzinfo=timezone.utc),
    )
    resultado = _resultado(revisoes=[revisao])

    revisado = aplicar_decisoes(
        resultado,
        {decisao_nova.identidade_grupo: decisao_nova, decisao_legada.identidade_grupo: decisao_legada},
    )

    assert revisado.revisoes[0].estado is EstadoRevisao.DECIDIDA
    assert revisado.revisoes[0].decisao.autor == "servidor.novo"


def test_contexto_para_exibicao_separa_campos_iguais_e_diferentes():
    revisao = _revisao(
        ocorrencias=[
            _oc(ob="2026OB000001", valor=154.09, trecho="RECIFE-GARANHUNS"),
            _oc(ob="2026OB000002", valor=154.09, trecho="RECIFE-ARCOVERDE"),
        ]
    )

    contexto = contexto_para_exibicao(revisao)

    assert "valor" in contexto.campos_iguais
    assert "trecho" in contexto.campos_diferentes
    assert "ob" in contexto.campos_diferentes
    assert contexto.explicacao == revisao.motivo
    assert contexto.identidade_grupo == identidade_grupo("RN07", ["2026OB000001", "2026OB000002"])
