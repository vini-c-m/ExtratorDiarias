// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Conferencia from "./Conferencia";
import { ErroConferenciaIndisponivel } from "../services/api";
import type { ResultadoConferencia } from "../types/conferencia";

// Sprint 13 — cobre o portão da Etapa 2 (só existe quando o veredito é
// APTO_PARA_PROCESSAMENTO, nunca antes de conferir e nunca em REVISAR) e o
// estado de falha técnica (503 nunca vira um veredito de negócio).

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

vi.mock("../services/api", async (importarOriginal) => {
  const real = await importarOriginal<typeof import("../services/api")>();
  return {
    ...real,
    conferir: vi.fn(),
    gerarHistorico: vi.fn(),
  };
});

import { conferir, gerarHistorico } from "../services/api";

const conferirMock = vi.mocked(conferir);
const gerarHistoricoMock = vi.mocked(gerarHistorico);

const RESULTADO_APTO: ResultadoConferencia = {
  veredito: "APTO_PARA_PROCESSAMENTO",
  providencia: "Nenhuma — pronto para seguir",
  checklist: [
    { item: "cadastro_localizado", ok: true, valor: null },
    { item: "nome", ok: true, valor: "Maria Aparecida Souza" },
    { item: "cargo", ok: true, valor: "Analista Judiciário" },
    { item: "duplicidade", ok: true, valor: null },
    { item: "janela_processamento", ok: true, valor: null },
  ],
  servidor: { nome: "Maria Aparecida Souza", cargo: "Analista Judiciário", previdencia: "FUNAFIN" },
  duplicidade: null,
  janela_processamento: { liberado: true, data_liberacao: "2026-07-06" },
};

const RESULTADO_REVISAR: ResultadoConferencia = {
  veredito: "REVISAR",
  providencia: "Verifique se não é um caso de complemento de diária antes de prosseguir.",
  checklist: [
    { item: "cadastro_localizado", ok: true, valor: null },
    { item: "nome", ok: true, valor: "Maria Aparecida Souza" },
    { item: "cargo", ok: true, valor: "Analista Judiciário" },
    { item: "duplicidade", ok: false, valor: null },
    { item: "janela_processamento", ok: true, valor: null },
  ],
  servidor: { nome: "Maria Aparecida Souza", cargo: "Analista Judiciário", previdencia: "FUNAFIN" },
  duplicidade: {
    linha: 547,
    sei: "19.20.0902.0004521/2026-11",
    trecho: "RECIFE - GARANHUNS",
    periodo_inicial: "2026-07-21",
    periodo_final: "2026-07-23",
  },
  janela_processamento: { liberado: true, data_liberacao: "2026-07-06" },
};

beforeEach(() => {
  window.api = {
    getPathForFile: (arquivo: File) => arquivo.name,
    abrirArquivo: vi.fn(),
    salvarComo: vi.fn(),
    salvarRelatorio: vi.fn(),
    copiarHistorico: vi.fn(),
  };
});

async function preencherEConferir(usuario: ReturnType<typeof userEvent.setup>) {
  await usuario.type(screen.getByLabelText("CPF do servidor"), "12345678901");
  fireEvent.change(screen.getByLabelText("Período inicial"), { target: { value: "2026-07-21" } });
  fireEvent.change(screen.getByLabelText("Período final"), { target: { value: "2026-07-23" } });
  await usuario.click(screen.getByRole("button", { name: "Realizar Conferência" }));
}

