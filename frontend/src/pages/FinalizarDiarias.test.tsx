// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import FinalizarDiarias from "./FinalizarDiarias";
import type { ItemAnaliseFinalizacao, RespostaConfirmacaoFinalizacao } from "../types/finalizacao";

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

vi.mock("../services/api", async (importarOriginal) => {
  const real = await importarOriginal<typeof import("../services/api")>();
  return {
    ...real,
    analisarFinalizacao: vi.fn(),
    confirmarFinalizacao: vi.fn(),
  };
});

import { analisarFinalizacao, confirmarFinalizacao } from "../services/api";

const analisarMock = vi.mocked(analisarFinalizacao);
const confirmarMock = vi.mocked(confirmarFinalizacao);

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
    selecionarPlanilhaOficial: vi.fn(),
  };
});

function itemPronto(sei = "19.20.0000.0000001/2026-01"): ItemAnaliseFinalizacao {
  return {
    arquivo_origem: "processo.pdf",
    sei,
    status: "pronto",
    motivo: null,
    avaliacao: {
      confirmacao_encontrada: true,
      confirmacao_valida: true,
      comprovante_encontrado: true,
      ordem_bancaria_encontrada: false,
      apto: true,
    },
    candidatos: [
      {
        linha: 4,
        cpf: "11111111111",
        periodo_inicial: "2026-01-07",
        periodo_final: "2026-01-07",
        trecho: "RECIFE - OLINDA",
        dh: null,
        aviso: null,
        x_atual: null,
        y_atual: null,
        estado: "pronta",
      },
    ],
  };
}

function itemSemComprovante(): ItemAnaliseFinalizacao {
  return {
    arquivo_origem: "sem-comprovante.pdf",
    sei: "19.20.0000.0000002/2026-02",
    status: "sem_comprovante",
    motivo: "Confirmação encontrada, mas nenhum comprovante/anexo foi identificado.",
    avaliacao: {
      confirmacao_encontrada: true,
      confirmacao_valida: true,
      comprovante_encontrado: false,
      ordem_bancaria_encontrada: false,
      apto: false,
    },
    candidatos: [],
  };
}

// Ajuste de 2026-08-07: mesmo SEI em duas linhas (diária + Complemento de
// Diárias) — a regra é do processo inteiro, "pronto" cobre as duas.
function itemProntoComDuasLinhas(): ItemAnaliseFinalizacao {
  return {
    arquivo_origem: "duas-linhas.pdf",
    sei: "19.20.0000.0000003/2026-03",
    status: "pronto",
    motivo: null,
    avaliacao: {
      confirmacao_encontrada: true,
      confirmacao_valida: true,
      comprovante_encontrado: true,
      ordem_bancaria_encontrada: false,
      apto: true,
    },
    candidatos: [
      {
        linha: 10,
        cpf: "22222222222",
        periodo_inicial: "2026-02-01",
        periodo_final: "2026-02-02",
        trecho: "RECIFE - GARANHUNS",
        dh: "2026DH000010",
        aviso: null,
        x_atual: null,
        y_atual: null,
        estado: "pronta",
      },
      {
        linha: 25,
        cpf: "22222222222",
        periodo_inicial: "2026-02-01",
        periodo_final: "2026-02-02",
        trecho: "RECIFE - GARANHUNS",
        dh: "2026DH000011",
        aviso: "COMPLEMENTO DE DIÁRIAS",
        x_atual: "SIM",
        y_atual: "SIM",
        estado: "ja_finalizada",
      },
    ],
  };
}

