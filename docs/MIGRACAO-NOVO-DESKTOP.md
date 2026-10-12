# Migração para um novo desktop

Guia curto e objetivo para continuar o desenvolvimento do Automatizador de Diárias numa máquina nova, a partir do repositório GitHub (`vini-c-m/ExtratorDiarias`). Não cobre o instalador final (`.exe`/NSIS) — isso é `frontend/release`, documentado no `README.md` raiz (seção "Gerar o instalador Windows").

## A. Pré-requisitos

- **Git** — para clonar e continuar versionando.
- **Python 3.12** — o backend foi desenvolvido e testado nessa versão (`backend/.venv` atual usa 3.12.5). Baixe em [python.org](https://www.python.org/downloads/) e marque "Add python.exe to PATH" na instalação (Windows).
- **Node.js 20+** — frontend/Electron (ambiente atual usa Node 24; qualquer 20+ funciona). Inclui `npm`.
- **VS Code** (ou outro editor) — opcional, mas é o editor usado no desenvolvimento até aqui.
- **Claude Code**, se for continuar usando assistência de IA no fluxo — `npm install -g @anthropic-ai/claude-code` (requer Node já instalado) ou via instalador nativo, ver [docs oficiais](https://docs.claude.com/claude-code).
- **Windows** — o app final (instalador) é Windows-only (NSIS); em desenvolvimento (`npm run dev`) roda em qualquer SO com Electron, mas o projeto foi construído e testado majoritariamente em Windows (caminhos com `\`, scripts `.venv\Scripts\...`).

Não é necessário instalar Excel — todo acesso à planilha oficial é via `openpyxl` (leitura/escrita direta do `.xlsx`).

## B. Clone

```bash
git clone https://github.com/vini-c-m/ExtratorDiarias.git
cd ExtratorDiarias
```

- O repositório é **privado**: na primeira operação o Git for Windows abre o Git Credential Manager para você entrar na conta GitHub com acesso ao repositório.
- Os finais de linha são tratados pelo `.gitattributes`; o padrão do Git for Windows (`core.autocrlf=true`) funciona — a suíte de testes completa foi validada num clone com esse padrão.

## C. Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
# só para gerar o instalador (npm run release): dependências de empacotamento
.venv\Scripts\pip install -r requirements-build.txt
```

- Python: **3.12** (ver acima).
- Dependências de runtime: `backend/requirements.txt` (FastAPI, Uvicorn, pdfplumber, PyMuPDF, openpyxl, reportlab, pytest, httpx). Não há dependências de desenvolvimento adicionais no momento (`backend/requirements-dev.txt` está vazio).
- Comando de execução (manual, para depurar o backend isolado):
  ```bash
  .venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8756
  ```
- **Porta: `8756`** (fixa — `BACKEND_PORT` em `frontend/electron/main.ts`, e `BACKEND_URL` em `frontend/src/services/api.ts`). Em uso normal (`npm run dev`), o Electron sobe esse processo sozinho a partir do `.venv` — não é preciso rodar o comando acima manualmente.

## D. Frontend/Electron

```bash
cd frontend
npm ci
```

- Use `npm ci` (instala exatamente o `package-lock.json`). Versões novas do npm (11.x) podem avisar `allow-scripts` para `electron` e `esbuild`; é só um aviso — os binários são instalados normalmente.

- **Rodar em desenvolvimento** (Vite + build do Electron em watch + app, que já sobe o backend automaticamente):
  ```bash
  npm run dev
  ```
- **Build de produção** (sem empacotar instalador):
  ```bash
  npm run build
  ```
- **Gerar o instalador Windows** (empacota o backend com PyInstaller + build do frontend + NSIS):
  ```bash
  npm run release
  ```

## E. Arquivos locais NÃO versionados

Nada disto está no Git — precisa ser configurado/reconstruído manualmente em cada máquina:

- **Planilha Oficial** (`CONTROLE DIÁRIAS MEMBROS e SERVIDORES - Banco de Dados 2026.xlsx` ou equivalente) — é um arquivo local do usuário, fora do repositório. Na primeira execução, o app pede o caminho via tela de Configuração Inicial (ou "Alterar Planilha Oficial" depois).
- **PDFs dos processos SEI** — também locais, selecionados pelo usuário na tela de Processamento a cada lote. Não há PDFs reais no repositório (só fixtures 100% sintéticas em `backend/tests/fixtures/`).
- **Configuração local** — `%APPDATA%\ExtratorDiarias\configuracao.json` (Windows). Guarda o caminho da Planilha Oficial configurada e um fingerprint estrutural (abas + hash do cabeçalho) usado para detectar se a planilha mudou de estrutura. Não existe até a primeira configuração ser feita pelo app — nunca copie esse arquivo de outra máquina, deixe o app recriar (o fingerprint precisa bater com a planilha real desta máquina).
- **Base Local / SQLite e a cópia Excel de consulta** — também em `%APPDATA%\ExtratorDiarias\`, geradas por sincronização automática a partir da Planilha Oficial (a cada processamento bem-sucedido, ou manualmente via "Sincronizar" na Central Analítica). **Prefira sempre deixar o app reconstruir** (Sincronizar) em vez de copiar esses arquivos de outra máquina — são derivados, nunca fonte de verdade, e um fingerprint desatualizado é rejeitado.
- **`node_modules/`, `.venv/`** — reinstalados pelos comandos das seções C/D, nunca copiados entre máquinas.

## F. Primeira execução

Ordem recomendada:

1. Clonar o repositório (seção B).
2. Instalar o backend (seção C).
3. Instalar o frontend (seção D).
4. Executar o app: `npm run dev` (a partir de `frontend/`).
5. Configurar o caminho da Planilha Oficial na tela de Configuração Inicial.
6. Sincronizar/reconstruir a Base Local (automático no primeiro processamento, ou botão "Sincronizar" na Central Analítica).
7. Testar a **Central Analítica** (Dashboard, Pesquisa, Relatórios).
8. Testar a **Central de Conferência** (CPF + período → diagnóstico).
9. Testar o **processamento normal** (selecionar PDFs → preencher planilha).
10. Testar o **Complemento de Diárias**.
11. Testar o **cadastro de servidor/membro** pela Central de Conferência (CPF não localizado → "Cadastrar servidor/membro").

## G. Checklist de sanidade

- [ ] Backend responde: `GET http://127.0.0.1:8756/health` → `{"status": "ok"}`.
- [ ] Electron abre a janela do app sem erro no console.
- [ ] Planilha Oficial configurada é encontrada (`GET /api/v1/configuracao` mostra `configurado: true`, `planilha_acessivel: true`).
- [ ] Base Local sincroniza sem erro (Central Analítica mostra dados após sincronizar).
- [ ] Processamento normal: um PDF de exemplo é extraído e preenche a planilha.
- [ ] Complemento de Diárias: fluxo de continuidade processual funciona.
- [ ] Central Analítica: Dashboard, pesquisa e ao menos um relatório exportado.
- [ ] Central de Conferência: diagnóstico completo para um CPF existente.
- [ ] Cadastro pela Conferência: CPF não localizado → modal abre, salva, reconsulta automaticamente.

### Testes (opcional, mas recomendado após qualquer mudança)

```bash
# Backend
cd backend && .venv\Scripts\python.exe -m pytest -q

# Frontend
cd frontend && npm run typecheck && npx vitest run
```
