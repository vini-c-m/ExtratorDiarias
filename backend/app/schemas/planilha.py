from pydantic import BaseModel

from app.schemas.processamento import DiariaResposta, ModoProcessamentoRequisicao


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
    # RN-14 — precisa ser o mesmo modo usado no `/api/v1/processamento`
    # que gerou estes itens (o cliente é responsável por manter os dois
    # em sincronia; o backend não guarda estado entre as duas chamadas).
    modo: ModoProcessamentoRequisicao = "PADRAO"


class ItemResultadoResposta(BaseModel):
    arquivo_origem: str
    sei: str
    categoria: str
    linha: int | None = None
    # RN-14 — só populado no modo Complemento, quando este SEI já existia
    # (na planilha ou mais cedo no lote); ver `ItemResultado.sei_ja_existente_em_linha`.
    sei_ja_existente_em_linha: int | None = None


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
    # ETAPA 2 (Auditoria P0, 2026-08-09) — gravação da Planilha (tudo acima)
    # e sincronização da Central Analítica são resultados distintos: este
    # campo nunca torna `total_gravado`/`itens` inválidos, só expõe que a
    # Base Local em SQLite pode não refletir esta gravação ainda. Default
    # `False` — nenhum consumidor existente da resposta precisa mudar
    # (nenhuma UI nova nesta etapa).
    sincronizacao_analitica_falhou: bool = False
