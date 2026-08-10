// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import PainelAcoesRecorte from "./PainelAcoesRecorte";

afterEach(() => {
  cleanup();
});

// MS UX — Simplificação da Central Analítica (2026-08-10): o cartão de
// Documentos Hábeis Pendentes saiu deste componente (virou
// `NotificacaoDocumentosHabeisPendentes`, testado à parte) — este painel
// volta a ser só as 2 ações de geração.
describe("PainelAcoesRecorte", () => {
  it("habilitado: os 2 botões estão habilitados e sem texto de ajuda", () => {
    render(<PainelAcoesRecorte habilitado aoGerarDashboard={vi.fn()} aoGerarRelatorio={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Gerar Dashboard" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Gerar Relatório" })).toBeEnabled();
    expect(screen.queryByText(/Ajuste os filtros/)).not.toBeInTheDocument();
  });

  it("desabilitado: os 2 botões ficam desabilitados e mostra o texto de ajuda", () => {
    render(<PainelAcoesRecorte habilitado={false} aoGerarDashboard={vi.fn()} aoGerarRelatorio={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Gerar Dashboard" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Gerar Relatório" })).toBeDisabled();
    expect(screen.getByText("Ajuste os filtros para habilitar estas ações.")).toBeInTheDocument();
  });

  it("clicar em cada botão chama o callback correspondente", async () => {
    const usuario = userEvent.setup();
    const aoGerarDashboard = vi.fn();
    const aoGerarRelatorio = vi.fn();
    render(<PainelAcoesRecorte habilitado aoGerarDashboard={aoGerarDashboard} aoGerarRelatorio={aoGerarRelatorio} />);

    await usuario.click(screen.getByRole("button", { name: "Gerar Dashboard" }));
    expect(aoGerarDashboard).toHaveBeenCalledTimes(1);

    await usuario.click(screen.getByRole("button", { name: "Gerar Relatório" }));
    expect(aoGerarRelatorio).toHaveBeenCalledTimes(1);
  });

  it("não renderiza mais nenhum conteúdo de Documentos Hábeis Pendentes", () => {
    render(<PainelAcoesRecorte habilitado aoGerarDashboard={vi.fn()} aoGerarRelatorio={vi.fn()} />);

    expect(screen.queryByText(/Documentos Hábeis Pendentes/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Aguardando liberação:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Revisão manual necessária:/)).not.toBeInTheDocument();
  });
});
