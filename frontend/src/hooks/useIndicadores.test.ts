// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useIndicadores } from "./useIndicadores";
import type { IndicadoresResposta, ParametrosPesquisaDiariasQuery } from "../types/analitica";

/** Promessa controlável de fora — permite decidir a ordem exata em que
 * duas chamadas de `obterIndicadores` resolvem, para reproduzir cenários
 * de corrida (Sprint 19.6.2.1, achado da Auditoria Técnica da 19.6.2). */
function criarPromessaControlavel<T>() {
  let resolver!: (valor: T) => void;
  let rejeitador!: (erro: unknown) => void;
  const promessa = new Promise<T>((resolve, reject) => {
    resolver = resolve;
    rejeitador = reject;
  });
  return { promessa, resolver, rejeitador };
}

vi.mock("../services/api", async (importarOriginal) => {
  const real = await importarOriginal<typeof import("../services/api")>();
  return { ...real, obterIndicadores: vi.fn() };
});

import { obterIndicadores } from "../services/api";

const obterIndicadoresMock = vi.mocked(obterIndicadores);

const INDICADORES = {
  total_diarias: 4,
  total_servidores: 4,
  valor_total: 730.75,
  valor_medio: 243.58,
  sincronizacao: { sincronizado_em: "2026-08-01T10:00:00", total_avisos: 0 },
};

const FILTROS_BASE: ParametrosPesquisaDiariasQuery = { pagina: 1, tamanho_pagina: 25 };

afterEach(() => {
  vi.resetAllMocks();
});

