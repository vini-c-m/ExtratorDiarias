// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useDistribuicoes } from "./useDistribuicoes";
import type { DimensaoDistribuicao, DistribuicaoResposta, ParametrosPesquisaDiariasQuery } from "../types/analitica";

vi.mock("../services/api", async (importarOriginal) => {
  const real = await importarOriginal<typeof import("../services/api")>();
  return { ...real, obterDistribuicao: vi.fn() };
});

import { obterDistribuicao } from "../services/api";

const obterDistribuicaoMock = vi.mocked(obterDistribuicao);

const DISTRIBUICAO_MOTIVO: DistribuicaoResposta = {
  dimensao: "motivo",
  pontos: [
    { rotulo: "Reunião", contagem: 2, valor: 200 },
    { rotulo: "Fiscalização", contagem: 1, valor: 350.5 },
  ],
};

const DISTRIBUICAO_SITUACAO: DistribuicaoResposta = {
  dimensao: "situacao",
  pontos: [{ rotulo: "Em exercício", contagem: 2, valor: null }],
};

const FILTROS_BASE: ParametrosPesquisaDiariasQuery = { pagina: 1, tamanho_pagina: 25 };

function criarPromessaControlavel<T>() {
  let resolver!: (valor: T) => void;
  const promessa = new Promise<T>((resolve) => {
    resolver = resolve;
  });
  return { promessa, resolver };
}

afterEach(() => {
  vi.resetAllMocks();
});

