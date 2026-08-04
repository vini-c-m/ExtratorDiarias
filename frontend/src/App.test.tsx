// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
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
// Sprint 18.4.2 — mesmo isolamento das duas funcionalidades acima; a
// Central Analítica já tem sua própria suíte (`CentralAnalitica.test.tsx`).
vi.mock("./pages/CentralAnalitica", () => ({
  default: () => <div>Tela da Central Analítica</div>,
}));

// Sprint 15 — Configuração Inicial da Planilha Oficial: `useConfiguracao`
// mockado para que os testes de navegação (Sprint 14, acima) continuem
// isolados do gate novo — por padrão, "já configurado e acessível", o
// mesmo estado em que o app operava antes desta Sprint.
vi.mock("./hooks/useConfiguracao", () => ({
  useConfiguracao: vi.fn(),
}));

import { useConfiguracao } from "./hooks/useConfiguracao";

const useConfiguracaoMock = vi.mocked(useConfiguracao);
const atualizarConfiguracaoMock = vi.fn();

const CONFIGURACAO_ATIVA = {
  configurado: true as const,
  planilha_acessivel: true as const,
  requer_revalidacao: false,
  caminho_planilha_oficial: "G:\\Meu Drive\\DIMCAC\\Controle de Diárias.xlsx",
  configurado_em: "2026-07-30T14:32:10",
};

beforeEach(() => {
  window.api = {
    getPathForFile: (arquivo: File) => arquivo.name,
    abrirArquivo: vi.fn(),
    salvarComo: vi.fn(),
    salvarRelatorio: vi.fn(),
    copiarHistorico: vi.fn(),
    selecionarPlanilhaOficial: vi.fn(),
  };
  useConfiguracaoMock.mockReturnValue({
    estado: CONFIGURACAO_ATIVA,
    atualizar: atualizarConfiguracaoMock,
  });
});

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

  it("'Começar' leva ao Hub, com as três funcionalidades", async () => {
    const usuario = userEvent.setup();
    render(<App />);

    await usuario.click(screen.getByRole("button", { name: "Começar" }));

    expect(screen.getByText("Processamento da Planilha")).toBeInTheDocument();
    expect(screen.getByText("Central Inteligente de Conferência")).toBeInTheDocument();
    expect(screen.getByText("Central Analítica")).toBeInTheDocument();
  });

  it("selecionar um card abre a funcionalidade e mostra o link de volta ao Hub", async () => {
    const usuario = userEvent.setup();
    render(<App />);
    await usuario.click(screen.getByRole("button", { name: "Começar" }));

    await usuario.click(screen.getByRole("button", { name: /Processamento da Planilha/ }));

    expect(screen.getByText("Tela de Processamento")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Hub/ })).toBeInTheDocument();
  });

  it("selecionar o card da Central Analítica abre o módulo e mostra o link de volta ao Hub", async () => {
    const usuario = userEvent.setup();
    render(<App />);
    await usuario.click(screen.getByRole("button", { name: "Começar" }));

    await usuario.click(screen.getByRole("button", { name: /Central Analítica/ }));

    expect(screen.getByText("Tela da Central Analítica")).toBeInTheDocument();
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

describe("App — gate de Configuração Inicial (Sprint 15)", () => {
  it("configurado:false bloqueia Boas-vindas e o Hub — só a Configuração Inicial aparece", () => {
    useConfiguracaoMock.mockReturnValue({
      estado: { configurado: false },
      atualizar: atualizarConfiguracaoMock,
    });

    render(<App />);

    expect(screen.getByRole("heading", { name: "Configuração inicial" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Começar" })).not.toBeInTheDocument();
  });

  it("estado ainda não carregado (null) não bloqueia — segue o fluxo normal", () => {
    useConfiguracaoMock.mockReturnValue({ estado: null, atualizar: atualizarConfiguracaoMock });

    render(<App />);

    expect(screen.getByRole("button", { name: "Começar" })).toBeInTheDocument();
  });

  it("planilha_acessivel:false NÃO bloqueia Boas-vindas/Hub — só a ação de preencher, dentro de Processamento (§7)", async () => {
    const usuario = userEvent.setup();
    useConfiguracaoMock.mockReturnValue({
      estado: { configurado: true, planilha_acessivel: false },
      atualizar: atualizarConfiguracaoMock,
    });

    render(<App />);
    await usuario.click(screen.getByRole("button", { name: "Começar" }));

    expect(screen.getByText("Processamento da Planilha")).toBeInTheDocument();
  });

  it("o botão 'Configurações' do Cabecalho abre 'Alterar Planilha Oficial'", async () => {
    const usuario = userEvent.setup();
    render(<App />);
    await usuario.click(screen.getByRole("button", { name: "Começar" }));

    await usuario.click(screen.getByRole("button", { name: "Configurações" }));

    expect(screen.getByRole("dialog", { name: "Alterar Planilha Oficial" })).toBeInTheDocument();
  });
});
