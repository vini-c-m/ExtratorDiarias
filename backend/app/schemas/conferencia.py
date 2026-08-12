from datetime import date
from decimal import Decimal
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


# Micro-sprint A ("Valor Automático da Diária na Central de Conferência") —
# RN-05, homologada por auditoria financeira real (2026-08-12).
SituacaoValorDiariaResposta = Literal[
    "calculado", "indisponivel_para_categoria", "uf_nao_resolvida", "uf_fora_da_tabela"
]
CategoriaFuncionalResposta = Literal["MEMBRO", "SERVIDOR", "NAO_IDENTIFICADO"]


class RequisicaoValorDiaria(BaseModel):
    cpf: str
    periodo_inicial: date
    periodo_final: date
    # Mesmo campo, mesmo texto livre já digitado em `RequisicaoHistorico.destino`
    # — a resolução de UF (`identificar_estado_destino`) nunca recebe um
    # segundo campo de entrada geográfica.
    destino: str
    # Preenchido pelo frontend só depois de um retorno anterior
    # `"uf_nao_resolvida"`/`"uf_fora_da_tabela"` — decisão humana explícita,
    # nunca uma escolha automática do sistema (RN-08/RN-11).
    uf_confirmada: str | None = None
    modo: ModoConferenciaRequisicao = "PADRAO"
    # RN-16 — mesmo contrato de `RequisicaoHistorico.quantidade_diaria_parcial`:
    # só usado no modo Complemento; ignorado (sempre 1, RN-04) no modo Padrão.
    quantidade_diaria_parcial: int | None = None

    @model_validator(mode="after")
    def _validar(self) -> "RequisicaoValorDiaria":
        if self.periodo_final < self.periodo_inicial:
            raise ValueError("Período final não pode ser anterior ao período inicial.")
        if not self.destino.strip():
            raise ValueError("Destino é obrigatório para calcular o valor da diária.")
        return self


class RespostaValorDiaria(BaseModel):
    situacao: SituacaoValorDiariaResposta
    categoria_funcional: CategoriaFuncionalResposta
    uf_destino: str | None = None
    valor_integral: Decimal | None = None
    valor_parcial: Decimal | None = None
    valor_total: Decimal | None = None
    motivo: str | None = None
    # Só populado quando `situacao` é `"uf_nao_resolvida"` ou
    # `"uf_fora_da_tabela"` — as UFs/regiões que a Tabela Valores oficial
    # tem agora, para a UI oferecer confirmação manual sem depender de um
    # segundo catálogo geográfico no frontend.
    ufs_disponiveis: list[str] | None = None
