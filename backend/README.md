# backend/ (FastAPI local)

Serviço Python que o Electron sobe como subprocesso. Organizado em camadas — a regra de dependência é sempre de fora para dentro (`api` → `services` → `domain`), nunca o contrário.

- `app/api/` — rotas HTTP, só traduz HTTP ⇄ DTO, zero regra de negócio
- `app/services/` — orquestra os casos de uso (ex.: processar um lote inteiro)
- `app/domain/` — entidades e regras de negócio puras, zero I/O (sem FastAPI, sem openpyxl, sem SQL)
- `app/extraction/` — leitura de PDF (pdfplumber/PyMuPDF) e parsers do layout do SEI (Strategy Pattern)
- `app/infra/` — detalhe técnico trocável: planilha, banco, configuração, log
- `app/schemas/` — contratos Pydantic expostos pela API
- `app/events/` — barramento de progresso (SSE)
- `tests/` — unit (domínio/extração isolados), integration (API + arquivos reais), fixtures (PDFs de exemplo para teste)
