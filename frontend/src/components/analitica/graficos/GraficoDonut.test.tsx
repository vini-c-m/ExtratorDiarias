// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import GraficoDonut from "./GraficoDonut";

afterEach(() => {
  cleanup();
});

const formatarValor = (valor: number) => valor.toLocaleString("pt-BR");

describe("GraficoDonut", () => {
  it("recorte vazio: não renderiza nada", () => {
    const { container } = render(<GraficoDonut segmentos={[]} formatarValor={formatarValor} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("total zero (todos os segmentos com valor 0): não renderiza nada, nunca uma divisão por zero visível", () => {
    const { container } = render(
      <GraficoDonut
        segmentos={[
          { rotulo: "Capacitação", valor: 0, cor: "#3987e5" },
          { rotulo: "Reunião", valor: 0, cor: "#d55181" },
        ]}
        formatarValor={formatarValor}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("desenha um <circle> por segmento, na cor recebida", () => {
    const { container } = render(
      <GraficoDonut
        segmentos={[
          { rotulo: "Capacitação", valor: 41, cor: "#3987e5" },
          { rotulo: "Reunião", valor: 33, cor: "#d55181" },
          { rotulo: "Fiscalização", valor: 26, cor: "#9085e9" },
        ]}
        formatarValor={formatarValor}
      />,
    );
    const circulos = container.querySelectorAll("circle");
    expect(circulos).toHaveLength(3);
    expect(circulos[0]).toHaveAttribute("stroke", "#3987e5");
    expect(circulos[1]).toHaveAttribute("stroke", "#d55181");
    expect(circulos[2]).toHaveAttribute("stroke", "#9085e9");
  });

  it("cada segmento tem um <title> com rótulo, valor formatado e percentual", () => {
    const { container } = render(
      <GraficoDonut
        segmentos={[
          { rotulo: "Capacitação", valor: 75, cor: "#3987e5" },
          { rotulo: "Reunião", valor: 25, cor: "#d55181" },
        ]}
        formatarValor={formatarValor}
      />,
    );
    const titulos = Array.from(container.querySelectorAll("circle title")).map((t) => t.textContent);
    expect(titulos[0]).toContain("Capacitação");
    expect(titulos[0]).toContain("75");
    expect(titulos[0]).toContain("75%");
    expect(titulos[1]).toContain("Reunião");
    expect(titulos[1]).toContain("25%");
  });

  it("o rótulo direto no centro mostra o percentual do maior segmento, mesmo fora de ordem", () => {
    const { container } = render(
      <GraficoDonut
        segmentos={[
          { rotulo: "Reunião", valor: 25, cor: "#d55181" },
          { rotulo: "Capacitação", valor: 75, cor: "#3987e5" },
        ]}
        formatarValor={formatarValor}
      />,
    );
    expect(container.querySelector("text")?.textContent).toBe("75%");
  });

  describe("rótulo do segmento dominante (refinamento visual 2.0, 2026-08-07)", () => {
    it("segmento claramente dominante (>=60%): mostra percentual E o rótulo, em <text> separados", () => {
      const { container } = render(
        <GraficoDonut
          segmentos={[
            { rotulo: "Servidor", valor: 80, cor: "#3987e5" },
            { rotulo: "Membro", valor: 20, cor: "#d55181" },
          ]}
          formatarValor={formatarValor}
        />,
      );
      const textos = Array.from(container.querySelectorAll("text")).map((t) => t.textContent);
      expect(textos).toEqual(["80%", "Servidor"]);
    });

    it("distribuição equilibrada (<60%, sem dominância clara): preserva a apresentação neutra — só o percentual", () => {
      const { container } = render(
        <GraficoDonut
          segmentos={[
            { rotulo: "Servidor", valor: 55, cor: "#3987e5" },
            { rotulo: "Membro", valor: 45, cor: "#d55181" },
          ]}
          formatarValor={formatarValor}
        />,
      );
      const textos = Array.from(container.querySelectorAll("text")).map((t) => t.textContent);
      expect(textos).toEqual(["55%"]);
    });

    it("rótulo dominante longo é truncado com reticências (texto SVG não trunca via CSS)", () => {
      const { container } = render(
        <GraficoDonut
          segmentos={[
            { rotulo: "Capacitação/Treinamento", valor: 90, cor: "#3987e5" },
            { rotulo: "Reunião", valor: 10, cor: "#d55181" },
          ]}
          formatarValor={formatarValor}
        />,
      );
      const textos = Array.from(container.querySelectorAll("text")).map((t) => t.textContent);
      expect(textos[1]).toBe("Capacitaç…");
    });
  });

  describe("clique-refina (Sprint 19.6.5)", () => {
    const SEGMENTOS = [
      { rotulo: "Capacitação", valor: 75, cor: "#3987e5" },
      { rotulo: "Outros", valor: 25, cor: "#94a3b8", filtravel: false },
    ];

    it("sem aoClicarSegmento: nenhum círculo tem onClick (comportamento só leitura preservado)", () => {
      const { container } = render(<GraficoDonut segmentos={SEGMENTOS} formatarValor={formatarValor} />);
      container.querySelectorAll("circle").forEach((circulo) => expect(circulo).not.toHaveStyle({ cursor: "pointer" }));
    });

    it("com aoClicarSegmento: clicar num segmento filtrável informa o índice; segmento não-filtrável ('Outros') não reage", () => {
      const aoClicarSegmento = vi.fn();
      const { container } = render(
        <GraficoDonut segmentos={SEGMENTOS} formatarValor={formatarValor} aoClicarSegmento={aoClicarSegmento} />,
      );
      const circulos = container.querySelectorAll("circle");

      fireEvent.click(circulos[0]);
      expect(aoClicarSegmento).toHaveBeenCalledWith(0);

      fireEvent.click(circulos[1]);
      expect(aoClicarSegmento).toHaveBeenCalledTimes(1);
    });
  });
});
