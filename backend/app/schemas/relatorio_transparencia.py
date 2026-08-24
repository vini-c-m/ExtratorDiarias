from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator

# Micro-sprint 3D — espelha 1:1 `app/services/relatorio_transparencia_service.py`.
# Mesma filosofia de `app/schemas/regularizacao_dh.py`: schemas nunca reimportam
# tipos de domínio diretamente (RN01-RN07/decisão continuam responsabilidade
# exclusiva de `app/domain/relatorio_transparencia/`), só espelham o formato
# já resolvido pelo service. Convenção de `ParametrosXxxQuery` para GET
# (`Annotated[..., Query()]`) reaproveitada de `app/schemas/analitica.py`.


class ParametrosRelatorioBase(BaseModel):
    """Entrada compartilhada por todas as operações — nenhuma delas lê
    estado de uma preparação anterior; toda chamada informa de novo onde
    estão as fontes e a persistência de decisões (item 9 da especificação:
    reconstruir sempre, nunca cache)."""

    caminho_base_ordens_bancarias: str
    caminho_controle_dimcac: str
    ano_exercicio: int
    mes_referencia: int = Field(ge=1, le=12)
    caminho_decisoes: str


class ParametrosRelatorioQuery(ParametrosRelatorioBase):
    """`GET /revisoes` — mesmos campos de `ParametrosRelatorioBase`, via
    query string."""


class RequisicaoPrepararRelatorio(ParametrosRelatorioBase):
    """`POST /preparar` — corpo JSON."""


class OcorrenciaResposta(BaseModel):
    ob: str
    dh: str
    beneficiario: str | None
    sei: str | None
    data_ob: datetime | None
    periodo_inicial: date | None
    periodo_final: date | None
    trecho: str | None
    valor: float | None
    motivo: str | None
    restituicao: float | None


class RevisaoResposta(BaseModel):
    identidade_grupo: str
    regra: str
    estado: Literal["pendente", "decidida", "adiada", "desatualizada"]
    explicacao: str
    campos_iguais: list[str]
    campos_diferentes: list[str]
    ocorrencias: list[OcorrenciaResposta]


class ResumoRelatorioResposta(BaseModel):
    total_candidatos_normais: int
    total_revisoes: int
    total_pendentes: int
    total_decididas: int
    total_adiadas: int
    total_desatualizadas: int
    total_ocorrencias_nao_publicaveis: int
    pode_gerar_relatorio: bool
    revisoes: list[RevisaoResposta]


class ListaRevisoesResposta(BaseModel):
    total: int
    revisoes: list[RevisaoResposta]


class RequisicaoRegistrarDecisao(ParametrosRelatorioBase):
    acao: Literal["publicar", "adiar"]
    obs_selecionadas: list[str] = []
    autor: str
    observacao: str | None = None

    @model_validator(mode="after")
    def _validar(self) -> "RequisicaoRegistrarDecisao":
        if not self.autor.strip():
            raise ValueError("Autor da decisão é obrigatório.")
        if self.acao == "adiar" and self.obs_selecionadas:
            raise ValueError("ADIAR não aceita OBs selecionadas.")
        return self
