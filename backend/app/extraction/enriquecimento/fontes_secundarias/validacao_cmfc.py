import re

from app.extraction.segmentacao_documentos import ultimo_segmento

from .base import EvidenciaComplementar, FonteSecundariaDeEvidencia

_NOME = "CMFC - Validação de Diária - Servidores"

# Mesmo padrão de título já usado por `documento_habil.py` para isolar este
# documento dentro do processo (tolerante a acento/caixa e a mais de uma
# ocorrência — `ultimo_segmento` sempre pega a mais recente).
_PADRAO_TITULO_VALIDACAO = re.compile(r"Valida[çc][ãa]o de Di[áa]ria", re.IGNORECASE)

# O formulário sempre lista as duas modalidades possíveis ("Dentro do
# Estado" / "Fora do Estado"), uma logo abaixo do rótulo — a que não se
# aplica fica com "-" (mesmo marcador de campo vazio usado em todo o
# documento, ex.: "OBSERVAÇÕES: -"). Ambos os padrões capturam só o
# conteúdo da linha imediatamente seguinte ao rótulo, nunca o formulário
# inteiro.
_PADRAO_MODALIDADE_DENTRO_DO_ESTADO = re.compile(
    r"MODALIDADES\s*-\s*Dentro do Estado\s*:\s*\r?\n\s*(.*)", re.IGNORECASE
)
_PADRAO_MODALIDADE_FORA_DO_ESTADO = re.compile(
    r"MODALIDADES\s*-\s*Fora do Estado\s*:\s*\r?\n\s*(.*)", re.IGNORECASE
)


def _modalidade_preenchida(correspondencia: "re.Match[str] | None") -> bool:
    if correspondencia is None:
        return False
    valor = correspondencia.group(1).strip()
    return bool(valor) and valor != "-"


class ValidacaoCmfcFonteSecundaria(FonteSecundariaDeEvidencia):
    """Primeira Fonte Secundária de Evidência implementada (2026-08-05) —
    caso real que motivou a arquitetura: SEI 19.20.0001.0014476/2026-35,
    onde a Solicitação de Diária trazia "CIDADE(S) DESTINO: Itambé" (nome
    de município que existe em Pernambuco, Bahia e Paraná — ambíguo sem
    contexto) e "CIDADE ORIGEM" era o nome de um prédio institucional, sem
    nenhuma cidade reconhecível — a fonte primária corretamente deixou
    `estado_destino` indefinido (`app/extraction/enriquecimento/local_destino.py`).

    Este documento ("CMFC - Validação de Diária - Servidores") é o
    formulário oficial em que o próprio DIMCAC/CMFC já classifica a viagem
    como "Dentro do Estado" ou "Fora do Estado" — uma classificação
    administrativa que só existe porque o MPPE é um órgão de Pernambuco:
    "Dentro do Estado" significa, por definição, dentro de Pernambuco
    (mesma faixa "Local" já usada em `Tabela Valores`/RN-05,
    `docs/central-conferencia/README.md § 2.3`). Quando só essa modalidade
    está preenchida (a outra vem com o marcador de campo vazio "-"), é
    evidência documental explícita — não uma suposição sobre o alcance
    geográfico do órgão — de que o destino está em Pernambuco.

    Só comprova `estado_destino`. Não tenta resolver `cidade_origem` (este
    documento não repete nem confirma a cidade de origem) — permanece
    indefinida, exatamente como a Decisão 2 (2026-08-05) exige: nenhuma
    transformação automática de nome de prédio em cidade/UF."""

    @property
    def nome(self) -> str:
        return _NOME

    @property
    def campos_suportados(self) -> frozenset[str]:
        return frozenset({"estado_destino"})

    def buscar_evidencias(self, texto: str) -> dict[str, EvidenciaComplementar]:
        segmento = ultimo_segmento(texto, _PADRAO_TITULO_VALIDACAO)
        if segmento is None:
            return {}

        dentro_do_estado = _modalidade_preenchida(
            _PADRAO_MODALIDADE_DENTRO_DO_ESTADO.search(segmento)
        )
        fora_do_estado = _modalidade_preenchida(
            _PADRAO_MODALIDADE_FORA_DO_ESTADO.search(segmento)
        )

        if dentro_do_estado and not fora_do_estado:
            return {
                "estado_destino": EvidenciaComplementar(
                    valor="PERNAMBUCO",
                    justificativa=(
                        f'{self.nome}: modalidade "Dentro do Estado" preenchida e '
                        '"Fora do Estado" vazia — classificação oficial já feita '
                        "pelo próprio DIMCAC/CMFC no processo, não uma inferência "
                        'por contexto geral do órgão. "Dentro do Estado" só existe '
                        "para viagens dentro de Pernambuco (mesma faixa \"Local\" "
                        "de `Tabela Valores`)."
                    ),
                )
            }

        return {}
