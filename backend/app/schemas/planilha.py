from pydantic import BaseModel

from app.schemas.processamento import DiariaResposta


class ItemParaPreencher(BaseModel):
    arquivo_origem: str
    diaria: DiariaResposta


class ItemErroResposta(BaseModel):
    arquivo_origem: str
    motivos: list[str]


class ItemAvisoResposta(BaseModel):
    arquivo_origem: str
    mensagens: list[str]


class RequisicaoPreenchimento(BaseModel):
    # Sprint 15 — Configuração Inicial da Planilha Oficial: o caminho de
    # destino deixou de vir do cliente (não existe mais seleção manual por
    # execução). O backend resolve sozinho, a partir da configuração já
    # validada (`app/infra/config/configuracao_app.resolver_caminho_para_preenchimento`),
    # e é a única autoridade sobre esse caminho — ver `app/api/planilha.py`.
    itens: list[ItemParaPreencher]
    erros: list[ItemErroResposta] = []
    avisos: list[ItemAvisoResposta] = []
    # Sprint 05.1 — só para exibir "Tempo de processamento" no resumo
    # executivo do relatório HTML; não influencia nenhuma regra de negócio.
    tempo_processamento_ms: int | None = None


class ItemResultadoResposta(BaseModel):
    arquivo_origem: str
    sei: str
    categoria: str
    linha: int | None = None


class ResultadoPreenchimentoResposta(BaseModel):
    total_gravado: int
    duplicadas_ignoradas: int
    linha_inicial: int
    linha_final: int
    itens: list[ItemResultadoResposta]
    pasta_resultados: str
    caminho_planilha_gerada: str
    caminho_relatorio: str
    caminho_log: str
