import { describe, expect, it } from "vitest";
import { mascararCpf } from "./mascararCpf";

describe("mascararCpf", () => {
  it("mascara um CPF válido de 11 dígitos, mantendo só os 2 últimos visíveis", () => {
    expect(mascararCpf("12345678911")).toBe("***.***.***-11");
  });

  it("aceita um CPF já formatado (remove pontuação antes de mascarar)", () => {
    expect(mascararCpf("123.456.789-11")).toBe("***.***.***-11");
  });

  it("entrada com menos de 11 dígitos devolve o valor original, sem lançar", () => {
    expect(mascararCpf("123")).toBe("123");
  });

  it("entrada com mais de 11 dígitos devolve o valor original, sem lançar", () => {
    expect(mascararCpf("123456789112233")).toBe("123456789112233");
  });

  it("string vazia devolve string vazia, sem lançar", () => {
    expect(mascararCpf("")).toBe("");
  });
});
