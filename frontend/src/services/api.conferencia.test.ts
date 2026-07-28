import { afterEach, describe, expect, it, vi } from "vitest";
import { ErroConferenciaIndisponivel, conferir, gerarHistorico } from "./api";

function respostaOk(corpo: unknown) {
  return { ok: true, status: 200, json: async () => corpo };
}

function resposta503() {
  return { ok: false, status: 503, json: async () => ({ detail: "indisponível" }) };
}

// Sprint 13.1 — formato real de erro 422 do FastAPI para os `model_validator`
// de `app/schemas/conferencia.py`: `detail` é uma LISTA de objetos, não uma
// string simples. Reproduzido a partir do corpo observado em
// `backend/tests/integration/test_api_conferencia.py`
// (`test_conferencia_422_periodo_final_antes_do_inicial`).
function resposta422(mensagem: string) {
  return {
    ok: false,
    status: 422,
    json: async () => ({
      detail: [{ type: "value_error", loc: ["body"], msg: `Value error, ${mensagem}` }],
    }),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("conferir", () => {
  it("envia CPF e período no corpo e devolve o resultado do backend", async () => {
    const corpo = { veredito: "APTO_PARA_PROCESSAMENTO", providencia: "Nenhuma", checklist: [] };
    const fetchMock = vi.fn(async (_url: string, _opcoes?: RequestInit) => respostaOk(corpo));
    vi.stubGlobal("fetch", fetchMock);

    const resultado = await conferir("12345678901", "2026-07-21", "2026-07-23");

    expect(resultado).toEqual(corpo);
    const [url, opcoes] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/api/v1/conferencia");
    expect(JSON.parse((opcoes as RequestInit).body as string)).toEqual({
      cpf: "12345678901",
      periodo_inicial: "2026-07-21",
      periodo_final: "2026-07-23",
    });
  });

  it("503 vira ErroConferenciaIndisponivel — nunca um veredito de negócio", async () => {
    const fetchMock = vi.fn(async () => resposta503());
    vi.stubGlobal("fetch", fetchMock);

    await expect(conferir("12345678901", "2026-07-21", "2026-07-23")).rejects.toBeInstanceOf(
      ErroConferenciaIndisponivel,
    );
  });

  it("422 do FastAPI (detail em lista) vira mensagem legível, não '[object Object]'", async () => {
    const fetchMock = vi.fn(async () =>
      resposta422("Período final não pode ser anterior ao período inicial."),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(conferir("12345678901", "2026-06-03", "2026-06-01")).rejects.toThrow(
      "Período final não pode ser anterior ao período inicial.",
    );
  });
});

describe("gerarHistorico", () => {
  it("envia SEI/origem/destino e devolve o texto gerado", async () => {
    const fetchMock = vi.fn(async (_url: string, _opcoes?: RequestInit) =>
      respostaOk({ texto: "TEXTO DO HISTÓRICO" }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const texto = await gerarHistorico(
      "12345678901",
      "2026-07-21",
      "2026-07-23",
      "19.20.0000.0000000/2026-00",
      "Recife",
      "Garanhuns",
    );

    expect(texto).toBe("TEXTO DO HISTÓRICO");
    const [, opcoes] = fetchMock.mock.calls[0];
    expect(JSON.parse((opcoes as RequestInit).body as string)).toEqual({
      cpf: "12345678901",
      periodo_inicial: "2026-07-21",
      periodo_final: "2026-07-23",
      sei: "19.20.0000.0000000/2026-00",
      origem: "Recife",
      destino: "Garanhuns",
    });
  });

  it("503 vira ErroConferenciaIndisponivel", async () => {
    const fetchMock = vi.fn(async () => resposta503());
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      gerarHistorico("12345678901", "2026-07-21", "2026-07-23", "sei", "Recife", "Garanhuns"),
    ).rejects.toBeInstanceOf(ErroConferenciaIndisponivel);
  });

  it("422 do FastAPI (detail em lista) vira mensagem legível, não '[object Object]'", async () => {
    const fetchMock = vi.fn(async () => resposta422("Origem e destino não podem ser iguais."));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      gerarHistorico("12345678901", "2026-07-21", "2026-07-23", "sei", "Recife", "Recife"),
    ).rejects.toThrow("Origem e destino não podem ser iguais.");
  });
});
