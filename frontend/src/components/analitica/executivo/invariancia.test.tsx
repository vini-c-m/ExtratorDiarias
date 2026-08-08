// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import GradeKpisExecutivos from "./GradeKpisExecutivos";
import type { IndicadoresResposta } from "../../../types/analitica";

afterEach(() => {
  cleanup();
});

// Guarda-corpo de invariância (correção de regressão, 2026-08-07) — prova
// que a camada visual do Modo Executivo NUNCA troca o indicador do recorte
// ATUAL pelo do "período anterior" (usado só para o texto de delta desde o
// refinamento visual). Os dois objetos abaixo são propositalmente bem
// diferentes entre si — se algum refino futuro trocar `indicadores` por
// `indicadoresPeriodoAnterior` em qualquer um dos 4 KPIs centrais, este
// teste quebra imediatamente, mesmo que a troca resulte num número que
// "pareça plausível" à primeira vista.
const INDICADORES_ATUAL: IndicadoresResposta = {
  total_diarias: 1850,
  total_servidores: 308,
  valor_total: 935192.74,
  valor_medio: 506.6,
  sincronizacao: { sincronizado_em: "2026-08-07T19:41:35", total_avisos: 0 },
};

const INDICADORES_PERIODO_ANTERIOR: IndicadoresResposta = {
  total_diarias: 21,
  total_servidores: 15,
  valor_total: 7018.82,
  valor_medio: 334.23,
  sincronizacao: { sincronizado_em: "2025-08-01T00:00:00", total_avisos: 0 },
};

const ESTADO_DISTRIBUICAO_VAZIA = {
  carregando: false,
  erro: null,
  distribuicao: { dimensao: "categoria_funcional" as const, pontos: [] },
  tentarNovamente: () => {},
};
const ESTADO_DIAGNOSTICO_VAZIO = {
  carregando: false,
  erro: null,
  diagnostico: { resumo: { esperado: 0, atencao: 0, inconsistencia: 0 }, registros: [] },
  tentarNovamente: () => {},
};
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
    indicadores: INDICADORES_ATUAL,
    indicadoresCarregando: false,
    indicadoresErro: null,
    aoTentarNovamenteIndicadores: () => {},
    distribuicaoCategoriaFuncional: ESTADO_DISTRIBUICAO_VAZIA,
    diagnostico: ESTADO_DIAGNOSTICO_VAZIO,
    comparacao: COMPARACAO_INATIVA,
    indicadoresPeriodoAnterior: INDICADORES_PERIODO_ANTERIOR,
  };
}

describe("Invariância de dados — GradeKpisExecutivos (correção de regressão, 2026-08-07)", () => {
  it("Diárias mostra sempre o total ATUAL, nunca o do período anterior", () => {
    render(<GradeKpisExecutivos {...propsBase()} />);
    expect(screen.getByText("1.850")).toBeInTheDocument();
    expect(screen.queryByText("21")).not.toBeInTheDocument();
  });

  it("Pessoas mostra sempre o total ATUAL, nunca o do período anterior", () => {
    render(<GradeKpisExecutivos {...propsBase()} />);
    expect(screen.getByText("308")).toBeInTheDocument();
    expect(screen.queryByText("15")).not.toBeInTheDocument();
  });

  it("Valor Total mostra sempre o valor ATUAL, nunca o do período anterior", () => {
    render(<GradeKpisExecutivos {...propsBase()} />);
    expect(screen.getByText("R$ 935.192,74")).toBeInTheDocument();
    expect(screen.queryByText("R$ 7.018,82")).not.toBeInTheDocument();
  });

  it("Valor Médio mostra sempre o valor ATUAL, nunca o do período anterior", () => {
    render(<GradeKpisExecutivos {...propsBase()} />);
    expect(screen.getByText("R$ 506,60")).toBeInTheDocument();
    expect(screen.queryByText("R$ 334,23")).not.toBeInTheDocument();
  });

  it("o delta (única leitura permitida de indicadoresPeriodoAnterior) é só um texto auxiliar, nunca substitui o valor principal", () => {
    render(<GradeKpisExecutivos {...propsBase()} />);
    // Variação real entre os dois mocks: (935192.74-7018.82)/7018.82 ≈ +13.224,1%
    expect(screen.getAllByText(/vs\. período anterior/)).toHaveLength(4);
  });

  it("sem indicadoresPeriodoAnterior (recorte sem período/ainda carregando): os 4 KPIs continuam mostrando o valor atual, sem delta", () => {
    render(<GradeKpisExecutivos {...propsBase()} indicadoresPeriodoAnterior={null} />);
    expect(screen.getByText("R$ 935.192,74")).toBeInTheDocument();
    expect(screen.queryByText(/vs\. período anterior/)).not.toBeInTheDocument();
  });
});
