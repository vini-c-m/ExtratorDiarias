// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import AvisoConfiguracaoPendente from "./AvisoConfiguracaoPendente";

afterEach(() => {
  cleanup();
});

describe("AvisoConfiguracaoPendente", () => {
  it("nada pendente: não renderiza nada", () => {
    const { container } = render(
      <AvisoConfiguracaoPendente pastasFaltando={[]} aoConfigurar={vi.fn()} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("variante 'bloqueio': mostra a mensagem e lista os rótulos das pastas faltando", () => {
    render(
      <AvisoConfiguracaoPendente
        pastasFaltando={["PDFs a Processar", "PDFs Processados"]}
        aoConfigurar={vi.fn()}
      />,
    );

    expect(
      screen.getByText("Antes de utilizar esta função, configure as pastas necessárias."),
    ).toBeInTheDocument();
    expect(screen.getByText("PDFs a Processar")).toBeInTheDocument();
    expect(screen.getByText("PDFs Processados")).toBeInTheDocument();
  });

  it("variante 'banner': mostra a mensagem genérica, nunca lista rótulos", () => {
    render(
      <AvisoConfiguracaoPendente
        pastasFaltando={["PDFs a Processar"]}
        aoConfigurar={vi.fn()}
        variante="banner"
      />,
    );

    expect(
      screen.getByText("Configuração de pastas incompleta. Algumas funções estão indisponíveis."),
    ).toBeInTheDocument();
    expect(screen.queryByText("PDFs a Processar")).not.toBeInTheDocument();
  });

  it("'Configurar agora' aciona aoConfigurar", async () => {
    const usuario = userEvent.setup();
    const aoConfigurar = vi.fn();
    render(<AvisoConfiguracaoPendente pastasFaltando={["PDFs Processados"]} aoConfigurar={aoConfigurar} />);

    await usuario.click(screen.getByRole("button", { name: "Configurar agora" }));

    expect(aoConfigurar).toHaveBeenCalledTimes(1);
  });
});
