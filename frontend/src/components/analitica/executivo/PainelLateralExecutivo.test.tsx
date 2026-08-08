// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DistribuicaoResposta, ParametrosDistribuicaoQuery } from "../../../types/analitica";

vi.mock("../../../services/api", async (importarOriginal) => {
  const real = await importarOriginal<typeof import("../../../services/api")>();
  return { ...real, obterDistribuicao: vi.fn() };
});

import PainelLateralExecutivo from "./PainelLateralExecutivo";
import { obterDistribuicao } from "../../../services/api";
import type { PontoSelecionadoExecutivo } from "./tiposSelecao";

const obterDistribuicaoMock = vi.mocked(obterDistribuicao);

const VAZIA = (dimensao: ParametrosDistribuicaoQuery["dimensao"]): DistribuicaoResposta => ({ dimensao, pontos: [] });

const SELECAO_MUNICIPIO: PontoSelecionadoExecutivo = {
  dimensao: "municipio",
  rotulo: "Araripina-PE",
  contagem: 89,
  valor: 42720,
  filtro: { municipio: "Araripina-PE" },
};

const PROPS_BASE = {
  selecao: SELECAO_MUNICIPIO,
  filtrosBase: { pagina: 1, tamanho_pagina: 25 },
  aoFechar: () => {},
  aoAplicarFiltro: () => {},
  aoVoltarAoOperacional: () => {},
  aoAbrirRelatorio: () => {},
  aoAbrirDiagnostico: () => {},
};

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe("PainelLateralExecutivo", () => {
  it("mostra o resumo (rótulo, diárias, valor) do ponto selecionado, sem nenhuma chamada extra para esses números", async () => {
    obterDistribuicaoMock.mockImplementation(async (parametros) => VAZIA(parametros.dimensao));
    render(<PainelLateralExecutivo {...PROPS_BASE} />);

    expect(screen.getByRole("heading", { name: "Araripina-PE" })).toBeInTheDocument();
    expect(screen.getByText("89")).toBeInTheDocument();
    expect(screen.getByText("R$ 42.720,00")).toBeInTheDocument();
  });

  it("valor nulo do ponto mostra travessão, nunca R$ 0,00 inventado", async () => {
    obterDistribuicaoMock.mockImplementation(async (parametros) => VAZIA(parametros.dimensao));
    render(<PainelLateralExecutivo {...PROPS_BASE} selecao={{ ...SELECAO_MUNICIPIO, valor: null }} />);

    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("busca 'Principais motivos'/'Principais pessoas' compondo o filtro do ponto sobre o recorte base vigente", async () => {
    obterDistribuicaoMock.mockImplementation(async (parametros) => VAZIA(parametros.dimensao));
    render(
      <PainelLateralExecutivo
        {...PROPS_BASE}
        filtrosBase={{ pagina: 1, tamanho_pagina: 25, situacao: "Em exercício" }}
      />,
    );

    await waitFor(() => expect(obterDistribuicaoMock).toHaveBeenCalled());
    const chamadas = obterDistribuicaoMock.mock.calls.map(([parametros]) => parametros);
    expect(chamadas).toContainEqual(
      expect.objectContaining({ dimensao: "motivo", municipio: "Araripina-PE", situacao: "Em exercício" }),
    );
    expect(chamadas).toContainEqual(
      expect.objectContaining({ dimensao: "servidor", municipio: "Araripina-PE", situacao: "Em exercício" }),
    );
  });

  it("'Aplicar filtro' aplica o filtro do ponto, fecha e volta ao Modo Operacional", () => {
    obterDistribuicaoMock.mockImplementation(async (parametros) => VAZIA(parametros.dimensao));
    const aoAplicarFiltro = vi.fn();
    const aoFechar = vi.fn();
    const aoVoltarAoOperacional = vi.fn();
    render(
      <PainelLateralExecutivo
        {...PROPS_BASE}
        aoAplicarFiltro={aoAplicarFiltro}
        aoFechar={aoFechar}
        aoVoltarAoOperacional={aoVoltarAoOperacional}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Aplicar filtro" }));

    expect(aoAplicarFiltro).toHaveBeenCalledWith({ municipio: "Araripina-PE" });
    expect(aoFechar).toHaveBeenCalledTimes(1);
    expect(aoVoltarAoOperacional).toHaveBeenCalledTimes(1);
  });

  it("'Abrir relatório' aplica o filtro, fecha e delega para aoAbrirRelatorio — nunca chama aoVoltarAoOperacional", () => {
    obterDistribuicaoMock.mockImplementation(async (parametros) => VAZIA(parametros.dimensao));
    const aoAplicarFiltro = vi.fn();
    const aoAbrirRelatorio = vi.fn();
    const aoVoltarAoOperacional = vi.fn();
    render(
      <PainelLateralExecutivo
        {...PROPS_BASE}
        aoAplicarFiltro={aoAplicarFiltro}
        aoAbrirRelatorio={aoAbrirRelatorio}
        aoVoltarAoOperacional={aoVoltarAoOperacional}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Abrir relatório" }));

    expect(aoAplicarFiltro).toHaveBeenCalledWith({ municipio: "Araripina-PE" });
    expect(aoAbrirRelatorio).toHaveBeenCalledTimes(1);
    expect(aoVoltarAoOperacional).not.toHaveBeenCalled();
  });

  it("'Abrir diagnóstico' aplica o filtro, fecha e delega para aoAbrirDiagnostico", () => {
    obterDistribuicaoMock.mockImplementation(async (parametros) => VAZIA(parametros.dimensao));
    const aoAplicarFiltro = vi.fn();
    const aoAbrirDiagnostico = vi.fn();
    render(
      <PainelLateralExecutivo {...PROPS_BASE} aoAplicarFiltro={aoAplicarFiltro} aoAbrirDiagnostico={aoAbrirDiagnostico} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Abrir diagnóstico" }));

    expect(aoAplicarFiltro).toHaveBeenCalledWith({ municipio: "Araripina-PE" });
    expect(aoAbrirDiagnostico).toHaveBeenCalledTimes(1);
  });

  it("Esc fecha o painel", () => {
    obterDistribuicaoMock.mockImplementation(async (parametros) => VAZIA(parametros.dimensao));
    const aoFechar = vi.fn();
    render(<PainelLateralExecutivo {...PROPS_BASE} aoFechar={aoFechar} />);

    fireEvent.keyDown(window, { key: "Escape" });

    expect(aoFechar).toHaveBeenCalledTimes(1);
  });

  it("clique no backdrop fecha o painel, clique dentro do painel não propaga o fechamento", () => {
    obterDistribuicaoMock.mockImplementation(async (parametros) => VAZIA(parametros.dimensao));
    const aoFechar = vi.fn();
    render(<PainelLateralExecutivo {...PROPS_BASE} aoFechar={aoFechar} />);

    fireEvent.click(screen.getByRole("heading", { name: "Araripina-PE" }));
    expect(aoFechar).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("dialog").parentElement as HTMLElement);
    expect(aoFechar).toHaveBeenCalledTimes(1);
  });

  it("é um role=dialog com aria-modal e título associado", () => {
    obterDistribuicaoMock.mockImplementation(async (parametros) => VAZIA(parametros.dimensao));
    render(<PainelLateralExecutivo {...PROPS_BASE} />);

    const dialogo = screen.getByRole("dialog");
    expect(dialogo).toHaveAttribute("aria-modal", "true");
    expect(dialogo).toHaveAttribute("aria-labelledby", "painel-lateral-executivo-titulo");
  });

  it("o foco inicial vai para o título do painel", () => {
    obterDistribuicaoMock.mockImplementation(async (parametros) => VAZIA(parametros.dimensao));
    render(<PainelLateralExecutivo {...PROPS_BASE} />);

    expect(screen.getByRole("heading", { name: "Araripina-PE" })).toHaveFocus();
  });

  it("dimensão clicada é 'situacao': mostra 'Principais motivos' e 'Principais pessoas' normalmente (nenhuma é redundante)", async () => {
    obterDistribuicaoMock.mockImplementation(async (parametros) => VAZIA(parametros.dimensao));
    render(
      <PainelLateralExecutivo
        {...PROPS_BASE}
        selecao={{ dimensao: "situacao", rotulo: "Em exercício", contagem: 10, valor: null, filtro: { situacao: "Em exercício" } }}
      />,
    );

    expect(screen.getByText("Principais motivos")).toBeInTheDocument();
    expect(screen.getByText("Principais pessoas")).toBeInTheDocument();
  });
});
