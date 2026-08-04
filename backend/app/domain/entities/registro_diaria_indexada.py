from dataclasses import dataclass
from datetime import date


@dataclass(frozen=True)
class RegistroDiariaIndexada:
    """Uma linha de `Controle de Diárias` lida para a reconstrução da Base
    Local em SQLite (Sprint 17.3) — projeção de leitura própria, achatada,
    não um reaproveitamento de `Diaria` (`app/domain/entities/diaria.py`).

    `Diaria` se autodocumenta como entidade de negócio validada, com
    `cidade_origem`/`cidade_destino` obrigatórios; forçar `None` nesses
    campos para representar uma linha histórica com "trecho" malformado
    contradiria esse contrato. Aqui, `cidade_origem`/`cidade_destino` e
    `transporte`/`valor_total_diarias` são deliberadamente opcionais —
    representam dado histórico legível, mas nem sempre plenamente
    estruturado (ex.: trecho sem o separador `" - "` que o próprio sistema
    sempre usa ao gravar, `app/planilha/escritor_planilha.py:287`).

    `linha` é só diagnóstico (localizar a linha na planilha), nunca chave —
    a chave de negócio de uma diária é `sei` (decisão 8,
    `docs/central-analitica/README.md § 0.1`).

    `dh` (Documento Hábil, coluna `A`) vazio é uma condição conhecida, não
    um dado malformado — processo que ainda não chegou à fase de
    liquidação (`docs/central-conferencia/README.md` § 2.1,
    `test_documento_habil.py::test_processo_sem_nota_de_liquidacao_fica_sem_dh`).
    Tem `default=None` para não quebrar nenhum outro ponto de construção
    já existente desta classe fora de `repositorio_diarias.diarias_completas`."""

    linha: int
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
    dh: str | None = None
