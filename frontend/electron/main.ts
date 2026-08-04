import { app, BrowserWindow } from "electron";
import { spawn, ChildProcessWithoutNullStreams } from "child_process";
import * as path from "path";
import { registrarIpcClipboard } from "./ipc/clipboard";
import { registrarIpcConferencia } from "./ipc/conferencia";
import { registrarIpcConfiguracao } from "./ipc/configuracao";
import { registrarIpcPlanilha } from "./ipc/planilha";
import { registrarIpcRelatorio } from "./ipc/relatorio";

const BACKEND_PORT = 8756;
const BACKEND_DIR = path.join(__dirname, "..", "..", "backend");

// Sprint 08 — precisa bater com `build.appId` em package.json: é o que
// associa o ícone/agrupamento corretos na Barra de Tarefas do Windows para
// o app instalado (ver `app.setAppUserModelId` abaixo).
const APP_ID = "com.viniciusmendes.extratordiarias";

let backendProcess: ChildProcessWithoutNullStreams | null = null;
let janelaPrincipal: BrowserWindow | null = null;

// Sprint 08 — em desenvolvimento, sobe o backend a partir do `.venv` (fluxo
// inalterado desde sempre); empacotado, não há Python instalado na máquina
// do usuário, então chama o executável standalone gerado pelo PyInstaller
// (`backend/extrator_diarias_backend.spec`), copiado para
// `resources/backend/` pelo electron-builder (`extraResources`). Mesmo
// host/porta nos dois casos — só muda o que é executado.
function subirBackend(): void {
  let comando: string;
  let argumentos: string[];
  let cwd: string;

  if (app.isPackaged) {
    comando = path.join(process.resourcesPath, "backend", "extrator_diarias_backend.exe");
    argumentos = [];
    cwd = path.dirname(comando);
  } else {
    comando =
      process.platform === "win32"
        ? path.join(BACKEND_DIR, ".venv", "Scripts", "python.exe")
        : path.join(BACKEND_DIR, ".venv", "bin", "python");
    argumentos = ["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", String(BACKEND_PORT)];
    cwd = BACKEND_DIR;
  }

  // Sprint 13 — a Central Inteligente de Conferência precisa de uma pasta
  // de dados fixa para a Base Local de Consulta (doc arquitetural § 4.2,
  // § 0 item 6: "AppData", 100% transparente ao usuário). `app.getPath`
  // já sabe onde fica essa pasta para esta instalação — repassada ao
  // backend Python por variável de ambiente, para as duas partes do app
  // concordarem sobre o mesmo diretório sem duplicar a lógica de resolução
  // de caminho (ver `app/consulta/base_local.py`, que cai para
  // `%APPDATA%/ExtratorDiarias` quando esta variável não está definida —
  // ex.: backend rodando standalone em desenvolvimento/testes).
  const variaveisAmbiente = {
    ...process.env,
    EXTRATOR_DIARIAS_USER_DATA: app.getPath("userData"),
  };

  backendProcess = spawn(comando, argumentos, { cwd, windowsHide: true, env: variaveisAmbiente });

  backendProcess.stdout.on("data", (dado) => console.log(`[backend] ${dado}`));
  backendProcess.stderr.on("data", (dado) => console.error(`[backend] ${dado}`));
  backendProcess.on("exit", (codigo) => console.log(`[backend] processo encerrado (${codigo})`));
}

function derrubarBackend(): void {
  backendProcess?.kill();
  backendProcess = null;
}

// Sprint 08 — mesmo ícone (logotipo oficial) em dev e empacotado: quando
// empacotado, `build/icon.ico` é copiado para `resources/build/` via
// `extraResources`; em dev, lido direto da pasta do projeto.
function caminhoIcone(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, "build", "icon.ico")
    : path.join(__dirname, "..", "build", "icon.ico");
}

function criarJanela(): void {
  janelaPrincipal = new BrowserWindow({
    width: 1024,
    height: 720,
    icon: caminhoIcone(),
    // Sprint 09.1 — o menu padrão do Electron (File/Edit/View/Window/Help)
    // quebrava a identidade visual do produto; `autoHideMenuBar` é o
    // comportamento idiomático do Electron para "invisível, aparece só ao
    // pressionar Alt", a preferência pedida pela Sprint. Nenhum outro
    // comportamento da janela muda.
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });

  if (!app.isPackaged) {
    janelaPrincipal.loadURL("http://localhost:5173");
  } else {
    janelaPrincipal.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
}

app.whenReady().then(() => {
  if (process.platform === "win32") app.setAppUserModelId(APP_ID);

  registrarIpcPlanilha();
  registrarIpcRelatorio();
  registrarIpcConferencia();
  registrarIpcConfiguracao();
  registrarIpcClipboard();
  subirBackend();
  criarJanela();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) criarJanela();
  });
});

app.on("window-all-closed", () => {
  derrubarBackend();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", derrubarBackend);
