// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useOpcoesFiltro } from "./useOpcoesFiltro";

vi.mock("../services/api", async (importarOriginal) => {
  const real = await importarOriginal<typeof import("../services/api")>();
  return { ...real, obterOpcoesFiltro: vi.fn() };
});

import { obterOpcoesFiltro } from "../services/api";

const obterOpcoesFiltroMock = vi.mocked(obterOpcoesFiltro);

afterEach(() => {
  vi.resetAllMocks();
});

describe("useOpcoesFiltro", () => {
  it("busca as opções ao montar quando backendOnline é true", async () => {
    const opcoes = { motivos: ["Curso"], situacoes: ["Em exercício"], municipios: ["Recife"] };
    obterOpcoesFiltroMock.mockResolvedValue(opcoes);

    const { result } = renderHook(() => useOpcoesFiltro(true));

    expect(result.current.carregando).toBe(true);
    await waitFor(() => expect(result.current.carregando).toBe(false));
    expect(result.current.opcoes).toEqual(opcoes);
    expect(result.current.erro).toBeNull();
  });

  it("não busca nada enquanto backendOnline é false", () => {
    renderHook(() => useOpcoesFiltro(false));

    expect(obterOpcoesFiltroMock).not.toHaveBeenCalled();
  });

  it("falha na busca vira mensagem amigável em erro, opções permanecem null", async () => {
    obterOpcoesFiltroMock.mockRejectedValue(new Error("Não foi possível acessar os registros."));

    const { result } = renderHook(() => useOpcoesFiltro(true));

    await waitFor(() => expect(result.current.carregando).toBe(false));
    expect(result.current.erro).toBe("Não foi possível acessar os registros.");
    expect(result.current.opcoes).toBeNull();
  });

  // Sprint 18.5.1 — correção NC2 da auditoria: `tentarNovamente` exposto
  // pelo hook (antes, `AbaPesquisa` nem tinha acesso à falha).
  describe("tentarNovamente", () => {
    it("depois de uma falha, tentarNovamente refaz a busca", async () => {
      obterOpcoesFiltroMock.mockRejectedValueOnce(new Error("falhou"));
      const { result } = renderHook(() => useOpcoesFiltro(true));
      await waitFor(() => expect(result.current.erro).not.toBeNull());

      const opcoes = { motivos: ["Curso"], situacoes: [], municipios: [] };
      obterOpcoesFiltroMock.mockResolvedValueOnce(opcoes);
      act(() => result.current.tentarNovamente());

      await waitFor(() => expect(result.current.opcoes).toEqual(opcoes));
      expect(result.current.erro).toBeNull();
      expect(obterOpcoesFiltroMock).toHaveBeenCalledTimes(2);
    });

    it("uma nova falha após tentarNovamente continua expondo o erro", async () => {
      obterOpcoesFiltroMock.mockRejectedValueOnce(new Error("primeira falha"));
      const { result } = renderHook(() => useOpcoesFiltro(true));
      await waitFor(() => expect(result.current.erro).toBe("primeira falha"));

      obterOpcoesFiltroMock.mockRejectedValueOnce(new Error("segunda falha"));
      act(() => result.current.tentarNovamente());

      await waitFor(() => expect(result.current.erro).toBe("segunda falha"));
      expect(result.current.opcoes).toBeNull();
    });
  });
});
