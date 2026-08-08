// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Conferencia from "./Conferencia";
import { ErroConferenciaIndisponivel } from "../services/api";
import type { ResultadoConferencia } from "../types/conferencia";

// Sprint 13 — cobre o portão da Etapa 2 (só existe quando o veredito é
// APTO_PARA_PROCESSAMENTO ou quando o servidor escolhe "Prosseguir mesmo
// assim" com pendência exclusiva da janela do DH, nunca antes de conferir e
// nunca em REVISAR por outro motivo) e o estado de falha técnica (503 nunca
// vira um veredito de negócio).

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
    gerarHistoricoComplemento: vi.fn(),
    buscarCandidatosComplemento: vi.fn(),
  };
});

import {
  buscarCandidatosComplemento,
  conferir,
  gerarHistorico,
  gerarHistoricoComplemento,
} from "../services/api";

const conferirMock = vi.mocked(conferir);
const gerarHistoricoMock = vi.mocked(gerarHistorico);
const gerarHistoricoComplementoMock = vi.mocked(gerarHistoricoComplemento);
const buscarCandidatosComplementoMock = vi.mocked(buscarCandidatosComplemento);

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

// Bloco de refinamento (2026-08-06) — pendência exclusiva da janela do
// Documento Hábil: cadastro localizado, sem duplicidade, só a janela ainda
// não liberada.
const RESULTADO_REVISAR_APENAS_JANELA: ResultadoConferencia = {
  veredito: "REVISAR",
  providencia: "Aguardar até 05/08/2026 para dar continuidade.",
  checklist: [
    { item: "cadastro_localizado", ok: true, valor: null },
    { item: "nome", ok: true, valor: "Maria Aparecida Souza" },
    { item: "cargo", ok: true, valor: "Analista Judiciário" },
    { item: "duplicidade", ok: true, valor: null },
    { item: "janela_processamento", ok: false, valor: null },
  ],
  servidor: { nome: "Maria Aparecida Souza", cargo: "Analista Judiciário", previdencia: "FUNAFIN" },
  duplicidade: null,
  janela_processamento: { liberado: false, data_liberacao: "2026-08-05" },
};

