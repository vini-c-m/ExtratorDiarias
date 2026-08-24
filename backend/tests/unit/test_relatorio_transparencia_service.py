from datetime import date

import pytest
from openpyxl import Workbook

from app.domain.relatorio_transparencia.decisao import AcaoDecisao
from app.services import relatorio_transparencia_service as service

_CABECALHO_BASE_OB = [
    "DH",
    "OB",
    "SITUAÇÃO",
    "DATA OB",
    "SEI",
    "CPF",
    "NOME",
    "CARGO",
    "PERÍODO INICIAL",
    "PERÍODO FINAL",
    "TRECHO",
    "TRANSPORTE",
    "MOTIVO",
    "VALOR DA DIÁRIA",
    "RESTITUIÇÃO",
    "DUPLICIDADE",
    "ITEM DE GASTO",
]


def _linha_ob(
    *,
    dh,
    ob,
    cpf=11111111111,
    periodo_inicial=date(2026, 5, 10),
    periodo_final=date(2026, 5, 10),
    trecho="RECIFE - GARANHUNS",
    valor=154.09,
    data_ob="15/05/2026 09:00:00",
    situacao="Paga",
    restituicao=None,
    duplicidade="Único",
    motivo="Motivo de teste",
):
    return [
        dh,
        ob,
        situacao,
        data_ob,
        "19.20.0001.0000001/2026-01",
        cpf,
        "FULANO DE TAL",
        "Cargo de Teste",
        periodo_inicial,
        periodo_final,
        trecho,
        "CARRO",
        motivo,
        valor,
        restituicao,
        duplicidade,
        "33901401",
    ]


def _criar_base_ob(caminho, linhas):
    wb = Workbook()
    ws = wb.active
    ws.title = "Sheet1"
    ws.append(_CABECALHO_BASE_OB)
    for linha in linhas:
        ws.append(linha)
    wb.save(caminho)


def _criar_controle_vazio(caminho):
    wb = Workbook()
    ws = wb.active
    ws.title = "Controle de Diárias"
    wb.save(caminho)


def _preparar(tmp_path, linhas_ob, *, mes_referencia=5, caminho_decisoes=None):
    caminho_base_ob = tmp_path / "base_ob.xlsx"
    caminho_controle = tmp_path / "controle.xlsx"
    _criar_base_ob(caminho_base_ob, linhas_ob)
    _criar_controle_vazio(caminho_controle)
    caminho_decisoes = caminho_decisoes or (tmp_path / "decisoes.json")
    return service.preparar_relatorio(
        caminho_base_ordens_bancarias=str(caminho_base_ob),
        caminho_controle_dimcac=str(caminho_controle),
        ano_exercicio=2026,
        mes_referencia=mes_referencia,
        caminho_decisoes=str(caminho_decisoes),
    ), str(caminho_base_ob), str(caminho_controle), str(caminho_decisoes)


# --- 1. Preparar relatório sem revisão ------------------------------------


def test_preparar_relatorio_sem_revisao(tmp_path):
    resumo, *_ = _preparar(tmp_path, [_linha_ob(dh="2026DH000001", ob="2026OB000001")])

    assert resumo.total_candidatos_normais == 1
    assert resumo.total_revisoes == 0
    assert resumo.pode_gerar_relatorio is True


# --- 2-3. Preparar com revisão / resumo correto ---------------------------


def test_preparar_relatorio_com_revisao_e_resumo_correto(tmp_path):
    linhas = [
        _linha_ob(dh="2026DH000001", ob="2026OB000001"),  # normal
        _linha_ob(
            dh="2026DH000002", ob="2026OB000002", cpf=22222222222,
            periodo_inicial=date(2026, 5, 11), periodo_final=date(2026, 5, 11),
            trecho="RECIFE - ARCOVERDE", valor=308.19, data_ob="16/05/2026 09:00:00",
        ),
        _linha_ob(
            dh="2026DH000003", ob="2026OB000003", cpf=22222222222,
            periodo_inicial=date(2026, 5, 11), periodo_final=date(2026, 5, 11),
            trecho="RECIFE - ARCOVERDE", valor=308.19, data_ob="17/05/2026 09:00:00",
        ),
    ]
    resumo, *_ = _preparar(tmp_path, linhas)

    assert resumo.total_candidatos_normais == 1
    assert resumo.total_revisoes == 1
    assert resumo.total_pendentes == 1
    assert resumo.pode_gerar_relatorio is False
    revisao = resumo.revisoes[0]
    assert revisao.regra == "RN07"
    assert {oc.ob for oc in revisao.ocorrencias} == {"2026OB000002", "2026OB000003"}


# --- 4. pode_gerar_relatorio=False com pendência --------------------------


def test_pode_gerar_relatorio_false_com_pendencia(tmp_path):
    linhas = [
        _linha_ob(dh="2026DH000002", ob="2026OB000002", cpf=22222222222, valor=308.19),
        _linha_ob(dh="2026DH000003", ob="2026OB000003", cpf=22222222222, valor=308.19),
    ]
    resumo, *_ = _preparar(tmp_path, linhas)
    assert resumo.pode_gerar_relatorio is False


