// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MarketTapeInsights from "./MarketTapeInsights";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function configurarReducedMotion(ativa: boolean) {
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({
    matches: ativa,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

describe("MarketTapeInsights", () => {
  beforeEach(() => configurarReducedMotion(false));

  it("mantém uma lista lógica e uma cópia estritamente visual/inert para o loop", () => {
    const { container } = render(
      <MarketTapeInsights
        itens={["Financeiro", "Territorial"]}
        chave={(item) => item}
        renderizar={(item) => <button type="button">{item}</button>}
      />,
    );
    expect(screen.getAllByText("Financeiro")).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Financeiro" })).toHaveLength(1);
    const copia = container.querySelector('[aria-hidden="true"].market-tape-grupo') as HTMLElement;
    expect(copia).toBeInTheDocument();
    expect(copia.inert).toBe(true);
  });

  it("com reduced-motion mostra todos os itens uma única vez e sem trilho animado", () => {
    configurarReducedMotion(true);
    render(
      <MarketTapeInsights itens={["A", "B"]} chave={(item) => item} renderizar={(item) => <span>{item}</span>} />,
    );
    expect(screen.getByTestId("market-tape-estatico")).toBeInTheDocument();
    expect(screen.queryByTestId("market-tape-continuo")).not.toBeInTheDocument();
    expect(screen.getAllByText("A")).toHaveLength(1);
  });

  it("um único item fica estático e não é duplicado", () => {
    render(<MarketTapeInsights itens={["Único"]} chave={(item) => item} renderizar={(item) => <span>{item}</span>} />);
    expect(screen.getByTestId("market-tape-estatico")).toBeInTheDocument();
    expect(screen.getAllByText("Único")).toHaveLength(1);
  });

  it("lista vazia não cria viewport", () => {
    const { container } = render(<MarketTapeInsights itens={[]} chave={(item) => String(item)} renderizar={() => null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("calcula duração pela altura a 18 px/s e pausa sem substituir o trilho", async () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      width: 300, height: 720, top: 0, right: 300, bottom: 720, left: 0, x: 0, y: 0, toJSON: () => ({}),
    });
    render(<MarketTapeInsights itens={["A", "B"]} chave={(item) => item} renderizar={(item) => <span>{item}</span>} />);
    const viewport = screen.getByTestId("market-tape-continuo");
    const trilho = viewport.querySelector(".market-tape-trilho") as HTMLElement;
    await waitFor(() => expect(trilho.style.getPropertyValue("--market-tape-duracao")).toBe("40s"));
    expect(trilho.style.getPropertyValue("--market-tape-distancia")).toBe("-720px");
    expect(trilho).toHaveClass("market-tape-trilho-ativo");
    fireEvent.pointerEnter(viewport);
    expect(viewport).toHaveClass("market-tape-pausado");
    fireEvent.pointerLeave(viewport);
    expect(viewport).not.toHaveClass("market-tape-pausado");
    expect(viewport.querySelector(".market-tape-trilho")).toBe(trilho);
  });

  it("não inicia a animação enquanto a altura medida for zero", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      width: 0, height: 0, top: 0, right: 0, bottom: 0, left: 0, x: 0, y: 0, toJSON: () => ({}),
    });
    render(<MarketTapeInsights itens={["A", "B"]} chave={(item) => item} renderizar={(item) => <span>{item}</span>} />);
    const trilho = screen.getByTestId("market-tape-continuo").querySelector(".market-tape-trilho") as HTMLElement;
    expect(trilho).not.toHaveClass("market-tape-trilho-ativo");
    expect(trilho.style.getPropertyValue("--market-tape-distancia")).toBe("0px");
  });
});
