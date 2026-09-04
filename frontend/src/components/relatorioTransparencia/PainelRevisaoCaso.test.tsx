// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import PainelRevisaoCaso from "./PainelRevisaoCaso";
import type { RevisaoRelatorioTransparencia } from "../../types/relatorioTransparencia";

afterEach(() => {
  cleanup();
});

const REVISAO_PENDENTE: RevisaoRelatorioTransparencia = {
  identidade_grupo: "grupo-fake-1",
  regra: "RN07",
  estado: "pendente",
  explicacao:
    "Dois pagamentos foram registrados para o mesmo servidor, no mesmo período, com o mesmo valor e o mesmo trecho — possível pagamento em duplicidade.",
  campos_iguais: ["beneficiario", "sei", "periodo_inicial", "periodo_final", "trecho", "valor", "motivo", "restituicao"],
  campos_diferentes: ["dh", "data_ob"],
  ocorrencias: [
    {
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
      identidade: "2026OB000241",
    },
    {
      ob: "2026OB000389",
      dh: "2026DH700002",
      beneficiario: "Maria F. Silva",
      sei: "00000.000123/2026-01",
      data_ob: "2026-08-22T09:00:00",
      periodo_inicial: "2026-08-10",
      periodo_final: "2026-08-12",
      trecho: "Recife/PE → Brasília/DF",
      valor: 1850,
      motivo: "Participação em reunião técnica",
      restituicao: null,
      identidade: "2026OB000389",
    },
  ],
  autor: null,
  decidido_em: null,
  observacao: null,
  obs_publicaveis: null,
  reaplicada_de_execucao_anterior: false,
};

const REVISAO_DESATUALIZADA: RevisaoRelatorioTransparencia = {
  ...REVISAO_PENDENTE,
  identidade_grupo: "grupo-fake-2",
  estado: "desatualizada",
};

const REVISAO_REQUER_NOVA_DECISAO: RevisaoRelatorioTransparencia = {
  ...REVISAO_PENDENTE,
  identidade_grupo: "grupo-fake-3",
  estado: "requer_nova_decisao",
  autor: "servidor.antigo",
  decidido_em: "2026-01-10T09:00:00Z",
  obs_publicaveis: ["2026OB000241"],
};

function propsBase(sobrescritas: Partial<ComponentProps<typeof PainelRevisaoCaso>> = {}) {
  return {
    revisao: REVISAO_PENDENTE,
    indiceAtual: 1,
    totalCasos: 8,
    enviando: false,
    erro: null,
    onConfirmarDecisao: vi.fn(),
    onAdiar: vi.fn(),
    ...sobrescritas,
  };
}

