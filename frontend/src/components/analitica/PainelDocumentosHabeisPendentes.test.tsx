// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DocumentosHabeisPendentesResposta } from "../../types/analitica";
import PainelDocumentosHabeisPendentes from "./PainelDocumentosHabeisPendentes";

const RESULTADO: DocumentosHabeisPendentesResposta = {
  resumo: { aguardando_liberacao: 1, revisao_manual_necessaria: 1 },
  registros: [
    {
      sei: "SEI-REVISAO",
      servidor_nome: "Ana Costa",
      cpf_mascarado: "***.333.333-33",
      periodo: { inicial: "2026-07-01", final: "2026-07-03" },
      destino: "RECIFE",
      data_liberacao_prevista: "2026-06-16",
      situacao: "revisao_manual_necessaria",
      dias_restantes: null,
      dias_atraso: 20,
      texto_contagem: null,
      mensagem: "Documento Hábil pendente. A data de liberação já foi atingida. Recomenda-se análise manual.",
    },
    {
      sei: "SEI-AGUARDANDO",
      servidor_nome: "João Silva",
      cpf_mascarado: "***.222.222-22",
      periodo: { inicial: "2026-09-01", final: "2026-09-03" },
      destino: "ARARIPINA",
      data_liberacao_prevista: "2026-08-17",
      situacao: "aguardando_liberacao",
      dias_restantes: 4,
      dias_atraso: null,
      texto_contagem: "Liberação prevista para 17/08/2026 — faltam 4 dias.",
      mensagem: "Documento Hábil ainda não disponível. Aguardar a data de liberação.",
    },
  ],
};

