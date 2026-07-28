// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SelecionarProcessar from "./SelecionarProcessar";
import { ProcessamentoCanceladoError } from "../services/api";
import type { LoteProcessamento, ResultadoPreenchimento } from "../types/processamento";

// Sprint 05.3 — cobre o fluxo de cancelamento seguro do processamento a
// partir da tela: troca de botão, diálogo de confirmação, "Continuar
// Processando" x "Interromper", e o retorno da interface ao estado inicial
// preservando a fila de PDFs selecionados.
//
// Vitest não roda com `globals: true` neste projeto, então a limpeza
// automática do RTL entre testes não é registrada sozinha.
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

vi.mock("../services/api", async (importarOriginal) => {
  const real = await importarOriginal<typeof import("../services/api")>();
  return {
    ...real,
    processarLoteComProgresso: vi.fn(),
    preencherPlanilha: vi.fn(),
  };
});

import { preencherPlanilha, processarLoteComProgresso } from "../services/api";

const processarMock = vi.mocked(processarLoteComProgresso);
const preencherMock = vi.mocked(preencherPlanilha);

function criarPdf(nome: string): File {
  return new File(["conteudo"], nome, { type: "application/pdf" });
}

async function selecionarPdf(usuario: ReturnType<typeof userEvent.setup>, nome: string) {
  const input = document.querySelector('input[type="file"][accept=".pdf"]') as HTMLInputElement;
  await usuario.upload(input, criarPdf(nome));
}

beforeEach(() => {
  window.api = {
    getPathForFile: (arquivo: File) => `C:/pdfs/${arquivo.name}`,
    abrirArquivo: vi.fn(),
    salvarComo: vi.fn(),
    salvarRelatorio: vi.fn(),
    copiarHistorico: vi.fn(),
  };
});

