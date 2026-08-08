import { describe, expect, it } from "vitest";
import {
  calcularInsightsExecutivos,
  insightConcentracaoGastos,
  insightParticipacaoCategoriaFuncional,
  insightPicoMensal,
  insightTendenciaRecente,
  insightTransporteNaoIdentificado,
  insightUnidadeLider,
  insightVariacaoPeriodo,
  insightVariacaoValorMedio,
  insightsDiagnostico,
} from "./insightsExecutivos";
import type { PontoDistribuicaoResposta, RegistroDiagnosticadoResposta } from "../../../types/analitica";

function ponto(rotulo: string, contagem: number, valor: number | null = null): PontoDistribuicaoResposta {
  return { rotulo, contagem, valor };
}

function registro(sei: string, titulos: string[]): RegistroDiagnosticadoResposta {
  return {
    sei,
    classificacao: titulos.length > 0 ? "atencao" : "esperado",
    casos: titulos.map((titulo) => ({ campo: null, titulo, motivo: "motivo", acao_recomendada: "ação" })),
  };
}

describe("insightVariacaoPeriodo", () => {
  // Assinatura: `insightVariacaoPeriodo(valorAtual, valorAnterior, rotulo)`.
  it("calcula a variação percentual e formata com sinal", () => {
    const insight = insightVariacaoPeriodo(312, 289, "Julho/2026");
    expect(insight?.texto).toContain("+8%");
    expect(insight?.texto).toContain("Julho/2026");
    expect(insight?.tipo).toBe("neutro"); // RN-08: nunca "atencao"/vermelho só por variação
  });

  it("variação negativa usa seta para baixo e sinal negativo, nunca tipo 'atencao'", () => {
    const insight = insightVariacaoPeriodo(289, 312, "Julho/2026");
    expect(insight?.texto).toContain("-7,4%");
    expect(insight?.tipo).toBe("neutro");
  });

  it("valor anterior nulo ou zero: nenhum insight (nunca Infinity/NaN)", () => {
    expect(insightVariacaoPeriodo(100, null, "Julho/2026")).toBeNull();
    expect(insightVariacaoPeriodo(100, 0, "Julho/2026")).toBeNull();
  });

  it("valor atual nulo: nenhum insight", () => {
    expect(insightVariacaoPeriodo(null, 100, "Julho/2026")).toBeNull();
  });
});

describe("insightConcentracaoGastos", () => {
  it("acha o menor N de municípios cuja soma alcança 80% do valor total", () => {
    const pontos = [ponto("Recife", 10, 800), ponto("Olinda", 5, 100), ponto("Jaboatão", 3, 100)];
    const insight = insightConcentracaoGastos(pontos);
    expect(insight?.texto).toContain("1 de 3");
    expect(insight?.texto).toContain("80%");
    expect(insight?.acao).toEqual({ rotulo: "Aplicar filtro", municipio: "Recife" });
  });

  it("sem concentração relevante (gasto bem distribuído, N >= 50% dos municípios): nenhum insight", () => {
    const pontos = [ponto("A", 1, 250), ponto("B", 1, 250), ponto("C", 1, 250), ponto("D", 1, 250)];
    expect(insightConcentracaoGastos(pontos)).toBeNull();
  });

  it("menos de 2 municípios com valor: nenhum insight (nada a comparar)", () => {
    expect(insightConcentracaoGastos([ponto("Recife", 10, 800)])).toBeNull();
    expect(insightConcentracaoGastos([])).toBeNull();
  });

  it("municípios sem valor (null) são ignorados no cálculo", () => {
    const pontos = [
      ponto("Recife", 10, 800),
      ponto("Sem destino informado", 2, null),
      ponto("Olinda", 2, 100),
      ponto("Jaboatão", 1, 100),
    ];
    const insight = insightConcentracaoGastos(pontos);
    expect(insight?.acao).toEqual({ rotulo: "Aplicar filtro", municipio: "Recife" });
  });
});

describe("insightTransporteNaoIdentificado", () => {
  it("calcula o percentual do bucket sintético 'Transporte não identificado'", () => {
    const pontos = [ponto("CARRO", 90), ponto("Transporte não identificado", 10)];
    const insight = insightTransporteNaoIdentificado(pontos);
    expect(insight?.texto).toContain("10%");
    expect(insight?.texto).toContain("10 diária(s)");
    expect(insight?.tipo).toBe("atencao");
  });

  it("sem nenhum caso de transporte não identificado: nenhum insight", () => {
    const pontos = [ponto("CARRO", 90), ponto("AVIAO", 10)];
    expect(insightTransporteNaoIdentificado(pontos)).toBeNull();
  });
});

