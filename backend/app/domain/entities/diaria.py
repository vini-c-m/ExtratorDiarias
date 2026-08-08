from dataclasses import dataclass
from datetime import date

from app.domain.entities.fonte_transporte import FonteTransporte
from app.domain.entities.tipo_processo import TipoProcesso


@dataclass(frozen=True)
class Diaria:
    """Entidade de negócio validada — só existe depois que os campos obrigatórios
    foram encontrados e as datas do período foram reconhecidas como datas reais."""

    sei: str
    doc_origem: str
    cpf: str
    periodo_inicial: date
    periodo_final: date
    cidade_origem: str
    cidade_destino: str
    motivo: str
    documento_habil: str | None = None
    transporte: str | None = None
    estado_destino: str | None = None
    tipo_processo: TipoProcesso = TipoProcesso.PADRAO
    # Só preenchido para tipo_processo == DIARIA_MEMBRO — valor bruto
    # extraído do despacho GABPGJ (ex.: "652,96"), coluna P na planilha.
    valor_total_diarias: str | None = None
    # None quando transporte também é None (nem evidência nem regra
    # resolveram) — ver `enriquecimento/transporte_regra_operacional.py`.
    transporte_fonte: FonteTransporte | None = None
    # Só resolvido em ModoProcessamento.COMPLEMENTO (ver
    # `enriquecimento/quantidade_complementar.py`), coluna O na planilha.
    # Padrão institucional: 0 (rotina real da CMFC — complemento é, em
    # regra, só de diárias integrais); só maior que 0 com evidência
    # documental explícita e inequívoca de parcial complementar. Nunca
    # inferido pelas datas. `None` no modo Padrão (coluna nunca escrita).
    quantidade_diaria_parcial_complementar: int | None = None
    # Texto explicando a origem do valor acima — documento que comprovou a
    # parcial, ou "padrão institucional" quando não há evidência. Nunca um
    # score/probabilidade.
    fonte_quantidade_complementar: str | None = None
