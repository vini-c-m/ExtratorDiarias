// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import Hub from "./Hub";

afterEach(() => {
  cleanup();
});

describe("Hub", () => {
  it("mostra um card por funcionalidade, com título e descrição", () => {
    render(
      <Hub backendOnline aoSelecionarProcessamento={vi.fn()} aoSelecionarConferencia={vi.fn()} />,
    );

    expect(screen.getByText("Processamento da Planilha")).toBeInTheDocument();
    expect(screen.getByText(/Processe PDFs e alimente automaticamente/)).toBeInTheDocument();

    expect(screen.getByText("Central Inteligente de Conferência")).toBeInTheDocument();
    expect(screen.getByText(/Consulte rapidamente servidores/)).toBeInTheDocument();
  });

  it("clicar no card de Processamento aciona só aoSelecionarProcessamento", async () => {
    const usuario = userEvent.setup();
    const aoSelecionarProcessamento = vi.fn();
    const aoSelecionarConferencia = vi.fn();
    render(
      <Hub
        backendOnline
        aoSelecionarProcessamento={aoSelecionarProcessamento}
        aoSelecionarConferencia={aoSelecionarConferencia}
      />,
    );

    await usuario.click(screen.getByRole("button", { name: /Processamento da Planilha/ }));

    expect(aoSelecionarProcessamento).toHaveBeenCalledTimes(1);
    expect(aoSelecionarConferencia).not.toHaveBeenCalled();
  });

  it("clicar no card de Conferência aciona só aoSelecionarConferencia", async () => {
    const usuario = userEvent.setup();
    const aoSelecionarProcessamento = vi.fn();
    const aoSelecionarConferencia = vi.fn();
    render(
      <Hub
        backendOnline
        aoSelecionarProcessamento={aoSelecionarProcessamento}
        aoSelecionarConferencia={aoSelecionarConferencia}
      />,
    );

    await usuario.click(screen.getByRole("button", { name: /Central Inteligente de Conferência/ }));

    expect(aoSelecionarConferencia).toHaveBeenCalledTimes(1);
    expect(aoSelecionarProcessamento).not.toHaveBeenCalled();
  });

  it("backend offline: mostra o aviso, mas os cards continuam clicáveis", async () => {
    const usuario = userEvent.setup();
    const aoSelecionarProcessamento = vi.fn();
    render(
      <Hub
        backendOnline={false}
        aoSelecionarProcessamento={aoSelecionarProcessamento}
        aoSelecionarConferencia={vi.fn()}
      />,
    );

    expect(screen.getByText("Aguardando o aplicativo terminar de iniciar...")).toBeInTheDocument();

    await usuario.click(screen.getByRole("button", { name: /Processamento da Planilha/ }));
    expect(aoSelecionarProcessamento).toHaveBeenCalledTimes(1);
  });

  it("backend online: não mostra o aviso", () => {
    render(
      <Hub backendOnline aoSelecionarProcessamento={vi.fn()} aoSelecionarConferencia={vi.fn()} />,
    );

    expect(screen.queryByText("Aguardando o aplicativo terminar de iniciar...")).not.toBeInTheDocument();
  });
});
