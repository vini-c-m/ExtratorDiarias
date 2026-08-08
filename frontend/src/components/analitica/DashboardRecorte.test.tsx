// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DimensaoDistribuicao, DistribuicaoResposta, IndicadoresResposta, ParametrosDistribuicaoQuery } from "../../types/analitica";

vi.mock("../../services/api", async (importarOriginal) => {
  const real = await importarOriginal<typeof import("../../services/api")>();
  return { ...real, obterDistribuicao: vi.fn(), gerarRelatorio: vi.fn() };
});

import DashboardRecorte from "./DashboardRecorte";
import { gerarRelatorio, obterDistribuicao } from "../../services/api";

const obterDistribuicaoMock = vi.mocked(obterDistribuicao);
const gerarRelatorioMock = vi.mocked(gerarRelatorio);

const INDICADORES: IndicadoresResposta = {
  total_diarias: 312,
  total_servidores: 298,
  valor_total: 149760,
  valor_medio: 480,
  sincronizacao: { sincronizado_em: "2026-08-01T10:00:00", total_avisos: 0 },
};

const DISTRIBUICOES: Record<DimensaoDistribuicao, DistribuicaoResposta> = {
  periodo: {
    dimensao: "periodo",
    pontos: [
      { rotulo: "2026-05", contagem: 8, valor: 3200 },
      { rotulo: "2026-06", contagem: 12, valor: null },
    ],
  },
  servidor: {
    dimensao: "servidor",
    pontos: [
      { rotulo: "João da Silva", contagem: 12, valor: 5760 },
      { rotulo: "Maria Souza", contagem: 9, valor: 4320 },
      { rotulo: "Ana Lima", contagem: 7, valor: 3360 },
      { rotulo: "Carlos Melo", contagem: 5, valor: 2400 },
      { rotulo: "Bruno Rocha", contagem: 4, valor: 1920 },
      { rotulo: "Diana Alves", contagem: 3, valor: 1440 },
      { rotulo: "Ester Costa", contagem: 2, valor: 960 },
    ],
  },
  municipio: {
    dimensao: "municipio",
    pontos: [
      { rotulo: "Araripina-PE", contagem: 89, valor: 42720 },
      { rotulo: "Petrolina-PE", contagem: 62, valor: 29760 },
    ],
  },
  motivo: {
    dimensao: "motivo",
    pontos: [
      { rotulo: "Capacitação", contagem: 41, valor: 19680 },
      { rotulo: "Reunião", contagem: 33, valor: 15840 },
      { rotulo: "Fiscalização", contagem: 26, valor: 12480 },
      { rotulo: "Auditoria", contagem: 10, valor: 4800 },
    ],
  },
  situacao: {
    dimensao: "situacao",
    pontos: [
      { rotulo: "Em exercício", contagem: 94, valor: null },
      { rotulo: "Não informado", contagem: 6, valor: null },
    ],
  },
  origem_destino: {
    dimensao: "origem_destino",
    pontos: [
      { rotulo: "Recife-PE → Araripina-PE", contagem: 58, valor: 27840 },
      { rotulo: "Recife-PE → Petrolina-PE", contagem: 34, valor: 16320 },
    ],
  },
  // Sprint 21.1 (Modo Executivo) — não usadas por `DashboardRecorte`
  // (Dashboard operacional intocado), só presentes para satisfazer o tipo
  // `Record<DimensaoDistribuicao, ...>` desta fixture de teste.
  categoria_funcional: { dimensao: "categoria_funcional", pontos: [] },
  doc_origem: { dimensao: "doc_origem", pontos: [] },
  transporte: { dimensao: "transporte", pontos: [] },
};

const PROPS_BASE = {
  filtros: { pagina: 1, tamanho_pagina: 25 },
  indicadoresCarregando: false,
  indicadoresErro: null,
  aoTentarNovamenteIndicadores: () => {},
  aoAplicarFiltro: () => {},
  aoVoltar: () => {},
};

