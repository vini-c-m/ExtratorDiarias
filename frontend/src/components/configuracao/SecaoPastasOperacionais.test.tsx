// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SecaoPastasOperacionais from "./SecaoPastasOperacionais";
import type { PastasOperacionais } from "../../types/configuracao";

vi.mock("../../services/api", () => ({
  definirPastasOperacionais: vi.fn(),
}));

import { definirPastasOperacionais } from "../../services/api";

const definirPastasOperacionaisMock = vi.mocked(definirPastasOperacionais);

const CONFIGURACAO_VAZIA: PastasOperacionais = {
  caminho_pdfs_a_processar: null,
  caminho_pdfs_complemento_a_processar: null,
  caminho_pdfs_processados: null,
  caminho_pdfs_diarias_a_confirmar: null,
};

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

describe("SecaoPastasOperacionais", () => {
  it("mostra as quatro pastas como 'Não configurado' quando nenhuma foi selecionada", () => {
    render(<SecaoPastasOperacionais configuracao={CONFIGURACAO_VAZIA} aoAtualizar={vi.fn()} />);

    expect(screen.getByText("PDFs a Processar")).toBeInTheDocument();
    expect(screen.getByText("PDFs de Complemento a Processar")).toBeInTheDocument();
    expect(screen.getByText("PDFs Processados")).toBeInTheDocument();
    expect(screen.getByText("PDFs de Diárias a Confirmar")).toBeInTheDocument();
    expect(screen.getAllByText("Não configurado")).toHaveLength(4);
  });

  it("mostra o caminho já configurado de uma pasta", () => {
    render(
      <SecaoPastasOperacionais
        configuracao={{ ...CONFIGURACAO_VAZIA, caminho_pdfs_a_processar: "C:\\PDFs\\a processar" }}
        aoAtualizar={vi.fn()}
      />,
    );

    expect(screen.getByText("C:\\PDFs\\a processar")).toBeInTheDocument();
  });

  it("cancelamento do diálogo nativo não chama o backend nem aoAtualizar", async () => {
    const usuario = userEvent.setup();
    vi.mocked(window.api.selecionarPastaOperacional!).mockResolvedValueOnce(null);
    const aoAtualizar = vi.fn();

    render(<SecaoPastasOperacionais configuracao={CONFIGURACAO_VAZIA} aoAtualizar={aoAtualizar} />);
    const [primeiroBotao] = screen.getAllByRole("button", { name: "Selecionar pasta" });
    await usuario.click(primeiroBotao);

    expect(definirPastasOperacionaisMock).not.toHaveBeenCalled();
    expect(aoAtualizar).not.toHaveBeenCalled();
  });

  it("pasta selecionada com sucesso chama definirPastasOperacionais com o campo certo e aoAtualizar", async () => {
    const usuario = userEvent.setup();
    const caminho = "C:\\PDFs\\a processar";
    vi.mocked(window.api.selecionarPastaOperacional!).mockResolvedValueOnce(caminho);
    definirPastasOperacionaisMock.mockResolvedValueOnce({ configurado: false });
    const aoAtualizar = vi.fn();

    render(<SecaoPastasOperacionais configuracao={CONFIGURACAO_VAZIA} aoAtualizar={aoAtualizar} />);
    const [primeiroBotao] = screen.getAllByRole("button", { name: "Selecionar pasta" });
    await usuario.click(primeiroBotao);

    expect(definirPastasOperacionaisMock).toHaveBeenCalledWith({ caminho_pdfs_a_processar: caminho });
    expect(aoAtualizar).toHaveBeenCalledTimes(1);
  });

  it("falha ao salvar mostra mensagem de erro e não chama aoAtualizar", async () => {
    const usuario = userEvent.setup();
    vi.mocked(window.api.selecionarPastaOperacional!).mockResolvedValueOnce("C:\\PDFs\\a processar");
    definirPastasOperacionaisMock.mockRejectedValueOnce(new Error("Pasta não encontrada ou inacessível"));
    const aoAtualizar = vi.fn();

    render(<SecaoPastasOperacionais configuracao={CONFIGURACAO_VAZIA} aoAtualizar={aoAtualizar} />);
    const [primeiroBotao] = screen.getAllByRole("button", { name: "Selecionar pasta" });
    await usuario.click(primeiroBotao);

    expect(await screen.findByText("Pasta não encontrada ou inacessível")).toBeInTheDocument();
    expect(aoAtualizar).not.toHaveBeenCalled();
  });

  // Regressão: `window.api.selecionarPastaOperacional()` (diálogo nativo do
  // Electron) ficava fora de qualquer tratamento de erro — uma Promise
  // rejeitada (falha do IPC/diálogo) não mostrava nenhuma mensagem, nada
  // acontecia visivelmente. Nunca deve ficar silencioso.
  it("falha ao abrir o seletor nativo (Promise rejeitada) mostra mensagem amigável e não chama o backend", async () => {
    const usuario = userEvent.setup();
    vi.mocked(window.api.selecionarPastaOperacional!).mockRejectedValueOnce(new Error());
    const aoAtualizar = vi.fn();

    render(<SecaoPastasOperacionais configuracao={CONFIGURACAO_VAZIA} aoAtualizar={aoAtualizar} />);
    const [primeiroBotao] = screen.getAllByRole("button", { name: "Selecionar pasta" });
    await usuario.click(primeiroBotao);

    expect(
      await screen.findByText("Não foi possível abrir o seletor de pastas. Tente novamente."),
    ).toBeInTheDocument();
    expect(definirPastasOperacionaisMock).not.toHaveBeenCalled();
    expect(aoAtualizar).not.toHaveBeenCalled();
  });

  // Regra definitiva: o nome físico da pasta é livre — os rótulos ("PDFs a
  // Processar" etc.) são só o papel funcional do campo escolhido pelo
  // usuário, nunca uma exigência sobre o nome do diretório físico. Cobre
  // explicitamente nomes arbitrários que o usuário pode dar às pastas.
  it.each(["pasta 1", "Gabriel", "Diárias Agosto", "nome-com-hifen", "nome_com_underscore"])(
    "aceita pasta com nome arbitrário: '%s'",
    async (nomePasta) => {
      const usuario = userEvent.setup();
      const caminho = `D:\\${nomePasta}`;
      vi.mocked(window.api.selecionarPastaOperacional!).mockResolvedValueOnce(caminho);
      definirPastasOperacionaisMock.mockResolvedValueOnce({ configurado: false });
      const aoAtualizar = vi.fn();

      render(<SecaoPastasOperacionais configuracao={CONFIGURACAO_VAZIA} aoAtualizar={aoAtualizar} />);
      const [primeiroBotao] = screen.getAllByRole("button", { name: "Selecionar pasta" });
      await usuario.click(primeiroBotao);

      expect(definirPastasOperacionaisMock).toHaveBeenCalledWith({
        caminho_pdfs_a_processar: caminho,
      });
      expect(aoAtualizar).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    },
  );
});
