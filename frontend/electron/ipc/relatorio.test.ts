import * as path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { dialogMock, fromWebContentsMock, ipcMainMock, handlers, existsSyncMock, copyFileMock } =
  vi.hoisted(() => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>();
    return {
      dialogMock: { showSaveDialog: vi.fn() },
      fromWebContentsMock: vi.fn(),
      ipcMainMock: {
        handle: vi.fn((canal: string, fn: (...args: unknown[]) => unknown) => {
          handlers.set(canal, fn);
        }),
      },
      handlers,
      existsSyncMock: vi.fn(),
      copyFileMock: vi.fn(),
    };
  });

vi.mock("electron", () => ({
  dialog: dialogMock,
  ipcMain: ipcMainMock,
  BrowserWindow: { fromWebContents: fromWebContentsMock },
}));

vi.mock("fs", () => ({
  existsSync: (...args: [string]) => existsSyncMock(...args),
}));

vi.mock("fs/promises", () => ({
  copyFile: (...args: [string, string]) => copyFileMock(...args),
}));

import { nomeRelatorioSugerido, registrarIpcRelatorio } from "./relatorio";

describe("nomeRelatorioSugerido", () => {
  const data = new Date(2026, 6, 15); // 15/07/2026
  const pasta = "C:\\resultados";

  function caminho(nome: string) {
    return path.join(pasta, nome);
  }

  it("sem colisão, sugere o nome do dia sem sufixo", () => {
    const nome = nomeRelatorioSugerido(data, () => false, pasta);
    expect(nome).toBe("Relatório Processamento - 15-07-2026.html");
  });

  it("com o nome do dia já existente, sugere '(2)'", () => {
    const existentes = new Set([caminho("Relatório Processamento - 15-07-2026.html")]);
    const nome = nomeRelatorioSugerido(data, (c) => existentes.has(c), pasta);
    expect(nome).toBe("Relatório Processamento - 15-07-2026 (2).html");
  });

  it("com o nome do dia e o '(2)' já existentes, sugere '(3)'", () => {
    const existentes = new Set([
      caminho("Relatório Processamento - 15-07-2026.html"),
      caminho("Relatório Processamento - 15-07-2026 (2).html"),
    ]);
    const nome = nomeRelatorioSugerido(data, (c) => existentes.has(c), pasta);
    expect(nome).toBe("Relatório Processamento - 15-07-2026 (3).html");
  });

  it("continua a sequência até achar um nome livre ('(4)')", () => {
    const existentes = new Set([
      caminho("Relatório Processamento - 15-07-2026.html"),
      caminho("Relatório Processamento - 15-07-2026 (2).html"),
      caminho("Relatório Processamento - 15-07-2026 (3).html"),
    ]);
    const nome = nomeRelatorioSugerido(data, (c) => existentes.has(c), pasta);
    expect(nome).toBe("Relatório Processamento - 15-07-2026 (4).html");
  });
});

describe("registrarIpcRelatorio", () => {
  const pastaResultados = "C:\\res";
  const caminhoOrigem = "C:\\res\\relatorio.html";

  beforeEach(() => {
    vi.clearAllMocks();
    handlers.clear();
    existsSyncMock.mockReturnValue(false);
    fromWebContentsMock.mockReturnValue({ id: "janela-fake" });
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 15, 10, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function chamarHandler() {
    registrarIpcRelatorio();
    const handler = handlers.get("relatorio:salvar-como")!;
    return handler({ sender: {} }, caminhoOrigem, pastaResultados);
  }

  it("abre o diálogo 'Salvar Como' com o nome sugerido e o filtro .html", async () => {
    dialogMock.showSaveDialog.mockResolvedValue({ canceled: true });

    await chamarHandler();

    expect(dialogMock.showSaveDialog).toHaveBeenCalledWith(
      { id: "janela-fake" },
      {
        defaultPath: path.join(pastaResultados, "Relatório Processamento - 15-07-2026.html"),
        filters: [{ name: "Relatório HTML", extensions: ["html"] }],
      },
    );
  });

  it("cancelamento do diálogo retorna null e não copia nada", async () => {
    dialogMock.showSaveDialog.mockResolvedValue({ canceled: true });

    const resultado = await chamarHandler();

    expect(resultado).toBeNull();
    expect(copyFileMock).not.toHaveBeenCalled();
  });

  it("salvamento bem-sucedido copia o relatório já gerado e retorna caminho/pasta", async () => {
    const destino = "D:\\arquivados\\Relatório Processamento - 15-07-2026.html";
    dialogMock.showSaveDialog.mockResolvedValue({ canceled: false, filePath: destino });
    copyFileMock.mockResolvedValue(undefined);

    const resultado = await chamarHandler();

    expect(copyFileMock).toHaveBeenCalledWith(caminhoOrigem, destino);
    expect(resultado).toEqual({
      caminhoArquivo: destino,
      pastaArquivo: path.dirname(destino),
    });
  });

  it("erro de gravação propaga para quem chamou", async () => {
    const destino = "D:\\sem-permissao\\relatorio.html";
    dialogMock.showSaveDialog.mockResolvedValue({ canceled: false, filePath: destino });
    copyFileMock.mockRejectedValue(new Error("EPERM"));

    await expect(chamarHandler()).rejects.toThrow("EPERM");
  });

  it("sem janela associada, chama o diálogo sem o argumento de janela", async () => {
    fromWebContentsMock.mockReturnValue(null);
    dialogMock.showSaveDialog.mockResolvedValue({ canceled: true });

    await chamarHandler();

    expect(dialogMock.showSaveDialog).toHaveBeenCalledWith(
      expect.objectContaining({ filters: [{ name: "Relatório HTML", extensions: ["html"] }] }),
    );
  });
});
