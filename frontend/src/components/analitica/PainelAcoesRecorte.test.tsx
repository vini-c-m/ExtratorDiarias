// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import PainelAcoesRecorte from "./PainelAcoesRecorte";

afterEach(() => {
  cleanup();
});

describe("PainelAcoesRecorte", () => {
  it("habilitado: os 3 botões estão habilitados e sem texto de ajuda", () => {
    render(
      <PainelAcoesRecorte
        habilitado
        aoGerarDashboard={vi.fn()}
        aoGerarRelatorio={vi.fn()}
        aoExecutarDiagnostico={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Gerar Dashboard" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Gerar Relatório" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Análise Rápida" })).toBeEnabled();
    expect(screen.queryByText(/Ajuste os filtros/)).not.toBeInTheDocument();
  });

  it("desabilitado: os 3 botões ficam desabilitados e mostra o texto de ajuda", () => {
    render(
      <PainelAcoesRecorte
        habilitado={false}
        aoGerarDashboard={vi.fn()}
        aoGerarRelatorio={vi.fn()}
        aoExecutarDiagnostico={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Gerar Dashboard" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Gerar Relatório" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Análise Rápida" })).toBeDisabled();
    expect(screen.getByText("Ajuste os filtros para habilitar estas ações.")).toBeInTheDocument();
  });

  it("clicar em cada botão chama o callback correspondente", async () => {
    const usuario = userEvent.setup();
    const aoGerarDashboard = vi.fn();
    const aoGerarRelatorio = vi.fn();
    const aoExecutarDiagnostico = vi.fn();
    render(
      <PainelAcoesRecorte
        habilitado
        aoGerarDashboard={aoGerarDashboard}
        aoGerarRelatorio={aoGerarRelatorio}
        aoExecutarDiagnostico={aoExecutarDiagnostico}
      />,
    );

    await usuario.click(screen.getByRole("button", { name: "Gerar Dashboard" }));
    expect(aoGerarDashboard).toHaveBeenCalledTimes(1);

    await usuario.click(screen.getByRole("button", { name: "Gerar Relatório" }));
    expect(aoGerarRelatorio).toHaveBeenCalledTimes(1);

    await usuario.click(screen.getByRole("button", { name: "Análise Rápida" }));
    expect(aoExecutarDiagnostico).toHaveBeenCalledTimes(1);
  });
});
