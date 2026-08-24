from dataclasses import dataclass, field

from app.domain.entities.ordem_bancaria import OrdemBancaria
from app.domain.entities.registro_controle import RegistroControle


@dataclass(frozen=True)
class DocumentoHabil:
    """Um DH e tudo o que as duas fontes (Controle DIMCAC e Base de Ordens
    Bancárias) registram para ele — a unidade de conciliação administrativa
    (Micro-sprint 2/3). Nenhum dos dois lados é resumido a um único registro:

    - `controle`: normalmente 0 ou 1 item, mas **pode ter 2 ou mais** —
      achado real da auditoria em que o próprio Controle DIMCAC tem o
      mesmo DH duplicado em duas linhas. Lido por `app/consulta/
      repositorio_controle_dimcac.py` (Micro-sprint 3), deliberadamente
      não indexado por SEI — SEI duplicado, malformado ou repetido dentro
      do mesmo DH nunca reduz esta lista. Modelado como lista por simetria
      com `ordens_bancarias`, nunca um campo escalar.
    - `ordens_bancarias`: 0, 1 ou N OBs — pagamento fracionado (parcela
      principal + saldo, R03) é legítimo e comum; a mesma numeração de OB
      também pode se repetir como linha (R04). Nenhum dos dois casos é
      resolvido aqui — só preservado.

    Um DH pode legitimamente ter uma lista vazia de um dos dois lados: só no
    Controle (diária ainda não paga) ou só na Base OB (pagamento sem
    correspondência encontrada no Controle, caso a investigar por uma regra
    futura, não por esta camada)."""

    dh: str
    controle: list[RegistroControle] = field(default_factory=list)
    ordens_bancarias: list[OrdemBancaria] = field(default_factory=list)
