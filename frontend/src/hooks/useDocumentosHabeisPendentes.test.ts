// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useDocumentosHabeisPendentes } from "./useDocumentosHabeisPendentes";
import type { DocumentosHabeisPendentesResposta, ParametrosPesquisaDiariasQuery } from "../types/analitica";

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
  return { ...real, obterDocumentosHabeisPendentes: vi.fn() };
});

import { obterDocumentosHabeisPendentes } from "../services/api";

const obterDocumentosHabeisPendentesMock = vi.mocked(obterDocumentosHabeisPendentes);

const RESPOSTA: DocumentosHabeisPendentesResposta = {
  resumo: { aguardando_liberacao: 1, revisao_manual_necessaria: 1 },
  registros: [
    {
      sei: "SEI-1",
      servidor_nome: "Maria Souza",
      cpf_mascarado: "***.111.111-11",
      periodo: { inicial: "2026-08-20", final: "2026-08-22" },
      destino: "GARANHUNS",
      data_liberacao_prevista: "2026-08-05",
      situacao: "revisao_manual_necessaria",
      dias_restantes: null,
      dias_atraso: 3,
      texto_contagem: null,
      mensagem: "Documento Hábil pendente. A data de liberação já foi atingida. Recomenda-se análise manual.",
    },
    {
      sei: "SEI-2",
      servidor_nome: "João Silva",
      cpf_mascarado: "***.222.222-22",
      periodo: { inicial: "2026-09-01", final: "2026-09-03" },
      destino: "ARARIPINA",
      data_liberacao_prevista: "2026-08-17",
      situacao: "aguardando_liberacao",
      dias_restantes: 4,
      dias_atraso: null,
      texto_contagem: "Liberação prevista para 17/08/2026 — faltam 4 dias.",
      mensagem: "Documento Hábil ainda não disponível. Aguardar a data de liberação.",
    },
  ],
};

const FILTROS_BASE: ParametrosPesquisaDiariasQuery = { pagina: 1, tamanho_pagina: 25 };

afterEach(() => {
  vi.resetAllMocks();
});

