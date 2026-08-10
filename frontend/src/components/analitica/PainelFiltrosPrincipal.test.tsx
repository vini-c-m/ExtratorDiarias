// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import PainelFiltrosPrincipal from "./PainelFiltrosPrincipal";
import type { ParametrosPesquisaDiariasQuery } from "../../types/analitica";

const BASE: ParametrosPesquisaDiariasQuery = { pagina: 1, tamanho_pagina: 25 };

afterEach(() => {
  cleanup();
});

// MS UX (2026-08-10) — item 1: de 16 campos para só 4 (SEI/CPF/Período
// Inicial/Período Final); item 3: um único grupo de filtro ativo por vez
// (SEI | CPF | PERÍODO). Letras A-G referem-se ao item 13 do pedido.
describe("PainelFiltrosPrincipal", () => {
  it("mostra somente os 4 campos permitidos, nenhum outro filtro", () => {
    render(<PainelFiltrosPrincipal filtros={BASE} onMudarFiltro={vi.fn()} onRemoverFiltro={vi.fn()} />);

    expect(screen.getByLabelText("SEI")).toBeInTheDocument();
    expect(screen.getByLabelText("CPF")).toBeInTheDocument();
    expect(screen.getByLabelText("Período inicial")).toBeInTheDocument();
    expect(screen.getByLabelText("Período final")).toBeInTheDocument();

    expect(screen.queryByLabelText("Município")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Nome do servidor")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Matrícula")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Motivo")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Situação")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Valor/)).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Filtros rápidos" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Membros|Servidores/)).not.toBeInTheDocument();
  });

  it("A) CPF só com dígitos é aplicado sem alteração", async () => {
    const onMudarFiltro = vi.fn();
    render(<PainelFiltrosPrincipal filtros={BASE} onMudarFiltro={onMudarFiltro} onRemoverFiltro={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("CPF"), { target: { value: "12345678900" } });

    await waitFor(() => expect(onMudarFiltro).toHaveBeenCalledWith({ cpf: "12345678900" }));
  });

  it("B) CPF com máscara (pontos e hífen) é aplicado sem alteração — normalização é responsabilidade do backend", async () => {
    const onMudarFiltro = vi.fn();
    render(<PainelFiltrosPrincipal filtros={BASE} onMudarFiltro={onMudarFiltro} onRemoverFiltro={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("CPF"), { target: { value: "123.456.789-00" } });

    await waitFor(() => expect(onMudarFiltro).toHaveBeenCalledWith({ cpf: "123.456.789-00" }));
  });

  it("C) CPF ativo desabilita SEI e Período", () => {
    render(
      <PainelFiltrosPrincipal filtros={{ ...BASE, cpf: "12345678900" }} onMudarFiltro={vi.fn()} onRemoverFiltro={vi.fn()} />,
    );

    expect(screen.getByLabelText("CPF")).toBeEnabled();
    expect(screen.getByLabelText("SEI")).toBeDisabled();
    expect(screen.getByLabelText("Período inicial")).toBeDisabled();
    expect(screen.getByLabelText("Período final")).toBeDisabled();
  });

  it("D) SEI ativo desabilita CPF e Período", () => {
    render(
      <PainelFiltrosPrincipal
        filtros={{ ...BASE, sei: "19.20.0000.0000001/2026-01" }}
        onMudarFiltro={vi.fn()}
        onRemoverFiltro={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("SEI")).toBeEnabled();
    expect(screen.getByLabelText("CPF")).toBeDisabled();
    expect(screen.getByLabelText("Período inicial")).toBeDisabled();
    expect(screen.getByLabelText("Período final")).toBeDisabled();
  });

  it("E) Período ativo (só inicial já conta) desabilita SEI e CPF", () => {
    render(
      <PainelFiltrosPrincipal
        filtros={{ ...BASE, periodo_inicial: "2026-01-01" }}
        onMudarFiltro={vi.fn()}
        onRemoverFiltro={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Período inicial")).toBeEnabled();
    expect(screen.getByLabelText("Período final")).toBeEnabled();
    expect(screen.getByLabelText("SEI")).toBeDisabled();
    expect(screen.getByLabelText("CPF")).toBeDisabled();
  });

  it("F) Limpar filtro reabilita todos os grupos", async () => {
    const onRemoverFiltro = vi.fn();
    render(
      <PainelFiltrosPrincipal
        filtros={{ ...BASE, sei: "19.20.0000.0000001/2026-01" }}
        onMudarFiltro={vi.fn()}
        onRemoverFiltro={onRemoverFiltro}
      />,
    );

    await fireEvent.click(screen.getByRole("button", { name: /Limpar filtro de SEI/ }));
    expect(onRemoverFiltro).toHaveBeenCalledWith("sei");

    // Depois de limpar, `filtros` (controlado pelo pai) volta a não ter
    // nenhum campo — simula o novo estado devolvido por `useDiarias`.
    cleanup();
    render(<PainelFiltrosPrincipal filtros={BASE} onMudarFiltro={vi.fn()} onRemoverFiltro={vi.fn()} />);
    expect(screen.getByLabelText("SEI")).toBeEnabled();
    expect(screen.getByLabelText("CPF")).toBeEnabled();
    expect(screen.getByLabelText("Período inicial")).toBeEnabled();
    expect(screen.getByLabelText("Período final")).toBeEnabled();
    expect(screen.queryByRole("button", { name: /Limpar filtro/ })).not.toBeInTheDocument();
  });

  it("G) Período inicial e final funcionam juntos (mesmo grupo, aplicados em par)", async () => {
    const onMudarFiltro = vi.fn();
    render(<PainelFiltrosPrincipal filtros={BASE} onMudarFiltro={onMudarFiltro} onRemoverFiltro={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Período inicial"), { target: { value: "2026-01-01" } });
    await waitFor(() =>
      expect(onMudarFiltro).toHaveBeenCalledWith({ periodo_inicial: "2026-01-01", periodo_final: undefined }),
    );

    fireEvent.change(screen.getByLabelText("Período final"), { target: { value: "2026-01-31" } });
    await waitFor(() =>
      expect(onMudarFiltro).toHaveBeenCalledWith({ periodo_inicial: "2026-01-01", periodo_final: "2026-01-31" }),
    );
  });

  it("Limpar filtro de Período remove os dois campos do grupo", async () => {
    const onRemoverFiltro = vi.fn();
    render(
      <PainelFiltrosPrincipal
        filtros={{ ...BASE, periodo_inicial: "2026-01-01", periodo_final: "2026-01-31" }}
        onMudarFiltro={vi.fn()}
        onRemoverFiltro={onRemoverFiltro}
      />,
    );

    await fireEvent.click(screen.getByRole("button", { name: /Limpar filtro de Período/ }));

    expect(onRemoverFiltro).toHaveBeenCalledWith("periodo_inicial");
    expect(onRemoverFiltro).toHaveBeenCalledWith("periodo_final");
  });

  it("período final anterior ao inicial mostra aviso e não aplica", async () => {
    const onMudarFiltro = vi.fn();
    render(
      <PainelFiltrosPrincipal
        filtros={{ ...BASE, periodo_inicial: "2026-02-01" }}
        onMudarFiltro={onMudarFiltro}
        onRemoverFiltro={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("Período final"), { target: { value: "2026-01-01" } });

    expect(
      await screen.findByText("Período final não pode ser anterior ao período inicial."),
    ).toBeInTheDocument();
    expect(onMudarFiltro).not.toHaveBeenCalled();
  });

  it("nenhum grupo ativo: todos os campos ficam habilitados e nenhum botão 'Limpar filtro' aparece", () => {
    render(<PainelFiltrosPrincipal filtros={BASE} onMudarFiltro={vi.fn()} onRemoverFiltro={vi.fn()} />);

    expect(screen.getByLabelText("SEI")).toBeEnabled();
    expect(screen.getByLabelText("CPF")).toBeEnabled();
    expect(screen.getByLabelText("Período inicial")).toBeEnabled();
    expect(screen.getByLabelText("Período final")).toBeEnabled();
    expect(screen.queryByRole("button", { name: /Limpar filtro/ })).not.toBeInTheDocument();
  });
});
