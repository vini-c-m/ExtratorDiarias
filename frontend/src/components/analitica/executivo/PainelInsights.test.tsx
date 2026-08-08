// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import PainelInsights from "./PainelInsights";
import type { Insight } from "./insightsExecutivos";

afterEach(() => {
  cleanup();
});

const INSIGHTS: Insight[] = [
  { id: "variacao", tipo: "neutro", texto: "+18% de aumento no período", tituloCurto: "GASTOS NO PERÍODO" },
  { id: "concentracao-gastos", tipo: "atencao", texto: "Recife concentra 24% dos gastos", tituloCurto: "CONCENTRAÇÃO TERRITORIAL" },
];

const PROPS_BASE = {
  insights: INSIGHTS,
  carregando: false,
  erro: null,
  tentarNovamente: () => {},
  onMudarFiltro: () => {},
  aoAbrirDiagnostico: () => {},
};

describe("PainelInsights", () => {
  // Redesign BI 3.0 (2026-08-07) — abaixo de xl (1280px) o painel vira
  // seção recolhível; em xl+ o conteúdo fica sempre visível via `xl:!block`
  // independente do estado local (jsdom não simula breakpoint real, então
  // o guarda-corpo possível é a classe em si — mesmo critério já usado
  // para `overflow-hidden`/`min-w-0` em rodadas anteriores).
  describe("seção recolhível (<xl)", () => {
    it("começa recolhido: a lista tem 'hidden', mas sempre com 'xl:!block' (nunca escondida em telas grandes)", () => {
      const { container } = render(<PainelInsights {...PROPS_BASE} />);
      const lista = container.querySelector("ul")!;
      expect(lista).toHaveClass("hidden");
      expect(lista.className).toContain("xl:!block");
    });

    it("clicar em 'Ver (N)' expande a lista (perde 'hidden')", () => {
      const { container } = render(<PainelInsights {...PROPS_BASE} />);
      fireEvent.click(screen.getByRole("button", { name: "Ver (2)" }));
      const lista = container.querySelector("ul")!;
      expect(lista).not.toHaveClass("hidden");
      expect(screen.getByRole("button", { name: "Ocultar" })).toBeInTheDocument();
    });

    it("o botão de recolher/expandir some em xl+ (xl:hidden)", () => {
      render(<PainelInsights {...PROPS_BASE} />);
      expect(screen.getByRole("button", { name: "Ver (2)" })).toHaveClass("xl:hidden");
    });
  });

  it("mostra os 2 insights recebidos, mesmo recolhido (conteúdo continua no DOM)", () => {
    render(<PainelInsights {...PROPS_BASE} />);
    expect(screen.getByText("+18% de aumento no período")).toBeInTheDocument();
    expect(screen.getByText("Recife concentra 24% dos gastos")).toBeInTheDocument();
  });

  it("recorte vazio: não renderiza nada (não é erro)", () => {
    const { container } = render(<PainelInsights {...PROPS_BASE} insights={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("erro: mostra alerta e 'Tentar novamente'", () => {
    const tentarNovamente = vi.fn();
    render(<PainelInsights {...PROPS_BASE} erro="Falha ao calcular insights." tentarNovamente={tentarNovamente} />);
    expect(screen.getByText("Falha ao calcular insights.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(tentarNovamente).toHaveBeenCalledTimes(1);
  });

  // BI 4.0 — "Insights em movimento": rotação automática do destaque.
  describe("rotação automática (BI 4.0)", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it("avança o marcador em destaque a cada ~6,5s", () => {
      vi.useFakeTimers();
      render(<PainelInsights {...PROPS_BASE} />);

      expect(screen.getByRole("button", { name: "Ir para o insight 1" })).toHaveAttribute("aria-current", "true");

      act(() => {
        vi.advanceTimersByTime(6500);
      });

      expect(screen.getByRole("button", { name: "Ir para o insight 2" })).toHaveAttribute("aria-current", "true");
      expect(screen.getByRole("button", { name: "Ir para o insight 1" })).not.toHaveAttribute("aria-current");
    });

    // BI 4.0 (correção de perceptibilidade) — prova que a troca não é só
    // um atributo `aria-current`: o bloco de detalhe (número + texto
    // completo) do insight que SAI recolhe (opacity-0) e o que ENTRA
    // expande (opacity-100/grid-rows-[1fr]) — o mecanismo visual real de
    // "sair"/"entrar", não só o estado lógico.
    it("insight que sai recolhe (opacity-0) e o que entra expande (opacity-100) — mecanismo visual real", () => {
      vi.useFakeTimers();
      render(<PainelInsights {...PROPS_BASE} />);

      const blocoDetalhe1 = screen.getByText(INSIGHTS[0].texto).parentElement!.parentElement!;
      const blocoDetalhe2 = screen.getByText(INSIGHTS[1].texto).parentElement!.parentElement!;
      expect(blocoDetalhe1.className).toContain("opacity-100");
      expect(blocoDetalhe2.className).toContain("opacity-0");

      act(() => {
        vi.advanceTimersByTime(6500);
      });

      expect(blocoDetalhe1.className).toContain("opacity-0");
      expect(blocoDetalhe2.className).toContain("opacity-100");
    });

    it("hover no painel pausa a rotação; sair do hover retoma", () => {
      vi.useFakeTimers();
      const { container } = render(<PainelInsights {...PROPS_BASE} />);
      const painel = container.firstChild as HTMLElement;

      fireEvent.mouseEnter(painel);
      act(() => {
        vi.advanceTimersByTime(20000);
      });
      expect(screen.getByRole("button", { name: "Ir para o insight 1" })).toHaveAttribute("aria-current", "true");

      fireEvent.mouseLeave(painel);
      act(() => {
        vi.advanceTimersByTime(6500);
      });
      expect(screen.getByRole("button", { name: "Ir para o insight 2" })).toHaveAttribute("aria-current", "true");
    });

    it("clicar num marcador seleciona manualmente o insight em destaque", () => {
      vi.useFakeTimers();
      render(<PainelInsights {...PROPS_BASE} />);

      fireEvent.click(screen.getByRole("button", { name: "Ir para o insight 2" }));

      expect(screen.getByRole("button", { name: "Ir para o insight 2" })).toHaveAttribute("aria-current", "true");
    });

    it("um único insight: marcador não vira botão (nada para paginar)", () => {
      vi.useFakeTimers();
      render(<PainelInsights {...PROPS_BASE} insights={[INSIGHTS[0]]} />);

      expect(screen.queryByRole("button", { name: /Ir para o insight/ })).not.toBeInTheDocument();
    });

    it("prefers-reduced-motion: nunca avança sozinho", () => {
      vi.useFakeTimers();
      const matchMediaOriginal = window.matchMedia;
      window.matchMedia = vi.fn().mockReturnValue({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }) as unknown as typeof window.matchMedia;

      render(<PainelInsights {...PROPS_BASE} />);
      act(() => {
        vi.advanceTimersByTime(20000);
      });

      expect(screen.getByRole("button", { name: "Ir para o insight 1" })).toHaveAttribute("aria-current", "true");
      window.matchMedia = matchMediaOriginal;
    });
  });
});