describe("Conferencia — portão da Etapa 2", () => {
  it("não mostra 'Gerar Histórico' antes de qualquer conferência", () => {
    render(<Conferencia backendOnline />);
    expect(screen.queryByText("Gerar Histórico para o e-Fisco")).not.toBeInTheDocument();
  });

  it("veredito APTO revela a Etapa 2 só depois da conferência", async () => {
    const usuario = userEvent.setup();
    conferirMock.mockResolvedValue(RESULTADO_APTO);

    render(<Conferencia backendOnline />);
    expect(screen.queryByText("Gerar Histórico para o e-Fisco")).not.toBeInTheDocument();

    await preencherEConferir(usuario);

    expect(await screen.findByText("APTO PARA PROCESSAMENTO")).toBeInTheDocument();
    expect(screen.getByText("Gerar Histórico para o e-Fisco")).toBeInTheDocument();
  });

  it("veredito REVISAR nunca revela a Etapa 2", async () => {
    const usuario = userEvent.setup();
    conferirMock.mockResolvedValue(RESULTADO_REVISAR);

    render(<Conferencia backendOnline />);
    await preencherEConferir(usuario);

    expect(await screen.findByText("REVISAR")).toBeInTheDocument();
    expect(screen.queryByText("Gerar Histórico para o e-Fisco")).not.toBeInTheDocument();
  });

  it("falha técnica (503) mostra alerta de erro, nunca um veredito", async () => {
    const usuario = userEvent.setup();
    conferirMock.mockRejectedValue(new ErroConferenciaIndisponivel());

    render(<Conferencia backendOnline />);
    await preencherEConferir(usuario);

    expect(
      await screen.findByText(/Não foi possível acessar os registros administrativos/),
    ).toBeInTheDocument();
    expect(screen.queryByText("APTO PARA PROCESSAMENTO")).not.toBeInTheDocument();
    expect(screen.queryByText("REVISAR")).not.toBeInTheDocument();
  });
});

describe("Conferencia — validação de entrada (Sprint 13.1)", () => {
  it("bloqueia 'Realizar Conferência' quando período final é anterior ao inicial", async () => {
    render(<Conferencia backendOnline />);

    await userEvent.type(screen.getByLabelText("CPF do servidor"), "12345678901");
    fireEvent.change(screen.getByLabelText("Período inicial"), { target: { value: "2026-07-23" } });
    fireEvent.change(screen.getByLabelText("Período final"), { target: { value: "2026-07-21" } });

    expect(
      await screen.findByText("Período final não pode ser anterior ao período inicial."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Realizar Conferência" })).toBeDisabled();
    expect(conferirMock).not.toHaveBeenCalled();
  });

  it("bloqueia 'Gerar Histórico' quando origem e destino são iguais", async () => {
    const usuario = userEvent.setup();
    conferirMock.mockResolvedValue(RESULTADO_APTO);

    render(<Conferencia backendOnline />);
    await preencherEConferir(usuario);
    await screen.findByText("Gerar Histórico para o e-Fisco");

    await usuario.type(screen.getByLabelText("Número do SEI"), "19.20.0000.0000000/2026-00");
    await usuario.type(screen.getByLabelText("Origem"), "Recife");
    await usuario.type(screen.getByLabelText("Destino"), "recife");

    expect(await screen.findByText("Origem e destino não podem ser iguais.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Gerar Histórico" })).toBeDisabled();
    expect(gerarHistoricoMock).not.toHaveBeenCalled();
  });
});

describe("Conferencia — geração e cópia do histórico", () => {
  it("botão 'Copiar Histórico' chama window.api.copiarHistorico com o texto gerado", async () => {
    const usuario = userEvent.setup();
    conferirMock.mockResolvedValue(RESULTADO_APTO);
    gerarHistoricoMock.mockResolvedValue("19.20.0000.0000000/2026-00 MARIA APARECIDA SOUZA TEXTO");

    render(<Conferencia backendOnline />);
    await preencherEConferir(usuario);
    await screen.findByText("Gerar Histórico para o e-Fisco");

    await usuario.type(screen.getByLabelText("Número do SEI"), "19.20.0000.0000000/2026-00");
    await usuario.type(screen.getByLabelText("Origem"), "Recife");
    await usuario.type(screen.getByLabelText("Destino"), "Garanhuns");
    await usuario.click(screen.getByRole("button", { name: "Gerar Histórico" }));

    await screen.findByText("19.20.0000.0000000/2026-00 MARIA APARECIDA SOUZA TEXTO");
    await usuario.click(screen.getByRole("button", { name: /Copiar Histórico/ }));

    expect(window.api.copiarHistorico).toHaveBeenCalledWith(
      "19.20.0000.0000000/2026-00 MARIA APARECIDA SOUZA TEXTO",
    );
  });
});