const PROPS_BASE = {
  resultado: null as DocumentosHabeisPendentesResposta | null,
  carregando: false,
  erro: null as string | null,
  aoTentarNovamente: () => {},
  aoVoltar: () => {},
  aoSelecionarRegistro: () => {},
};

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe("PainelDocumentosHabeisPendentes", () => {
  it("mostra estado de carregamento e o botão de voltar", () => {
    render(<PainelDocumentosHabeisPendentes {...PROPS_BASE} carregando resultado={null} />);

    expect(screen.getByRole("status")).toHaveTextContent("Carregando Documentos Hábeis Pendentes...");
    expect(screen.getByRole("button", { name: "← Voltar aos resultados" })).toBeInTheDocument();
  });

  it("falha na busca: mostra alerta e 'Tentar novamente' aciona o callback", () => {
    const aoTentarNovamente = vi.fn();
    render(
      <PainelDocumentosHabeisPendentes
        {...PROPS_BASE}
        erro="Não foi possível carregar os Documentos Hábeis Pendentes."
        aoTentarNovamente={aoTentarNovamente}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível carregar os Documentos Hábeis Pendentes.");
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(aoTentarNovamente).toHaveBeenCalledTimes(1);
  });

  it("'← Voltar aos resultados' aciona aoVoltar em qualquer estado", () => {
    const aoVoltar = vi.fn();
    render(<PainelDocumentosHabeisPendentes {...PROPS_BASE} carregando resultado={null} aoVoltar={aoVoltar} />);

    fireEvent.click(screen.getByRole("button", { name: "← Voltar aos resultados" }));
    expect(aoVoltar).toHaveBeenCalledTimes(1);
  });

  it("recorte sem nenhum DH pendente: mostra mensagem própria, sem tabela nem filtros", () => {
    render(
      <PainelDocumentosHabeisPendentes
        {...PROPS_BASE}
        resultado={{ resumo: { aguardando_liberacao: 0, revisao_manual_necessaria: 0 }, registros: [] }}
      />,
    );

    expect(
      screen.getByText("Nenhum processo deste recorte está com o Documento Hábil pendente."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
  });

  describe("com resultado carregado", () => {
    it("mostra o total de processos no cabeçalho", () => {
      render(<PainelDocumentosHabeisPendentes {...PROPS_BASE} resultado={RESULTADO} />);
      expect(screen.getByText("Documentos Hábeis Pendentes · 2 processos")).toBeInTheDocument();
    });

    it("nunca lista registros com DH preenchido — só os dois pendentes aparecem", () => {
      render(<PainelDocumentosHabeisPendentes {...PROPS_BASE} resultado={RESULTADO} />);
      expect(screen.getByText("SEI-REVISAO")).toBeInTheDocument();
      expect(screen.getByText("SEI-AGUARDANDO")).toBeInTheDocument();
      expect(screen.getAllByRole("row")).toHaveLength(3); // cabeçalho + 2 linhas
    });

    it("nunca mostra as antigas anomalias do Diagnóstico geral (trecho, transporte, duplicidade, situação)", () => {
      render(<PainelDocumentosHabeisPendentes {...PROPS_BASE} resultado={RESULTADO} />);
      const texto = document.body.textContent ?? "";
      expect(texto).not.toContain("Trecho incompleto");
      expect(texto).not.toContain("Transporte não identificado");
      expect(texto).not.toContain("Possível duplicidade");
      expect(texto).not.toContain("Situação não informada");
    });

    it("mostra CPF mascarado, servidor, período, destino e data prevista de cada linha", () => {
      render(<PainelDocumentosHabeisPendentes {...PROPS_BASE} resultado={RESULTADO} />);
      const linha = screen.getByText("SEI-REVISAO").closest("tr")!;
      expect(linha).toHaveTextContent("Ana Costa");
      expect(linha).toHaveTextContent("***.333.333-33");
      expect(linha).toHaveTextContent("01–03/07/2026");
      expect(linha).toHaveTextContent("RECIFE");
      expect(linha).toHaveTextContent("16/06/2026");
    });

    it("linha 'aguardando liberação' mostra o texto de contagem regressiva vindo do backend", () => {
      render(<PainelDocumentosHabeisPendentes {...PROPS_BASE} resultado={RESULTADO} />);
      const linha = screen.getByText("SEI-AGUARDANDO").closest("tr")!;
      expect(linha).toHaveTextContent("Liberação prevista para 17/08/2026 — faltam 4 dias.");
    });

    it("linha 'revisão manual necessária' mostra o atraso em dias", () => {
      render(<PainelDocumentosHabeisPendentes {...PROPS_BASE} resultado={RESULTADO} />);
      const linha = screen.getByText("SEI-REVISAO").closest("tr")!;
      expect(linha).toHaveTextContent("Atraso de 20 dias desde 16/06/2026");
    });

    it("RN-08: badge 'Aguardando liberação' nunca usa âmbar/vermelho (informativo)", () => {
      render(<PainelDocumentosHabeisPendentes {...PROPS_BASE} resultado={RESULTADO} />);
      const linha = screen.getByText("SEI-AGUARDANDO").closest("tr")!;
      const badge = within(linha).getByText("Aguardando liberação");
      expect(badge.className).toContain("cyan");
      expect(badge.className).not.toContain("red");
      expect(badge.className).not.toContain("amber");
    });

    it("RN-08: badge 'Revisão manual necessária' usa âmbar, nunca vermelho", () => {
      render(<PainelDocumentosHabeisPendentes {...PROPS_BASE} resultado={RESULTADO} />);
      const linha = screen.getByText("SEI-REVISAO").closest("tr")!;
      const badge = within(linha).getByText("Revisão manual necessária");
      expect(badge.className).toContain("amber");
      expect(badge.className).not.toContain("red");
    });

    it("clicar numa linha aciona aoSelecionarRegistro com o SEI correto", () => {
      const aoSelecionarRegistro = vi.fn();
      render(
        <PainelDocumentosHabeisPendentes {...PROPS_BASE} resultado={RESULTADO} aoSelecionarRegistro={aoSelecionarRegistro} />,
      );
      fireEvent.click(screen.getByText("SEI-AGUARDANDO").closest("tr")!);
      expect(aoSelecionarRegistro).toHaveBeenCalledWith("SEI-AGUARDANDO");
    });

    it("Enter na linha (teclado) também aciona aoSelecionarRegistro", () => {
      const aoSelecionarRegistro = vi.fn();
      render(
        <PainelDocumentosHabeisPendentes {...PROPS_BASE} resultado={RESULTADO} aoSelecionarRegistro={aoSelecionarRegistro} />,
      );
      fireEvent.keyDown(screen.getByText("SEI-AGUARDANDO").closest("tr")!, { key: "Enter" });
      expect(aoSelecionarRegistro).toHaveBeenCalledWith("SEI-AGUARDANDO");
    });

    describe("filtros internos", () => {
      it("nasce em 'Todos' por padrão, mostrando as duas linhas", () => {
        render(<PainelDocumentosHabeisPendentes {...PROPS_BASE} resultado={RESULTADO} />);
        expect(screen.getByRole("radio", { name: /Todos/ })).toHaveAttribute("aria-checked", "true");
        expect(screen.getAllByRole("row")).toHaveLength(3);
      });

      it("filtrar por 'Aguardando liberação' esconde a linha de revisão manual", () => {
        render(<PainelDocumentosHabeisPendentes {...PROPS_BASE} resultado={RESULTADO} />);
        fireEvent.click(screen.getByRole("radio", { name: /Aguardando liberação/ }));

        expect(screen.getByText("SEI-AGUARDANDO")).toBeInTheDocument();
        expect(screen.queryByText("SEI-REVISAO")).not.toBeInTheDocument();
      });

      it("filtrar por 'Revisão manual necessária' esconde a linha de aguardando", () => {
        render(<PainelDocumentosHabeisPendentes {...PROPS_BASE} resultado={RESULTADO} />);
        fireEvent.click(screen.getByRole("radio", { name: /Revisão manual necessária/ }));

        expect(screen.getByText("SEI-REVISAO")).toBeInTheDocument();
        expect(screen.queryByText("SEI-AGUARDANDO")).not.toBeInTheDocument();
      });

      it("nasce com o filtro inicial vindo do aviso de liberação atingida", () => {
        render(
          <PainelDocumentosHabeisPendentes
            {...PROPS_BASE}
            resultado={RESULTADO}
            filtroInicial="revisao_manual_necessaria"
          />,
        );
        expect(screen.getByRole("radio", { name: /Revisão manual necessária/ })).toHaveAttribute("aria-checked", "true");
        expect(screen.getByText("SEI-REVISAO")).toBeInTheDocument();
        expect(screen.queryByText("SEI-AGUARDANDO")).not.toBeInTheDocument();
      });
    });
  });
});
