// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SeletorArquivoFonte from "./SeletorArquivoFonte";

function criarXlsx(nome: string): File {
  return new File(["conteúdo fictício"], nome, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

beforeEach(() => {
  window.api = {
    ...window.api,
    getPathForFile: (arquivo: File) => `G:\\Meu Drive\\DIMCAC\\${arquivo.name}`,
  };
});

afterEach(() => {
  cleanup();
});

describe("SeletorArquivoFonte", () => {
  it("nenhum arquivo selecionado: mostra 'Nenhum arquivo selecionado'", () => {
    render(
      <SeletorArquivoFonte rotulo="Base de Ordens Bancárias" caminhoSelecionado={null} onSelecionar={vi.fn()} />,
    );

    expect(screen.getByText("Nenhum arquivo selecionado")).toBeInTheDocument();
  });

  it("arquivo selecionado: mostra só o NOME do arquivo, nunca o caminho absoluto", () => {
    render(
      <SeletorArquivoFonte
        rotulo="Base de Ordens Bancárias"
        caminhoSelecionado="G:\\Meu Drive\\DIMCAC\\OB_2026_08.xlsx"
        onSelecionar={vi.fn()}
      />,
    );

    expect(screen.getByText("OB_2026_08.xlsx")).toBeInTheDocument();
    expect(screen.queryByText(/G:\\Meu Drive/)).not.toBeInTheDocument();
  });

  it("selecionar um arquivo .xlsx chama onSelecionar com o caminho absoluto resolvido via window.api.getPathForFile", async () => {
    const usuario = userEvent.setup();
    const onSelecionar = vi.fn();
    render(
      <SeletorArquivoFonte rotulo="Controle DIMCAC" caminhoSelecionado={null} onSelecionar={onSelecionar} />,
    );

    const input = document.querySelector('input[type="file"][accept=".xlsx"]') as HTMLInputElement;
    await usuario.upload(input, criarXlsx("Controle_DIMCAC_2026.xlsx"));

    expect(onSelecionar).toHaveBeenCalledWith("G:\\Meu Drive\\DIMCAC\\Controle_DIMCAC_2026.xlsx");
  });

  it("desabilitado: o input de arquivo fica desabilitado", () => {
    render(
      <SeletorArquivoFonte rotulo="Controle DIMCAC" caminhoSelecionado={null} onSelecionar={vi.fn()} desabilitado />,
    );

    const input = document.querySelector('input[type="file"][accept=".xlsx"]') as HTMLInputElement;
    expect(input).toBeDisabled();
  });
});
