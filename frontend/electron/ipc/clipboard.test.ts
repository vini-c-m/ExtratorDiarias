import { beforeEach, describe, expect, it, vi } from "vitest";

const { clipboardMock, ipcMainMock, handlers } = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  return {
    clipboardMock: { writeText: vi.fn() },
    ipcMainMock: {
      handle: vi.fn((canal: string, fn: (...args: unknown[]) => unknown) => {
        handlers.set(canal, fn);
      }),
    },
    handlers,
  };
});

vi.mock("electron", () => ({
  clipboard: clipboardMock,
  ipcMain: ipcMainMock,
}));

import { copiarTexto, registrarIpcClipboard } from "./clipboard";

// Sprint 19.5.8.1 — correção da lacuna N1 da Auditoria Técnica (19.5.8
// REPROVADA): antes desta suíte, o mecanismo de clipboard generalizado na
// 19.5.8 não tinha nenhum teste no nível do processo Electron — só testes
// de componente com `window.api` mockado, que não comprovam que o canal
// real está registrado nem que o handler chama o `clipboard` nativo.
// Mesmo padrão de dublê já usado em `configuracao.test.ts`/
// `relatorio.test.ts` (mock de `electron`, captura do handler via
// `ipcMain.handle`, chamada direta — sem iniciar janela Electron real).
describe("copiarTexto", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("chama clipboard.writeText com o texto exato, sem transformação", () => {
    copiarTexto("19.20.0903.0030720/2024-36");

    expect(clipboardMock.writeText).toHaveBeenCalledTimes(1);
    expect(clipboardMock.writeText).toHaveBeenCalledWith("19.20.0903.0030720/2024-36");
  });
});

describe("registrarIpcClipboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handlers.clear();
  });

  it("registra exatamente o canal 'clipboard:copiar-texto'", () => {
    registrarIpcClipboard();

    expect(ipcMainMock.handle).toHaveBeenCalledTimes(1);
    expect(ipcMainMock.handle).toHaveBeenCalledWith("clipboard:copiar-texto", expect.any(Function));
  });

  it("o handler chama clipboard.writeText com o texto exato recebido", () => {
    registrarIpcClipboard();
    const handler = handlers.get("clipboard:copiar-texto")!;

    handler({}, "texto qualquer a copiar");

    expect(clipboardMock.writeText).toHaveBeenCalledWith("texto qualquer a copiar");
  });

  it("propaga uma eventual falha de clipboard.writeText para quem chamou", () => {
    registrarIpcClipboard();
    const handler = handlers.get("clipboard:copiar-texto")!;
    clipboardMock.writeText.mockImplementation(() => {
      throw new Error("falha nativa simulada");
    });

    expect(() => handler({}, "texto")).toThrow("falha nativa simulada");
  });
});
