from pydantic import BaseModel


class RequisicaoConfiguracao(BaseModel):
    caminho_planilha_oficial: str


# Organização Automática de PDFs — todos opcionais: cada "Selecionar pasta"
# de `SecaoPastasOperacionais.tsx` chama esta rota individualmente, então
# uma requisição normalmente só traz um campo preenchido. Os demais, já
# configurados antes, são preservados por
# `configuracao_app.persistir_pastas_operacionais`.
class RequisicaoPastasOperacionais(BaseModel):
    caminho_pdfs_a_processar: str | None = None
    caminho_pdfs_complemento_a_processar: str | None = None
    caminho_pdfs_processados: str | None = None
    caminho_pdfs_diarias_a_confirmar: str | None = None
