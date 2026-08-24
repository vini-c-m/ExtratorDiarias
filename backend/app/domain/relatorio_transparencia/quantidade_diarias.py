"""Micro-sprint 3F — resolução (NUNCA cálculo) da quantidade de diárias
integral/parcial de uma ocorrência, a partir dos registros do Controle
DIMCAC já associados a ela (`OcorrenciaFinanceira.registros_controle`).

Por que este módulo existe: o Nº de Diárias Integral/Parcial não é uma
regra de negócio nova (RN01-RN07 nunca mencionam isso) — é um dado já
calculado por um processo anterior (extração/complemento, ver
`app/domain/rules/historico_efisco.py` e `app/extraction/enriquecimento/
quantidade_complementar.py`) e persistido nas colunas N/O do Controle
DIMCAC (`RegistroControle.quantidade_diaria_integral/parcial`, lidas por
`app/consulta/repositorio_controle_dimcac.py`). Este módulo só decide COMO
associar esse dado já existente a uma ocorrência específica quando há mais
de um registro de Controle para o mesmo DH — nunca inventa um número novo.

Achado empírico (validação real, Micro-sprint 3F, 1876 DHs de 2026): em
99,95% dos casos (1875 de 1876) todos os registros de Controle de um mesmo
DH concordam entre si sobre (integral, parcial) — a resolução é trivial.
Só 1 DH real conhecido teve registros de Controle genuinamente divergentes
(mesmo padrão de "repetição física" já tratado por I11b para OrdemBancaria,
mas o Controle DIMCAC não tem uma I11b equivalente hoje) — nesse caso,
`resolver_quantidade_diarias` devolve `None` deliberadamente: melhor deixar
as células em branco e sinalizar (G04) do que publicar um número
adivinhado num relatório de transparência pública."""

from app.domain.entities.registro_controle import RegistroControle

__all__ = ["QuantidadeDiarias", "resolver_quantidade_diarias"]


class QuantidadeDiarias:
    """Par (integral, parcial) já resolvido — nunca calculado aqui."""

    __slots__ = ("integral", "parcial")

    def __init__(self, integral: int | None, parcial: int | None) -> None:
        self.integral = integral
        self.parcial = parcial

    def __eq__(self, other: object) -> bool:
        return (
            isinstance(other, QuantidadeDiarias)
            and self.integral == other.integral
            and self.parcial == other.parcial
        )

    def __repr__(self) -> str:  # pragma: no cover — só depuração
        return f"QuantidadeDiarias(integral={self.integral!r}, parcial={self.parcial!r})"


def resolver_quantidade_diarias(registros_controle: list[RegistroControle]) -> QuantidadeDiarias | None:
    """Devolve o par (integral, parcial) quando TODOS os registros de
    Controle do DH concordam (inclusive o caso trivial de um único
    registro); devolve `None` quando não há nenhum registro associado OU
    quando há divergência real entre eles — nos dois casos, quem chama
    deve tratar como "não determinado", nunca escolher um valor à toa."""
    pares = {(r.quantidade_diaria_integral, r.quantidade_diaria_parcial) for r in registros_controle}
    if len(pares) != 1:
        return None
    integral, parcial = pares.pop()
    return QuantidadeDiarias(integral=integral, parcial=parcial)
