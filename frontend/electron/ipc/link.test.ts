import { beforeEach, describe, expect, it, vi } from "vitest";

const { shellMock, ipcMainMock, handlers } = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  return {
    shellMock: { openExternal: vi.fn() },
    ipcMainMock: {
      handle: vi.fn((canal: string, fn: (...args: unknown[]) => unknown) => {
        handlers.set(canal, fn);
      }),
    },
    handlers,
  };
});

vi.mock("electron", () => ({
  shell: shellMock,
  ipcMain: ipcMainMock,
}));

import { abrirLinkExterno, registrarIpcLink } from "./link";

// Ajuste Final (link Arquimedes, modal de Cadastro de Servidor/Membro) —
// mesmo padrão de dublê de `clipboard.test.ts`: mock de `electron`, captura
// do handler via `ipcMain.handle`, chamada direta (sem iniciar janela
// Electron real).
describe("abrirLinkExterno", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("chama shell.openExternal com a URL http(s) exata", () => {
    abrirLinkExterno("https://arquimedes.mppe.mp.br/arquimedes/");

    expect(shellMock.openExternal).toHaveBeenCalledTimes(1);
    expect(shellMock.openExternal).toHaveBeenCalledWith("https://arquimedes.mppe.mp.br/arquimedes/");
  });

  it("aceita http (não só https)", () => {
    abrirLinkExterno("http://exemplo.com/");

    expect(shellMock.openExternal).toHaveBeenCalledWith("http://exemplo.com/");
  });

  it("rejeita qualquer esquema que não seja http/https, sem chamar shell.openExternal", () => {
    expect(() => abrirLinkExterno("file:///C:/Windows/System32/calc.exe")).toThrow(/não permitido/i);
    expect(() => abrirLinkExterno("javascript:alert(1)")).toThrow(/não permitido/i);
    expect(shellMock.openExternal).not.toHaveBeenCalled();
  });
});

describe("registrarIpcLink", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handlers.clear();
  });

  it("registra exatamente o canal 'link:abrir-externo'", () => {
    registrarIpcLink();

    expect(ipcMainMock.handle).toHaveBeenCalledTimes(1);
    expect(ipcMainMock.handle).toHaveBeenCalledWith("link:abrir-externo", expect.any(Function));
  });

  it("o handler chama shell.openExternal com a URL exata recebida", () => {
    registrarIpcLink();
    const handler = handlers.get("link:abrir-externo")!;

    handler({}, "https://arquimedes.mppe.mp.br/arquimedes/");

    expect(shellMock.openExternal).toHaveBeenCalledWith("https://arquimedes.mppe.mp.br/arquimedes/");
  });

  it("o handler propaga a rejeição de esquema não http/https para quem chamou", () => {
    registrarIpcLink();
    const handler = handlers.get("link:abrir-externo")!;

    expect(() => handler({}, "file:///etc/passwd")).toThrow(/não permitido/i);
  });
});
