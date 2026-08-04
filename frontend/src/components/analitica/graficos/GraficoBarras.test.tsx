// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import GraficoBarras from "./GraficoBarras";

afterEach(() => {
  cleanup();
});

const formatarValor = (valor: number) => valor.toLocaleString("pt-BR");

describe("GraficoBarras", () => {
  it("recorte vazio: não renderiza nada", () => {
    const { container } = render(<GraficoBarras pontos={[]} orientacao="vertical" cor="#22d3ee" formatarValor={formatarValor} />);
    expect(container).toBeEmptyDOMElement();
  });

  describe("orientação horizontal (ranking)", () => {
    const PONTOS = [
      { rotulo: "João da Silva", valor: 12 },
      { rotulo: "Maria Souza", valor: 9 },
    ];

    it("mostra o rótulo e o valor de cada barra", () => {
      render(<GraficoBarras pontos={PONTOS} orientacao="horizontal" cor="#22d3ee" formatarValor={formatarValor} />);
      expect(screen.getByText("João da Silva")).toBeInTheDocument();
      expect(screen.getByText("12")).toBeInTheDocument();
      expect(screen.getByText("Maria Souza")).toBeInTheDocument();
      expect(screen.getByText("9")).toBeInTheDocument();
    });

    it("a barra da maior valor ocupa 100% de largura, a menor é proporcional", () => {
      const { container } = render(
        <GraficoBarras pontos={PONTOS} orientacao="horizontal" cor="#22d3ee" formatarValor={formatarValor} />,
      );
      const barras = container.querySelectorAll(".rounded-r");
      expect(barras[0]).toHaveStyle({ width: "100%" });
      expect(barras[1]).toHaveStyle({ width: "75%" }); // 9/12 = 75%
    });

    it("usa a cor recebida em todas as barras", () => {
      const { container } = render(
        <GraficoBarras pontos={PONTOS} orientacao="horizontal" cor="#d55181" formatarValor={formatarValor} />,
      );
      const barras = container.querySelectorAll(".rounded-r");
      barras.forEach((barra) => expect(barra).toHaveStyle({ backgroundColor: "#d55181" }));
    });
  });

  describe("orientação vertical (série temporal)", () => {
    const PONTOS = [
      { rotulo: "jan/2026", valor: 5 },
      { rotulo: "fev/2026", valor: 20 },
      { rotulo: "mar/2026", valor: 10 },
    ];

    it("mostra o rótulo de cada barra", () => {
      render(<GraficoBarras pontos={PONTOS} orientacao="vertical" cor="#22d3ee" formatarValor={formatarValor} />);
      expect(screen.getByText("jan/2026")).toBeInTheDocument();
      expect(screen.getByText("fev/2026")).toBeInTheDocument();
      expect(screen.getByText("mar/2026")).toBeInTheDocument();
    });

    it("rotula diretamente só a barra de maior valor (nunca todos os pontos)", () => {
      render(<GraficoBarras pontos={PONTOS} orientacao="vertical" cor="#22d3ee" formatarValor={formatarValor} />);
      expect(screen.getByText("20")).toBeInTheDocument();
      expect(screen.queryByText("5")).not.toBeInTheDocument();
      expect(screen.queryByText("10")).not.toBeInTheDocument();
    });

    it("a barra de maior valor atinge 100% da altura da área de barras", () => {
      const { container } = render(
        <GraficoBarras pontos={PONTOS} orientacao="vertical" cor="#22d3ee" formatarValor={formatarValor} />,
      );
      const barras = container.querySelectorAll(".rounded-t");
      expect(barras[1]).toHaveStyle({ height: "100%" });
    });

    it("valor zero real nunca vira uma barra visível (0%, não um mínimo artificial)", () => {
      const { container } = render(
        <GraficoBarras
          pontos={[{ rotulo: "jan/2026", valor: 0 }, ...PONTOS]}
          orientacao="vertical"
          cor="#22d3ee"
          formatarValor={formatarValor}
        />,
      );
      const barras = container.querySelectorAll(".rounded-t");
      expect(barras[0]).toHaveStyle({ height: "0%" });
    });
  });

  describe("clique-refina (Sprint 19.6.5)", () => {
    const PONTOS_FILTRAVEIS = [
      { rotulo: "Araripina-PE", valor: 89 },
      { rotulo: "Sem destino informado", valor: 4, filtravel: false },
    ];

    it("sem aoClicarPonto: nenhuma barra vira botão (comportamento só leitura preservado)", () => {
      render(<GraficoBarras pontos={PONTOS_FILTRAVEIS} orientacao="horizontal" cor="#22d3ee" formatarValor={formatarValor} />);
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });

    it("com aoClicarPonto: pontos filtráveis viram botão acessível; pontos não-filtráveis continuam visíveis, mas não clicáveis", () => {
      const aoClicarPonto = vi.fn();
      render(
        <GraficoBarras
          pontos={PONTOS_FILTRAVEIS}
          orientacao="horizontal"
          cor="#22d3ee"
          formatarValor={formatarValor}
          aoClicarPonto={aoClicarPonto}
        />,
      );

      const botao = screen.getByRole("button", { name: "Filtrar por Araripina-PE: 89" });
      expect(botao).toBeInTheDocument();
      fireEvent.click(botao);
      expect(aoClicarPonto).toHaveBeenCalledWith(0);

      // O ponto não-filtrável nunca vira botão, mas o rótulo continua visível.
      expect(screen.getByText("Sem destino informado")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Sem destino informado/ })).not.toBeInTheDocument();
    });

    it("clicar num ponto (orientação vertical) informa o índice correto", () => {
      const aoClicarPonto = vi.fn();
      const pontos = [
        { rotulo: "jan/2026", valor: 5 },
        { rotulo: "fev/2026", valor: 20 },
      ];
      render(
        <GraficoBarras
          pontos={pontos}
          orientacao="vertical"
          cor="#22d3ee"
          formatarValor={formatarValor}
          aoClicarPonto={aoClicarPonto}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "Filtrar por fev/2026: 20" }));
      expect(aoClicarPonto).toHaveBeenCalledWith(1);
      expect(aoClicarPonto).toHaveBeenCalledTimes(1);
    });
  });
});
