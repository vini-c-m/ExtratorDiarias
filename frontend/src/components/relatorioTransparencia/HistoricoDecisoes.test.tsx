// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import HistoricoDecisoes from "./HistoricoDecisoes";
import type { RevisaoRelatorioTransparencia } from "../../types/relatorioTransparencia";

afterEach(() => {
  cleanup();
});

function revisao(sobrescritas: Partial<RevisaoRelatorioTransparencia>): RevisaoRelatorioTransparencia {
  return {
    identidade_grupo: "grupo-fake",
    regra: "RN07",
    estado: "pendente",
    explicacao: "explicação fictícia",
    campos_iguais: [],
    campos_diferentes: [],
    ocorrencias: [
      {
        ob: "2026OB000241",
        dh: "2026DH700001",
        beneficiario: "Maria F. Silva",
        sei: null,
        data_ob: null,
        periodo_inicial: null,
        periodo_final: null,
        trecho: null,
        valor: 1850,
        motivo: null,
        restituicao: null,
        identidade: "2026OB000241",
      },
    ],
    autor: null,
    decidido_em: null,
    observacao: null,
    obs_publicaveis: null,
    ...sobrescritas,
  };
}

describe("HistoricoDecisoes", () => {
  it("lista vazia: mostra mensagem, sem quebrar", () => {
    render(<HistoricoDecisoes revisoes={[]} />);
    expect(screen.getByText("Nenhuma revisão para esta competência.")).toBeInTheDocument();
  });

  it("revisão pendente: responsável e data aparecem como '—', nunca inventados", () => {
    render(<HistoricoDecisoes revisoes={[revisao({ estado: "pendente" })]} />);

    expect(screen.getByText("Pendente")).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(2); // responsável e decidido em
  });

  it("revisão decidida: mostra responsável, data formatada e OB(s) publicável(is)", () => {
    render(
      <HistoricoDecisoes
        revisoes={[
          revisao({
            estado: "decidida",
            autor: "servidor.teste",
            decidido_em: "2026-08-20T14:30:00Z",
            obs_publicaveis: ["2026OB000241"],
            observacao: "Só esta ocorrência é o pagamento real.",
          }),
        ]}
      />,
    );

    expect(screen.getByText("Decidida")).toBeInTheDocument();
    expect(screen.getByText("servidor.teste")).toBeInTheDocument();
    expect(screen.getByText("Só esta ocorrência é o pagamento real.")).toBeInTheDocument();
    // OB(s) e publicáveis aparecem em colunas separadas — a mesma string "2026OB000241" aparece 2x.
    expect(screen.getAllByText("2026OB000241")).toHaveLength(2);
  });

  it("decisão de publicar zero ocorrências mostra 'Não publicou nenhuma', nunca '—' (não é a mesma coisa que nunca ter decidido)", () => {
    render(
      <HistoricoDecisoes
        revisoes={[revisao({ estado: "decidida", autor: "servidor.teste", decidido_em: "2026-08-20T14:30:00Z", obs_publicaveis: [] })]}
      />,
    );

    expect(screen.getByText("Não publicou nenhuma")).toBeInTheDocument();
  });

  it("grupo RN04 com repetição física: OB(s) mostra o número uma única vez (deduplicado), mesmo com duas ocorrências", () => {
    render(
      <HistoricoDecisoes
        revisoes={[
          revisao({
            regra: "RN04",
            estado: "requer_nova_decisao",
            autor: "servidor.antigo",
            decidido_em: "2026-01-10T09:00:00Z",
            obs_publicaveis: ["2026OB000241"],
            ocorrencias: [
              { ...revisao({}).ocorrencias[0], identidade: "2026OB000241#0" },
              { ...revisao({}).ocorrencias[0], identidade: "2026OB000241#1" },
            ],
          }),
        ]}
      />,
    );

    // Uma no badge de Estado + uma no resumo da coluna Decisão.
    expect(screen.getAllByText("Requer nova decisão")).toHaveLength(2);
    const celulasOb = screen.getAllByText("2026OB000241");
    // Uma na coluna "OB(s)" (deduplicada) + uma no detalhe técnico da coluna Decisão.
    expect(celulasOb).toHaveLength(2);
  });

  it("HOMO-RT-03 — identidade com hash de conteúdo (grupo com repetição física) aparece truncada, nunca o hash de 64 caracteres inteiro", () => {
    const hashCompleto = "3f2a9c8b1d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a";
    render(
      <HistoricoDecisoes
        revisoes={[
          revisao({
            regra: "RN04",
            estado: "decidida",
            autor: "servidor.teste",
            decidido_em: "2026-08-20T14:30:00Z",
            obs_publicaveis: [`2026OB000241#${hashCompleto}`],
          }),
        ]}
      />,
    );

    expect(screen.queryByText(new RegExp(hashCompleto))).not.toBeInTheDocument();
    expect(screen.getByText(`2026OB000241#${hashCompleto.slice(0, 8)}…`)).toBeInTheDocument();
  });

  it("Micro-sprint 'Duplicatas idênticas' — publicar 1 de N idênticas mostra o resumo semântico, nunca o hash cru como informação principal", () => {
    const identidadeClasse = "2026OB000241#classe-x";
    render(
      <HistoricoDecisoes
        revisoes={[
          revisao({
            regra: "RN04",
            estado: "decidida",
            autor: "servidor.teste",
            decidido_em: "2026-08-20T14:30:00Z",
            obs_publicaveis: [identidadeClasse],
            ocorrencias: [
              { ...revisao({}).ocorrencias[0], identidade: identidadeClasse },
              { ...revisao({}).ocorrencias[0], identidade: identidadeClasse },
              { ...revisao({}).ocorrencias[0], identidade: identidadeClasse },
            ],
          }),
        ]}
      />,
    );

    expect(screen.getByText("Publicou 1 de 3 ocorrências idênticas")).toBeInTheDocument();
  });

  it("Micro-sprint 'Duplicatas idênticas' — publicar uma ocorrência específica (sem repetição física) usa o rótulo singular", () => {
    render(
      <HistoricoDecisoes
        revisoes={[
          revisao({
            estado: "decidida",
            autor: "servidor.teste",
            decidido_em: "2026-08-20T14:30:00Z",
            obs_publicaveis: ["2026OB000241"],
          }),
        ]}
      />,
    );

    expect(screen.getByText("Publicou 1 ocorrência específica")).toBeInTheDocument();
  });

  it("Micro-sprint 'Duplicatas idênticas' — Adiada aparece com rótulo próprio na coluna Decisão", () => {
    render(<HistoricoDecisoes revisoes={[revisao({ estado: "adiada", autor: "servidor.teste" })]} />);

    expect(screen.getAllByText("Adiada")).toHaveLength(2); // badge de Estado + resumo da coluna Decisão
  });
});