beforeEach(() => {
  window.api = {
    getPathForFile: (arquivo: File) => arquivo.name,
    abrirArquivo: vi.fn(),
    salvarComo: vi.fn(),
    salvarRelatorio: vi.fn(),
    copiarHistorico: vi.fn(),
    selecionarPlanilhaOficial: vi.fn(),
  };
  buscarCandidatosComplementoMock.mockResolvedValue([]);
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

describe("Conferencia — prosseguir mesmo assim antes da liberação do DH (2026-08-06)", () => {
  it("oferece 'Voltar'/'Prosseguir mesmo assim' quando a única pendência é a janela, sem revelar a Etapa 2 direto", async () => {
    const usuario = userEvent.setup();
    conferirMock.mockResolvedValue(RESULTADO_REVISAR_APENAS_JANELA);

    render(<Conferencia backendOnline />);
    await preencherEConferir(usuario);

    expect(await screen.findByText("REVISAR")).toBeInTheDocument();
    expect(screen.getByText("O Documento Hábil ainda não foi liberado")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Voltar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Prosseguir mesmo assim" })).toBeInTheDocument();
    expect(screen.queryByText("Gerar Histórico para o e-Fisco")).not.toBeInTheDocument();
  });

  it("'Prosseguir mesmo assim' revela a Etapa 2 sem alterar o veredito", async () => {
    const usuario = userEvent.setup();
    conferirMock.mockResolvedValue(RESULTADO_REVISAR_APENAS_JANELA);

    render(<Conferencia backendOnline />);
    await preencherEConferir(usuario);
    await screen.findByText("O Documento Hábil ainda não foi liberado");

    await usuario.click(screen.getByRole("button", { name: "Prosseguir mesmo assim" }));

    expect(screen.getByText("Gerar Histórico para o e-Fisco")).toBeInTheDocument();
    expect(screen.getByText("REVISAR")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Prosseguir mesmo assim" }),
    ).not.toBeInTheDocument();
  });

  it("'Voltar' limpa o diagnóstico, sem revelar a Etapa 2", async () => {
    const usuario = userEvent.setup();
    conferirMock.mockResolvedValue(RESULTADO_REVISAR_APENAS_JANELA);

    render(<Conferencia backendOnline />);
    await preencherEConferir(usuario);
    await screen.findByText("O Documento Hábil ainda não foi liberado");

    await usuario.click(screen.getByRole("button", { name: "Voltar" }));

    expect(screen.queryByText("REVISAR")).not.toBeInTheDocument();
    expect(screen.queryByText("O Documento Hábil ainda não foi liberado")).not.toBeInTheDocument();
    expect(screen.queryByText("Gerar Histórico para o e-Fisco")).not.toBeInTheDocument();
  });

  it("REVISAR por duplicidade não oferece 'Prosseguir mesmo assim'", async () => {
    const usuario = userEvent.setup();
    conferirMock.mockResolvedValue(RESULTADO_REVISAR);

    render(<Conferencia backendOnline />);
    await preencherEConferir(usuario);

    expect(await screen.findByText("REVISAR")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Prosseguir mesmo assim" })).not.toBeInTheDocument();
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

  it("bloqueia 'Gerar Histórico' enquanto SEI ou Destino estiverem vazios", async () => {
    const usuario = userEvent.setup();
    conferirMock.mockResolvedValue(RESULTADO_APTO);

    render(<Conferencia backendOnline />);
    await preencherEConferir(usuario);
    await screen.findByText("Gerar Histórico para o e-Fisco");

    expect(screen.getByRole("button", { name: "Gerar Histórico" })).toBeDisabled();

    await usuario.type(screen.getByLabelText("Número do SEI"), "19.20.0000.0000000/2026-00");
    expect(screen.getByRole("button", { name: "Gerar Histórico" })).toBeDisabled();

    await usuario.type(screen.getByLabelText("Destino"), "Garanhuns");
    expect(screen.getByRole("button", { name: "Gerar Histórico" })).toBeEnabled();
    expect(gerarHistoricoMock).not.toHaveBeenCalled();
  });

  it("Etapa 2 não pede mais Origem (correção de 2026-08-05)", async () => {
    const usuario = userEvent.setup();
    conferirMock.mockResolvedValue(RESULTADO_APTO);

    render(<Conferencia backendOnline />);
    await preencherEConferir(usuario);
    await screen.findByText("Gerar Histórico para o e-Fisco");

    expect(screen.queryByLabelText("Origem")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Destino")).toBeInTheDocument();
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
    await usuario.type(screen.getByLabelText("Destino"), "Garanhuns");
    await usuario.click(screen.getByRole("button", { name: "Gerar Histórico" }));

    await screen.findByText("19.20.0000.0000000/2026-00 MARIA APARECIDA SOUZA TEXTO");
    expect(gerarHistoricoMock).toHaveBeenCalledWith(
      "12345678901",
      "2026-07-21",
      "2026-07-23",
      "19.20.0000.0000000/2026-00",
      "Garanhuns",
    );

    await usuario.click(screen.getByRole("button", { name: /Copiar Histórico/ }));

    expect(window.api.copiarHistorico).toHaveBeenCalledWith(
      "19.20.0000.0000000/2026-00 MARIA APARECIDA SOUZA TEXTO",
    );
  });
});

// RN-14 — o backend, em modo Complemento, já devolve APTO mesmo com
// duplicidade encontrada (a duplicidade continua no campo `duplicidade`
// para exibição, só não bloqueia mais o veredito).
const RESULTADO_APTO_COMPLEMENTO: ResultadoConferencia = {
  ...RESULTADO_APTO,
  duplicidade: RESULTADO_REVISAR.duplicidade,
};

describe("Conferencia — Modo Complemento de Diárias (RN-14)", () => {
  it("botão alterna o rótulo e envia modo=COMPLEMENTO para conferir()", async () => {
    const usuario = userEvent.setup();
    conferirMock.mockResolvedValue(RESULTADO_APTO_COMPLEMENTO);

    render(<Conferencia backendOnline />);
    await usuario.click(screen.getByRole("button", { name: "Modo Complemento de Diárias" }));
    expect(
      screen.getByRole("button", { name: "Modo Complemento de Diárias (ativo)" }),
    ).toBeInTheDocument();

    await preencherEConferir(usuario);

    expect(conferirMock).toHaveBeenCalledWith("12345678901", "2026-07-21", "2026-07-23", "COMPLEMENTO");
  });

  it("exibe aviso de que a duplicidade não bloqueia mais o resultado", async () => {
    const usuario = userEvent.setup();
    render(<Conferencia backendOnline />);

    await usuario.click(screen.getByRole("button", { name: "Modo Complemento de Diárias" }));

    expect(
      screen.getByText(/duplicidade deixa de bloquear o resultado/),
    ).toBeInTheDocument();
  });

  it("mostra o painel de Continuidade Processual com os candidatos encontrados", async () => {
    const usuario = userEvent.setup();
    conferirMock.mockResolvedValue(RESULTADO_APTO_COMPLEMENTO);
    buscarCandidatosComplementoMock.mockResolvedValue([
      {
        registro: {
          sei: "19.20.0001.0004758/2026-36",
          dh: "2026DH900453",
          periodo_inicial: "2026-03-17",
          periodo_final: "2026-03-19",
          cidade_origem: "Ouricuri",
          cidade_destino: "Recife",
          motivo: "Recolhimento de material",
          valor_total_diarias: 154.09,
          linha_planilha: 457,
          servidor_nome: "Roberto Alves Ferreira",
        },
        evidencias: ["Período coincide ou é próximo: diária já lançada 2026-03-17 a 2026-03-19."],
      },
    ]);

    render(<Conferencia backendOnline />);
    await usuario.click(screen.getByRole("button", { name: "Modo Complemento de Diárias" }));
    await preencherEConferir(usuario);

    expect(await screen.findByText("Continuidade Processual")).toBeInTheDocument();
    expect(await screen.findByText("Roberto Alves Ferreira")).toBeInTheDocument();
    expect(screen.getByText(/Período coincide ou é próximo/)).toBeInTheDocument();
    expect(buscarCandidatosComplementoMock).toHaveBeenCalledWith(
      "12345678901",
      "2026-07-21",
      "2026-07-23",
    );
  });

  it("Etapa 2 usa o título 'Gerar Histórico de Complemento' e chama gerarHistoricoComplemento", async () => {
    const usuario = userEvent.setup();
    conferirMock.mockResolvedValue(RESULTADO_APTO_COMPLEMENTO);
    gerarHistoricoComplementoMock.mockResolvedValue("TEXTO (COMPLEMENTO DE DIÁRIAS).");

    render(<Conferencia backendOnline />);
    await usuario.click(screen.getByRole("button", { name: "Modo Complemento de Diárias" }));
    await preencherEConferir(usuario);
    await screen.findByText("Gerar Histórico de Complemento");

    await usuario.type(screen.getByLabelText("Número do SEI"), "19.20.0001.0004758/2026-36");
    await usuario.type(screen.getByLabelText("Destino"), "Recife");
    await usuario.click(screen.getByRole("button", { name: "Gerar Histórico" }));

    await screen.findByText("TEXTO (COMPLEMENTO DE DIÁRIAS).");
    expect(gerarHistoricoComplementoMock).toHaveBeenCalledWith(
      "12345678901",
      "2026-07-21",
      "2026-07-23",
      "19.20.0001.0004758/2026-36",
      "Recife",
    );
    expect(gerarHistoricoMock).not.toHaveBeenCalled();
  });

  it("desativar o modo Complemento volta ao fluxo Padrão normalmente", async () => {
    const usuario = userEvent.setup();
    conferirMock.mockResolvedValue(RESULTADO_APTO);

    render(<Conferencia backendOnline />);
    await usuario.click(screen.getByRole("button", { name: "Modo Complemento de Diárias" }));
    await usuario.click(screen.getByRole("button", { name: "Modo Complemento de Diárias (ativo)" }));

    await preencherEConferir(usuario);

    expect(conferirMock).toHaveBeenCalledWith("12345678901", "2026-07-21", "2026-07-23", "PADRAO");
    expect(await screen.findByText("Gerar Histórico para o e-Fisco")).toBeInTheDocument();
    expect(screen.queryByText("Continuidade Processual")).not.toBeInTheDocument();
  });
});
