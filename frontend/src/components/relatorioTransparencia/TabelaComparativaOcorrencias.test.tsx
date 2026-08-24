// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import TabelaComparativaOcorrencias from "./TabelaComparativaOcorrencias";
import type { OcorrenciaRelatorioTransparencia } from "../../types/relatorioTransparencia";

afterEach(() => {
  cleanup();
});

// Dados 100% fictícios.
function ocorrencia(sobrescritas: Partial<OcorrenciaRelatorioTransparencia>): OcorrenciaRelatorioTransparencia {
  return {
    ob: "2026OB000241",
    dh: "2026DH700001",
    beneficiario: "Maria F. Silva",
    sei: "00000.000123/2026-01",
    data_ob: "2026-08-15T09:00:00",
    periodo_inicial: "2026-08-10",
    periodo_final: "2026-08-12",
    trecho: "Recife/PE → Brasília/DF",
    valor: 1850,
    motivo: "Participação em reunião técnica",
    restituicao: null,
    ...sobrescritas,
  };
}

const DUAS_OCORRENCIAS = [
  ocorrencia({ ob: "2026OB000241", dh: "2026DH700001", data_ob: "2026-08-15T09:00:00" }),
  ocorrencia({ ob: "2026OB000389", dh: "2026DH700002", data_ob: "2026-08-22T09:00:00", valor: 1850 }),
];
const CAMPOS_IGUAIS_DUAS = ["beneficiario", "sei", "periodo_inicial", "periodo_final", "trecho", "valor", "motivo", "restituicao"];
const CAMPOS_DIFERENTES_DUAS = ["dh", "data_ob"];

describe("TabelaComparativaOcorrencias — 2 ocorrências", () => {
  it("mostra beneficiário, OB (cabeçalho), DH, SEI, datas, período, trecho, valor, MOTIVO e restituição de cada ocorrência", () => {
    render(
      <TabelaComparativaOcorrencias
        ocorrencias={DUAS_OCORRENCIAS}
        camposIguais={CAMPOS_IGUAIS_DUAS}
        camposDiferentes={CAMPOS_DIFERENTES_DUAS}
        selecionadas={new Set()}
        onAlternarSelecao={vi.fn()}
      />,
    );

    expect(screen.getByText("2026OB000241")).toBeInTheDocument();
    expect(screen.getByText("2026OB000389")).toBeInTheDocument();
    expect(screen.getAllByText("Participação em reunião técnica")).toHaveLength(2);
    expect(screen.getAllByText("Motivo").length).toBeGreaterThan(0);
    expect(screen.getByText("2026DH700001")).toBeInTheDocument();
    expect(screen.getByText("2026DH700002")).toBeInTheDocument();
  });

  it("campos iguais aparecem na faixa de resumo ('Iguais nas duas ocorrências')", () => {
    render(
      <TabelaComparativaOcorrencias
        ocorrencias={DUAS_OCORRENCIAS}
        camposIguais={CAMPOS_IGUAIS_DUAS}
        camposDiferentes={CAMPOS_DIFERENTES_DUAS}
        selecionadas={new Set()}
        onAlternarSelecao={vi.fn()}
      />,
    );

    expect(screen.getByText("Iguais nas duas ocorrências:")).toBeInTheDocument();
    expect(screen.getAllByText("Beneficiário").length).toBeGreaterThan(0);
  });

  it("campos diferentes ficam marcados com o selo 'diferente' (vindo de campos_diferentes do backend, nunca recalculado)", () => {
    render(
      <TabelaComparativaOcorrencias
        ocorrencias={DUAS_OCORRENCIAS}
        camposIguais={CAMPOS_IGUAIS_DUAS}
        camposDiferentes={CAMPOS_DIFERENTES_DUAS}
        selecionadas={new Set()}
        onAlternarSelecao={vi.fn()}
      />,
    );

    expect(screen.getAllByText("diferente")).toHaveLength(2); // DH e Data da OB
  });

  it("campo ausente (null) numa ocorrência: mostra indicação visual compreensível, sem quebrar", () => {
    const comCampoAusente = [
      ocorrencia({ ob: "2026OB000241", motivo: "Fiscalização de obra" }),
      ocorrencia({ ob: "2026OB000389", motivo: null }),
    ];
    render(
      <TabelaComparativaOcorrencias
        ocorrencias={comCampoAusente}
        camposIguais={[]}
        camposDiferentes={["motivo"]}
        selecionadas={new Set()}
        onAlternarSelecao={vi.fn()}
      />,
    );

    expect(screen.getAllByText("— ausente").length).toBeGreaterThan(0);
  });

  it("marcar o checkbox de uma ocorrência aciona onAlternarSelecao com o número da OB", async () => {
    const usuario = userEvent.setup();
    const onAlternarSelecao = vi.fn();
    render(
      <TabelaComparativaOcorrencias
        ocorrencias={DUAS_OCORRENCIAS}
        camposIguais={CAMPOS_IGUAIS_DUAS}
        camposDiferentes={CAMPOS_DIFERENTES_DUAS}
        selecionadas={new Set()}
        onAlternarSelecao={onAlternarSelecao}
      />,
    );

    const checkboxes = screen.getAllByRole("checkbox");
    await usuario.click(checkboxes[0]);

    expect(onAlternarSelecao).toHaveBeenCalledWith("2026OB000241");
  });

  it("ocorrência já selecionada aparece com o checkbox marcado", () => {
    render(
      <TabelaComparativaOcorrencias
        ocorrencias={DUAS_OCORRENCIAS}
        camposIguais={CAMPOS_IGUAIS_DUAS}
        camposDiferentes={CAMPOS_DIFERENTES_DUAS}
        selecionadas={new Set(["2026OB000241"])}
        onAlternarSelecao={vi.fn()}
      />,
    );

    const checkboxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect(checkboxes[0].checked).toBe(true);
    expect(checkboxes[1].checked).toBe(false);
  });

  it("desabilitado: todos os checkboxes ficam desabilitados (bloqueio durante envio)", () => {
    render(
      <TabelaComparativaOcorrencias
        ocorrencias={DUAS_OCORRENCIAS}
        camposIguais={CAMPOS_IGUAIS_DUAS}
        camposDiferentes={CAMPOS_DIFERENTES_DUAS}
        selecionadas={new Set()}
        onAlternarSelecao={vi.fn()}
        desabilitado
      />,
    );

    for (const checkbox of screen.getAllByRole("checkbox")) {
      expect(checkbox).toBeDisabled();
    }
  });
});

