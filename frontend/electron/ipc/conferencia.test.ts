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

// Nenhum mock de `./clipboard` aqui de propósito: usamos o módulo real, só
// com `electron.clipboard` de dublê — assim o teste comprova a delegação
// real (`conferencia.ts` -> `clipboard.ts` -> `clipboard.writeText`), não
// apenas que uma função mockada foi chamada.
vi.mock("electron", () => ({
  clipboard: clipboardMock,
  ipcMain: ipcMainMock,
}));

import { registrarIpcConferencia } from "./conferencia";

// Sprint 19.5.8.1 — correção da lacuna N1 da Auditoria Técnica (19.5.8
// REPROVADA): prova que a generalização do clipboard (19.5.8) preservou
// nome, assinatura e comportamento do canal já homologado na Sprint 13, e
// que `conferencia.ts` de fato delega para o mesmo mecanismo nativo de
// `clipboard.ts`, sem duplicar a chamada a `clipboard.writeText`.
describe("registrarIpcConferencia", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handlers.clear();
  });

  it("registra exatamente o canal 'conferencia:copiar-historico' (nome preservado da Sprint 13)", () => {
    registrarIpcConferencia();

    expect(ipcMainMock.handle).toHaveBeenCalledTimes(1);
    expect(ipcMainMock.handle).toHaveBeenCalledWith("conferencia:copiar-historico", expect.any(Function));
  });

  it("o handler mantém a assinatura antiga (texto: string) e delega para o mesmo clipboard.writeText de clipboard.ts, sem duplicar a chamada", () => {
    registrarIpcConferencia();
    const handler = handlers.get("conferencia:copiar-historico")!;

    handler({}, "texto do histórico para o e-Fisco");

    expect(clipboardMock.writeText).toHaveBeenCalledTimes(1);
    expect(clipboardMock.writeText).toHaveBeenCalledWith("texto do histórico para o e-Fisco");
  });
});
