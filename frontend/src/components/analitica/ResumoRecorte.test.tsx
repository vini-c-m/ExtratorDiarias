// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ResumoRecorte from "./ResumoRecorte";
import type { IndicadoresResposta, ResultadoPesquisaResposta } from "../../types/analitica";

const RESULTADO: ResultadoPesquisaResposta = {
  itens: [],
  paginacao: { pagina_atual: 1, tamanho_pagina: 25, total_itens: 312, total_paginas: 13 },
  sincronizacao: { sincronizado_em: "2026-08-01T10:00:00", total_avisos: 0 },
};

const INDICADORES: IndicadoresResposta = {
  total_diarias: 312,
  total_servidores: 298,
  valor_total: 149760,
  valor_medio: 480,
  sincronizacao: { sincronizado_em: "2026-08-01T10:00:00", total_avisos: 0 },
};

// Props obrigatórias de 19.6.2.1 — padrão "tudo ok, indicadores ainda não
// chegaram" para os testes que não exercitam carregando/erro dos
// indicadores especificamente.
const PROPS_INDICADORES_BASE = {
  indicadoresCarregando: false,
  indicadoresErro: null,
  aoTentarNovamenteIndicadores: () => {},
};

afterEach(() => {
  cleanup();
});

describe("ResumoRecorte", () => {
  it("carregando: não renderiza nada", () => {
    const { container } = render(
      <ResumoRecorte carregando resultado={null} indicadores={null} {...PROPS_INDICADORES_BASE} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("sem resultado ainda: não renderiza nada", () => {
    const { container } = render(
      <ResumoRecorte carregando={false} resultado={null} indicadores={null} {...PROPS_INDICADORES_BASE} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("com resultado, sem indicadores ainda (carregando/falhou): mostra só a contagem total formatada", () => {
    render(
      <ResumoRecorte
        carregando={false}
        resultado={RESULTADO}
        indicadores={null}
        {...PROPS_INDICADORES_BASE}
      />,
    );
    expect(screen.getByText("312 registros no recorte atual")).toBeInTheDocument();
  });

  it("singular quando há exatamente 1 registro", () => {
    const resultadoUmItem: ResultadoPesquisaResposta = {
      ...RESULTADO,
      paginacao: { ...RESULTADO.paginacao, total_itens: 1 },
    };
    render(
      <ResumoRecorte
        carregando={false}
        resultado={resultadoUmItem}
        indicadores={null}
        {...PROPS_INDICADORES_BASE}
      />,
    );
    expect(screen.getByText("1 registro no recorte atual")).toBeInTheDocument();
  });

  it("zero registros: mostra a contagem zerada, não esconde o componente", () => {
    const resultadoVazio: ResultadoPesquisaResposta = {
      ...RESULTADO,
      paginacao: { ...RESULTADO.paginacao, total_itens: 0 },
    };
    render(
      <ResumoRecorte
        carregando={false}
        resultado={resultadoVazio}
        indicadores={null}
        {...PROPS_INDICADORES_BASE}
      />,
    );
    expect(screen.getByText("0 registros no recorte atual")).toBeInTheDocument();
  });

  // Sprint 19.6.2 — `GET /indicadores` (19.6.1): valor total/médio reais.
  describe("indicadores reais (correção 19.6.2)", () => {
    it("com indicadores carregados: mostra contagem, total de servidores, valor total e valor médio, formatados em BRL", () => {
      render(
        <ResumoRecorte
          carregando={false}
          resultado={RESULTADO}
          indicadores={INDICADORES}
          {...PROPS_INDICADORES_BASE}
        />,
      );

      expect(
        screen.getByText(
          "312 registros no recorte atual · 298 servidores · R$ 149.760,00 no total · R$ 480,00 em média",
        ),
      ).toBeInTheDocument();
    });

    it("indicadores com valor_total/valor_medio null (recorte sem nenhum valor preenchido): mostra contagem e total de servidores, sem valores", () => {
      const indicadoresSemValor: IndicadoresResposta = {
        ...INDICADORES,
        valor_total: null,
        valor_medio: null,
      };
      render(
        <ResumoRecorte
          carregando={false}
          resultado={RESULTADO}
          indicadores={indicadoresSemValor}
          {...PROPS_INDICADORES_BASE}
        />,
      );

      expect(screen.getByText("312 registros no recorte atual · 298 servidores")).toBeInTheDocument();
    });
  });

  // Sprint 19.6.2.1 — correção da Auditoria Técnica da 19.6.2: estados
  // explícitos de carregando/erro dos indicadores, total de servidores e
  // distinção nulo vs. zero.
  describe("estados explícitos dos indicadores (correção 19.6.2.1)", () => {
    it("indicadores carregando: mostra a contagem da tabela e o aviso de cálculo em andamento, nunca um valor de outro recorte", () => {
      render(
        <ResumoRecorte
          carregando={false}
          resultado={RESULTADO}
          indicadores={null}
          indicadoresCarregando
          indicadoresErro={null}
          aoTentarNovamenteIndicadores={() => {}}
        />,
      );

      expect(screen.getByText("312 registros no recorte atual")).toBeInTheDocument();
      expect(screen.getByText("Calculando indicadores deste recorte...")).toBeInTheDocument();
      expect(screen.queryByText(/no total/)).not.toBeInTheDocument();
      expect(screen.queryByText(/em média/)).not.toBeInTheDocument();
    });

    it("indicadores com erro: mostra o alerta de erro e o botão 'Tentar novamente', que aciona o callback recebido", () => {
      const aoTentarNovamente = vi.fn();
      render(
        <ResumoRecorte
          carregando={false}
          resultado={RESULTADO}
          indicadores={null}
          indicadoresCarregando={false}
          indicadoresErro="Não foi possível carregar os indicadores."
          aoTentarNovamenteIndicadores={aoTentarNovamente}
        />,
      );

      expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível carregar os indicadores.");
      fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
      expect(aoTentarNovamente).toHaveBeenCalledTimes(1);
    });

    it("total de servidores real (zero) aparece como '0 servidores', nunca omitido", () => {
      const indicadoresZeroServidores: IndicadoresResposta = {
        ...INDICADORES,
        total_servidores: 0,
        valor_total: 0,
        valor_medio: 0,
      };
      render(
        <ResumoRecorte
          carregando={false}
          resultado={RESULTADO}
          indicadores={indicadoresZeroServidores}
          {...PROPS_INDICADORES_BASE}
        />,
      );

      expect(
        screen.getByText("312 registros no recorte atual · 0 servidores · R$ 0,00 no total · R$ 0,00 em média"),
      ).toBeInTheDocument();
    });

    it("valor_total/valor_medio nulos nunca viram 'R$ 0,00' (distinção nulo vs. zero real)", () => {
      const indicadoresValoresNulos: IndicadoresResposta = {
        ...INDICADORES,
        valor_total: null,
        valor_medio: null,
      };
      render(
        <ResumoRecorte
          carregando={false}
          resultado={RESULTADO}
          indicadores={indicadoresValoresNulos}
          {...PROPS_INDICADORES_BASE}
        />,
      );

      expect(screen.queryByText(/R\$ 0,00/)).not.toBeInTheDocument();
    });
  });
});
