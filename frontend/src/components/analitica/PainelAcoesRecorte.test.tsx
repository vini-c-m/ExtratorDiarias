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
        aoAbrirDocumentosHabeisPendentes={vi.fn()}
        resumoDocumentosHabeis={null}
      />,
    );

    expect(screen.getByRole("button", { name: "Gerar Dashboard" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Gerar Relatório" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Documentos Hábeis Pendentes" })).toBeEnabled();
    expect(screen.queryByText(/Ajuste os filtros/)).not.toBeInTheDocument();
  });

  it("desabilitado: os 3 botões ficam desabilitados e mostra o texto de ajuda", () => {
    render(
      <PainelAcoesRecorte
        habilitado={false}
        aoGerarDashboard={vi.fn()}
        aoGerarRelatorio={vi.fn()}
        aoAbrirDocumentosHabeisPendentes={vi.fn()}
        resumoDocumentosHabeis={null}
      />,
    );

    expect(screen.getByRole("button", { name: "Gerar Dashboard" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Gerar Relatório" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Documentos Hábeis Pendentes" })).toBeDisabled();
    expect(screen.getByText("Ajuste os filtros para habilitar estas ações.")).toBeInTheDocument();
  });

  it("clicar em cada botão chama o callback correspondente", async () => {
    const usuario = userEvent.setup();
    const aoGerarDashboard = vi.fn();
    const aoGerarRelatorio = vi.fn();
    const aoAbrirDocumentosHabeisPendentes = vi.fn();
    render(
      <PainelAcoesRecorte
        habilitado
        aoGerarDashboard={aoGerarDashboard}
        aoGerarRelatorio={aoGerarRelatorio}
        aoAbrirDocumentosHabeisPendentes={aoAbrirDocumentosHabeisPendentes}
        resumoDocumentosHabeis={null}
      />,
    );

    await usuario.click(screen.getByRole("button", { name: "Gerar Dashboard" }));
    expect(aoGerarDashboard).toHaveBeenCalledTimes(1);

    await usuario.click(screen.getByRole("button", { name: "Gerar Relatório" }));
    expect(aoGerarRelatorio).toHaveBeenCalledTimes(1);

    await usuario.click(screen.getByRole("button", { name: "Documentos Hábeis Pendentes" }));
    expect(aoAbrirDocumentosHabeisPendentes).toHaveBeenCalledTimes(1);
  });

  it("sem resumo carregado, o botão não mostra número e nenhum badge aparece", () => {
    render(
      <PainelAcoesRecorte
        habilitado
        aoGerarDashboard={vi.fn()}
        aoGerarRelatorio={vi.fn()}
        aoAbrirDocumentosHabeisPendentes={vi.fn()}
        resumoDocumentosHabeis={null}
      />,
    );

    expect(screen.getByRole("button", { name: "Documentos Hábeis Pendentes" })).toBeInTheDocument();
    expect(screen.queryByText(/Aguardando liberação:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Revisão manual necessária:/)).not.toBeInTheDocument();
  });

  it("com resumo carregado, mostra o total no botão e os dois badges de contagem", () => {
    render(
      <PainelAcoesRecorte
        habilitado
        aoGerarDashboard={vi.fn()}
        aoGerarRelatorio={vi.fn()}
        aoAbrirDocumentosHabeisPendentes={vi.fn()}
        resumoDocumentosHabeis={{ aguardando_liberacao: 3, revisao_manual_necessaria: 2 }}
      />,
    );

    expect(screen.getByRole("button", { name: "Documentos Hábeis Pendentes (5)" })).toBeInTheDocument();
    expect(screen.getByText("Aguardando liberação: 3")).toBeInTheDocument();
    expect(screen.getByText("Revisão manual necessária: 2")).toBeInTheDocument();
  });

  it("RN-08: badge 'Revisão manual necessária' usa âmbar, badge 'Aguardando liberação' é informativo — nenhum dos dois usa vermelho", () => {
    render(
      <PainelAcoesRecorte
        habilitado
        aoGerarDashboard={vi.fn()}
        aoGerarRelatorio={vi.fn()}
        aoAbrirDocumentosHabeisPendentes={vi.fn()}
        resumoDocumentosHabeis={{ aguardando_liberacao: 1, revisao_manual_necessaria: 1 }}
      />,
    );

    const badgeAguardando = screen.getByText("Aguardando liberação: 1");
    const badgeRevisao = screen.getByText("Revisão manual necessária: 1");
    expect(badgeAguardando.className).toContain("cyan");
    expect(badgeAguardando.className).not.toContain("red");
    expect(badgeRevisao.className).toContain("amber");
    expect(badgeRevisao.className).not.toContain("red");
  });
});
