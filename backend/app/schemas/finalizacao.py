from datetime import date

from pydantic import BaseModel


class RequisicaoAnaliseFinalizacao(BaseModel):
    arquivos: list[str]


class AvaliacaoElegibilidadeResposta(BaseModel):
    confirmacao_encontrada: bool
    confirmacao_valida: bool
    comprovante_encontrado: bool
    # "encontrado" | "pendente" | "ausente".
    situacao_comprovante: str
    ordem_bancaria_encontrada: bool
    apto: bool
    pendente_analitico: bool = False
    # Regra definitiva (Sprint pré-build, 2026-08-11) — avisos informativos,
    # nunca bloqueantes; vazio quando não há nada a revisar.
    alertas: list[str] = []


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
    # Organização Automática de PDFs — caminho absoluto de origem, para o
    # organizador conseguir excluir o PDF depois de finalizado/já
    # confirmado. `None` quando o cliente não tem o caminho absoluto
    # disponível (nunca bloqueia a confirmação em si).
    caminho_absoluto: str | None = None


class RequisicaoConfirmacaoFinalizacao(BaseModel):
    itens: list[ItemParaConfirmar]


class OrganizacaoItemResposta(BaseModel):
    """Organização Automática de PDFs — resultado aditivo, paralelo à
    `categoria` acima: uma falha aqui nunca torna uma confirmação já
    gravada em "não confirmada". `status` é o valor de
    `app.planilha.organizador_arquivos.StatusOrganizacao`."""

    sucesso: bool
    status: str
    detalhe: str | None = None


class ItemResultadoConfirmacaoResposta(BaseModel):
    arquivo_origem: str
    sei: str
    categoria: str
    linhas_atualizadas: list[int]
    linhas_mantidas: list[int]
    motivo: str | None
    # Só populado para FINALIZADO/JA_CONFIRMADO com `caminho_absoluto`
    # informado; `None` para IGNORADO (nunca tentado).
    organizacao: OrganizacaoItemResposta | None = None


class RespostaConfirmacaoFinalizacao(BaseModel):
    total_finalizado: int
    # Sprint pré-build, 2026-08-11 — "já estava SIM/SIM", NO-OP; nunca
    # somado a `total_ignorado` (bloqueios reais).
    total_ja_confirmado: int = 0
    total_ignorado: int
    itens: list[ItemResultadoConfirmacaoResposta]
    # ETAPA 3 (Auditoria P0, 2026-08-09) — mesmo campo de
    # `ResultadoPreenchimentoResposta` (ETAPA 2): a confirmação em si
    # nunca é invalidada por uma falha de sincronização da Central
    # Analítica; este campo só expõe esse estado. Default `False` —
    # nenhum consumidor existente da resposta precisa mudar.
    sincronizacao_analitica_falhou: bool = False