# --- 5. Listar revisões -----------------------------------------------------


def test_listar_revisoes(tmp_path):
    caminho_base_ob = tmp_path / "base_ob.xlsx"
    caminho_controle = tmp_path / "controle.xlsx"
    _criar_base_ob(
        caminho_base_ob,
        [
            _linha_ob(dh="2026DH000002", ob="2026OB000002", cpf=22222222222, valor=308.19),
            _linha_ob(dh="2026DH000003", ob="2026OB000003", cpf=22222222222, valor=308.19),
        ],
    )
    _criar_controle_vazio(caminho_controle)
    caminho_decisoes = tmp_path / "decisoes.json"

    lista = service.listar_revisoes(
        caminho_base_ordens_bancarias=str(caminho_base_ob),
        caminho_controle_dimcac=str(caminho_controle),
        ano_exercicio=2026,
        mes_referencia=5,
        caminho_decisoes=str(caminho_decisoes),
    )

    assert len(lista) == 1
    assert lista[0].regra == "RN07"


# --- 6. Contrato da revisão contém campos obrigatórios --------------------


def test_contrato_da_revisao_contem_campos_obrigatorios(tmp_path):
    linhas = [
        _linha_ob(dh="2026DH000002", ob="2026OB000002", cpf=22222222222, valor=308.19),
        _linha_ob(dh="2026DH000003", ob="2026OB000003", cpf=22222222222, valor=308.19),
    ]
    resumo, *_ = _preparar(tmp_path, linhas)
    revisao = resumo.revisoes[0]

    assert revisao.identidade_grupo
    assert revisao.regra
    assert revisao.estado
    assert revisao.explicacao
    assert isinstance(revisao.campos_iguais, list)
    assert isinstance(revisao.campos_diferentes, list)
    ocorrencia = revisao.ocorrencias[0]
    for campo in ("ob", "dh", "beneficiario", "sei", "data_ob", "periodo_inicial", "periodo_final", "trecho", "valor", "motivo", "restituicao"):
        assert hasattr(ocorrencia, campo)


# --- 7. Fingerprint não é exposto -------------------------------------------


def test_fingerprint_nao_e_exposto(tmp_path):
    linhas = [
        _linha_ob(dh="2026DH000002", ob="2026OB000002", cpf=22222222222, valor=308.19),
        _linha_ob(dh="2026DH000003", ob="2026OB000003", cpf=22222222222, valor=308.19),
    ]
    resumo, *_ = _preparar(tmp_path, linhas)
    revisao = resumo.revisoes[0]

    assert not hasattr(revisao, "fingerprint")
    assert not hasattr(revisao, "fingerprint_evidencias")
    assert "fingerprint" not in repr(revisao).lower()


# --- 8-9. PUBLICAR TODAS / subconjunto --------------------------------------


def test_publicar_todas(tmp_path):
    linhas = [
        _linha_ob(dh="2026DH000002", ob="2026OB000002", cpf=22222222222, valor=308.19),
        _linha_ob(dh="2026DH000003", ob="2026OB000003", cpf=22222222222, valor=308.19),
    ]
    resumo, caminho_ob, caminho_controle, caminho_decisoes = _preparar(tmp_path, linhas)
    identidade = resumo.revisoes[0].identidade_grupo

    atualizado = service.registrar_decisao_revisao(
        caminho_base_ordens_bancarias=caminho_ob,
        caminho_controle_dimcac=caminho_controle,
        ano_exercicio=2026,
        mes_referencia=5,
        caminho_decisoes=caminho_decisoes,
        identidade_grupo=identidade,
        acao=AcaoDecisao.PUBLICAR,
        obs_selecionadas=["2026OB000002", "2026OB000003"],
        autor="servidor.teste",
    )

    assert atualizado.total_candidatos_normais == 2
    assert atualizado.pode_gerar_relatorio is True


def test_publicar_subconjunto(tmp_path):
    linhas = [
        _linha_ob(dh="2026DH000002", ob="2026OB000002", cpf=22222222222, valor=308.19),
        _linha_ob(dh="2026DH000003", ob="2026OB000003", cpf=22222222222, valor=308.19),
    ]
    resumo, caminho_ob, caminho_controle, caminho_decisoes = _preparar(tmp_path, linhas)
    identidade = resumo.revisoes[0].identidade_grupo

    atualizado = service.registrar_decisao_revisao(
        caminho_base_ordens_bancarias=caminho_ob,
        caminho_controle_dimcac=caminho_controle,
        ano_exercicio=2026,
        mes_referencia=5,
        caminho_decisoes=caminho_decisoes,
        identidade_grupo=identidade,
        acao=AcaoDecisao.PUBLICAR,
        obs_selecionadas=["2026OB000002"],
        autor="servidor.teste",
    )

    assert atualizado.total_candidatos_normais == 1
    assert atualizado.total_ocorrencias_nao_publicaveis == 1
    assert atualizado.pode_gerar_relatorio is True


