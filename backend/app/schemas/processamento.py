from datetime import date

from pydantic import BaseModel

from app.domain.entities.fonte_transporte import FonteTransporte
from app.domain.entities.tipo_processo import TipoProcesso


class RequisicaoProcessamento(BaseModel):
    arquivos: list[str]


class DiariaResposta(BaseModel):
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
    valor_total_diarias: str | None = None
    transporte_fonte: FonteTransporte | None = None


class ErroExtracaoResposta(BaseModel):
    motivos: list[str]


class ProcessoResposta(BaseModel):
    id: str
    arquivo_origem: str
    status: str
    diaria: DiariaResposta | None = None
    erro: ErroExtracaoResposta | None = None
    avisos: list[str] = []


class LoteProcessamentoResposta(BaseModel):
    id: str
    total: int
    sucesso: int
    erro: int
    processos: list[ProcessoResposta]
