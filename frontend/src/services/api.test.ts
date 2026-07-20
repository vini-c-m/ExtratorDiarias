import { afterEach, describe, expect, it, vi } from "vitest";
import { ProcessamentoCanceladoError, processarLoteComProgresso } from "./api";
import type { LoteProcessamento } from "../types/processamento";
import type { ProgressoProcessamento } from "./api";

// Sprint 05.3 — cobre o mecanismo de cancelamento do laço de processamento
// (AbortController/AbortSignal) e reafirma, por regressão, o comportamento
// já existente (falha de rede isolada não interrompe o lote) que esta
// Sprint não deveria alterar.

function respostaOk(corpo: unknown) {
  return { ok: true, status: 200, json: async () => corpo };
}

function criarLotePadrao(): LoteProcessamento {
  return {
    id: "lote-teste",
    total: 1,
    sucesso: 1,
    erro: 0,
    processos: [
      {
        id: "processo-1",
        arquivo_origem: "a.pdf",
        status: "sucesso",
        diaria: null,
        erro: null,
        avisos: [],
      },
    ],
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("processarLoteComProgresso — cancelamento", () => {
  it("sinal já abortado antes de começar: não faz nenhuma chamada de rede e lança ProcessamentoCanceladoError", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const controller = new AbortController();
    controller.abort();

    await expect(
      processarLoteComProgresso(["a.pdf", "b.pdf"], undefined, controller.signal),
    ).rejects.toBeInstanceOf(ProcessamentoCanceladoError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("cancelado entre um arquivo e o próximo: processa o que já tinha começado e para antes do resto", async () => {
    const fetchMock = vi.fn(async () => respostaOk(criarLotePadrao()));
    vi.stubGlobal("fetch", fetchMock);

    const controller = new AbortController();
    const progressoRegistrado: ProgressoProcessamento[] = [];

    const promessa = processarLoteComProgresso(
      ["a.pdf", "b.pdf", "c.pdf"],
      (p) => {
        progressoRegistrado.push(p);
        if (p.concluidos === 1) controller.abort();
      },
      controller.signal,
    );

    await expect(promessa).rejects.toBeInstanceOf(ProcessamentoCanceladoError);
    // só o primeiro arquivo chegou a ser enviado ao backend
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("cancelado com uma requisição em voo: aborta o fetch em andamento e não dispara o próximo arquivo", async () => {
    let chamadasIniciadas = 0;
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      chamadasIniciadas += 1;
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("The operation was aborted.", "AbortError"));
        });
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const controller = new AbortController();
    const promessa = processarLoteComProgresso(["a.pdf", "b.pdf"], undefined, controller.signal);

    await vi.waitFor(() => expect(chamadasIniciadas).toBe(1));
    controller.abort();

    await expect(promessa).rejects.toBeInstanceOf(ProcessamentoCanceladoError);
    expect(chamadasIniciadas).toBe(1);
  });

  it("nenhuma chamada ao endpoint de preenchimento de planilha acontece durante o processamento", async () => {
    const fetchMock = vi.fn(async (_url: string) => respostaOk(criarLotePadrao()));
    vi.stubGlobal("fetch", fetchMock);

    await processarLoteComProgresso(["a.pdf"]);

    for (const chamada of fetchMock.mock.calls) {
      expect(String(chamada[0])).not.toContain("/planilha/");
    }
  });
});

describe("processarLoteComProgresso — regressão (comportamento pré-existente)", () => {
  it("sem sinal de cancelamento, processa todos os arquivos e devolve o lote completo", async () => {
    const fetchMock = vi.fn(async () => respostaOk(criarLotePadrao()));
    vi.stubGlobal("fetch", fetchMock);

    const progressoRegistrado: ProgressoProcessamento[] = [];
    const lote = await processarLoteComProgresso(["a.pdf", "b.pdf"], (p) =>
      progressoRegistrado.push(p),
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(lote.total).toBe(2);
    expect(lote.sucesso).toBe(2);
    expect(progressoRegistrado.at(-1)).toEqual({ concluidos: 2, total: 2, arquivoAtual: "" });
  });

  it("falha de rede isolada num arquivo não interrompe o restante do lote", async () => {
    let chamada = 0;
    const fetchMock = vi.fn(async () => {
      chamada += 1;
      if (chamada === 1) throw new Error("Failed to fetch");
      return respostaOk(criarLotePadrao());
    });
    vi.stubGlobal("fetch", fetchMock);

    const lote = await processarLoteComProgresso(["a.pdf", "b.pdf"]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(lote.total).toBe(2);
    expect(lote.erro).toBe(1);
    expect(lote.sucesso).toBe(1);
  });
});
