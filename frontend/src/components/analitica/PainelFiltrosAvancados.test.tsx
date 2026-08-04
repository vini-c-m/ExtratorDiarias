// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import PainelFiltrosAvancados from "./PainelFiltrosAvancados";
import type { OpcoesFiltroResposta, ParametrosPesquisaDiariasQuery } from "../../types/analitica";

const FILTROS_VAZIOS: ParametrosPesquisaDiariasQuery = { pagina: 1, tamanho_pagina: 25 };
const OPCOES: OpcoesFiltroResposta = {
  motivos: ["Curso"],
  situacoes: ["Em exercício"],
  municipios: ["Araripina", "Recife"],
};

function renderPainel(
  props: Partial<{
    filtros: ParametrosPesquisaDiariasQuery;
    opcoes: OpcoesFiltroResposta | null;
    erroOpcoes: string | null;
    onTentarNovamenteOpcoes: () => void;
    onMudarFiltro: (parcial: Record<string, string | undefined>) => void;
  }> = {},
) {
  return render(
    <PainelFiltrosAvancados
      filtros={props.filtros ?? FILTROS_VAZIOS}
      opcoes={props.opcoes ?? OPCOES}
      erroOpcoes={props.erroOpcoes ?? null}
      onTentarNovamenteOpcoes={props.onTentarNovamenteOpcoes ?? vi.fn()}
      onMudarFiltro={props.onMudarFiltro ?? vi.fn()}
    />,
  );
}

afterEach(() => {
  cleanup();
});

