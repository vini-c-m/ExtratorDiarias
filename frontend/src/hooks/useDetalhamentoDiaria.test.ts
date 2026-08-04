// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useDetalhamentoDiaria } from "./useDetalhamentoDiaria";
import type { DiariaCompletaResposta } from "../types/analitica";

vi.mock("../services/api", async (importarOriginal) => {
  const real = await importarOriginal<typeof import("../services/api")>();
  return { ...real, detalharDiaria: vi.fn() };
});

import { DiariaNaoEncontradaError, detalharDiaria } from "../services/api";

const detalharDiariaMock = vi.mocked(detalharDiaria);

const REGISTRO: DiariaCompletaResposta = {
  sei: "19.20.0903.0030720/2024-36",
  periodo: { inicial: "2025-01-08", final: "2025-01-10" },
  destino: "Araripina-PE",
  servidor: { nome: "João da Silva", cargo: "Analista", previdencia: "RPPS", matricula: "12345", situacao: "Em exercício" },
  motivo: "Curso",
  valor_total_diarias: 480,
  doc_origem: "processo.pdf",
  cpf: "12345678911",
  trecho: { origem: "Recife", destino: "Araripina-PE" },
  transporte: "Rodoviário",
  referencia_administrativa: { linha_planilha: 42 },
  sincronizacao: { sincronizado_em: "2026-08-01T10:00:00", total_avisos: 0 },
  diagnosticos: [],
};

afterEach(() => {
  vi.resetAllMocks();
});

describe("useDetalhamentoDiaria", () => {
  it("sei null: não busca nada, estado inicial", () => {
    const { result } = renderHook(() => useDetalhamentoDiaria(null));

    expect(detalharDiariaMock).not.toHaveBeenCalled();
    expect(result.current).toEqual({ carregando: false, erro: null, naoEncontrada: false, registro: null });
  });

  it("sei definido: busca e devolve o registro", async () => {
    detalharDiariaMock.mockResolvedValue(REGISTRO);

    const { result } = renderHook(() => useDetalhamentoDiaria(REGISTRO.sei));

    expect(result.current.carregando).toBe(true);
    await waitFor(() => expect(result.current.carregando).toBe(false));
    expect(result.current.registro).toEqual(REGISTRO);
    expect(detalharDiariaMock).toHaveBeenCalledWith(REGISTRO.sei);
  });

  it("falha técnica na busca vira mensagem amigável em `erro`, nunca em `naoEncontrada`", async () => {
    detalharDiariaMock.mockRejectedValue(new Error("Não foi possível acessar os registros."));

    const { result } = renderHook(() => useDetalhamentoDiaria("x"));

    await waitFor(() => expect(result.current.carregando).toBe(false));
    expect(result.current.erro).toBe("Não foi possível acessar os registros.");
    expect(result.current.naoEncontrada).toBe(false);
    expect(result.current.registro).toBeNull();
  });

  // Sprint 18.5.1 — correção B1 da auditoria (RN-08): 404 é resultado de
  // negócio, nunca falha técnica — precisa de um estado próprio.
  describe("diária não encontrada (404)", () => {
    it("DiariaNaoEncontradaError vira `naoEncontrada: true`, nunca `erro`", async () => {
      detalharDiariaMock.mockRejectedValue(new DiariaNaoEncontradaError("sei-inexistente"));

      const { result } = renderHook(() => useDetalhamentoDiaria("sei-inexistente"));

      await waitFor(() => expect(result.current.carregando).toBe(false));
      expect(result.current.naoEncontrada).toBe(true);
      expect(result.current.erro).toBeNull();
      expect(result.current.registro).toBeNull();
    });

    it("trocar de um sei não encontrado para um sei válido limpa `naoEncontrada`", async () => {
      detalharDiariaMock.mockRejectedValueOnce(new DiariaNaoEncontradaError("sei-1"));
      const { result, rerender } = renderHook(({ sei }) => useDetalhamentoDiaria(sei), {
        initialProps: { sei: "sei-1" as string | null },
      });
      await waitFor(() => expect(result.current.naoEncontrada).toBe(true));

      detalharDiariaMock.mockResolvedValueOnce(REGISTRO);
      rerender({ sei: "sei-2" });

      await waitFor(() => expect(result.current.registro).toEqual(REGISTRO));
      expect(result.current.naoEncontrada).toBe(false);
    });
  });

  it("sei muda de um valor para outro: busca de novo com o novo sei", async () => {
    detalharDiariaMock.mockResolvedValue(REGISTRO);
    const { result, rerender } = renderHook(({ sei }) => useDetalhamentoDiaria(sei), {
      initialProps: { sei: "sei-1" as string | null },
    });
    await waitFor(() => expect(result.current.carregando).toBe(false));

    rerender({ sei: "sei-2" });

    await waitFor(() => expect(detalharDiariaMock).toHaveBeenCalledTimes(2));
    expect(detalharDiariaMock).toHaveBeenLastCalledWith("sei-2");
  });

  it("sei volta a null: limpa o registro (fecha o painel sem refazer busca)", async () => {
    detalharDiariaMock.mockResolvedValue(REGISTRO);
    const { result, rerender } = renderHook(({ sei }) => useDetalhamentoDiaria(sei), {
      initialProps: { sei: "sei-1" as string | null },
    });
    await waitFor(() => expect(result.current.registro).toEqual(REGISTRO));

    rerender({ sei: null });

    expect(result.current.registro).toBeNull();
    expect(result.current.carregando).toBe(false);
    expect(detalharDiariaMock).toHaveBeenCalledTimes(1);
  });
});