describe("useDistribuicoes", () => {
  it("busca a distribuição da dimensão informada ao montar", async () => {
    obterDistribuicaoMock.mockResolvedValue(DISTRIBUICAO_MOTIVO);

    const { result } = renderHook(() => useDistribuicoes(FILTROS_BASE, "motivo"));

    expect(result.current.carregando).toBe(true);
    await waitFor(() => expect(result.current.carregando).toBe(false));
    expect(result.current.distribuicao).toEqual(DISTRIBUICAO_MOTIVO);
    expect(result.current.erro).toBeNull();
  });

  it("envia só os 15 campos de filtro (nunca pagina/tamanho_pagina/ordenar_por/ordem) mais a dimensão", async () => {
    obterDistribuicaoMock.mockResolvedValue(DISTRIBUICAO_MOTIVO);

    renderHook(() =>
      useDistribuicoes(
        { motivo: "Reunião", pagina: 3, tamanho_pagina: 10, ordenar_por: "valor", ordem: "asc" },
        "motivo",
      ),
    );

    await waitFor(() => expect(obterDistribuicaoMock).toHaveBeenCalledTimes(1));
    const parametrosEnviados = obterDistribuicaoMock.mock.calls[0][0];
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
      dimensao: "motivo",
    });
    expect(parametrosEnviados).not.toHaveProperty("pagina");
    expect(parametrosEnviados).not.toHaveProperty("ordenar_por");
  });

  it("trocar só a página (sem mudar filtro nem dimensão) não refaz a busca", async () => {
    obterDistribuicaoMock.mockResolvedValue(DISTRIBUICAO_MOTIVO);

    const { rerender } = renderHook(
      ({ filtros, dimensao }) => useDistribuicoes(filtros, dimensao),
      { initialProps: { filtros: { ...FILTROS_BASE, pagina: 1 }, dimensao: "motivo" as DimensaoDistribuicao } },
    );
    await waitFor(() => expect(obterDistribuicaoMock).toHaveBeenCalledTimes(1));

    rerender({ filtros: { ...FILTROS_BASE, pagina: 2 }, dimensao: "motivo" as DimensaoDistribuicao });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(obterDistribuicaoMock).toHaveBeenCalledTimes(1);
  });

  it("mudar um filtro de verdade refaz a busca", async () => {
    obterDistribuicaoMock.mockResolvedValue(DISTRIBUICAO_MOTIVO);

    const { rerender } = renderHook(
      ({ filtros, dimensao }) => useDistribuicoes(filtros, dimensao),
      {
        initialProps: {
          filtros: { ...FILTROS_BASE, motivo: undefined as string | undefined },
          dimensao: "motivo" as DimensaoDistribuicao,
        },
      },
    );
    await waitFor(() => expect(obterDistribuicaoMock).toHaveBeenCalledTimes(1));

    rerender({ filtros: { ...FILTROS_BASE, motivo: "Reunião" }, dimensao: "motivo" as DimensaoDistribuicao });

    await waitFor(() => expect(obterDistribuicaoMock).toHaveBeenCalledTimes(2));
  });

  it("trocar a dimensão (sem mudar nenhum filtro) refaz a busca", async () => {
    obterDistribuicaoMock.mockResolvedValueOnce(DISTRIBUICAO_MOTIVO).mockResolvedValueOnce(DISTRIBUICAO_SITUACAO);

    const { result, rerender } = renderHook(
      ({ filtros, dimensao }) => useDistribuicoes(filtros, dimensao),
      { initialProps: { filtros: FILTROS_BASE, dimensao: "motivo" as DimensaoDistribuicao } },
    );
    await waitFor(() => expect(result.current.distribuicao).toEqual(DISTRIBUICAO_MOTIVO));

    rerender({ filtros: FILTROS_BASE, dimensao: "situacao" as DimensaoDistribuicao });

    await waitFor(() => expect(obterDistribuicaoMock).toHaveBeenCalledTimes(2));
    expect(obterDistribuicaoMock.mock.calls[1][0]).toMatchObject({ dimensao: "situacao" });
    await waitFor(() => expect(result.current.distribuicao).toEqual(DISTRIBUICAO_SITUACAO));
  });

  it("falha na busca vira mensagem amigável em erro, distribuição permanece null", async () => {
    obterDistribuicaoMock.mockRejectedValue(new Error("Não foi possível acessar os registros."));

    const { result } = renderHook(() => useDistribuicoes(FILTROS_BASE, "motivo"));

    await waitFor(() => expect(result.current.carregando).toBe(false));
    expect(result.current.erro).toBe("Não foi possível acessar os registros.");
    expect(result.current.distribuicao).toBeNull();
  });

  describe("corrida entre recortes/dimensões e retry (mesma correção da 19.6.2.1, aplicada desde o início)", () => {
    it("resultado obsoleto (dimensão anterior) nunca sobrescreve um resultado mais novo, mesmo chegando depois", async () => {
      const { promessa: promessaMotivo, resolver: resolverMotivo } = criarPromessaControlavel<DistribuicaoResposta>();
      const { promessa: promessaSituacao, resolver: resolverSituacao } = criarPromessaControlavel<DistribuicaoResposta>();
      obterDistribuicaoMock.mockReturnValueOnce(promessaMotivo).mockReturnValueOnce(promessaSituacao);

      const { result, rerender } = renderHook(
        ({ filtros, dimensao }) => useDistribuicoes(filtros, dimensao),
        { initialProps: { filtros: FILTROS_BASE, dimensao: "motivo" as DimensaoDistribuicao } },
      );
      await waitFor(() => expect(obterDistribuicaoMock).toHaveBeenCalledTimes(1));

      rerender({ filtros: FILTROS_BASE, dimensao: "situacao" as DimensaoDistribuicao });
      await waitFor(() => expect(obterDistribuicaoMock).toHaveBeenCalledTimes(2));

      // situacao (mais novo) resolve primeiro; motivo (obsoleto) resolve
      // depois — o resultado final deve continuar sendo situacao.
      await act(async () => {
        resolverSituacao(DISTRIBUICAO_SITUACAO);
        await promessaSituacao;
      });
      await act(async () => {
        resolverMotivo(DISTRIBUICAO_MOTIVO);
        await promessaMotivo;
      });

      expect(result.current.distribuicao).toEqual(DISTRIBUICAO_SITUACAO);
      expect(result.current.carregando).toBe(false);
    });

    it("resultado de uma dimensão anterior é limpo imediatamente ao trocar, antes mesmo da nova resposta chegar", async () => {
      obterDistribuicaoMock.mockResolvedValueOnce(DISTRIBUICAO_MOTIVO);
      const { promessa } = criarPromessaControlavel<DistribuicaoResposta>();
      obterDistribuicaoMock.mockReturnValueOnce(promessa);

      const { result, rerender } = renderHook(
        ({ filtros, dimensao }) => useDistribuicoes(filtros, dimensao),
        { initialProps: { filtros: FILTROS_BASE, dimensao: "motivo" as DimensaoDistribuicao } },
      );
      await waitFor(() => expect(result.current.distribuicao).toEqual(DISTRIBUICAO_MOTIVO));

      rerender({ filtros: FILTROS_BASE, dimensao: "situacao" as DimensaoDistribuicao });

      expect(result.current.distribuicao).toBeNull();
      expect(result.current.carregando).toBe(true);
    });

    it("desmontar com requisição pendente não atualiza estado depois", async () => {
      const { promessa, resolver } = criarPromessaControlavel<DistribuicaoResposta>();
      obterDistribuicaoMock.mockReturnValueOnce(promessa);

      const { unmount } = renderHook(() => useDistribuicoes(FILTROS_BASE, "motivo"));
      await waitFor(() => expect(obterDistribuicaoMock).toHaveBeenCalledTimes(1));

      unmount();

      await act(async () => {
        resolver(DISTRIBUICAO_MOTIVO);
        await promessa;
      });
    });

    it("tentar novamente bem-sucedido após falha limpa o erro e traz a distribuição", async () => {
      obterDistribuicaoMock.mockRejectedValueOnce(new Error("Falha original"));
      obterDistribuicaoMock.mockResolvedValueOnce(DISTRIBUICAO_MOTIVO);

      const { result } = renderHook(() => useDistribuicoes(FILTROS_BASE, "motivo"));
      await waitFor(() => expect(result.current.erro).toBe("Falha original"));

      act(() => result.current.tentarNovamente());

      await waitFor(() => expect(result.current.distribuicao).toEqual(DISTRIBUICAO_MOTIVO));
      expect(result.current.erro).toBeNull();
      expect(obterDistribuicaoMock).toHaveBeenCalledTimes(2);
    });

    it("trocar só a ordenação (sem mudar filtro nem dimensão) não refaz a busca", async () => {
      obterDistribuicaoMock.mockResolvedValue(DISTRIBUICAO_MOTIVO);

      const { rerender } = renderHook(
        ({ filtros, dimensao }) => useDistribuicoes(filtros, dimensao),
        {
          initialProps: {
            filtros: { ...FILTROS_BASE, ordenar_por: "sei" } as ParametrosPesquisaDiariasQuery,
            dimensao: "motivo" as DimensaoDistribuicao,
          },
        },
      );
      await waitFor(() => expect(obterDistribuicaoMock).toHaveBeenCalledTimes(1));

      rerender({
        filtros: { ...FILTROS_BASE, ordenar_por: "valor", ordem: "desc" } as ParametrosPesquisaDiariasQuery,
        dimensao: "motivo" as DimensaoDistribuicao,
      });

      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(obterDistribuicaoMock).toHaveBeenCalledTimes(1);
    });
  });
});