describe("useDocumentosHabeisPendentes", () => {
  it("busca ao montar", async () => {
    obterDocumentosHabeisPendentesMock.mockResolvedValue(RESPOSTA);

    const { result } = renderHook(() => useDocumentosHabeisPendentes(FILTROS_BASE));

    expect(result.current.carregando).toBe(true);
    await waitFor(() => expect(result.current.carregando).toBe(false));
    expect(result.current.documentosHabeisPendentes).toEqual(RESPOSTA);
    expect(result.current.erro).toBeNull();
  });

  it("envia só os 15 campos de filtro, nunca pagina/tamanho_pagina/ordenar_por/ordem", async () => {
    obterDocumentosHabeisPendentesMock.mockResolvedValue(RESPOSTA);

    renderHook(() =>
      useDocumentosHabeisPendentes({
        motivo: "Reunião",
        pagina: 3,
        tamanho_pagina: 10,
        ordenar_por: "valor",
        ordem: "asc",
      }),
    );

    await waitFor(() => expect(obterDocumentosHabeisPendentesMock).toHaveBeenCalledTimes(1));
    const parametrosEnviados = obterDocumentosHabeisPendentesMock.mock.calls[0][0];
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
    obterDocumentosHabeisPendentesMock.mockResolvedValue(RESPOSTA);

    const { rerender } = renderHook((filtros) => useDocumentosHabeisPendentes(filtros), {
      initialProps: { ...FILTROS_BASE, pagina: 1 },
    });
    await waitFor(() => expect(obterDocumentosHabeisPendentesMock).toHaveBeenCalledTimes(1));

    rerender({ ...FILTROS_BASE, pagina: 2 });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(obterDocumentosHabeisPendentesMock).toHaveBeenCalledTimes(1);
  });

  it("mudar um filtro de verdade refaz a busca", async () => {
    obterDocumentosHabeisPendentesMock.mockResolvedValue(RESPOSTA);

    const { rerender } = renderHook((filtros) => useDocumentosHabeisPendentes(filtros), {
      initialProps: { ...FILTROS_BASE, motivo: undefined as string | undefined },
    });
    await waitFor(() => expect(obterDocumentosHabeisPendentesMock).toHaveBeenCalledTimes(1));

    rerender({ ...FILTROS_BASE, motivo: "Reunião" });

    await waitFor(() => expect(obterDocumentosHabeisPendentesMock).toHaveBeenCalledTimes(2));
  });

  it("falha na busca vira mensagem amigável em erro, resultado permanece null", async () => {
    obterDocumentosHabeisPendentesMock.mockRejectedValue(new Error("Não foi possível acessar os registros."));

    const { result } = renderHook(() => useDocumentosHabeisPendentes(FILTROS_BASE));

    await waitFor(() => expect(result.current.carregando).toBe(false));
    expect(result.current.erro).toBe("Não foi possível acessar os registros.");
    expect(result.current.documentosHabeisPendentes).toBeNull();
  });

  describe("corrida entre recortes e retry", () => {
    it("resultado obsoleto (recorte anterior) nunca sobrescreve um resultado mais novo, mesmo chegando depois", async () => {
      const { promessa: promessaA, resolver: resolverA } = criarPromessaControlavel<DocumentosHabeisPendentesResposta>();
      const { promessa: promessaB, resolver: resolverB } = criarPromessaControlavel<DocumentosHabeisPendentesResposta>();
      obterDocumentosHabeisPendentesMock.mockReturnValueOnce(promessaA).mockReturnValueOnce(promessaB);

      const { result, rerender } = renderHook((filtros) => useDocumentosHabeisPendentes(filtros), {
        initialProps: { ...FILTROS_BASE, motivo: "A" as string | undefined },
      });
      await waitFor(() => expect(obterDocumentosHabeisPendentesMock).toHaveBeenCalledTimes(1));

      rerender({ ...FILTROS_BASE, motivo: "B" });
      await waitFor(() => expect(obterDocumentosHabeisPendentesMock).toHaveBeenCalledTimes(2));

      const respostaB: DocumentosHabeisPendentesResposta = {
        ...RESPOSTA,
        resumo: { aguardando_liberacao: 2, revisao_manual_necessaria: 0 },
      };
      const respostaA: DocumentosHabeisPendentesResposta = {
        ...RESPOSTA,
        resumo: { aguardando_liberacao: 999, revisao_manual_necessaria: 999 },
      };

      await act(async () => {
        resolverB(respostaB);
        await promessaB;
      });
      await act(async () => {
        resolverA(respostaA);
        await promessaA.catch(() => {});
      });

      expect(result.current.documentosHabeisPendentes).toEqual(respostaB);
      expect(result.current.carregando).toBe(false);
    });

    it("resultado de um recorte antigo é limpo imediatamente ao trocar de filtro, antes mesmo da nova resposta chegar", async () => {
      obterDocumentosHabeisPendentesMock.mockResolvedValueOnce(RESPOSTA);
      const { promessa: promessaB } = criarPromessaControlavel<DocumentosHabeisPendentesResposta>();
      obterDocumentosHabeisPendentesMock.mockReturnValueOnce(promessaB);

      const { result, rerender } = renderHook((filtros) => useDocumentosHabeisPendentes(filtros), {
        initialProps: { ...FILTROS_BASE, motivo: "A" as string | undefined },
      });
      await waitFor(() => expect(result.current.documentosHabeisPendentes).toEqual(RESPOSTA));

      rerender({ ...FILTROS_BASE, motivo: "B" });

      expect(result.current.documentosHabeisPendentes).toBeNull();
      expect(result.current.carregando).toBe(true);
    });

    it("desmontar com requisição pendente não atualiza estado depois", async () => {
      const { promessa, resolver } = criarPromessaControlavel<DocumentosHabeisPendentesResposta>();
      obterDocumentosHabeisPendentesMock.mockReturnValueOnce(promessa);

      const { unmount } = renderHook(() => useDocumentosHabeisPendentes(FILTROS_BASE));
      await waitFor(() => expect(obterDocumentosHabeisPendentesMock).toHaveBeenCalledTimes(1));

      unmount();

      await act(async () => {
        resolver(RESPOSTA);
        await promessa;
      });
    });

    it("tentar novamente bem-sucedido após falha limpa o erro e traz o resultado", async () => {
      obterDocumentosHabeisPendentesMock.mockRejectedValueOnce(new Error("Falha original"));
      obterDocumentosHabeisPendentesMock.mockResolvedValueOnce(RESPOSTA);

      const { result } = renderHook(() => useDocumentosHabeisPendentes(FILTROS_BASE));
      await waitFor(() => expect(result.current.erro).toBe("Falha original"));
      expect(result.current.documentosHabeisPendentes).toBeNull();

      act(() => result.current.tentarNovamente());

      await waitFor(() => expect(result.current.documentosHabeisPendentes).toEqual(RESPOSTA));
      expect(result.current.erro).toBeNull();
      expect(obterDocumentosHabeisPendentesMock).toHaveBeenCalledTimes(2);
    });
  });
});
