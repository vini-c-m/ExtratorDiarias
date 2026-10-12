// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MarketTapeInsights from "./MarketTapeInsights";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function configurarReducedMotion(ativa: boolean) {
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({
    matches: ativa,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

beforeEach(() => configurarReducedMotion(false));

const INTERVALO_MS = 3000;

function ativoAtual() {
  return screen.getAllByRole("listitem").findIndex((item) => item.querySelector("[data-ativo='true']") !== null);
}

describe("MarketTapeInsights", () => {
  // AJUSTE FINAL (2026-08-10) — item 1: a sequência NUNCA mais depende de
  // `prefers-reduced-motion` no JS (o componente nem consulta mais essa
  // preferência) — só a CSS do card ativo muda de pele conforme o SO. As
  // duas primeiras suítes (A e B) rodam o MESMO teste de sequência com
  // `matchMedia` mockado para `false` e para `true`, provando que o
  // comportamento de avanço é idêntico nos dois casos.
  describe.each([
    ["A) prefers-reduced-motion=false", false],
    ["B) prefers-reduced-motion=true", true],
  ] as const)("%s", (_rotulo, reduzido) => {
    beforeEach(() => configurarReducedMotion(reduzido));

    it("sequência completa: primeiro ativa, avança de cima para baixo e do último volta ao primeiro (loop)", () => {
      vi.useFakeTimers();
      render(
        <MarketTapeInsights
          itens={["A", "B", "C"]}
          chave={(item) => item}
          renderizar={(item, ativo) => <span data-ativo={ativo}>{item}</span>}
        />,
      );

      expect(ativoAtual()).toBe(0);
      act(() => vi.advanceTimersByTime(INTERVALO_MS));
      expect(ativoAtual()).toBe(1);
      act(() => vi.advanceTimersByTime(INTERVALO_MS));
      expect(ativoAtual()).toBe(2);
      act(() => vi.advanceTimersByTime(INTERVALO_MS));
      expect(ativoAtual()).toBe(0); // G) nenhuma config. do Windows foi alterada e o destaque segue funcionando
    });

    // D) hover pausa a sequência e destaca o item sob o mouse, nos dois modos.
    it("D) hover pausa a sequência e destaca o item sob o mouse", () => {
      vi.useFakeTimers();
      render(
        <MarketTapeInsights
          itens={["A", "B", "C"]}
          chave={(item) => item}
          renderizar={(item, ativo) => <span data-ativo={ativo}>{item}</span>}
        />,
      );
      const lista = screen.getByTestId("market-tape-lista");
      act(() => vi.advanceTimersByTime(INTERVALO_MS)); // "B" ativo pela sequência
      const itens = screen.getAllByRole("listitem");

      fireEvent.mouseEnter(itens[0]);
      fireEvent.pointerEnter(lista);
      expect(itens[0].querySelector("[data-ativo='true']")).not.toBeNull();
      expect(itens[1].querySelector("[data-ativo='true']")).toBeNull();

      act(() => vi.advanceTimersByTime(INTERVALO_MS * 3)); // pausado: tempo passar não muda nada
      expect(itens[0].querySelector("[data-ativo='true']")).not.toBeNull();
    });

    // F) ao sair do hover, a sequência retoma de onde estava (nunca reseta).
    it("F) mouse sai e a sequência retoma exatamente de onde estava, sem resetar", () => {
      vi.useFakeTimers();
      render(
        <MarketTapeInsights
          itens={["A", "B", "C"]}
          chave={(item) => item}
          renderizar={(item, ativo) => <span data-ativo={ativo}>{item}</span>}
        />,
      );
      const lista = screen.getByTestId("market-tape-lista");
      act(() => vi.advanceTimersByTime(INTERVALO_MS)); // "B" ativo
      const itens = screen.getAllByRole("listitem");

      fireEvent.mouseEnter(itens[0]);
      fireEvent.pointerEnter(lista);
      fireEvent.pointerLeave(lista);

      expect(itens[1].querySelector("[data-ativo='true']")).not.toBeNull();
    });

    // E) foco (teclado) também pausa, nos dois modos.
    it("E) foco em qualquer item pausa a sequência", () => {
      vi.useFakeTimers();
      render(
        <MarketTapeInsights
          itens={["A", "B"]}
          chave={(item) => item}
          renderizar={(item, ativo) => <button data-ativo={ativo}>{item}</button>}
        />,
      );
      const botaoB = screen.getByRole("button", { name: "B" });
      fireEvent.focusIn(botaoB);
      const itens = screen.getAllByRole("listitem");
      expect(itens[1].querySelector("[data-ativo='true']")).not.toBeNull();

      act(() => vi.advanceTimersByTime(INTERVALO_MS * 3));
      // Continua em "B" — o foco pausou o avanço automático, que teria
      // seguido para "A" (loop) se não estivesse pausado.
      expect(itens[1].querySelector("[data-ativo='true']")).not.toBeNull();
    });
  });

  // C) reduced-motion: nenhum deslocamento espacial (translate/scale) — a
  // garantia é 100% CSS (o componente não aplica nenhum estilo inline
  // condicionado à preferência do SO, então não há nada para testar no
  // nível de DOM além de "nenhum estilo inline aparece"); a regra visual
  // em si é verificada lendo o CSS de produção diretamente, para nunca
  // regressar silenciosamente.
  it("C) reduced-motion nunca aplica transform/scale via JS — o card ativo não tem nenhum estilo inline", () => {
    configurarReducedMotion(true);
    vi.useFakeTimers();
    render(
      <MarketTapeInsights
        itens={["A", "B"]}
        chave={(item) => item}
        renderizar={(item, ativo) => <span data-ativo={ativo}>{item}</span>}
      />,
    );
    const itens = screen.getAllByRole("listitem");
    // Nenhum wrapper nem conteúdo renderizado tem `style` — todo o
    // destaque (em qualquer modo) é resolvido só por classe CSS.
    for (const item of itens) {
      expect(item).not.toHaveAttribute("style");
      expect(item.firstElementChild).not.toHaveAttribute("style");
    }
  });

  it("C) o CSS de reduced-motion zera transform/box-shadow do card ativo (sem deslocamento espacial)", () => {
    const caminhoCss = resolve(process.cwd(), "src/components/analitica/executivo/modoExecutivo.css");
    // Aceita checkout com LF ou CRLF (core.autocrlf=true no Windows).
    const css = readFileSync(caminhoCss, "utf-8").replace(/\r\n/g, "\n");
    const indiceMedia = css.indexOf("@media (prefers-reduced-motion: reduce)");
    expect(indiceMedia).toBeGreaterThan(-1);
    const blocoReduzido = css.slice(indiceMedia, css.indexOf("\n}\n", css.indexOf("market-tape-item-spotlight", indiceMedia)) + 3);
    expect(blocoReduzido).toMatch(/\.market-tape-item-spotlight\s*\{[^}]*transform:\s*none/);
    expect(blocoReduzido).not.toMatch(/translateX/);
    expect(blocoReduzido).not.toMatch(/scale\(/);
  });

  // J — lista vazia não renderiza nada.
  it("J) lista vazia não renderiza a lista", () => {
    const { container } = render(
      <MarketTapeInsights itens={[]} chave={(item) => String(item)} renderizar={() => null} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  // K — item único: renderiza normalmente, nunca duplicado, sem quebrar
  // (a sequência simplesmente não tem para onde avançar).
  it("K) item único renderiza uma vez só, sem duplicar", () => {
    vi.useFakeTimers();
    render(
      <MarketTapeInsights itens={["Único"]} chave={(item) => item} renderizar={(item) => <span>{item}</span>} />,
    );
    expect(screen.getAllByText("Único")).toHaveLength(1);
    act(() => vi.advanceTimersByTime(INTERVALO_MS * 3));
    expect(screen.getAllByText("Único")).toHaveLength(1);
  });

  // L — nenhum resquício da mecânica de scroll/ticker antiga permanece:
  // sem trilho, sem cópia visual duplicada, sem viewport com overflow.
  it("L) não existe nenhum vestígio de scroll/ticker vertical (trilho, cópia duplicada, viewport)", () => {
    const { container } = render(
      <MarketTapeInsights
        itens={["A", "B"]}
        chave={(item) => item}
        renderizar={(item) => <span>{item}</span>}
      />,
    );
    expect(container.querySelector(".market-tape-trilho")).not.toBeInTheDocument();
    expect(container.querySelector(".market-tape-viewport")).not.toBeInTheDocument();
    expect(container.querySelector(".market-tape-grupo")).not.toBeInTheDocument();
    expect(container.querySelectorAll('[aria-hidden="true"]')).toHaveLength(0);
    expect(screen.getAllByText("A")).toHaveLength(1);
    expect(screen.getAllByText("B")).toHaveLength(1);
  });

  it("sem remontar a lista entre trocas de destaque (mesmo nó DOM)", () => {
    vi.useFakeTimers();
    render(
      <MarketTapeInsights
        itens={["A", "B"]}
        chave={(item) => item}
        renderizar={(item) => <span>{item}</span>}
      />,
    );
    const lista = screen.getByTestId("market-tape-lista");
    act(() => vi.advanceTimersByTime(INTERVALO_MS));
    expect(screen.getByTestId("market-tape-lista")).toBe(lista);
  });
});
