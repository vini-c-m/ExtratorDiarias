// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import ChipsFiltroAtivo from "./ChipsFiltroAtivo";

afterEach(() => {
  cleanup();
});

describe("ChipsFiltroAtivo", () => {
  it("nenhum filtro ativo: não renderiza nada, nem o botão 'Limpar filtros'", () => {
    const { container } = render(
      <ChipsFiltroAtivo filtros={{ pagina: 1, tamanho_pagina: 25 }} onRemover={vi.fn()} onLimparTudo={vi.fn()} />,
    );

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole("button", { name: "Limpar filtros" })).not.toBeInTheDocument();
  });

  it("mostra um chip por filtro ativo, ignorando paginação/ordenação", () => {
    render(
      <ChipsFiltroAtivo
        filtros={{ municipio: "Araripina", motivo: "Curso", pagina: 2, tamanho_pagina: 25, ordenar_por: "valor" }}
        onRemover={vi.fn()}
        onLimparTudo={vi.fn()}
      />,
    );

    expect(screen.getByText(/Município: Araripina/)).toBeInTheDocument();
    expect(screen.getByText(/Motivo: Curso/)).toBeInTheDocument();
    expect(screen.queryByText(/pagina/i)).not.toBeInTheDocument();
  });

  it("mostra um chip para cada filtro novo da Sprint 19.5.3", () => {
    render(
      <ChipsFiltroAtivo
        filtros={{
          origem: "Recife",
          destino: "Araripina",
          trecho: "Recife - Araripina",
          valor_minimo: "100",
          valor_maximo: "500",
          pagina: 1,
          tamanho_pagina: 25,
        }}
        onRemover={vi.fn()}
        onLimparTudo={vi.fn()}
      />,
    );

    expect(screen.getByText(/Origem: Recife/)).toBeInTheDocument();
    expect(screen.getByText(/Destino: Araripina/)).toBeInTheDocument();
    expect(screen.getByText(/Trecho: Recife - Araripina/)).toBeInTheDocument();
    expect(screen.getByText(/Valor mínimo: 100/)).toBeInTheDocument();
    expect(screen.getByText(/Valor máximo: 500/)).toBeInTheDocument();
  });

  it("formata datas de período no padrão brasileiro", () => {
    render(
      <ChipsFiltroAtivo
        filtros={{ periodo_inicial: "2025-01-08", pagina: 1, tamanho_pagina: 25 }}
        onRemover={vi.fn()}
        onLimparTudo={vi.fn()}
      />,
    );

    expect(screen.getByText(/A partir de: 08\/01\/2025/)).toBeInTheDocument();
  });

  it("clicar no botão de remover de um chip chama onRemover com o campo certo", async () => {
    const usuario = userEvent.setup();
    const onRemover = vi.fn();
    render(
      <ChipsFiltroAtivo
        filtros={{ cpf: "12345678911", pagina: 1, tamanho_pagina: 25 }}
        onRemover={onRemover}
        onLimparTudo={vi.fn()}
      />,
    );

    await usuario.click(screen.getByRole("button", { name: "Remover filtro CPF" }));

    expect(onRemover).toHaveBeenCalledTimes(1);
    expect(onRemover).toHaveBeenCalledWith("cpf");
  });

  // Sprint 19.5.8.1 — correção do Bug 1 da Auditoria Técnica (19.5.8
  // REPROVADA): o chip de CPF nunca pode mostrar o valor completo, mesmo
  // que `filtros.cpf` (o valor real, usado pela pesquisa) o contenha.
  describe("chip de CPF sempre mascarado (correção 19.5.8.1)", () => {
    it("mostra o CPF mascarado no formato já homologado, nunca o valor completo", () => {
      render(
        <ChipsFiltroAtivo
          filtros={{ cpf: "12345678911", pagina: 1, tamanho_pagina: 25 }}
          onRemover={vi.fn()}
          onLimparTudo={vi.fn()}
        />,
      );

      expect(screen.getByText("CPF: ***.***.***-11")).toBeInTheDocument();
      expect(screen.queryByText(/12345678911/)).not.toBeInTheDocument();
    });

    it("remover o chip de CPF (mascarado na tela) continua removendo o filtro real ('cpf')", async () => {
      const usuario = userEvent.setup();
      const onRemover = vi.fn();
      render(
        <ChipsFiltroAtivo
          filtros={{ cpf: "12345678911", pagina: 1, tamanho_pagina: 25 }}
          onRemover={onRemover}
          onLimparTudo={vi.fn()}
        />,
      );

      expect(screen.getByText("CPF: ***.***.***-11")).toBeInTheDocument();
      await usuario.click(screen.getByRole("button", { name: "Remover filtro CPF" }));

      expect(onRemover).toHaveBeenCalledWith("cpf");
    });
  });

  // Sprint 18.5.1 — correção NC1 da auditoria: botão único "Limpar filtros".
  describe("Limpar filtros", () => {
    it("com pelo menos um filtro ativo, mostra o botão 'Limpar filtros'", () => {
      render(
        <ChipsFiltroAtivo
          filtros={{ municipio: "Araripina", pagina: 1, tamanho_pagina: 25 }}
          onRemover={vi.fn()}
          onLimparTudo={vi.fn()}
        />,
      );

      expect(screen.getByRole("button", { name: "Limpar filtros" })).toBeInTheDocument();
    });

    it("clicar em 'Limpar filtros' chama onLimparTudo", async () => {
      const usuario = userEvent.setup();
      const onLimparTudo = vi.fn();
      render(
        <ChipsFiltroAtivo
          filtros={{ municipio: "Araripina", motivo: "Curso", pagina: 1, tamanho_pagina: 25 }}
          onRemover={vi.fn()}
          onLimparTudo={onLimparTudo}
        />,
      );

      await usuario.click(screen.getByRole("button", { name: "Limpar filtros" }));

      expect(onLimparTudo).toHaveBeenCalledTimes(1);
    });
  });
});
