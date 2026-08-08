// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useValorAnimado } from "./useValorAnimado";

// Stub determinístico de requestAnimationFrame/cancelAnimationFrame — não
// depende do agendamento real do fake-timers do Vitest para rAF (evita
// acoplar o teste a detalhes de implementação da lib de mocks). Cada frame
// só avança quando o teste chama `rodarProximoFrame` explicitamente,
// controlando também `performance.now()` — assim o teste decide
// exatamente quanto tempo "passou" a cada frame, sem depender de frames
// reais de 60fps.
let proximoId = 0;
let callbacksPendentes: Map<number, FrameRequestCallback>;
let agora: number;

function rodarProximoFrame(avancoMs: number) {
  agora += avancoMs;
  const callbacks = Array.from(callbacksPendentes.values());
  callbacksPendentes.clear();
  act(() => {
    callbacks.forEach((callback) => callback(agora));
  });
}

beforeEach(() => {
  proximoId = 0;
  callbacksPendentes = new Map();
  agora = 0;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    proximoId += 1;
    callbacksPendentes.set(proximoId, callback);
    return proximoId;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    callbacksPendentes.delete(id);
  });
  vi.spyOn(performance, "now").mockImplementation(() => agora);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("useValorAnimado", () => {
  it("primeira montagem nunca anima — mostra o valor real de cara", () => {
    const { result } = renderHook(() => useValorAnimado(100));
    expect(result.current).toBe(100);
    expect(callbacksPendentes.size).toBe(0);
  });

  it("novo valor dispara a animação e termina EXATAMENTE no valor real", () => {
    const { result, rerender } = renderHook(({ valor }) => useValorAnimado(valor), {
      initialProps: { valor: 100 },
    });

    rerender({ valor: 250 });
    expect(callbacksPendentes.size).toBe(1); // animação disparada

    // Frame no meio do caminho: valor exibido fica ENTRE 100 e 250, nunca
    // pula direto (comportamento de interpolação real, não fade).
    rodarProximoFrame(200); // metade dos 400ms padrão
    expect(result.current).not.toBeNull();
    expect(result.current as number).toBeGreaterThan(100);
    expect(result.current as number).toBeLessThan(250);

    // Frame que completa a duração: chega EXATAMENTE no valor real.
    rodarProximoFrame(400);
    expect(result.current).toBe(250);
  });

  it("valor idêntico não reinicia a animação (sem novo frame)", () => {
    const { rerender } = renderHook(({ valor }) => useValorAnimado(valor), {
      initialProps: { valor: 100 },
    });

    rerender({ valor: 100 });

    expect(callbacksPendentes.size).toBe(0);
  });

  it("novo valor no meio de uma animação cancela a anterior e recomeça do valor atualmente exibido", () => {
    const { result, rerender } = renderHook(({ valor }) => useValorAnimado(valor), {
      initialProps: { valor: 0 },
    });

    rerender({ valor: 100 });
    rodarProximoFrame(200); // meio do caminho, valor exibido ~ algo entre 0 e 100
    const valorNoMeio = result.current as number;
    expect(valorNoMeio).toBeGreaterThan(0);
    expect(valorNoMeio).toBeLessThan(100);

    rerender({ valor: 500 }); // chega um valor novo antes de terminar
    // Novo alvo, frame concluído imediatamente (progresso >= 1 no 1º passo).
    rodarProximoFrame(400);
    expect(result.current).toBe(500);
  });

  it("prefers-reduced-motion: pula direto para o valor final, sem interpolar frame nenhum", () => {
    const matchMediaOriginal = window.matchMedia;
    window.matchMedia = vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }) as unknown as typeof window.matchMedia;

    const { result, rerender } = renderHook(({ valor }) => useValorAnimado(valor), {
      initialProps: { valor: 100 },
    });

    rerender({ valor: 900 });

    expect(result.current).toBe(900);
    expect(callbacksPendentes.size).toBe(0);

    window.matchMedia = matchMediaOriginal;
  });

  it("valor real → null (recarregando) → novo valor real: anima a partir do ÚLTIMO VALOR REAL, nunca 'esquece' por causa do instante em null (achado real da validação manual — troca de filtro sempre passa por indicadores === null)", () => {
    const { result, rerender } = renderHook(({ valor }) => useValorAnimado(valor), {
      initialProps: { valor: 100 as number | null },
    });

    rerender({ valor: null });
    expect(result.current).toBeNull();
    expect(callbacksPendentes.size).toBe(0);

    rerender({ valor: 250 });
    expect(callbacksPendentes.size).toBe(1); // animou, não "reapareceu" direto

    rodarProximoFrame(200); // meio do caminho
    expect(result.current as number).toBeGreaterThan(100);
    expect(result.current as number).toBeLessThan(250);

    rodarProximoFrame(400);
    expect(result.current).toBe(250);
  });

  it("valor null nunca interpola", () => {
    const { result, rerender } = renderHook(({ valor }) => useValorAnimado(valor), {
      initialProps: { valor: 100 as number | null },
    });

    rerender({ valor: null });

    expect(result.current).toBeNull();
    expect(callbacksPendentes.size).toBe(0);
  });
});
