from datetime import date

from pydantic import BaseModel


class RequisicaoAnaliseFinalizacao(BaseModel):
    arquivos: list[str]


class AvaliacaoElegibilidadeResposta(BaseModel):
    confirmacao_encontrada: bool
    confirmacao_valida: bool
    comprovante_encontrado: bool
    ordem_bancaria_encontrada: bool
    apto: bool


class CandidatoLinhaResposta(BaseModel):
    linha: int
    cpf: str | None
    periodo_inicial: date | None
    periodo_final: date | None
    trecho: str | None
    dh: str | None
    aviso: str | None
    x_atual: str | None
    y_atual: str | None
    estado: str


class ItemAnaliseFinalizacaoResposta(BaseModel):
    arquivo_origem: str
    sei: str | None
    status: str
    motivo: str | None
    avaliacao: AvaliacaoElegibilidadeResposta | None
    candidatos: list[CandidatoLinhaResposta]


class RespostaAnaliseFinalizacao(BaseModel):
    itens: list[ItemAnaliseFinalizacaoResposta]


class ItemParaConfirmar(BaseModel):
    arquivo_origem: str
    sei: str


class RequisicaoConfirmacaoFinalizacao(BaseModel):
    itens: list[ItemParaConfirmar]


class ItemResultadoConfirmacaoResposta(BaseModel):
    arquivo_origem: str
    sei: str
    categoria: str
    linhas_atualizadas: list[int]
    linhas_mantidas: list[int]
    motivo: str | None


class RespostaConfirmacaoFinalizacao(BaseModel):
    total_finalizado: int
    total_ignorado: int
    itens: list[ItemResultadoConfirmacaoResposta]
