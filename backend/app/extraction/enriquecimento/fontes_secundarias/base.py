from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass(frozen=True)
class EvidenciaComplementar:
    """Um valor que uma Fonte Secundária provou, de forma explícita, para um
    campo específico de `Diaria` — sempre acompanhado da justificativa exata
    (documento de origem + o que nele comprova o valor), nunca aplicado
    silenciosamente. A justificativa vira aviso visível ao usuário (ver
    `orquestrador.aplicar_fontes_secundarias`), nunca só um comentário
    interno de código."""

    valor: str
    justificativa: str


class FonteSecundariaDeEvidencia(ABC):
    """Strategy Pattern (mesmo padrão de `ParserSei`,
    `app/extraction/parsers/base_parser.py`) para documentos auxiliares do
    processo SEI — anexados junto com a Solicitação de Diária — capazes de
    comprovar, de forma explícita e inequívoca, campos que a fonte primária
    deixou indefinidos.

    Princípios obrigatórios de toda fonte concreta (reforçados
    centralmente pelo orquestrador, não reimplementados por cada fonte):

    - a Solicitação de Diária (fonte primária) nunca é substituída — uma
      fonte secundária só é consultada para campos que ela deixou `None`;
    - só evidência documental explícita e inequívoca — nunca heurística,
      probabilidade, "contexto geral do órgão" ou preferência estatística;
    - cada fonte é totalmente independente das demais — nenhuma fonte lê o
      resultado de outra, nenhuma referencia outra por nome ou por tipo;
    - uma fonte só declara evidência para os campos que o documento que ela
      representa realmente comprova — nunca "de brinde" para outros campos
      só porque estão no mesmo processo.
    """

    @property
    @abstractmethod
    def nome(self) -> str:
        """Identificação humana do documento auxiliar (ex.: "CMFC -
        Validação de Diária - Servidores") — usada nos avisos de
        complementação, para o usuário sempre saber de onde veio um valor
        que ele não digitou nem está na Solicitação de Diária."""

    @property
    @abstractmethod
    def campos_suportados(self) -> frozenset[str]:
        """Nomes dos campos de `app.domain.entities.diaria.Diaria` que esta
        fonte é capaz de comprovar — declarado estaticamente (sem precisar
        rodar `buscar_evidencias`), para o orquestrador decidir se vale a
        pena sequer chamar esta fonte (nenhum desses campos está pendente)."""

    @abstractmethod
    def buscar_evidencias(self, texto: str) -> dict[str, EvidenciaComplementar]:
        """Procura, no texto completo do processo, evidência explícita e
        inequívoca para os campos declarados em `campos_suportados`.
        Devolve só os campos para os quais encontrou evidência suficiente —
        um dicionário vazio é a resposta correta e esperada sempre que o
        documento que esta fonte representa não está no processo, ou está
        mas não comprova nada com segurança. Nunca devolve um valor
        "provável" — na dúvida, omite o campo."""
