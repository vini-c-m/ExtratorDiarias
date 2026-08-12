from app.domain.rules.finalizacao_diarias import SituacaoComprovante, avaliar

# Trechos reproduzindo a estrutura real dos dois processos de referência
# (SEI 19.20.0001.0000375/2026-24 — Recibo; SEI 19.20.0001.0000639/2026-96 —
# Anexo Comprovante), sem dados pessoais reais.

_CONFIRMACAO_SIM = """
CMFC - Confirmação dos Serviços - Diária -Servidor - 1000001
Confirmação dos serviços de diária - Servidor - nos termos da Instrução Normativa PGJ 006/2018.
Confirmação dos serviços:
Sim
Devolução das diárias:
Não
CMFC - Confirmação dos Serviços - Diária -Servidor 1000001 SEI 19.20.0000.0000001/2026-01 / pg. 3
"""

_CONFIRMACAO_NAO = _CONFIRMACAO_SIM.replace(
    "Confirmação dos serviços:\nSim", "Confirmação dos serviços:\nNão"
)

_RECIBO = "Recibo (1000002) SEI 19.20.0000.0000001/2026-01 / pg. 6\n"
_ANEXO_COMPROVANTE = "Anexo Comprovante (1000002) SEI 19.20.0000.0000001/2026-01 / pg. 6\n"
_ORDEM_BANCARIA = "ORDEM BANCÁRIA DATA DA OB: NÚMERO: FOLHA:\n"


def test_apto_com_confirmacao_sim_e_recibo():
    avaliacao = avaliar(_CONFIRMACAO_SIM + _RECIBO)
    assert avaliacao.apto
    assert avaliacao.confirmacao_valida
    assert avaliacao.comprovante_encontrado
    assert avaliacao.motivo is None


def test_apto_com_confirmacao_sim_e_anexo_comprovante():
    avaliacao = avaliar(_CONFIRMACAO_SIM + _ANEXO_COMPROVANTE)
    assert avaliacao.apto
    assert avaliacao.comprovante_encontrado


def test_nao_apto_sem_nenhum_documento():
    avaliacao = avaliar("texto qualquer sem nenhum dos dois documentos")
    assert not avaliacao.apto
    assert not avaliacao.confirmacao_encontrada
    assert not avaliacao.comprovante_encontrado
    assert avaliacao.motivo == "Confirmação de Diárias não encontrada."


def test_nao_apto_confirmacao_sem_comprovante():
    avaliacao = avaliar(_CONFIRMACAO_SIM)
    assert not avaliacao.apto
    assert avaliacao.confirmacao_valida
    assert not avaliacao.comprovante_encontrado
    assert avaliacao.motivo == "Confirmação encontrada, mas nenhum comprovante/anexo foi identificado."


def test_nao_apto_comprovante_sem_confirmacao_valida():
    avaliacao = avaliar(_CONFIRMACAO_NAO + _RECIBO)
    assert not avaliacao.apto
    assert avaliacao.confirmacao_encontrada
    assert not avaliacao.confirmacao_valida
    assert avaliacao.comprovante_encontrado
    assert avaliacao.motivo == "Comprovante identificado, mas a Confirmação de Diárias não está válida."


def test_ordem_bancaria_e_informativa_nunca_bloqueia():
    sem_ob = avaliar(_CONFIRMACAO_SIM + _RECIBO)
    com_ob = avaliar(_CONFIRMACAO_SIM + _RECIBO + _ORDEM_BANCARIA)

    assert sem_ob.apto
    assert not sem_ob.ordem_bancaria_encontrada
    assert com_ob.apto
    assert com_ob.ordem_bancaria_encontrada


def test_titulo_anexo_com_codigo_de_execucao_financeira_nao_conta_como_comprovante():
    """Achado real no corpus (145 PDFs de legado/pdfs): o próprio anexo da
    Ordem Bancária às vezes é rotulado 'Anexo <código>' em vez de 'EXTERNO
    <código>' — não pode ser confundido com um comprovante de diária."""
    texto = _CONFIRMACAO_SIM + "Anexo 2026OB700003 (1000009) SEI 19.20.0000.0000001/2026-01 / pg. 9\n"
    avaliacao = avaliar(texto)
    assert not avaliacao.comprovante_encontrado


