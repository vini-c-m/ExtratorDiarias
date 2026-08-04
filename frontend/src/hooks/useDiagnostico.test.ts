// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useDiagnostico } from "./useDiagnostico";
import type { DiagnosticoResposta, ParametrosPesquisaDiariasQuery } from "../types/analitica";

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
  return { ...real, obterDiagnostico: vi.fn() };
});

import { obterDiagnostico } from "../services/api";

const obterDiagnosticoMock = vi.mocked(obterDiagnostico);

const DIAGNOSTICO: DiagnosticoResposta = {
  resumo: { esperado: 3, atencao: 1, inconsistencia: 0 },
  registros: [
    { sei: "SEI-1", classificacao: "esperado", casos: [] },
    {
      sei: "SEI-2",
      classificacao: "atencao",
      casos: [
        {
          campo: "dh",
          titulo: "Documento Hábil (DH) ainda não emitido",
          motivo: "motivo",
          acao_recomendada: "ação",
        },
      ],
    },
  ],
};

const FILTROS_BASE: ParametrosPesquisaDiariasQuery = { pagina: 1, tamanho_pagina: 25 };

afterEach(() => {
  vi.resetAllMocks();
});

describe("useDiagnostico", () => {
  it("busca o diagnóstico ao montar", async () => {
    obterDiagnosticoMock.mockResolvedValue(DIAGNOSTICO);

    const { result } = renderHook(() => useDiagnostico(FILTROS_BASE));

    expect(result.current.carregando).toBe(true);
    await waitFor(() => expect(result.current.carregando).toBe(false));
    expect(result.current.diagnostico).toEqual(DIAGNOSTICO);
    expect(result.current.erro).toBeNull();
  });

  it("envia só os 15 campos de filtro, nunca pagina/tamanho_pagina/ordenar_por/ordem", async () => {
    obterDiagnosticoMock.mockResolvedValue(DIAGNOSTICO);

    renderHook(() =>
      useDiagnostico({
        motivo: "Reunião",
        pagina: 3,
        tamanho_pagina: 10,
        ordenar_por: "valor",
        ordem: "asc",
      }),
    );

    await waitFor(() => expect(obterDiagnosticoMock).toHaveBeenCalledTimes(1));
    const parametrosEnviados = obterDiagnosticoMock.mock.calls[0][0];
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
    obterDiagnosticoMock.mockResolvedValue(DIAGNOSTICO);

    const { rerender } = renderHook((filtros) => useDiagnostico(filtros), {
      initialProps: { ...FILTROS_BASE, pagina: 1 },
    });
    await waitFor(() => expect(obterDiagnosticoMock).toHaveBeenCalledTimes(1));

    rerender({ ...FILTROS_BASE, pagina: 2 });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(obterDiagnosticoMock).toHaveBeenCalledTimes(1);
  });

  it("mudar um filtro de verdade refaz a busca", async () => {
    obterDiagnosticoMock.mockResolvedValue(DIAGNOSTICO);

    const { rerender } = renderHook((filtros) => useDiagnostico(filtros), {
      initialProps: { ...FILTROS_BASE, motivo: undefined as string | undefined },
    });
    await waitFor(() => expect(obterDiagnosticoMock).toHaveBeenCalledTimes(1));

    rerender({ ...FILTROS_BASE, motivo: "Reunião" });

    await waitFor(() => expect(obterDiagnosticoMock).toHaveBeenCalledTimes(2));
  });

  it("falha na busca vira mensagem amigável em erro, diagnóstico permanece null", async () => {
    obterDiagnosticoMock.mockRejectedValue(new Error("Não foi possível acessar os registros."));

    const { result } = renderHook(() => useDiagnostico(FILTROS_BASE));

    await waitFor(() => expect(result.current.carregando).toBe(false));
    expect(result.current.erro).toBe("Não foi possível acessar os registros.");
    expect(result.current.diagnostico).toBeNull();
  });

  describe("corrida entre recortes e retry", () => {
    it("resultado obsoleto (recorte anterior) nunca sobrescreve um resultado mais novo, mesmo chegando depois", async () => {
      const { promessa: promessaA, resolver: resolverA } = criarPromessaControlavel<DiagnosticoResposta>();
      const { promessa: promessaB, resolver: resolverB } = criarPromessaControlavel<DiagnosticoResposta>();
      obterDiagnosticoMock.mockReturnValueOnce(promessaA).mockReturnValueOnce(promessaB);

      const { result, rerender } = renderHook((filtros) => useDiagnostico(filtros), {
        initialProps: { ...FILTROS_BASE, motivo: "A" as string | undefined },
      });
      await waitFor(() => expect(obterDiagnosticoMock).toHaveBeenCalledTimes(1));

      rerender({ ...FILTROS_BASE, motivo: "B" });
      await waitFor(() => expect(obterDiagnosticoMock).toHaveBeenCalledTimes(2));

      const diagnosticoB: DiagnosticoResposta = { ...DIAGNOSTICO, resumo: { esperado: 2, atencao: 0, inconsistencia: 0 } };
      const diagnosticoA: DiagnosticoResposta = { ...DIAGNOSTICO, resumo: { esperado: 999, atencao: 0, inconsistencia: 0 } };

      await act(async () => {
        resolverB(diagnosticoB);
        await promessaB;
      });
      await act(async () => {
        resolverA(diagnosticoA);
        await promessaA.catch(() => {});
      });

      expect(result.current.diagnostico).toEqual(diagnosticoB);
      expect(result.current.carregando).toBe(false);
    });

    it("resultado de um recorte antigo é limpo imediatamente ao trocar de filtro, antes mesmo da nova resposta chegar", async () => {
      obterDiagnosticoMock.mockResolvedValueOnce(DIAGNOSTICO);
      const { promessa: promessaB } = criarPromessaControlavel<DiagnosticoResposta>();
      obterDiagnosticoMock.mockReturnValueOnce(promessaB);

      const { result, rerender } = renderHook((filtros) => useDiagnostico(filtros), {
        initialProps: { ...FILTROS_BASE, motivo: "A" as string | undefined },
      });
      await waitFor(() => expect(result.current.diagnostico).toEqual(DIAGNOSTICO));

      rerender({ ...FILTROS_BASE, motivo: "B" });

      expect(result.current.diagnostico).toBeNull();
      expect(result.current.carregando).toBe(true);
    });

    it("desmontar com requisição pendente não atualiza estado depois", async () => {
      const { promessa, resolver } = criarPromessaControlavel<DiagnosticoResposta>();
      obterDiagnosticoMock.mockReturnValueOnce(promessa);

      const { unmount } = renderHook(() => useDiagnostico(FILTROS_BASE));
      await waitFor(() => expect(obterDiagnosticoMock).toHaveBeenCalledTimes(1));

      unmount();

      await act(async () => {
        resolver(DIAGNOSTICO);
        await promessa;
      });
    });

    it("tentar novamente bem-sucedido após falha limpa o erro e traz o diagnóstico", async () => {
      obterDiagnosticoMock.mockRejectedValueOnce(new Error("Falha original"));
      obterDiagnosticoMock.mockResolvedValueOnce(DIAGNOSTICO);

      const { result } = renderHook(() => useDiagnostico(FILTROS_BASE));
      await waitFor(() => expect(result.current.erro).toBe("Falha original"));
      expect(result.current.diagnostico).toBeNull();

      act(() => result.current.tentarNovamente());

      await waitFor(() => expect(result.current.diagnostico).toEqual(DIAGNOSTICO));
      expect(result.current.erro).toBeNull();
      expect(obterDiagnosticoMock).toHaveBeenCalledTimes(2);
    });
  });
});
