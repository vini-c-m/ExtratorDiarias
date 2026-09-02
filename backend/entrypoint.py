"""Sprint 08 — ponto de entrada usado apenas pelo build empacotado
(PyInstaller). Não é o fluxo de desenvolvimento (que continua chamando
`python -m uvicorn app.main:app` via o `.venv`, inalterado) — existe só
porque o PyInstaller precisa de um script Python "de verdade" para analisar
estaticamente, e não de uma invocação via `-m`. Mesmo host/porta já usados
em `frontend/electron/main.ts` (`BACKEND_PORT`) e
`frontend/src/services/api.ts` (`BACKEND_URL`).

QA Codex (defesa em profundidade, NÃO a correção de concorrência em si —
essa é `filelock.FileLock` nos módulos de persistência; ver
`app/consulta/persistencia_decisoes.py`) — `workers=1` explícito. Sem isso,
`uvicorn.Config` ainda leria um `WEB_CONCURRENCY` herdado do ambiente
(`if workers is None and "WEB_CONCURRENCY" in os.environ`); como `app`
aqui é o objeto FastAPI ao vivo (não uma string de import), o Uvicorn hoje
recusa `workers>1` nesse caso e encerra o processo (`sys.exit(1)`) — um
acidente de implementação, não uma proteção deliberada, que deixaria de
existir se este arquivo um dia passasse a usar `uvicorn.run("app.main:app",
...)`. `workers=1` explícito faz `Config` ignorar `WEB_CONCURRENCY` por
completo, robusto a esse tipo de mudança futura."""

import uvicorn

from app.main import app

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8756, log_level="info", workers=1)