describe("PainelRevisaoCaso", () => {
  it("mostra 'Caso X de N' e a explicação humana vinda do backend", () => {
    render(<PainelRevisaoCaso {...propsBase()} />);

    expect(screen.getByText("Caso 1 de 8")).toBeInTheDocument();
    expect(screen.getByText(REVISAO_PENDENTE.explicacao)).toBeInTheDocument();
  });

  it("nunca usa RN07/RN04 como linguagem principal — a pergunta é sempre a mesma frase humana", () => {
    render(<PainelRevisaoCaso {...propsBase()} />);

    expect(screen.getByText("Quais pagamentos devem constar no relatório?")).toBeInTheDocument();
  });

  it("caso pendente: mostra o selo 'Requer decisão humana', nunca o banner de dados desatualizados", () => {
    render(<PainelRevisaoCaso {...propsBase()} />);

    expect(screen.getByText("Requer decisão humana")).toBeInTheDocument();
    expect(screen.queryByText("Os dados deste caso mudaram desde a última análise.")).not.toBeInTheDocument();
  });

  it("caso desatualizado: mostra o banner sem mencionar fingerprint/hash", () => {
    render(<PainelRevisaoCaso {...propsBase({ revisao: REVISAO_DESATUALIZADA })} />);

    expect(screen.getByText("Decisão desatualizada")).toBeInTheDocument();
    expect(screen.getByText("Os dados deste caso mudaram desde a última análise.")).toBeInTheDocument();
    expect(screen.getByText("Revise novamente antes de gerar o relatório.")).toBeInTheDocument();
    expect(screen.queryByText(/fingerprint/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/hash/i)).not.toBeInTheDocument();
  });

  it("caso 'requer nova decisão' (HOMO-RT-02, migração): mostra selo e explicação próprios, sem mencionar fingerprint/hash", () => {
    render(<PainelRevisaoCaso {...propsBase({ revisao: REVISAO_REQUER_NOVA_DECISAO })} />);

    expect(screen.getByText("Decisão anterior ambígua")).toBeInTheDocument();
    expect(
      screen.getByText(/duas ocorrências físicas da mesma OB e uma decisão anterior/),
    ).toBeInTheDocument();
    expect(screen.queryByText("Os dados deste caso mudaram desde a última análise.")).not.toBeInTheDocument();
    expect(screen.queryByText(/fingerprint/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/hash/i)).not.toBeInTheDocument();
  });

  it("selecionar uma OB e confirmar chama onConfirmarDecisao só com aquela OB", async () => {
    const usuario = userEvent.setup();
    const onConfirmarDecisao = vi.fn();
    render(<PainelRevisaoCaso {...propsBase({ onConfirmarDecisao })} />);

    await usuario.click(screen.getAllByRole("checkbox")[0]);
    await usuario.click(screen.getByRole("button", { name: "Confirmar Decisão" }));

    expect(onConfirmarDecisao).toHaveBeenCalledWith(["2026OB000241"]);
  });

  it("selecionar as duas OBs e confirmar chama onConfirmarDecisao com as duas", async () => {
    const usuario = userEvent.setup();
    const onConfirmarDecisao = vi.fn();
    render(<PainelRevisaoCaso {...propsBase({ onConfirmarDecisao })} />);

    const checkboxes = screen.getAllByRole("checkbox");
    await usuario.click(checkboxes[0]);
    await usuario.click(checkboxes[1]);
    await usuario.click(screen.getByRole("button", { name: "Confirmar Decisão" }));

    expect(onConfirmarDecisao).toHaveBeenCalledWith(["2026OB000241", "2026OB000389"]);
  });

  it("selecionar uma ou várias OBs nunca exige justificativa — nenhum diálogo aparece", async () => {
    const usuario = userEvent.setup();
    render(<PainelRevisaoCaso {...propsBase()} />);

    await usuario.click(screen.getAllByRole("checkbox")[0]);
    await usuario.click(screen.getByRole("button", { name: "Confirmar Decisão" }));

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Justificativa (obrigatória)")).not.toBeInTheDocument();
  });

  it("confirmar sem nenhuma OB selecionada abre o diálogo de confirmação, sem chamar onConfirmarDecisao ainda", async () => {
    const usuario = userEvent.setup();
    const onConfirmarDecisao = vi.fn();
    render(<PainelRevisaoCaso {...propsBase({ onConfirmarDecisao })} />);

    await usuario.click(screen.getByRole("button", { name: "Confirmar Decisão" }));

    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(screen.getByText(/Nenhum destes pagamentos será incluído/)).toBeInTheDocument();
    expect(onConfirmarDecisao).not.toHaveBeenCalled();
  });

  it("diálogo de seleção vazia pede justificativa, só aparece nesse fluxo excepcional", async () => {
    const usuario = userEvent.setup();
    render(<PainelRevisaoCaso {...propsBase()} />);

    expect(screen.queryByLabelText("Justificativa (obrigatória)")).not.toBeInTheDocument();

    await usuario.click(screen.getByRole("button", { name: "Confirmar Decisão" }));

    expect(screen.getByLabelText("Justificativa (obrigatória)")).toBeInTheDocument();
  });

  it("justificativa vazia: botão de confirmar do diálogo fica desabilitado, nunca envia", async () => {
    const usuario = userEvent.setup();
    const onConfirmarDecisao = vi.fn();
    render(<PainelRevisaoCaso {...propsBase({ onConfirmarDecisao })} />);

    await usuario.click(screen.getByRole("button", { name: "Confirmar Decisão" }));

    expect(screen.getByRole("button", { name: "Confirmar decisão" })).toBeDisabled();

    // Só espaços também não conta como justificativa válida.
    await usuario.type(screen.getByLabelText("Justificativa (obrigatória)"), "   ");
    expect(screen.getByRole("button", { name: "Confirmar decisão" })).toBeDisabled();
    expect(onConfirmarDecisao).not.toHaveBeenCalled();
  });

  it("justificativa válida: confirmar o diálogo chama onConfirmarDecisao com lista vazia e a justificativa (via observacao)", async () => {
    const usuario = userEvent.setup();
    const onConfirmarDecisao = vi.fn();
    render(<PainelRevisaoCaso {...propsBase({ onConfirmarDecisao })} />);

    await usuario.click(screen.getByRole("button", { name: "Confirmar Decisão" }));
    await usuario.type(
      screen.getByLabelText("Justificativa (obrigatória)"),
      "Ambas as OBs suspeitas, excluídas até apuração interna.",
    );
    expect(screen.getByRole("button", { name: "Confirmar decisão" })).toBeEnabled();
    await usuario.click(screen.getByRole("button", { name: "Confirmar decisão" }));

    expect(onConfirmarDecisao).toHaveBeenCalledWith(
      [],
      "Ambas as OBs suspeitas, excluídas até apuração interna.",
    );
  });

  it("cancelar o diálogo de seleção vazia não chama onConfirmarDecisao e fecha o diálogo", async () => {
    const usuario = userEvent.setup();
    const onConfirmarDecisao = vi.fn();
    render(<PainelRevisaoCaso {...propsBase({ onConfirmarDecisao })} />);

    await usuario.click(screen.getByRole("button", { name: "Confirmar Decisão" }));
    await usuario.click(screen.getByRole("button", { name: "Revisar seleção" }));

    expect(onConfirmarDecisao).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("Adiar Análise nunca abre modal — aciona onAdiar direto, com o texto explicativo sempre visível", async () => {
    const usuario = userEvent.setup();
    const onAdiar = vi.fn();
    render(<PainelRevisaoCaso {...propsBase({ onAdiar })} />);

    expect(
      screen.getByText(/o relatório não poderá ser gerado enquanto ele não for resolvido/),
    ).toBeInTheDocument();

    await usuario.click(screen.getByRole("button", { name: /Adiar Análise/ }));

    expect(onAdiar).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("enviando: os dois botões de decisão ficam desabilitados (bloqueio de duplo envio)", () => {
    render(<PainelRevisaoCaso {...propsBase({ enviando: true })} />);

    expect(screen.getByRole("button", { name: "Confirmar Decisão" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Adiar Análise/ })).toBeDisabled();
  });

  it("erro: mostra a mensagem recebida", () => {
    render(<PainelRevisaoCaso {...propsBase({ erro: "Não foi possível registrar a decisão." })} />);

    expect(screen.getByText("Não foi possível registrar a decisão.")).toBeInTheDocument();
  });
});
