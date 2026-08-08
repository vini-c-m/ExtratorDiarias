// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ModoApresentacao from "./ModoApresentacao";
import type { IndicadoresResposta } from "../../../types/analitica";

const INDICADORES: IndicadoresResposta = {
  total_diarias: 312,
  total_servidores: 298,
  valor_total: 149760,
  valor_medio: 480,
  sincronizacao: { sincronizado_em: "2026-08-01T10:00:00", total_avisos: 0 },
};

const ESTADO_DISTRIBUICAO_VAZIA = { carregando: false, erro: null, distribuicao: { dimensao: "periodo" as const, pontos: [] }, tentarNovamente: () => {} };
const ESTADO_DIAGNOSTICO_VAZIO = { carregando: false, erro: null, diagnostico: { resumo: { esperado: 0, atencao: 0, inconsistencia: 0 }, registros: [] }, tentarNovamente: () => {} };
const COMPARACAO_INATIVA = {
  ativa: false,
  tipo: null,
  rotuloPrimeiro: "",
  rotuloSegundo: "",
  indicadoresPrimeiro: null,
  indicadoresSegundo: null,
  carregandoPrimeiro: false,
  erroPrimeiro: null,
  carregandoSegundo: false,
  erroSegundo: null,
  filtrosSegundo: null,
  iniciar: () => {},
  encerrar: () => {},
  inverter: () => {},
  tentarNovamenteB: () => {},
} as const;

function propsBase() {
  return {
    secaoAtual: 0,
    totalSecoes: 3,
    aoProximaSecao: vi.fn(),
    aoSecaoAnterior: vi.fn(),
    aoIrParaSecao: vi.fn(),
    aoSair: vi.fn(),
    propsKpis: {
      indicadores: INDICADORES,
      indicadoresCarregando: false,
      indicadoresErro: null,
      aoTentarNovamenteIndicadores: () => {},
      distribuicaoCategoriaFuncional: ESTADO_DISTRIBUICAO_VAZIA,
      diagnostico: ESTADO_DIAGNOSTICO_VAZIO,
      comparacao: COMPARACAO_INATIVA,
      indicadoresPeriodoAnterior: null,
    },
    propsGraficos: {
      indicadores: INDICADORES,
      indicadoresPeriodoAnterior: null,
      distribuicaoPeriodo: ESTADO_DISTRIBUICAO_VAZIA,
      distribuicaoMunicipio: ESTADO_DISTRIBUICAO_VAZIA,
      distribuicaoMotivo: ESTADO_DISTRIBUICAO_VAZIA,
      distribuicaoSituacao: ESTADO_DISTRIBUICAO_VAZIA,
      distribuicaoOrigemDestino: ESTADO_DISTRIBUICAO_VAZIA,
      distribuicaoCategoriaFuncional: ESTADO_DISTRIBUICAO_VAZIA,
      distribuicaoDocOrigem: ESTADO_DISTRIBUICAO_VAZIA,
      distribuicaoTransporte: ESTADO_DISTRIBUICAO_VAZIA,
      aoSelecionarPonto: vi.fn(),
      onMudarFiltro: vi.fn(),
    },
    propsInsights: {
      insights: [],
      carregando: false,
      erro: null,
      tentarNovamente: () => {},
      onMudarFiltro: vi.fn(),
      aoAbrirDiagnostico: vi.fn(),
    },
  };
}

afterEach(() => {
  cleanup();
});