# --- 10. ADIAR ---------------------------------------------------------------


def test_adiar(tmp_path):
    linhas = [
        _linha_ob(dh="2026DH000002", ob="2026OB000002", cpf=22222222222, valor=308.19),
        _linha_ob(dh="2026DH000003", ob="2026OB000003", cpf=22222222222, valor=308.19),
    ]
    resumo, caminho_ob, caminho_controle, caminho_decisoes = _preparar(tmp_path, linhas)
    identidade = resumo.revisoes[0].identidade_grupo

    atualizado = service.registrar_decisao_revisao(
        caminho_base_ordens_bancarias=caminho_ob,
        caminho_controle_dimcac=caminho_controle,
        ano_exercicio=2026,
        mes_referencia=5,
        caminho_decisoes=caminho_decisoes,
        identidade_grupo=identidade,
        acao=AcaoDecisao.ADIAR,
        autor="servidor.teste",
    )

    assert atualizado.revisoes[0].estado == "adiada"
    assert atualizado.pode_gerar_relatorio is False


# --- 11-12. Decisão atualiza estado / todas decididas -----------------------


def test_decisao_atualiza_estado_e_todas_decididas_libera(tmp_path):
    linhas = [
        _linha_ob(dh="2026DH000002", ob="2026OB000002", cpf=22222222222, valor=308.19),
        _linha_ob(dh="2026DH000003", ob="2026OB000003", cpf=22222222222, valor=308.19),
    ]
    resumo, caminho_ob, caminho_controle, caminho_decisoes = _preparar(tmp_path, linhas)
    identidade = resumo.revisoes[0].identidade_grupo

    atualizado = service.registrar_decisao_revisao(
        caminho_base_ordens_bancarias=caminho_ob,
        caminho_controle_dimcac=caminho_controle,
        ano_exercicio=2026,
        mes_referencia=5,
        caminho_decisoes=caminho_decisoes,
        identidade_grupo=identidade,
        acao=AcaoDecisao.PUBLICAR,
        obs_selecionadas=["2026OB000002", "2026OB000003"],
        autor="servidor.teste",
    )

    assert atualizado.revisoes[0].estado == "decidida"
    assert atualizado.pode_gerar_relatorio is True


# --- 13. Decisão reaproveitada em nova preparação ---------------------------


def test_decisao_reaproveitada_em_nova_preparacao(tmp_path):
    linhas = [
        _linha_ob(dh="2026DH000002", ob="2026OB000002", cpf=22222222222, valor=308.19),
        _linha_ob(dh="2026DH000003", ob="2026OB000003", cpf=22222222222, valor=308.19),
    ]
    resumo, caminho_ob, caminho_controle, caminho_decisoes = _preparar(tmp_path, linhas)
    identidade = resumo.revisoes[0].identidade_grupo
    service.registrar_decisao_revisao(
        caminho_base_ordens_bancarias=caminho_ob,
        caminho_controle_dimcac=caminho_controle,
        ano_exercicio=2026,
        mes_referencia=5,
        caminho_decisoes=caminho_decisoes,
        identidade_grupo=identidade,
        acao=AcaoDecisao.PUBLICAR,
        obs_selecionadas=["2026OB000002", "2026OB000003"],
        autor="servidor.teste",
    )

    # "mês seguinte": mesma fonte, mesma decisão persistida
    resumo_de_novo = service.preparar_relatorio(
        caminho_base_ordens_bancarias=caminho_ob,
        caminho_controle_dimcac=caminho_controle,
        ano_exercicio=2026,
        mes_referencia=8,
        caminho_decisoes=caminho_decisoes,
    )

    assert resumo_de_novo.revisoes[0].estado == "decidida"
    assert resumo_de_novo.pode_gerar_relatorio is True


# --- 14. Evidência alterada -> DESATUALIZADA --------------------------------


