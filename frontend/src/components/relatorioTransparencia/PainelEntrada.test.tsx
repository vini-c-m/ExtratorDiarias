// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PainelEntrada from "./PainelEntrada";

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

async function preencherFormularioCompleto(usuario: ReturnType<typeof userEvent.setup>) {
  const inputs = document.querySelectorAll('input[type="file"][accept=".xlsx"]');
  await usuario.upload(inputs[0] as HTMLInputElement, criarXlsx("OB_2026_08.xlsx"));
  await usuario.upload(inputs[1] as HTMLInputElement, criarXlsx("Controle_DIMCAC_2026.xlsx"));
  await usuario.type(screen.getByLabelText("Responsável pela revisão"), "servidor.teste");
}

describe("PainelEntrada", () => {
  it("botão 'Preparar Relatório' começa desabilitado (fontes/autor ainda não preenchidos)", () => {
    render(
      <PainelEntrada erro={null} preparando={false} caminhoDecisoesResolvido onPreparar={vi.fn()} />,
    );

    expect(screen.getByRole("button", { name: "Preparar Relatório" })).toBeDisabled();
  });

  it("preencher competência, as duas fontes e o responsável habilita 'Preparar Relatório'", async () => {
    const usuario = userEvent.setup();
    render(
      <PainelEntrada erro={null} preparando={false} caminhoDecisoesResolvido onPreparar={vi.fn()} />,
    );

    await preencherFormularioCompleto(usuario);

    expect(screen.getByRole("button", { name: "Preparar Relatório" })).toBeEnabled();
  });

  it("caminho de decisões ainda não resolvido: 'Preparar Relatório' continua desabilitado mesmo com tudo preenchido", async () => {
    const usuario = userEvent.setup();
    render(
      <PainelEntrada erro={null} preparando={false} caminhoDecisoesResolvido={false} onPreparar={vi.fn()} />,
    );

    await preencherFormularioCompleto(usuario);

    expect(screen.getByRole("button", { name: "Preparar Relatório" })).toBeDisabled();
  });

  it("clicar em 'Preparar Relatório' chama onPreparar com os parâmetros e o autor", async () => {
    const usuario = userEvent.setup();
    const onPreparar = vi.fn();
    render(
      <PainelEntrada erro={null} preparando={false} caminhoDecisoesResolvido onPreparar={onPreparar} />,
    );

    await preencherFormularioCompleto(usuario);
    await usuario.click(screen.getByRole("button", { name: "Preparar Relatório" }));

    expect(onPreparar).toHaveBeenCalledTimes(1);
    const [parametros, autor] = onPreparar.mock.calls[0];
    expect(parametros).toEqual({
      ano_exercicio: expect.any(Number),
      mes_referencia: expect.any(Number),
      caminho_base_ordens_bancarias: "G:\\Meu Drive\\DIMCAC\\OB_2026_08.xlsx",
      caminho_controle_dimcac: "G:\\Meu Drive\\DIMCAC\\Controle_DIMCAC_2026.xlsx",
    });
    expect(autor).toBe("servidor.teste");
  });

  it("mostra o nome dos arquivos selecionados, nunca o caminho absoluto", async () => {
    const usuario = userEvent.setup();
    render(
      <PainelEntrada erro={null} preparando={false} caminhoDecisoesResolvido onPreparar={vi.fn()} />,
    );

    await preencherFormularioCompleto(usuario);

    expect(screen.getByText("OB_2026_08.xlsx")).toBeInTheDocument();
    expect(screen.queryByText(/G:\\Meu Drive/)).not.toBeInTheDocument();
  });

  it("preparando: botão mostra estado de carregamento e fica desabilitado (bloqueia duplo envio)", () => {
    render(
      <PainelEntrada erro={null} preparando caminhoDecisoesResolvido onPreparar={vi.fn()} />,
    );

    expect(screen.getByRole("button", { name: "Preparar Relatório" })).toBeDisabled();
  });

  it("erro: mostra o alerta com a mensagem recebida", () => {
    render(
      <PainelEntrada
        erro="Não encontramos o arquivo da Base de Ordens Bancárias selecionado."
        preparando={false}
        caminhoDecisoesResolvido
        onPreparar={vi.fn()}
      />,
    );

    expect(
      screen.getByText("Não encontramos o arquivo da Base de Ordens Bancárias selecionado."),
    ).toBeInTheDocument();
  });
});
