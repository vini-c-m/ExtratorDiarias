// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PainelInsights from "./PainelInsights";
import type { Insight } from "./insightsExecutivos";

beforeEach(() => {
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
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
  describe("seção recolhível (<xl)", () => {
    it("começa recolhido sem montar o Market Tape oculto", () => {
      render(<PainelInsights {...PROPS_BASE} />);
      expect(screen.queryByTestId("market-tape-continuo")).not.toBeInTheDocument();
    });

    it("clicar em Ver expande a fita", () => {
      render(<PainelInsights {...PROPS_BASE} />);
      fireEvent.click(screen.getByRole("button", { name: "Ver (2)" }));
      expect(screen.getByTestId("market-tape-continuo")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Ocultar" })).toBeInTheDocument();
    });

    it("controle de recolher some em xl+", () => {
      render(<PainelInsights {...PROPS_BASE} />);
      expect(screen.getByRole("button", { name: "Ver (2)" })).toHaveClass("min-[960px]:hidden");
    });
  });

  it("mantém todos os insights na lista lógica acessível", () => {
    render(<PainelInsights {...PROPS_BASE} />);
    fireEvent.click(screen.getByRole("button", { name: "Ver (2)" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    const lista = screen.getByRole("list");
    expect(lista).toHaveTextContent(INSIGHTS[0].texto);
    expect(lista).toHaveTextContent(INSIGHTS[1].texto);
  });

  it("recorte vazio não renderiza painel", () => {
    const { container } = render(<PainelInsights {...PROPS_BASE} insights={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("erro mantém tentativa manual", () => {
    const tentarNovamente = vi.fn();
    render(<PainelInsights {...PROPS_BASE} erro="Falha ao calcular insights." tentarNovamente={tentarNovamente} />);
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(tentarNovamente).toHaveBeenCalledTimes(1);
  });

  describe("Market Tape contínuo (BI 5.1)", () => {
    it("usa trilho contínuo para dois ou mais insights", () => {
      render(<PainelInsights {...PROPS_BASE} />);
      fireEvent.click(screen.getByRole("button", { name: "Ver (2)" }));
      expect(screen.getByTestId("market-tape-continuo")).toBeInTheDocument();
      expect(document.querySelector(".market-tape-trilho")).toBeInTheDocument();
    });

    it("um único insight permanece estático e não é duplicado", () => {
      render(<PainelInsights {...PROPS_BASE} insights={[INSIGHTS[0]]} />);
      fireEvent.click(screen.getByRole("button", { name: "Ver (1)" }));
      expect(screen.getByTestId("market-tape-estatico")).toBeInTheDocument();
      expect(screen.getAllByText(INSIGHTS[0].texto)).toHaveLength(1);
    });
  });
});