def test_evidencia_alterada_vira_desatualizada(tmp_path):
    linhas = [
        _linha_ob(dh="2026DH000002", ob="2026OB000002", cpf=22222222222, valor=308.19),
        _linha_ob(dh="2026DH000003", ob="2026OB000003", cpf=22222222222, valor=308.19),
    ]
    resumo, caminho_ob, caminho_controle, caminho_decisoes = _preparar(tmp_path, linhas)
    identidade = resumo.revisoes[0].identidade_grupo
    service.registrar_decisao_revisao(
        caminho_base_ordens_bancarias=caminho_ob,
        caminho_controle_dimcac=caminho_controle,
        ano_exercicio=2026,
        mes_referencia=5,
        caminho_decisoes=caminho_decisoes,
        identidade_grupo=identidade,
        acao=AcaoDecisao.PUBLICAR,
        obs_selecionadas=["2026OB000002", "2026OB000003"],
        autor="servidor.teste",
    )

    # fonte muda materialmente: valor de uma das OBs é alterado
    linhas_alteradas = [
        _linha_ob(dh="2026DH000002", ob="2026OB000002", cpf=22222222222, valor=999.99),
        _linha_ob(dh="2026DH000003", ob="2026OB000003", cpf=22222222222, valor=308.19),
    ]
    _criar_base_ob(caminho_ob, linhas_alteradas)

    resumo_depois = service.preparar_relatorio(
        caminho_base_ordens_bancarias=caminho_ob,
        caminho_controle_dimcac=caminho_controle,
        ano_exercicio=2026,
        mes_referencia=5,
        caminho_decisoes=caminho_decisoes,
    )

    # o grupo em si deixou de existir (valor não bate mais para RN07) —
    # portanto zero revisões RN07 agora, e nenhuma decisão foi aplicada
    # silenciosamente a um grupo diferente.
    assert resumo_depois.pode_gerar_relatorio is True
    assert resumo_depois.total_revisoes == 0


def test_evidencia_alterada_em_campo_nao_estrutural_vira_desatualizada(tmp_path):
    """Mudar o MOTIVO (não afeta a chave RN07) preserva o grupo, mas muda
    o fingerprint — decisão antiga deve virar desatualizada, não ser
    reaplicada cegamente."""
    linhas = [
        _linha_ob(dh="2026DH000002", ob="2026OB000002", cpf=22222222222, valor=308.19, motivo="Motivo A"),
        _linha_ob(dh="2026DH000003", ob="2026OB000003", cpf=22222222222, valor=308.19, motivo="Motivo A"),
    ]
    resumo, caminho_ob, caminho_controle, caminho_decisoes = _preparar(tmp_path, linhas)
    identidade = resumo.revisoes[0].identidade_grupo
    service.registrar_decisao_revisao(
        caminho_base_ordens_bancarias=caminho_ob,
        caminho_controle_dimcac=caminho_controle,
        ano_exercicio=2026,
        mes_referencia=5,
        caminho_decisoes=caminho_decisoes,
        identidade_grupo=identidade,
        acao=AcaoDecisao.PUBLICAR,
        obs_selecionadas=["2026OB000002", "2026OB000003"],
        autor="servidor.teste",
    )

    linhas_com_motivo_diferente = [
        _linha_ob(dh="2026DH000002", ob="2026OB000002", cpf=22222222222, valor=308.19, motivo="Motivo B, revisado"),
        _linha_ob(dh="2026DH000003", ob="2026OB000003", cpf=22222222222, valor=308.19, motivo="Motivo A"),
    ]
    _criar_base_ob(caminho_ob, linhas_com_motivo_diferente)

    resumo_depois = service.preparar_relatorio(
        caminho_base_ordens_bancarias=caminho_ob,
        caminho_controle_dimcac=caminho_controle,
        ano_exercicio=2026,
        mes_referencia=5,
        caminho_decisoes=caminho_decisoes,
    )

    assert resumo_depois.total_revisoes == 1
    assert resumo_depois.revisoes[0].estado == "desatualizada"
    assert resumo_depois.pode_gerar_relatorio is False


# --- 15. Grupo inexistente ---------------------------------------------------


def test_grupo_inexistente_levanta_erro(tmp_path):
    resumo, caminho_ob, caminho_controle, caminho_decisoes = _preparar(
        tmp_path, [_linha_ob(dh="2026DH000001", ob="2026OB000001")]
    )

    with pytest.raises(service.RevisaoNaoEncontrada):
        service.registrar_decisao_revisao(
            caminho_base_ordens_bancarias=caminho_ob,
            caminho_controle_dimcac=caminho_controle,
            ano_exercicio=2026,
            mes_referencia=5,
            caminho_decisoes=caminho_decisoes,
            identidade_grupo="grupo-que-nao-existe",
            acao=AcaoDecisao.PUBLICAR,
            obs_selecionadas=["2026OB000001"],
            autor="servidor.teste",
        )


# --- 16. OB fora do grupo ----------------------------------------------------


def test_ob_fora_do_grupo_levanta_erro(tmp_path):
    linhas = [
        _linha_ob(dh="2026DH000001", ob="2026OB000001"),
        _linha_ob(dh="2026DH000002", ob="2026OB000002", cpf=22222222222, valor=308.19),
        _linha_ob(dh="2026DH000003", ob="2026OB000003", cpf=22222222222, valor=308.19),
    ]
    resumo, caminho_ob, caminho_controle, caminho_decisoes = _preparar(tmp_path, linhas)
    identidade = resumo.revisoes[0].identidade_grupo

    with pytest.raises(service.DecisaoInvalida):
        service.registrar_decisao_revisao(
            caminho_base_ordens_bancarias=caminho_ob,
            caminho_controle_dimcac=caminho_controle,
            ano_exercicio=2026,
            mes_referencia=5,
            caminho_decisoes=caminho_decisoes,
            identidade_grupo=identidade,
            acao=AcaoDecisao.PUBLICAR,
            obs_selecionadas=["2026OB000001"],  # não pertence a este grupo
            autor="servidor.teste",
        )


