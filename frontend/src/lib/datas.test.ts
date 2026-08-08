import { describe, expect, it } from "vitest";
import { formatarDataBr, formatarPeriodoBr, formatarPeriodoMensal } from "./datas";

describe("formatarDataBr", () => {
  it("converte uma data ISO para o formato brasileiro", () => {
    expect(formatarDataBr("2025-01-08")).toBe("08/01/2025");
  });

  it("entrada malformada devolve o valor original, sem lançar", () => {
    expect(formatarDataBr("não-é-data")).toBe("não-é-data");
  });
});

describe("formatarPeriodoBr", () => {
  it("mesmo mês/ano: mostra só o dia final por extenso, dia inicial compacto", () => {
    expect(formatarPeriodoBr("2025-01-08", "2025-01-10")).toBe("08–10/01/2025");
  });

  it("meses/anos diferentes: mostra as duas datas completas", () => {
    expect(formatarPeriodoBr("2024-12-22", "2025-01-10")).toBe("22/12/2024 – 10/01/2025");
  });
});

describe("formatarPeriodoMensal", () => {
  it("formata a chave YYYY-MM como mês abreviado/ano", () => {
    expect(formatarPeriodoMensal("2026-07")).toBe("jul/2026");
  });

  it("mês malformado devolve o valor bruto, sem lançar", () => {
    expect(formatarPeriodoMensal("2026-99")).toBe("99/2026");
  });
});