describe("FinalizarDiarias", () => {
  it("mostra título e subtítulo da funcionalidade", () => {
    render(<FinalizarDiarias backendOnline />);
    expect(screen.getByRole("heading", { name: "Finalizar Diárias" })).toBeInTheDocument();
    expect(
      screen.getByText("Confirmar comprovantes e confirmação de diárias na Planilha Oficial."),
    ).toBeInTheDocument();
  });

  it("botão 'Analisar' fica desabilitado sem nenhum PDF selecionado", () => {
    render(<FinalizarDiarias backendOnline />);
    expect(screen.getByRole("button", { name: "Analisar" })).toBeDisabled();
  });

  it("analisa o lote e mostra o resumo de aptos/não aptos", async () => {
    const usuario = userEvent.setup();
    analisarMock.mockResolvedValue({ itens: [itemPronto(), itemSemComprovante()] });

    render(<FinalizarDiarias backendOnline />);
    await selecionarPdf(usuario, "processo.pdf");
    await usuario.click(screen.getByRole("button", { name: "Analisar" }));

    expect(await screen.findByText(/2 processo\(s\) analisado\(s\)/)).toBeInTheDocument();
    expect(screen.getByText(/1 pronto\(s\) para finalizar/)).toBeInTheDocument();
    expect(screen.getByText("Pronto para finalizar")).toBeInTheDocument();
    expect(screen.getByText("Sem comprovante/anexo")).toBeInTheDocument();
    expect(analisarMock).toHaveBeenCalledWith(["C:/pdfs/processo.pdf"]);
  });

  it("mostra mensagem de erro quando a análise falha", async () => {
    const usuario = userEvent.setup();
    analisarMock.mockRejectedValue(new Error("Backend respondeu 500"));

    render(<FinalizarDiarias backendOnline />);
    await selecionarPdf(usuario, "processo.pdf");
    await usuario.click(screen.getByRole("button", { name: "Analisar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Ocorreu um erro inesperado. Tente novamente em instantes.",
    );
  });

  it("SEI com múltiplas linhas fica pronto sem seleção manual, listando os registros vinculados", async () => {
    const usuario = userEvent.setup();
    analisarMock.mockResolvedValue({ itens: [itemProntoComDuasLinhas()] });

    render(<FinalizarDiarias backendOnline />);
    await selecionarPdf(usuario, "duas-linhas.pdf");
    await usuario.click(screen.getByRole("button", { name: "Analisar" }));

    await screen.findByText(/2 registros vinculados a este SEI serão finalizados juntos/);
    expect(screen.getByText(/Linha 10/)).toBeInTheDocument();
    expect(screen.getByText(/Linha 25/)).toBeInTheDocument();
    expect(screen.getByText(/COMPLEMENTO DE DIÁRIAS/)).toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();

    expect(screen.getByRole("button", { name: "Finalizar 1 processo(s)" })).toBeEnabled();
  });

  it("confirma a finalização e mostra o relatório de execução", async () => {
    const usuario = userEvent.setup();
    analisarMock.mockResolvedValue({ itens: [itemPronto()] });
    const resultado: RespostaConfirmacaoFinalizacao = {
      total_finalizado: 1,
      total_ignorado: 0,
      itens: [
        {
          arquivo_origem: "processo.pdf",
          sei: "19.20.0000.0000001/2026-01",
          categoria: "finalizado",
          linhas_atualizadas: [4],
          linhas_mantidas: [],
          motivo: null,
        },
      ],
    };
    confirmarMock.mockResolvedValue(resultado);

    render(<FinalizarDiarias backendOnline />);
    await selecionarPdf(usuario, "processo.pdf");
    await usuario.click(screen.getByRole("button", { name: "Analisar" }));
    await usuario.click(await screen.findByRole("button", { name: "Finalizar 1 processo(s)" }));

    expect(await screen.findByRole("heading", { name: "Finalização concluída" })).toBeInTheDocument();
    expect(screen.getByText("1 finalizado(s), 0 ignorado(s).")).toBeInTheDocument();
    expect(confirmarMock).toHaveBeenCalledWith([
      { arquivo_origem: "processo.pdf", sei: "19.20.0000.0000001/2026-01" },
    ]);
  });

  it("relatório final mostra linhas atualizadas e linhas mantidas separadamente", async () => {
    const usuario = userEvent.setup();
    analisarMock.mockResolvedValue({ itens: [itemProntoComDuasLinhas()] });
    confirmarMock.mockResolvedValue({
      total_finalizado: 1,
      total_ignorado: 0,
      itens: [
        {
          arquivo_origem: "duas-linhas.pdf",
          sei: "19.20.0000.0000003/2026-03",
          categoria: "finalizado",
          linhas_atualizadas: [10],
          linhas_mantidas: [25],
          motivo: null,
        },
      ],
    });

    render(<FinalizarDiarias backendOnline />);
    await selecionarPdf(usuario, "duas-linhas.pdf");
    await usuario.click(screen.getByRole("button", { name: "Analisar" }));
    await usuario.click(await screen.findByRole("button", { name: "Finalizar 1 processo(s)" }));

    await screen.findByRole("heading", { name: "Finalização concluída" });
    const linha = screen.getByText("duas-linhas.pdf").closest("tr");
    expect(linha).toHaveTextContent("10");
    expect(linha).toHaveTextContent("25");
  });

  it("exibe estado 'já finalizado anteriormente' sem permitir regravação", async () => {
    const usuario = userEvent.setup();
    analisarMock.mockResolvedValue({
      itens: [
        {
          arquivo_origem: "ja-feito.pdf",
          sei: "19.20.0000.0000004/2026-04",
          status: "ja_finalizado",
          motivo: "Já finalizado anteriormente.",
          avaliacao: {
            confirmacao_encontrada: true,
            confirmacao_valida: true,
            comprovante_encontrado: true,
            ordem_bancaria_encontrada: true,
            apto: true,
          },
          candidatos: [],
        },
      ],
    });

    render(<FinalizarDiarias backendOnline />);
    await selecionarPdf(usuario, "ja-feito.pdf");
    await usuario.click(screen.getByRole("button", { name: "Analisar" }));

    await screen.findByText("Já finalizado anteriormente");
    expect(screen.getByRole("button", { name: /Finalizar 0 processo/ })).toBeDisabled();
  });

  it("SEI em estado parcial fica bloqueado, sem entrar no lote a finalizar", async () => {
    const usuario = userEvent.setup();
    analisarMock.mockResolvedValue({
      itens: [
        {
          arquivo_origem: "parcial.pdf",
          sei: "19.20.0000.0000005/2026-05",
          status: "estado_parcial",
          motivo: "Estado parcial — revisão manual necessária.",
          avaliacao: {
            confirmacao_encontrada: true,
            confirmacao_valida: true,
            comprovante_encontrado: true,
            ordem_bancaria_encontrada: false,
            apto: true,
          },
          candidatos: [],
        },
      ],
    });

    render(<FinalizarDiarias backendOnline />);
    await selecionarPdf(usuario, "parcial.pdf");
    await usuario.click(screen.getByRole("button", { name: "Analisar" }));

    await screen.findByText("Estado parcial — revisão manual");
    expect(screen.getByRole("button", { name: /Finalizar 0 processo/ })).toBeDisabled();
  });
});
