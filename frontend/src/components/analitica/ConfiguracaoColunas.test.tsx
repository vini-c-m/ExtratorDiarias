// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import ConfiguracaoColunas from "./ConfiguracaoColunas";

afterEach(() => {
  cleanup();
});

describe("ConfiguracaoColunas", () => {
  it("vem colapsado por padrão", () => {
    render(<ConfiguracaoColunas colunasAtivas={new Set()} onAlternarColuna={vi.fn()} />);

    expect(screen.getByRole("button", { name: /Colunas/ })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("checkbox", { name: "Motivo" })).not.toBeInTheDocument();
  });

  it("clicar em 'Colunas' expande e mostra as colunas sempre visíveis e as opcionais", async () => {
    const usuario = userEvent.setup();
    render(<ConfiguracaoColunas colunasAtivas={new Set()} onAlternarColuna={vi.fn()} />);

    await usuario.click(screen.getByRole("button", { name: /Colunas/ }));

    expect(screen.getByText("Sempre visíveis")).toBeInTheDocument();
    expect(screen.getByText(/SEI, Servidor, Período, Destino, Valor/)).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Motivo" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Matrícula" })).toBeInTheDocument();
  });

  // Sprint 19.5.7.1 — as 6 colunas que completam o wireframe
  // (`v2-wireframes.md` § 3.4), todas ocultas por padrão.
  it("mostra as 6 novas opções (Sprint 19.5.7.1), todas desmarcadas por padrão", async () => {
    const usuario = userEvent.setup();
    render(<ConfiguracaoColunas colunasAtivas={new Set()} onAlternarColuna={vi.fn()} />);

    await usuario.click(screen.getByRole("button", { name: /Colunas/ }));

    for (const rotulo of [
      "Origem",
      "Trecho completo",
      "Situação do servidor",
      "CPF (mascarado)",
      "Documento de origem",
      "Transporte",
    ]) {
      const checkbox = screen.getByRole("checkbox", { name: rotulo });
      expect(checkbox).toBeInTheDocument();
      expect(checkbox).not.toBeChecked();
    }
  });

  it("marcar 'CPF (mascarado)' chama onAlternarColuna com a chave 'cpf'", async () => {
    const usuario = userEvent.setup();
    const onAlternarColuna = vi.fn();
    render(<ConfiguracaoColunas colunasAtivas={new Set()} onAlternarColuna={onAlternarColuna} />);
    await usuario.click(screen.getByRole("button", { name: /Colunas/ }));

    await usuario.click(screen.getByRole("checkbox", { name: "CPF (mascarado)" }));

    expect(onAlternarColuna).toHaveBeenCalledWith("cpf");
  });

  it("reflete colunasAtivas no estado marcado dos checkboxes", async () => {
    const usuario = userEvent.setup();
    render(<ConfiguracaoColunas colunasAtivas={new Set(["motivo"])} onAlternarColuna={vi.fn()} />);
    await usuario.click(screen.getByRole("button", { name: /Colunas/ }));

    expect(screen.getByRole("checkbox", { name: "Motivo" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Matrícula" })).not.toBeChecked();
  });

  it("marcar um checkbox chama onAlternarColuna com a coluna certa, sem exigir um botão 'Aplicar'", async () => {
    const usuario = userEvent.setup();
    const onAlternarColuna = vi.fn();
    render(<ConfiguracaoColunas colunasAtivas={new Set()} onAlternarColuna={onAlternarColuna} />);
    await usuario.click(screen.getByRole("button", { name: /Colunas/ }));

    await usuario.click(screen.getByRole("checkbox", { name: "Motivo" }));

    expect(onAlternarColuna).toHaveBeenCalledTimes(1);
    expect(onAlternarColuna).toHaveBeenCalledWith("motivo");
    expect(screen.queryByRole("button", { name: "Aplicar" })).not.toBeInTheDocument();
  });
});
