import { describe, expect, it } from "vitest";
import { formatarVariacaoPercentual, variacaoPercentual } from "./variacao";

describe("variacaoPercentual", () => {
  it("calcula a variação percentual entre dois valores", () => {
    expect(variacaoPercentual(100, 118.4)).toBeCloseTo(18.4);
  });

  it("anterior nulo devolve null", () => {
    expect(variacaoPercentual(null, 100)).toBeNull();
  });

  it("atual nulo devolve null", () => {
    expect(variacaoPercentual(100, null)).toBeNull();
  });

  it("anterior zero devolve null (nunca Infinity)", () => {
    expect(variacaoPercentual(0, 100)).toBeNull();
  });
});

describe("formatarVariacaoPercentual", () => {
  it("variação positiva ganha sinal +", () => {
    expect(formatarVariacaoPercentual(100, 118.4)).toBe("+18,4%");
  });

  it("variação negativa já tem o sinal -, sem duplicar", () => {
    expect(formatarVariacaoPercentual(100, 85.6)).toBe("-14,4%");
  });

  it("sem base de comparação devolve null", () => {
    expect(formatarVariacaoPercentual(null, 100)).toBeNull();
  });
});
