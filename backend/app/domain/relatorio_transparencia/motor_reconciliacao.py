"""Micro-sprint 2 — reconciliação mínima entre Controle DIMCAC e Base de
Ordens Bancárias, focada exclusivamente em preservar a granularidade
DH/OB. Nenhuma regra financeira/descritiva (R01, R02, R05, R06, R07, R09)
é aplicada aqui — isso é responsabilidade de uma Micro-sprint futura, uma
vez que a associação em si esteja provada correta.

Caso de regressão obrigatório (padrão real recorrente na auditoria — DH com
pagamento fracionado em parcela principal + saldo, identificadores
fictícios abaixo): `2026DH900001` → `2026OB900001` + `2026OB900002`. As
duas OBs precisam sobreviver à reconciliação, nunca uma delas some por
deduplicação ingênua."""

from dataclasses import dataclass, field

from app.domain.entities.ordem_bancaria import OrdemBancaria
from app.domain.entities.registro_diaria_indexada import RegistroDiariaIndexada
from app.domain.relatorio_transparencia.entidades import DocumentoHabil

__all__ = ["ResultadoReconciliacao", "reconciliar"]


@dataclass(frozen=True)
class ResultadoReconciliacao:
    """Um `DocumentoHabil` por DH que aparece em pelo menos uma das duas
    fontes — união, nunca interseção: um DH só no Controle (ainda não pago)
    ou só na Base OB (achado a investigar por uma regra futura) continua
    representado, com o lado ausente como lista vazia."""

    documentos: dict[str, DocumentoHabil] = field(default_factory=dict)


def _agrupar_controle_por_dh(
    diarias_controle: dict[str, RegistroDiariaIndexada],
) -> dict[str, list[RegistroDiariaIndexada]]:
    """`diarias_controle` vem indexado por SEI (`repositorio_diarias.
    diarias_completas`) — reagrupa por DH, preservando múltiplas linhas
    quando o próprio Controle tem o DH duplicado (achado real, 4 casos).
    Registros sem DH (`dh is None`) são ignorados aqui, não porque sejam
    inválidos, mas porque `RegistroDiariaIndexada.dh` vazio já é uma
    condição conhecida e esperada — processo que ainda não chegou à fase
    de liquidação (docstring da própria entidade) — não faz sentido
    "reconciliar" um DH que não existe."""
    por_dh: dict[str, list[RegistroDiariaIndexada]] = {}
    for registro in diarias_controle.values():
        if registro.dh is None:
            continue
        por_dh.setdefault(registro.dh, []).append(registro)
    return por_dh


def reconciliar(
    diarias_controle: dict[str, RegistroDiariaIndexada],
    ordens_por_dh: dict[str, list[OrdemBancaria]],
) -> ResultadoReconciliacao:
    """Associa os registros do Controle DIMCAC (indexados por SEI, como
    `repositorio_diarias.diarias_completas` devolve) aos da Base de Ordens
    Bancárias (já agrupados por DH, como `repositorio_ordens_bancarias.
    ordens_bancarias_por_dh` devolve), por DH.

    Função pura, sem I/O — quem lê as duas fontes é sempre a camada
    `app/consulta/`. Nenhuma linha de nenhum dos dois lados é descartada,
    somada ou escolhida em detrimento de outra: a saída é sempre a lista
    completa que cada fonte já tinha para aquele DH."""
    controle_por_dh = _agrupar_controle_por_dh(diarias_controle)
    todos_os_dh = set(controle_por_dh) | set(ordens_por_dh)

    documentos = {
        dh: DocumentoHabil(
            dh=dh,
            controle=controle_por_dh.get(dh, []),
            ordens_bancarias=ordens_por_dh.get(dh, []),
        )
        for dh in todos_os_dh
    }
    return ResultadoReconciliacao(documentos=documentos)
