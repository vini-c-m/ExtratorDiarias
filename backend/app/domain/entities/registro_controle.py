from dataclasses import dataclass
from datetime import date
from enum import Enum


class ClassificacaoSei(str, Enum):
    """Classificação do SEI de uma linha do Controle DIMCAC, sem nenhuma
    correção automática nem decisão de qual linha manter — só rotula, para
    o motor de reconciliação (Micro-sprint 3) decidir o que fazer com cada
    caso. VALIDO: casa com o formato NUP do SEI (`NN.NN.NNNN(...).NNNNNNN/
    NNNN-NN`). MALFORMADO: célula preenchida, mas fora desse formato —
    texto indevido, dígitos faltando etc. (achados reais da auditoria).
    AUSENTE: célula vazia."""

    VALIDO = "valido"
    MALFORMADO = "malformado"
    AUSENTE = "ausente"


@dataclass(frozen=True)
class RegistroControle:
    """Uma linha do Controle DIMCAC lida por `app/consulta/
    repositorio_controle_dimcac.py` — projeção própria para o Relatório de
    Diárias — Portal da Transparência (Micro-sprint 3), deliberadamente
    sem NENHUMA deduplicação.

    Achado real da auditoria que motivou esta entidade: `repositorio_
    diarias.diarias_completas` indexa por SEI e descarta silenciosamente
    qualquer linha cujo SEI já apareceu antes — 13 DHs reais do Controle
    desapareciam do universo de reconciliação por esse motivo só, mesmo
    tendo DH preenchido. Aqui `linha` nunca é chave de negócio (só
    diagnóstico, para localizar a linha na planilha) — a chave de
    agrupamento é sempre `dh`, e múltiplos `RegistroControle` para o mesmo
    `dh` são esperados e preservados (`ResultadoLeituraControleDimcac.
    por_dh`), nunca colapsados.

    `sei`/`sei_classificacao` sempre convivem: o valor bruto (normalizado
    só por `strip()`, nunca reescrito ou corrigido) e o veredito da
    classificação — SEI repetido, malformado ou ausente nunca é motivo
    para descartar a linha, só evidência para uma regra futura decidir o
    que fazer. `dh` é sempre não-vazio aqui — só linhas com DH preenchido
    viram `RegistroControle` (ver `ResultadoLeituraControleDimcac.
    linhas_sem_dh`/`linhas_vazias_ignoradas` para as demais).

    Os demais campos seguem a mesma filosofia de `RegistroDiariaIndexada`
    (`app/domain/entities/registro_diaria_indexada.py`): opcionais quando a
    célula está vazia ou não pôde ser interpretada, nunca uma adivinhação —
    um campo malformado gera um `AvisoLinhaIgnorada` (evidência), mas nunca
    remove a linha do resultado. `trecho` preserva o texto bruto mesmo
    quando não separável em `cidade_origem`/`cidade_destino` — as duas
    formas convivem, nenhuma sobrescreve a outra."""

    linha: int
    dh: str
    sei: str | None
    sei_classificacao: ClassificacaoSei
    doc_origem: str | None
    cpf: str | None
    periodo_inicial: date | None
    periodo_final: date | None
    cidade_origem: str | None
    cidade_destino: str | None
    trecho: str | None
    motivo: str | None
    transporte: str | None
    valor_total_diarias: float | None
    # Micro-sprint 3F — colunas N ("QUANT. DIÁRIA INTEGRAL") e O ("QUANT.
    # DIÁRIA PARCIAL") do Controle DIMCAC, já calculadas por um processo
    # anterior (extração/complemento) e persistidas manualmente/automaticamente
    # nesta planilha — nunca recalculadas aqui nem em nenhum lugar do
    # Relatório de Diárias. `None` quando ausente/não numérico, nunca `0`
    # adivinhado (mesma filosofia de `valor_total_diarias`/`_valor_como_numero`).
    quantidade_diaria_integral: int | None = None
    quantidade_diaria_parcial: int | None = None
