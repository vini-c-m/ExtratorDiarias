"""Orquestrador da arquitetura de Fontes Secundárias de Evidência
(2026-08-05) — testado com fontes falsas (`_FonteFake`), isoladas do
registro real (`FONTES_SECUNDARIAS`), injetadas via parâmetro `fontes=`."""

from dataclasses import dataclass
from datetime import date

from app.domain.entities.diaria import Diaria
from app.extraction.enriquecimento.fontes_secundarias.base import (
    EvidenciaComplementar,
    FonteSecundariaDeEvidencia,
)
from app.extraction.enriquecimento.fontes_secundarias.orquestrador import (
    aplicar_fontes_secundarias,
)


@dataclass(frozen=True)
class _FonteFake(FonteSecundariaDeEvidencia):
    """Fonte de teste: devolve exatamente `evidencias_fixas` sempre que
    chamada, e registra em `chamadas` (lista compartilhada, mutável) quando
    `buscar_evidencias` de fato executou — usado para provar que o
    orquestrador nem chama uma fonte cujos campos já estão todos
    resolvidos."""

    nome_: str
    campos_suportados_: frozenset[str]
    evidencias_fixas: dict[str, EvidenciaComplementar]
    chamadas: list[str]

    @property
    def nome(self) -> str:
        return self.nome_

    @property
    def campos_suportados(self) -> frozenset[str]:
        return self.campos_suportados_

    def buscar_evidencias(self, texto: str) -> dict[str, EvidenciaComplementar]:
        self.chamadas.append(self.nome_)
        return dict(self.evidencias_fixas)


def _diaria(**sobrescritas) -> Diaria:
    base = dict(
        sei="19.20.0000.0000001/2025-99",
        doc_origem="UNIDADE TESTE",
        cpf="99999999999",
        periodo_inicial=date(2025, 3, 1),
        periodo_final=date(2025, 3, 1),
        cidade_origem="Recife",
        cidade_destino="Destino Teste",
        motivo="De acordo com a requisição.",
    )
    base.update(sobrescritas)
    return Diaria(**base)


def test_complementa_campo_indefinido_e_registra_aviso_com_fonte_e_justificativa():
    diaria = _diaria(estado_destino=None)
    chamadas: list[str] = []
    fonte = _FonteFake(
        nome_="Documento Fake",
        campos_suportados_=frozenset({"estado_destino"}),
        evidencias_fixas={
            "estado_destino": EvidenciaComplementar(valor="PERNAMBUCO", justificativa="motivo X")
        },
        chamadas=chamadas,
    )

    diaria_final, avisos = aplicar_fontes_secundarias(diaria, "texto qualquer", fontes=(fonte,))

    assert diaria_final.estado_destino == "PERNAMBUCO"
    assert len(avisos) == 1
    assert "Documento Fake" in avisos[0]
    assert "motivo X" in avisos[0]
    assert "estado_destino" in avisos[0]
    assert chamadas == ["Documento Fake"]


def test_nunca_sobrescreve_campo_ja_resolvido_pela_fonte_primaria():
    diaria = _diaria(estado_destino="BAHIA")  # já resolvido — não deveria ser tocado
    chamadas: list[str] = []
    fonte = _FonteFake(
        nome_="Documento Fake",
        campos_suportados_=frozenset({"estado_destino"}),
        evidencias_fixas={
            "estado_destino": EvidenciaComplementar(valor="PERNAMBUCO", justificativa="motivo X")
        },
        chamadas=chamadas,
    )

    diaria_final, avisos = aplicar_fontes_secundarias(diaria, "texto qualquer", fontes=(fonte,))

    assert diaria_final.estado_destino == "BAHIA"
    assert diaria_final is diaria  # nem um novo objeto foi criado
    assert avisos == []
    # A fonte nem chega a ser chamada: o único campo que ela suporta já
    # estava resolvido, então não há nada pendente para ela comprovar.
    assert chamadas == []


