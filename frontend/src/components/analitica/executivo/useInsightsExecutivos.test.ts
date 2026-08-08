// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { IndicadoresResposta, ParametrosPesquisaDiariasQuery } from "../../../types/analitica";

vi.mock("../../../services/api", async (importarOriginal) => {
  const real = await importarOriginal<typeof import("../../../services/api")>();
  return { ...real, obterIndicadores: vi.fn() };
});

import { useInsightsExecutivos } from "./useInsightsExecutivos";
import { obterIndicadores } from "../../../services/api";

const obterIndicadoresMock = vi.mocked(obterIndicadores);

const INDICADORES_PERIODO_ANTERIOR: IndicadoresResposta = {
  total_diarias: 100,
  total_servidores: 90,
  valor_total: 50000,
  valor_medio: 500,
  sincronizacao: { sincronizado_em: "2026-06-01T10:00:00", total_avisos: 0 },
};

afterEach(() => {
  vi.resetAllMocks();
});

describe("useInsightsExecutivos", () => {
  it("sem período definido no recorte, nunca busca indicadores do período anterior", () => {
    const filtros: ParametrosPesquisaDiariasQuery = { pagina: 1, tamanho_pagina: 25 };
    const { result } = renderHook(() => useInsightsExecutivos(filtros, 60000, 500, [], [], [], []));

    expect(obterIndicadoresMock).not.toHaveBeenCalled();
    expect(result.current.carregando).toBe(false);
    expect(result.current.insights.find((i) => i.id === "variacao-periodo")).toBeUndefined();
  });

  it("com período definido, busca o intervalo de MESMA DURAÇÃO EM DIAS imediatamente anterior — julho tem 31 dias, junho só 30, então o período anterior começa em 31/05 para preservar os 31 dias (nunca um 'mês anterior' de calendário, que teria uma duração diferente)", async () => {
    obterIndicadoresMock.mockResolvedValue(INDICADORES_PERIODO_ANTERIOR);
    const filtros: ParametrosPesquisaDiariasQuery = {
      pagina: 1,
      tamanho_pagina: 25,
      periodo_inicial: "2026-07-01",
      periodo_final: "2026-07-31",
    };
    renderHook(() => useInsightsExecutivos(filtros, 60000, 500, [], [], [], []));

    await waitFor(() =>
      expect(obterIndicadoresMock).toHaveBeenCalledWith(
        expect.objectContaining({ periodo_inicial: "2026-05-31", periodo_final: "2026-06-30" }),
      ),
    );
  });

  it("recorte de duração ímpar (ex.: 10 dias) preserva a mesma duração no período anterior", async () => {
    obterIndicadoresMock.mockResolvedValue(INDICADORES_PERIODO_ANTERIOR);
    const filtros: ParametrosPesquisaDiariasQuery = {
      pagina: 1,
      tamanho_pagina: 25,
      periodo_inicial: "2026-07-11",
      periodo_final: "2026-07-20",
    };
    renderHook(() => useInsightsExecutivos(filtros, 60000, 500, [], [], [], []));

    // 10 dias (11 a 20/07) → anterior também 10 dias, terminando em 10/07.
    await waitFor(() =>
      expect(obterIndicadoresMock).toHaveBeenCalledWith(
        expect.objectContaining({ periodo_inicial: "2026-07-01", periodo_final: "2026-07-10" }),
      ),
    );
  });

  it("preserva os demais filtros do recorte ao buscar o período anterior", async () => {
    obterIndicadoresMock.mockResolvedValue(INDICADORES_PERIODO_ANTERIOR);
    const filtros: ParametrosPesquisaDiariasQuery = {
      pagina: 1,
      tamanho_pagina: 25,
      periodo_inicial: "2026-07-01",
      periodo_final: "2026-07-31",
      municipio: "Araripina-PE",
    };
    renderHook(() => useInsightsExecutivos(filtros, 60000, 500, [], [], [], []));

    await waitFor(() =>
      expect(obterIndicadoresMock).toHaveBeenCalledWith(expect.objectContaining({ municipio: "Araripina-PE" })),
    );
  });

  it("resultado alimenta o insight de variação", async () => {
    obterIndicadoresMock.mockResolvedValue(INDICADORES_PERIODO_ANTERIOR);
    const filtros: ParametrosPesquisaDiariasQuery = {
      pagina: 1,
      tamanho_pagina: 25,
      periodo_inicial: "2026-07-01",
      periodo_final: "2026-07-31",
    };
    const { result } = renderHook(() => useInsightsExecutivos(filtros, 60000, 500, [], [], [], []));

    await waitFor(() => expect(result.current.insights.find((i) => i.id === "variacao-periodo")).toBeDefined());
    expect(result.current.insights.find((i) => i.id === "variacao-periodo")?.texto).toContain("+20%");
  });

  it("erro na busca fica isolado em erro, com tentarNovamente disponível", async () => {
    obterIndicadoresMock.mockRejectedValueOnce(new Error("falhou"));
    const filtros: ParametrosPesquisaDiariasQuery = {
      pagina: 1,
      tamanho_pagina: 25,
      periodo_inicial: "2026-07-01",
      periodo_final: "2026-07-31",
    };
    const { result } = renderHook(() => useInsightsExecutivos(filtros, 60000, 500, [], [], [], []));

    await waitFor(() => expect(result.current.erro).not.toBeNull());
    expect(result.current.insights).toEqual([]);
  });
});