describe("useIndicadores", () => {
  it("busca os indicadores ao montar", async () => {
    obterIndicadoresMock.mockResolvedValue(INDICADORES);

    const { result } = renderHook(() => useIndicadores(FILTROS_BASE));

    expect(result.current.carregando).toBe(true);
    await waitFor(() => expect(result.current.carregando).toBe(false));
    expect(result.current.indicadores).toEqual(INDICADORES);
    expect(result.current.erro).toBeNull();
  });

  it("envia só os 15 campos de filtro, nunca pagina/tamanho_pagina/ordenar_por/ordem", async () => {
    obterIndicadoresMock.mockResolvedValue(INDICADORES);

    renderHook(() =>
      useIndicadores({
        motivo: "Reunião",
        pagina: 3,
        tamanho_pagina: 10,
        ordenar_por: "valor",
        ordem: "asc",
      }),
    );

    await waitFor(() => expect(obterIndicadoresMock).toHaveBeenCalledTimes(1));
    const parametrosEnviados = obterIndicadoresMock.mock.calls[0][0];
    expect(parametrosEnviados).toEqual({
      q: undefined,
      sei: undefined,
      cpf: undefined,
      servidor_nome: undefined,
      servidor_matricula: undefined,
      municipio: undefined,
      motivo: "Reunião",
      situacao: undefined,
      periodo_inicial: undefined,
      periodo_final: undefined,
      origem: undefined,
      destino: undefined,
      trecho: undefined,
      valor_minimo: undefined,
      valor_maximo: undefined,
    });
    expect(parametrosEnviados).not.toHaveProperty("pagina");
    expect(parametrosEnviados).not.toHaveProperty("ordenar_por");
  });

  it("trocar só a página (sem mudar nenhum filtro) não refaz a busca", async () => {
    obterIndicadoresMock.mockResolvedValue(INDICADORES);

    const { rerender } = renderHook((filtros) => useIndicadores(filtros), {
      initialProps: { ...FILTROS_BASE, pagina: 1 },
    });
    await waitFor(() => expect(obterIndicadoresMock).toHaveBeenCalledTimes(1));

    rerender({ ...FILTROS_BASE, pagina: 2 });

    // Dá tempo de um eventual (indevido) segundo efeito rodar.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(obterIndicadoresMock).toHaveBeenCalledTimes(1);
  });

  it("mudar um filtro de verdade refaz a busca", async () => {
    obterIndicadoresMock.mockResolvedValue(INDICADORES);

    const { rerender } = renderHook((filtros) => useIndicadores(filtros), {
      initialProps: { ...FILTROS_BASE, motivo: undefined as string | undefined },
    });
    await waitFor(() => expect(obterIndicadoresMock).toHaveBeenCalledTimes(1));

    rerender({ ...FILTROS_BASE, motivo: "Reunião" });

    await waitFor(() => expect(obterIndicadoresMock).toHaveBeenCalledTimes(2));
  });

  it("falha na busca vira mensagem amigável em erro, indicadores permanecem null", async () => {
    obterIndicadoresMock.mockRejectedValue(new Error("Não foi possível acessar os registros."));

    const { result } = renderHook(() => useIndicadores(FILTROS_BASE));

    await waitFor(() => expect(result.current.carregando).toBe(false));
    expect(result.current.erro).toBe("Não foi possível acessar os registros.");
    expect(result.current.indicadores).toBeNull();
  });

  // Sprint 19.6.2.1 — correção do achado da Auditoria Técnica da 19.6.2:
  // testes permanentes de corrida/retry que reproduzem exatamente o bug de
  // dessincronia (indicador de um recorte antigo aparecendo com a
  // contagem de um recorte novo) e comprovam que o hook agora o evita.
  describe("corrida entre recortes e retry (correção 19.6.2.1)", () => {
    it("resultado obsoleto (recorte anterior) nunca sobrescreve um resultado mais novo, mesmo chegando depois", async () => {
      const { promessa: promessaA, resolver: resolverA } = criarPromessaControlavel<IndicadoresResposta>();
      const { promessa: promessaB, resolver: resolverB } = criarPromessaControlavel<IndicadoresResposta>();
      obterIndicadoresMock.mockReturnValueOnce(promessaA).mockReturnValueOnce(promessaB);

      const { result, rerender } = renderHook((filtros) => useIndicadores(filtros), {
        initialProps: { ...FILTROS_BASE, motivo: "A" as string | undefined },
      });
      await waitFor(() => expect(obterIndicadoresMock).toHaveBeenCalledTimes(1));

      rerender({ ...FILTROS_BASE, motivo: "B" });
      await waitFor(() => expect(obterIndicadoresMock).toHaveBeenCalledTimes(2));

      const indicadoresB: IndicadoresResposta = { ...INDICADORES, total_diarias: 2 };
      const indicadoresA: IndicadoresResposta = { ...INDICADORES, total_diarias: 999 };

      // B (mais novo) resolve primeiro; A (obsoleto) resolve depois — o
      // resultado final deve continuar sendo B, nunca A.
      await act(async () => {
        resolverB(indicadoresB);
        await promessaB;
      });
      await act(async () => {
        resolverA(indicadoresA);
        await promessaA.catch(() => {});
      });

      expect(result.current.indicadores).toEqual(indicadoresB);
      expect(result.current.carregando).toBe(false);
    });

    it("resultado de um recorte antigo é limpo imediatamente ao trocar de filtro, antes mesmo da nova resposta chegar", async () => {
      obterIndicadoresMock.mockResolvedValueOnce(INDICADORES);
      const { promessa: promessaB } = criarPromessaControlavel<IndicadoresResposta>();
      obterIndicadoresMock.mockReturnValueOnce(promessaB);

      const { result, rerender } = renderHook((filtros) => useIndicadores(filtros), {
        initialProps: { ...FILTROS_BASE, motivo: "A" as string | undefined },
      });
      await waitFor(() => expect(result.current.indicadores).toEqual(INDICADORES));

      rerender({ ...FILTROS_BASE, motivo: "B" });

      // Mesmo antes de `promessaB` resolver, o indicador do recorte
      // anterior (A) já não pode estar visível.
      expect(result.current.indicadores).toBeNull();
      expect(result.current.carregando).toBe(true);
    });

    it("desmontar com requisição pendente não atualiza estado depois", async () => {
      const { promessa, resolver } = criarPromessaControlavel<IndicadoresResposta>();
      obterIndicadoresMock.mockReturnValueOnce(promessa);

      const { unmount } = renderHook(() => useIndicadores(FILTROS_BASE));
      await waitFor(() => expect(obterIndicadoresMock).toHaveBeenCalledTimes(1));

      unmount();

      // Resolver após desmontar não deve gerar erro/warning de "setState
      // em componente desmontado" (o hook verifica `cancelado`).
      await act(async () => {
        resolver(INDICADORES);
        await promessa;
      });
    });

    it("tentar novamente bem-sucedido após falha limpa o erro e traz os indicadores", async () => {
      obterIndicadoresMock.mockRejectedValueOnce(new Error("Falha original"));
      obterIndicadoresMock.mockResolvedValueOnce(INDICADORES);

      const { result } = renderHook(() => useIndicadores(FILTROS_BASE));
      await waitFor(() => expect(result.current.erro).toBe("Falha original"));
      expect(result.current.indicadores).toBeNull();

      act(() => result.current.tentarNovamente());

      await waitFor(() => expect(result.current.indicadores).toEqual(INDICADORES));
      expect(result.current.erro).toBeNull();
      expect(obterIndicadoresMock).toHaveBeenCalledTimes(2);
    });

    it("tentar novamente falhando de novo mostra a nova mensagem de erro, não a anterior", async () => {
      obterIndicadoresMock.mockRejectedValueOnce(new Error("Falha original"));
      obterIndicadoresMock.mockRejectedValueOnce(new Error("Falha nova"));

      const { result } = renderHook(() => useIndicadores(FILTROS_BASE));
      await waitFor(() => expect(result.current.erro).toBe("Falha original"));

      act(() => result.current.tentarNovamente());

      await waitFor(() => expect(result.current.erro).toBe("Falha nova"));
      expect(result.current.indicadores).toBeNull();
    });

    it("trocar só a ordenação (sem mudar nenhum filtro) não refaz a busca", async () => {
      obterIndicadoresMock.mockResolvedValue(INDICADORES);

      const { rerender } = renderHook((filtros) => useIndicadores(filtros), {
        initialProps: { ...FILTROS_BASE, ordenar_por: "sei" } as ParametrosPesquisaDiariasQuery,
      });
      await waitFor(() => expect(obterIndicadoresMock).toHaveBeenCalledTimes(1));

      rerender({ ...FILTROS_BASE, ordenar_por: "valor", ordem: "desc" } as ParametrosPesquisaDiariasQuery);

      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(obterIndicadoresMock).toHaveBeenCalledTimes(1);
    });
  });
});