# --- 17. Ação inválida (adiar + OBs selecionadas = payload ambíguo) --------


def test_adiar_com_obs_selecionadas_e_payload_ambiguo(tmp_path):
    linhas = [
        _linha_ob(dh="2026DH000002", ob="2026OB000002", cpf=22222222222, valor=308.19),
        _linha_ob(dh="2026DH000003", ob="2026OB000003", cpf=22222222222, valor=308.19),
    ]
    resumo, caminho_ob, caminho_controle, caminho_decisoes = _preparar(tmp_path, linhas)
    identidade = resumo.revisoes[0].identidade_grupo

    with pytest.raises(service.DecisaoInvalida):
        service.registrar_decisao_revisao(
            caminho_base_ordens_bancarias=caminho_ob,
            caminho_controle_dimcac=caminho_controle,
            ano_exercicio=2026,
            mes_referencia=5,
            caminho_decisoes=caminho_decisoes,
            identidade_grupo=identidade,
            acao=AcaoDecisao.ADIAR,
            obs_selecionadas=["2026OB000002"],
            autor="servidor.teste",
        )


# --- 17b. Micro-sprint 3E.2 — PUBLICAR com zero OBs exige justificativa ----
# Garantia REAL: chamada direta a `registrar_decisao_revisao` (sem passar
# pelo schema Pydantic da API) não consegue contornar a regra — é o único
# ponto de entrada desta operação.


def _preparar_com_uma_revisao(tmp_path):
    linhas = [
        _linha_ob(dh="2026DH000002", ob="2026OB000002", cpf=22222222222, valor=308.19),
        _linha_ob(dh="2026DH000003", ob="2026OB000003", cpf=22222222222, valor=308.19),
    ]
    resumo, caminho_ob, caminho_controle, caminho_decisoes = _preparar(tmp_path, linhas)
    return resumo.revisoes[0].identidade_grupo, caminho_ob, caminho_controle, caminho_decisoes


def test_publicar_zero_obs_sem_observacao_levanta_erro(tmp_path):
    identidade, caminho_ob, caminho_controle, caminho_decisoes = _preparar_com_uma_revisao(tmp_path)

    with pytest.raises(service.DecisaoInvalida):
        service.registrar_decisao_revisao(
            caminho_base_ordens_bancarias=caminho_ob,
            caminho_controle_dimcac=caminho_controle,
            ano_exercicio=2026,
            mes_referencia=5,
            caminho_decisoes=caminho_decisoes,
            identidade_grupo=identidade,
            acao=AcaoDecisao.PUBLICAR,
            obs_selecionadas=[],
            autor="servidor.teste",
            observacao=None,
        )


def test_publicar_zero_obs_com_observacao_vazia_levanta_erro(tmp_path):
    identidade, caminho_ob, caminho_controle, caminho_decisoes = _preparar_com_uma_revisao(tmp_path)

    with pytest.raises(service.DecisaoInvalida):
        service.registrar_decisao_revisao(
            caminho_base_ordens_bancarias=caminho_ob,
            caminho_controle_dimcac=caminho_controle,
            ano_exercicio=2026,
            mes_referencia=5,
            caminho_decisoes=caminho_decisoes,
            identidade_grupo=identidade,
            acao=AcaoDecisao.PUBLICAR,
            obs_selecionadas=[],
            autor="servidor.teste",
            observacao="",
        )


def test_publicar_zero_obs_com_observacao_so_espacos_levanta_erro(tmp_path):
    identidade, caminho_ob, caminho_controle, caminho_decisoes = _preparar_com_uma_revisao(tmp_path)

    with pytest.raises(service.DecisaoInvalida):
        service.registrar_decisao_revisao(
            caminho_base_ordens_bancarias=caminho_ob,
            caminho_controle_dimcac=caminho_controle,
            ano_exercicio=2026,
            mes_referencia=5,
            caminho_decisoes=caminho_decisoes,
            identidade_grupo=identidade,
            acao=AcaoDecisao.PUBLICAR,
            obs_selecionadas=[],
            autor="servidor.teste",
            observacao="   \n\t  ",
        )


def test_publicar_zero_obs_com_justificativa_valida_e_aceito(tmp_path):
    identidade, caminho_ob, caminho_controle, caminho_decisoes = _preparar_com_uma_revisao(tmp_path)

    atualizado = service.registrar_decisao_revisao(
        caminho_base_ordens_bancarias=caminho_ob,
        caminho_controle_dimcac=caminho_controle,
        ano_exercicio=2026,
        mes_referencia=5,
        caminho_decisoes=caminho_decisoes,
        identidade_grupo=identidade,
        acao=AcaoDecisao.PUBLICAR,
        obs_selecionadas=[],
        autor="servidor.teste",
        observacao="Ambas as OBs são suspeitas de duplicidade; excluídas até apuração interna.",
    )

    assert atualizado.revisoes[0].estado == "decidida"
    assert atualizado.total_ocorrencias_nao_publicaveis == 2
    assert atualizado.pode_gerar_relatorio is True


