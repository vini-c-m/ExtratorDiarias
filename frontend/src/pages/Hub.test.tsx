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
      <Hub
        backendOnline
        aoSelecionarProcessamento={vi.fn()}
        aoSelecionarConferencia={vi.fn()}
        aoSelecionarAnalitica={vi.fn()}
        aoAbrirDocumentosHabeisPendentes={vi.fn()}
        aoSelecionarRegularizacaoDH={vi.fn()}
      />,
    );

    expect(screen.getByText("Processamento da Planilha")).toBeInTheDocument();
    expect(screen.getByText(/Processe PDFs e alimente automaticamente/)).toBeInTheDocument();

    expect(screen.getByText("Central Inteligente de Conferência")).toBeInTheDocument();
    expect(screen.getByText(/Consulte rapidamente servidores/)).toBeInTheDocument();

    expect(screen.getByText("Central Analítica")).toBeInTheDocument();
    expect(screen.getByText(/Pesquise, filtre e analise diárias/)).toBeInTheDocument();

    expect(screen.getByText("Central de Regularização de DH")).toBeInTheDocument();
    expect(screen.getByText(/Consulte os processos já cadastrados/)).toBeInTheDocument();
  });

  it("clicar no card da Central de Regularização de DH aciona só aoSelecionarRegularizacaoDH", async () => {
    const usuario = userEvent.setup();
    const aoSelecionarRegularizacaoDH = vi.fn();
    const aoSelecionarAnalitica = vi.fn();
    render(
      <Hub
        backendOnline
        aoSelecionarProcessamento={vi.fn()}
        aoSelecionarConferencia={vi.fn()}
        aoSelecionarAnalitica={aoSelecionarAnalitica}
        aoAbrirDocumentosHabeisPendentes={vi.fn()}
        aoSelecionarRegularizacaoDH={aoSelecionarRegularizacaoDH}
      />,
    );

    await usuario.click(screen.getByRole("button", { name: /Central de Regularização de DH/ }));

    expect(aoSelecionarRegularizacaoDH).toHaveBeenCalledTimes(1);
    expect(aoSelecionarAnalitica).not.toHaveBeenCalled();
  });

  it("clicar no card de Processamento aciona só aoSelecionarProcessamento", async () => {
    const usuario = userEvent.setup();
    const aoSelecionarProcessamento = vi.fn();
    const aoSelecionarConferencia = vi.fn();
    const aoSelecionarAnalitica = vi.fn();
    render(
      <Hub
        backendOnline
        aoSelecionarProcessamento={aoSelecionarProcessamento}
        aoSelecionarConferencia={aoSelecionarConferencia}
        aoSelecionarAnalitica={aoSelecionarAnalitica}
        aoAbrirDocumentosHabeisPendentes={vi.fn()}
        aoSelecionarRegularizacaoDH={vi.fn()}
      />,
    );

    await usuario.click(screen.getByRole("button", { name: /Processamento da Planilha/ }));

    expect(aoSelecionarProcessamento).toHaveBeenCalledTimes(1);
    expect(aoSelecionarConferencia).not.toHaveBeenCalled();
    expect(aoSelecionarAnalitica).not.toHaveBeenCalled();
  });

  it("clicar no card de Conferência aciona só aoSelecionarConferencia", async () => {
    const usuario = userEvent.setup();
    const aoSelecionarProcessamento = vi.fn();
    const aoSelecionarConferencia = vi.fn();
    const aoSelecionarAnalitica = vi.fn();
    render(
      <Hub
        backendOnline
        aoSelecionarProcessamento={aoSelecionarProcessamento}
        aoSelecionarConferencia={aoSelecionarConferencia}
        aoSelecionarAnalitica={aoSelecionarAnalitica}
        aoAbrirDocumentosHabeisPendentes={vi.fn()}
        aoSelecionarRegularizacaoDH={vi.fn()}
      />,
    );

    await usuario.click(screen.getByRole("button", { name: /Central Inteligente de Conferência/ }));

    expect(aoSelecionarConferencia).toHaveBeenCalledTimes(1);
    expect(aoSelecionarProcessamento).not.toHaveBeenCalled();
    expect(aoSelecionarAnalitica).not.toHaveBeenCalled();
  });

  it("clicar no card da Central Analítica aciona só aoSelecionarAnalitica", async () => {
    const usuario = userEvent.setup();
    const aoSelecionarProcessamento = vi.fn();
    const aoSelecionarConferencia = vi.fn();
    const aoSelecionarAnalitica = vi.fn();
    render(
      <Hub
        backendOnline
        aoSelecionarProcessamento={aoSelecionarProcessamento}
        aoSelecionarConferencia={aoSelecionarConferencia}
        aoSelecionarAnalitica={aoSelecionarAnalitica}
        aoAbrirDocumentosHabeisPendentes={vi.fn()}
        aoSelecionarRegularizacaoDH={vi.fn()}
      />,
    );

    await usuario.click(screen.getByRole("button", { name: /Central Analítica/ }));

    expect(aoSelecionarAnalitica).toHaveBeenCalledTimes(1);
    expect(aoSelecionarProcessamento).not.toHaveBeenCalled();
    expect(aoSelecionarConferencia).not.toHaveBeenCalled();
  });

  it("backend offline: mostra o aviso, mas os cards continuam clicáveis", async () => {
    const usuario = userEvent.setup();
    const aoSelecionarProcessamento = vi.fn();
    render(
      <Hub
        backendOnline={false}
        aoSelecionarProcessamento={aoSelecionarProcessamento}
        aoSelecionarConferencia={vi.fn()}
        aoSelecionarAnalitica={vi.fn()}
        aoAbrirDocumentosHabeisPendentes={vi.fn()}
        aoSelecionarRegularizacaoDH={vi.fn()}
      />,
    );

    expect(screen.getByText("Aguardando o aplicativo terminar de iniciar...")).toBeInTheDocument();

    await usuario.click(screen.getByRole("button", { name: /Processamento da Planilha/ }));
    expect(aoSelecionarProcessamento).toHaveBeenCalledTimes(1);
  });

  it("backend online: não mostra o aviso", () => {
    render(
      <Hub
        backendOnline
        aoSelecionarProcessamento={vi.fn()}
        aoSelecionarConferencia={vi.fn()}
        aoSelecionarAnalitica={vi.fn()}
        aoAbrirDocumentosHabeisPendentes={vi.fn()}
        aoSelecionarRegularizacaoDH={vi.fn()}
      />,
    );

    expect(screen.queryByText("Aguardando o aplicativo terminar de iniciar...")).not.toBeInTheDocument();
  });
});
