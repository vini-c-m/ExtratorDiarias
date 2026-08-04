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
  it("mostra os 8 atalhos, 2 deles desabilitados (nunca escondidos)", () => {
    render(<FiltrosRapidos onMudarFiltro={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Hoje" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Últimos 7 dias" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Últimos 30 dias" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Mês atual" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Mês anterior" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Ano inteiro" })).toBeEnabled();

    expect(screen.getByRole("button", { name: "Registros incompletos" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Possível inconsistência" })).toBeDisabled();
  });

  it("atalhos pendentes explicam o motivo via title, não ficam mudos", () => {
    render(<FiltrosRapidos onMudarFiltro={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Registros incompletos" })).toHaveAttribute(
      "title",
      expect.stringContaining("Pendente de definição"),
    );
  });

  // Sprint 19.5.6.1 — achado da auditoria da 19.5.6: `title` sozinho não é
  // suficiente (suporte inconsistente entre leitores de tela/toque). Cada
  // atalho pendente agora associa uma explicação via `aria-describedby` a
  // um texto `sr-only` de verdade — este teste comprova a associação
  // programática, não só a presença do `title`.
  it("a explicação dos atalhos pendentes está acessivelmente associada (aria-describedby + sr-only)", () => {
    render(<FiltrosRapidos onMudarFiltro={vi.fn()} />);

    for (const rotulo of ["Registros incompletos", "Possível inconsistência"]) {
      const botao = screen.getByRole("button", { name: rotulo });
      const idDescricao = botao.getAttribute("aria-describedby");
      expect(idDescricao).toBeTruthy();

      const descricao = document.getElementById(idDescricao!);
      expect(descricao).not.toBeNull();
      expect(descricao).toHaveClass("sr-only");
      expect(descricao).toHaveTextContent("Pendente de definição");
    }
  });

  it("os 2 atalhos desabilitados nunca chamam onMudarFiltro, mesmo tentando clicar", async () => {
    const usuario = userEvent.setup();
    const onMudarFiltro = vi.fn();
    render(<FiltrosRapidos onMudarFiltro={onMudarFiltro} />);

    await usuario.click(screen.getByRole("button", { name: "Registros incompletos" }));
    await usuario.click(screen.getByRole("button", { name: "Possível inconsistência" }));

    expect(onMudarFiltro).not.toHaveBeenCalled();
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