// Micro-correção "Histórico com seleção mista" — achado do Codex: o
// resumo antigo tinha um `return` antecipado assim que encontrava QUALQUER
// identidade com multiplicidade > 1, escondendo qualquer outra identidade
// (classe idêntica adicional ou ocorrência específica) também publicada no
// mesmo grupo. Estes testes travam que o resumo SEMPRE comunica TODAS as
// identidades selecionadas, nunca só a primeira encontrada.
describe("HistoricoDecisoes — seleção mista (correção do return antecipado)", () => {
  function ocorrenciaComIdentidade(identidade: string) {
    return { ...revisao({}).ocorrencias[0], identidade };
  }

  const DUAS_IDENTICAS = [ocorrenciaComIdentidade("classe-A"), ocorrenciaComIdentidade("classe-A")];
  const CLASSE_MAIS_ESPECIFICA = [...DUAS_IDENTICAS, ocorrenciaComIdentidade("especifica-B")];
  const CLASSE_MAIS_DUAS_ESPECIFICAS = [
    ...CLASSE_MAIS_ESPECIFICA,
    ocorrenciaComIdentidade("especifica-C"),
  ];

  it("[A,A] selecionando A: 'Publicou 1 de 2 ocorrências idênticas'", () => {
    render(
      <HistoricoDecisoes
        revisoes={[
          revisao({ estado: "decidida", ocorrencias: DUAS_IDENTICAS, obs_publicaveis: ["classe-A"] }),
        ]}
      />,
    );
    expect(screen.getByText("Publicou 1 de 2 ocorrências idênticas")).toBeInTheDocument();
  });

  it("[A,A] selecionando nenhuma: 'Não publicou nenhuma'", () => {
    render(
      <HistoricoDecisoes
        revisoes={[revisao({ estado: "decidida", ocorrencias: DUAS_IDENTICAS, obs_publicaveis: [] })]}
      />,
    );
    expect(screen.getByText("Não publicou nenhuma")).toBeInTheDocument();
  });

  it("[A,A,B] selecionando somente A: 'Publicou 1 de 2 ocorrências idênticas'", () => {
    render(
      <HistoricoDecisoes
        revisoes={[
          revisao({
            estado: "decidida",
            ocorrencias: CLASSE_MAIS_ESPECIFICA,
            obs_publicaveis: ["classe-A"],
          }),
        ]}
      />,
    );
    expect(screen.getByText("Publicou 1 de 2 ocorrências idênticas")).toBeInTheDocument();
  });

  it("[A,A,B] selecionando somente B: 'Publicou 1 ocorrência específica'", () => {
    render(
      <HistoricoDecisoes
        revisoes={[
          revisao({
            estado: "decidida",
            ocorrencias: CLASSE_MAIS_ESPECIFICA,
            obs_publicaveis: ["especifica-B"],
          }),
        ]}
      />,
    );
    expect(screen.getByText("Publicou 1 ocorrência específica")).toBeInTheDocument();
  });

  it("[A,A,B] selecionando A+B: o resumo comunica AMBAS as partes, nunca só a classe idêntica", () => {
    render(
      <HistoricoDecisoes
        revisoes={[
          revisao({
            estado: "decidida",
            ocorrencias: CLASSE_MAIS_ESPECIFICA,
            obs_publicaveis: ["classe-A", "especifica-B"],
          }),
        ]}
      />,
    );
    expect(
      screen.getByText("Publicou 1 de 2 ocorrências idênticas + 1 ocorrência específica"),
    ).toBeInTheDocument();
    // nunca o bug reportado: a frase da classe idêntica sozinha, omitindo B
    expect(screen.queryByText("Publicou 1 de 2 ocorrências idênticas")).not.toBeInTheDocument();
  });

  it("[A,A,B,C] selecionando A+B+C: comunica a classe idêntica E as duas ocorrências específicas", () => {
    render(
      <HistoricoDecisoes
        revisoes={[
          revisao({
            estado: "decidida",
            ocorrencias: CLASSE_MAIS_DUAS_ESPECIFICAS,
            obs_publicaveis: ["classe-A", "especifica-B", "especifica-C"],
          }),
        ]}
      />,
    );
    expect(
      screen.getByText("Publicou 1 de 2 ocorrências idênticas + 2 ocorrências específicas"),
    ).toBeInTheDocument();
  });

  it("decisão Adiada: resumo mostra 'Adiada', nunca uma composição de publicáveis", () => {
    render(
      <HistoricoDecisoes
        revisoes={[revisao({ estado: "adiada", ocorrencias: CLASSE_MAIS_ESPECIFICA, autor: "servidor.teste" })]}
      />,
    );
    expect(screen.getAllByText("Adiada")).toHaveLength(2);
  });

  it("REQUER_NOVA_DECISAO: resumo mostra 'Requer nova decisão', nunca uma composição de publicáveis", () => {
    render(
      <HistoricoDecisoes
        revisoes={[
          revisao({
            estado: "requer_nova_decisao",
            ocorrencias: CLASSE_MAIS_ESPECIFICA,
            obs_publicaveis: ["classe-A"],
            autor: "servidor.antigo",
          }),
        ]}
      />,
    );
    expect(screen.getAllByText("Requer nova decisão")).toHaveLength(2);
  });

  it("DESATUALIZADA: resumo mostra 'Desatualizada', nunca uma composição de publicáveis", () => {
    render(
      <HistoricoDecisoes
        revisoes={[
          revisao({
            estado: "desatualizada",
            ocorrencias: CLASSE_MAIS_ESPECIFICA,
            obs_publicaveis: ["classe-A"],
            autor: "servidor.teste",
          }),
        ]}
      />,
    );
    expect(screen.getAllByText("Desatualizada")).toHaveLength(2);
  });
});
