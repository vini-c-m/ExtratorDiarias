"""Classificação MEMBRO x SERVIDOR (2026-08-05) — decisão registrada em
`app/infra/db/esquema.py` (VERSAO_ESQUEMA=3, "Bloco de Refinamento item
2"): `categoria_funcional` é uma classificação determinística sobre
`servidor_cargo` (a coluna `CARGO` da aba `Dados` da Planilha Oficial,
já lida como `Servidor.cargo` desde a Sprint 17.3), nunca inferência por
nome/probabilidade — RN institucional: a Lei Orgânica do Ministério
Público (Lei 8.625/1993) só reconhece como **membro** quem ocupa cargo
de Promotor de Justiça ou Procurador de Justiça; qualquer outro cargo
cadastrado (técnico/analista ministerial, comissionado, extraquadro,
policial militar cedido, assessoria/gerência administrativa — validado
contra os 42 cargos distintos da Planilha Oficial real em 2026-08-05) é
**servidor** no sentido usado por este sistema de diárias: qualquer
beneficiário que não é membro (decisão confirmada com o usuário em
2026-08-05 para o caso "Policial Militar" — cedido de outra instituição,
sem cargo de carreira própria do MP, mas também não-membro).

`NAO_IDENTIFICADO` só quando não há como saber: cadastro ausente (CPF
sem correspondência em `Dados`, RN-01) ou `cargo` vazio — nunca um
"chute" para MEMBRO nem para SERVIDOR."""

import unicodedata
from typing import Literal

CategoriaFuncional = Literal["MEMBRO", "SERVIDOR", "NAO_IDENTIFICADO"]


def _normalizar(texto: str) -> str:
    """Maiúsculas, sem acento, sem espaços duplicados — só para comparar
    contra o catálogo abaixo (mesma técnica de
    `app/extraction/enriquecimento/_texto.normalizar`, duplicada aqui de
    propósito: o domínio nunca importa de `app/extraction/`, camadas
    puras não dependem de camadas de infraestrutura de extração)."""
    sem_acento = "".join(
        caractere
        for caractere in unicodedata.normalize("NFKD", texto)
        if not unicodedata.combining(caractere)
    )
    return " ".join(sem_acento.upper().split())


# Catálogo fechado — os 4 cargos que a Lei Orgânica do MP reconhece como
# membro (validado contra a Planilha Oficial real, 2026-08-05: 339 das
# 1.651 diárias reais). Qualquer cargo fora deste conjunto é SERVIDOR
# (não-membro) — nunca uma segunda lista fechada a manter em sincronia
# com o cadastro de RH, que mudaria a cada cargo administrativo novo.
_CARGOS_MEMBRO = frozenset(
    {
        "PROMOTOR DE JUSTICA DE 1A. ENTRANCIA",
        "PROMOTOR DE JUSTICA DE 2A. ENTRANCIA",
        "PROMOTOR DE JUSTICA DE 3A. ENTRANCIA",
        "PROCURADOR DE JUSTICA",
    }
)


def classificar_categoria_funcional(cargo: str | None) -> CategoriaFuncional:
    if cargo is None or not cargo.strip():
        return "NAO_IDENTIFICADO"
    return "MEMBRO" if _normalizar(cargo) in _CARGOS_MEMBRO else "SERVIDOR"
