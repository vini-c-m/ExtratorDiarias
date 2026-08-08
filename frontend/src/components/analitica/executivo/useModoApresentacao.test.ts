// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useModoApresentacao } from "./useModoApresentacao";

let requestFullscreenMock: ReturnType<typeof vi.fn>;
let exitFullscreenMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  requestFullscreenMock = vi.fn().mockResolvedValue(undefined);
  exitFullscreenMock = vi.fn().mockResolvedValue(undefined);
  document.documentElement.requestFullscreen = requestFullscreenMock as unknown as () => Promise<void>;
  document.exitFullscreen = exitFullscreenMock as unknown as () => Promise<void>;
  Object.defineProperty(document, "fullscreenElement", {
    value: null,
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useModoApresentacao", () => {
  it("começa inativa, na seção 0, com 3 seções fixas (Indicadores/Gráficos/Insights)", () => {
    const { result } = renderHook(() => useModoApresentacao());

    expect(result.current.ativa).toBe(false);
    expect(result.current.secaoAtual).toBe(0);
    expect(result.current.totalSecoes).toBe(3);
  });

  it("entrar() pede tela cheia via Fullscreen API e ativa o modo, sempre começando na seção 0", () => {
    const { result } = renderHook(() => useModoApresentacao());

    act(() => result.current.entrar());

    expect(requestFullscreenMock).toHaveBeenCalledTimes(1);
    expect(result.current.ativa).toBe(true);
    expect(result.current.secaoAtual).toBe(0);
  });

  it("sair() sai da tela cheia e desativa o modo", () => {
    const { result } = renderHook(() => useModoApresentacao());
    act(() => result.current.entrar());
    Object.defineProperty(document, "fullscreenElement", { value: document.documentElement, configurable: true });

    act(() => result.current.sair());

    expect(exitFullscreenMock).toHaveBeenCalledTimes(1);
    expect(result.current.ativa).toBe(false);
  });

  it("proximaSecao()/secaoAnterior() navegam sem ultrapassar os limites (0 a totalSecoes-1)", () => {
    const { result } = renderHook(() => useModoApresentacao());
    act(() => result.current.entrar());

    act(() => result.current.secaoAnterior());
    expect(result.current.secaoAtual).toBe(0); // já no início, nunca fica negativo

    act(() => result.current.proximaSecao());
    act(() => result.current.proximaSecao());
    act(() => result.current.proximaSecao()); // 3ª chamada além do limite (só 3 seções: 0,1,2)
    expect(result.current.secaoAtual).toBe(2); // nunca ultrapassa a última
  });

  it("irParaSecao() vai direto para um índice, sempre dentro dos limites", () => {
    const { result } = renderHook(() => useModoApresentacao());
    act(() => result.current.entrar());

    act(() => result.current.irParaSecao(1));
    expect(result.current.secaoAtual).toBe(1);

    act(() => result.current.irParaSecao(99));
    expect(result.current.secaoAtual).toBe(2); // limitado ao último índice válido
  });

  it("teclado: Escape sai, ArrowRight/ArrowLeft navegam — só enquanto ativa", () => {
    const { result } = renderHook(() => useModoApresentacao());

    // Sem estar ativa, teclas não fazem nada (não há listener).
    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" })));
    expect(result.current.secaoAtual).toBe(0);

    act(() => result.current.entrar());
    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" })));
    expect(result.current.secaoAtual).toBe(1);

    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft" })));
    expect(result.current.secaoAtual).toBe(0);

    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(result.current.ativa).toBe(false);
  });

  it("sincroniza ativa=false quando o navegador sai de tela cheia por conta própria (Esc nativo, evento fullscreenchange)", () => {
    const { result } = renderHook(() => useModoApresentacao());
    act(() => result.current.entrar());
    expect(result.current.ativa).toBe(true);

    Object.defineProperty(document, "fullscreenElement", { value: null, configurable: true });
    act(() => document.dispatchEvent(new Event("fullscreenchange")));

    expect(result.current.ativa).toBe(false);
  });

  it("entrar() nunca lança mesmo se requestFullscreen não existir (ambiente sem suporte)", () => {
    // @ts-expect-error simula ausência da API
    document.documentElement.requestFullscreen = undefined;
    const { result } = renderHook(() => useModoApresentacao());

    expect(() => act(() => result.current.entrar())).not.toThrow();
    expect(result.current.ativa).toBe(true);
  });
});
