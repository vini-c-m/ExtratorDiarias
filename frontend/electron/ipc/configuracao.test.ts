import { beforeEach, describe, expect, it, vi } from "vitest";

const { dialogMock, fromWebContentsMock, ipcMainMock, handlers } = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  return {
    dialogMock: { showOpenDialog: vi.fn() },
    fromWebContentsMock: vi.fn(),
    ipcMainMock: {
      handle: vi.fn((canal: string, fn: (...args: unknown[]) => unknown) => {
        handlers.set(canal, fn);
      }),
    },
    handlers,
  };
});

vi.mock("electron", () => ({
  dialog: dialogMock,
  ipcMain: ipcMainMock,
  BrowserWindow: { fromWebContents: fromWebContentsMock },
}));

import { registrarIpcConfiguracao } from "./configuracao";

describe("registrarIpcConfiguracao", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handlers.clear();
    fromWebContentsMock.mockReturnValue({ id: "janela-fake" });
  });

  function chamarHandler() {
    registrarIpcConfiguracao();
    const handler = handlers.get("configuracao:selecionar-planilha")!;
    return handler({ sender: {} });
  }

  it("abre o diálogo 'Abrir' filtrado para .xlsx", async () => {
    dialogMock.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });

    await chamarHandler();

    expect(dialogMock.showOpenDialog).toHaveBeenCalledWith(
      { id: "janela-fake" },
      expect.objectContaining({
        filters: [{ name: "Planilha Excel", extensions: ["xlsx"] }],
        properties: ["openFile"],
      }),
    );
  });

  it("cancelamento do diálogo retorna null", async () => {
    dialogMock.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });

    const resultado = await chamarHandler();

    expect(resultado).toBeNull();
  });

  it("seleção bem-sucedida retorna o caminho escolhido", async () => {
    dialogMock.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: ["G:\\Meu Drive\\DIMCAC\\Controle de Diárias.xlsx"],
    });

    const resultado = await chamarHandler();

    expect(resultado).toBe("G:\\Meu Drive\\DIMCAC\\Controle de Diárias.xlsx");
  });

  it("sem janela associada, chama o diálogo sem o argumento de janela", async () => {
    fromWebContentsMock.mockReturnValue(null);
    dialogMock.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });

    await chamarHandler();

    expect(dialogMock.showOpenDialog).toHaveBeenCalledWith(
      expect.objectContaining({ filters: [{ name: "Planilha Excel", extensions: ["xlsx"] }] }),
    );
  });
});
