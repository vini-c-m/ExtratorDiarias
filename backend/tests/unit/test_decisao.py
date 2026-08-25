from datetime import date, datetime

from app.domain.entities.ordem_bancaria import OrdemBancaria
from app.domain.entities.registro_controle import ClassificacaoSei, RegistroControle
from app.domain.relatorio_transparencia.decisao import (
    AcaoDecisao,
    EstadoRevisao,
    aplicar_decisoes,
    calcular_fingerprint,
    contexto_para_exibicao,
    identidade_grupo,
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
        credor="FULANO DE TAL",
        situacao=situacao,
        data_pagamento=data_pagamento,
        sei="19.20.0001.0000001/2026-01",
        cpf=cpf,
        nome="FULANO DE TAL",
        cargo="Cargo de Teste",
        periodo_inicial=periodo_inicial,
        periodo_final=periodo_final,
        cidade_origem=None,
        cidade_destino=None,
        transporte="CARRO",
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
