from dataclasses import dataclass, field

from app.domain.entities.ordem_bancaria import OrdemBancaria
from app.domain.entities.registro_diaria_indexada import RegistroDiariaIndexada


@dataclass(frozen=True)
class DocumentoHabil:
    """Um DH e tudo o que as duas fontes (Controle DIMCAC e Base de Ordens
    Bancárias) registram para ele — a unidade de conciliação administrativa
    (Micro-sprint 2). Nenhum dos dois lados é resumido a um único registro:

    - `controle`: normalmente 0 ou 1 item, mas **pode ter 2** — achado real
      da auditoria (4 DHs reais) em que o próprio Controle DIMCAC tem o
      mesmo DH duplicado em duas linhas. Modelado como lista
      por simetria com `ordens_bancarias`, nunca um campo escalar, para não
      ter que redesenhar a entidade quando esse caso precisar de uma regra
      (fora do escopo desta Micro-sprint).
    - `ordens_bancarias`: 0, 1 ou N OBs — pagamento fracionado (parcela
      principal + saldo, R03) é legítimo e comum; a mesma numeração de OB
      também pode se repetir como linha (R04). Nenhum dos dois casos é
      resolvido aqui — só preservado.

    Um DH pode legitimamente ter uma lista vazia de um dos dois lados: só no
    Controle (diária ainda não paga) ou só na Base OB (pagamento sem
    correspondência encontrada no Controle, caso a investigar por uma regra
    futura, não por esta camada)."""

    dh: str
    controle: list[RegistroDiariaIndexada] = field(default_factory=list)
    ordens_bancarias: list[OrdemBancaria] = field(default_factory=list)
