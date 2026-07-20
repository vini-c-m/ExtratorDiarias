# infra/

Tudo que fala com o mundo externo. Regra de negócio nunca escreve aqui diretamente.

- `excel/` — writer da planilha + localizador do último registro válido (ver ADR-001 em `docs/architecture/`)
- `db/` — SQLite (preparado, não implementado nesta fase — ver regra 9 da arquitetura)
- `config/` — preferências da aplicação
- `logging/` — log técnico estruturado, separado do relatório de negócio
