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
  registrarIpcLinkMock,
  registrarFechamentoSeguroMock,
  registrarIpcFechamentoMock,
  registrarIpcRelatorioTransparenciaMock,
} = vi.hoisted(() => {
  // `class` (não `vi.fn(() => ...)`) porque `main.ts` usa `new
  // BrowserWindow(...)` — uma arrow function não é um construtor válido.
  class BrowserWindowMock {
    loadURL = vi.fn();
    loadFile = vi.fn();
    on = vi.fn();
    webContents = { send: vi.fn() };
    static getAllWindows = vi.fn().mockReturnValue([]);
  }

  return {
    appMock: {
      isPackaged: false,
      whenReady: vi.fn(),
      setAppUserModelId: vi.fn(),
      getPath: vi.fn().mockReturnValue("C:\\fake\\userData"),
      getVersion: vi.fn().mockReturnValue("0.0.0-teste"),
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
    registrarIpcLinkMock: vi.fn(),
    // Sprint (Loading/Bloqueio de Ações/Navegação Segura, itens 8-10) —
    // mesmo padrão dos demais `registrarIpc*`: dublê completo, `main.test.ts`
    // não precisa (nem deve) testar a lógica de `ipc/fechamento.ts` de novo
    // — isso já está coberto por `ipc/fechamento.test.ts`.
    registrarFechamentoSeguroMock: vi.fn(),
    registrarIpcFechamentoMock: vi.fn(),
    // Micro-sprint 3E.1 — Relatório do Portal da Transparência.
    registrarIpcRelatorioTransparenciaMock: vi.fn(),
  };
});

vi.mock("electron", () => ({ app: appMock, BrowserWindow: BrowserWindowMock }));
vi.mock("child_process", () => ({ spawn: spawnMock }));
vi.mock("./ipc/planilha", () => ({ registrarIpcPlanilha: registrarIpcPlanilhaMock }));
vi.mock("./ipc/relatorio", () => ({ registrarIpcRelatorio: registrarIpcRelatorioMock }));
vi.mock("./ipc/conferencia", () => ({ registrarIpcConferencia: registrarIpcConferenciaMock }));
vi.mock("./ipc/configuracao", () => ({ registrarIpcConfiguracao: registrarIpcConfiguracaoMock }));
vi.mock("./ipc/clipboard", () => ({ registrarIpcClipboard: registrarIpcClipboardMock }));
vi.mock("./ipc/link", () => ({ registrarIpcLink: registrarIpcLinkMock }));
vi.mock("./ipc/relatorioTransparencia", () => ({
  registrarIpcRelatorioTransparencia: registrarIpcRelatorioTransparenciaMock,
}));
vi.mock("./ipc/fechamento", () => ({
  registrarFechamentoSeguro: registrarFechamentoSeguroMock,
  registrarIpcFechamento: registrarIpcFechamentoMock,
}));

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

  it("registra os 8 módulos IPC (incluindo fechamento seguro, Sprint Loading/Bloqueio de Ações, o link Arquimedes e o Relatório do Portal da Transparência) sem omitir nenhum", async () => {
    await import("./main");
    // Deixa o `.then()` de `app.whenReady()` (já resolvida) rodar antes de
    // verificar as chamadas.
    await new Promise((resolve) => setImmediate(resolve));

    expect(registrarIpcPlanilhaMock).toHaveBeenCalledTimes(1);
    expect(registrarIpcRelatorioMock).toHaveBeenCalledTimes(1);
    expect(registrarIpcConferenciaMock).toHaveBeenCalledTimes(1);
    expect(registrarIpcConfiguracaoMock).toHaveBeenCalledTimes(1);
    expect(registrarIpcClipboardMock).toHaveBeenCalledTimes(1);
    expect(registrarIpcLinkMock).toHaveBeenCalledTimes(1);
    expect(registrarIpcFechamentoMock).toHaveBeenCalledTimes(1);
    expect(registrarIpcRelatorioTransparenciaMock).toHaveBeenCalledTimes(1);
    // `registrarFechamentoSeguro` é por JANELA (dentro de `criarJanela()`,
    // não de `app.whenReady()`) — uma janela criada nesta importação.
    expect(registrarFechamentoSeguroMock).toHaveBeenCalledTimes(1);
  });

  // URGENTE — Central Analítica (2026-08-06, achado real — build
  // empacotado desatualizado): `app.getVersion()` precisa chegar ao
  // backend por `EXTRATOR_DIARIAS_APP_VERSION`, mesmo padrão já homologado
  // de `EXTRATOR_DIARIAS_USER_DATA` — é o que permite `GET /sincronizacao`
  // detectar uma atualização do app mesmo quando a Planilha Oficial e o
  // schema de tabelas não mudam (`app/services/analitica_service.py`).
  it("repassa a versão do app ao backend por EXTRATOR_DIARIAS_APP_VERSION", async () => {
    await import("./main");
    await new Promise((resolve) => setImmediate(resolve));

    expect(spawnMock).toHaveBeenCalledTimes(1);
    const [, , opcoes] = spawnMock.mock.calls[0];
    expect(opcoes.env.EXTRATOR_DIARIAS_APP_VERSION).toBe("0.0.0-teste");
    expect(opcoes.env.EXTRATOR_DIARIAS_USER_DATA).toBe("C:\\fake\\userData");
  });
});
