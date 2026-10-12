// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import TabelaResultado from "./TabelaResultado";
import type { LoteProcessamento, ResultadoPreenchimento } from "../../types/processamento";

afterEach(() => {
  cleanup();
});

function lote(): LoteProcessamento {
  return {
    id: "lote-1",
    total: 2,
    sucesso: 2,
    erro: 0,
    processos: [
      {
        id: "p1",
        arquivo_origem: "inserido.pdf",
        status: "sucesso",
        diaria: null,
        erro: null,
        avisos: [],
      },
      {
        id: "p2",
        arquivo_origem: "duplicado.pdf",
        status: "sucesso",
        diaria: null,
        erro: null,
        avisos: [],
      },
    ],
  };
}

// Organização Automática de PDFs — coluna aditiva "Organização", nunca
// substitui as colunas/categorias já homologadas.
describe("TabelaResultado — coluna Organização", () => {
  it("item INSERIDO com organização bem-sucedida mostra o status traduzido", () => {
    const preenchimento: ResultadoPreenchimento = {
      total_gravado: 1,
      duplicadas_ignoradas: 1,
      linha_inicial: 4,
      linha_final: 4,
      itens: [
        {
          arquivo_origem: "inserido.pdf",
          sei: "19.20.0000.0000001/2026-01",
          categoria: "inserido",
          linha: 4,
          sei_ja_existente_em_linha: null,
          organizacao: { sucesso: true, status: "movido", detalhe: null },
        },
        {
          arquivo_origem: "duplicado.pdf",
          sei: "19.20.0000.0000001/2026-01",
          categoria: "duplicado_no_lote",
          linha: null,
          sei_ja_existente_em_linha: null,
          organizacao: null,
        },
      ],
      pasta_resultados: "C:/res",
      caminho_planilha_gerada: "C:/res/planilha.xlsx",
      caminho_relatorio: "C:/res/relatorio.html",
      caminho_log: "C:/res/log.txt",
    };

    render(<TabelaResultado lote={lote()} preenchimento={preenchimento} />);

    expect(screen.getByText("Movido para Processados")).toBeInTheDocument();
    // Duplicado no lote nunca é organizado — mostra "—", nunca um erro.
    const linhaDuplicado = screen.getByText("duplicado.pdf").closest("tr")!;
    expect(linhaDuplicado.textContent).toContain("—");
  });

  it("item INSERIDO sem organização tentada (caminho_absoluto ausente) mostra o motivo", () => {
    const preenchimento: ResultadoPreenchimento = {
      total_gravado: 1,
      duplicadas_ignoradas: 0,
      linha_inicial: 4,
      linha_final: 4,
      itens: [
        {
          arquivo_origem: "inserido.pdf",
          sei: "19.20.0000.0000001/2026-01",
          categoria: "inserido",
          linha: 4,
          sei_ja_existente_em_linha: null,
          organizacao: {
            sucesso: false,
            status: "pasta_nao_configurada",
            detalhe: "Pastas operacionais não configuradas.",
          },
        },
      ],
      pasta_resultados: "C:/res",
      caminho_planilha_gerada: "C:/res/planilha.xlsx",
      caminho_relatorio: "C:/res/relatorio.html",
      caminho_log: "C:/res/log.txt",
    };

    render(
      <TabelaResultado
        lote={{
          id: "lote-1",
          total: 1,
          sucesso: 1,
          erro: 0,
          processos: [
            {
              id: "p1",
              arquivo_origem: "inserido.pdf",
              status: "sucesso",
              diaria: null,
              erro: null,
              avisos: [],
            },
          ],
        }}
        preenchimento={preenchimento}
      />,
    );

    expect(screen.getByText("Pasta operacional não configurada")).toBeInTheDocument();
  });
});
