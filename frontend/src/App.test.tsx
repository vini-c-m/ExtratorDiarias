// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import App from "./App";

// `FundoDecorativo` chama `window.matchMedia` (checagem de
// `prefers-reduced-motion`) — jsdom não implementa isso nativamente. Este é
// o primeiro teste a montar a árvore inteira (`App`, que sempre renderiza
// `FundoDecorativo`), então precisa do stub; os demais testes de página
// renderizam a página isolada e nunca passam por aqui.
beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
});

// Isola a navegação de `App` do restante das duas páginas de funcionalidade
// — cada uma já tem sua própria suíte (`SelecionarProcessar.test.tsx`,
// `Conferencia.test.tsx`); aqui o único contrato sob teste é a máquina de
// estados Boas-vindas → Hub → funcionalidade.
vi.mock("./hooks/useBackendStatus", () => ({
  useBackendStatus: () => "conectado" as const,
}));
vi.mock("./pages/SelecionarProcessar", () => ({
  default: () => <div>Tela de Processamento</div>,
}));
vi.mock("./pages/Conferencia", () => ({
  default: () => <div>Tela de Conferência</div>,
}));

afterEach(() => {
  cleanup();
});

describe("App — navegação Boas-vindas → Hub → funcionalidade (Sprint 14)", () => {
  it("abre em Boas-vindas, nunca direto numa funcionalidade", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "Extrator de Diárias" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Começar" })).toBeInTheDocument();
    expect(screen.queryByText("Tela de Processamento")).not.toBeInTheDocument();
  });

  it("'Começar' leva ao Hub, com as duas funcionalidades", async () => {
    const usuario = userEvent.setup();
    render(<App />);

    await usuario.click(screen.getByRole("button", { name: "Começar" }));

    expect(screen.getByText("Processamento da Planilha")).toBeInTheDocument();
    expect(screen.getByText("Central Inteligente de Conferência")).toBeInTheDocument();
  });

  it("selecionar um card abre a funcionalidade e mostra o link de volta ao Hub", async () => {
    const usuario = userEvent.setup();
    render(<App />);
    await usuario.click(screen.getByRole("button", { name: "Começar" }));

    await usuario.click(screen.getByRole("button", { name: /Processamento da Planilha/ }));

    expect(screen.getByText("Tela de Processamento")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Hub/ })).toBeInTheDocument();
  });

  it("'← Hub' retorna ao Hub a partir de qualquer funcionalidade", async () => {
    const usuario = userEvent.setup();
    render(<App />);
    await usuario.click(screen.getByRole("button", { name: "Começar" }));
    await usuario.click(screen.getByRole("button", { name: /Central Inteligente de Conferência/ }));
    expect(screen.getByText("Tela de Conferência")).toBeInTheDocument();

    await usuario.click(screen.getByRole("button", { name: /Hub/ }));

    expect(screen.getByText("Processamento da Planilha")).toBeInTheDocument();
    expect(screen.queryByText("Tela de Conferência")).not.toBeInTheDocument();
  });

  it("o Hub não mostra o link '← Hub' (já está nele)", async () => {
    const usuario = userEvent.setup();
    render(<App />);
    await usuario.click(screen.getByRole("button", { name: "Começar" }));

    expect(screen.queryByRole("button", { name: /^Hub$/ })).not.toBeInTheDocument();
  });
});
