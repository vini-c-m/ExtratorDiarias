from datetime import date

from app.domain.entities.diaria import Diaria
from app.domain.entities.fonte_transporte import FonteTransporte
from app.domain.entities.processo import Processo, StatusProcesso
from app.extraction.enriquecimento import enriquecer_processo


def _processo_sucesso(cidade_destino: str = "Nazaré da Mata") -> Processo:
    diaria = Diaria(
        sei="19.20.0000.0000001/2025-99",
        doc_origem="UNIDADE TESTE",
        cpf="99999999999",
        periodo_inicial=date(2025, 3, 1),
        periodo_final=date(2025, 3, 1),
        cidade_origem="Recife",
        cidade_destino=cidade_destino,
        motivo="De acordo com a requisição.",
    )
    return Processo(arquivo_origem="arquivo.pdf", status=StatusProcesso.SUCESSO, diaria=diaria)


def test_enriquecer_processo_preenche_os_tres_campos_quando_ha_evidencia():
    processo = _processo_sucesso("Garanhuns/PE")
    texto = "DOCUMENTO HÁBIL: 2025DH000102 ... VEÍCULO OFICIAL utilizado no trecho."

    enriquecido = enriquecer_processo(processo, texto)

    assert enriquecido.diaria.documento_habil == "2025DH000102"
    assert enriquecido.diaria.transporte == "CARRO"
    assert enriquecido.diaria.transporte_fonte is FonteTransporte.EVIDENCIA_DOCUMENTAL
    assert enriquecido.diaria.estado_destino == "PERNAMBUCO"
    assert enriquecido.avisos == []
    # SEI e demais campos já validados continuam intocados.
    assert enriquecido.diaria.sei == processo.diaria.sei
    assert enriquecido.diaria.cpf == processo.diaria.cpf


def test_enriquecer_processo_sem_evidencia_nenhuma_gera_tres_avisos():
    """Sem NENHUMA evidência de transporte e sem conseguir resolver o estado
    de destino, a regra operacional de fallback (Sprint 04.1) também não tem
    base para decidir — continua tudo em branco, com os 3 avisos de sempre."""
    processo = _processo_sucesso("Cidade Que Nao Existe De Verdade")
    texto = "FINALIDADE DA VIAGEM: De acordo com a requisição."

    enriquecido = enriquecer_processo(processo, texto)

    assert enriquecido.diaria.documento_habil is None
    assert enriquecido.diaria.transporte is None
    assert enriquecido.diaria.transporte_fonte is None
    assert enriquecido.diaria.estado_destino is None
    assert len(enriquecido.avisos) == 3


def test_enriquecer_processo_corrige_erro_de_digitacao_real_por_aproximacao():
    """O mesmo erro de digitação real ('Augustinho' em vez de 'Agostinho')
    encontrado num PDF de exemplo do legado agora é resolvido com segurança
    pela correspondência aproximada — só o estado, que é o que a coluna Q
    precisa, não o nome exato do município.

    Sprint 04.1: sem evidência textual de transporte, mas com o estado já
    resolvido para Pernambuco (e destino diferente de Petrolina), a regra
    operacional de fallback preenche CARRO — não sobra mais aviso de
    transporte, só o de DH, que continua sem evidência nenhuma."""
    processo = _processo_sucesso("Cabo de Santo Augustinho")
    texto = "FINALIDADE DA VIAGEM: De acordo com a requisição."

    enriquecido = enriquecer_processo(processo, texto)

    assert enriquecido.diaria.estado_destino == "PERNAMBUCO"
    assert enriquecido.diaria.transporte == "CARRO"
    assert enriquecido.diaria.transporte_fonte is FonteTransporte.REGRA_OPERACIONAL
    assert len(enriquecido.avisos) == 1  # só DH continua sem evidência


def test_enriquecer_processo_preserva_id_do_processo_original():
    processo = _processo_sucesso()
    enriquecido = enriquecer_processo(processo, "texto qualquer")
    assert enriquecido.id == processo.id
