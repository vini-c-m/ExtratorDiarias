// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useDiarias } from "./useDiarias";
import type { ResultadoPesquisaResposta } from "../types/analitica";

vi.mock("../services/api", async (importarOriginal) => {
  const real = await importarOriginal<typeof import("../services/api")>();
  return { ...real, pesquisarDiarias: vi.fn() };
});

import { pesquisarDiarias } from "../services/api";

const pesquisarDiariasMock = vi.mocked(pesquisarDiarias);

const RESULTADO_BASE: ResultadoPesquisaResposta = {
  itens: [],
  paginacao: { pagina_atual: 1, tamanho_pagina: 25, total_itens: 0, total_paginas: 0 },
  sincronizacao: { sincronizado_em: "2026-08-01T10:00:00", total_avisos: 0 },
};

afterEach(() => {
  vi.resetAllMocks();
});

describe("useDiarias", () => {
  it("busca ao montar com os parâmetros padrão + q semeado por qInicial", async () => {
    pesquisarDiariasMock.mockResolvedValue(RESULTADO_BASE);

    const { result } = renderHook(() => useDiarias("araripina"));

    expect(result.current.carregando).toBe(true);
    await waitFor(() => expect(result.current.carregando).toBe(false));
    expect(pesquisarDiariasMock).toHaveBeenCalledTimes(1);
    expect(pesquisarDiariasMock).toHaveBeenCalledWith({
      q: "araripina",
      pagina: 1,
      tamanho_pagina: 25,
    });
    expect(result.current.resultado).toEqual(RESULTADO_BASE);
  });

  it("qInicial vazio não popula q", async () => {
    pesquisarDiariasMock.mockResolvedValue(RESULTADO_BASE);

    renderHook(() => useDiarias(""));

    await waitFor(() => expect(pesquisarDiariasMock).toHaveBeenCalledTimes(1));
    const [parametros] = pesquisarDiariasMock.mock.calls[0];
    expect(parametros.q).toBeUndefined();
  });

  it("aplicarFiltro atualiza o estado, dispara nova busca e volta para a página 1", async () => {
    pesquisarDiariasMock.mockResolvedValue(RESULTADO_BASE);
    const { result } = renderHook(() => useDiarias(""));
    await waitFor(() => expect(result.current.carregando).toBe(false));

    act(() => result.current.irParaPagina(3));
    await waitFor(() => expect(result.current.filtros.pagina).toBe(3));

    act(() => result.current.aplicarFiltro({ municipio: "Araripina" }));

    await waitFor(() => expect(pesquisarDiariasMock).toHaveBeenCalledTimes(3));
    expect(result.current.filtros.municipio).toBe("Araripina");
    expect(result.current.filtros.pagina).toBe(1);
  });

  it("removerFiltro limpa só o campo indicado e volta para a página 1", async () => {
    pesquisarDiariasMock.mockResolvedValue(RESULTADO_BASE);
    const { result } = renderHook(() => useDiarias(""));
    await waitFor(() => expect(result.current.carregando).toBe(false));

    act(() => result.current.aplicarFiltro({ municipio: "Araripina", motivo: "Curso" }));
    await waitFor(() => expect(result.current.filtros.municipio).toBe("Araripina"));

    act(() => result.current.removerFiltro("municipio"));

    await waitFor(() => expect(result.current.filtros.municipio).toBeUndefined());
    expect(result.current.filtros.motivo).toBe("Curso");
  });

  it("irParaPagina muda só a página, mantendo os demais filtros", async () => {
    pesquisarDiariasMock.mockResolvedValue(RESULTADO_BASE);
    const { result } = renderHook(() => useDiarias(""));
    await waitFor(() => expect(result.current.carregando).toBe(false));

    act(() => result.current.irParaPagina(4));

    await waitFor(() => expect(result.current.filtros.pagina).toBe(4));
    expect(pesquisarDiariasMock).toHaveBeenLastCalledWith(expect.objectContaining({ pagina: 4 }));
  });

  it("ordenarPor num campo novo assume ordem ascendente", async () => {
    pesquisarDiariasMock.mockResolvedValue(RESULTADO_BASE);
    const { result } = renderHook(() => useDiarias(""));
    await waitFor(() => expect(result.current.carregando).toBe(false));

    act(() => result.current.ordenarPor("valor"));

    await waitFor(() => expect(result.current.filtros.ordenar_por).toBe("valor"));
    expect(result.current.filtros.ordem).toBe("asc");
  });

  it("ordenarPor no mesmo campo já ativo alterna a direção", async () => {
    pesquisarDiariasMock.mockResolvedValue(RESULTADO_BASE);
    const { result } = renderHook(() => useDiarias(""));
    await waitFor(() => expect(result.current.carregando).toBe(false));

    act(() => result.current.ordenarPor("valor"));
    await waitFor(() => expect(result.current.filtros.ordem).toBe("asc"));

    act(() => result.current.ordenarPor("valor"));
    await waitFor(() => expect(result.current.filtros.ordem).toBe("desc"));
  });

  it("qInicial muda depois da montagem: aplica o novo termo sem duplicar a busca inicial", async () => {
    pesquisarDiariasMock.mockResolvedValue(RESULTADO_BASE);
    const { result, rerender } = renderHook(({ q }) => useDiarias(q), { initialProps: { q: "" } });
    await waitFor(() => expect(pesquisarDiariasMock).toHaveBeenCalledTimes(1));

    rerender({ q: "novoTermo" });

    await waitFor(() => expect(result.current.filtros.q).toBe("novoTermo"));
    expect(pesquisarDiariasMock).toHaveBeenCalledTimes(2);
  });

  it("erro na busca vira mensagem amigável, resultado volta a null", async () => {
    pesquisarDiariasMock.mockRejectedValue(new Error("Não foi possível acessar os registros."));

    const { result } = renderHook(() => useDiarias(""));

    await waitFor(() => expect(result.current.carregando).toBe(false));
    expect(result.current.erro).toBe("Não foi possível acessar os registros.");
    expect(result.current.resultado).toBeNull();
  });

  it("tentarNovamente refaz a busca com os filtros atuais", async () => {
    pesquisarDiariasMock.mockRejectedValueOnce(new Error("falhou"));
    const { result } = renderHook(() => useDiarias(""));
    await waitFor(() => expect(result.current.erro).not.toBeNull());

    pesquisarDiariasMock.mockResolvedValueOnce(RESULTADO_BASE);
    act(() => result.current.tentarNovamente());

    await waitFor(() => expect(result.current.resultado).toEqual(RESULTADO_BASE));
    expect(result.current.erro).toBeNull();
  });

  // Sprint 18.5.1 — correção NC1 da auditoria: "Limpar filtros".
  describe("limparFiltros", () => {
    it("remove todos os filtros de negócio de uma vez e volta para a página 1", async () => {
      pesquisarDiariasMock.mockResolvedValue(RESULTADO_BASE);
      const { result } = renderHook(() => useDiarias(""));
      await waitFor(() => expect(result.current.carregando).toBe(false));

      act(() =>
        result.current.aplicarFiltro({ municipio: "Araripina", motivo: "Curso", periodo_inicial: "2025-01-01" }),
      );
      await waitFor(() => expect(result.current.filtros.municipio).toBe("Araripina"));
      act(() => result.current.irParaPagina(3));
      await waitFor(() => expect(result.current.filtros.pagina).toBe(3));

      act(() => result.current.limparFiltros());

      await waitFor(() => expect(result.current.filtros.pagina).toBe(1));
      expect(result.current.filtros.municipio).toBeUndefined();
      expect(result.current.filtros.motivo).toBeUndefined();
      expect(result.current.filtros.periodo_inicial).toBeUndefined();
    });

    it("mantém tamanho_pagina/ordenar_por/ordem intocados (limpa só os filtros de negócio)", async () => {
      pesquisarDiariasMock.mockResolvedValue(RESULTADO_BASE);
      const { result } = renderHook(() => useDiarias(""));
      await waitFor(() => expect(result.current.carregando).toBe(false));

      act(() => result.current.ordenarPor("valor"));
      await waitFor(() => expect(result.current.filtros.ordenar_por).toBe("valor"));
      act(() => result.current.aplicarFiltro({ municipio: "Araripina" }));
      await waitFor(() => expect(result.current.filtros.municipio).toBe("Araripina"));

      act(() => result.current.limparFiltros());

      await waitFor(() => expect(result.current.filtros.municipio).toBeUndefined());
      expect(result.current.filtros.ordenar_por).toBe("valor");
      expect(result.current.filtros.tamanho_pagina).toBe(25);
    });

    // Sprint 19.5.3 — confirma que os 5 campos novos (origem/destino/
    // trecho/valor_minimo/valor_maximo) já fazem parte de `CAMPOS_DE_FILTRO`
    // — `limparFiltros` os limpa como qualquer outro filtro de negócio,
    // sem lista própria a manter sincronizada.
    it("limpa também origem/destino/trecho/valor_minimo/valor_maximo", async () => {
      pesquisarDiariasMock.mockResolvedValue(RESULTADO_BASE);
      const { result } = renderHook(() => useDiarias(""));
      await waitFor(() => expect(result.current.carregando).toBe(false));

      act(() =>
        result.current.aplicarFiltro({
          origem: "Recife",
          destino: "Araripina",
          trecho: "Recife - Araripina",
          valor_minimo: "100",
          valor_maximo: "500",
        }),
      );
      await waitFor(() => expect(result.current.filtros.origem).toBe("Recife"));

      act(() => result.current.limparFiltros());

      await waitFor(() => expect(result.current.filtros.origem).toBeUndefined());
      expect(result.current.filtros.destino).toBeUndefined();
      expect(result.current.filtros.trecho).toBeUndefined();
      expect(result.current.filtros.valor_minimo).toBeUndefined();
      expect(result.current.filtros.valor_maximo).toBeUndefined();
    });
  });

  // Sprint 18.5.1 — correção B3 da auditoria: uma resposta de uma pesquisa
  // antiga (ainda em voo quando os filtros mudaram de novo) nunca deve
  // sobrescrever o resultado de uma pesquisa mais recente, mesmo que a
  // resposta antiga chegue depois.
  it("resposta de uma pesquisa antiga, resolvida fora de ordem, nunca sobrescreve a mais recente", async () => {
    let resolverPrimeira!: (valor: ResultadoPesquisaResposta) => void;
    let resolverSegunda!: (valor: ResultadoPesquisaResposta) => void;
    const primeiraPromise = new Promise<ResultadoPesquisaResposta>((resolve) => {
      resolverPrimeira = resolve;
    });
    const segundaPromise = new Promise<ResultadoPesquisaResposta>((resolve) => {
      resolverSegunda = resolve;
    });

    pesquisarDiariasMock.mockResolvedValueOnce(RESULTADO_BASE);
    const { result } = renderHook(() => useDiarias(""));
    await waitFor(() => expect(result.current.carregando).toBe(false));

    const RESULTADO_ANTIGO: ResultadoPesquisaResposta = {
      ...RESULTADO_BASE,
      paginacao: { ...RESULTADO_BASE.paginacao, total_itens: 1 },
    };
    const RESULTADO_NOVO: ResultadoPesquisaResposta = {
      ...RESULTADO_BASE,
      paginacao: { ...RESULTADO_BASE.paginacao, total_itens: 2 },
    };

    pesquisarDiariasMock.mockReturnValueOnce(primeiraPromise);
    act(() => result.current.aplicarFiltro({ municipio: "Araripina" }));

    pesquisarDiariasMock.mockReturnValueOnce(segundaPromise);
    act(() => result.current.aplicarFiltro({ motivo: "Curso" }));

    // A pesquisa mais recente resolve primeiro...
    await act(async () => {
      resolverSegunda(RESULTADO_NOVO);
    });
    await waitFor(() => expect(result.current.resultado).toEqual(RESULTADO_NOVO));

    // ...e só depois a mais antiga (que já deveria ter sido cancelada).
    await act(async () => {
      resolverPrimeira(RESULTADO_ANTIGO);
    });

    expect(result.current.resultado).toEqual(RESULTADO_NOVO);
  });
});
