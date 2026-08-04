// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import PainelFiltrosPrincipal from "./PainelFiltrosPrincipal";
import type { OpcoesFiltroResposta, ParametrosPesquisaDiariasQuery } from "../../types/analitica";

const OPCOES: OpcoesFiltroResposta = { motivos: [], situacoes: [], municipios: [] };

afterEach(() => {
  cleanup();
});

describe("PainelFiltrosPrincipal", () => {
  it("compõe PainelFiltrosAvancados e ChipsFiltroAtivo, sem duplicar nenhum dos dois", async () => {
    const usuario = userEvent.setup();
    const filtros: ParametrosPesquisaDiariasQuery = { municipio: "Araripina", pagina: 1, tamanho_pagina: 25 };
    render(
      <PainelFiltrosPrincipal
        filtros={filtros}
        opcoes={OPCOES}
        erroOpcoes={null}
        onTentarNovamenteOpcoes={vi.fn()}
        onMudarFiltro={vi.fn()}
        onRemoverFiltro={vi.fn()}
        onLimparTudo={vi.fn()}
      />,
    );

    // ChipsFiltroAtivo já reflete o filtro ativo, sem precisar expandir nada.
    expect(screen.getByText(/Município: Araripina/)).toBeInTheDocument();

    // PainelFiltrosAvancados continua colapsado por padrão (comportamento
    // próprio, não alterado por esta composição).
    await usuario.click(screen.getByRole("button", { name: /Filtros/ }));
    expect(screen.getByLabelText("SEI")).toBeInTheDocument();
  });

  it("remover um chip chama onRemoverFiltro com o campo certo", async () => {
    const usuario = userEvent.setup();
    const onRemoverFiltro = vi.fn();
    render(
      <PainelFiltrosPrincipal
        filtros={{ municipio: "Araripina", pagina: 1, tamanho_pagina: 25 }}
        opcoes={OPCOES}
        erroOpcoes={null}
        onTentarNovamenteOpcoes={vi.fn()}
        onMudarFiltro={vi.fn()}
        onRemoverFiltro={onRemoverFiltro}
        onLimparTudo={vi.fn()}
      />,
    );

    await usuario.click(screen.getByRole("button", { name: "Remover filtro Município" }));
    expect(onRemoverFiltro).toHaveBeenCalledWith("municipio");
  });

  // Sprint 19.5.6.1 — fecha o achado da auditoria da 19.5.6: `FiltrosRapidos`
  // agora faz parte da composição real de `PainelFiltrosPrincipal`.
  describe("FiltrosRapidos integrado (Sprint 19.5.6.1)", () => {
    it("os atalhos de FiltrosRapidos aparecem dentro do PainelFiltrosPrincipal real", () => {
      render(
        <PainelFiltrosPrincipal
          filtros={{ pagina: 1, tamanho_pagina: 25 }}
          opcoes={OPCOES}
          erroOpcoes={null}
          onTentarNovamenteOpcoes={vi.fn()}
          onMudarFiltro={vi.fn()}
          onRemoverFiltro={vi.fn()}
          onLimparTudo={vi.fn()}
        />,
      );

      expect(screen.getByRole("group", { name: "Filtros rápidos" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Hoje" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Mês atual" })).toBeInTheDocument();
    });

    it("clicar num atalho rápido chama exatamente o mesmo onMudarFiltro usado por PainelFiltrosAvancados", async () => {
      const usuario = userEvent.setup();
      const onMudarFiltro = vi.fn();
      render(
        <PainelFiltrosPrincipal
          filtros={{ pagina: 1, tamanho_pagina: 25 }}
          opcoes={OPCOES}
          erroOpcoes={null}
          onTentarNovamenteOpcoes={vi.fn()}
          onMudarFiltro={onMudarFiltro}
          onRemoverFiltro={vi.fn()}
          onLimparTudo={vi.fn()}
        />,
      );

      await usuario.click(screen.getByRole("button", { name: "Hoje" }));

      // Único `onMudarFiltro` recebido via props — não há um segundo
      // callback/estado interno para atalhos rápidos (nenhuma fonte de
      // verdade paralela ao recorte já gerenciado por `useDiarias`).
      expect(onMudarFiltro).toHaveBeenCalledTimes(1);
      expect(onMudarFiltro).toHaveBeenCalledWith(
        expect.objectContaining({ periodo_inicial: expect.any(String), periodo_final: expect.any(String) }),
      );
    });
  });
});
