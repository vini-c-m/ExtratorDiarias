# frontend/ (React + Electron, um único projeto)

Sem versão web independente, então Electron e React vivem no mesmo pacote — um `package.json`, um `vite.config.ts`, um build. A separação de responsabilidade continua existindo, só que por pasta dentro do mesmo projeto, não por sub-projeto:

- **`electron/`** — processo main: ciclo de vida da janela, sobe/derruba o backend FastAPI como subprocesso, diálogos nativos do SO (IPC). É o único lugar que sabe que existe um sistema operacional por baixo.
- **`src/`** — a interface React (renderer). Fala com o backend por HTTP/SSE; não sabe nem precisa saber que roda dentro do Electron.

A fronteira entre os dois é o `preload.ts` (`contextBridge`) — só o que exige SO passa por ali; toda a lógica de negócio do app conversa direto com o FastAPI.
