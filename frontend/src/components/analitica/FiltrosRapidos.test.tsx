// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import FiltrosRapidos from "./FiltrosRapidos";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

// Só `Date` é falsificado — `setTimeout`/`setInterval` continuam reais,
// para não travar a espera interna do `userEvent` por eventos assíncronos.
function fixarHoje(dataIso: string) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${dataIso}T12:00:00`));
}

describe("FiltrosRapidos", () => {
  it("mostra os 6 atalhos de período, todos habilitados", () => {
    render(<FiltrosRapidos onMudarFiltro={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Hoje" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Últimos 7 dias" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Últimos 30 dias" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Mês atual" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Mês anterior" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Ano inteiro" })).toBeEnabled();
  });

  // Decisão de produto 2026-08-06: os atalhos "Registros incompletos" e
  // "Possível inconsistência" (sempre desabilitados, dependentes de uma
  // decisão institucional ainda pendente) foram retirados da interface —
  // não devem mais aparecer, nem desabilitados.
  it("não mostra mais os atalhos retirados da interface (Registros incompletos / Possível inconsistência)", () => {
    render(<FiltrosRapidos onMudarFiltro={vi.fn()} />);

    expect(screen.queryByRole("button", { name: "Registros incompletos" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Possível inconsistência" })).not.toBeInTheDocument();
  });

  it("'Hoje' aplica período_inicial = período_final = hoje", async () => {
    fixarHoje("2026-08-15");
    const usuario = userEvent.setup();
    const onMudarFiltro = vi.fn();
    render(<FiltrosRapidos onMudarFiltro={onMudarFiltro} />);

    await usuario.click(screen.getByRole("button", { name: "Hoje" }));

    expect(onMudarFiltro).toHaveBeenCalledWith({
      periodo_inicial: "2026-08-15",
      periodo_final: "2026-08-15",
    });
  });

  it("'Últimos 7 dias' aplica hoje-7 até hoje", async () => {
    fixarHoje("2026-08-15");
    const usuario = userEvent.setup();
    const onMudarFiltro = vi.fn();
    render(<FiltrosRapidos onMudarFiltro={onMudarFiltro} />);

    await usuario.click(screen.getByRole("button", { name: "Últimos 7 dias" }));

    expect(onMudarFiltro).toHaveBeenCalledWith({
      periodo_inicial: "2026-08-08",
      periodo_final: "2026-08-15",
    });
  });

  it("'Últimos 30 dias' aplica hoje-30 até hoje, cruzando o mês corretamente", async () => {
    fixarHoje("2026-08-15");
    const usuario = userEvent.setup();
    const onMudarFiltro = vi.fn();
    render(<FiltrosRapidos onMudarFiltro={onMudarFiltro} />);

    await usuario.click(screen.getByRole("button", { name: "Últimos 30 dias" }));

    expect(onMudarFiltro).toHaveBeenCalledWith({
      periodo_inicial: "2026-07-16",
      periodo_final: "2026-08-15",
    });
  });

  it("'Últimos 7 dias' cruza a virada do ano corretamente", async () => {
    fixarHoje("2026-01-03");
    const usuario = userEvent.setup();
    const onMudarFiltro = vi.fn();
    render(<FiltrosRapidos onMudarFiltro={onMudarFiltro} />);

    await usuario.click(screen.getByRole("button", { name: "Últimos 7 dias" }));

    expect(onMudarFiltro).toHaveBeenCalledWith({
      periodo_inicial: "2025-12-27",
      periodo_final: "2026-01-03",
    });
  });

  it("'Últimos 30 dias' cruza a virada do ano corretamente", async () => {
    fixarHoje("2026-01-10");
    const usuario = userEvent.setup();
    const onMudarFiltro = vi.fn();
    render(<FiltrosRapidos onMudarFiltro={onMudarFiltro} />);

    await usuario.click(screen.getByRole("button", { name: "Últimos 30 dias" }));

    expect(onMudarFiltro).toHaveBeenCalledWith({
      periodo_inicial: "2025-12-11",
      periodo_final: "2026-01-10",
    });
  });

  it("'Mês atual' aplica o 1º dia do mês corrente até hoje", async () => {
    fixarHoje("2026-08-15");
    const usuario = userEvent.setup();
    const onMudarFiltro = vi.fn();
    render(<FiltrosRapidos onMudarFiltro={onMudarFiltro} />);

    await usuario.click(screen.getByRole("button", { name: "Mês atual" }));

    expect(onMudarFiltro).toHaveBeenCalledWith({
      periodo_inicial: "2026-08-01",
      periodo_final: "2026-08-15",
    });
  });

  it("'Mês anterior' aplica o 1º e o último dia do mês anterior", async () => {
    fixarHoje("2026-08-15");
    const usuario = userEvent.setup();
    const onMudarFiltro = vi.fn();
    render(<FiltrosRapidos onMudarFiltro={onMudarFiltro} />);

    await usuario.click(screen.getByRole("button", { name: "Mês anterior" }));

    expect(onMudarFiltro).toHaveBeenCalledWith({
      periodo_inicial: "2026-07-01",
      periodo_final: "2026-07-31",
    });
  });

  it("'Mês anterior' em janeiro cruza corretamente para dezembro do ano anterior", async () => {
    fixarHoje("2026-01-10");
    const usuario = userEvent.setup();
    const onMudarFiltro = vi.fn();
    render(<FiltrosRapidos onMudarFiltro={onMudarFiltro} />);

    await usuario.click(screen.getByRole("button", { name: "Mês anterior" }));

    expect(onMudarFiltro).toHaveBeenCalledWith({
      periodo_inicial: "2025-12-01",
      periodo_final: "2025-12-31",
    });
  });

  it("'Ano inteiro' aplica 1º de janeiro até 31 de dezembro do ano corrente", async () => {
    fixarHoje("2026-08-15");
    const usuario = userEvent.setup();
    const onMudarFiltro = vi.fn();
    render(<FiltrosRapidos onMudarFiltro={onMudarFiltro} />);

    await usuario.click(screen.getByRole("button", { name: "Ano inteiro" }));

    expect(onMudarFiltro).toHaveBeenCalledWith({
      periodo_inicial: "2026-01-01",
      periodo_final: "2026-12-31",
    });
  });
});
