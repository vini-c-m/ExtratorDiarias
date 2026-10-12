// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ModalAlterarPlanilhaOficial from "./ModalAlterarPlanilhaOficial";
import type { ConfiguracaoAtiva } from "../../types/configuracao";

vi.mock("../../services/api", () => ({
  definirConfiguracao: vi.fn(),
  definirPastasOperacionais: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

beforeEach(() => {
  window.api = {
    getPathForFile: () => "",
    abrirArquivo: vi.fn(),
    salvarComo: vi.fn(),
    salvarRelatorio: vi.fn(),
    copiarHistorico: vi.fn(),
    selecionarPlanilhaOficial: vi.fn(),
    selecionarPastaOperacional: vi.fn(),
  };
});

const CONFIGURACAO_ATIVA: ConfiguracaoAtiva = {
  configurado: true,
  planilha_acessivel: true,
  requer_revalidacao: false,
  caminho_planilha_oficial: "C:/planilha.xlsx",
  configurado_em: "2026-08-01T10:00:00",
  caminho_pdfs_a_processar: null,
  caminho_pdfs_complemento_a_processar: null,
  caminho_pdfs_processados: null,
  caminho_pdfs_diarias_a_confirmar: null,
  prontidao_pastas: {
    processamento_padrao: { liberado: false, pastas_faltando: ["PDFs a Processar"] },
    complemento: { liberado: false, pastas_faltando: [] },
    finalizacao: { liberado: false, pastas_faltando: [] },
  },
};

describe("ModalAlterarPlanilhaOficial — Organização Automática de PDFs (Pastas Operacionais)", () => {
  it("sem configuracaoAtual (nunca configurado antes): não mostra a seção de pastas", () => {
    render(<ModalAlterarPlanilhaOficial onFechar={vi.fn()} aoConfigurar={vi.fn()} />);

    expect(screen.queryByText("Pastas Operacionais")).not.toBeInTheDocument();
  });

  it("com configuracaoAtual já configurada: mostra a seção de pastas", () => {
    render(
      <ModalAlterarPlanilhaOficial
        onFechar={vi.fn()}
        aoConfigurar={vi.fn()}
        configuracaoAtual={CONFIGURACAO_ATIVA}
      />,
    );

    expect(screen.getByText("Pastas Operacionais")).toBeInTheDocument();
    expect(screen.getByText("PDFs a Processar")).toBeInTheDocument();
    expect(screen.getByText("PDFs Processados")).toBeInTheDocument();
  });

  it("com configuracaoAtual não configurada (configurado:false): não mostra a seção de pastas", () => {
    render(
      <ModalAlterarPlanilhaOficial
        onFechar={vi.fn()}
        aoConfigurar={vi.fn()}
        configuracaoAtual={{ configurado: false }}
      />,
    );

    expect(screen.queryByText("Pastas Operacionais")).not.toBeInTheDocument();
  });
});

// Regressão de layout: o painel do modal crescia sem limite e sem scroll
// próprio — com a Seção de Pastas Operacionais montada, o botão "Fechar"
// era empurrado para fora da viewport, sem forma de sair do modal. jsdom
// não mede altura/clipping real (precisa de validação manual no Electron,
// ver o plano), mas garante que a estrutura rolável exigida existe e que
// "Fechar" continua no DOM/acessível com o conteúdo maior montado.
describe("ModalAlterarPlanilhaOficial — estrutura rolável (Bug 1)", () => {
  it("painel tem altura máxima relativa à viewport e uma área de corpo rolável", () => {
    render(
      <ModalAlterarPlanilhaOficial
        onFechar={vi.fn()}
        aoConfigurar={vi.fn()}
        configuracaoAtual={CONFIGURACAO_ATIVA}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "Alterar Planilha Oficial" });
    expect(dialog.className).toMatch(/max-h-\[85vh\]/);
    expect(dialog.className).toMatch(/flex-col/);

    const areaRolavel = dialog.querySelector(".overflow-y-auto");
    expect(areaRolavel).not.toBeNull();
    // A Seção de Pastas Operacionais (o conteúdo que cresce e antes
    // estourava a viewport) precisa estar dentro da área rolável, não fora
    // dela — senão o scroll não alcança o que precisa rolar.
    expect(areaRolavel).toContainElement(screen.getByText("Pastas Operacionais") as HTMLElement);
  });

  it("botão 'Fechar' permanece acessível mesmo com a Seção de Pastas Operacionais montada", () => {
    render(
      <ModalAlterarPlanilhaOficial
        onFechar={vi.fn()}
        aoConfigurar={vi.fn()}
        configuracaoAtual={CONFIGURACAO_ATIVA}
      />,
    );

    expect(screen.getByText("Pastas Operacionais")).toBeInTheDocument();
    // Duas formas de fechar têm o mesmo nome acessível "Fechar": o "X" do
    // cabeçalho (aria-label) e o botão do rodapé (texto) — ambas precisam
    // continuar presentes e habilitadas mesmo com a seção de pastas montada.
    const botoesFechar = screen.getAllByRole("button", { name: "Fechar" });
    expect(botoesFechar).toHaveLength(2);
    for (const botao of botoesFechar) {
      expect(botao).toBeEnabled();
    }
  });
});