def test_publicar_uma_ob_sem_observacao_e_aceito(tmp_path):
    identidade, caminho_ob, caminho_controle, caminho_decisoes = _preparar_com_uma_revisao(tmp_path)

    atualizado = service.registrar_decisao_revisao(
        caminho_base_ordens_bancarias=caminho_ob,
        caminho_controle_dimcac=caminho_controle,
        ano_exercicio=2026,
        mes_referencia=5,
        caminho_decisoes=caminho_decisoes,
        identidade_grupo=identidade,
        acao=AcaoDecisao.PUBLICAR,
        obs_selecionadas=["2026OB000002"],
        autor="servidor.teste",
    )

    assert atualizado.revisoes[0].estado == "decidida"


def test_publicar_subconjunto_sem_observacao_e_aceito(tmp_path):
    linhas = [
        _linha_ob(dh="2026DH000002", ob="2026OB000002", cpf=22222222222, valor=308.19),
        _linha_ob(dh="2026DH000003", ob="2026OB000003", cpf=22222222222, valor=308.19),
        _linha_ob(dh="2026DH000004", ob="2026OB000004", cpf=22222222222, valor=308.19),
    ]
    resumo, caminho_ob, caminho_controle, caminho_decisoes = _preparar(tmp_path, linhas)
    identidade = resumo.revisoes[0].identidade_grupo

    atualizado = service.registrar_decisao_revisao(
        caminho_base_ordens_bancarias=caminho_ob,
        caminho_controle_dimcac=caminho_controle,
        ano_exercicio=2026,
        mes_referencia=5,
        caminho_decisoes=caminho_decisoes,
        identidade_grupo=identidade,
        acao=AcaoDecisao.PUBLICAR,
        obs_selecionadas=["2026OB000002", "2026OB000003"],
        autor="servidor.teste",
    )

    assert atualizado.revisoes[0].estado == "decidida"
    assert atualizado.total_ocorrencias_nao_publicaveis == 1


def test_publicar_todas_sem_observacao_e_aceito(tmp_path):
    identidade, caminho_ob, caminho_controle, caminho_decisoes = _preparar_com_uma_revisao(tmp_path)

    atualizado = service.registrar_decisao_revisao(
        caminho_base_ordens_bancarias=caminho_ob,
        caminho_controle_dimcac=caminho_controle,
        ano_exercicio=2026,
        mes_referencia=5,
        caminho_decisoes=caminho_decisoes,
        identidade_grupo=identidade,
        acao=AcaoDecisao.PUBLICAR,
        obs_selecionadas=["2026OB000002", "2026OB000003"],
        autor="servidor.teste",
    )

    assert atualizado.revisoes[0].estado == "decidida"
    assert atualizado.total_ocorrencias_nao_publicaveis == 0


def test_adiar_sem_observacao_continua_aceito_nao_vira_obrigatorio(tmp_path):
    identidade, caminho_ob, caminho_controle, caminho_decisoes = _preparar_com_uma_revisao(tmp_path)

    atualizado = service.registrar_decisao_revisao(
        caminho_base_ordens_bancarias=caminho_ob,
        caminho_controle_dimcac=caminho_controle,
        ano_exercicio=2026,
        mes_referencia=5,
        caminho_decisoes=caminho_decisoes,
        identidade_grupo=identidade,
        acao=AcaoDecisao.ADIAR,
        obs_selecionadas=[],
        autor="servidor.teste",
        observacao=None,
    )

    assert atualizado.revisoes[0].estado == "adiada"


# --- 18. Persistência inexistente (primeira preparação) --------------------


def test_persistencia_inexistente_funciona_normalmente(tmp_path):
    resumo, _, _, caminho_decisoes = _preparar(tmp_path, [_linha_ob(dh="2026DH000001", ob="2026OB000001")])
    assert resumo.pode_gerar_relatorio is True
    import os

    assert not os.path.exists(caminho_decisoes)  # preparar nunca cria o arquivo


# --- 19. Persistência corrompida --------------------------------------------


def test_persistencia_corrompida_levanta_erro(tmp_path):
    caminho_decisoes = tmp_path / "decisoes.json"
    caminho_decisoes.write_text("{isso nao e json valido", encoding="utf-8")

    with pytest.raises(service.PersistenciaDecisoesCorrompida):
        _preparar(tmp_path, [_linha_ob(dh="2026DH000001", ob="2026OB000001")], caminho_decisoes=caminho_decisoes)


# --- 20-21. Base OB / Controle inexistentes ---------------------------------


