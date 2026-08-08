// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IndicadoresResposta, ParametrosPesquisaDiariasQuery } from "../../../types/analitica";

vi.mock("../../../services/api", async (importarOriginal) => {
  const real = await importarOriginal<typeof import("../../../services/api")>();
  return { ...real, obterIndicadores: vi.fn() };
});

import { useComparacaoExecutiva } from "./useComparacaoExecutiva";
import { obterIndicadores } from "../../../services/api";

const obterIndicadoresMock = vi.mocked(obterIndicadores);

const INDICADORES_A: IndicadoresResposta = {
  total_diarias: 312,
  total_servidores: 298,
  valor_total: 149760,
  valor_medio: 480,
  sincronizacao: { sincronizado_em: "2026-08-01T10:00:00", total_avisos: 0 },
};

const INDICADORES_B: IndicadoresResposta = {
  total_diarias: 289,
  total_servidores: 270,
  valor_total: 138200,
  valor_medio: 478,
  sincronizacao: { sincronizado_em: "2026-07-01T10:00:00", total_avisos: 0 },
};

function filtrosBase(): ParametrosPesquisaDiariasQuery {
  return { pagina: 1, tamanho_pagina: 25 };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-08-05T12:00:00"));
  obterIndicadoresMock.mockResolvedValue(INDICADORES_B);
});

afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
});

describe("useComparacaoExecutiva", () => {
  it("começa inativa, sem nenhuma chamada a obterIndicadores", () => {
    const { result } = renderHook(() => useComparacaoExecutiva(filtrosBase(), INDICADORES_A, vi.fn()));

    expect(result.current.ativa).toBe(false);
    expect(obterIndicadoresMock).not.toHaveBeenCalled();
  });

  it("'mes_anterior': aplica o mês atual em A (via onMudarFiltroA) e busca o mês anterior para B", async () => {
    const onMudarFiltroA = vi.fn();
    const { result } = renderHook(() => useComparacaoExecutiva(filtrosBase(), INDICADORES_A, onMudarFiltroA));

    act(() => result.current.iniciar("mes_anterior"));

    expect(onMudarFiltroA).toHaveBeenCalledWith({ periodo_inicial: "2026-08-01", periodo_final: "2026-08-05" });
    await waitFor(() =>
      expect(obterIndicadoresMock).toHaveBeenCalledWith(
        expect.objectContaining({ periodo_inicial: "2026-07-01", periodo_final: "2026-07-31" }),
      ),
    );
    expect(result.current.ativa).toBe(true);
  });

  it("'ano_anterior': aplica o ano atual em A e busca o ano anterior inteiro para B", async () => {
    const onMudarFiltroA = vi.fn();
    const { result } = renderHook(() => useComparacaoExecutiva(filtrosBase(), INDICADORES_A, onMudarFiltroA));

    act(() => result.current.iniciar("ano_anterior"));

    expect(onMudarFiltroA).toHaveBeenCalledWith({ periodo_inicial: "2026-01-01", periodo_final: "2026-12-31" });
    await waitFor(() =>
      expect(obterIndicadoresMock).toHaveBeenCalledWith(
        expect.objectContaining({ periodo_inicial: "2025-01-01", periodo_final: "2025-12-31" }),
      ),
    );
  });

  it("'membros_servidores': aplica MEMBRO em A quando o recorte não tem categoria definida, e busca SERVIDOR para B", async () => {
    const onMudarFiltroA = vi.fn();
    const { result } = renderHook(() => useComparacaoExecutiva(filtrosBase(), INDICADORES_A, onMudarFiltroA));

    act(() => result.current.iniciar("membros_servidores"));

    expect(onMudarFiltroA).toHaveBeenCalledWith({ categoria_funcional: "MEMBRO" });
    await waitFor(() =>
      expect(obterIndicadoresMock).toHaveBeenCalledWith(expect.objectContaining({ categoria_funcional: "SERVIDOR" })),
    );
  });

  it("'membros_servidores' preserva todos os demais filtros entre A e B — só categoria_funcional muda", async () => {
    const filtrosComOutrosCampos: ParametrosPesquisaDiariasQuery = {
      ...filtrosBase(),
      municipio: "Araripina-PE",
      motivo: "Fiscalização",
    };
    const { result } = renderHook(() => useComparacaoExecutiva(filtrosComOutrosCampos, INDICADORES_A, vi.fn()));

    act(() => result.current.iniciar("membros_servidores"));

    await waitFor(() =>
      expect(obterIndicadoresMock).toHaveBeenCalledWith(
        expect.objectContaining({ municipio: "Araripina-PE", motivo: "Fiscalização", categoria_funcional: "SERVIDOR" }),
      ),
    );
  });

  it("recorte já com categoria_funcional=SERVIDOR: 'membros_servidores' mantém A=SERVIDOR e compara com B=MEMBRO", async () => {
    const onMudarFiltroA = vi.fn();
    const filtrosComServidor: ParametrosPesquisaDiariasQuery = { ...filtrosBase(), categoria_funcional: "SERVIDOR" };
    const { result } = renderHook(() => useComparacaoExecutiva(filtrosComServidor, INDICADORES_A, onMudarFiltroA));

    act(() => result.current.iniciar("membros_servidores"));

    expect(onMudarFiltroA).toHaveBeenCalledWith({ categoria_funcional: "SERVIDOR" });
    await waitFor(() =>
      expect(obterIndicadoresMock).toHaveBeenCalledWith(expect.objectContaining({ categoria_funcional: "MEMBRO" })),
    );
  });

  it("expõe indicadoresPrimeiro=A/indicadoresSegundo=B por padrão, e troca com inverter()", async () => {
    const { result } = renderHook(() => useComparacaoExecutiva(filtrosBase(), INDICADORES_A, vi.fn()));
    act(() => result.current.iniciar("mes_anterior"));
    await waitFor(() => expect(result.current.indicadoresSegundo).toEqual(INDICADORES_B));
    expect(result.current.indicadoresPrimeiro).toEqual(INDICADORES_A);

    act(() => result.current.inverter());

    expect(result.current.indicadoresPrimeiro).toEqual(INDICADORES_B);
    expect(result.current.indicadoresSegundo).toEqual(INDICADORES_A);
  });

  it("encerrar() volta ativa=false e preserva o recorte A (nunca desfaz o filtro já aplicado)", async () => {
    const onMudarFiltroA = vi.fn();
    const { result } = renderHook(() => useComparacaoExecutiva(filtrosBase(), INDICADORES_A, onMudarFiltroA));
    act(() => result.current.iniciar("mes_anterior"));
    await waitFor(() => expect(result.current.ativa).toBe(true));
    onMudarFiltroA.mockClear();

    act(() => result.current.encerrar());

    expect(result.current.ativa).toBe(false);
    expect(onMudarFiltroA).not.toHaveBeenCalled();
  });

  it("erro na busca de B fica isolado em erroSegundo, sem afetar indicadoresPrimeiro (A)", async () => {
    obterIndicadoresMock.mockRejectedValueOnce(new Error("falhou"));
    const { result } = renderHook(() => useComparacaoExecutiva(filtrosBase(), INDICADORES_A, vi.fn()));

    act(() => result.current.iniciar("mes_anterior"));

    await waitFor(() => expect(result.current.erroSegundo).not.toBeNull());
    expect(result.current.indicadoresPrimeiro).toEqual(INDICADORES_A);
    expect(result.current.indicadoresSegundo).toBeNull();
  });
});
