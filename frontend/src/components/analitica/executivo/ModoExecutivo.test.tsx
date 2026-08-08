// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  DiagnosticoResposta,
  DimensaoDistribuicao,
  DistribuicaoResposta,
  IndicadoresResposta,
  ParametrosDistribuicaoQuery,
} from "../../../types/analitica";

vi.mock("../IndicadorSincronizacao", () => ({
  default: () => <div>Indicador de sincronização</div>,
}));

vi.mock("../../../services/api", async (importarOriginal) => {
  const real = await importarOriginal<typeof import("../../../services/api")>();
  return {
    ...real,
    obterDistribuicao: vi.fn(),
    obterDiagnostico: vi.fn(),
    obterIndicadores: vi.fn(),
    gerarRelatorio: vi.fn(),
  };
});

import ModoExecutivo from "./ModoExecutivo";
import { gerarRelatorio, obterDiagnostico, obterDistribuicao, obterIndicadores } from "../../../services/api";

const obterDistribuicaoMock = vi.mocked(obterDistribuicao);
const obterDiagnosticoMock = vi.mocked(obterDiagnostico);
const obterIndicadoresMock = vi.mocked(obterIndicadores);
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
      { rotulo: "2026-06", contagem: 12, valor: 4800 },
    ],
  },
  servidor: { dimensao: "servidor", pontos: [] },
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
    ],
  },
  situacao: {
    dimensao: "situacao",
    pontos: [{ rotulo: "Em exercício", contagem: 94, valor: null }],
  },
  origem_destino: {
    dimensao: "origem_destino",
    pontos: [{ rotulo: "Recife-PE → Araripina-PE", contagem: 58, valor: 27840 }],
  },
  categoria_funcional: {
    dimensao: "categoria_funcional",
    pontos: [
      { rotulo: "SERVIDOR", contagem: 78, valor: 37440 },
      { rotulo: "MEMBRO", contagem: 22, valor: 10560 },
    ],
  },
  doc_origem: {
    dimensao: "doc_origem",
    pontos: [{ rotulo: "GABPGJ - Gabinete do Procurador-Geral de Justiça", contagem: 40, valor: 19200 }],
  },
  transporte: {
    dimensao: "transporte",
    pontos: [
      { rotulo: "CARRO", contagem: 61, valor: 29280 },
      { rotulo: "Transporte não identificado", contagem: 8, valor: null },
    ],
  },
};

const DIAGNOSTICO: DiagnosticoResposta = {
  resumo: { esperado: 280, atencao: 25, inconsistencia: 7 },
  registros: [],
};

const PROPS_BASE = {
  backendOnline: true,
  filtros: { pagina: 1, tamanho_pagina: 25 },
  indicadores: INDICADORES,
  indicadoresCarregando: false,
  indicadoresErro: null,
  aoTentarNovamenteIndicadores: () => {},
  onMudarFiltro: () => {},
  onRemoverFiltro: () => {},
  onLimparTudo: () => {},
  aoVoltar: () => {},
  aoAbrirRelatorio: () => {},
  aoAbrirDiagnostico: () => {},
};

const INDICADORES_B: IndicadoresResposta = {
  total_diarias: 289,
  total_servidores: 270,
  valor_total: 138200,
  valor_medio: 478,
  sincronizacao: { sincronizado_em: "2026-07-01T10:00:00", total_avisos: 0 },
};

