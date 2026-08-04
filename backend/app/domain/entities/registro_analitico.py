from dataclasses import dataclass
from datetime import date

from app.domain.entities.servidor import Servidor


@dataclass(frozen=True)
class RegistroAnalitico:
    """Uma diária lida de volta da Base Local em SQLite (Sprint 17.3) para
    a Central Analítica — entidade de negócio reutilizável (pesquisa,
    detalhamento), no mesmo espírito de `Diaria`/`Servidor` já existentes.

    `servidor` reaproveita a entidade `Servidor` já existente, montada a
    partir dos campos `servidor_*` denormalizados da linha; é `None`
    quando o CPF da diária não tem cadastro em `Dados` (situação real já
    documentada, RN-01) — nunca um `Servidor` com todos os campos vazios.

    `linha_planilha` é só diagnóstico (decisão 8,
    `docs/central-analitica/README.md § 0.1`) — nunca usado como chave em
    nenhuma consulta.

    `dh` (Sprint 19.8.1 — peça final pendente da 19.5.1: a coluna `dh` já
    existia no esquema SQLite e já era gravada por `base_local_sqlite.
    reconstruir()` desde aquela Sprint, só faltava chegar até aqui) — vazio
    é uma condição conhecida, não um dado malformado (mesma nota já
    registrada em `RegistroDiariaIndexada.dh`, `docs/central-conferencia/
    README.md § 2.1`); `default=None` para não quebrar nenhum ponto de
    construção já existente desta classe (dezenas de `RegistroAnalitico(...)`
    em testes já homologados, nenhum deles passa `dh`)."""

    sei: str
    doc_origem: str
    cpf: str
    periodo_inicial: date
    periodo_final: date
    cidade_origem: str | None
    cidade_destino: str | None
    motivo: str
    transporte: str | None
    valor_total_diarias: float | None
    linha_planilha: int
    servidor: Servidor | None
    dh: str | None = None
