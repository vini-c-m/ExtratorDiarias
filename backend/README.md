# backend/ (FastAPI local)

Serviço Python que o Electron sobe como subprocesso. Organizado em camadas — a regra de dependência é sempre de fora para dentro (`api` → `services` → `domain`), nunca o contrário.

- `app/api/` — rotas HTTP, só traduz HTTP ⇄ DTO, zero regra de negócio (processamento, planilha, conferência, analítica, configuração, saúde)
- `app/services/` — orquestra os casos de uso (ex.: processar um lote inteiro, calcular indicadores de um recorte)
- `app/domain/` — entidades e regras de negócio puras, zero I/O (sem FastAPI, sem openpyxl, sem SQL); inclui `domain/analitica/` (indicadores, distribuições, diagnóstico da Central Analítica)
- `app/extraction/` — leitura de PDF (pdfplumber/PyMuPDF) e parsers do layout do SEI (Strategy Pattern)
- `app/consulta/` — sincronização e leitura somente-leitura das Bases Locais de Consulta (Excel para a Central de Conferência, SQLite para a Central Analítica); nunca escreve na planilha oficial
- `app/planilha/` — escrita no `.xlsx` oficial e geração do relatório HTML
- `app/infra/` — detalhe técnico trocável: configuração, log, esquema/conexão SQLite (`infra/db/`)
- `app/schemas/` — contratos Pydantic expostos pela API
- `app/events/` — barramento de progresso (SSE) — planejado, ainda não implementado
- `tests/` — unit (domínio/extração isolados), integration (API + arquivos reais), fixtures (PDFs de exemplo para teste)
