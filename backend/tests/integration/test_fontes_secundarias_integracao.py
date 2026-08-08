"""Arquitetura de Fontes Secundárias de Evidência (2026-08-05) — testada
ponta a ponta via `enriquecer_processo` (parser + todas as regras de
enriquecimento já homologadas + a nova etapa de fontes secundárias).

Dados 100% sintéticos, conforme a Política de Dados Sintéticos do projeto
(`CONTRIBUTING.md`) — nenhum PDF, CPF ou nome real é usado ou distribuído
neste repositório, mesmo para reproduzir um caso real de homologação. O
padrão estrutural abaixo (Solicitação de Diária com CIDADE ORIGEM sendo o
nome de um prédio institucional sem cidade nenhuma + CIDADE(S) DESTINO
ambígua entre estados + uma "CMFC - Validação de Diária - Servidores"
classificando a viagem como "Dentro do Estado") reproduz fielmente o
processo real SEI 19.20.0001.0014476/2026-35, que motivou esta
arquitetura — só os dados (nome, CPF, SEI) são fictícios."""

from datetime import date

from app.domain.entities.diaria import Diaria
from app.domain.entities.processo import Processo, StatusProcesso
from app.extraction.enriquecimento import enriquecer_processo

_PREDIO_SEM_CIDADE_RECONHECIVEL = "Centro Administrativo Fictício de Teste"
# "Itambé" é um nome de município real (dado geográfico público, não
# pessoal) que existe em Pernambuco, Bahia e Paraná — usado aqui como no
# processo real, para reproduzir a mesma ambiguidade genuína da base de
# municípios (`app/extraction/dados/municipios.json`), não um dado sensível.
_MUNICIPIO_AMBIGUO = "Itambé"


def _validacao_diaria_dentro_do_estado(sei_ficticio: str) -> str:
    return (
        "CMFC - Validação de Diária - Servidores - 9999999\n"
        "Validação de diária para servidores nos termos da Instrução Normativa PGJ 006/2018.\n"
        "DAS DIÁRIAS\n"
        "MODALIDADES - Dentro do Estado:\n"
        "Dentro do Estado - De 100KM ou mais\n"
        "PARCIAL\n"
        "QUANTIDADE :\n"
        "01\n"
        "VALOR UNITÁRIO :\n"
        "154,09\n"
        "MODALIDADES - Fora do Estado:\n"
        "-\n"
        "VALOR TOTAL GERAL:\n"
        "154,09\n"
        f"OBSERVAÇÕES:\n{sei_ficticio}\n"
    )


def _processo_sei_19_20_0145_0014476_reproducao_sintetica() -> tuple[Processo, str]:
    """Reproduz, com dados fictícios, a mesma combinação encontrada no
    processo real: fonte primária com origem não resolvível (prédio) e
    destino geograficamente ambíguo — exatamente o caso que a investigação
    de 2026-08-05 diagnosticou como "correto, mas incompleto sem uma fonte
    secundária"."""
    diaria = Diaria(
        sei="19.20.9999.9999999/2026-00",
        doc_origem="DIMOT",
        cpf="99999999999",
        periodo_inicial=date(2026, 7, 30),
        periodo_final=date(2026, 7, 30),
        cidade_origem=_PREDIO_SEM_CIDADE_RECONHECIVEL,
        cidade_destino=_MUNICIPIO_AMBIGUO,
        motivo="Inspeção",
    )
    processo = Processo(
        arquivo_origem="reproducao_sei_19.20.0001.0014476.pdf",
        status=StatusProcesso.SUCESSO,
        diaria=diaria,
    )
    texto = (
        "CMFC - Solicitação de Diária - Servidor - 9999998\n"
        "UNIDADE SOLICITANTE:\nDIMOT\n"
        f"CIDADE ORIGEM:\n{_PREDIO_SEM_CIDADE_RECONHECIVEL}\n"
        f"CIDADE(S) DESTINO:\n{_MUNICIPIO_AMBIGUO}\n"
        "DATA INICIAL:\n30/07/2026\n"
        "DATA DE RETORNO:\n30/07/2026\n"
        + _validacao_diaria_dentro_do_estado("2026DH999999")
    )
    return processo, texto


