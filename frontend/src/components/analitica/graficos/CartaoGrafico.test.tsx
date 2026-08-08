// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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
  // Correção de regressão (2026-08-07) — cada CartaoGrafico é um viewport
  // isolado: nenhum filho (tooltip, glow, o que for) pode vazar
  // visualmente para o card vizinho na grade. `overflow-hidden` é a
  // garantia estrutural (o teste de posicionamento em si não é possível em
  // jsdom, que não calcula layout real — este é o guarda-corpo automatizado
  // possível; a confirmação visual pixel a pixel ficou registrada como
  // pendência no relatório).
  it("o container raiz tem overflow-hidden (nenhum filho pode vazar para o card vizinho)", () => {
    const { container } = render(
      <CartaoGrafico titulo="Evolução por período" linhasTabela={LINHAS} rotuloColunaValor="Diárias">
        {() => <div />}
      </CartaoGrafico>,
    );
    expect(container.firstElementChild).toHaveClass("overflow-hidden");
  });

  it("mostra o título e o visual (children) por padrão, sem a tabela", () => {
    render(
      <CartaoGrafico titulo="Evolução por período" linhasTabela={LINHAS} rotuloColunaValor="Diárias">
        {() => <div data-testid="visual-do-grafico" />}
      </CartaoGrafico>,
    );

    expect(screen.getByText("Evolução por período")).toBeInTheDocument();
    expect(screen.getByTestId("visual-do-grafico")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("alternar para 'Ver como tabela' (via menu '⋯') mostra o equivalente textual e some com o visual", () => {
    render(
      <CartaoGrafico titulo="Evolução por período" linhasTabela={LINHAS} rotuloColunaValor="Diárias">
        {() => <div data-testid="visual-do-grafico" />}
      </CartaoGrafico>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Mais opções" }));
    fireEvent.click(screen.getByRole("button", { name: "Ver como tabela" }));

    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByText("jan/2026")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.queryByTestId("visual-do-grafico")).not.toBeInTheDocument();
    // O menu fecha sozinho ao selecionar o item.
    expect(screen.queryByRole("button", { name: /Ver (gráfico|como tabela)/ })).not.toBeInTheDocument();
  });

  it("alternar de volta para 'Ver gráfico' restaura o visual", () => {
    render(
      <CartaoGrafico titulo="Evolução por período" linhasTabela={LINHAS} rotuloColunaValor="Diárias">
        {() => <div data-testid="visual-do-grafico" />}
      </CartaoGrafico>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Mais opções" }));
    fireEvent.click(screen.getByRole("button", { name: "Ver como tabela" }));
    fireEvent.click(screen.getByRole("button", { name: "Mais opções" }));
    fireEvent.click(screen.getByRole("button", { name: "Ver gráfico" }));

    expect(screen.getByTestId("visual-do-grafico")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  describe("menu '⋯' (refinamento visual 2.0, 2026-08-07)", () => {
    it("fechado por padrão; abre ao clicar em 'Mais opções' e mostra 'Ver como tabela'", () => {
      render(
        <CartaoGrafico titulo="Evolução por período" linhasTabela={LINHAS} rotuloColunaValor="Diárias">
          {() => <div />}
        </CartaoGrafico>,
      );

      expect(screen.queryByRole("button", { name: "Ver como tabela" })).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Mais opções" }));
      expect(screen.getByRole("button", { name: "Ver como tabela" })).toBeInTheDocument();
    });

    it("clicar fora do menu (backdrop) fecha sem alternar o modo", () => {
      render(
        <CartaoGrafico titulo="Evolução por período" linhasTabela={LINHAS} rotuloColunaValor="Diárias">
          {() => <div data-testid="visual-do-grafico" />}
        </CartaoGrafico>,
      );

      fireEvent.click(screen.getByRole("button", { name: "Mais opções" }));
      fireEvent.click(screen.getByRole("button", { name: "Fechar menu" }));

      expect(screen.queryByRole("button", { name: "Ver como tabela" })).not.toBeInTheDocument();
      expect(screen.getByTestId("visual-do-grafico")).toBeInTheDocument();
    });
  });

  describe("variante hero (refinamento visual 2.0, 2026-08-07)", () => {
    it("padrão: título usa a tipografia de subtítulo (nível abaixo do hero)", () => {
      render(
        <CartaoGrafico titulo="Evolução da quantidade" linhasTabela={LINHAS} rotuloColunaValor="Diárias">
          {() => <div />}
        </CartaoGrafico>,
      );
      expect(screen.getByText("Evolução da quantidade")).toHaveClass("text-sm");
    });

    it("hero: título usa a tipografia de título (maior, protagonista)", () => {
      render(
        <CartaoGrafico titulo="Evolução de gastos" linhasTabela={LINHAS} rotuloColunaValor="Valor" variante="hero">
          {() => <div />}
        </CartaoGrafico>,
      );
      expect(screen.getByText("Evolução de gastos")).toHaveClass("text-xl");
    });
  });

  it("o visual (children) é sempre aria-hidden — a tabela é o equivalente acessível", () => {
    render(
      <CartaoGrafico titulo="Evolução por período" linhasTabela={LINHAS} rotuloColunaValor="Diárias">
        {() => <div data-testid="visual-do-grafico" />}
      </CartaoGrafico>,
    );

    expect(screen.getByTestId("visual-do-grafico").closest('[aria-hidden="true"]')).not.toBeNull();
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
        {() => <div />}
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
        {() => <div />}
      </CartaoGrafico>,
    );

    expect(screen.queryByText("Diárias")).not.toBeInTheDocument();
  });

  it("recorte vazio: mostra a mensagem de 'sem dados', nunca o botão de alternância nem um gráfico vazio", () => {
    render(
      <CartaoGrafico titulo="Distribuição por motivo" linhasTabela={[]} rotuloColunaValor="Diárias" vazio>
        {() => <div data-testid="visual-do-grafico" />}
      </CartaoGrafico>,
    );

    expect(screen.getByText("Sem dados para este recorte.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ver como tabela" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("visual-do-grafico")).not.toBeInTheDocument();
  });

  describe("Expandir gráfico — modo de análise em tela cheia (correção UX, 2026-08-07)", () => {
    it("abre um diálogo com o mesmo conteúdo e fecha pelo botão", () => {
      render(
        <CartaoGrafico titulo="Evolução por período" linhasTabela={LINHAS} rotuloColunaValor="Diárias">
          {() => <div data-testid="visual-do-grafico" />}
        </CartaoGrafico>,
      );

      fireEvent.click(screen.getByRole("button", { name: "Expandir Evolução por período" }));

      const dialogo = screen.getByRole("dialog");
      expect(dialogo).toBeInTheDocument();
      expect(screen.getAllByTestId("visual-do-grafico")).toHaveLength(2); // cartão (escondido atrás) + modal

      fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    // Correção UX (2026-08-07) — o modal deixou de ser "o mesmo card, um
    // pouco maior" (`max-w-4xl`/`max-h-[85vh]`, largura fixa em px); guarda
    // -corpo automatizado possível em jsdom (que não calcula layout real):
    // as classes de tamanho ficam ~92-96vw/88-94vh, nunca mais limitadas a
    // um `max-w-*` fixo em px.
    it("o painel do modal usa quase toda a viewport (94vw × 90vh), não uma caixa pequena", () => {
      render(
        <CartaoGrafico titulo="Evolução por período" linhasTabela={LINHAS} rotuloColunaValor="Diárias">
          {() => <div />}
        </CartaoGrafico>,
      );

      fireEvent.click(screen.getByRole("button", { name: "Expandir Evolução por período" }));

      const painel = screen.getByRole("dialog");
      expect(painel.className).toContain("w-[94vw]");
      expect(painel.className).toContain("h-[90vh]");
      expect(painel.className).not.toMatch(/max-w-\d/);
    });

    it("Esc fecha o diálogo", () => {
      render(
        <CartaoGrafico titulo="Evolução por período" linhasTabela={LINHAS} rotuloColunaValor="Diárias">
          {() => <div />}
        </CartaoGrafico>,
      );

      fireEvent.click(screen.getByRole("button", { name: "Expandir Evolução por período" }));
      expect(screen.getByRole("dialog")).toBeInTheDocument();

      fireEvent.keyDown(window, { key: "Escape" });
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("recorte vazio: nunca mostra o botão de expandir", () => {
      render(
        <CartaoGrafico titulo="Distribuição por motivo" linhasTabela={[]} rotuloColunaValor="Diárias" vazio>
          {() => <div />}
        </CartaoGrafico>,
      );

      expect(screen.queryByRole("button", { name: /Expandir/ })).not.toBeInTheDocument();
    });

    // Correção UX (2026-08-07) — `children` virou render-prop só para
    // repassar "estou dentro do modo expandido?" em apresentação (o
    // chamador decide dimensão/densidade); este teste é o guarda-corpo de
    // que o booleano chega correto nos dois contextos — nunca invertido.
    it("repassa expandido=false no cartão inline e expandido=true dentro do modal", () => {
      const espiao = vi.fn(() => <div />);
      render(
        <CartaoGrafico titulo="Evolução por período" linhasTabela={LINHAS} rotuloColunaValor="Diárias">
          {espiao}
        </CartaoGrafico>,
      );

      expect(espiao).toHaveBeenCalledWith(false);
      espiao.mockClear();

      fireEvent.click(screen.getByRole("button", { name: "Expandir Evolução por período" }));

      expect(espiao).toHaveBeenCalledWith(true);
    });

    it("legenda continua acessível dentro do modal (ação existente, não escondida no modo de análise)", () => {
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
            { rotulo: "Reunião", cor: "#d55181" },
          ]}
        >
          {() => <div />}
        </CartaoGrafico>,
      );

      fireEvent.click(screen.getByRole("button", { name: "Expandir Distribuição por motivo" }));

      const dialogo = screen.getByRole("dialog");
      fireEvent.click(within(dialogo).getByRole("button", { name: "Filtrar por Capacitação" }));
      expect(aoClicarLegenda).toHaveBeenCalledWith(0);
    });
  });

  describe("clique-refina (Sprint 19.6.5)", () => {
    it("interativo: o visual deixa de ser aria-hidden — os controles internos já são o próprio equivalente acessível", () => {
      render(
        <CartaoGrafico titulo="Ranking de servidores" linhasTabela={LINHAS} rotuloColunaValor="Diárias" interativo>
          {() => <div data-testid="visual-do-grafico" />}
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
          {() => <div />}
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
          {() => <div />}
        </CartaoGrafico>,
      );

      expect(screen.queryByRole("button", { name: /Filtrar por/ })).not.toBeInTheDocument();
    });
  });
});
