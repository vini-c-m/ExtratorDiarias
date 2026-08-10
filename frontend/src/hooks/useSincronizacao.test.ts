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

const RESUMO_SUCESSO = {
  status: "sucesso" as const,
  sincronizado_em: "2026-07-31T15:00:00",
  linhas_diarias: 10,
  linhas_servidores_lidos: 5,
  linhas_ignoradas: 0,
  total_avisos: 0,
};

afterEach(() => {
  vi.clearAllMocks();
});

// MS UX (2026-08-10) — "ao entrar na Central Analítica, tentar sincronizar
// automaticamente" (item 7 do pedido): o hook agora dispara `sincronizarAgora`
// (o MESMO endpoint/lógica já homologados do botão manual) sozinho ao
// montar, em vez de só uma leitura de frescor (`GET`). Cada teste abaixo que
// precisa disparar uma SEGUNDA chamada explícita configura dois mocks em
// sequência — o primeiro é consumido pela chamada automática do mount.
describe("useSincronizacao", () => {
  it("N) dispara sincronização automática (mesmo mecanismo do botão manual) ao montar, quando backendOnline é true", async () => {
    dispararMock.mockResolvedValueOnce(RESUMO_SUCESSO);
    consultarMock.mockResolvedValue(ESTADO_ATUALIZADO);

    const { result } = renderHook(() => useSincronizacao(true));

    await waitFor(() => expect(result.current.sincronizando).toBe(false));
    expect(dispararMock).toHaveBeenCalledTimes(1);
    expect(result.current.ultimaExecucao).toEqual({ tipo: "sucesso" });
    expect(result.current.dado).toEqual(ESTADO_ATUALIZADO);
  });

  it("não dispara nada enquanto backendOnline é false", () => {
    renderHook(() => useSincronizacao(false));

    expect(dispararMock).not.toHaveBeenCalled();
    expect(consultarMock).not.toHaveBeenCalled();
  });

  it("dispara só uma vez mesmo se backendOnline permanecer true entre re-renders", async () => {
    dispararMock.mockResolvedValue(RESUMO_SUCESSO);
    consultarMock.mockResolvedValue(ESTADO_ATUALIZADO);

    const { result, rerender } = renderHook(() => useSincronizacao(true));
    await waitFor(() => expect(result.current.sincronizando).toBe(false));

    rerender();
    rerender();

    expect(dispararMock).toHaveBeenCalledTimes(1);
  });

  it("falha na leitura do estado (GET) durante a sincronização automática vira erro=true", async () => {
    dispararMock.mockResolvedValueOnce(RESUMO_SUCESSO);
    consultarMock.mockRejectedValue(new ErroAnaliticaIndisponivel());

    const { result } = renderHook(() => useSincronizacao(true));

    await waitFor(() => expect(result.current.erro).toBe(true));
    expect(result.current.dado).toBeNull();
  });

  it("O) sincronizarAgora automática com sucesso marca ultimaExecucao e popula dado", async () => {
    dispararMock.mockResolvedValueOnce(RESUMO_SUCESSO);
    consultarMock.mockResolvedValue(ESTADO_ATUALIZADO);

    const { result } = renderHook(() => useSincronizacao(true));

    await waitFor(() => expect(result.current.sincronizando).toBe(false));
    expect(result.current.ultimaExecucao).toEqual({ tipo: "sucesso" });
    expect(consultarMock).toHaveBeenCalledTimes(1); // só a re-busca pós-sincronização
  });

  it("P) sincronizarAgora automática com status:falha marca ultimaExecucao falha", async () => {
    dispararMock.mockResolvedValueOnce({
      status: "falha",
      sincronizado_em: null,
      linhas_diarias: null,
      linhas_servidores_lidos: null,
      linhas_ignoradas: null,
      total_avisos: null,
    });
    consultarMock.mockResolvedValue(ESTADO_ATUALIZADO);

    const { result } = renderHook(() => useSincronizacao(true));

    await waitFor(() => expect(result.current.sincronizando).toBe(false));
    expect(result.current.ultimaExecucao).toEqual({ tipo: "falha" });
  });

  it("Q) recuperação: depois de uma falha automática, uma nova tentativa manual bem-sucedida vira ultimaExecucao sucesso", async () => {
    dispararMock.mockResolvedValueOnce({
      status: "falha",
      sincronizado_em: null,
      linhas_diarias: null,
      linhas_servidores_lidos: null,
      linhas_ignoradas: null,
      total_avisos: null,
    });
    consultarMock.mockResolvedValue(ESTADO_ATUALIZADO);

    const { result } = renderHook(() => useSincronizacao(true));
    await waitFor(() => expect(result.current.sincronizando).toBe(false));
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

  it("409 (SincronizacaoEmAndamentoError) na chamada automática nunca vira falha e não deixa nenhum estado travado", async () => {
    // Correção 18.4.3.1 (achado da auditoria consolidada 18.4.1–18.4.3):
    // um 409 nunca marca `ultimaExecucao` — `sincronizando` volta a
    // `false` normalmente, liberando a próxima chamada.
    dispararMock.mockRejectedValueOnce(new SincronizacaoEmAndamentoError());
    consultarMock.mockResolvedValue(ESTADO_ATUALIZADO);

    const { result } = renderHook(() => useSincronizacao(true));

    await waitFor(() => expect(result.current.sincronizando).toBe(false));
    expect(result.current.ultimaExecucao).toBeNull();
    expect(consultarMock).toHaveBeenCalledTimes(1);

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

  it("503 durante o POST automático vira ultimaExecucao falha", async () => {
    dispararMock.mockRejectedValueOnce(new ErroAnaliticaIndisponivel());
    consultarMock.mockResolvedValue(ESTADO_ATUALIZADO);

    const { result } = renderHook(() => useSincronizacao(true));

    await waitFor(() => expect(result.current.sincronizando).toBe(false));
    expect(result.current.ultimaExecucao).toEqual({ tipo: "falha" });
  });

  it("422 (Planilha Oficial indisponível) na chamada automática vira ultimaExecucao planilha_indisponivel com a mensagem do backend", async () => {
    dispararMock.mockRejectedValueOnce(new Error("Planilha oficial não configurada."));
    consultarMock.mockResolvedValue(ESTADO_ATUALIZADO);

    const { result } = renderHook(() => useSincronizacao(true));

    await waitFor(() => expect(result.current.sincronizando).toBe(false));
    expect(result.current.ultimaExecucao).toEqual({
      tipo: "planilha_indisponivel",
      mensagem: "Planilha oficial não configurada.",
    });
  });

  it("atualizar() continua disponível para um retry explícito de leitura", async () => {
    dispararMock.mockResolvedValueOnce(RESUMO_SUCESSO);
    consultarMock.mockResolvedValue(ESTADO_ATUALIZADO);

    const { result } = renderHook(() => useSincronizacao(true));
    await waitFor(() => expect(result.current.sincronizando).toBe(false));

    await act(async () => {
      await result.current.atualizar();
    });

    expect(result.current.carregando).toBe(false);
    expect(result.current.dado).toEqual(ESTADO_ATUALIZADO);
  });
});
