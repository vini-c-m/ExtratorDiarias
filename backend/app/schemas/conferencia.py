from datetime import date
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field, model_validator

VereditoResposta = Literal["APTO_PARA_PROCESSAMENTO", "REVISAR"]
# RN-14 — modo Complemento de Diárias. Mesmo `Literal` espelhando o enum
# `ModoProcessamento` do domínio, no mesmo padrão de `VereditoResposta`
# acima (schema nunca importa um enum de domínio diretamente).
ModoConferenciaRequisicao = Literal["PADRAO", "COMPLEMENTO"]
# Espelha 1:1 `CategoriaFuncional` de `app.domain.analitica.categoria_funcional`
# (schema nunca importa um Literal de domínio diretamente, mesmo padrão dos
# dois acima). Definido aqui, antes de `ServidorResposta`, para que a Etapa 1
# (`POST /conferencia`) também possa expor a categoria já classificada —
# histórico movido para cima nesta melhoria (Histórico e-Fisco de Membro);
# usado também mais abaixo por `RespostaValorDiaria` (Micro-sprint A).
CategoriaFuncionalResposta = Literal["MEMBRO", "SERVIDOR", "NAO_IDENTIFICADO"]


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
    # Histórico e-Fisco de Membro — classificação já existente
    # (`classificar_categoria_funcional`), exposta na Etapa 1 para o
    # frontend decidir, antes do clique em "Gerar Histórico", se exibe os
    # campos manuais de Integrais/Parcial. Independente do endpoint de Valor
    # (Micro-sprint A) — os dois recursos continuam desacoplados. Opcional
    # (`None` por padrão): `ServidorResposta` também é usado por
    # `app/api/cadastro_dados.py` (Cadastro de Servidor/Membro, fora do
    # escopo desta melhoria), que não popula este campo — obrigatório
    # quebraria aquele endpoint sem necessidade.
    categoria_funcional: CategoriaFuncionalResposta | None = None


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
    # Histórico e-Fisco de Membro — só relevante quando a categoria funcional
    # do CPF consultado é MEMBRO (classificada no service, que também exige
    # os dois campos juntos e soma >= 1 nesse caso); ignorados para
    # SERVIDOR/NAO_IDENTIFICADO. Compartilhados pelas duas rotas
    # (`/conferencia/historico` e `/conferencia/historico-complemento`),
    # mesmo padrão de `quantidade_diaria_parcial` acima. `ge=0`/`Literal[0, 1]`
    # só validam o formato — a obrigatoriedade condicional à categoria e a
    # soma mínima ficam no service (dependem de I/O na Base Local).
    quantidade_diaria_integral_membro: int | None = Field(default=None, ge=0)
    quantidade_diaria_parcial_membro: Literal[0, 1] | None = None

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
# `CategoriaFuncionalResposta` usada abaixo está definida no topo do arquivo
# (movida nesta melhoria — Histórico e-Fisco de Membro — para também ser
# usada por `ServidorResposta`).
SituacaoValorDiariaResposta = Literal[
    "calculado", "indisponivel_para_categoria", "uf_nao_resolvida", "uf_fora_da_tabela"
]


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
