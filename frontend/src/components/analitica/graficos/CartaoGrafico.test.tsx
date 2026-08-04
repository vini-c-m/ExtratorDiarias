// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import CartaoGrafico from "./CartaoGrafico";

afterEach(() => {
  cleanup();
});

const LINHAS = [
  { rotulo: "jan/2026", valor: "12" },
  { rotulo: "fev/2026", valor: "9" },
];

describe("CartaoGrafico", () => {
  it("mostra o título e o visual (children) por padrão, sem a tabela", () => {
    render(
      <CartaoGrafico titulo="Evolução por período" linhasTabela={LINHAS} rotuloColunaValor="Diárias">
        <div data-testid="visual-do-grafico" />
      </CartaoGrafico>,
    );

    expect(screen.getByText("Evolução por período")).toBeInTheDocument();
    expect(screen.getByTestId("visual-do-grafico")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("alternar para 'Ver como tabela' mostra o equivalente textual e some com o visual", () => {
    render(
      <CartaoGrafico titulo="Evolução por período" linhasTabela={LINHAS} rotuloColunaValor="Diárias">
        <div data-testid="visual-do-grafico" />
      </CartaoGrafico>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Ver como tabela" }));

    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByText("jan/2026")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.queryByTestId("visual-do-grafico")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ver gráfico" })).toBeInTheDocument();
  });

  it("alternar de volta para 'Ver gráfico' restaura o visual", () => {
    render(
      <CartaoGrafico titulo="Evolução por período" linhasTabela={LINHAS} rotuloColunaValor="Diárias">
        <div data-testid="visual-do-grafico" />
      </CartaoGrafico>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Ver como tabela" }));
    fireEvent.click(screen.getByRole("button", { name: "Ver gráfico" }));

    expect(screen.getByTestId("visual-do-grafico")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("o visual (children) é sempre aria-hidden — a tabela é o equivalente acessível", () => {
    const { container } = render(
      <CartaoGrafico titulo="Evolução por período" linhasTabela={LINHAS} rotuloColunaValor="Diárias">
        <div data-testid="visual-do-grafico" />
      </CartaoGrafico>,
    );

    expect(container.querySelector('[aria-hidden="true"]')).toContainElement(screen.getByTestId("visual-do-grafico"));
  });

  it("legenda com 2+ itens é exibida com o swatch de cor de cada um", () => {
    render(
      <CartaoGrafico
        titulo="Distribuição por motivo"
        linhasTabela={LINHAS}
        rotuloColunaValor="Diárias"
        legenda={[
          { rotulo: "Capacitação", cor: "#3987e5" },
          { rotulo: "Reunião", cor: "#d55181" },
        ]}
      >
        <div />
      </CartaoGrafico>,
    );

    expect(screen.getByText("Capacitação")).toBeInTheDocument();
    expect(screen.getByText("Reunião")).toBeInTheDocument();
  });

  it("legenda com um único item não é exibida (série única, o título já basta)", () => {
    render(
      <CartaoGrafico
        titulo="Evolução por período"
        linhasTabela={LINHAS}
        rotuloColunaValor="Diárias"
        legenda={[{ rotulo: "Diárias", cor: "#22d3ee" }]}
      >
        <div />
      </CartaoGrafico>,
    );

    expect(screen.queryByText("Diárias")).not.toBeInTheDocument();
  });

  it("recorte vazio: mostra a mensagem de 'sem dados', nunca o botão de alternância nem um gráfico vazio", () => {
    render(
      <CartaoGrafico titulo="Distribuição por motivo" linhasTabela={[]} rotuloColunaValor="Diárias" vazio>
        <div data-testid="visual-do-grafico" />
      </CartaoGrafico>,
    );

    expect(screen.getByText("Sem dados para este recorte.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ver como tabela" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("visual-do-grafico")).not.toBeInTheDocument();
  });

  describe("clique-refina (Sprint 19.6.5)", () => {
    it("interativo: o visual deixa de ser aria-hidden — os controles internos já são o próprio equivalente acessível", () => {
      render(
        <CartaoGrafico titulo="Ranking de servidores" linhasTabela={LINHAS} rotuloColunaValor="Diárias" interativo>
          <div data-testid="visual-do-grafico" />
        </CartaoGrafico>,
      );

      expect(screen.getByTestId("visual-do-grafico").closest('[aria-hidden="true"]')).toBeNull();
    });

    it("legenda com aoClicarLegenda: itens filtráveis viram botão; 'Outros' (filtravel: false) não", () => {
      const aoClicarLegenda = vi.fn();
      render(
        <CartaoGrafico
          titulo="Distribuição por motivo"
          linhasTabela={LINHAS}
          rotuloColunaValor="Diárias"
          interativo
          aoClicarLegenda={aoClicarLegenda}
          legenda={[
            { rotulo: "Capacitação", cor: "#3987e5" },
            { rotulo: "Outros", cor: "#94a3b8", filtravel: false },
          ]}
        >
          <div />
        </CartaoGrafico>,
      );

      const botao = screen.getByRole("button", { name: "Filtrar por Capacitação" });
      fireEvent.click(botao);
      expect(aoClicarLegenda).toHaveBeenCalledWith(0);

      expect(screen.getByText("Outros")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Outros/ })).not.toBeInTheDocument();
    });

    it("sem aoClicarLegenda (mesmo com interativo): legenda continua só leitura", () => {
      render(
        <CartaoGrafico
          titulo="Distribuição por motivo"
          linhasTabela={LINHAS}
          rotuloColunaValor="Diárias"
          interativo
          legenda={[
            { rotulo: "Capacitação", cor: "#3987e5" },
            { rotulo: "Reunião", cor: "#d55181" },
          ]}
        >
          <div />
        </CartaoGrafico>,
      );

      expect(screen.queryByRole("button", { name: /Filtrar por/ })).not.toBeInTheDocument();
    });
  });
});