function mockarTodasAsDistribuicoes() {
  obterDistribuicaoMock.mockImplementation(async (parametros: ParametrosDistribuicaoQuery) => DISTRIBUICOES[parametros.dimensao]);
}

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe("DashboardRecorte", () => {
  it("indicadores ainda carregando: mostra o aviso de cálculo e o botão de voltar, sem KPIs/gráficos", () => {
    mockarTodasAsDistribuicoes();
    render(<DashboardRecorte {...PROPS_BASE} indicadores={null} indicadoresCarregando />);

    expect(screen.getByText("Calculando indicadores deste recorte...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "← Voltar aos resultados" })).toBeInTheDocument();
    expect(screen.queryByText("Total de diárias")).not.toBeInTheDocument();
  });

  it("indicadores com erro: mostra o alerta e o botão 'Tentar novamente', que aciona o callback recebido", () => {
    mockarTodasAsDistribuicoes();
    const aoTentarNovamente = vi.fn();
    render(
      <DashboardRecorte
        {...PROPS_BASE}
        indicadores={null}
        indicadoresErro="Não foi possível carregar os indicadores."
        aoTentarNovamenteIndicadores={aoTentarNovamente}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível carregar os indicadores.");
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(aoTentarNovamente).toHaveBeenCalledTimes(1);
  });

  it("'← Voltar aos resultados' aciona o callback recebido, em qualquer estado", () => {
    mockarTodasAsDistribuicoes();
    const aoVoltar = vi.fn();
    render(<DashboardRecorte {...PROPS_BASE} indicadores={INDICADORES} aoVoltar={aoVoltar} />);

    fireEvent.click(screen.getByRole("button", { name: "← Voltar aos resultados" }));
    expect(aoVoltar).toHaveBeenCalledTimes(1);
  });

  // --- Sprint 19.6.6 — exportação (PDF via POST /relatorios, Imprimir) --

  describe("exportação", () => {
    const RESPOSTA_GERADA = {
      caminho_arquivo_temporario: "C:\\Temp\\extrator_diarias_relatorios\\abc123.pdf",
      nome_sugerido: "Relatório Detalhado - 04-08-2026.pdf",
      sincronizado_em: "2026-08-04T10:32:00",
    };

    it("mostra 'Exportar PDF' e 'Imprimir'", () => {
      mockarTodasAsDistribuicoes();
      render(<DashboardRecorte {...PROPS_BASE} indicadores={INDICADORES} />);

      expect(screen.getByRole("button", { name: /Exportar PDF/ })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Imprimir/ })).toBeInTheDocument();
    });

    it("'Exportar PDF' chama POST /relatorios com tipo='detalhado', formato='pdf', sem tabela, reaproveitando os filtros vigentes", async () => {
      mockarTodasAsDistribuicoes();
      gerarRelatorioMock.mockResolvedValueOnce(RESPOSTA_GERADA);
      window.api = {
        salvarRelatorio: vi.fn().mockResolvedValue({ caminhoArquivo: "C:\\x\\relatorio.pdf", pastaArquivo: "C:\\x" }),
      } as unknown as Window["api"];

      render(
        <DashboardRecorte
          {...PROPS_BASE}
          filtros={{ pagina: 1, tamanho_pagina: 25, motivo: "Reunião" }}
          indicadores={INDICADORES}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: /Exportar PDF/ }));

      await waitFor(() => expect(gerarRelatorioMock).toHaveBeenCalledTimes(1));
      const [parametros] = gerarRelatorioMock.mock.calls[0];
      expect(parametros.tipo).toBe("detalhado");
      expect(parametros.formato).toBe("pdf");
      expect(parametros.modo).toBe("final");
      expect(parametros.incluir_indicadores).toBe(true);
      expect(parametros.incluir_graficos).toBe(true);
      expect(parametros.incluir_tabela).toBe(false);
      expect(parametros.incluir_inconsistencias).toBe(false);
      expect(parametros.filtros.motivo).toBe("Reunião");

      await waitFor(() => expect(screen.getByText("✔ Relatório salvo com sucesso.")).toBeInTheDocument());
    });

    it("'Exportar PDF' fica com 'carregando' (desabilitado) enquanto a geração está em andamento", async () => {
      mockarTodasAsDistribuicoes();
      let resolverGeracao!: (valor: typeof RESPOSTA_GERADA) => void;
      gerarRelatorioMock.mockReturnValueOnce(
        new Promise((resolve) => {
          resolverGeracao = resolve;
        }),
      );
      window.api = {
        salvarRelatorio: vi.fn().mockResolvedValue({ caminhoArquivo: "x", pastaArquivo: "y" }),
      } as unknown as Window["api"];
      render(<DashboardRecorte {...PROPS_BASE} indicadores={INDICADORES} />);

      const botaoExportar = screen.getByRole("button", { name: /Exportar PDF/ });
      fireEvent.click(botaoExportar);

      await waitFor(() => expect(botaoExportar).toBeDisabled());
      resolverGeracao(RESPOSTA_GERADA);
      await waitFor(() => expect(botaoExportar).not.toBeDisabled());
    });

    it("falha ao exportar: mostra alerta de erro com 'Tentar novamente'", async () => {
      mockarTodasAsDistribuicoes();
      gerarRelatorioMock.mockRejectedValueOnce(new Error("Não foi possível gerar o relatório."));
      render(<DashboardRecorte {...PROPS_BASE} indicadores={INDICADORES} />);

      fireEvent.click(screen.getByRole("button", { name: /Exportar PDF/ }));

      await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível gerar o relatório."));
      expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeInTheDocument();
    });

    it("'Imprimir' chama window.print() diretamente, sem POST nem IPC", () => {
      mockarTodasAsDistribuicoes();
      const printMock = vi.fn();
      vi.stubGlobal("print", printMock);
      render(<DashboardRecorte {...PROPS_BASE} indicadores={INDICADORES} />);

      fireEvent.click(screen.getByRole("button", { name: /Imprimir/ }));

      expect(printMock).toHaveBeenCalledTimes(1);
      expect(gerarRelatorioMock).not.toHaveBeenCalled();
      vi.unstubAllGlobals();
    });

    it("'Abrir Local' após sucesso chama window.api.abrirArquivo com a pasta salva", async () => {
      mockarTodasAsDistribuicoes();
      gerarRelatorioMock.mockResolvedValueOnce(RESPOSTA_GERADA);
      const abrirArquivoMock = vi.fn().mockResolvedValue(undefined);
      window.api = {
        salvarRelatorio: vi.fn().mockResolvedValue({ caminhoArquivo: "C:\\x\\relatorio.pdf", pastaArquivo: "C:\\x" }),
        abrirArquivo: abrirArquivoMock,
      } as unknown as Window["api"];
      render(<DashboardRecorte {...PROPS_BASE} indicadores={INDICADORES} />);

      fireEvent.click(screen.getByRole("button", { name: /Exportar PDF/ }));
      await waitFor(() => expect(screen.getByRole("button", { name: "Abrir Local" })).toBeInTheDocument());

      fireEvent.click(screen.getByRole("button", { name: "Abrir Local" }));

      await waitFor(() => expect(abrirArquivoMock).toHaveBeenCalledWith("C:\\x"));
    });
  });

  describe("com indicadores válidos", () => {
    it("mostra os 4 KPIs reais formatados", () => {
      mockarTodasAsDistribuicoes();
      render(<DashboardRecorte {...PROPS_BASE} indicadores={INDICADORES} />);

      expect(screen.getByText("Total de diárias")).toBeInTheDocument();
      expect(screen.getByText("312")).toBeInTheDocument();
      expect(screen.getByText("Total de servidores")).toBeInTheDocument();
      expect(screen.getByText("298")).toBeInTheDocument();
      expect(screen.getByText("R$ 149.760,00")).toBeInTheDocument();
      expect(screen.getByText("R$ 480,00")).toBeInTheDocument();
    });

    it("valor_total/valor_medio nulos (recorte sem nenhum valor) mostram travessão, nunca 'R$ 0,00'", () => {
      mockarTodasAsDistribuicoes();
      render(
        <DashboardRecorte
          {...PROPS_BASE}
          indicadores={{ ...INDICADORES, valor_total: null, valor_medio: null }}
        />,
      );

      expect(screen.queryByText(/R\$ 0,00/)).not.toBeInTheDocument();
      expect(screen.getAllByText("—")).not.toHaveLength(0);
    });

    // Decisão de produto 2026-08-06: os 4 KPIs e o 8º gráfico que
    // dependiam de decisão pendente do DIMCAC (sempre "Pendente", nunca um
    // número real) foram retirados da interface — não devem mais aparecer.
    it("não mostra mais os KPIs/gráfico pendentes retirados da interface", () => {
      mockarTodasAsDistribuicoes();
      render(<DashboardRecorte {...PROPS_BASE} indicadores={INDICADORES} />);

      expect(screen.queryByText("Total de municípios 🟡")).not.toBeInTheDocument();
      expect(screen.queryByText("Registros completos 🟡")).not.toBeInTheDocument();
      expect(screen.queryByText("Registros incompletos 🟡")).not.toBeInTheDocument();
      expect(screen.queryByText("Aguardando liberação 🟡")).not.toBeInTheDocument();
      expect(screen.queryByText("Completos × incompletos 🟡")).not.toBeInTheDocument();
      expect(screen.queryByText("Pendente")).not.toBeInTheDocument();
    });

    it("cada gráfico mostra 'Carregando...' até a respectiva distribuição resolver, depois mostra o título do cartão", async () => {
      mockarTodasAsDistribuicoes();
      render(<DashboardRecorte {...PROPS_BASE} indicadores={INDICADORES} />);

      expect(screen.getAllByText("Carregando...").length).toBeGreaterThan(0);
      await waitFor(() => expect(screen.getByText("Evolução por período")).toBeInTheDocument());
      expect(screen.getByText("Valores por período")).toBeInTheDocument();
      expect(screen.getByText("Ranking de servidores")).toBeInTheDocument();
      expect(screen.getByText("Ranking de municípios")).toBeInTheDocument();
      expect(screen.getByText("Distribuição por motivo")).toBeInTheDocument();
      expect(screen.getByText("Distribuição por situação do servidor")).toBeInTheDocument();
      expect(screen.getByText("Origem × Destino (principais pares)")).toBeInTheDocument();
    });

    it("gráfico com falha na busca mostra o alerta e permite tentar novamente", async () => {
      obterDistribuicaoMock.mockImplementation(async (parametros: ParametrosDistribuicaoQuery) => {
        if (parametros.dimensao === "motivo") throw new Error("Não foi possível carregar a distribuição.");
        return DISTRIBUICOES[parametros.dimensao];
      });
      render(<DashboardRecorte {...PROPS_BASE} indicadores={INDICADORES} />);

      await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível carregar a distribuição."));
      expect(screen.queryByText("Distribuição por motivo")).not.toBeInTheDocument();
    });

    it("ranking de servidores: limita o gráfico ao top 5, mas a tabela (equivalente textual) lista os 7", async () => {
      mockarTodasAsDistribuicoes();
      render(<DashboardRecorte {...PROPS_BASE} indicadores={INDICADORES} />);

      await waitFor(() => expect(screen.getByText("Ranking de servidores")).toBeInTheDocument());
      const cartao = screen.getByText("Ranking de servidores").closest('[class*="rounded-card"]') as HTMLElement;
      fireEvent.click(within(cartao).getByRole("button", { name: "Mais opções" }));
      fireEvent.click(within(cartao).getByRole("button", { name: "Ver como tabela" }));

      const linhas = within(cartao).getAllByRole("row");
      // 1 cabeçalho + 7 servidores
      expect(linhas).toHaveLength(8);
      expect(within(cartao).getByText("Ester Costa")).toBeInTheDocument();
    });

    it("distribuição por motivo com mais de 3 categorias agrupa o restante em 'Outros' no gráfico, mas a tabela lista todas", async () => {
      mockarTodasAsDistribuicoes();
      render(<DashboardRecorte {...PROPS_BASE} indicadores={INDICADORES} />);

      await waitFor(() => expect(screen.getByText("Distribuição por motivo")).toBeInTheDocument());
      expect(screen.getByText("Outros")).toBeInTheDocument();

      const cartao = screen.getByText("Distribuição por motivo").closest('[class*="rounded-card"]') as HTMLElement;
      fireEvent.click(within(cartao).getByRole("button", { name: "Mais opções" }));
      fireEvent.click(within(cartao).getByRole("button", { name: "Ver como tabela" }));
      expect(within(cartao).getByText("Auditoria")).toBeInTheDocument();
      // A tabela é a distribuição completa — "Auditoria" nunca aparece
      // fundido em "Outros" ali, só no gráfico.
    });

    it("'Valores por período' ignora pontos sem valor financeiro no gráfico, mas a tabela mostra o travessão para eles", async () => {
      mockarTodasAsDistribuicoes();
      render(<DashboardRecorte {...PROPS_BASE} indicadores={INDICADORES} />);

      await waitFor(() => expect(screen.getByText("Valores por período")).toBeInTheDocument());
      const cartao = screen.getByText("Valores por período").closest('[class*="rounded-card"]') as HTMLElement;
      fireEvent.click(within(cartao).getByRole("button", { name: "Mais opções" }));
      fireEvent.click(within(cartao).getByRole("button", { name: "Ver como tabela" }));

      expect(within(cartao).getByText("R$ 3.200,00")).toBeInTheDocument();
      expect(within(cartao).getByText("—")).toBeInTheDocument();
    });

    // Sprint 19.6.5 — clique-refina (`v2-arquitetura-funcional.md` § 6.3):
    // clicar num ponto filtrável aplica o valor como filtro adicional e
    // volta para a área de resultados; buckets sintéticos (dado ausente)
    // nunca viram botão.
    it("clique numa barra do ranking de servidores aplica 'servidor_nome' e volta aos resultados", async () => {
      mockarTodasAsDistribuicoes();
      const aoAplicarFiltro = vi.fn();
      const aoVoltar = vi.fn();
      render(
        <DashboardRecorte {...PROPS_BASE} indicadores={INDICADORES} aoAplicarFiltro={aoAplicarFiltro} aoVoltar={aoVoltar} />,
      );

      await waitFor(() => expect(screen.getByText("Ranking de servidores")).toBeInTheDocument());
      fireEvent.click(screen.getByRole("button", { name: /Filtrar por João da Silva/ }));

      expect(aoAplicarFiltro).toHaveBeenCalledTimes(1);
      expect(aoAplicarFiltro).toHaveBeenCalledWith({ servidor_nome: "João da Silva" });
      expect(aoVoltar).toHaveBeenCalledTimes(1);
    });

    it("clique numa barra do ranking de municípios aplica só 'municipio', sem tocar em outros filtros já ativos", async () => {
      mockarTodasAsDistribuicoes();
      const aoAplicarFiltro = vi.fn();
      render(
        <DashboardRecorte
          {...PROPS_BASE}
          filtros={{ pagina: 1, tamanho_pagina: 25, cpf: "12345678900" }}
          indicadores={INDICADORES}
          aoAplicarFiltro={aoAplicarFiltro}
        />,
      );

      await waitFor(() => expect(screen.getByText("Ranking de municípios")).toBeInTheDocument());
      fireEvent.click(screen.getByRole("button", { name: /Filtrar por Araripina-PE/ }));

      // Nunca inclui `cpf` (ou qualquer outro campo) no parcial — quem
      // funde com os filtros existentes é `aplicarFiltro` de `useDiarias`,
      // já testado lá; aqui só interessa que o componente nunca substitui.
      expect(aoAplicarFiltro).toHaveBeenCalledWith({ municipio: "Araripina-PE" });
    });

    it("clique numa barra de 'Evolução por período' aplica o intervalo do mês inteiro", async () => {
      mockarTodasAsDistribuicoes();
      const aoAplicarFiltro = vi.fn();
      render(<DashboardRecorte {...PROPS_BASE} indicadores={INDICADORES} aoAplicarFiltro={aoAplicarFiltro} />);

      await waitFor(() => expect(screen.getByText("Evolução por período")).toBeInTheDocument());
      const cartao = screen.getByText("Evolução por período").closest('[class*="rounded-card"]') as HTMLElement;
      fireEvent.click(within(cartao).getByRole("button", { name: /Filtrar por mai\/2026/ }));

      expect(aoAplicarFiltro).toHaveBeenCalledWith({ periodo_inicial: "2026-05-01", periodo_final: "2026-05-31" });
    });

    it("clique numa barra de 'Valores por período' aplica o intervalo do mês, mapeando pelo subconjunto com valor", async () => {
      mockarTodasAsDistribuicoes();
      const aoAplicarFiltro = vi.fn();
      render(<DashboardRecorte {...PROPS_BASE} indicadores={INDICADORES} aoAplicarFiltro={aoAplicarFiltro} />);

      await waitFor(() => expect(screen.getByText("Valores por período")).toBeInTheDocument());
      const cartao = screen.getByText("Valores por período").closest('[class*="rounded-card"]') as HTMLElement;
      // Só "2026-05" tem valor financeiro na fixture (`comValor` filtra
      // "2026-06", que tem `valor: null`) — índice do clique deve mapear
      // para o ponto certo mesmo com o subconjunto.
      fireEvent.click(within(cartao).getByRole("button", { name: /Filtrar por mai\/2026/ }));

      expect(aoAplicarFiltro).toHaveBeenCalledWith({ periodo_inicial: "2026-05-01", periodo_final: "2026-05-31" });
    });

    it("clique na legenda de 'Distribuição por motivo' aplica 'motivo'; o segmento 'Outros' nunca é clicável", async () => {
      mockarTodasAsDistribuicoes();
      const aoAplicarFiltro = vi.fn();
      render(<DashboardRecorte {...PROPS_BASE} indicadores={INDICADORES} aoAplicarFiltro={aoAplicarFiltro} />);

      await waitFor(() => expect(screen.getByText("Distribuição por motivo")).toBeInTheDocument());
      fireEvent.click(screen.getByRole("button", { name: "Filtrar por Capacitação" }));
      expect(aoAplicarFiltro).toHaveBeenCalledWith({ motivo: "Capacitação" });

      expect(screen.queryByRole("button", { name: "Filtrar por Outros" })).not.toBeInTheDocument();
      expect(screen.getByText("Outros")).toBeInTheDocument();
    });

    it("clique na legenda de 'Distribuição por situação do servidor' aplica 'situacao'", async () => {
      mockarTodasAsDistribuicoes();
      const aoAplicarFiltro = vi.fn();
      render(<DashboardRecorte {...PROPS_BASE} indicadores={INDICADORES} aoAplicarFiltro={aoAplicarFiltro} />);

      await waitFor(() => expect(screen.getByText("Distribuição por situação do servidor")).toBeInTheDocument());
      fireEvent.click(screen.getByRole("button", { name: "Filtrar por Em exercício" }));
      expect(aoAplicarFiltro).toHaveBeenCalledWith({ situacao: "Em exercício" });
    });

    it("clique numa barra de 'Origem × Destino' aplica 'origem' e 'destino' juntos, a partir do par exibido", async () => {
      mockarTodasAsDistribuicoes();
      const aoAplicarFiltro = vi.fn();
      render(<DashboardRecorte {...PROPS_BASE} indicadores={INDICADORES} aoAplicarFiltro={aoAplicarFiltro} />);

      await waitFor(() => expect(screen.getByText("Origem × Destino (principais pares)")).toBeInTheDocument());
      fireEvent.click(screen.getByRole("button", { name: /Filtrar por Recife-PE → Araripina-PE/ }));

      expect(aoAplicarFiltro).toHaveBeenCalledWith({ origem: "Recife-PE", destino: "Araripina-PE" });
    });

    it("buckets sintéticos (dado ausente) nunca viram botão de filtro — barra continua visível, só não clicável", async () => {
      obterDistribuicaoMock.mockImplementation(async (parametros: ParametrosDistribuicaoQuery) => {
        if (parametros.dimensao === "servidor") {
          return {
            dimensao: "servidor",
            pontos: [
              { rotulo: "Servidor sem cadastro", contagem: 3, valor: null },
              ...DISTRIBUICOES.servidor.pontos,
            ],
          };
        }
        return DISTRIBUICOES[parametros.dimensao];
      });
      render(<DashboardRecorte {...PROPS_BASE} indicadores={INDICADORES} />);

      await waitFor(() => expect(screen.getByText("Ranking de servidores")).toBeInTheDocument());
      expect(screen.getByText("Servidor sem cadastro")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Filtrar por Servidor sem cadastro/ })).not.toBeInTheDocument();
    });

    it("par 'Origem × Destino' com um lado sintético nunca vira botão de filtro", async () => {
      obterDistribuicaoMock.mockImplementation(async (parametros: ParametrosDistribuicaoQuery) => {
        if (parametros.dimensao === "origem_destino") {
          return {
            dimensao: "origem_destino",
            pontos: [
              { rotulo: "Sem origem informada → Petrolina-PE", contagem: 2, valor: null },
              ...DISTRIBUICOES.origem_destino.pontos,
            ],
          };
        }
        return DISTRIBUICOES[parametros.dimensao];
      });
      render(<DashboardRecorte {...PROPS_BASE} indicadores={INDICADORES} />);

      await waitFor(() => expect(screen.getByText("Origem × Destino (principais pares)")).toBeInTheDocument());
      expect(screen.getByText("Sem origem informada → Petrolina-PE")).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /Filtrar por Sem origem informada → Petrolina-PE/ }),
      ).not.toBeInTheDocument();
    });
  });
});