def test_base_ob_inexistente_levanta_erro(tmp_path):
    caminho_controle = tmp_path / "controle.xlsx"
    _criar_controle_vazio(caminho_controle)

    with pytest.raises(service.BaseOBNaoEncontrada):
        service.preparar_relatorio(
            caminho_base_ordens_bancarias=str(tmp_path / "nao_existe.xlsx"),
            caminho_controle_dimcac=str(caminho_controle),
            ano_exercicio=2026,
            mes_referencia=5,
            caminho_decisoes=str(tmp_path / "decisoes.json"),
        )


def test_controle_inexistente_levanta_erro(tmp_path):
    caminho_base_ob = tmp_path / "base_ob.xlsx"
    _criar_base_ob(caminho_base_ob, [_linha_ob(dh="2026DH000001", ob="2026OB000001")])

    with pytest.raises(service.ControleDimcacNaoEncontrado):
        service.preparar_relatorio(
            caminho_base_ordens_bancarias=str(caminho_base_ob),
            caminho_controle_dimcac=str(tmp_path / "nao_existe.xlsx"),
            ano_exercicio=2026,
            mes_referencia=5,
            caminho_decisoes=str(tmp_path / "decisoes.json"),
        )


# --- 22-23. Estrutura inválida -----------------------------------------------


def test_estrutura_base_ob_invalida_levanta_erro(tmp_path):
    caminho_base_ob = tmp_path / "base_ob.xlsx"
    wb = Workbook()
    ws = wb.active
    ws.title = "Sheet1"
    ws.append(["DH", "OB"])  # faltam colunas obrigatórias
    wb.save(caminho_base_ob)
    caminho_controle = tmp_path / "controle.xlsx"
    _criar_controle_vazio(caminho_controle)

    with pytest.raises(service.EstruturaBaseOBInvalida):
        service.preparar_relatorio(
            caminho_base_ordens_bancarias=str(caminho_base_ob),
            caminho_controle_dimcac=str(caminho_controle),
            ano_exercicio=2026,
            mes_referencia=5,
            caminho_decisoes=str(tmp_path / "decisoes.json"),
        )


def test_estrutura_controle_invalida_levanta_erro(tmp_path):
    caminho_base_ob = tmp_path / "base_ob.xlsx"
    _criar_base_ob(caminho_base_ob, [_linha_ob(dh="2026DH000001", ob="2026OB000001")])
    caminho_controle = tmp_path / "controle.xlsx"
    wb = Workbook()
    ws = wb.active
    ws.title = "Aba Errada"
    wb.save(caminho_controle)

    with pytest.raises(service.EstruturaControleInvalida):
        service.preparar_relatorio(
            caminho_base_ordens_bancarias=str(caminho_base_ob),
            caminho_controle_dimcac=str(caminho_controle),
            ano_exercicio=2026,
            mes_referencia=5,
            caminho_decisoes=str(tmp_path / "decisoes.json"),
        )


# --- 24. Nenhum candidato normal alterado por decisão de outro grupo -------


def test_decisao_de_um_grupo_nao_afeta_candidatos_normais_de_outro(tmp_path):
    linhas = [
        _linha_ob(dh="2026DH000001", ob="2026OB000001"),  # normal, alheio à revisão
        _linha_ob(dh="2026DH000002", ob="2026OB000002", cpf=22222222222, valor=308.19),
        _linha_ob(dh="2026DH000003", ob="2026OB000003", cpf=22222222222, valor=308.19),
    ]
    resumo, caminho_ob, caminho_controle, caminho_decisoes = _preparar(tmp_path, linhas)
    identidade = resumo.revisoes[0].identidade_grupo

    atualizado = service.registrar_decisao_revisao(
        caminho_base_ordens_bancarias=caminho_ob,
        caminho_controle_dimcac=caminho_controle,
        ano_exercicio=2026,
        mes_referencia=5,
        caminho_decisoes=caminho_decisoes,
        identidade_grupo=identidade,
        acao=AcaoDecisao.PUBLICAR,
        obs_selecionadas=["2026OB000002"],
        autor="servidor.teste",
    )

    assert atualizado.total_candidatos_normais == 2  # o original + o publicado da revisão


# --- 25. Nenhuma OB desaparece sem rastreabilidade --------------------------


def test_nenhuma_ob_desaparece_sem_rastreabilidade(tmp_path):
    linhas = [
        _linha_ob(dh="2026DH000001", ob="2026OB000001"),
        _linha_ob(dh="2026DH000002", ob="2026OB000002", cpf=22222222222, valor=308.19),
        _linha_ob(dh="2026DH000003", ob="2026OB000003", cpf=22222222222, valor=308.19),
    ]
    resumo, *_ = _preparar(tmp_path, linhas)

    total_em_revisoes = sum(len(r.ocorrencias) for r in resumo.revisoes)
    assert resumo.total_candidatos_normais + total_em_revisoes == 3


# --- 26. Recriar/reiniciar "service" (funções puras, sem estado) -----------


