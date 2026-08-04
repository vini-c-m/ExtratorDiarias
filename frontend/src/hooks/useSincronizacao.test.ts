// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useSincronizacao } from "./useSincronizacao";

vi.mock("../services/api", async (importarOriginal) => {
  const original = await importarOriginal<typeof import("../services/api")>();
  return {
    ...original,
    consultarEstadoSincronizacao: vi.fn(),
    dispararSincronizacaoManual: vi.fn(),
  };
});

import { ErroAnaliticaIndisponivel, SincronizacaoEmAndamentoError, consultarEstadoSincronizacao, dispararSincronizacaoManual } from "../services/api";

const consultarMock = vi.mocked(consultarEstadoSincronizacao);
const dispararMock = vi.mocked(dispararSincronizacaoManual);

const ESTADO_ATUALIZADO = {
  sincronizado_em: "2026-07-31T14:32:00",
  origem: "pos_preenchimento",
  possivelmente_desatualizado: false,
  total_avisos: 0,
  status: "atualizado" as const,
};

afterEach(() => {
  vi.clearAllMocks();
});

describe("useSincronizacao", () => {
  it("busca o estado ao montar quando backendOnline é true", async () => {
    consultarMock.mockResolvedValueOnce(ESTADO_ATUALIZADO);

    const { result } = renderHook(() => useSincronizacao(true));

    await waitFor(() => expect(result.current.carregando).toBe(false));

    expect(consultarMock).toHaveBeenCalledTimes(1);
    expect(result.current.dado).toEqual(ESTADO_ATUALIZADO);
    expect(result.current.erro).toBe(false);
  });

  it("não busca nada enquanto backendOnline é false", () => {
    renderHook(() => useSincronizacao(false));

    expect(consultarMock).not.toHaveBeenCalled();
  });

  it("503 em GET /sincronizacao vira erro=true, dado permanece null", async () => {
    consultarMock.mockRejectedValueOnce(new ErroAnaliticaIndisponivel());

    const { result } = renderHook(() => useSincronizacao(true));

    await waitFor(() => expect(result.current.erro).toBe(true));
    expect(result.current.dado).toBeNull();
  });

  it("sincronizarAgora com sucesso marca ultimaExecucao e rebusca o estado", async () => {
    consultarMock.mockResolvedValue(ESTADO_ATUALIZADO);
    dispararMock.mockResolvedValueOnce({
      status: "sucesso",
      sincronizado_em: "2026-07-31T15:00:00",
      linhas_diarias: 10,
      linhas_servidores_lidos: 5,
      linhas_ignoradas: 0,
      total_avisos: 0,
    });

    const { result } = renderHook(() => useSincronizacao(true));
    await waitFor(() => expect(result.current.carregando).toBe(false));

    await act(async () => {
      await result.current.sincronizarAgora();
    });

    expect(result.current.ultimaExecucao).toEqual({ tipo: "sucesso" });
    expect(result.current.sincronizando).toBe(false);
    expect(consultarMock).toHaveBeenCalledTimes(2); // montagem + pós-sincronização
  });

  it("sincronizarAgora com status:falha marca ultimaExecucao falha", async () => {
    consultarMock.mockResolvedValue(ESTADO_ATUALIZADO);
    dispararMock.mockResolvedValueOnce({
      status: "falha",
      sincronizado_em: null,
      linhas_diarias: null,
      linhas_servidores_lidos: null,
      linhas_ignoradas: null,
      total_avisos: null,
    });

    const { result } = renderHook(() => useSincronizacao(true));
    await waitFor(() => expect(result.current.carregando).toBe(false));

    await act(async () => {
      await result.current.sincronizarAgora();
    });

    expect(result.current.ultimaExecucao).toEqual({ tipo: "falha" });
  });

  it("recuperação: depois de uma falha, uma nova tentativa bem-sucedida vira ultimaExecucao sucesso", async () => {
    consultarMock.mockResolvedValue(ESTADO_ATUALIZADO);
    dispararMock.mockResolvedValueOnce({
      status: "falha",
      sincronizado_em: null,
      linhas_diarias: null,
      linhas_servidores_lidos: null,
      linhas_ignoradas: null,
      total_avisos: null,
    });

    const { result } = renderHook(() => useSincronizacao(true));
    await waitFor(() => expect(result.current.carregando).toBe(false));

    await act(async () => {
      await result.current.sincronizarAgora();
    });
    expect(result.current.ultimaExecucao).toEqual({ tipo: "falha" });

    dispararMock.mockResolvedValueOnce({
      status: "sucesso",
      sincronizado_em: "2026-07-31T16:00:00",
      linhas_diarias: 2,
      linhas_servidores_lidos: 2,
      linhas_ignoradas: 0,
      total_avisos: 0,
    });
    await act(async () => {
      await result.current.sincronizarAgora();
    });

    expect(result.current.ultimaExecucao).toEqual({ tipo: "sucesso" });
  });

  it("409 (SincronizacaoEmAndamentoError) nunca vira falha e não deixa nenhum estado travado", async () => {
    // Correção 18.4.3.1 (achado da auditoria consolidada 18.4.1–18.4.3):
    // antes desta correção, um 409 marcava `ultimaExecucao: {tipo:
    // "em_andamento"}` e isso nunca era limpo — o indicador ficava preso
    // mostrando "Sincronizando..." com o botão desabilitado para sempre.
    // Agora `ultimaExecucao` permanece `null` (nenhum resumo de execução
    // desta chamada específica a reportar) e `sincronizando` volta a
    // `false` normalmente, liberando o próximo `sincronizarAgora()`.
    consultarMock.mockResolvedValue(ESTADO_ATUALIZADO);
    dispararMock.mockRejectedValueOnce(new SincronizacaoEmAndamentoError());

    const { result } = renderHook(() => useSincronizacao(true));
    await waitFor(() => expect(result.current.carregando).toBe(false));

    await act(async () => {
      await result.current.sincronizarAgora();
    });

    expect(result.current.ultimaExecucao).toBeNull();
    expect(result.current.sincronizando).toBe(false);
    expect(consultarMock).toHaveBeenCalledTimes(2);

    // E a próxima chamada a `sincronizarAgora` funciona normalmente —
    // nenhum estado interno impede uma nova tentativa.
    dispararMock.mockResolvedValueOnce({
      status: "sucesso",
      sincronizado_em: "2026-07-31T16:00:00",
      linhas_diarias: 1,
      linhas_servidores_lidos: 1,
      linhas_ignoradas: 0,
      total_avisos: 0,
    });
    await act(async () => {
      await result.current.sincronizarAgora();
    });
    expect(result.current.ultimaExecucao).toEqual({ tipo: "sucesso" });
  });

  it("503 durante o POST vira ultimaExecucao falha", async () => {
    consultarMock.mockResolvedValue(ESTADO_ATUALIZADO);
    dispararMock.mockRejectedValueOnce(new ErroAnaliticaIndisponivel());

    const { result } = renderHook(() => useSincronizacao(true));
    await waitFor(() => expect(result.current.carregando).toBe(false));

    await act(async () => {
      await result.current.sincronizarAgora();
    });

    expect(result.current.ultimaExecucao).toEqual({ tipo: "falha" });
  });

  it("422 (Planilha Oficial indisponível) vira ultimaExecucao planilha_indisponivel com a mensagem do backend", async () => {
    consultarMock.mockResolvedValue(ESTADO_ATUALIZADO);
    dispararMock.mockRejectedValueOnce(new Error("Planilha oficial não configurada."));

    const { result } = renderHook(() => useSincronizacao(true));
    await waitFor(() => expect(result.current.carregando).toBe(false));

    await act(async () => {
      await result.current.sincronizarAgora();
    });

    expect(result.current.ultimaExecucao).toEqual({
      tipo: "planilha_indisponivel",
      mensagem: "Planilha oficial não configurada.",
    });
  });
});