function mockarTudo() {
  obterDistribuicaoMock.mockImplementation(async (parametros: ParametrosDistribuicaoQuery) => DISTRIBUICOES[parametros.dimensao]);
  obterDiagnosticoMock.mockResolvedValue(DIAGNOSTICO);
  obterIndicadoresMock.mockResolvedValue(INDICADORES_B);
}

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe("ModoExecutivo", () => {
  it("mostra o cabeçalho, os KPIs e os gráficos com dado real, sem tocar nenhum estado paralelo de filtro", async () => {
    mockarTudo();
    render(<ModoExecutivo {...PROPS_BASE} />);

    expect(screen.getByRole("heading", { name: "Modo Executivo" })).toBeInTheDocument();
    expect(screen.getByText("Todos os períodos")).toBeInTheDocument();

    // KPIs "clássicos" (já resolvidos via props, sem chamada própria)
    expect(screen.getByText("312")).toBeInTheDocument();
    expect(screen.getByText("298")).toBeInTheDocument();

    await waitFor(() => expect(screen.getByText("Municípios")).toBeInTheDocument());
    expect(screen.getByText("Membros × Servidores")).toBeInTheDocument();
    expect(screen.getByText("Meio de transporte")).toBeInTheDocument();
    expect(screen.getByText("Unidade solicitante (documento de origem)")).toBeInTheDocument();
  });

  it("KPI 'Membros · Servidores' calcula o percentual a partir da distribuição categoria_funcional já carregada", async () => {
    mockarTudo();
    render(<ModoExecutivo {...PROPS_BASE} />);

    // 22 de 100 = 22,0% (MEMBRO) · 78,0% (SERVIDOR), na ordem do backend.
    await waitFor(() => expect(screen.getByText("22% · 78%")).toBeInTheDocument());
  });

  it("período do recorte aparece resumido no cabeçalho quando os dois limites estão preenchidos", () => {
    mockarTudo();
    render(<ModoExecutivo {...PROPS_BASE} filtros={{ ...PROPS_BASE.filtros, periodo_inicial: "2026-06-01", periodo_final: "2026-06-30" }} />);

    expect(screen.getByText("01–30/06/2026")).toBeInTheDocument();
  });

  it("'← Voltar ao Modo Operacional' aciona o callback recebido", () => {
    mockarTudo();
    const aoVoltar = vi.fn();
    render(<ModoExecutivo {...PROPS_BASE} aoVoltar={aoVoltar} />);

    fireEvent.click(screen.getByRole("button", { name: "← Voltar ao Modo Operacional" }));
    expect(aoVoltar).toHaveBeenCalledTimes(1);
  });

  it("toggle de categoria funcional chama onMudarFiltro com categoria_funcional=MEMBRO — mesmo mecanismo da Sprint 20, sem segunda implementação", async () => {
    mockarTudo();
    const onMudarFiltro = vi.fn();
    render(<ModoExecutivo {...PROPS_BASE} onMudarFiltro={onMudarFiltro} />);

    await userEvent.click(screen.getByRole("radio", { name: "Membros" }));

    expect(onMudarFiltro).toHaveBeenCalledWith({ categoria_funcional: "MEMBRO" });
  });

  describe("painel lateral contextual (Sprint 21.4)", () => {
    it("clicar num município do gráfico abre o painel lateral com o resumo do ponto, sem aplicar filtro nem sair do Modo Executivo sozinho", async () => {
      mockarTudo();
      const onMudarFiltro = vi.fn();
      const aoVoltar = vi.fn();
      render(<ModoExecutivo {...PROPS_BASE} onMudarFiltro={onMudarFiltro} aoVoltar={aoVoltar} />);

      await waitFor(() => expect(screen.getByText("Municípios")).toBeInTheDocument());
      fireEvent.click(screen.getByRole("button", { name: /Filtrar por Araripina-PE/ }));

      const painel = within(screen.getByRole("dialog"));
      expect(painel.getByRole("heading", { name: "Araripina-PE" })).toBeInTheDocument();
      expect(painel.getByText("89")).toBeInTheDocument(); // Diárias do ponto
      expect(painel.getByText("R$ 42.720,00")).toBeInTheDocument(); // Valor do ponto
      expect(onMudarFiltro).not.toHaveBeenCalled();
      expect(aoVoltar).not.toHaveBeenCalled();
    });

    it("'Aplicar filtro' no painel aplica o filtro do ponto, fecha o painel e volta ao Modo Operacional", async () => {
      mockarTudo();
      const onMudarFiltro = vi.fn();
      const aoVoltar = vi.fn();
      render(<ModoExecutivo {...PROPS_BASE} onMudarFiltro={onMudarFiltro} aoVoltar={aoVoltar} />);
      await waitFor(() => expect(screen.getByText("Municípios")).toBeInTheDocument());
      fireEvent.click(screen.getByRole("button", { name: /Filtrar por Araripina-PE/ }));

      fireEvent.click(screen.getByRole("button", { name: "Aplicar filtro" }));

      expect(onMudarFiltro).toHaveBeenCalledWith({ municipio: "Araripina-PE" });
      expect(aoVoltar).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("'Abrir relatório' aplica o filtro do ponto e delega a navegação, sem chamar aoVoltar", async () => {
      mockarTudo();
      const onMudarFiltro = vi.fn();
      const aoAbrirRelatorio = vi.fn();
      const aoVoltar = vi.fn();
      render(
        <ModoExecutivo
          {...PROPS_BASE}
          onMudarFiltro={onMudarFiltro}
          aoAbrirRelatorio={aoAbrirRelatorio}
          aoVoltar={aoVoltar}
        />,
      );
      await waitFor(() => expect(screen.getByText("Municípios")).toBeInTheDocument());
      fireEvent.click(screen.getByRole("button", { name: /Filtrar por Araripina-PE/ }));

      fireEvent.click(screen.getByRole("button", { name: "Abrir relatório" }));

      expect(onMudarFiltro).toHaveBeenCalledWith({ municipio: "Araripina-PE" });
      expect(aoAbrirRelatorio).toHaveBeenCalledTimes(1);
      expect(aoVoltar).not.toHaveBeenCalled();
    });

    it("'Abrir diagnóstico' aplica o filtro do ponto e delega a navegação", async () => {
      mockarTudo();
      const onMudarFiltro = vi.fn();
      const aoAbrirDiagnostico = vi.fn();
      render(<ModoExecutivo {...PROPS_BASE} onMudarFiltro={onMudarFiltro} aoAbrirDiagnostico={aoAbrirDiagnostico} />);
      await waitFor(() => expect(screen.getByText("Municípios")).toBeInTheDocument());
      fireEvent.click(screen.getByRole("button", { name: /Filtrar por Araripina-PE/ }));

      fireEvent.click(screen.getByRole("button", { name: "Abrir diagnóstico" }));

      expect(onMudarFiltro).toHaveBeenCalledWith({ municipio: "Araripina-PE" });
      expect(aoAbrirDiagnostico).toHaveBeenCalledTimes(1);
    });

    it("fecha com Esc, sem aplicar nenhum filtro", async () => {
      mockarTudo();
      const onMudarFiltro = vi.fn();
      render(<ModoExecutivo {...PROPS_BASE} onMudarFiltro={onMudarFiltro} />);
      await waitFor(() => expect(screen.getByText("Municípios")).toBeInTheDocument());
      fireEvent.click(screen.getByRole("button", { name: /Filtrar por Araripina-PE/ }));
      expect(screen.getByRole("dialog")).toBeInTheDocument();

      fireEvent.keyDown(window, { key: "Escape" });

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(onMudarFiltro).not.toHaveBeenCalled();
    });

    it("fecha com o botão '✕'", async () => {
      mockarTudo();
      render(<ModoExecutivo {...PROPS_BASE} />);
      await waitFor(() => expect(screen.getByText("Municípios")).toBeInTheDocument());
      fireEvent.click(screen.getByRole("button", { name: /Filtrar por Araripina-PE/ }));

      fireEvent.click(screen.getByRole("button", { name: "Fechar painel" }));

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("mostra 'Principais motivos' e 'Principais pessoas' filtrados pelo ponto clicado (município), com filtro composto sobre o recorte vigente", async () => {
      mockarTudo();
      obterDistribuicaoMock.mockImplementation(async (parametros) => {
        if (parametros.dimensao === "motivo" && parametros.municipio === "Araripina-PE") {
          return { dimensao: "motivo", pontos: [{ rotulo: "Fiscalização", contagem: 12, valor: 5760 }] };
        }
        if (parametros.dimensao === "servidor" && parametros.municipio === "Araripina-PE") {
          return { dimensao: "servidor", pontos: [{ rotulo: "João da Silva", contagem: 6, valor: 2880 }] };
        }
        return DISTRIBUICOES[parametros.dimensao];
      });
      render(<ModoExecutivo {...PROPS_BASE} />);
      await waitFor(() => expect(screen.getByText("Municípios")).toBeInTheDocument());

      fireEvent.click(screen.getByRole("button", { name: /Filtrar por Araripina-PE/ }));

      expect(screen.getByText("Principais motivos")).toBeInTheDocument();
      expect(screen.getByText("Principais pessoas")).toBeInTheDocument();
      expect(await screen.findByText("Fiscalização")).toBeInTheDocument();
      expect(screen.getByText("João da Silva")).toBeInTheDocument();
    });

    it("clicar num ponto de MOTIVO nunca mostra a seção 'Principais motivos' de novo (seria um único bucket a 100%, redundante)", async () => {
      mockarTudo();
      render(<ModoExecutivo {...PROPS_BASE} />);
      await waitFor(() => expect(screen.getByText("Motivos")).toBeInTheDocument());

      await userEvent.click(screen.getByRole("button", { name: /Filtrar por Capacitação/ }));

      expect(screen.getByRole("heading", { name: "Capacitação" })).toBeInTheDocument();
      expect(screen.queryByText("Principais motivos")).not.toBeInTheDocument();
      expect(screen.getByText("Principais pessoas")).toBeInTheDocument();
    });
  });

  it("gráfico 'Unidade solicitante (documento de origem)' nunca filtra ao clicar — doc_origem não é campo de FiltrosDiaria", async () => {
    mockarTudo();
    const onMudarFiltro = vi.fn();
    render(<ModoExecutivo {...PROPS_BASE} onMudarFiltro={onMudarFiltro} />);

    await waitFor(() =>
      expect(screen.getByText("GABPGJ - Gabinete do Procurador-Geral de Justiça")).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("button", { name: /Filtrar por GABPGJ/ }),
    ).not.toBeInTheDocument();
  });

  it("indicadores ainda carregando: mostra o aviso de cálculo, sem KPIs prontos", () => {
    mockarTudo();
    render(<ModoExecutivo {...PROPS_BASE} indicadores={null} indicadoresCarregando />);

    expect(screen.getByText("Calculando indicadores deste recorte...")).toBeInTheDocument();
    expect(screen.queryByText("312")).not.toBeInTheDocument();
  });

  it("indicadores com erro: mostra o alerta e aciona 'Tentar novamente'", () => {
    mockarTudo();
    const aoTentarNovamente = vi.fn();
    render(
      <ModoExecutivo
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

  describe("modo apresentação (Sprint 21.8)", () => {
    it("'Modo apresentação' troca a tela normal pela apresentação, sempre na seção 'Indicadores'", async () => {
      mockarTudo();
      render(<ModoExecutivo {...PROPS_BASE} />);
      await waitFor(() => expect(screen.getByText("Municípios")).toBeInTheDocument());

      await userEvent.click(screen.getByRole("button", { name: "Modo apresentação" }));

      expect(screen.queryByRole("heading", { name: "Modo Executivo" })).not.toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Indicadores" })).toBeInTheDocument();
      expect(screen.getByText("312")).toBeInTheDocument();
    });

    it("'Sair' na apresentação devolve a tela normal do Modo Executivo, com o mesmo recorte", async () => {
      mockarTudo();
      render(<ModoExecutivo {...PROPS_BASE} />);
      await waitFor(() => expect(screen.getByText("Municípios")).toBeInTheDocument());
      await userEvent.click(screen.getByRole("button", { name: "Modo apresentação" }));

      await userEvent.click(screen.getByRole("button", { name: "Sair do modo apresentação" }));

      expect(screen.getByRole("heading", { name: "Modo Executivo" })).toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "Indicadores" })).not.toBeInTheDocument();
    });

    it("Esc na apresentação também sai, devolvendo a tela normal", async () => {
      mockarTudo();
      render(<ModoExecutivo {...PROPS_BASE} />);
      await waitFor(() => expect(screen.getByText("Municípios")).toBeInTheDocument());
      await userEvent.click(screen.getByRole("button", { name: "Modo apresentação" }));

      fireEvent.keyDown(window, { key: "Escape" });

      expect(screen.getByRole("heading", { name: "Modo Executivo" })).toBeInTheDocument();
    });

    it("na apresentação, clicar num ponto de gráfico nunca abre o painel lateral nem aplica filtro (view-only)", async () => {
      mockarTudo();
      const onMudarFiltro = vi.fn();
      render(<ModoExecutivo {...PROPS_BASE} onMudarFiltro={onMudarFiltro} />);
      await waitFor(() => expect(screen.getByText("Municípios")).toBeInTheDocument());
      await userEvent.click(screen.getByRole("button", { name: "Modo apresentação" }));
      await userEvent.click(screen.getByRole("tab", { name: /Gráficos/ }));
      await waitFor(() => expect(screen.getByText("Municípios")).toBeInTheDocument());

      fireEvent.click(screen.getByRole("button", { name: /Filtrar por Araripina-PE/ }));

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(onMudarFiltro).not.toHaveBeenCalled();
    });

    it("navega para a seção de Gráficos e depois Insights pelos pontos/setas", async () => {
      mockarTudo();
      render(<ModoExecutivo {...PROPS_BASE} />);
      await waitFor(() => expect(screen.getByText("Municípios")).toBeInTheDocument());
      await userEvent.click(screen.getByRole("button", { name: "Modo apresentação" }));

      await userEvent.click(screen.getByRole("button", { name: "Próxima seção" }));
      expect(screen.getByRole("heading", { name: "Gráficos" })).toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: "Próxima seção" }));
      expect(screen.getByRole("heading", { name: "Insights" })).toBeInTheDocument();
    });
  });

  describe("insights determinísticos (Sprint 21.5)", () => {
    it("recorte sem nada a destacar: nenhum painel de Insights renderizado", async () => {
      mockarTudo();
      // Fixture genuinamente vazia para as 4 dimensões que alimentam os
      // insights financeiros/gerenciais (BI 4.0) — sem período, sem
      // concentração, sem categoria/unidade líder.
      obterDistribuicaoMock.mockImplementation(async (parametros) => {
        if (parametros.dimensao === "periodo") return { dimensao: "periodo", pontos: [] };
        if (parametros.dimensao === "municipio") return { dimensao: "municipio", pontos: [] };
        if (parametros.dimensao === "categoria_funcional") return { dimensao: "categoria_funcional", pontos: [] };
        if (parametros.dimensao === "doc_origem") return { dimensao: "doc_origem", pontos: [] };
        return DISTRIBUICOES[parametros.dimensao];
      });
      render(<ModoExecutivo {...PROPS_BASE} />);
      await waitFor(() => expect(screen.getByText("Municípios")).toBeInTheDocument());

      expect(screen.queryByText("Insights")).not.toBeInTheDocument();
    });

    // BI 4.0 — a lateral do Modo Executivo passou a ser exclusivamente
    // financeira/gerencial (pedido explícito do usuário): diagnóstico
    // (duplicidade, DH ausente, aguardando liberação) não aparece mais
    // aqui, mesmo com casos no recorte. A célula "Atenção (diagnóstico)"
    // da faixa de KPI foi removida do Modo Executivo nesta mesma Sprint
    // (ver describe "faixa de KPI" abaixo) — o dado segue acessível em
    // Diagnóstico geral e no drill-down do painel lateral contextual.
    it("nunca mostra insight de diagnóstico na lateral, mesmo com casos no recorte", async () => {
      mockarTudo();
      obterDiagnosticoMock.mockResolvedValue({
        resumo: { esperado: 0, atencao: 1, inconsistencia: 0 },
        registros: [{ sei: "19.20.0001/2026-01", classificacao: "atencao", casos: [{ campo: null, titulo: "Possível duplicidade", motivo: "m", acao_recomendada: "a" }] }],
      });
      render(<ModoExecutivo {...PROPS_BASE} />);

      await waitFor(() => expect(screen.getByText("Insights")).toBeInTheDocument());
      expect(screen.queryByText(/possível duplicidade/i)).not.toBeInTheDocument();
      expect(screen.queryByText("Atenção (diagnóstico)")).not.toBeInTheDocument();
    });

    it("mostra o insight de concentração de gastos com ação 'Aplicar filtro' para o município top", async () => {
      mockarTudo();
      obterDistribuicaoMock.mockImplementation(async (parametros) =>
        parametros.dimensao === "municipio"
          ? {
              dimensao: "municipio",
              pontos: [
                { rotulo: "Araripina-PE", contagem: 89, valor: 8000 },
                { rotulo: "Petrolina-PE", contagem: 10, valor: 500 },
                { rotulo: "Recife-PE", contagem: 5, valor: 500 },
              ],
            }
          : DISTRIBUICOES[parametros.dimensao],
      );
      const onMudarFiltro = vi.fn();
      render(<ModoExecutivo {...PROPS_BASE} onMudarFiltro={onMudarFiltro} />);

      await waitFor(() => expect(screen.getByText(/município\(s\) concentram/)).toBeInTheDocument());
      await userEvent.click(screen.getByRole("button", { name: "Aplicar filtro" }));

      expect(onMudarFiltro).toHaveBeenCalledWith({ municipio: "Araripina-PE" });
    });

    it("com período definido no recorte, mostra o insight de variação vs. período anterior", async () => {
      mockarTudo();
      obterIndicadoresMock.mockResolvedValue({
        total_diarias: 100,
        total_servidores: 90,
        valor_total: 100000,
        valor_medio: 1000,
        sincronizacao: { sincronizado_em: "2026-06-01T10:00:00", total_avisos: 0 },
      });
      render(
        <ModoExecutivo
          {...PROPS_BASE}
          filtros={{ ...PROPS_BASE.filtros, periodo_inicial: "2026-07-01", periodo_final: "2026-07-31" }}
        />,
      );

      // Duas variações de período aparecem agora (valor total e valor
      // médio, BI 4.0) — basta confirmar que pelo menos uma renderiza.
      await waitFor(() => expect(screen.getAllByText(/em relação a/).length).toBeGreaterThan(0));
    });
  });

  describe("zoom temporal (Sprint 21.7)", () => {
    it("selecionar um intervalo em 'Evolução da quantidade' e aplicar chama onMudarFiltro com os limites do(s) mês(es)", async () => {
      mockarTudo();
      const onMudarFiltro = vi.fn();
      render(<ModoExecutivo {...PROPS_BASE} onMudarFiltro={onMudarFiltro} />);
      await waitFor(() => expect(screen.getByText("Evolução da quantidade")).toBeInTheDocument());

      // "mai/2026: 8" (contagem) é só do gráfico de quantidade — o de
      // gastos mostra o mesmo mês formatado em R$, nome acessível distinto.
      const zonaMaio = screen.getByRole("button", { name: "mai/2026: 8 — selecionar para o intervalo de zoom" });
      fireEvent.pointerDown(zonaMaio);
      fireEvent.pointerUp(zonaMaio);
      fireEvent.click(screen.getByRole("button", { name: "Aplicar como filtro" }));

      expect(onMudarFiltro).toHaveBeenCalledWith({ periodo_inicial: "2026-05-01", periodo_final: "2026-05-31" });
    });

    it("o zoom nunca abre o painel lateral (fluxo distinto do clique-refina das demais dimensões)", async () => {
      mockarTudo();
      render(<ModoExecutivo {...PROPS_BASE} />);
      await waitFor(() => expect(screen.getByText("Evolução da quantidade")).toBeInTheDocument());

      const zonaMaio = screen.getByRole("button", { name: "mai/2026: 8 — selecionar para o intervalo de zoom" });
      fireEvent.pointerDown(zonaMaio);
      fireEvent.pointerUp(zonaMaio);

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  describe("comparação (Sprint 21.6)", () => {
    it("'Comparar' → 'Mês atual × mês anterior' aplica o mês atual em A e mostra os KPIs A/B com variação", async () => {
      mockarTudo();
      const onMudarFiltro = vi.fn();
      render(<ModoExecutivo {...PROPS_BASE} onMudarFiltro={onMudarFiltro} />);

      await userEvent.click(screen.getByRole("button", { name: "Comparar" }));
      await userEvent.click(screen.getByRole("menuitem", { name: "Mês atual × mês anterior" }));

      expect(onMudarFiltro).toHaveBeenCalledWith(expect.objectContaining({ periodo_inicial: expect.any(String) }));
      expect(await screen.findByText("A: 312")).toBeInTheDocument();
      expect(await screen.findByText(/B: 289/)).toBeInTheDocument();
      expect(screen.getByText(/-7,4%/)).toBeInTheDocument(); // (289-312)/312
      expect(screen.getByRole("button", { name: "Encerrar comparação" })).toBeInTheDocument();
    });

    it("'Membros × Servidores' aplica MEMBRO no toggle de categoria (mesmo mecanismo já homologado da Sprint 20)", async () => {
      mockarTudo();
      const onMudarFiltro = vi.fn();
      render(<ModoExecutivo {...PROPS_BASE} onMudarFiltro={onMudarFiltro} />);

      await userEvent.click(screen.getByRole("button", { name: "Comparar" }));
      await userEvent.click(screen.getByRole("menuitem", { name: "Membros × Servidores" }));

      expect(onMudarFiltro).toHaveBeenCalledWith({ categoria_funcional: "MEMBRO" });
      await waitFor(() => expect(screen.getByText("Comparando:")).toBeInTheDocument());
      const resumo = screen.getByText("Comparando:").closest("span") as HTMLElement;
      expect(within(resumo).getByText("Membros")).toBeInTheDocument();
      expect(within(resumo).getByText("Servidores")).toBeInTheDocument();
    });

    it("'Trocar A/B' inverte a ordem de exibição sem refazer a busca de B", async () => {
      mockarTudo();
      render(<ModoExecutivo {...PROPS_BASE} />);
      await userEvent.click(screen.getByRole("button", { name: "Comparar" }));
      await userEvent.click(screen.getByRole("menuitem", { name: "Mês atual × mês anterior" }));
      await screen.findByText("A: 312");
      const chamadasAntes = obterIndicadoresMock.mock.calls.length;

      await userEvent.click(screen.getByRole("button", { name: "Trocar A/B" }));

      expect(await screen.findByText("A: 289")).toBeInTheDocument();
      expect(screen.getByText(/B: 312/)).toBeInTheDocument();
      expect(obterIndicadoresMock.mock.calls.length).toBe(chamadasAntes);
    });

    it("'Encerrar comparação' volta aos KPIs simples, preservando o recorte A já aplicado", async () => {
      mockarTudo();
      render(<ModoExecutivo {...PROPS_BASE} />);
      await userEvent.click(screen.getByRole("button", { name: "Comparar" }));
      await userEvent.click(screen.getByRole("menuitem", { name: "Mês atual × mês anterior" }));
      await screen.findByText("A: 312");

      await userEvent.click(screen.getByRole("button", { name: "Encerrar comparação" }));

      expect(screen.queryByText("A: 312")).not.toBeInTheDocument();
      expect(screen.getByText("312")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Comparar" })).toBeInTheDocument();
    });

    it("erro ao buscar B: mostra alerta com 'Tentar novamente' isolado, nunca quebra os KPIs de A", async () => {
      mockarTudo();
      obterIndicadoresMock.mockRejectedValueOnce(new Error("falhou"));
      render(<ModoExecutivo {...PROPS_BASE} />);

      await userEvent.click(screen.getByRole("button", { name: "Comparar" }));
      await userEvent.click(screen.getByRole("menuitem", { name: "Mês atual × mês anterior" }));

      expect(await screen.findByRole("alert")).toHaveTextContent("falhou");
      obterIndicadoresMock.mockResolvedValueOnce(INDICADORES_B);
      await userEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
      expect(await screen.findByText("A: 312")).toBeInTheDocument();
    });
  });

  describe("PDF executivo (Sprint 21.9)", () => {
    const RESPOSTA_GERADA = {
      caminho_arquivo_temporario: "C:\\Temp\\extrator_diarias_relatorios\\abc123.pdf",
      nome_sugerido: "Visão Executiva - 05-08-2026.pdf",
      sincronizado_em: "2026-08-05T10:32:00",
    };

    it("'Exportar' chama POST /relatorios com tipo='visao_executiva', sem tabela, com os insights já calculados", async () => {
      mockarTudo();
      obterDiagnosticoMock.mockResolvedValue({
        resumo: { esperado: 0, atencao: 1, inconsistencia: 0 },
        registros: [{ sei: "19.20.0001/2026-01", classificacao: "atencao", casos: [{ campo: null, titulo: "Possível duplicidade", motivo: "m", acao_recomendada: "a" }] }],
      });
      gerarRelatorioMock.mockResolvedValueOnce(RESPOSTA_GERADA);
      window.api = {
        salvarRelatorio: vi.fn().mockResolvedValue({ caminhoArquivo: "C:\\x\\relatorio.pdf", pastaArquivo: "C:\\x" }),
      } as unknown as Window["api"];

      render(<ModoExecutivo {...PROPS_BASE} filtros={{ ...PROPS_BASE.filtros, motivo: "Reunião" }} />);
      await waitFor(() => expect(screen.getByText("Insights")).toBeInTheDocument());

      fireEvent.click(screen.getByRole("button", { name: /Exportar/ }));

      await waitFor(() => expect(gerarRelatorioMock).toHaveBeenCalledTimes(1));
      const [parametros] = gerarRelatorioMock.mock.calls[0];
      expect(parametros.tipo).toBe("visao_executiva");
      expect(parametros.formato).toBe("pdf");
      expect(parametros.modo).toBe("final");
      expect(parametros.incluir_indicadores).toBe(true);
      expect(parametros.incluir_graficos).toBe(true);
      expect(parametros.incluir_tabela).toBe(false);
      expect(parametros.incluir_inconsistencias).toBe(false);
      expect(parametros.filtros.motivo).toBe("Reunião");
      // BI 4.0 — insights exportados são só os financeiros/gerenciais da
      // lateral (nunca diagnóstico, mesmo com um caso no recorte).
      expect(parametros.insights).toEqual(
        expect.arrayContaining([expect.stringContaining("liderou as solicitações")]),
      );
      expect((parametros.insights ?? []).some((texto: string) => /duplicidade/i.test(texto))).toBe(false);

      await waitFor(() => expect(screen.getByText("✔ Relatório salvo com sucesso.")).toBeInTheDocument());
    });

    it("falha ao exportar: mostra alerta de erro com 'Tentar novamente'", async () => {
      mockarTudo();
      gerarRelatorioMock.mockRejectedValueOnce(new Error("Não foi possível gerar o relatório."));
      render(<ModoExecutivo {...PROPS_BASE} />);

      fireEvent.click(screen.getByRole("button", { name: /Exportar/ }));

      await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível gerar o relatório."));
      expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeInTheDocument();
    });

    it("'Abrir Local' após sucesso chama window.api.abrirArquivo com a pasta salva", async () => {
      mockarTudo();
      gerarRelatorioMock.mockResolvedValueOnce(RESPOSTA_GERADA);
      const abrirArquivoMock = vi.fn().mockResolvedValue(undefined);
      window.api = {
        salvarRelatorio: vi.fn().mockResolvedValue({ caminhoArquivo: "C:\\x\\relatorio.pdf", pastaArquivo: "C:\\x" }),
        abrirArquivo: abrirArquivoMock,
      } as unknown as Window["api"];
      render(<ModoExecutivo {...PROPS_BASE} />);

      fireEvent.click(screen.getByRole("button", { name: /Exportar/ }));
      await waitFor(() => expect(screen.getByRole("button", { name: "Abrir Local" })).toBeInTheDocument());

      fireEvent.click(screen.getByRole("button", { name: "Abrir Local" }));

      await waitFor(() => expect(abrirArquivoMock).toHaveBeenCalledWith("C:\\x"));
    });
  });
});
