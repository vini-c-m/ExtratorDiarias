// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { COLUNAS_OPCIONAIS_DISPONIVEIS, useColunasTabela } from "./useColunasTabela";

describe("useColunasTabela", () => {
  it("começa sem nenhuma coluna opcional ativa", () => {
    const { result } = renderHook(() => useColunasTabela());
    expect(result.current.colunasAtivas.size).toBe(0);
  });

  it("alternarColuna ativa uma coluna inativa", () => {
    const { result } = renderHook(() => useColunasTabela());

    act(() => result.current.alternarColuna("motivo"));

    expect(result.current.colunasAtivas.has("motivo")).toBe(true);
    expect(result.current.colunasAtivas.has("matricula")).toBe(false);
  });

  it("alternarColuna desativa uma coluna já ativa (toggle)", () => {
    const { result } = renderHook(() => useColunasTabela());

    act(() => result.current.alternarColuna("motivo"));
    expect(result.current.colunasAtivas.has("motivo")).toBe(true);

    act(() => result.current.alternarColuna("motivo"));
    expect(result.current.colunasAtivas.has("motivo")).toBe(false);
  });

  it("colunas são independentes entre si", () => {
    const { result } = renderHook(() => useColunasTabela());

    act(() => result.current.alternarColuna("motivo"));
    act(() => result.current.alternarColuna("matricula"));

    expect(result.current.colunasAtivas.has("motivo")).toBe(true);
    expect(result.current.colunasAtivas.has("matricula")).toBe(true);

    act(() => result.current.alternarColuna("motivo"));
    expect(result.current.colunasAtivas.has("motivo")).toBe(false);
    expect(result.current.colunasAtivas.has("matricula")).toBe(true);
  });

  it("COLUNAS_OPCIONAIS_DISPONIVEIS lista as 8 colunas do wireframe (Sprint 19.5.7.1)", () => {
    expect(COLUNAS_OPCIONAIS_DISPONIVEIS).toEqual([
      "motivo",
      "matricula",
      "origem",
      "trecho",
      "situacao",
      "cpf",
      "doc_origem",
      "transporte",
    ]);
  });

  it("as 6 colunas novas também podem ser ativadas/desativadas independentemente", () => {
    const { result } = renderHook(() => useColunasTabela());

    act(() => result.current.alternarColuna("origem"));
    act(() => result.current.alternarColuna("cpf"));

    expect(result.current.colunasAtivas.has("origem")).toBe(true);
    expect(result.current.colunasAtivas.has("cpf")).toBe(true);
    expect(result.current.colunasAtivas.has("trecho")).toBe(false);

    act(() => result.current.alternarColuna("origem"));
    expect(result.current.colunasAtivas.has("origem")).toBe(false);
    expect(result.current.colunasAtivas.has("cpf")).toBe(true);
  });
});
