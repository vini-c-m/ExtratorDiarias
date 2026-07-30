import { afterEach, describe, expect, it, vi } from "vitest";
import { buscarConfiguracao, definirConfiguracao } from "./api";

function respostaOk(corpo: unknown) {
  return { ok: true, status: 200, json: async () => corpo };
}

function resposta422(detail: unknown) {
  return { ok: false, status: 422, json: async () => ({ detail }) };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("buscarConfiguracao", () => {
  it("nunca configurado", async () => {
    const fetchMock = vi.fn(async () => respostaOk({ configurado: false }));
    vi.stubGlobal("fetch", fetchMock);

    const estado = await buscarConfiguracao();

    expect(estado).toEqual({ configurado: false });
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/api/v1/configuracao"));
  });

  it("configurado e acessível", async () => {
    const corpo = {
      configurado: true,
      planilha_acessivel: true,
      requer_revalidacao: false,
      caminho_planilha_oficial: "G:\\Meu Drive\\Controle de Diárias.xlsx",
      configurado_em: "2026-07-30T14:32:10",
    };
    vi.stubGlobal("fetch", vi.fn(async () => respostaOk(corpo)));

    const estado = await buscarConfiguracao();

    expect(estado).toEqual(corpo);
  });

  it("configurado, mas planilha inacessível", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => respostaOk({ configurado: true, planilha_acessivel: false })),
    );

    const estado = await buscarConfiguracao();

    expect(estado).toEqual({ configurado: true, planilha_acessivel: false });
  });

  it("backend fora do ar propaga erro", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500 })));

    await expect(buscarConfiguracao()).rejects.toThrow("Backend respondeu 500");
  });
});

describe("definirConfiguracao", () => {
  it("envia o caminho escolhido e devolve o estado configurado", async () => {
    const corpo = {
      configurado: true,
      planilha_acessivel: true,
      requer_revalidacao: false,
      caminho_planilha_oficial: "G:\\Meu Drive\\Controle de Diárias.xlsx",
      configurado_em: "2026-07-30T14:32:10",
    };
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => respostaOk(corpo));
    vi.stubGlobal("fetch", fetchMock);

    const estado = await definirConfiguracao("G:\\Meu Drive\\Controle de Diárias.xlsx");

    expect(estado).toEqual(corpo);
    const [, opcoes] = fetchMock.mock.calls[0];
    expect(JSON.parse(opcoes!.body as string)).toEqual({
      caminho_planilha_oficial: "G:\\Meu Drive\\Controle de Diárias.xlsx",
    });
  });

  it("planilha inválida — mensagem específica do backend (422)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => resposta422("Aba 'Controle de Diárias' não encontrada na planilha")),
    );

    await expect(definirConfiguracao("C:\\qualquer.xlsx")).rejects.toThrow(
      "Aba 'Controle de Diárias' não encontrada na planilha",
    );
  });
});
