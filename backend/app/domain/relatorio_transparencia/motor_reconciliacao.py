"""Micro-sprint 2/3 — reconciliação mínima entre Controle DIMCAC e Base de
Ordens Bancárias, focada exclusivamente em preservar a granularidade
DH/OB. Nenhuma regra financeira/descritiva (R01, R02, R05, R06, R07, R09)
é aplicada aqui — isso é responsabilidade de uma Micro-sprint futura, uma
vez que a associação em si esteja provada correta.

Caso de regressão obrigatório (padrão real recorrente na auditoria — DH com
pagamento fracionado em parcela principal + saldo, identificadores
fictícios abaixo): `2026DH900001` → `2026OB900001` + `2026OB900002`. As
duas OBs precisam sobreviver à reconciliação, nunca uma delas some por
deduplicação ingênua.

Micro-sprint 3: `controle_por_dh` passa a vir já agrupado por DH — a
mesma forma que `ordens_por_dh` sempre teve —, produzido por
`app/consulta/repositorio_controle_dimcac.controle_dimcac_por_dh`, não
mais por `repositorio_diarias.diarias_completas` (indexado por SEI, que
descartava linhas com SEI repetido — achado real, 13 DHs perdidos). Esta
função não agrupa mais nada por conta própria: só une as duas fontes."""

from dataclasses import dataclass, field

from app.domain.entities.ordem_bancaria import OrdemBancaria
from app.domain.entities.registro_controle import RegistroControle
from app.domain.relatorio_transparencia.entidades import DocumentoHabil

__all__ = ["ResultadoReconciliacao", "reconciliar"]


@dataclass(frozen=True)
class ResultadoReconciliacao:
    """Um `DocumentoHabil` por DH que aparece em pelo menos uma das duas
    fontes — união, nunca interseção: um DH só no Controle (ainda não pago)
    ou só na Base OB (achado a investigar por uma regra futura) continua
    representado, com o lado ausente como lista vazia."""

    documentos: dict[str, DocumentoHabil] = field(default_factory=dict)


def reconciliar(
    controle_por_dh: dict[str, list[RegistroControle]],
    ordens_por_dh: dict[str, list[OrdemBancaria]],
) -> ResultadoReconciliacao:
    """Associa os registros do Controle DIMCAC aos da Base de Ordens
    Bancárias, por DH — ambos já agrupados por DH por quem lê (`app/
    consulta/repositorio_controle_dimcac.controle_dimcac_por_dh` e
    `app/consulta/repositorio_ordens_bancarias.ordens_bancarias_por_dh`,
    respectivamente).

    Função pura, sem I/O — quem lê as duas fontes é sempre a camada
    `app/consulta/`. Nenhuma linha de nenhum dos dois lados é descartada,
    somada ou escolhida em detrimento de outra: a saída é sempre a lista
    completa que cada fonte já tinha para aquele DH."""
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
