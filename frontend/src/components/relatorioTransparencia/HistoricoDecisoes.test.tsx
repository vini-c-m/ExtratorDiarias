// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
    reaplicada_de_execucao_anterior: false,
    ...sobrescritas,
  };
}

// Micro-sprint UX operacional — homologação manual apontou que o histórico
// misturava decisões concluídas (DECIDIDA/ADIADA) com pendências
// (PENDENTE/DESATUALIZADA/REQUER_NOVA_DECISAO) na mesma tabela, com o
// mesmo peso visual, e mostrava todo o detalhe da decisão direto na linha.
// Redesenhado em dois blocos ("Histórico de decisões" / "Pendências que
// exigem nova decisão"), com a linha só resumindo o essencial e um botão
// "Ver decisão" abrindo o detalhe completo. Estes testes cobrem o novo
// desenho; a lógica de `resumoDecisao` (inalterada) é testada através do
// conteúdo do painel de detalhe.
describe("HistoricoDecisoes", () => {
  it("lista vazia: mostra mensagem, sem quebrar", () => {
    render(<HistoricoDecisoes revisoes={[]} />);
    expect(screen.getByText("Nenhuma revisão para esta competência.")).toBeInTheDocument();
  });

  it("só revisão pendente: bloco de histórico aparece vazio (nunca com uma pendência disfarçada de decisão), pendência aparece no bloco separado", () => {
    render(<HistoricoDecisoes revisoes={[revisao({ estado: "pendente" })]} />);

    expect(screen.getByText("Histórico de decisões")).toBeInTheDocument();
    expect(screen.getByText("Nenhuma decisão concluída ainda nesta competência.")).toBeInTheDocument();

    expect(screen.getByText("Pendências que exigem nova decisão")).toBeInTheDocument();
    expect(screen.getByText("Pendente")).toBeInTheDocument();
  });

  it("revisão pendente nunca teve decisão: sem botão 'Ver decisão' (nada a mostrar)", () => {
    render(<HistoricoDecisoes revisoes={[revisao({ estado: "pendente" })]} />);
    expect(screen.queryByRole("button", { name: "Ver decisão" })).not.toBeInTheDocument();
  });

  it("revisão decidida aparece no bloco de histórico, com responsável e data — nunca no bloco de pendências", () => {
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
    expect(screen.queryByText("Pendências que exigem nova decisão")).not.toBeInTheDocument();
  });

  it("'Ver decisão' abre o detalhe com regra, OB(s), responsável, data/hora, observação e o que foi publicado", async () => {
    const usuario = userEvent.setup();
    render(
      <HistoricoDecisoes
        revisoes={[
          revisao({
            regra: "RN07",
            estado: "decidida",
            autor: "servidor.teste",
            decidido_em: "2026-08-20T14:30:00Z",
            obs_publicaveis: ["2026OB000241"],
            observacao: "Só esta ocorrência é o pagamento real.",
          }),
        ]}
      />,
    );

    await usuario.click(screen.getByRole("button", { name: "Ver decisão" }));

    const dialogo = screen.getByRole("dialog", { name: "Detalhe da decisão" });
    expect(dialogo).toBeInTheDocument();
    const { getByText, getAllByText } = within(dialogo);
    expect(getByText("Regra")).toBeInTheDocument();
    expect(getByText("RN07")).toBeInTheDocument();
    expect(getByText("servidor.teste")).toBeInTheDocument();
    expect(getByText("Só esta ocorrência é o pagamento real.")).toBeInTheDocument();
    expect(getByText("Publicou 1 ocorrência específica")).toBeInTheDocument();
    // OB(s) do grupo (detalhe) + identidade publicável (detalhe técnico) — mesma string, 2 lugares dentro do diálogo.
    expect(getAllByText("2026OB000241")).toHaveLength(2);
  });

  it("'Fechar' fecha o detalhe", async () => {
    const usuario = userEvent.setup();
    render(<HistoricoDecisoes revisoes={[revisao({ estado: "decidida", autor: "servidor.teste" })]} />);

    await usuario.click(screen.getByRole("button", { name: "Ver decisão" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await usuario.click(screen.getByRole("button", { name: "Fechar" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("decisão de publicar zero ocorrências: detalhe mostra 'Não publicou nenhuma', nunca '—' (não é a mesma coisa que nunca ter decidido)", async () => {
    const usuario = userEvent.setup();
    render(
      <HistoricoDecisoes
        revisoes={[revisao({ estado: "decidida", autor: "servidor.teste", decidido_em: "2026-08-20T14:30:00Z", obs_publicaveis: [] })]}
      />,
    );

    await usuario.click(screen.getByRole("button", { name: "Ver decisão" }));
    expect(screen.getByText("Não publicou nenhuma")).toBeInTheDocument();
  });

  it("grupo RN04 com repetição física: OB(s) mostra o número uma única vez (deduplicado) na linha resumida", () => {
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

    expect(screen.getByText("Requer nova decisão")).toBeInTheDocument();
    expect(screen.getByText("2026OB000241")).toBeInTheDocument();
  });

  it("REQUER_NOVA_DECISAO com decisão anterior registrada: aparece nas pendências, mas o 'Ver decisão' mostra o que foi publicado antes de ficar desatualizada", async () => {
    const usuario = userEvent.setup();
    render(
      <HistoricoDecisoes
        revisoes={[
          revisao({
            regra: "RN04",
            estado: "requer_nova_decisao",
            autor: "servidor.antigo",
            decidido_em: "2026-01-10T09:00:00Z",
            obs_publicaveis: ["2026OB000241"],
          }),
        ]}
      />,
    );

    expect(screen.getByText("Pendências que exigem nova decisão")).toBeInTheDocument();
    await usuario.click(screen.getByRole("button", { name: "Ver decisão" }));
    const dialogo = screen.getByRole("dialog", { name: "Detalhe da decisão" });
    expect(dialogo).toBeInTheDocument();
    expect(within(dialogo).getByText("servidor.antigo")).toBeInTheDocument();
  });

  it("HOMO-RT-03 — identidade com hash de conteúdo (grupo com repetição física) aparece truncada no detalhe, nunca o hash de 64 caracteres inteiro", async () => {
    const usuario = userEvent.setup();
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

    await usuario.click(screen.getByRole("button", { name: "Ver decisão" }));
    expect(screen.queryByText(new RegExp(hashCompleto))).not.toBeInTheDocument();
    expect(screen.getByText(`2026OB000241#${hashCompleto.slice(0, 8)}…`)).toBeInTheDocument();
  });

  it("Micro-sprint 'Duplicatas idênticas' — publicar 1 de N idênticas mostra o resumo semântico e o aviso de multiplicidade no detalhe", async () => {
    const usuario = userEvent.setup();
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

    await usuario.click(screen.getByRole("button", { name: "Ver decisão" }));
    expect(screen.getByText("Publicou 1 de 3 ocorrências idênticas")).toBeInTheDocument();
    expect(screen.getByText(/ocorrências fisicamente repetidas e idênticas/)).toBeInTheDocument();
  });

  it("Micro-sprint 'Duplicatas idênticas' — publicar uma ocorrência específica (sem repetição física) usa o rótulo singular, sem aviso de multiplicidade", async () => {
    const usuario = userEvent.setup();
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

    await usuario.click(screen.getByRole("button", { name: "Ver decisão" }));
    expect(screen.getByText("Publicou 1 ocorrência específica")).toBeInTheDocument();
    expect(screen.queryByText(/ocorrências fisicamente repetidas e idênticas/)).not.toBeInTheDocument();
  });

  it("Micro-sprint 'Duplicatas idênticas' — Adiada aparece no histórico (é uma decisão concluída), com rótulo próprio no detalhe", async () => {
    const usuario = userEvent.setup();
    render(<HistoricoDecisoes revisoes={[revisao({ estado: "adiada", autor: "servidor.teste" })]} />);

    expect(screen.getByText("Histórico de decisões")).toBeInTheDocument();
    expect(screen.queryByText("Pendências que exigem nova decisão")).not.toBeInTheDocument();
    expect(screen.getByText("Adiada")).toBeInTheDocument(); // badge da linha

    await usuario.click(screen.getByRole("button", { name: "Ver decisão" }));
    // badge do estado no cabeçalho do detalhe + resumo "O que foi publicado".
    expect(screen.getAllByText("Adiada").length).toBeGreaterThanOrEqual(2);
  });

  // Sprint D.1 (QA manual — "decisão anterior reaplicada invisível") — uma
  // decisão reaproveitada de uma competência/execução anterior (G06,
  // `reaplicada_de_execucao_anterior`) nunca pode aparecer como se tivesse
  // sido decidida agora mesmo: precisa de sinalização própria, tanto na
  // linha resumida quanto no detalhe completo.
  it("Sprint D.1 — decisão reaplicada de execução anterior ganha o badge 'Reaplicada' na linha, além do estado", () => {
    render(
      <HistoricoDecisoes
        revisoes={[
          revisao({
            estado: "decidida",
            autor: "servidor.julho",
            decidido_em: "2026-07-10T09:00:00Z",
            obs_publicaveis: ["2026OB000241"],
            reaplicada_de_execucao_anterior: true,
          }),
        ]}
      />,
    );

    expect(screen.getByText("Decidida")).toBeInTheDocument();
    expect(screen.getByText("Reaplicada")).toBeInTheDocument();
  });

  it("Sprint D.1 — decisão NÃO reaplicada (desta execução) nunca mostra o badge 'Reaplicada'", () => {
    render(
      <HistoricoDecisoes
        revisoes={[
          revisao({
            estado: "decidida",
            autor: "servidor.teste",
            obs_publicaveis: ["2026OB000241"],
            reaplicada_de_execucao_anterior: false,
          }),
        ]}
      />,
    );

    expect(screen.queryByText("Reaplicada")).not.toBeInTheDocument();
  });

  it("Sprint D.1 — detalhe de uma decisão reaplicada mostra o aviso e rotula responsável/data como 'original', preservando o autor/data REAIS (nunca falsificados)", async () => {
    const usuario = userEvent.setup();
    render(
      <HistoricoDecisoes
        revisoes={[
          revisao({
            estado: "decidida",
            autor: "servidor.julho",
            decidido_em: "2026-07-10T09:00:00Z",
            obs_publicaveis: ["2026OB000241"],
            reaplicada_de_execucao_anterior: true,
          }),
        ]}
      />,
    );

    await usuario.click(screen.getByRole("button", { name: "Ver decisão" }));
    const dialogo = screen.getByRole("dialog", { name: "Detalhe da decisão" });
    expect(within(dialogo).getByText("Decisão anterior reaplicada")).toBeInTheDocument();
    expect(within(dialogo).getByText("Responsável original")).toBeInTheDocument();
    expect(within(dialogo).getByText("Data/hora original")).toBeInTheDocument();
    // Autor/data continuam os REAIS da decisão original — nunca substituídos
    // por um valor genérico só porque foi reaplicada.
    expect(within(dialogo).getByText("servidor.julho")).toBeInTheDocument();
  });

  it("Sprint D.1 — detalhe de uma decisão NÃO reaplicada usa os rótulos normais 'Responsável'/'Data/hora', sem o aviso", async () => {
    const usuario = userEvent.setup();
    render(
      <HistoricoDecisoes
        revisoes={[
          revisao({
            estado: "decidida",
            autor: "servidor.teste",
            obs_publicaveis: ["2026OB000241"],
            reaplicada_de_execucao_anterior: false,
          }),
        ]}
      />,
    );

    await usuario.click(screen.getByRole("button", { name: "Ver decisão" }));
    const dialogo = screen.getByRole("dialog", { name: "Detalhe da decisão" });
    expect(within(dialogo).getByText("Responsável")).toBeInTheDocument();
    expect(within(dialogo).getByText("Data/hora")).toBeInTheDocument();
    expect(within(dialogo).queryByText("Decisão anterior reaplicada")).not.toBeInTheDocument();
  });
});

// Micro-correção "Histórico com seleção mista" — achado do Codex: o
// resumo antigo tinha um `return` antecipado assim que encontrava QUALQUER
// identidade com multiplicidade > 1, escondendo qualquer outra identidade
// (classe idêntica adicional ou ocorrência específica) também publicada no
// mesmo grupo. Estes testes travam que o resumo (agora dentro do painel de
// detalhe) SEMPRE comunica TODAS as identidades selecionadas, nunca só a
// primeira encontrada.
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

  async function abrirDetalhe() {
    const usuario = userEvent.setup();
    await usuario.click(screen.getByRole("button", { name: "Ver decisão" }));
  }

  it("[A,A] selecionando A: 'Publicou 1 de 2 ocorrências idênticas'", async () => {
    render(
      <HistoricoDecisoes
        revisoes={[
          revisao({ estado: "decidida", autor: "servidor.teste", ocorrencias: DUAS_IDENTICAS, obs_publicaveis: ["classe-A"] }),
        ]}
      />,
    );
    await abrirDetalhe();
    expect(screen.getByText("Publicou 1 de 2 ocorrências idênticas")).toBeInTheDocument();
  });

  it("[A,A] selecionando nenhuma: 'Não publicou nenhuma'", async () => {
    render(
      <HistoricoDecisoes
        revisoes={[
          revisao({ estado: "decidida", autor: "servidor.teste", ocorrencias: DUAS_IDENTICAS, obs_publicaveis: [] }),
        ]}
      />,
    );
    await abrirDetalhe();
    expect(screen.getByText("Não publicou nenhuma")).toBeInTheDocument();
  });

  it("[A,A,B] selecionando somente A: 'Publicou 1 de 2 ocorrências idênticas'", async () => {
    render(
      <HistoricoDecisoes
        revisoes={[
          revisao({
            estado: "decidida",
            autor: "servidor.teste",
            ocorrencias: CLASSE_MAIS_ESPECIFICA,
            obs_publicaveis: ["classe-A"],
          }),
        ]}
      />,
    );
    await abrirDetalhe();
    expect(screen.getByText("Publicou 1 de 2 ocorrências idênticas")).toBeInTheDocument();
  });

  it("[A,A,B] selecionando somente B: 'Publicou 1 ocorrência específica'", async () => {
    render(
      <HistoricoDecisoes
        revisoes={[
          revisao({
            estado: "decidida",
            autor: "servidor.teste",
            ocorrencias: CLASSE_MAIS_ESPECIFICA,
            obs_publicaveis: ["especifica-B"],
          }),
        ]}
      />,
    );
    await abrirDetalhe();
    expect(screen.getByText("Publicou 1 ocorrência específica")).toBeInTheDocument();
  });

  it("[A,A,B] selecionando A+B: o resumo comunica AMBAS as partes, nunca só a classe idêntica", async () => {
    render(
      <HistoricoDecisoes
        revisoes={[
          revisao({
            estado: "decidida",
            autor: "servidor.teste",
            ocorrencias: CLASSE_MAIS_ESPECIFICA,
            obs_publicaveis: ["classe-A", "especifica-B"],
          }),
        ]}
      />,
    );
    await abrirDetalhe();
    expect(
      screen.getByText("Publicou 1 de 2 ocorrências idênticas + 1 ocorrência específica"),
    ).toBeInTheDocument();
    // nunca o bug reportado: a frase da classe idêntica sozinha, omitindo B
    expect(screen.queryByText("Publicou 1 de 2 ocorrências idênticas")).not.toBeInTheDocument();
  });

  it("[A,A,B,C] selecionando A+B+C: comunica a classe idêntica E as duas ocorrências específicas", async () => {
    render(
      <HistoricoDecisoes
        revisoes={[
          revisao({
            estado: "decidida",
            autor: "servidor.teste",
            ocorrencias: CLASSE_MAIS_DUAS_ESPECIFICAS,
            obs_publicaveis: ["classe-A", "especifica-B", "especifica-C"],
          }),
        ]}
      />,
    );
    await abrirDetalhe();
    expect(
      screen.getByText("Publicou 1 de 2 ocorrências idênticas + 2 ocorrências específicas"),
    ).toBeInTheDocument();
  });

  it("decisão Adiada: detalhe mostra 'Adiada' como o que foi publicado, nunca uma composição de publicáveis", async () => {
    render(
      <HistoricoDecisoes
        revisoes={[revisao({ estado: "adiada", ocorrencias: CLASSE_MAIS_ESPECIFICA, autor: "servidor.teste" })]}
      />,
    );
    await abrirDetalhe();
    expect(screen.getAllByText("Adiada").length).toBeGreaterThanOrEqual(2);
  });

  it("REQUER_NOVA_DECISAO: detalhe mostra 'Requer nova decisão' como o que foi publicado, nunca uma composição de publicáveis", async () => {
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
    await abrirDetalhe();
    expect(screen.getAllByText("Requer nova decisão").length).toBeGreaterThanOrEqual(2);
  });

  it("DESATUALIZADA: detalhe mostra 'Desatualizada' como o que foi publicado, nunca uma composição de publicáveis", async () => {
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
    await abrirDetalhe();
    expect(screen.getAllByText("Desatualizada").length).toBeGreaterThanOrEqual(2);
  });
});
