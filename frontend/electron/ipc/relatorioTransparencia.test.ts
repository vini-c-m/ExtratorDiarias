import { beforeEach, describe, expect, it, vi } from "vitest";

const { ipcMainMock, handlers, getPathMock } = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  return {
    ipcMainMock: {
      handle: vi.fn((canal: string, fn: (...args: unknown[]) => unknown) => {
        handlers.set(canal, fn);
      }),
    },
    handlers,
    getPathMock: vi.fn(),
  };
});

vi.mock("electron", () => ({
  ipcMain: ipcMainMock,
  app: { getPath: getPathMock },
}));

import { registrarIpcRelatorioTransparencia } from "./relatorioTransparencia";

describe("registrarIpcRelatorioTransparencia", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handlers.clear();
  });

  function chamarHandler() {
    registrarIpcRelatorioTransparencia();
    const handler = handlers.get("relatorio-transparencia:obter-caminho-decisoes")!;
    return handler();
  }

  it("devolve um caminho dentro da pasta de dados do usuário (app.getPath('userData'))", () => {
    getPathMock.mockReturnValue("C:\\Users\\servidor\\AppData\\Roaming\\ExtratorDiarias");

    const resultado = chamarHandler();

    expect(getPathMock).toHaveBeenCalledWith("userData");
    expect(resultado).toBe(
      "C:\\Users\\servidor\\AppData\\Roaming\\ExtratorDiarias\\relatorio_transparencia_decisoes.json",
    );
  });

  it("nome de arquivo é sempre o mesmo, independente da pasta de dados", () => {
    getPathMock.mockReturnValue("/home/servidor/.config/ExtratorDiarias");

    const resultado = chamarHandler() as string;

    expect(resultado.endsWith("relatorio_transparencia_decisoes.json")).toBe(true);
  });
});