def test_anexo_cancelado_nao_conta_como_comprovante():
    texto = _CONFIRMACAO_SIM + "Anexo CANCELADA (1000009) SEI 19.20.0000.0000001/2026-01 / pg. 9\n"
    avaliacao = avaliar(texto)
    assert not avaliacao.comprovante_encontrado


def test_nota_fiscal_conta_como_comprovante():
    texto = _CONFIRMACAO_SIM + "Nota Fiscal Hospedagem (1000003) SEI 19.20.0000.0000001/2026-01 / pg. 6\n"
    assert avaliar(texto).comprovante_encontrado


# --- Pendência Analítica (Sprint pré-build, 2026-08-11) ---------------------

_ANEXO_EXTERNO_GENERICO = "EXTERNO (1000009) SEI 19.20.0000.0000001/2026-01 / pg. 9\n"


def test_anexo_externo_generico_vira_pendencia_nunca_erro_definitivo():
    """Achado real: 8/82 PDFs de teste têm um anexo com título só "EXTERNO",
    sem nenhuma palavra-chave. NÃO pode virar comprovante aceito
    automaticamente, mas também não é a mesma coisa que "nada anexado"."""
    avaliacao = avaliar(_CONFIRMACAO_SIM + _ANEXO_EXTERNO_GENERICO)

    assert not avaliacao.apto
    assert not avaliacao.comprovante_encontrado
    assert avaliacao.situacao_comprovante is SituacaoComprovante.PENDENTE
    assert avaliacao.pendente_analitico
    assert avaliacao.motivo == (
        "Não foi possível identificar automaticamente o comprovante necessário "
        "para este processo. Revise os documentos antes de decidir."
    )


def test_nenhum_anexo_continua_ausente_nao_pendencia():
    """Diferença central: PENDENTE exige que exista pelo menos um anexo
    genérico não reconhecido. Sem NENHUM anexo, continua AUSENTE — o motivo
    e o comportamento de "sem_comprovante" de antes desta Sprint continuam
    exatamente os mesmos."""
    avaliacao = avaliar(_CONFIRMACAO_SIM)

    assert not avaliacao.apto
    assert not avaliacao.pendente_analitico
    assert avaliacao.situacao_comprovante is SituacaoComprovante.AUSENTE
    assert avaliacao.motivo == "Confirmação encontrada, mas nenhum comprovante/anexo foi identificado."


def test_titulo_com_codigo_financeiro_nao_conta_como_pendencia():
    """O filtro de Ordem Bancária/Nota de Liquidação continua excluindo
    ANTES de decidir pendência — um título só de código financeiro não gera
    pendência nenhuma (seria ruído, não uma decisão real do servidor)."""
    texto = _CONFIRMACAO_SIM + "Anexo 2026OB700003 (1000009) SEI 19.20.0000.0000001/2026-01 / pg. 9\n"
    avaliacao = avaliar(texto)

    assert avaliacao.situacao_comprovante is SituacaoComprovante.AUSENTE
    assert not avaliacao.pendente_analitico


def test_regra_automatica_de_reconhecimento_nunca_muda_por_causa_da_pendencia():
    """Segurança (item 11 do pedido): um comprovante já reconhecível (ex.
    "Anexo Comprovante") continua ENCONTRADO — a introdução do estado
    PENDENTE não afeta em nada quem já era aceito automaticamente."""
    avaliacao = avaliar(_CONFIRMACAO_SIM + _ANEXO_COMPROVANTE)

    assert avaliacao.apto
    assert avaliacao.situacao_comprovante is SituacaoComprovante.ENCONTRADO
    assert not avaliacao.pendente_analitico


# --- P0-b: Prestação de Contas (Membro) como equivalente de Confirmação ----

