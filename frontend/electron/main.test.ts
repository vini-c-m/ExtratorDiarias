import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  appMock,
  BrowserWindowMock,
  spawnMock,
  registrarIpcPlanilhaMock,
  registrarIpcRelatorioMock,
  registrarIpcConferenciaMock,
  registrarIpcConfiguracaoMock,
  registrarIpcClipboardMock,
} = vi.hoisted(() => {
  // `class` (não `vi.fn(() => ...)`) porque `main.ts` usa `new
  // BrowserWindow(...)` — uma arrow function não é um construtor válido.
  class BrowserWindowMock {
    loadURL = vi.fn();
    loadFile = vi.fn();
    static getAllWindows = vi.fn().mockReturnValue([]);
  }

  return {
    appMock: {
      isPackaged: false,
      whenReady: vi.fn(),
      setAppUserModelId: vi.fn(),
      getPath: vi.fn().mockReturnValue("C:\\fake\\userData"),
      on: vi.fn(),
    },
    BrowserWindowMock,
    spawnMock: vi.fn(() => ({
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn(),
      kill: vi.fn(),
    })),
    registrarIpcPlanilhaMock: vi.fn(),
    registrarIpcRelatorioMock: vi.fn(),
    registrarIpcConferenciaMock: vi.fn(),
    registrarIpcConfiguracaoMock: vi.fn(),
    registrarIpcClipboardMock: vi.fn(),
  };
});

vi.mock("electron", () => ({ app: appMock, BrowserWindow: BrowserWindowMock }));
vi.mock("child_process", () => ({ spawn: spawnMock }));
vi.mock("./ipc/planilha", () => ({ registrarIpcPlanilha: registrarIpcPlanilhaMock }));
vi.mock("./ipc/relatorio", () => ({ registrarIpcRelatorio: registrarIpcRelatorioMock }));
vi.mock("./ipc/conferencia", () => ({ registrarIpcConferencia: registrarIpcConferenciaMock }));
vi.mock("./ipc/configuracao", () => ({ registrarIpcConfiguracao: registrarIpcConfiguracaoMock }));
vi.mock("./ipc/clipboard", () => ({ registrarIpcClipboard: registrarIpcClipboardMock }));

// Sprint 19.5.8.1 — correção da lacuna N1 da Auditoria Técnica (19.5.8
// REPROVADA): prova que `registrarIpcClipboard()` não foi omitido do
// registro em `main.ts`, ao lado dos outros 4 módulos IPC já homologados —
// sem iniciar nenhuma janela Electron real (todos os módulos do Electron e
// o processo do backend são dublês).
describe("main — registro dos canais IPC ao ficar pronto", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    appMock.whenReady.mockResolvedValue(undefined);
  });

  it("registra os 5 módulos IPC (incluindo o clipboard generalizado na 19.5.8) sem omitir nenhum", async () => {
    await import("./main");
    // Deixa o `.then()` de `app.whenReady()` (já resolvida) rodar antes de
    // verificar as chamadas.
    await new Promise((resolve) => setImmediate(resolve));

    expect(registrarIpcPlanilhaMock).toHaveBeenCalledTimes(1);
    expect(registrarIpcRelatorioMock).toHaveBeenCalledTimes(1);
    expect(registrarIpcConferenciaMock).toHaveBeenCalledTimes(1);
    expect(registrarIpcConfiguracaoMock).toHaveBeenCalledTimes(1);
    expect(registrarIpcClipboardMock).toHaveBeenCalledTimes(1);
  });
});
