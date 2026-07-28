// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import BoasVindas from "./BoasVindas";

afterEach(() => {
  cleanup();
});

describe("BoasVindas", () => {
  it("mostra nome, subtítulo institucional e descrição", () => {
    render(<BoasVindas aoComecar={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "Extrator de Diárias" })).toBeInTheDocument();
    expect(
      screen.getByText("Automação Inteligente do Processo de Concessão de Diárias"),
    ).toBeInTheDocument();
    expect(screen.getByText(/Centraliza o processamento, conferência/)).toBeInTheDocument();
  });

  it("clicar em 'Começar' aciona aoComecar", async () => {
    const usuario = userEvent.setup();
    const aoComecar = vi.fn();
    render(<BoasVindas aoComecar={aoComecar} />);

    await usuario.click(screen.getByRole("button", { name: "Começar" }));

    expect(aoComecar).toHaveBeenCalledTimes(1);
  });
});