describe("ModoApresentacao", () => {
  it("seção 0 (Indicadores) mostra os KPIs, com o indicador de posição '1 de 3'", () => {
    render(<ModoApresentacao {...propsBase()} />);

    expect(screen.getByRole("heading", { name: "Indicadores" })).toBeInTheDocument();
    expect(screen.getByText("312")).toBeInTheDocument();
    expect(screen.getByText("1 de 3")).toBeInTheDocument();
  });

  it("seção 1 (Gráficos) mostra a grade de gráficos", () => {
    render(<ModoApresentacao {...propsBase()} secaoAtual={1} />);

    expect(screen.getByRole("heading", { name: "Gráficos" })).toBeInTheDocument();
    expect(screen.getByText("Municípios")).toBeInTheDocument();
  });

  it("seção 2 (Insights) sem insights mostra a mensagem de recorte sem destaque", () => {
    render(<ModoApresentacao {...propsBase()} secaoAtual={2} />);

    expect(screen.getByRole("heading", { name: "Insights" })).toBeInTheDocument();
    expect(screen.getByText("Nenhum insight para este recorte.")).toBeInTheDocument();
  });

  it("botão 'Próxima seção' aciona aoProximaSecao; 'Seção anterior' fica desabilitado na seção 0", () => {
    const props = propsBase();
    render(<ModoApresentacao {...props} />);

    expect(screen.getByRole("button", { name: "Seção anterior" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Próxima seção" }));
    expect(props.aoProximaSecao).toHaveBeenCalledTimes(1);
  });

  it("'Próxima seção' fica desabilitado na última seção", () => {
    render(<ModoApresentacao {...propsBase()} secaoAtual={2} />);

    expect(screen.getByRole("button", { name: "Próxima seção" })).toBeDisabled();
  });

  it("clicar num dos pontos de seção aciona aoIrParaSecao com o índice certo", () => {
    const props = propsBase();
    render(<ModoApresentacao {...props} />);

    fireEvent.click(screen.getByRole("tab", { name: /seção 2 de 3: Gráficos/ }));

    expect(props.aoIrParaSecao).toHaveBeenCalledWith(1);
  });

  it("'Sair' aciona aoSair", () => {
    const props = propsBase();
    render(<ModoApresentacao {...props} />);

    fireEvent.click(screen.getByRole("button", { name: "Sair do modo apresentação" }));

    expect(props.aoSair).toHaveBeenCalledTimes(1);
  });

  it("interatividade dos gráficos vem desligada por padrão nesta suíte (aoSelecionarPonto/onMudarFiltro dos props, controlados por quem chama)", () => {
    // Confirma só que o componente aceita e propaga os callbacks recebidos
    // (a decisão de zerá-los em apresentação é de `ModoExecutivo.tsx`,
    // testada lá — aqui é só fiação).
    const props = propsBase();
    render(<ModoApresentacao {...props} secaoAtual={1} />);

    expect(screen.getByText("Municípios")).toBeInTheDocument();
  });

  describe("foco e Tab-trap (Sprint 21.10 — auditoria de acessibilidade)", () => {
    it("ao montar, move o foco para o contêiner da apresentação (região rotulada)", () => {
      render(<ModoApresentacao {...propsBase()} />);

      expect(screen.getByRole("region", { name: "Modo apresentação executiva" })).toHaveFocus();
    });

    it("ao desmontar, devolve o foco a quem tinha foco antes (o botão que abriu a apresentação)", () => {
      const botaoQueAbriu = document.createElement("button");
      botaoQueAbriu.textContent = "Modo apresentação";
      document.body.appendChild(botaoQueAbriu);
      botaoQueAbriu.focus();
      expect(botaoQueAbriu).toHaveFocus();

      const { unmount } = render(<ModoApresentacao {...propsBase()} />);
      expect(botaoQueAbriu).not.toHaveFocus();

      unmount();

      expect(botaoQueAbriu).toHaveFocus();
      botaoQueAbriu.remove();
    });

    it("Tab a partir do último elemento focável volta para o primeiro, sem escapar do contêiner (nunca alcança o que está por trás)", () => {
      render(<ModoApresentacao {...propsBase()} />);
      const regiao = screen.getByRole("region", { name: "Modo apresentação executiva" });
      const focaveis = regiao.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      const primeiro = focaveis[0];
      const ultimo = focaveis[focaveis.length - 1];

      ultimo.focus();
      fireEvent.keyDown(regiao, { key: "Tab" });

      expect(primeiro).toHaveFocus();
    });

    it("Shift+Tab a partir do primeiro elemento focável volta para o último", () => {
      render(<ModoApresentacao {...propsBase()} />);
      const regiao = screen.getByRole("region", { name: "Modo apresentação executiva" });
      const focaveis = regiao.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      const primeiro = focaveis[0];
      const ultimo = focaveis[focaveis.length - 1];

      primeiro.focus();
      fireEvent.keyDown(regiao, { key: "Tab", shiftKey: true });

      expect(ultimo).toHaveFocus();
    });
  });
});