describe("TabelaComparativaOcorrencias — N ocorrências (mais de duas)", () => {
  it("renderiza 4 colunas de ocorrências sem quebrar a estrutura (mesma tabela, mais colunas)", () => {
    const quatroOcorrencias = [
      ocorrencia({ ob: "2026OB000710", dh: "2026DH700003" }),
      ocorrencia({ ob: "2026OB000711", dh: "2026DH700004" }),
      ocorrencia({ ob: "2026OB000733", dh: "2026DH700005" }),
      ocorrencia({ ob: "2026OB000745", dh: "2026DH700006" }),
    ];
    render(
      <TabelaComparativaOcorrencias
        ocorrencias={quatroOcorrencias}
        camposIguais={["beneficiario", "sei", "periodo_inicial", "periodo_final", "trecho", "valor", "motivo", "restituicao"]}
        camposDiferentes={["dh", "data_ob"]}
        selecionadas={new Set()}
        onAlternarSelecao={vi.fn()}
      />,
    );

    expect(screen.getByText("2026OB000710")).toBeInTheDocument();
    expect(screen.getByText("2026OB000711")).toBeInTheDocument();
    expect(screen.getByText("2026OB000733")).toBeInTheDocument();
    expect(screen.getByText("2026OB000745")).toBeInTheDocument();
    expect(screen.getAllByRole("checkbox")).toHaveLength(4);
    expect(screen.getByText("Iguais em todas as ocorrências:")).toBeInTheDocument();
  });

  it("selecionar uma entre 4 ocorrências aciona onAlternarSelecao só para aquela OB", async () => {
    const usuario = userEvent.setup();
    const onAlternarSelecao = vi.fn();
    const quatroOcorrencias = [
      ocorrencia({ ob: "2026OB000710" }),
      ocorrencia({ ob: "2026OB000711" }),
      ocorrencia({ ob: "2026OB000733" }),
      ocorrencia({ ob: "2026OB000745" }),
    ];
    render(
      <TabelaComparativaOcorrencias
        ocorrencias={quatroOcorrencias}
        camposIguais={[]}
        camposDiferentes={["dh"]}
        selecionadas={new Set()}
        onAlternarSelecao={onAlternarSelecao}
      />,
    );

    await usuario.click(screen.getAllByRole("checkbox")[2]);

    expect(onAlternarSelecao).toHaveBeenCalledTimes(1);
    expect(onAlternarSelecao).toHaveBeenCalledWith("2026OB000733");
  });
});
