from dataclasses import dataclass
from datetime import date, datetime


@dataclass(frozen=True)
class OrdemBancaria:
    """Uma linha da Base de Ordens Bancárias (fonte externa ao DIMCAC, lida
    por `app/consulta/repositorio_ordens_bancarias.py`) — projeção de leitura
    pura, sem nenhuma regra de negócio aplicada. A reconciliação contra o
    Controle de Diárias (R01-R10) é responsabilidade de um motor futuro,
    ainda não implementado (Micro-sprint 3) — esta entidade só representa o
    que está escrito na planilha.

    `linha` é só diagnóstico (localizar a linha na planilha), nunca chave. A
    chave de negócio real é o par `(dh, ob)` — nunca `ob` isolada (a mesma OB
    pode aparecer duas vezes na Base OB, achado real da auditoria: uma linha
    "Único" e outra "Duplicado" para o mesmo número) nem `dh` isolado (um DH
    legítimo pode ter várias OBs — pagamento fracionado em parcela principal
    + saldo, também achado real).

    Todo campo além de `dh`/`ob` é deliberadamente opcional (`None` quando a
    célula está vazia ou não pôde ser interpretada) — esta camada nunca
    decide se um valor ausente/malformado invalida o registro; ela só
    representa o dado tal como está. `cidade_origem`/`cidade_destino` seguem
    a mesma separação de `RegistroDiariaIndexada` (trecho não separável vira
    `(None, None)`, nunca uma adivinhação).

    `trecho` (Micro-sprint 3B) preserva o texto bruto da coluna TRECHO,
    além da separação já feita em `cidade_origem`/`cidade_destino` —
    necessário para o detector de suspeita de duplicidade financeira (RN07,
    `domain/relatorio_transparencia/motor_decisao.py`), que compara o
    trecho inteiro normalizado, não só a cidade de destino (achado real:
    trechos com 3+ localidades, ex. `'IPOJUCA-RIO FORMOSO E BARREIROS'`,
    não são separáveis em `cidade_origem`/`cidade_destino` sem perda de
    informação)."""

    linha: int
    dh: str
    ob: str
    credor: str | None
    situacao: str | None
    data_pagamento: datetime | None
    sei: str | None
    cpf: str | None
    nome: str | None
    cargo: str | None
    periodo_inicial: date | None
    periodo_final: date | None
    cidade_origem: str | None
    cidade_destino: str | None
    transporte: str | None
    motivo: str | None
    valor: float | None
    valor_bruto_sem_formula: float | None
    restituicao: float | None
    duplicidade: str | None
    item_de_gasto: str | None
    trecho: str | None = None