describe("SelecionarProcessar — cancelamento do processamento", () => {
  it("troca 'Processar' por '⏹ Interromper Processamento' enquanto o processamento está em andamento", async () => {
    const usuario = userEvent.setup();
    processarMock.mockImplementation(() => new Promise(() => {}));

    render(<SelecionarProcessar backendOnline />);
    await selecionarPdf(usuario, "processo-a.pdf");

    expect(screen.getByRole("button", { name: "Processar" })).toBeInTheDocument();

    await usuario.click(screen.getByRole("button", { name: "Processar" }));

    expect(processarMock).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByRole("button", { name: "⏹ Interromper Processamento" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Processar" })).not.toBeInTheDocument();
  });

  it("abre o diálogo de confirmação ao clicar em Interromper, com o texto esperado", async () => {
    const usuario = userEvent.setup();
    processarMock.mockImplementation(() => new Promise(() => {}));

    render(<SelecionarProcessar backendOnline />);
    await selecionarPdf(usuario, "processo-a.pdf");
    await usuario.click(screen.getByRole("button", { name: "Processar" }));
    await usuario.click(await screen.findByRole("button", { name: "⏹ Interromper Processamento" }));

    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(screen.getByText("Interromper processamento?")).toBeInTheDocument();
    expect(screen.getByText(/Nenhum dado será gravado na planilha/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continuar Processando" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Interromper" })).toBeInTheDocument();
  });

  it("'Continuar Processando' fecha o diálogo sem abortar nada e o processamento continua", async () => {
    const usuario = userEvent.setup();
    let sinalCapturado: AbortSignal | undefined;
    processarMock.mockImplementation((_caminhos, _onProgresso, signal) => {
      sinalCapturado = signal;
      return new Promise(() => {});
    });

    render(<SelecionarProcessar backendOnline />);
    await selecionarPdf(usuario, "processo-a.pdf");
    await usuario.click(screen.getByRole("button", { name: "Processar" }));
    await usuario.click(await screen.findByRole("button", { name: "⏹ Interromper Processamento" }));
    await usuario.click(screen.getByRole("button", { name: "Continuar Processando" }));

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "⏹ Interromper Processamento" })).toBeInTheDocument();
    expect(sinalCapturado?.aborted).toBe(false);
  });

  it("'Interromper' cancela: descarta o processamento, mantém a fila de PDFs e mostra a mensagem discreta", async () => {
    const usuario = userEvent.setup();
    processarMock.mockImplementation(
      (_caminhos, _onProgresso, signal) =>
        new Promise((_resolve, reject) => {
          signal?.addEventListener("abort", () => reject(new ProcessamentoCanceladoError()));
        }),
    );

    render(<SelecionarProcessar backendOnline />);
    await selecionarPdf(usuario, "processo-a.pdf");
    await usuario.click(screen.getByRole("button", { name: "Processar" }));
    await usuario.click(await screen.findByRole("button", { name: "⏹ Interromper Processamento" }));

    await act(async () => {
      await usuario.click(screen.getByRole("button", { name: "Interromper" }));
    });

    // Estado inicial restaurado: botão "Processar" de volta, sem diálogo,
    // sem barra de progresso.
    expect(await screen.findByRole("button", { name: "Processar" })).toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();

    // Mensagem discreta de cancelamento.
    expect(
      screen.getByText("Processamento cancelado pelo usuário. Nenhuma informação foi salva."),
    ).toBeInTheDocument();

    // PDF selecionado continua na fila — nada foi removido.
    expect(screen.getByText("processo-a.pdf")).toBeInTheDocument();
    expect(screen.getByText("1 PDF selecionado")).toBeInTheDocument();
  });

  it("cancelar logo no início (antes de qualquer progresso) também limpa tudo e preserva a fila", async () => {
    const usuario = userEvent.setup();
    processarMock.mockImplementation(
      (_caminhos, _onProgresso, signal) =>
        new Promise((_resolve, reject) => {
          if (signal?.aborted) {
            reject(new ProcessamentoCanceladoError());
            return;
          }
          signal?.addEventListener("abort", () => reject(new ProcessamentoCanceladoError()));
        }),
    );

    render(<SelecionarProcessar backendOnline />);
    await selecionarPdf(usuario, "processo-a.pdf");
    await usuario.click(screen.getByRole("button", { name: "Processar" }));

    // Interrompe imediatamente, antes de qualquer callback de progresso.
    await usuario.click(await screen.findByRole("button", { name: "⏹ Interromper Processamento" }));
    await act(async () => {
      await usuario.click(screen.getByRole("button", { name: "Interromper" }));
    });

    expect(await screen.findByRole("button", { name: "Processar" })).toBeInTheDocument();
    expect(
      screen.getByText("Processamento cancelado pelo usuário. Nenhuma informação foi salva."),
    ).toBeInTheDocument();
    expect(screen.getByText("processo-a.pdf")).toBeInTheDocument();
  });

  it("um novo clique em Processar depois de cancelar funciona normalmente, sem precisar reselecionar PDFs", async () => {
    const usuario = userEvent.setup();
    processarMock.mockImplementationOnce(
      (_caminhos, _onProgresso, signal) =>
        new Promise((_resolve, reject) => {
          signal?.addEventListener("abort", () => reject(new ProcessamentoCanceladoError()));
        }),
    );

    render(<SelecionarProcessar backendOnline />);
    await selecionarPdf(usuario, "processo-a.pdf");
    await usuario.click(screen.getByRole("button", { name: "Processar" }));
    await usuario.click(await screen.findByRole("button", { name: "⏹ Interromper Processamento" }));
    await act(async () => {
      await usuario.click(screen.getByRole("button", { name: "Interromper" }));
    });
    await screen.findByRole("button", { name: "Processar" });

    processarMock.mockImplementationOnce(
      () =>
        new Promise((resolve) =>
          resolve({ id: "lote-2", total: 1, sucesso: 1, erro: 0, processos: [] }),
        ),
    );

    await usuario.click(screen.getByRole("button", { name: "Processar" }));

    expect(processarMock).toHaveBeenCalledTimes(2);
    // O segundo processamento foi disparado com o mesmo PDF, sem reseleção.
    expect(processarMock.mock.calls[1][0]).toEqual(["C:/pdfs/processo-a.pdf"]);
  });
});

