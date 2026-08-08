from datetime import date
from typing import Literal

from pydantic import BaseModel, model_validator

VereditoResposta = Literal["APTO_PARA_PROCESSAMENTO", "REVISAR"]
# RN-14 — modo Complemento de Diárias. Mesmo `Literal` espelhando o enum
# `ModoProcessamento` do domínio, no mesmo padrão de `VereditoResposta`
# acima (schema nunca importa um enum de domínio diretamente).
ModoConferenciaRequisicao = Literal["PADRAO", "COMPLEMENTO"]


class RequisicaoConferencia(BaseModel):
    cpf: str
    periodo_inicial: date
    periodo_final: date
    modo: ModoConferenciaRequisicao = "PADRAO"

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
    # Correção de 2026-08-05: Origem deixou de ser pedida nesta etapa — o
    # histórico do e-Fisco usa apenas o destino.
    destino: str
    # RN-16 (2026-08-07) — só usado por POST /conferencia/historico-complemento;
    # ignorado por POST /conferencia/historico (que sempre assume 1, RN-04).
    # `None` vira o padrão institucional (0) no service.
    quantidade_diaria_parcial: int | None = None

    @model_validator(mode="after")
    def _validar(self) -> "RequisicaoHistorico":
        if self.periodo_final < self.periodo_inicial:
            raise ValueError("Período final não pode ser anterior ao período inicial.")
        if not self.sei.strip():
            raise ValueError("Número do SEI é obrigatório.")
        if not self.destino.strip():
            raise ValueError("Destino é obrigatório para gerar o histórico.")
        return self


class RespostaHistorico(BaseModel):
    texto: str


class RequisicaoCandidatosComplemento(BaseModel):
    """Continuidade Processual (modo Complemento de Diárias) — o que se
    sabe sobre o processo de complemento no momento da busca de
    candidatos. `cidade_destino`/`sei`/`texto_processo` são opcionais: a
    Central de Conferência normalmente só tem CPF+período disponíveis
    nesta etapa (o resto vem do que o usuário já digitou, quando digitou)."""

    cpf: str
    periodo_inicial: date
    periodo_final: date
    cidade_destino: str | None = None
    sei: str | None = None
    texto_processo: str = ""

    @model_validator(mode="after")
    def _periodo_valido(self) -> "RequisicaoCandidatosComplemento":
        if self.periodo_final < self.periodo_inicial:
            raise ValueError("Período final não pode ser anterior ao período inicial.")
        return self


class RegistroCandidatoResposta(BaseModel):
    sei: str
    dh: str | None
    periodo_inicial: date
    periodo_final: date
    cidade_origem: str | None
    cidade_destino: str | None
    motivo: str
    valor_total_diarias: float | None
    linha_planilha: int
    servidor_nome: str | None


class CandidatoDiariaOriginalResposta(BaseModel):
    registro: RegistroCandidatoResposta
    evidencias: list[str]


class RespostaCandidatosComplemento(BaseModel):
    candidatos: list[CandidatoDiariaOriginalResposta]