def test_reproducao_sintetica_do_processo_real_resolve_estado_por_fonte_secundaria():
    """Demonstra a arquitetura completa com o padrão estrutural do processo
    real SEI 19.20.0001.0014476/2026-35 (dados sintéticos — ver docstring
    do módulo): a fonte primária deixa `estado_destino` indefinido (mesmo
    diagnóstico da investigação original), e a Fonte Secundária de
    Evidência ("CMFC - Validação de Diária - Servidores") complementa a
    partir da modalidade "Dentro do Estado"."""
    processo, texto = _processo_sei_19_20_0145_0014476_reproducao_sintetica()

    enriquecido = enriquecer_processo(processo, texto)

    assert enriquecido.diaria.estado_destino == "PERNAMBUCO"
    # A fonte primária nunca é alterada: origem continua exatamente como
    # extraída, nunca virou "Recife" nem nenhuma outra cidade por
    # transformação automática (Decisão 2, 2026-08-05).
    assert enriquecido.diaria.cidade_origem == _PREDIO_SEM_CIDADE_RECONHECIVEL
    assert enriquecido.diaria.cidade_destino == _MUNICIPIO_AMBIGUO
    # As duas mensagens ficam visíveis: a ambiguidade original E a
    # complementação — nunca uma esconde a outra.
    assert any("mais de um estado" in aviso for aviso in enriquecido.avisos)
    assert any(
        "complementado por fonte secundária" in aviso
        and "CMFC - Validação de Diária - Servidores" in aviso
        for aviso in enriquecido.avisos
    )


def test_sem_validacao_de_diaria_anexada_estado_continua_indefinido():
    """Sem o documento auxiliar no processo (ex.: processo ainda não
    liquidado), nada muda em relação ao comportamento já homologado antes
    desta arquitetura — a ambiguidade permanece sinalizada, sem
    complementação nenhuma."""
    processo, texto_completo = _processo_sei_19_20_0145_0014476_reproducao_sintetica()
    texto_sem_validacao = texto_completo.split("CMFC - Validação de Diária")[0]

    enriquecido = enriquecer_processo(processo, texto_sem_validacao)

    assert enriquecido.diaria.estado_destino is None
    assert not any("complementado por fonte secundária" in aviso for aviso in enriquecido.avisos)


def test_campo_ja_resolvido_pela_fonte_primaria_nunca_e_sobrescrito_por_fonte_secundaria():
    """Mesmo com uma "CMFC - Validação de Diária" dizendo "Dentro do
    Estado" (Pernambuco), um destino que a fonte primária já resolveu sem
    ambiguidade para OUTRO estado precisa continuar exatamente como a fonte
    primária resolveu — a fonte secundária nunca tem a palavra final."""
    diaria = Diaria(
        sei="19.20.9999.9999999/2026-00",
        doc_origem="DIMOT",
        cpf="99999999999",
        periodo_inicial=date(2026, 7, 30),
        periodo_final=date(2026, 7, 30),
        cidade_origem="Recife",
        cidade_destino="Salvador/BA",  # inequívoco: fonte primária já resolve para BAHIA
        motivo="Inspeção",
    )
    processo = Processo(arquivo_origem="teste.pdf", status=StatusProcesso.SUCESSO, diaria=diaria)
    texto = (
        "CMFC - Solicitação de Diária - Servidor - 9999998\n"
        "CIDADE ORIGEM:\nRecife\n"
        "CIDADE(S) DESTINO:\nSalvador/BA\n"
        "DATA INICIAL:\n30/07/2026\nDATA DE RETORNO:\n30/07/2026\n"
        + _validacao_diaria_dentro_do_estado("2026DH999999")
    )

    enriquecido = enriquecer_processo(processo, texto)

    assert enriquecido.diaria.estado_destino == "BAHIA"
    assert not any("complementado por fonte secundária" in aviso for aviso in enriquecido.avisos)
