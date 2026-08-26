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
  const ob = sobrescritas.ob ?? "2026OB000241";
  return {
    ob,
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
    // HOMO-RT-02 — por padrão igual a `ob` (caso sem repetição física, a
    // grande maioria dos testes deste arquivo); testes específicos de
    // repetição física (mesma `ob`, `identidade` distinta) sobrescrevem
    // este campo explicitamente.
    identidade: ob,
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

  it("marcar o checkbox de uma ocorrência aciona onAlternarSelecao com a identidade da ocorrência", async () => {
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

// HOMO-RT-02 — RN04 por repetição física (I11): duas ocorrências FÍSICAS
// com a MESMA OB. Antes da correção, `ocorrencia.ob` era usado como React
// key e como chave de seleção — para este grupo as duas colunas ficavam
// estruturalmente idênticas (mesma key, mesmo `selecionadas.has(ob)`),
// acoplando os dois checkboxes. Estes testes travam que isso não volte:
// `identidade` (nunca `ob`) tem que decidir tudo.
describe("TabelaComparativaOcorrencias — RN04 (mesma OB, duas ocorrências físicas)", () => {
  const OCORRENCIA_A = ocorrencia({ ob: "2026OB000001", identidade: "2026OB000001#0", motivo: "Motivo A" });
  const OCORRENCIA_B = ocorrencia({ ob: "2026OB000001", identidade: "2026OB000001#1", motivo: "Motivo B" });
  const DUAS_FISICAS = [OCORRENCIA_A, OCORRENCIA_B];

  it("marcar só a ocorrência A aciona onAlternarSelecao com a identidade de A, nunca a OB pura", async () => {
    const usuario = userEvent.setup();
    const onAlternarSelecao = vi.fn();
    render(
      <TabelaComparativaOcorrencias
        ocorrencias={DUAS_FISICAS}
        camposIguais={[]}
        camposDiferentes={["motivo"]}
        selecionadas={new Set()}
        onAlternarSelecao={onAlternarSelecao}
      />,
    );

    await usuario.click(screen.getAllByRole("checkbox")[0]);

    expect(onAlternarSelecao).toHaveBeenCalledTimes(1);
    expect(onAlternarSelecao).toHaveBeenCalledWith("2026OB000001#0");
  });

  it("marcar só a ocorrência B aciona onAlternarSelecao com a identidade de B", async () => {
    const usuario = userEvent.setup();
    const onAlternarSelecao = vi.fn();
    render(
      <TabelaComparativaOcorrencias
        ocorrencias={DUAS_FISICAS}
        camposIguais={[]}
        camposDiferentes={["motivo"]}
        selecionadas={new Set()}
        onAlternarSelecao={onAlternarSelecao}
      />,
    );

    await usuario.click(screen.getAllByRole("checkbox")[1]);

    expect(onAlternarSelecao).toHaveBeenCalledTimes(1);
    expect(onAlternarSelecao).toHaveBeenCalledWith("2026OB000001#1");
  });

  it("selecionar A não marca o checkbox de B — os dois são independentes", () => {
    render(
      <TabelaComparativaOcorrencias
        ocorrencias={DUAS_FISICAS}
        camposIguais={[]}
        camposDiferentes={["motivo"]}
        selecionadas={new Set(["2026OB000001#0"])}
        onAlternarSelecao={vi.fn()}
      />,
    );

    const checkboxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect(checkboxes[0].checked).toBe(true);
    expect(checkboxes[1].checked).toBe(false);
  });

  it("selecionar as duas identidades marca os dois checkboxes ao mesmo tempo", () => {
    render(
      <TabelaComparativaOcorrencias
        ocorrencias={DUAS_FISICAS}
        camposIguais={[]}
        camposDiferentes={["motivo"]}
        selecionadas={new Set(["2026OB000001#0", "2026OB000001#1"])}
        onAlternarSelecao={vi.fn()}
      />,
    );

    const checkboxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect(checkboxes[0].checked).toBe(true);
    expect(checkboxes[1].checked).toBe(true);
  });

  it("nenhuma selecionada: os dois checkboxes ficam desmarcados (nenhuma decisão implícita)", () => {
    render(
      <TabelaComparativaOcorrencias
        ocorrencias={DUAS_FISICAS}
        camposIguais={[]}
        camposDiferentes={["motivo"]}
        selecionadas={new Set()}
        onAlternarSelecao={vi.fn()}
      />,
    );

    const checkboxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect(checkboxes[0].checked).toBe(false);
    expect(checkboxes[1].checked).toBe(false);
  });

  it("cada coluna tem sua própria célula de valor — React não confunde as duas por terem a mesma OB", () => {
    render(
      <TabelaComparativaOcorrencias
        ocorrencias={DUAS_FISICAS}
        camposIguais={[]}
        camposDiferentes={["motivo"]}
        selecionadas={new Set()}
        onAlternarSelecao={vi.fn()}
      />,
    );

    expect(screen.getByText("Motivo A")).toBeInTheDocument();
    expect(screen.getByText("Motivo B")).toBeInTheDocument();
  });
});

// Micro-sprint "Duplicatas idênticas" — duas ou mais ocorrências com a
// MESMA `identidade` (o backend já as trata como uma única classe
// materialmente idêntica — HOMO-RT-04) precisam virar UMA coluna com UM
// checkbox, nunca duas colunas com dois checkboxes que por baixo sempre
// leem/escrevem a mesma seleção (a falsa independência reportada no
// confronto anterior).
describe("TabelaComparativaOcorrencias — duplicatas idênticas (mesma identidade)", () => {
  const OCORRENCIA_IDENTICA_1 = ocorrencia({ ob: "2026OB000001", identidade: "2026OB000001#classe-x" });
  const OCORRENCIA_IDENTICA_2 = ocorrencia({ ob: "2026OB000001", identidade: "2026OB000001#classe-x" });
  const DUAS_IDENTICAS = [OCORRENCIA_IDENTICA_1, OCORRENCIA_IDENTICA_2];

  it("renderiza uma única coluna e um único checkbox para duas ocorrências com a mesma identidade", () => {
    render(
      <TabelaComparativaOcorrencias
        ocorrencias={DUAS_IDENTICAS}
        camposIguais={["beneficiario"]}
        camposDiferentes={[]}
        selecionadas={new Set()}
        onAlternarSelecao={vi.fn()}
      />,
    );

    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
    expect(screen.getAllByText("2026OB000001")).toHaveLength(1);
  });

  it("mostra o aviso de multiplicidade ('N ocorrências físicas idênticas')", () => {
    render(
      <TabelaComparativaOcorrencias
        ocorrencias={DUAS_IDENTICAS}
        camposIguais={["beneficiario"]}
        camposDiferentes={[]}
        selecionadas={new Set()}
        onAlternarSelecao={vi.fn()}
      />,
    );

    expect(screen.getByText("2 ocorrências físicas idênticas")).toBeInTheDocument();
    expect(screen.getByText("Selecionar publica só 1 destas ocorrências")).toBeInTheDocument();
  });

  it("marcar o único checkbox aciona onAlternarSelecao com a identidade da classe", async () => {
    const usuario = userEvent.setup();
    const onAlternarSelecao = vi.fn();
    render(
      <TabelaComparativaOcorrencias
        ocorrencias={DUAS_IDENTICAS}
        camposIguais={["beneficiario"]}
        camposDiferentes={[]}
        selecionadas={new Set()}
        onAlternarSelecao={onAlternarSelecao}
      />,
    );

    await usuario.click(screen.getByRole("checkbox"));

    expect(onAlternarSelecao).toHaveBeenCalledTimes(1);
    expect(onAlternarSelecao).toHaveBeenCalledWith("2026OB000001#classe-x");
  });

  it("três ocorrências idênticas também viram uma única coluna, com a contagem certa", () => {
    const tresIdenticas = [
      ocorrencia({ ob: "2026OB000001", identidade: "2026OB000001#classe-x" }),
      ocorrencia({ ob: "2026OB000001", identidade: "2026OB000001#classe-x" }),
      ocorrencia({ ob: "2026OB000001", identidade: "2026OB000001#classe-x" }),
    ];
    render(
      <TabelaComparativaOcorrencias
        ocorrencias={tresIdenticas}
        camposIguais={["beneficiario"]}
        camposDiferentes={[]}
        selecionadas={new Set()}
        onAlternarSelecao={vi.fn()}
      />,
    );

    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
    expect(screen.getByText("3 ocorrências físicas idênticas")).toBeInTheDocument();
  });

  it("grupo misto (classe idêntica + ocorrência divergente) renderiza 2 colunas, não 3", () => {
    const grupoMisto = [
      ocorrencia({ ob: "2026OB000001", identidade: "2026OB000001#classe-x", motivo: "Motivo X" }),
      ocorrencia({ ob: "2026OB000001", identidade: "2026OB000001#classe-x", motivo: "Motivo X" }),
      ocorrencia({ ob: "2026OB000001", identidade: "2026OB000001#classe-y", motivo: "Motivo Y" }),
    ];
    render(
      <TabelaComparativaOcorrencias
        ocorrencias={grupoMisto}
        camposIguais={[]}
        camposDiferentes={["motivo"]}
        selecionadas={new Set()}
        onAlternarSelecao={vi.fn()}
      />,
    );

    expect(screen.getAllByRole("checkbox")).toHaveLength(2); // classe X (1 checkbox) + Y (1 checkbox), nunca 3
    expect(screen.getByText("2 ocorrências físicas idênticas")).toBeInTheDocument();
    expect(screen.getByText("Motivo X")).toBeInTheDocument();
    expect(screen.getByText("Motivo Y")).toBeInTheDocument();
  });

  it("ocorrência única (sem repetição física) NUNCA mostra o aviso de multiplicidade", () => {
    render(
      <TabelaComparativaOcorrencias
        ocorrencias={DUAS_OCORRENCIAS}
        camposIguais={CAMPOS_IGUAIS_DUAS}
        camposDiferentes={CAMPOS_DIFERENTES_DUAS}
        selecionadas={new Set()}
        onAlternarSelecao={vi.fn()}
      />,
    );

    expect(screen.queryByText(/ocorrências físicas idênticas/)).not.toBeInTheDocument();
  });
});
