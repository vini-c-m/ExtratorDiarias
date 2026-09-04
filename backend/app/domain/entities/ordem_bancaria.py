from dataclasses import dataclass
from datetime import date, datetime


@dataclass(frozen=True)
class OrdemBancaria:
    """Uma ocorrência financeira (fonte externa ao DIMCAC) — projeção de
    leitura pura, sem nenhuma regra de negócio aplicada. Nome/campo `ob`
    preservados por representarem um conceito de negócio real (Número da
    Ordem Bancária) que continua existindo na fonte atual, não um artefato
    do leitor legado.

    Sprint E (Plano de Migração E-Fisco, limpeza do legado) — até a Sprint C
    a única fonte era a Base de Ordens Bancárias/ClickView, lida por
    `app/consulta/repositorio_ordens_bancarias.py` (removido nesta Sprint,
    já sem nenhum uso produtivo). A fonte atual é a Base E-Fisco
    (`app/consulta/repositorio_efisco.py`), adaptada para esta MESMA forma
    por `app/domain/relatorio_transparencia/adaptador_efisco.py` — o motor
    de reconciliação (`motor_reconciliacao.py`) e tudo o que consome
    `OrdemBancaria` nunca precisou mudar por causa da troca de fonte.

    A reconciliação contra o Controle de Diárias (RN01-RN07) é
    responsabilidade de `domain/relatorio_transparencia/motor_reconciliacao.py`/
    `motor_decisao.py` — esta entidade só representa o dado já lido.

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
