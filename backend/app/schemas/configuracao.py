from pydantic import BaseModel


class RequisicaoConfiguracao(BaseModel):
    caminho_planilha_oficial: str