def test_service_e_stateless_preparar_de_novo_funciona_igual(tmp_path):
    linhas = [_linha_ob(dh="2026DH000001", ob="2026OB000001")]
    resumo_1, caminho_ob, caminho_controle, caminho_decisoes = _preparar(tmp_path, linhas)
    resumo_2 = service.preparar_relatorio(
        caminho_base_ordens_bancarias=caminho_ob,
        caminho_controle_dimcac=caminho_controle,
        ano_exercicio=2026,
        mes_referencia=5,
        caminho_decisoes=caminho_decisoes,
    )
    assert resumo_1 == resumo_2


# --- 27. Nenhum estado derivado é persistido --------------------------------


def test_preparar_nunca_persiste_estado_derivado(tmp_path):
    linhas = [
        _linha_ob(dh="2026DH000002", ob="2026OB000002", cpf=22222222222, valor=308.19),
        _linha_ob(dh="2026DH000003", ob="2026OB000003", cpf=22222222222, valor=308.19),
    ]
    resumo, caminho_ob, caminho_controle, caminho_decisoes = _preparar(tmp_path, linhas)
    import os

    assert not os.path.exists(caminho_decisoes)

    identidade = resumo.revisoes[0].identidade_grupo
    service.registrar_decisao_revisao(
        caminho_base_ordens_bancarias=caminho_ob,
        caminho_controle_dimcac=caminho_controle,
        ano_exercicio=2026,
        mes_referencia=5,
        caminho_decisoes=caminho_decisoes,
        identidade_grupo=identidade,
        acao=AcaoDecisao.PUBLICAR,
        obs_selecionadas=["2026OB000002", "2026OB000003"],
        autor="servidor.teste",
    )
    # depois de registrar, o arquivo contém só a DECISÃO — nunca candidatos/
    # ocorrências/reconciliação inteira.
    conteudo = (tmp_path / "decisoes.json").read_text(encoding="utf-8")
    assert "candidatos" not in conteudo
    assert "ocorrencias_nao_publicaveis" not in conteudo


# --- 29-30. ADIAR e DESATUALIZADA continuam bloqueando ----------------------


def test_adiar_continua_bloqueando_apos_nova_preparacao(tmp_path):
    linhas = [
        _linha_ob(dh="2026DH000002", ob="2026OB000002", cpf=22222222222, valor=308.19),
        _linha_ob(dh="2026DH000003", ob="2026OB000003", cpf=22222222222, valor=308.19),
    ]
    resumo, caminho_ob, caminho_controle, caminho_decisoes = _preparar(tmp_path, linhas)
    identidade = resumo.revisoes[0].identidade_grupo
    service.registrar_decisao_revisao(
        caminho_base_ordens_bancarias=caminho_ob,
        caminho_controle_dimcac=caminho_controle,
        ano_exercicio=2026,
        mes_referencia=5,
        caminho_decisoes=caminho_decisoes,
        identidade_grupo=identidade,
        acao=AcaoDecisao.ADIAR,
        autor="servidor.teste",
    )

    resumo_2 = service.preparar_relatorio(
        caminho_base_ordens_bancarias=caminho_ob,
        caminho_controle_dimcac=caminho_controle,
        ano_exercicio=2026,
        mes_referencia=8,
        caminho_decisoes=caminho_decisoes,
    )
    assert resumo_2.revisoes[0].estado == "adiada"
    assert resumo_2.pode_gerar_relatorio is False


# --- Minimização de dados (3D.1): autor nunca aparece no log ---------------


def test_registrar_decisao_nao_loga_autor(tmp_path, caplog):
    linhas = [
        _linha_ob(dh="2026DH000002", ob="2026OB000002", cpf=22222222222, valor=308.19),
        _linha_ob(dh="2026DH000003", ob="2026OB000003", cpf=22222222222, valor=308.19),
    ]
    resumo, caminho_ob, caminho_controle, caminho_decisoes = _preparar(tmp_path, linhas)
    identidade = resumo.revisoes[0].identidade_grupo

    autor_sentinela = "servidor.nome.super.especifico.para.o.teste"
    with caplog.at_level("INFO", logger="app.services.relatorio_transparencia_service"):
        service.registrar_decisao_revisao(
            caminho_base_ordens_bancarias=caminho_ob,
            caminho_controle_dimcac=caminho_controle,
            ano_exercicio=2026,
            mes_referencia=5,
            caminho_decisoes=caminho_decisoes,
            identidade_grupo=identidade,
            acao=AcaoDecisao.PUBLICAR,
            obs_selecionadas=["2026OB000002", "2026OB000003"],
            autor=autor_sentinela,
        )

    texto_dos_logs = "\n".join(registro.getMessage() for registro in caplog.records)
    assert autor_sentinela not in texto_dos_logs
    # o autor CONTINUA persistido na decisão em si, só não no log técnico.
    decisoes_persistidas = (tmp_path / "decisoes.json").read_text(encoding="utf-8")
    assert autor_sentinela in decisoes_persistidas
