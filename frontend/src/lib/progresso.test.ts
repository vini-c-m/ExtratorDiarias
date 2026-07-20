import { describe, expect, it } from "vitest";
import { calcularPercentual, estimarTempoRestanteMs, formatarDuracao } from "./progresso";

describe("calcularPercentual", () => {
  it("calcula a porcentagem arredondada", () => {
    expect(calcularPercentual(17, 43)).toBe(40); // 39.5% arredonda para 40
    expect(calcularPercentual(1, 3)).toBe(33);
    expect(calcularPercentual(0, 43)).toBe(0);
    expect(calcularPercentual(43, 43)).toBe(100);
  });

  it("total zero não gera divisão por zero", () => {
    expect(calcularPercentual(0, 0)).toBe(0);
  });

  it("nunca passa de 100 nem fica negativo", () => {
    expect(calcularPercentual(50, 43)).toBe(100);
    expect(calcularPercentual(-5, 43)).toBe(0);
  });
});

describe("formatarDuracao", () => {
  it("formata segundos com uma casa decimal abaixo de 1 minuto", () => {
    expect(formatarDuracao(1500)).toBe("1.5s");
    expect(formatarDuracao(59_000)).toBe("59.0s");
  });

  it("formata minutos e segundos a partir de 1 minuto", () => {
    expect(formatarDuracao(60_000)).toBe("1min 0s");
    expect(formatarDuracao(125_000)).toBe("2min 5s");
  });

  it("valores negativos são tratados como zero", () => {
    expect(formatarDuracao(-100)).toBe("0.0s");
  });
});

describe("estimarTempoRestanteMs", () => {
  it("projeta linearmente a média já observada", () => {
    // 2 PDFs em 10s -> 5s/PDF em média; faltam 3 -> 15s
    expect(estimarTempoRestanteMs(10_000, 2, 5)).toBe(15_000);
  });

  it("sem nenhum PDF concluído ainda, não há base para estimar", () => {
    expect(estimarTempoRestanteMs(3_000, 0, 5)).toBeNull();
  });

  it("todos já concluídos não precisa de estimativa", () => {
    expect(estimarTempoRestanteMs(10_000, 5, 5)).toBeNull();
  });
});
