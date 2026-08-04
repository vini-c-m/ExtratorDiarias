// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DiagnosticoResposta } from "../../types/analitica";

vi.mock("../../services/api", async (importarOriginal) => {
  const real = await importarOriginal<typeof import("../../services/api")>();
  return { ...real, obterDiagnostico: vi.fn() };
});

import PainelDiagnostico from "./PainelDiagnostico";
import { obterDiagnostico } from "../../services/api";

const obterDiagnosticoMock = vi.mocked(obterDiagnostico);

const DIAGNOSTICO: DiagnosticoResposta = {
  resumo: { esperado: 2, atencao: 1, inconsistencia: 1 },
  registros: [
    { sei: "SEI-1", classificacao: "esperado", casos: [] },
    { sei: "SEI-2", classificacao: "esperado", casos: [] },
    {
      sei: "SEI-3",
      classificacao: "atencao",
      casos: [
        { campo: "dh", titulo: "Documento Hábil (DH) ainda não emitido", motivo: "m", acao_recomendada: "a" },
      ],
    },
    {
      sei: "SEI-4",
      classificacao: "inconsistencia",
      casos: [{ campo: "periodo_final", titulo: "Período inválido", motivo: "m", acao_recomendada: "a" }],
    },
  ],
};

const PROPS_BASE = {
  filtros: { pagina: 1, tamanho_pagina: 25 },
  aoVoltar: () => {},
  aoSelecionarRegistro: () => {},
};

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe("PainelDiagnostico", () => {
  it("mostra 'Analisando o recorte...' e o botão de voltar enquanto carrega", () => {
    obterDiagnosticoMock.mockImplementation(() => new Promise(() => {}));
    render(<PainelDiagnostico {...PROPS_BASE} />);

    expect(screen.getByRole("status")).toHaveTextContent("Analisando o recorte...");
    expect(screen.getByRole("button", { name: "← Voltar aos resultados" })).toBeInTheDocument();
  });

  it("falha na busca: mostra alerta e 'Tentar novamente' aciona uma nova busca", async () => {
    obterDiagnosticoMock.mockRejectedValueOnce(new Error("Não foi possível carregar o diagnóstico."));
    render(<PainelDiagnostico {...PROPS_BASE} />);

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível carregar o diagnóstico."));

    obterDiagnosticoMock.mockResolvedValueOnce(DIAGNOSTICO);
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));

    await waitFor(() => expect(screen.getByText("4 registros")).toBeInTheDocument());
  });

  it("'← Voltar aos resultados' aciona aoVoltar em qualquer estado", () => {
    const aoVoltar = vi.fn();
    obterDiagnosticoMock.mockImplementation(() => new Promise(() => {}));
    render(<PainelDiagnostico {...PROPS_BASE} aoVoltar={aoVoltar} />);

    fireEvent.click(screen.getByRole("button", { name: "← Voltar aos resultados" }));
    expect(aoVoltar).toHaveBeenCalledTimes(1);
  });

  it("recorte vazio: mostra mensagem própria, sem tabela nem resumo", async () => {
    obterDiagnosticoMock.mockResolvedValueOnce({ resumo: { esperado: 0, atencao: 0, inconsistencia: 0 }, registros: [] });
    render(<PainelDiagnostico {...PROPS_BASE} />);

    await waitFor(() => expect(screen.getByText("Nenhum registro neste recorte para diagnosticar.")).toBeInTheDocument());
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  describe("com diagnóstico carregado", () => {
    it("mostra o total de registros e o resumo por classificação com contagem e percentual", async () => {
      obterDiagnosticoMock.mockResolvedValueOnce(DIAGNOSTICO);
      render(<PainelDiagnostico {...PROPS_BASE} />);

      await waitFor(() => expect(screen.getByText("4 registros")).toBeInTheDocument());
      expect(screen.getByText("Esperado 2 (50%)")).toBeInTheDocument();
      expect(screen.getByText("Atenção 1 (25%)")).toBeInTheDocument();
      expect(screen.getByText("Inconsistência 1 (25%)")).toBeInTheDocument();
    });

    it("mostra o texto-resumo dinâmico ('N registros merecem atenção')", async () => {
      obterDiagnosticoMock.mockResolvedValueOnce(DIAGNOSTICO);
      render(<PainelDiagnostico {...PROPS_BASE} />);

      await waitFor(() => expect(screen.getByText("2 registros merecem atenção ou conferência manual.")).toBeInTheDocument());
    });

    it("nenhum registro merece atenção: mostra a mensagem positiva", async () => {
      obterDiagnosticoMock.mockResolvedValueOnce({
        resumo: { esperado: 3, atencao: 0, inconsistencia: 0 },
        registros: [
          { sei: "SEI-1", classificacao: "esperado", casos: [] },
          { sei: "SEI-2", classificacao: "esperado", casos: [] },
          { sei: "SEI-3", classificacao: "esperado", casos: [] },
        ],
      });
      render(<PainelDiagnostico {...PROPS_BASE} />);

      await waitFor(() =>
        expect(screen.getByText("Nenhum registro deste recorte merece atenção ou conferência manual.")).toBeInTheDocument(),
      );
    });

    it("mostra uma linha por registro, com SEI, badge de classificação e campo problemático", async () => {
      obterDiagnosticoMock.mockResolvedValueOnce(DIAGNOSTICO);
      render(<PainelDiagnostico {...PROPS_BASE} />);

      await waitFor(() => expect(screen.getByText("SEI-3")).toBeInTheDocument());
      const linha = screen.getByText("SEI-3").closest("tr")!;
      expect(linha).toHaveTextContent("Atenção");
      expect(linha).toHaveTextContent("dh");
      expect(linha).toHaveTextContent("▸ Ver");
    });

    it("registro sem nenhum campo problemático mostra travessão", async () => {
      obterDiagnosticoMock.mockResolvedValueOnce(DIAGNOSTICO);
      render(<PainelDiagnostico {...PROPS_BASE} />);

      await waitFor(() => expect(screen.getByText("SEI-1")).toBeInTheDocument());
      const linha = screen.getByText("SEI-1").closest("tr")!;
      expect(linha).toHaveTextContent("—");
    });

    it("clicar numa linha aciona aoSelecionarRegistro com o SEI correto", async () => {
      const aoSelecionarRegistro = vi.fn();
      obterDiagnosticoMock.mockResolvedValueOnce(DIAGNOSTICO);
      render(<PainelDiagnostico {...PROPS_BASE} aoSelecionarRegistro={aoSelecionarRegistro} />);

      await waitFor(() => expect(screen.getByText("SEI-4")).toBeInTheDocument());
      fireEvent.click(screen.getByText("SEI-4").closest("tr")!);

      expect(aoSelecionarRegistro).toHaveBeenCalledWith("SEI-4");
    });

    it("Enter na linha (teclado) também aciona aoSelecionarRegistro", async () => {
      const aoSelecionarRegistro = vi.fn();
      obterDiagnosticoMock.mockResolvedValueOnce(DIAGNOSTICO);
      render(<PainelDiagnostico {...PROPS_BASE} aoSelecionarRegistro={aoSelecionarRegistro} />);

      await waitFor(() => expect(screen.getByText("SEI-4")).toBeInTheDocument());
      fireEvent.keyDown(screen.getByText("SEI-4").closest("tr")!, { key: "Enter" });

      expect(aoSelecionarRegistro).toHaveBeenCalledWith("SEI-4");
    });

    it("RN-08: badge de 'Inconsistência' nunca usa a cor de erro (vermelho)", async () => {
      obterDiagnosticoMock.mockResolvedValueOnce(DIAGNOSTICO);
      render(<PainelDiagnostico {...PROPS_BASE} />);

      await waitFor(() => expect(screen.getByText("SEI-4")).toBeInTheDocument());
      const linha = screen.getByText("SEI-4").closest("tr")!;
      const badge = within(linha).getByText("Inconsistência");
      expect(badge.className).toContain("orange");
      expect(badge.className).not.toContain("red");
    });

    it("mostra o período do recorte quando os filtros têm período", async () => {
      obterDiagnosticoMock.mockResolvedValueOnce(DIAGNOSTICO);
      render(
        <PainelDiagnostico
          {...PROPS_BASE}
          filtros={{ pagina: 1, tamanho_pagina: 25, periodo_inicial: "2026-06-01", periodo_final: "2026-06-30" }}
        />,
      );

      await waitFor(() => expect(screen.getByText(/01–30\/06\/2026/)).toBeInTheDocument());
    });
  });
});