describe("insightVariacaoValorMedio", () => {
  it("mesma fórmula/proteção de insightVariacaoPeriodo, aplicada ao valor médio", () => {
    const insight = insightVariacaoValorMedio(550, 500, "Julho/2026");
    expect(insight?.texto).toBe("Valor médio por diária +10% em relação a Julho/2026");
    expect(insight?.tipo).toBe("neutro");
  });

  it("sem base de comparação: nenhum insight", () => {
    expect(insightVariacaoValorMedio(550, null, "Julho/2026")).toBeNull();
    expect(insightVariacaoValorMedio(550, 0, "Julho/2026")).toBeNull();
  });
});

describe("insightPicoMensal", () => {
  it("acha o mês de maior valor entre os pontos da série", () => {
    const pontos = [ponto("2026-06", 10, 50000), ponto("2026-07", 12, 126000), ponto("2026-08", 5, 40000)];
    const insight = insightPicoMensal(pontos);
    expect(insight?.texto).toContain("126.000,00");
    expect(insight?.texto).toContain("jul/2026");
  });

  it("menos de 2 meses com valor: nenhum insight (mês único não é uma descoberta)", () => {
    expect(insightPicoMensal([ponto("2026-07", 12, 126000)])).toBeNull();
    expect(insightPicoMensal([])).toBeNull();
  });

  it("meses sem valor (null) são ignorados", () => {
    const pontos = [ponto("2026-06", 10, null), ponto("2026-07", 12, 126000), ponto("2026-08", 5, 40000)];
    const insight = insightPicoMensal(pontos);
    expect(insight?.texto).toContain("jul/2026");
  });
});

describe("insightTendenciaRecente", () => {
  const hoje = new Date(2026, 7, 8); // 2026-08-08 (agosto em andamento)

  it("compara o último mês FECHADO da série com o mês anterior", () => {
    const pontos = [ponto("2026-06", 10, 100000), ponto("2026-07", 12, 86000)];
    const insight = insightTendenciaRecente(pontos, hoje);
    expect(insight?.texto).toBe("jul/2026 registrou 14% a menos de gastos que jun/2026");
  });

  it("nunca compara um mês em andamento (guarda de mês incompleto) — 'menos insights, maior confiabilidade'", () => {
    const pontos = [ponto("2026-07", 12, 126000), ponto("2026-08", 3, 20000)];
    expect(insightTendenciaRecente(pontos, hoje)).toBeNull();
  });

  it("menos de 2 meses com valor: nenhum insight", () => {
    expect(insightTendenciaRecente([ponto("2026-07", 12, 126000)], hoje)).toBeNull();
  });

  it("variação zero: nenhum insight (nada a destacar)", () => {
    const pontos = [ponto("2026-06", 10, 100000), ponto("2026-07", 12, 100000)];
    expect(insightTendenciaRecente(pontos, hoje)).toBeNull();
  });
});

describe("insightParticipacaoCategoriaFuncional", () => {
  it("aponta a categoria líder por CONTAGEM (nunca valor financeiro)", () => {
    const pontos = [ponto("MEMBRO", 20), ponto("SERVIDOR", 79), ponto("NAO_IDENTIFICADO", 1)];
    const insight = insightParticipacaoCategoriaFuncional(pontos);
    expect(insight?.texto).toBe("Servidores representaram 79% das diárias registradas no período");
  });

  it("empate exato: nenhum insight (sem líder determinístico)", () => {
    expect(insightParticipacaoCategoriaFuncional([ponto("MEMBRO", 10), ponto("SERVIDOR", 10)])).toBeNull();
  });

  it("recorte vazio: nenhum insight", () => {
    expect(insightParticipacaoCategoriaFuncional([])).toBeNull();
  });
});

describe("insightUnidadeLider", () => {
  it("aponta a unidade com mais registros, por CONTAGEM (nunca valor financeiro)", () => {
    const pontos = [ponto("Unidade A", 132, 900000), ponto("Unidade B", 40, 1200000)];
    const insight = insightUnidadeLider(pontos);
    expect(insight?.texto).toBe("Unidade A liderou as solicitações, com 132 registro(s) no período");
    expect(insight?.texto).not.toMatch(/R\$/);
  });

  it("bucket sintético 'Unidade solicitante não informada' nunca vira líder", () => {
    const pontos = [ponto("Unidade solicitante não informada", 500), ponto("Unidade A", 132)];
    const insight = insightUnidadeLider(pontos);
    expect(insight?.texto).toContain("Unidade A");
  });

  it("recorte vazio: nenhum insight", () => {
    expect(insightUnidadeLider([])).toBeNull();
  });
});

