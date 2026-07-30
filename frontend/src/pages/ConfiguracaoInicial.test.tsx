// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ConfiguracaoInicial from "./ConfiguracaoInicial";

vi.mock("../services/api", () => ({
  definirConfiguracao: vi.fn(),
}));

import { definirConfiguracao } from "../services/api";

const definirConfiguracaoMock = vi.mocked(definirConfiguracao);

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
  };
});

describe("ConfiguracaoInicial (Sprint 15)", () => {
  it("mostra o formulário de seleção antes de qualquer configuração", () => {
    render(<ConfiguracaoInicial aoConcluir={vi.fn()} />);

    expect(
      screen.getByRole("button", { name: "Selecionar planilha oficial (.xlsx)" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Continuar" })).not.toBeInTheDocument();
  });

  it("após configurar com sucesso, mostra o resumo e o botão 'Continuar'", async () => {
    const usuario = userEvent.setup();
    const caminho = "G:\\Meu Drive\\DIMCAC\\Controle de Diárias.xlsx";
    vi.mocked(window.api.selecionarPlanilhaOficial).mockResolvedValueOnce(caminho);
    definirConfiguracaoMock.mockResolvedValueOnce({
      configurado: true,
      planilha_acessivel: true,
      requer_revalidacao: false,
      caminho_planilha_oficial: caminho,
      configurado_em: "2026-07-30T14:32:10",
    });

    render(<ConfiguracaoInicial aoConcluir={vi.fn()} />);
    await usuario.click(screen.getByRole("button", { name: "Selecionar planilha oficial (.xlsx)" }));

    expect(await screen.findByText("Planilha configurada")).toBeInTheDocument();
    expect(screen.getByText("Controle de Diárias.xlsx")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continuar" })).toBeInTheDocument();
  });

  it("'Continuar' chama aoConcluir", async () => {
    const usuario = userEvent.setup();
    const caminho = "G:\\Meu Drive\\DIMCAC\\Controle de Diárias.xlsx";
    vi.mocked(window.api.selecionarPlanilhaOficial).mockResolvedValueOnce(caminho);
    definirConfiguracaoMock.mockResolvedValueOnce({
      configurado: true,
      planilha_acessivel: true,
      requer_revalidacao: false,
      caminho_planilha_oficial: caminho,
      configurado_em: "2026-07-30T14:32:10",
    });
    const aoConcluir = vi.fn();

    render(<ConfiguracaoInicial aoConcluir={aoConcluir} />);
    await usuario.click(screen.getByRole("button", { name: "Selecionar planilha oficial (.xlsx)" }));
    await usuario.click(await screen.findByRole("button", { name: "Continuar" }));

    expect(aoConcluir).toHaveBeenCalledTimes(1);
  });
});
