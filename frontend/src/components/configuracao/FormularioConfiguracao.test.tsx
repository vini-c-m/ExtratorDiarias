// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import FormularioConfiguracao from "./FormularioConfiguracao";

vi.mock("../../services/api", () => ({
  definirConfiguracao: vi.fn(),
}));

import { definirConfiguracao } from "../../services/api";

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

describe("FormularioConfiguracao", () => {
  it("cancelamento do diálogo nativo não chama o backend", async () => {
    const usuario = userEvent.setup();
    vi.mocked(window.api.selecionarPlanilhaOficial).mockResolvedValueOnce(null);
    const aoConfigurar = vi.fn();

    render(<FormularioConfiguracao aoConfigurar={aoConfigurar} />);
    await usuario.click(screen.getByRole("button", { name: "Selecionar planilha oficial (.xlsx)" }));

    expect(definirConfiguracaoMock).not.toHaveBeenCalled();
    expect(aoConfigurar).not.toHaveBeenCalled();
  });

  it("planilha válida chama definirConfiguracao e aoConfigurar com o resultado", async () => {
    const usuario = userEvent.setup();
    const caminho = "G:\\Meu Drive\\DIMCAC\\Controle de Diárias.xlsx";
    vi.mocked(window.api.selecionarPlanilhaOficial).mockResolvedValueOnce(caminho);
    const configuracaoRetornada = {
      configurado: true as const,
      planilha_acessivel: true as const,
      requer_revalidacao: false,
      caminho_planilha_oficial: caminho,
      configurado_em: "2026-07-30T14:32:10",
    };
    definirConfiguracaoMock.mockResolvedValueOnce(configuracaoRetornada);
    const aoConfigurar = vi.fn();

    render(<FormularioConfiguracao aoConfigurar={aoConfigurar} />);
    await usuario.click(screen.getByRole("button", { name: "Selecionar planilha oficial (.xlsx)" }));

    expect(definirConfiguracaoMock).toHaveBeenCalledWith(caminho);
    expect(aoConfigurar).toHaveBeenCalledWith(configuracaoRetornada);
  });

  it("planilha inválida mostra a mensagem específica devolvida pelo backend", async () => {
    const usuario = userEvent.setup();
    vi.mocked(window.api.selecionarPlanilhaOficial).mockResolvedValueOnce("C:\\qualquer.xlsx");
    definirConfiguracaoMock.mockRejectedValueOnce(
      new Error("Aba 'Controle de Diárias' não encontrada na planilha"),
    );
    const aoConfigurar = vi.fn();

    render(<FormularioConfiguracao aoConfigurar={aoConfigurar} />);
    await usuario.click(screen.getByRole("button", { name: "Selecionar planilha oficial (.xlsx)" }));

    expect(
      await screen.findByText("Aba 'Controle de Diárias' não encontrada na planilha"),
    ).toBeInTheDocument();
    expect(aoConfigurar).not.toHaveBeenCalled();
  });
});
