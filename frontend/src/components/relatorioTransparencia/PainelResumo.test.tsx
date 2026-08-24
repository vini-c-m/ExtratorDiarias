// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import PainelResumo from "./PainelResumo";
import type { ResumoRelatorioTransparencia } from "../../types/relatorioTransparencia";

afterEach(() => {
  cleanup();
});

function revisao(estado: "pendente" | "decidida" | "adiada" | "desatualizada") {
  return {
    identidade_grupo: `grupo-${estado}`,
    regra: "RN07",
    estado,
    explicacao: "explicação fictícia",
    campos_iguais: [],
    campos_diferentes: [],
    ocorrencias: [],
  };
}

const RESUMO_COM_PENDENCIAS: ResumoRelatorioTransparencia = {
  total_candidatos_normais: 1799,
  total_revisoes: 8,
  total_pendentes: 6,
  total_decididas: 6,
  total_adiadas: 1,
  total_desatualizadas: 1,
  total_ocorrencias_nao_publicaveis: 0,
  pode_gerar_relatorio: false,
  revisoes: [
    revisao("pendente"),
    revisao("pendente"),
    revisao("adiada"),
    revisao("desatualizada"),
    revisao("decidida"),
    revisao("decidida"),
  ],
};

const RESUMO_SEM_PENDENCIAS: ResumoRelatorioTransparencia = {
  total_candidatos_normais: 1804,
  total_revisoes: 8,
  total_pendentes: 0,
  total_decididas: 8,
  total_adiadas: 0,
  total_desatualizadas: 0,
  total_ocorrencias_nao_publicaveis: 3,
  pode_gerar_relatorio: true,
  revisoes: [revisao("decidida"), revisao("decidida")],
};

describe("PainelResumo — com pendências (Tela 2)", () => {
  it("mostra o aviso e o número de casos que precisam de revisão (2 pendentes + 1 adiada + 1 desatualizada = 4)", () => {
    render(
      <PainelResumo resumo={RESUMO_COM_PENDENCIAS} onRevisarCasos={vi.fn()} onVoltarParaEntrada={vi.fn()} />,
    );

    expect(screen.getByText("Existem casos que precisam ser analisados antes da geração.")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Revisar 4 Casos" })).toBeInTheDocument();
  });

  it("nunca mostra o botão 'Gerar Relatório' enquanto há pendências", () => {
    render(
      <PainelResumo resumo={RESUMO_COM_PENDENCIAS} onRevisarCasos={vi.fn()} onVoltarParaEntrada={vi.fn()} />,
    );

    expect(screen.queryByRole("button", { name: "Gerar Relatório" })).not.toBeInTheDocument();
  });

  it("clicar em 'Revisar N Casos' aciona onRevisarCasos", async () => {
    const usuario = userEvent.setup();
    const onRevisarCasos = vi.fn();
    render(
      <PainelResumo resumo={RESUMO_COM_PENDENCIAS} onRevisarCasos={onRevisarCasos} onVoltarParaEntrada={vi.fn()} />,
    );

    await usuario.click(screen.getByRole("button", { name: "Revisar 4 Casos" }));

    expect(onRevisarCasos).toHaveBeenCalledTimes(1);
  });
});

describe("PainelResumo — sem pendências (Tela 5)", () => {
  it("mostra a mensagem de conclusão, vinda apenas de resumo.pode_gerar_relatorio", () => {
    render(
      <PainelResumo resumo={RESUMO_SEM_PENDENCIAS} onRevisarCasos={vi.fn()} onVoltarParaEntrada={vi.fn()} />,
    );

    expect(screen.getByText("Todas as revisões foram concluídas.")).toBeInTheDocument();
    expect(screen.getByText("Relatório pronto para geração.")).toBeInTheDocument();
  });

  it("'Gerar Relatório' está sempre desabilitado (geração XLSX não implementada nesta sprint)", () => {
    render(
      <PainelResumo resumo={RESUMO_SEM_PENDENCIAS} onRevisarCasos={vi.fn()} onVoltarParaEntrada={vi.fn()} />,
    );

    expect(screen.getByRole("button", { name: "Gerar Relatório" })).toBeDisabled();
    expect(screen.getByText("Em breve")).toBeInTheDocument();
  });

  it("nunca mostra o botão 'Revisar Casos' quando não há pendências", () => {
    render(
      <PainelResumo resumo={RESUMO_SEM_PENDENCIAS} onRevisarCasos={vi.fn()} onVoltarParaEntrada={vi.fn()} />,
    );

    expect(screen.queryByRole("button", { name: /^Revisar/ })).not.toBeInTheDocument();
  });
});

describe("PainelResumo — voltar", () => {
  it("clicar em 'Selecionar outra competência ou fontes' aciona onVoltarParaEntrada", async () => {
    const usuario = userEvent.setup();
    const onVoltarParaEntrada = vi.fn();
    render(
      <PainelResumo resumo={RESUMO_COM_PENDENCIAS} onRevisarCasos={vi.fn()} onVoltarParaEntrada={onVoltarParaEntrada} />,
    );

    await usuario.click(screen.getByRole("button", { name: "Selecionar outra competência ou fontes" }));

    expect(onVoltarParaEntrada).toHaveBeenCalledTimes(1);
  });
});
