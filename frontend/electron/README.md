# electron/

Processo main do Electron. Nenhuma regra de negócio aqui.

- `main.ts` — cria a janela do app, sobe o backend FastAPI como subprocesso, aguarda `/health`, derruba o backend ao fechar
- `preload.ts` — ponte segura entre o processo main e o React (`contextBridge`)
- `ipc/` — diálogos nativos: selecionar PDFs/pasta, salvar planilha