// Sprint 05.2 — "Salvar Relatório" (diálogo nativo "Salvar Como...") e
// "Abrir Local" (pasta escolhida pelo usuário) na tela de conclusão, sem
// afetar a visualização já homologada ("Abrir Relatório").
describe("SelecionarProcessar — salvar e abrir o relatório final", () => {
  const loteFixture: LoteProcessamento = { id: "lote-1", total: 1, sucesso: 1, erro: 0, processos: [] };
  const resultadoPreenchimentoFixture: ResultadoPreenchimento = {
    total_gravado: 1,
    duplicadas_ignoradas: 0,
    linha_inicial: 4,
    linha_final: 4,
    itens: [],
    pasta_resultados: "C:/res/resultado_20260715_143218",
    caminho_planilha_gerada: "C:/res/resultado_20260715_143218/planilha.xlsx",
    caminho_relatorio: "C:/res/resultado_20260715_143218/relatorio.html",
    caminho_log: "C:/res/resultado_20260715_143218/log.txt",
  };

  async function selecionarPlanilhaXlsx(usuario: ReturnType<typeof userEvent.setup>) {
    const input = document.querySelector('input[type="file"][accept=".xlsx"]') as HTMLInputElement;
    await usuario.upload(input, new File(["conteudo"], "planilha.xlsx"));
  }

  async function chegarNaTelaFinal(usuario: ReturnType<typeof userEvent.setup>) {
    processarMock.mockResolvedValueOnce(loteFixture);
    preencherMock.mockResolvedValueOnce(resultadoPreenchimentoFixture);

    render(<SelecionarProcessar backendOnline />);
    await selecionarPdf(usuario, "processo-a.pdf");
    await usuario.click(screen.getByRole("button", { name: "Processar" }));
    await selecionarPlanilhaXlsx(usuario);
    await usuario.click(await screen.findByRole("button", { name: "Preencher planilha" }));
    await screen.findByRole("button", { name: "Salvar Relatório" });
  }

  it("clique em 'Salvar Relatório' chama window.api.salvarRelatorio com os caminhos corretos", async () => {
    const usuario = userEvent.setup();
    await chegarNaTelaFinal(usuario);
    vi.mocked(window.api.salvarRelatorio).mockResolvedValueOnce({
      caminhoArquivo: "D:/arquivados/Relatório Processamento - 15-07-2026.html",
      pastaArquivo: "D:/arquivados",
    });

    await usuario.click(screen.getByRole("button", { name: "Salvar Relatório" }));

    expect(window.api.salvarRelatorio).toHaveBeenCalledWith(
      resultadoPreenchimentoFixture.caminho_relatorio,
      resultadoPreenchimentoFixture.pasta_resultados,
    );
  });

  it("sucesso ao salvar mostra a confirmação e o botão 'Abrir Local', que abre a pasta escolhida", async () => {
    const usuario = userEvent.setup();
    await chegarNaTelaFinal(usuario);
    vi.mocked(window.api.salvarRelatorio).mockResolvedValueOnce({
      caminhoArquivo: "D:/arquivados/Relatório Processamento - 15-07-2026.html",
      pastaArquivo: "D:/arquivados",
    });

    await usuario.click(screen.getByRole("button", { name: "Salvar Relatório" }));

    expect(await screen.findByText("✔ Relatório salvo com sucesso.")).toBeInTheDocument();
    const botaoAbrirLocal = await screen.findByRole("button", { name: "Abrir Local" });

    await usuario.click(botaoAbrirLocal);
    expect(window.api.abrirArquivo).toHaveBeenCalledWith("D:/arquivados");
  });

  it("cancelamento do diálogo (retorno null) não mostra sucesso, erro nem 'Abrir Local'", async () => {
    const usuario = userEvent.setup();
    await chegarNaTelaFinal(usuario);
    vi.mocked(window.api.salvarRelatorio).mockResolvedValueOnce(null);

    await usuario.click(screen.getByRole("button", { name: "Salvar Relatório" }));

    expect(screen.queryByText("✔ Relatório salvo com sucesso.")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Abrir Local" })).not.toBeInTheDocument();
  });

  it("erro ao salvar mostra mensagem amigável e não mostra 'Abrir Local'", async () => {
    const usuario = userEvent.setup();
    await chegarNaTelaFinal(usuario);
    vi.mocked(window.api.salvarRelatorio).mockRejectedValueOnce(new Error("EPERM"));

    await usuario.click(screen.getByRole("button", { name: "Salvar Relatório" }));

    expect(
      await screen.findByText(
        "Não foi possível concluir a operação porque o arquivo está aberto em outro programa (ex.: Excel). Feche-o e tente novamente.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Abrir Local" })).not.toBeInTheDocument();
  });

  it("'Abrir Relatório' continua chamando window.api.abrirArquivo com o caminho do relatório — visualização preservada", async () => {
    const usuario = userEvent.setup();
    await chegarNaTelaFinal(usuario);

    await usuario.click(screen.getByRole("button", { name: "Abrir Relatório" }));

    expect(window.api.abrirArquivo).toHaveBeenCalledWith(resultadoPreenchimentoFixture.caminho_relatorio);
  });

  it("antes de qualquer salvamento, o botão 'Abrir Local' não é exibido", async () => {
    const usuario = userEvent.setup();
    await chegarNaTelaFinal(usuario);

    expect(screen.queryByRole("button", { name: "Abrir Local" })).not.toBeInTheDocument();
  });
});
