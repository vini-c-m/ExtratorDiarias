// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import GraficoEvolucaoComZoom from "./GraficoEvolucaoComZoom";

const PONTOS = [
  { chave: "2026-01", rotulo: "jan/2026", valor: 10 },
  { chave: "2026-02", rotulo: "fev/2026", valor: 20 },
  { chave: "2026-03", rotulo: "mar/2026", valor: 30 },
  { chave: "2026-04", rotulo: "abr/2026", valor: 15 },
];

const FORMATADOR_INTEIRO = new Intl.NumberFormat("pt-BR");

function formatarValor(valor: number): string {
  return FORMATADOR_INTEIRO.format(valor);
}

afterEach(() => {
  cleanup();
});

describe("GraficoEvolucaoComZoom", () => {
  it("sem seleção, não mostra a barra de confirmação", () => {
    render(<GraficoEvolucaoComZoom pontos={PONTOS} cor="#000" formatarValor={formatarValor} aoAplicarIntervalo={vi.fn()} />);

    expect(screen.queryByRole("button", { name: "Aplicar como filtro" })).not.toBeInTheDocument();
  });

  it("clique simples (pointerdown + pointerup, sem mover) seleciona 1 único mês", () => {
    render(<GraficoEvolucaoComZoom pontos={PONTOS} cor="#000" formatarValor={formatarValor} aoAplicarIntervalo={vi.fn()} />);

    const zonaFev = screen.getByRole("button", { name: /fev\/2026/ });
    fireEvent.pointerDown(zonaFev);
    fireEvent.pointerUp(zonaFev);

    expect(screen.getByText("Selecionado: fev/2026")).toBeInTheDocument();
  });

  it("arraste do mouse (pointerdown → pointerenter em zonas seguintes → pointerup) seleciona um intervalo", () => {
    render(<GraficoEvolucaoComZoom pontos={PONTOS} cor="#000" formatarValor={formatarValor} aoAplicarIntervalo={vi.fn()} />);

    const zonaFev = screen.getByRole("button", { name: /fev\/2026/ });
    const zonaMar = screen.getByRole("button", { name: /mar\/2026/ });
    const zonaAbr = screen.getByRole("button", { name: /abr\/2026/ });

    fireEvent.pointerDown(zonaFev);
    fireEvent.pointerEnter(zonaMar);
    fireEvent.pointerEnter(zonaAbr);
    fireEvent.pointerUp(zonaAbr);

    expect(screen.getByText("Selecionado: fev/2026 a abr/2026")).toBeInTheDocument();
  });

  it("arraste da direita para a esquerda também produz um intervalo em ordem cronológica ao aplicar", () => {
    const aoAplicarIntervalo = vi.fn();
    render(<GraficoEvolucaoComZoom pontos={PONTOS} cor="#000" formatarValor={formatarValor} aoAplicarIntervalo={aoAplicarIntervalo} />);

    const zonaMar = screen.getByRole("button", { name: /mar\/2026/ });
    const zonaJan = screen.getByRole("button", { name: /jan\/2026/ });

    fireEvent.pointerDown(zonaMar);
    fireEvent.pointerEnter(zonaJan);
    fireEvent.pointerUp(zonaJan);
    fireEvent.click(screen.getByRole("button", { name: "Aplicar como filtro" }));

    expect(aoAplicarIntervalo).toHaveBeenCalledWith("2026-01", "2026-03");
  });

  it("'Aplicar como filtro' chama aoAplicarIntervalo com as chaves brutas (não os rótulos formatados) e limpa a seleção", () => {
    const aoAplicarIntervalo = vi.fn();
    render(<GraficoEvolucaoComZoom pontos={PONTOS} cor="#000" formatarValor={formatarValor} aoAplicarIntervalo={aoAplicarIntervalo} />);
    const zonaFev = screen.getByRole("button", { name: /fev\/2026/ });
    const zonaMar = screen.getByRole("button", { name: /mar\/2026/ });
    fireEvent.pointerDown(zonaFev);
    fireEvent.pointerEnter(zonaMar);
    fireEvent.pointerUp(zonaMar);

    fireEvent.click(screen.getByRole("button", { name: "Aplicar como filtro" }));

    expect(aoAplicarIntervalo).toHaveBeenCalledWith("2026-02", "2026-03");
    expect(screen.queryByText(/Selecionado:/)).not.toBeInTheDocument();
  });

  it("'Reset' limpa a seleção pendente sem chamar aoAplicarIntervalo", () => {
    const aoAplicarIntervalo = vi.fn();
    render(<GraficoEvolucaoComZoom pontos={PONTOS} cor="#000" formatarValor={formatarValor} aoAplicarIntervalo={aoAplicarIntervalo} />);
    const zonaFev = screen.getByRole("button", { name: /fev\/2026/ });
    fireEvent.pointerDown(zonaFev);
    fireEvent.pointerUp(zonaFev);

    fireEvent.click(screen.getByRole("button", { name: "Reset" }));

    expect(screen.queryByText(/Selecionado:/)).not.toBeInTheDocument();
    expect(aoAplicarIntervalo).not.toHaveBeenCalled();
  });

  it("teclado: Enter numa zona marca o início, Enter numa segunda zona marca o fim — nunca precisa de mouse", async () => {
    const usuario = userEvent.setup();
    render(<GraficoEvolucaoComZoom pontos={PONTOS} cor="#000" formatarValor={formatarValor} aoAplicarIntervalo={vi.fn()} />);

    const zonaJan = screen.getByRole("button", { name: /jan\/2026/ });
    const zonaMar = screen.getByRole("button", { name: /mar\/2026/ });
    zonaJan.focus();
    await usuario.keyboard("{Enter}");
    zonaMar.focus();
    await usuario.keyboard("{Enter}");

    expect(screen.getByText("Selecionado: jan/2026 a mar/2026")).toBeInTheDocument();
  });

  it("teclado: Espaço tem o mesmo efeito que Enter", async () => {
    render(<GraficoEvolucaoComZoom pontos={PONTOS} cor="#000" formatarValor={formatarValor} aoAplicarIntervalo={vi.fn()} />);

    const zonaJan = screen.getByRole("button", { name: /jan\/2026/ });
    fireEvent.keyDown(zonaJan, { key: " " });

    expect(screen.getByRole("button", { name: /jan\/2026/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("hover numa zona mostra o tooltip rico com rótulo e valor formatado (refinamento visual, 2026-08-07)", () => {
    render(<GraficoEvolucaoComZoom pontos={PONTOS} cor="#000" formatarValor={formatarValor} aoAplicarIntervalo={vi.fn()} />);

    const zonaMar = screen.getByRole("button", { name: /mar\/2026/ });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    fireEvent.pointerEnter(zonaMar);
    const tooltip = screen.getByRole("tooltip");
    expect(tooltip).toHaveTextContent("mar/2026");
    expect(tooltip).toHaveTextContent("30");

    fireEvent.pointerLeave(zonaMar);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });
});