def test_fonte_sem_evidencia_suficiente_nao_altera_nada():
    diaria = _diaria(estado_destino=None)
    fonte = _FonteFake(
        nome_="Documento Fake",
        campos_suportados_=frozenset({"estado_destino"}),
        evidencias_fixas={},  # sem evidência suficiente desta vez
        chamadas=[],
    )

    diaria_final, avisos = aplicar_fontes_secundarias(diaria, "texto qualquer", fontes=(fonte,))

    assert diaria_final.estado_destino is None
    assert avisos == []


def test_primeira_fonte_da_lista_vence_quando_duas_declaram_o_mesmo_campo():
    diaria = _diaria(estado_destino=None)
    chamadas: list[str] = []
    primeira = _FonteFake(
        nome_="Primeira Fonte",
        campos_suportados_=frozenset({"estado_destino"}),
        evidencias_fixas={
            "estado_destino": EvidenciaComplementar(valor="PERNAMBUCO", justificativa="primeira")
        },
        chamadas=chamadas,
    )
    segunda = _FonteFake(
        nome_="Segunda Fonte",
        campos_suportados_=frozenset({"estado_destino"}),
        evidencias_fixas={
            "estado_destino": EvidenciaComplementar(valor="BAHIA", justificativa="segunda")
        },
        chamadas=chamadas,
    )

    diaria_final, avisos = aplicar_fontes_secundarias(
        diaria, "texto qualquer", fontes=(primeira, segunda)
    )

    assert diaria_final.estado_destino == "PERNAMBUCO"
    assert len(avisos) == 1
    assert "Primeira Fonte" in avisos[0]
    # A segunda fonte nem chega a ser chamada: quando é a vez dela, o único
    # campo que ela suporta já foi preenchido pela primeira nesta mesma
    # aplicação — não sobra nada pendente para ela comprovar.
    assert chamadas == ["Primeira Fonte"]


def test_duas_fontes_independentes_complementam_campos_diferentes():
    diaria = _diaria(estado_destino=None, transporte=None)
    fonte_estado = _FonteFake(
        nome_="Fonte do Estado",
        campos_suportados_=frozenset({"estado_destino"}),
        evidencias_fixas={
            "estado_destino": EvidenciaComplementar(valor="PERNAMBUCO", justificativa="motivo A")
        },
        chamadas=[],
    )
    fonte_transporte = _FonteFake(
        nome_="Fonte do Transporte",
        campos_suportados_=frozenset({"transporte"}),
        evidencias_fixas={
            "transporte": EvidenciaComplementar(valor="CARRO", justificativa="motivo B")
        },
        chamadas=[],
    )

    diaria_final, avisos = aplicar_fontes_secundarias(
        diaria, "texto qualquer", fontes=(fonte_estado, fonte_transporte)
    )

    assert diaria_final.estado_destino == "PERNAMBUCO"
    assert diaria_final.transporte == "CARRO"
    assert len(avisos) == 2


def test_fonte_nao_e_chamada_quando_nenhum_campo_suportado_esta_pendente():
    diaria = _diaria(estado_destino="PERNAMBUCO")  # já resolvido
    chamadas: list[str] = []
    fonte = _FonteFake(
        nome_="Documento Fake",
        campos_suportados_=frozenset({"estado_destino"}),
        evidencias_fixas={
            "estado_destino": EvidenciaComplementar(valor="BAHIA", justificativa="não importa")
        },
        chamadas=chamadas,
    )

    aplicar_fontes_secundarias(diaria, "texto qualquer", fontes=(fonte,))

    assert chamadas == []


def test_registro_real_contem_a_fonte_validacao_cmfc():
    from app.extraction.enriquecimento.fontes_secundarias.registro import FONTES_SECUNDARIAS
    from app.extraction.enriquecimento.fontes_secundarias.validacao_cmfc import (
        ValidacaoCmfcFonteSecundaria,
    )

    assert any(isinstance(fonte, ValidacaoCmfcFonteSecundaria) for fonte in FONTES_SECUNDARIAS)
