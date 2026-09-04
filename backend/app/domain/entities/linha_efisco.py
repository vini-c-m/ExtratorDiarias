from dataclasses import dataclass
from datetime import date, datetime


@dataclass(frozen=True)
class LinhaEfisco:
    """Uma linha da Base E-Fisco (export financeiro bruto do MPPE, TODAS as
    despesas — não só diárias), lida por `app/consulta/repositorio_efisco.py`
    — projeção de leitura pura, sem nenhuma decisão de negócio aplicada
    (identificar quais linhas são diária é responsabilidade exclusiva de
    `app/domain/relatorio_transparencia/filtro_diaria_efisco.py`).

    Deliberadamente NÃO é `OrdemBancaria` (Plano de Migração E-Fisco, Sprint
    A): `OrdemBancaria` é o contrato já homologado do domínio de
    reconciliação/decisão (RN01-RN07), construído a partir de uma OU MAIS
    fontes já cruzadas (Base OB + Controle DIMCAC); esta entidade representa
    só o que está escrito, linha a linha, na Base E-Fisco crua, ANTES de
    qualquer filtro ou cruzamento — existe para que `repositorio_efisco.py`
    nunca precise devolver tuplas soltas nem espalhar conhecimento de coluna
    E-Fisco para quem a consome. A conversão para `OrdemBancaria` (com o
    cruzamento por DH contra o Controle DIMCAC) é escopo da Sprint B, ainda
    não implementada.

    `ob` é o único campo verdadeiramente obrigatório — confirmado na
    auditoria real (17.461 linhas, `OB2026.xlsx`): toda linha financeira tem
    Ordem Bancária, mas `dh` pode legitimamente vir vazio (despesas
    administrativas sem Documento Hábil, ex. transferências entre contas da
    própria UG) sem que isso seja um erro de leitura.

    Todo campo além de `ob` é opcional (`None` quando a célula está vazia ou
    não pôde ser interpretada) — mesma filosofia de `OrdemBancaria`: esta
    camada nunca decide se um valor ausente invalida a linha, só representa
    o dado tal como está."""

    linha: int
    ob: str
    dh: str | None
    situacao: str | None
    natureza: str | None
    documento_credor: str | None
    credor: str | None
    data_ob: date | None
    data_pagamento_devolucao: datetime | None
    valor_bruto: float | None
    observacao: str | None
