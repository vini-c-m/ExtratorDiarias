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
    caminho_planilha: str
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