describe("PainelFiltrosAvancados", () => {
  it("vem colapsado por padrão", () => {
    renderPainel();

    expect(screen.getByRole("button", { name: /Filtros/ })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByLabelText("SEI")).not.toBeInTheDocument();
  });

  it("clicar em 'Filtros' expande o painel e mostra os campos", async () => {
    const usuario = userEvent.setup();
    renderPainel();

    await usuario.click(screen.getByRole("button", { name: /Filtros/ }));

    expect(screen.getByRole("button", { name: /Filtros/ })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByLabelText("SEI")).toBeInTheDocument();
    expect(screen.getByLabelText("CPF")).toBeInTheDocument();
    expect(screen.getByLabelText("Nome do servidor")).toBeInTheDocument();
    expect(screen.getByLabelText("Matrícula")).toBeInTheDocument();
    expect(screen.getByLabelText("Origem")).toBeInTheDocument();
    expect(screen.getByLabelText("Destino")).toBeInTheDocument();
    expect(screen.getByLabelText("Trecho")).toBeInTheDocument();
    expect(screen.getByLabelText("Município")).toBeInTheDocument();
    expect(screen.getByLabelText("Motivo")).toBeInTheDocument();
    expect(screen.getByLabelText("Situação")).toBeInTheDocument();
    expect(screen.getByLabelText("Valor mínimo")).toBeInTheDocument();
    expect(screen.getByLabelText("Valor máximo")).toBeInTheDocument();
    expect(screen.getByLabelText("Período inicial")).toBeInTheDocument();
    expect(screen.getByLabelText("Período final")).toBeInTheDocument();
  });

  it("município/motivo/situação são <select> alimentados por `opcoes`, nunca texto livre", async () => {
    const usuario = userEvent.setup();
    renderPainel();
    await usuario.click(screen.getByRole("button", { name: /Filtros/ }));

    const selecaoMunicipio = screen.getByLabelText("Município");
    expect(selecaoMunicipio.tagName).toBe("SELECT");
    expect(screen.getByRole("option", { name: "Araripina" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Recife" })).toBeInTheDocument();
  });

  it("selecionar um município chama onMudarFiltro imediatamente (sem debounce)", async () => {
    const usuario = userEvent.setup();
    const onMudarFiltro = vi.fn();
    renderPainel({ onMudarFiltro });
    await usuario.click(screen.getByRole("button", { name: /Filtros/ }));

    await usuario.selectOptions(screen.getByLabelText("Município"), "Araripina");

    expect(onMudarFiltro).toHaveBeenCalledWith({ municipio: "Araripina" });
  });

  it("digitar no campo SEI dispara onMudarFiltro só depois do debounce", async () => {
    const usuario = userEvent.setup();
    const onMudarFiltro = vi.fn();
    renderPainel({ onMudarFiltro });
    await usuario.click(screen.getByRole("button", { name: /Filtros/ }));

    await usuario.type(screen.getByLabelText("SEI"), "19.20");

    expect(onMudarFiltro).not.toHaveBeenCalled();
    await waitFor(() => expect(onMudarFiltro).toHaveBeenCalledWith({ sei: "19.20" }));
  });

  it("digitar em Origem dispara onMudarFiltro só depois do debounce", async () => {
    const usuario = userEvent.setup();
    const onMudarFiltro = vi.fn();
    renderPainel({ onMudarFiltro });
    await usuario.click(screen.getByRole("button", { name: /Filtros/ }));

    await usuario.type(screen.getByLabelText("Origem"), "Recife");

    expect(onMudarFiltro).not.toHaveBeenCalled();
    await waitFor(() => expect(onMudarFiltro).toHaveBeenCalledWith({ origem: "Recife" }));
  });

  it("digitar em Trecho dispara onMudarFiltro só depois do debounce", async () => {
    const usuario = userEvent.setup();
    const onMudarFiltro = vi.fn();
    renderPainel({ onMudarFiltro });
    await usuario.click(screen.getByRole("button", { name: /Filtros/ }));

    await usuario.type(screen.getByLabelText("Trecho"), "Recife - Araripina");

    expect(onMudarFiltro).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(onMudarFiltro).toHaveBeenCalledWith({ trecho: "Recife - Araripina" }),
    );
  });

  it("valor máximo menor que o mínimo mostra alerta e não aplica nenhum dos dois valores", async () => {
    const onMudarFiltro = vi.fn();
    renderPainel({ onMudarFiltro });
    await userEvent.setup().click(screen.getByRole("button", { name: /Filtros/ }));

    fireEvent.change(screen.getByLabelText("Valor mínimo"), { target: { value: "500" } });
    onMudarFiltro.mockClear();
    fireEvent.change(screen.getByLabelText("Valor máximo"), { target: { value: "100" } });

    expect(screen.getByText("Valor máximo não pode ser menor que o valor mínimo.")).toBeInTheDocument();
    expect(onMudarFiltro).not.toHaveBeenCalled();
  });

  it("corrige a divergência de valor: ao voltar a ser válido, aplica os dois valores juntos", async () => {
    const onMudarFiltro = vi.fn();
    renderPainel({ onMudarFiltro });
    await userEvent.setup().click(screen.getByRole("button", { name: /Filtros/ }));

    fireEvent.change(screen.getByLabelText("Valor mínimo"), { target: { value: "500" } });
    onMudarFiltro.mockClear();
    fireEvent.change(screen.getByLabelText("Valor máximo"), { target: { value: "100" } });
    expect(screen.getByText("Valor máximo não pode ser menor que o valor mínimo.")).toBeInTheDocument();
    expect(onMudarFiltro).not.toHaveBeenCalled();

    onMudarFiltro.mockClear();
    fireEvent.change(screen.getByLabelText("Valor máximo"), { target: { value: "900" } });

    expect(
      screen.queryByText("Valor máximo não pode ser menor que o valor mínimo."),
    ).not.toBeInTheDocument();
    expect(onMudarFiltro).toHaveBeenCalledWith({ valor_minimo: "500", valor_maximo: "900" });
  });

  it("período final anterior ao inicial mostra alerta e não aplica nenhum dos dois valores", async () => {
    const onMudarFiltro = vi.fn();
    renderPainel({ onMudarFiltro });
    await userEvent.setup().click(screen.getByRole("button", { name: /Filtros/ }));

    fireEvent.change(screen.getByLabelText("Período inicial"), { target: { value: "2025-01-10" } });
    onMudarFiltro.mockClear();
    fireEvent.change(screen.getByLabelText("Período final"), { target: { value: "2025-01-05" } });

    expect(screen.getByText("Período final não pode ser anterior ao período inicial.")).toBeInTheDocument();
    expect(onMudarFiltro).not.toHaveBeenCalled();
  });

  // Sprint 18.5.1 — correção B4 da auditoria: reproduz exatamente o cenário
  // relatado (definir final, depois um inicial inválido — rejeitado —,
  // depois corrigir o final) e confirma que o par completo é aplicado
  // junto assim que volta a ser válido, nunca deixando um valor "preso".
  it("corrige a divergência de período: ao voltar a ser válido, aplica os dois valores juntos", async () => {
    const onMudarFiltro = vi.fn();
    renderPainel({ onMudarFiltro });
    await userEvent.setup().click(screen.getByRole("button", { name: /Filtros/ }));

    // 1) define só o período final — válido (sem inicial para comparar).
    fireEvent.change(screen.getByLabelText("Período final"), { target: { value: "2025-01-05" } });
    expect(onMudarFiltro).toHaveBeenLastCalledWith({
      periodo_inicial: undefined,
      periodo_final: "2025-01-05",
    });

    // 2) define um período inicial que torna o par inválido — rejeitado.
    onMudarFiltro.mockClear();
    fireEvent.change(screen.getByLabelText("Período inicial"), { target: { value: "2025-01-10" } });
    expect(screen.getByText("Período final não pode ser anterior ao período inicial.")).toBeInTheDocument();
    expect(onMudarFiltro).not.toHaveBeenCalled();

    // 3) corrige o período final para um valor que torna o par válido de
    // novo — os DOIS valores (inclusive o inicial rejeitado no passo 2)
    // devem ser aplicados juntos agora.
    onMudarFiltro.mockClear();
    fireEvent.change(screen.getByLabelText("Período final"), { target: { value: "2025-01-15" } });

    expect(screen.queryByText("Período final não pode ser anterior ao período inicial.")).not.toBeInTheDocument();
    expect(onMudarFiltro).toHaveBeenCalledWith({
      periodo_inicial: "2025-01-10",
      periodo_final: "2025-01-15",
    });
    // Os campos visíveis continuam batendo com o que foi de fato aplicado.
    expect(screen.getByLabelText("Período inicial")).toHaveValue("2025-01-10");
    expect(screen.getByLabelText("Período final")).toHaveValue("2025-01-15");
  });

  // Sprint 18.5.1 — correção NC2 da auditoria: falha de `useOpcoesFiltro`
  // agora chega à tela, com ação de nova tentativa.
  describe("falha ao carregar opções de filtro", () => {
    it("mostra o erro e um botão de nova tentativa", async () => {
      const onTentarNovamenteOpcoes = vi.fn();
      renderPainel({ erroOpcoes: "Não foi possível carregar as opções de filtro.", onTentarNovamenteOpcoes });
      await userEvent.setup().click(screen.getByRole("button", { name: /Filtros/ }));

      expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível carregar as opções de filtro.");
      await userEvent.setup().click(screen.getByRole("button", { name: "Tentar novamente" }));
      expect(onTentarNovamenteOpcoes).toHaveBeenCalledTimes(1);
    });

    it("os campos de texto livre continuam habilitados mesmo com a falha", async () => {
      renderPainel({ erroOpcoes: "Não foi possível carregar as opções de filtro.", opcoes: null });
      await userEvent.setup().click(screen.getByRole("button", { name: /Filtros/ }));

      expect(screen.getByLabelText("SEI")).toBeEnabled();
      expect(screen.getByLabelText("CPF")).toBeEnabled();
      expect(screen.getByLabelText("Nome do servidor")).toBeEnabled();
      expect(screen.getByLabelText("Matrícula")).toBeEnabled();
    });

    it("sem erro: não mostra nenhum alerta de opções", () => {
      renderPainel({ erroOpcoes: null });

      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });
});
