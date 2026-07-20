import { describe, expect, it } from "vitest";
import { mensagemAmigavel } from "./mensagens";

describe("mensagemAmigavel", () => {
  it("traduz falha de rede/fetch", () => {
    expect(mensagemAmigavel(new TypeError("Failed to fetch"))).toBe(
      "Não foi possível conectar ao aplicativo. Verifique se ele está aberto e tente novamente.",
    );
  });

  it("traduz arquivo em uso por outro programa (ex.: Excel aberto)", () => {
    const erro = new Error("EBUSY: resource busy or locked, open 'planilha.xlsx'");
    expect(mensagemAmigavel(erro)).toBe(
      "Não foi possível concluir a operação porque o arquivo está aberto em outro programa (ex.: Excel). Feche-o e tente novamente.",
    );
  });

  it("traduz arquivo não encontrado", () => {
    const erro = new Error("ENOENT: no such file or directory");
    expect(mensagemAmigavel(erro)).toBe(
      "O arquivo não foi encontrado. Ele pode ter sido movido ou excluído.",
    );
  });

  it("traduz erro genérico de servidor (5xx)", () => {
    expect(mensagemAmigavel(new Error("Backend respondeu 500"))).toBe(
      "Ocorreu um erro inesperado. Tente novamente em instantes.",
    );
  });

  it("mensagens já curadas pelo backend passam direto, sem reescrita", () => {
    const mensagemDeNegocio =
      "Não foi possível gravar a planilha — feche o arquivo no Excel e tente novamente";
    expect(mensagemAmigavel(new Error(mensagemDeNegocio))).toBe(mensagemDeNegocio);
  });

  it("sem mensagem nenhuma, usa a reserva informada", () => {
    expect(mensagemAmigavel(new Error(""), "reserva customizada")).toBe("reserva customizada");
    expect(mensagemAmigavel(null, "reserva customizada")).toBe("reserva customizada");
  });

  it("usa a reserva padrão quando nenhuma é informada", () => {
    expect(mensagemAmigavel(undefined)).toBe("Não foi possível concluir a operação. Tente novamente.");
  });
});