describe("insightsDiagnostico", () => {
  it("conta duplicidade, DH ausente e aguardando liberação separadamente", () => {
    const registros = [
      registro("1", ["Possível duplicidade"]),
      registro("2", ["Documento Hábil ausente — motivo não identificado"]),
      registro("3", ["Aguardando liberação"]),
      registro("6", []),
    ];

    const insights = insightsDiagnostico(registros);

    expect(insights.find((i) => i.id === "duplicidade")?.texto).toContain("1 caso(s)");
    expect(insights.find((i) => i.id === "dh-ausente")?.texto).toContain("1 processo(s)");
    expect(insights.find((i) => i.id === "aguardando-liberacao")?.texto).toContain("1 processo(s)");
  });

  // Correção de regressão (2026-08-07) — pedido explícito do usuário: não
  // representa um problema real do processo, é consequência de como o
  // parser lê o campo. Removido do Painel Executivo; segue existindo no
  // catálogo do Diagnóstico geral (sem filtro), só não vira mais insight.
  it("'Trecho incompleto'/'Origem e destino ausentes' nunca viram insight executivo", () => {
    const registros = [registro("4", ["Trecho incompleto"]), registro("5", ["Origem e destino ausentes"])];
    expect(insightsDiagnostico(registros)).toEqual([]);
  });

  it("um registro com o mesmo título 2x nunca é contado 2x (contagem por registro, não por caso)", () => {
    const registros = [registro("1", ["Possível duplicidade", "Possível duplicidade"])];
    const insights = insightsDiagnostico(registros);
    expect(insights.find((i) => i.id === "duplicidade")?.texto).toContain("1 caso(s)");
  });

  it("recorte sem nenhum caso relevante: lista vazia, nunca um insight com contagem 0", () => {
    const registros = [registro("1", []), registro("2", ["Situação do servidor ausente"])];
    expect(insightsDiagnostico(registros)).toEqual([]);
  });

  // Correção de regressão (2026-08-07) — a ação agora carrega também o
  // título do caso (`filtroDiagnostico`, mesmo título usado para contar),
  // para o Diagnóstico abrir já filtrado só para esse caso específico.
  it("a ação carrega o filtroDiagnostico com o mesmo título usado para contar o caso", () => {
    const registros = [registro("1", ["Possível duplicidade"])];
    const insights = insightsDiagnostico(registros);
    expect(insights[0].acao).toEqual({
      rotulo: "Abrir diagnóstico",
      abrirDiagnostico: true,
      filtroDiagnostico: { titulo: "Possível duplicidade", rotulo: "Possível duplicidade" },
    });
  });
});

describe("calcularInsightsExecutivos", () => {
  const hoje = new Date(2026, 7, 8); // 2026-08-08

  it("compõe só insights financeiros/gerenciais, numa ordem fixa — nunca diagnóstico/transporte", () => {
    const insights = calcularInsightsExecutivos({
      valorTotalAtual: 312,
      valorTotalPeriodoAnterior: 289,
      valorMedioAtual: 550,
      valorMedioPeriodoAnterior: 500,
      rotuloPeriodoAnterior: "Julho/2026",
      pontosPeriodo: [ponto("2026-06", 10, 100000), ponto("2026-07", 12, 126000)],
      pontosMunicipio: [ponto("Recife", 10, 800), ponto("Olinda", 2, 100), ponto("Jaboatão", 1, 100)],
      pontosCategoriaFuncional: [ponto("MEMBRO", 20), ponto("SERVIDOR", 79)],
      pontosDocOrigem: [ponto("Unidade A", 132), ponto("Unidade B", 40)],
      hoje,
    });

    expect(insights.map((i) => i.id)).toEqual([
      "variacao-periodo",
      "pico-mensal",
      "tendencia-recente",
      "variacao-valor-medio",
      "concentracao-gastos",
      "participacao-categoria-funcional",
      "unidade-lider",
    ]);
  });

  it("sem período definido (rotuloPeriodoAnterior nulo): nenhum insight de variação (total ou médio)", () => {
    const insights = calcularInsightsExecutivos({
      valorTotalAtual: 312,
      valorTotalPeriodoAnterior: null,
      valorMedioAtual: 100,
      valorMedioPeriodoAnterior: null,
      rotuloPeriodoAnterior: null,
      pontosPeriodo: [],
      pontosMunicipio: [],
      pontosCategoriaFuncional: [],
      pontosDocOrigem: [],
      hoje,
    });

    expect(insights.find((i) => i.id === "variacao-periodo")).toBeUndefined();
    expect(insights.find((i) => i.id === "variacao-valor-medio")).toBeUndefined();
  });

  it("recorte sem nada a destacar: lista vazia", () => {
    const insights = calcularInsightsExecutivos({
      valorTotalAtual: 100,
      valorTotalPeriodoAnterior: null,
      valorMedioAtual: null,
      valorMedioPeriodoAnterior: null,
      rotuloPeriodoAnterior: null,
      pontosPeriodo: [],
      pontosMunicipio: [],
      pontosCategoriaFuncional: [],
      pontosDocOrigem: [],
      hoje,
    });

    expect(insights).toEqual([]);
  });
});
