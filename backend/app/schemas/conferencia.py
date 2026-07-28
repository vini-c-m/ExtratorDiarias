from datetime import date
from typing import Literal

from pydantic import BaseModel, model_validator

VereditoResposta = Literal["APTO_PARA_PROCESSAMENTO", "REVISAR"]


class RequisicaoConferencia(BaseModel):
    cpf: str
    periodo_inicial: date
    periodo_final: date

    @model_validator(mode="after")
    def _periodo_valido(self) -> "RequisicaoConferencia":
        if self.periodo_final < self.periodo_inicial:
            raise ValueError("Período final não pode ser anterior ao período inicial.")
        return self


class ItemChecklistResposta(BaseModel):
    item: str
    ok: bool
    valor: str | None = None


class ServidorResposta(BaseModel):
    nome: str
    cargo: str
    previdencia: str


class DuplicidadeResposta(BaseModel):
    linha: int
    sei: str
    trecho: str
    periodo_inicial: date
    periodo_final: date


class JanelaProcessamentoResposta(BaseModel):
    liberado: bool
    data_liberacao: date


class ResultadoConferenciaResposta(BaseModel):
    veredito: VereditoResposta
    providencia: str
    checklist: list[ItemChecklistResposta]
    servidor: ServidorResposta | None = None
    duplicidade: DuplicidadeResposta | None = None
    janela_processamento: JanelaProcessamentoResposta


class RequisicaoHistorico(BaseModel):
    cpf: str
    periodo_inicial: date
    periodo_final: date
    # RN-12 — texto livre, nunca normalizado; preservado exatamente como
    # o servidor digitou (pontos, barra, hífen).
    sei: str
    origem: str
    destino: str

    @model_validator(mode="after")
    def _validar(self) -> "RequisicaoHistorico":
        if self.periodo_final < self.periodo_inicial:
            raise ValueError("Período final não pode ser anterior ao período inicial.")
        if not self.sei.strip():
            raise ValueError("Número do SEI é obrigatório.")

        origem = self.origem.strip()
        destino = self.destino.strip()
        if not origem or not destino:
            raise ValueError("Origem e destino são obrigatórios para gerar o histórico.")
        if origem.casefold() == destino.casefold():
            raise ValueError("Origem e destino não podem ser iguais.")
        return self


class RespostaHistorico(BaseModel):
    texto: str
