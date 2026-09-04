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
      <SeletorArquivoFonte rotulo="Base E-Fisco" caminhoSelecionado={null} onSelecionar={vi.fn()} />,
    );

    expect(screen.getByText("Nenhum arquivo selecionado")).toBeInTheDocument();
  });

  it("arquivo selecionado: mostra só o NOME do arquivo, nunca o caminho absoluto", () => {
    render(
      <SeletorArquivoFonte
        rotulo="Base E-Fisco"
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

  it("accept customizado (ex.: .ods da Planilha de Passagens) sobrescreve o padrão .xlsx", () => {
    render(
      <SeletorArquivoFonte
        rotulo="Planilha de Passagens"
        caminhoSelecionado={null}
        onSelecionar={vi.fn()}
        accept=".ods"
      />,
    );

    expect(document.querySelector('input[type="file"][accept=".ods"]')).not.toBeNull();
    expect(document.querySelector('input[type="file"][accept=".xlsx"]')).toBeNull();
  });

  it("desabilitado: o input de arquivo fica desabilitado", () => {
    render(
      <SeletorArquivoFonte rotulo="Controle DIMCAC" caminhoSelecionado={null} onSelecionar={vi.fn()} desabilitado />,
    );

    const input = document.querySelector('input[type="file"][accept=".xlsx"]') as HTMLInputElement;
    expect(input).toBeDisabled();
  });

  it("nenhum arquivo selecionado ainda: botão convida a selecionar, nunca 'Alterar'", () => {
    render(
      <SeletorArquivoFonte rotulo="Base E-Fisco" caminhoSelecionado={null} onSelecionar={vi.fn()} />,
    );

    expect(screen.getByTitle("Selecionar Base E-Fisco")).toHaveTextContent(
      "Selecionar arquivo",
    );
  });

  it("arquivo já selecionado: botão convida a ALTERAR, nunca a 'Selecionar arquivo' de novo", () => {
    render(
      <SeletorArquivoFonte
        rotulo="Base E-Fisco"
        caminhoSelecionado="G:\\Meu Drive\\DIMCAC\\OB_2026_08.xlsx"
        onSelecionar={vi.fn()}
      />,
    );

    expect(screen.getByTitle("Selecionar Base E-Fisco")).toHaveTextContent(
      "Alterar",
    );
  });

  // Micro-sprint UX operacional (item 3) — caminho persistido de uma sessão
  // anterior cujo arquivo não existe mais: nunca falha silenciosamente nem
  // aparenta ser "nunca selecionado" (o usuário JÁ escolheu um arquivo
  // antes) — avisa e ainda convida a "Alterar", nunca "Selecionar arquivo".
  describe("arquivo persistido indisponível (movido/renomeado/excluído)", () => {
    it("mostra aviso distinto de 'nenhum arquivo selecionado'", () => {
      render(
        <SeletorArquivoFonte
          rotulo="Controle DIMCAC"
          caminhoSelecionado={null}
          onSelecionar={vi.fn()}
          indisponivel
        />,
      );

      expect(screen.getByText(/não foi encontrado/i)).toBeInTheDocument();
      expect(screen.queryByText("Nenhum arquivo selecionado")).not.toBeInTheDocument();
    });

    it("botão continua convidando a 'Alterar', não 'Selecionar arquivo'", () => {
      render(
        <SeletorArquivoFonte
          rotulo="Controle DIMCAC"
          caminhoSelecionado={null}
          onSelecionar={vi.fn()}
          indisponivel
        />,
      );

      expect(screen.getByTitle("Selecionar Controle DIMCAC")).toHaveTextContent("Alterar");
    });

    it("selecionar um novo arquivo continua funcionando normalmente", async () => {
      const usuario = userEvent.setup();
      const onSelecionar = vi.fn();
      render(
        <SeletorArquivoFonte
          rotulo="Controle DIMCAC"
          caminhoSelecionado={null}
          onSelecionar={onSelecionar}
          indisponivel
        />,
      );

      const input = document.querySelector('input[type="file"][accept=".xlsx"]') as HTMLInputElement;
      await usuario.upload(input, criarXlsx("Controle_DIMCAC_novo.xlsx"));

      expect(onSelecionar).toHaveBeenCalledWith("G:\\Meu Drive\\DIMCAC\\Controle_DIMCAC_novo.xlsx");
    });
  });
});
