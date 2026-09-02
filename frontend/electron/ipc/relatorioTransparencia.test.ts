import { beforeEach, describe, expect, it, vi } from "vitest";

const { ipcMainMock, handlers, getPathMock, showSaveDialogMock, fromWebContentsMock } = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  return {
    ipcMainMock: {
      handle: vi.fn((canal: string, fn: (...args: unknown[]) => unknown) => {
        handlers.set(canal, fn);
      }),
    },
    handlers,
    getPathMock: vi.fn(),
    showSaveDialogMock: vi.fn(),
    fromWebContentsMock: vi.fn(() => null),
  };
});

vi.mock("electron", () => ({
  ipcMain: ipcMainMock,
  app: { getPath: getPathMock },
  dialog: { showSaveDialog: showSaveDialogMock },
  BrowserWindow: { fromWebContents: fromWebContentsMock },
}));

import { registrarIpcRelatorioTransparencia } from "./relatorioTransparencia";

describe("registrarIpcRelatorioTransparencia", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handlers.clear();
  });

  function chamarHandler(canal: string, ...args: unknown[]) {
    registrarIpcRelatorioTransparencia();
    const handler = handlers.get(canal)!;
    return handler({ sender: {} }, ...args);
  }

  describe("relatorio-transparencia:obter-caminho-decisoes", () => {
    it("devolve um caminho dentro da pasta de dados do usuário (app.getPath('userData'))", () => {
      getPathMock.mockReturnValue("C:\\Users\\servidor\\AppData\\Roaming\\ExtratorDiarias");

      const resultado = chamarHandler("relatorio-transparencia:obter-caminho-decisoes");

      expect(getPathMock).toHaveBeenCalledWith("userData");
      expect(resultado).toBe(
        "C:\\Users\\servidor\\AppData\\Roaming\\ExtratorDiarias\\relatorio_transparencia_decisoes.json",
      );
    });

    it("nome de arquivo é sempre o mesmo, independente da pasta de dados", () => {
      getPathMock.mockReturnValue("/home/servidor/.config/ExtratorDiarias");

      const resultado = chamarHandler("relatorio-transparencia:obter-caminho-decisoes") as string;

      expect(resultado.endsWith("relatorio_transparencia_decisoes.json")).toBe(true);
    });
  });

  describe("relatorio-transparencia:obter-caminho-configuracao-template", () => {
    it("devolve um caminho dentro da pasta de dados do usuário, em um arquivo próprio (nunca o de decisões)", () => {
      getPathMock.mockReturnValue("C:\\Users\\servidor\\AppData\\Roaming\\ExtratorDiarias");

      const resultado = chamarHandler("relatorio-transparencia:obter-caminho-configuracao-template");

      expect(getPathMock).toHaveBeenCalledWith("userData");
      expect(resultado).toBe(
        "C:\\Users\\servidor\\AppData\\Roaming\\ExtratorDiarias\\relatorio_transparencia_template_configuracao.json",
      );
    });
  });

  describe("relatorio-transparencia:obter-caminho-configuracao-fontes", () => {
    it("devolve um caminho dentro da pasta de dados do usuário, em um arquivo próprio (nunca decisões/template)", () => {
      getPathMock.mockReturnValue("C:\\Users\\servidor\\AppData\\Roaming\\ExtratorDiarias");

      const resultado = chamarHandler("relatorio-transparencia:obter-caminho-configuracao-fontes");

      expect(getPathMock).toHaveBeenCalledWith("userData");
      expect(resultado).toBe(
        "C:\\Users\\servidor\\AppData\\Roaming\\ExtratorDiarias\\relatorio_transparencia_fontes_configuracao.json",
      );
    });
  });

  describe("relatorio-transparencia:escolher-destino", () => {
    it("devolve o caminho escolhido pelo usuário no diálogo nativo", async () => {
      showSaveDialogMock.mockResolvedValue({ canceled: false, filePath: "C:\\fake\\Relatorio.xlsx" });

      const resultado = await chamarHandler(
        "relatorio-transparencia:escolher-destino",
        "Relatório de Diárias - Portal da Transparência - Agosto 2026.xlsx",
      );

      expect(resultado).toBe("C:\\fake\\Relatorio.xlsx");
      expect(showSaveDialogMock).toHaveBeenCalledWith(
        expect.objectContaining({
          defaultPath: "Relatório de Diárias - Portal da Transparência - Agosto 2026.xlsx",
          filters: [{ name: "Excel", extensions: ["xlsx"] }],
        }),
      );
    });

    it("devolve null quando o usuário cancela o diálogo, nunca lança erro", async () => {
      showSaveDialogMock.mockResolvedValue({ canceled: true, filePath: undefined });

      const resultado = await chamarHandler("relatorio-transparencia:escolher-destino", "nome.xlsx");

      expect(resultado).toBeNull();
    });
  });
});