_PRESTACAO_CONTAS_MEMBRO = """
CMFC - Prestação de Contas - Diária - Membro - 1470232
Prestação de Contas de Diária - Membros - Anexo III - nos termos da Resolução PGJ 003/2017.
1 - DADOS DO RESPONSÁVEL:
NOME DO MEMBRO:
FULANO DE TAL
2 - DA CONFIRMAÇÃO DOS SERVIÇOS
CIDADE ORIGEM:
RECIFE
3 - DOCUMENTO COMPROVANTE DA VIAGEM - MARCAR COM X
Comprovante de Participação no Evento:
CMFC - Prestação de Contas - Diária - Membro 1470232 SEI 19.20.0000.0000001/2026-01 / pg. 10
Sim
"""


def test_prestacao_de_contas_membro_conta_como_confirmacao_valida():
    """P0-b — achado real: 8/9 dos "sem_confirmacao" da bateria de 82 PDFs
    de teste eram diária de MEMBRO com a Prestação de Contas corretamente
    anexada — só o vocabulário ("Prestação de Contas", não "Confirmação dos
    Serviços") não era reconhecido."""
    avaliacao = avaliar(_PRESTACAO_CONTAS_MEMBRO + "Anexo (1000009) SEI 19.20.0000.0000001/2026-01 / pg. 12\n")

    assert avaliacao.confirmacao_encontrada
    assert avaliacao.confirmacao_valida
    assert avaliacao.apto


def test_prestacao_de_contas_isolada_sem_anexo_extra_vira_sem_comprovante_nao_erro_generico():
    avaliacao = avaliar(_PRESTACAO_CONTAS_MEMBRO)

    assert avaliacao.confirmacao_valida
    assert not avaliacao.apto
    assert avaliacao.motivo == "Confirmação encontrada, mas nenhum comprovante/anexo foi identificado."


def test_confirmacao_dos_servicos_servidor_continua_reconhecida_normalmente():
    """Regressão: o vocabulário original de Servidor não pode parar de
    funcionar depois do P0-b."""
    avaliacao = avaliar(_CONFIRMACAO_SIM + _RECIBO)
    assert avaliacao.confirmacao_valida
    assert avaliacao.apto


# --- alertas (Sprint pré-build, 2026-08-11 — regra final: alertas nunca bloqueiam) --


def test_alertas_vazio_quando_apto():
    avaliacao = avaliar(_CONFIRMACAO_SIM + _RECIBO)
    assert avaliacao.apto
    assert avaliacao.alertas == ()


def test_alertas_populado_para_comprovante_pendente():
    avaliacao = avaliar(_CONFIRMACAO_SIM + _ANEXO_EXTERNO_GENERICO)
    assert len(avaliacao.alertas) == 1
    assert "revisar manualmente" in avaliacao.alertas[0]


def test_alertas_populado_para_comprovante_ausente():
    avaliacao = avaliar(_CONFIRMACAO_SIM)
    assert len(avaliacao.alertas) == 1
    assert "Nenhum comprovante" in avaliacao.alertas[0]


def test_alertas_pode_ter_dois_itens_quando_confirmacao_e_comprovante_tem_problema():
    avaliacao = avaliar("texto qualquer sem nenhum dos dois documentos")
    assert len(avaliacao.alertas) == 2


def test_confirmacao_sem_subcampo_sim_nao_conta_como_valida_por_padrao():
    """Layout mais antigo, sem 'Confirmação dos serviços: Sim/Não' — o
    documento existir já basta (mesmo critério de tolerância a layouts
    antigos usado no resto do parser)."""
    texto_sem_subcampo = (
        "CMFC - Confirmação dos Serviços - Diária -Servidor - 1000001\n"
        "Algum outro conteúdo, sem o subcampo Sim/Não.\n"
    )
    avaliacao = avaliar(texto_sem_subcampo + _RECIBO)
    assert avaliacao.confirmacao_encontrada
    assert avaliacao.confirmacao_valida
    assert avaliacao.apto
