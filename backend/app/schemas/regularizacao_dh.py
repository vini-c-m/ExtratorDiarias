from datetime import date
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, model_validator

# Micro-sprint B ("Central de Regularização de DH", SOMENTE LEITURA) — espelha
# 1:1 `app/services/regularizacao_dh_service.py`. Mesmos nomes de campo de
# `app/schemas/analitica.py::DocumentoHabilPendenteResposta`, para não criar
# vocabulário paralelo entre as duas Centrais.

SituacaoDocumentoHabilPendenteResposta = str  # "aguardando_liberacao" | "revisao_manual_necessaria"


# Micro-sprint C ("Histórico e-Fisco + Valor") — `valor` é serializado como
# STRING pelo Pydantic (`Decimal`), mesma convenção já homologada em
# `app/schemas/conferencia.py::RespostaValorDiaria` (Micro-sprint A) — o
# mesmo formatador do frontend (`formatarValorDiariaCopiavel`) é reaproveitado
# sem alteração porque o formato de fio é idêntico.
class HistoricoEFiscoResposta(BaseModel):
    situacao: Literal["gerado", "indisponivel"]
    texto: str | None
    motivo: str | None


class ValorDiariaResposta(BaseModel):
    situacao: Literal["disponivel", "indisponivel"]
    valor: Decimal | None
    motivo: str | None


class PeriodoResposta(BaseModel):
    inicial: date
    final: date


class TrechoResposta(BaseModel):
    origem: str | None = None
    destino: str | None = None


class ProcessoAguardandoDHResposta(BaseModel):
    sei: str
    servidor_nome: str | None
    cpf_mascarado: str | None
    categoria_funcional: str
    periodo: PeriodoResposta
    trecho: TrechoResposta
    situacao: SituacaoDocumentoHabilPendenteResposta
    mensagem: str
    data_liberacao_prevista: date
    dias_restantes: int | None
    dias_atraso: int | None
    texto_contagem: str | None


class ListaProcessosAguardandoDHResposta(BaseModel):
    total: int
    processos: list[ProcessoAguardandoDHResposta]


class DetalheProcessoAguardandoDHResposta(BaseModel):
    sei: str
    servidor_nome: str | None
    cpf_mascarado: str | None
    categoria_funcional: str
    periodo: PeriodoResposta
    trecho: TrechoResposta
    # Item 11 D do pedido — `False` é um estado de negócio legítimo (o SEI
    # existe, só não está mais pendente), nunca um erro 404/500.
    ainda_aguardando_dh: bool
    situacao: SituacaoDocumentoHabilPendenteResposta | None
    mensagem: str
    data_liberacao_prevista: date | None
    dias_restantes: int | None
    dias_atraso: int | None
    texto_contagem: str | None
    # Micro-sprint C — independentes entre si (item 13 do pedido); uma
    # falha em qualquer um dos dois nunca esconde o outro nem o resto do
    # detalhe (`situacao == "indisponivel"` acompanhada de `motivo`, nunca
    # um HTTP 4xx/5xx só por causa disso).
    historico: HistoricoEFiscoResposta
    valor: ValorDiariaResposta


# Micro-sprint D ("Escrita Exclusiva do DH") — única rota de escrita desta
# Central. `dh` é texto livre, nunca normalizado além de `.strip()` (mesmo
# tratamento já dado ao SEI em outras Centrais, RN-12-like — o e-Fisco é
# quem define o formato real, o app nunca valida um padrão específico).
SituacaoRegistroDHResposta = Literal["concluido", "salvo_sync_pendente", "nao_salvo"]


class RequisicaoRegistrarDH(BaseModel):
    dh: str

    @model_validator(mode="after")
    def _validar(self) -> "RequisicaoRegistrarDH":
        if not self.dh.strip():
            raise ValueError("Número do Documento Hábil é obrigatório.")
        return self


class RespostaRegistrarDH(BaseModel):
    situacao: SituacaoRegistroDHResposta
    sei: str
    dh: str
    mensagem: str
