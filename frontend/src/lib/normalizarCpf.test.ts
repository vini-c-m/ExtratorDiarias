import { describe, expect, it } from "vitest";
import { cpfValido, normalizarCpf } from "./normalizarCpf";

describe("normalizarCpf", () => {
  it("remove pontuação e traço de um CPF mascarado", () => {
    expect(normalizarCpf("123.456.789-11")).toBe("12345678911");
  });

  it("mantém um CPF já sem máscara inalterado", () => {
    expect(normalizarCpf("12345678911")).toBe("12345678911");
  });

  it("remove espaços e qualquer caractere não numérico", () => {
    expect(normalizarCpf(" 123 456 789 11 ")).toBe("12345678911");
  });

  it("string vazia devolve string vazia", () => {
    expect(normalizarCpf("")).toBe("");
  });
});

describe("cpfValido", () => {
  it("11 dígitos após normalizar é válido, mascarado ou não", () => {
    expect(cpfValido("123.456.789-11")).toBe(true);
    expect(cpfValido("12345678911")).toBe(true);
  });

  it("menos de 11 dígitos é inválido", () => {
    expect(cpfValido("123.456.789")).toBe(false);
  });

  it("mais de 11 dígitos é inválido", () => {
    expect(cpfValido("123.456.789-1122")).toBe(false);
  });

  it("string vazia é inválida", () => {
    expect(cpfValido("")).toBe(false);
  });
});
