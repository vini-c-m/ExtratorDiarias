import { app, BrowserWindow } from "electron";
import { spawn, ChildProcessWithoutNullStreams } from "child_process";
import * as path from "path";
import { registrarIpcClipboard } from "./ipc/clipboard";
import { registrarIpcConferencia } from "./ipc/conferencia";
import { registrarIpcConfiguracao } from "./ipc/configuracao";
import { type EstadoFechamento, registrarFechamentoSeguro, registrarIpcFechamento } from "./ipc/fechamento";
import { registrarIpcLink } from "./ipc/link";
import { registrarIpcPlanilha } from "./ipc/planilha";
import { registrarIpcRelatorio } from "./ipc/relatorio";
import { registrarIpcRelatorioTransparencia } from "./ipc/relatorioTransparencia";

const BACKEND_PORT = 8756;
const BACKEND_DIR = path.join(__dirname, "..", "..", "backend");

// Sprint 08 — precisa bater com `build.appId` em package.json: é o que
// associa o ícone/agrupamento corretos na Barra de Tarefas do Windows para
// o app instalado (ver `app.setAppUserModelId` abaixo).
const APP_ID = "com.viniciusmendes.extratordiarias";

let backendProcess: ChildProcessWithoutNullStreams | null = null;
let janelaPrincipal: BrowserWindow | null = null;
// Sprint (Loading/Bloqueio de Ações/Navegação Segura, itens 8-10) — guarda
// contra loop infinito no `close` de `registrarFechamentoSeguro`: só vira
// `true` depois que o renderer confirma (`app:confirmar-fechamento`), e o
// `close()` disparado ali mesmo passa direto pelo guard na segunda vez.
const estadoFechamento: EstadoFechamento = { podeFechar: false };

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
  // 2026-08-06 (achado real — build empacotado desatualizado): mesmo
  // padrão de `EXTRATOR_DIARIAS_USER_DATA` acima — `app.getVersion()`
  // repassada ao backend para gravar em `sincronizacoes.versao_app`
  // (`app/consulta/base_local.py`), o 3º eixo de frescor de `GET
  // /sincronizacao` (`app/services/analitica_service.py`). Sem isso, uma
  // atualização do app (novo instalador) que muda só a lógica de
  // importação — nunca a Planilha Oficial nem o formato das tabelas —
  // ficava invisível para a verificação de frescor.
  const variaveisAmbiente = {
    ...process.env,
    EXTRATOR_DIARIAS_USER_DATA: app.getPath("userData"),
    EXTRATOR_DIARIAS_APP_VERSION: app.getVersion(),
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

  // Sprint (Loading/Bloqueio de Ações/Navegação Segura, itens 8-10) —
  // confirmação ao fechar o app: interceptar o evento nativo `close` do
  // `BrowserWindow` é o único ponto que cobre de verdade X da janela,
  // Alt+F4 e `app.quit()` por igual — diferente de `window.beforeunload`,
  // que o Electron não garante disparar de forma confiável para
  // fechamento nativo (item 10, "preferir controle no Electron main
  // process"). A decisão de qual mensagem mostrar (há operação crítica
  // ativa?) é do renderer, único lugar que sabe disso — `registrarFechamentoSeguro`
  // só pausa o fechamento e pergunta (extraído para `ipc/fechamento.ts`,
  // testável isoladamente, mesmo padrão dos demais `registrarIpc*`).
  registrarFechamentoSeguro(janelaPrincipal, estadoFechamento);

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
  registrarIpcRelatorioTransparencia();
  registrarIpcConferencia();
  registrarIpcConfiguracao();
  registrarIpcClipboard();
  registrarIpcLink();
  // Sprint (Loading/Bloqueio de Ações/Navegação Segura, itens 8-10) —
  // handler único (nunca por janela — evitaria "segundo handler para o
  // mesmo canal" se a janela principal for recriada, `app.on("activate")`
  // abaixo); o renderer chama isto depois de confirmar (e, se havia
  // processamento ativo, depois que a interrupção segura já terminou) —
  // nunca antes.
  registrarIpcFechamento(() => janelaPrincipal, estadoFechamento);
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
