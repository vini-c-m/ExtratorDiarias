# domain/

Núcleo de negócio puro. Não importa FastAPI, openpyxl, SQLAlchemy nem sabe o caminho de nenhum arquivo.

- `entities/` — LoteProcessamento (agregado raiz), Processo, CamposExtraidos, Diaria, ValidacaoResult, ErroExtracao, ResultadoProcessamento
- `value_objects/` — CPF, período, trecho
- `rules/` — transforma CamposExtraidos em Diaria válida ou em ErroExtracao
