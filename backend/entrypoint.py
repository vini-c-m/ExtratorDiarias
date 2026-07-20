"""Sprint 08 — ponto de entrada usado apenas pelo build empacotado
(PyInstaller). Não é o fluxo de desenvolvimento (que continua chamando
`python -m uvicorn app.main:app` via o `.venv`, inalterado) — existe só
porque o PyInstaller precisa de um script Python "de verdade" para analisar
estaticamente, e não de uma invocação via `-m`. Mesmo host/porta já usados
em `frontend/electron/main.ts` (`BACKEND_PORT`) e
`frontend/src/services/api.ts` (`BACKEND_URL`)."""

import uvicorn

from app.main import app

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8756, log_level="info")
