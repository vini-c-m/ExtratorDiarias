import { beforeEach, describe, expect, it, vi } from "vitest";

const { ipcMainMock, handlers } = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  return {
    ipcMainMock: {
      handle: vi.fn((canal: string, fn: (...args: unknown[]) => unknown) => {
        handlers.set(canal, fn);
      }),
    },
    handlers,
  };
});

vi.mock("electron", () => ({
  ipcMain: ipcMainMock,
}));

import { type EstadoFechamento, registrarFechamentoSeguro, registrarIpcFechamento } from "./fechamento";

// Janela fake mínima: só o suficiente para exercitar `on("close", ...)` /
// `webContents.send` / `close()`, sem depender do Electron de verdade —
// mesmo padrão dos demais testes deste diretório (`configuracao.test.ts`).
function criarJanelaFake() {
  const listenersDeClose: ((evento: { preventDefault: () => void }) => void)[] = [];
  return {
    on: vi.fn((evento: string, callback: (evento: { preventDefault: () => void }) => void) => {
      if (evento === "close") listenersDeClose.push(callback);
    }),
    webContents: { send: vi.fn() },
    close: vi.fn(),
    dispararClose(): { preventDefault: ReturnType<typeof vi.fn> } {
      const eventoFake = { preventDefault: vi.fn() };
      for (const listener of listenersDeClose) listener(eventoFake);
      return eventoFake;
    },
  };
}

describe("registrarFechamentoSeguro — X, Alt+F4 e app.quit() usam o mesmo evento nativo `close`", () => {
  it("A/G/H) sem confirmação prévia, cancela o fechamento e pede confirmação ao renderer", () => {
    const janela = criarJanelaFake();
    const estado: EstadoFechamento = { podeFechar: false };

    registrarFechamentoSeguro(janela as never, estado);
    const eventoFake = janela.dispararClose();

    expect(eventoFake.preventDefault).toHaveBeenCalledTimes(1);
    expect(janela.webContents.send).toHaveBeenCalledWith("app:solicitar-fechamento");
    expect(janela.close).not.toHaveBeenCalled();
  });

  it("C/F) com confirmação já concedida (`podeFechar: true`), deixa o fechamento seguir — nunca pede de novo", () => {
    const janela = criarJanelaFake();
    const estado: EstadoFechamento = { podeFechar: true };

    registrarFechamentoSeguro(janela as never, estado);
    const eventoFake = janela.dispararClose();

    expect(eventoFake.preventDefault).not.toHaveBeenCalled();
    expect(janela.webContents.send).not.toHaveBeenCalled();
  });
});

describe("registrarIpcFechamento", () => {
  beforeEach(() => {
    ipcMainMock.handle.mockClear();
    handlers.clear();
  });

  it("F) confirma o fechamento: marca podeFechar e fecha a janela atual", () => {
    const janela = criarJanelaFake();
    const estado: EstadoFechamento = { podeFechar: false };

    registrarIpcFechamento(() => janela as never, estado);
    const handler = handlers.get("app:confirmar-fechamento")!;
    handler();

    expect(estado.podeFechar).toBe(true);
    expect(janela.close).toHaveBeenCalledTimes(1);
  });

  it("registra um único handler para o canal (nunca duplicado, mesmo com janela recriada)", () => {
    const estado: EstadoFechamento = { podeFechar: false };
    registrarIpcFechamento(() => null, estado);

    expect(ipcMainMock.handle).toHaveBeenCalledTimes(1);
    expect(ipcMainMock.handle).toHaveBeenCalledWith("app:confirmar-fechamento", expect.any(Function));
  });
});
