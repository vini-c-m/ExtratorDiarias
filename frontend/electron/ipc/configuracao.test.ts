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

// Organização Automática de PDFs — seletor nativo de pasta, usado pelas
// quatro Pastas Operacionais. Decisão confirmada: nenhum `defaultPath`.
describe("registrarIpcConfiguracao — configuracao:selecionar-pasta", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handlers.clear();
    fromWebContentsMock.mockReturnValue({ id: "janela-fake" });
  });

  function chamarHandlerPasta() {
    registrarIpcConfiguracao();
    const handler = handlers.get("configuracao:selecionar-pasta")!;
    return handler({ sender: {} });
  }

  it("abre o diálogo 'Abrir pasta' sem filtro de extensão e sem defaultPath", async () => {
    dialogMock.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });

    await chamarHandlerPasta();

    const [, opcoes] = dialogMock.showOpenDialog.mock.calls[0];
    expect(opcoes).toEqual(
      expect.objectContaining({ properties: ["openDirectory"] }),
    );
    expect(opcoes).not.toHaveProperty("filters");
    expect(opcoes).not.toHaveProperty("defaultPath");
  });

  it("cancelamento do diálogo retorna null", async () => {
    dialogMock.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });

    const resultado = await chamarHandlerPasta();

    expect(resultado).toBeNull();
  });

  it("seleção bem-sucedida retorna o caminho da pasta escolhida", async () => {
    dialogMock.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: ["G:\\Meu Drive\\DIMCAC\\PDFs a Processar"],
    });

    const resultado = await chamarHandlerPasta();

    expect(resultado).toBe("G:\\Meu Drive\\DIMCAC\\PDFs a Processar");
  });

  it("sem janela associada, chama o diálogo sem o argumento de janela", async () => {
    fromWebContentsMock.mockReturnValue(null);
    dialogMock.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });

    await chamarHandlerPasta();

    expect(dialogMock.showOpenDialog).toHaveBeenCalledWith(
      expect.objectContaining({ properties: ["openDirectory"] }),
    );
  });
});

// Organização Automática de PDFs — guarda Windows-safe (path.resolve +
// path.relative). Vive aqui (processo main, nunca sandboxado) desde a
// correção pós-regressão P0: o preload sandboxado não tem acesso ao
// módulo `path` do Node (ver `preload.ts` e `preload.sandbox.test.ts`).
describe("registrarIpcConfiguracao — configuracao:caminho-dentro-da-pasta", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handlers.clear();
  });

  function chamarHandlerGuarda(caminhoArquivo: string, pasta: string) {
    registrarIpcConfiguracao();
    const handler = handlers.get("configuracao:caminho-dentro-da-pasta")!;
    return handler({ sender: {} }, caminhoArquivo, pasta);
  }

  it("arquivo diretamente dentro da pasta configurada: true", () => {
    expect(chamarHandlerGuarda("C:\\PDFs\\a processar\\arquivo.pdf", "C:\\PDFs\\a processar")).toBe(
      true,
    );
  });

  it("arquivo em subpasta: true", () => {
    expect(
      chamarHandlerGuarda("C:\\PDFs\\a processar\\sub\\arquivo.pdf", "C:\\PDFs\\a processar"),
    ).toBe(true);
  });

  it("arquivo fora da pasta configurada: false", () => {
    expect(chamarHandlerGuarda("C:\\PDFs\\outra\\arquivo.pdf", "C:\\PDFs\\a processar")).toBe(false);
  });

  it("nunca usa prefixo de string ingênuo — 'Pasta A-outra' não é filha de 'Pasta A'", () => {
    expect(chamarHandlerGuarda("C:\\PDFs\\Pasta A-outra\\arquivo.pdf", "C:\\PDFs\\Pasta A")).toBe(
      false,
    );
  });

  it("sem pasta configurada (string vazia): false", () => {
    expect(chamarHandlerGuarda("C:\\PDFs\\arquivo.pdf", "")).toBe(false);
  });
});
