import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DiariaNaoEncontradaError,
  ErroAnaliticaIndisponivel,
  SincronizacaoEmAndamentoError,
  consultarAvisosSincronizacao,
  consultarEstadoSincronizacao,
  detalharDiaria,
  dispararSincronizacaoManual,
  gerarRelatorio,
  obterDiagnostico,
  obterDistribuicao,
  obterIndicadores,
  obterOpcoesFiltro,
  pesquisarDiarias,
} from "./api";

function respostaOk(corpo: unknown) {
  return { ok: true, status: 200, json: async () => corpo };
}

function respostaComStatus(status: number, corpo: unknown = { detail: "erro" }) {
  return { ok: false, status, json: async () => corpo };
}

// Mesmo formato real de erro 422 já documentado em `api.conferencia.test.ts`
// (`detail` como lista de objetos do `model_validator` do Pydantic).
function resposta422(mensagem: string) {
  return {
    ok: false,
    status: 422,
    json: async () => ({
      detail: [{ type: "value_error", loc: ["query", "periodo_final"], msg: `Value error, ${mensagem}` }],
    }),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("pesquisarDiarias", () => {
  it("monta a query string só com os parâmetros informados e devolve o resultado", async () => {
    const corpo = {
      itens: [],
      paginacao: { pagina_atual: 1, tamanho_pagina: 25, total_itens: 0, total_paginas: 0 },
      sincronizacao: { sincronizado_em: "2026-07-31T14:32:00", total_avisos: 0 },
    };
    const fetchMock = vi.fn(async (_url: string) => respostaOk(corpo));
    vi.stubGlobal("fetch", fetchMock);

    const resultado = await pesquisarDiarias({
      municipio: "Araripina",
      pagina: 2,
      tamanho_pagina: 10,
      ordenar_por: "valor",
      ordem: "asc",
    });

    expect(resultado).toEqual(corpo);
    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/api/v1/analitica/diarias?");
    expect(String(url)).toContain("municipio=Araripina");
    expect(String(url)).toContain("pagina=2");
    expect(String(url)).toContain("tamanho_pagina=10");
    expect(String(url)).toContain("ordenar_por=valor");
    expect(String(url)).toContain("ordem=asc");
  });

  it("filtros vazios/undefined nunca viram parâmetro na URL", async () => {
    const fetchMock = vi.fn(async (_url: string) =>
      respostaOk({
        itens: [],
        paginacao: { pagina_atual: 1, tamanho_pagina: 25, total_itens: 0, total_paginas: 0 },
        sincronizacao: { sincronizado_em: "2026-07-31T14:32:00", total_avisos: 0 },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await pesquisarDiarias({ q: "", sei: undefined, cpf: null, pagina: 1, tamanho_pagina: 25 });

    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).not.toContain("q=");
    expect(String(url)).not.toContain("sei=");
    expect(String(url)).not.toContain("cpf=");
  });

  it("503 vira ErroAnaliticaIndisponivel", async () => {
    const fetchMock = vi.fn(async () => respostaComStatus(503));
    vi.stubGlobal("fetch", fetchMock);

    await expect(pesquisarDiarias({})).rejects.toBeInstanceOf(ErroAnaliticaIndisponivel);
  });

  it("422 (ex.: ordenar_por inválido) vira mensagem legível, não '[object Object]'", async () => {
    const fetchMock = vi.fn(async () => resposta422("Período final não pode ser anterior ao período inicial."));
    vi.stubGlobal("fetch", fetchMock);

    await expect(pesquisarDiarias({})).rejects.toThrow(
      "Período final não pode ser anterior ao período inicial.",
    );
  });
});

describe("detalharDiaria", () => {
  it("busca por SEI literal, sem codificar as barras", async () => {
    const corpo = { sei: "19.20.0903.0030720/2024-36" };
    const fetchMock = vi.fn(async (_url: string) => respostaOk(corpo));
    vi.stubGlobal("fetch", fetchMock);

    const resultado = await detalharDiaria("19.20.0903.0030720/2024-36");

    expect(resultado).toEqual(corpo);
    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(
      "http://127.0.0.1:8756/api/v1/analitica/diarias/19.20.0903.0030720/2024-36",
    );
  });

  it("404 vira DiariaNaoEncontradaError", async () => {
    const fetchMock = vi.fn(async () => respostaComStatus(404));
    vi.stubGlobal("fetch", fetchMock);

    await expect(detalharDiaria("sei-inexistente")).rejects.toBeInstanceOf(DiariaNaoEncontradaError);
  });

  it("503 vira ErroAnaliticaIndisponivel", async () => {
    const fetchMock = vi.fn(async () => respostaComStatus(503));
    vi.stubGlobal("fetch", fetchMock);

    await expect(detalharDiaria("sei")).rejects.toBeInstanceOf(ErroAnaliticaIndisponivel);
  });
});

describe("obterOpcoesFiltro", () => {
  it("devolve as opções do backend", async () => {
    const corpo = { motivos: ["Curso"], situacoes: ["Em exercício"], municipios: ["Recife"] };
    const fetchMock = vi.fn(async () => respostaOk(corpo));
    vi.stubGlobal("fetch", fetchMock);

    await expect(obterOpcoesFiltro()).resolves.toEqual(corpo);
  });

  it("503 vira ErroAnaliticaIndisponivel", async () => {
    const fetchMock = vi.fn(async () => respostaComStatus(503));
    vi.stubGlobal("fetch", fetchMock);

    await expect(obterOpcoesFiltro()).rejects.toBeInstanceOf(ErroAnaliticaIndisponivel);
  });
});

describe("consultarEstadoSincronizacao", () => {
  it("devolve o estado do backend", async () => {
    const corpo = {
      sincronizado_em: "2026-07-31T14:32:00",
      origem: "pos_preenchimento",
      possivelmente_desatualizado: false,
      total_avisos: 0,
      status: "atualizado",
    };
    const fetchMock = vi.fn(async () => respostaOk(corpo));
    vi.stubGlobal("fetch", fetchMock);

    await expect(consultarEstadoSincronizacao()).resolves.toEqual(corpo);
  });

  it("503 vira ErroAnaliticaIndisponivel", async () => {
    const fetchMock = vi.fn(async () => respostaComStatus(503));
    vi.stubGlobal("fetch", fetchMock);

    await expect(consultarEstadoSincronizacao()).rejects.toBeInstanceOf(ErroAnaliticaIndisponivel);
  });
});

describe("dispararSincronizacaoManual", () => {
  it("chama POST e devolve o resumo de execução", async () => {
    const corpo = {
      status: "sucesso",
      sincronizado_em: "2026-07-31T14:32:00",
      linhas_diarias: 10,
      linhas_servidores_lidos: 5,
      linhas_ignoradas: 0,
      total_avisos: 0,
    };
    const fetchMock = vi.fn(async (_url: string, opcoes?: RequestInit) => {
      expect(opcoes?.method).toBe("POST");
      return respostaOk(corpo);
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(dispararSincronizacaoManual()).resolves.toEqual(corpo);
  });

  it("409 vira SincronizacaoEmAndamentoError, nunca um erro genérico", async () => {
    const fetchMock = vi.fn(async () => respostaComStatus(409));
    vi.stubGlobal("fetch", fetchMock);

    await expect(dispararSincronizacaoManual()).rejects.toBeInstanceOf(SincronizacaoEmAndamentoError);
  });

  it("422 (planilha oficial não configurada) vira mensagem legível", async () => {
    const fetchMock = vi.fn(async () => resposta422("Planilha oficial não configurada."));
    vi.stubGlobal("fetch", fetchMock);

    await expect(dispararSincronizacaoManual()).rejects.toThrow("Planilha oficial não configurada.");
  });

  it("503 vira ErroAnaliticaIndisponivel", async () => {
    const fetchMock = vi.fn(async () => respostaComStatus(503));
    vi.stubGlobal("fetch", fetchMock);

    await expect(dispararSincronizacaoManual()).rejects.toBeInstanceOf(ErroAnaliticaIndisponivel);
  });
});

describe("consultarAvisosSincronizacao", () => {
  it("usa os padrões pagina=1/tamanho_pagina=25 quando não informados", async () => {
    const corpo = {
      itens: [],
      paginacao: { pagina_atual: 1, tamanho_pagina: 25, total_itens: 0, total_paginas: 0 },
    };
    const fetchMock = vi.fn(async (_url: string) => respostaOk(corpo));
    vi.stubGlobal("fetch", fetchMock);

    await consultarAvisosSincronizacao();

    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("pagina=1");
    expect(String(url)).toContain("tamanho_pagina=25");
  });

  it("envia página/tamanho explícitos", async () => {
    const fetchMock = vi.fn(async (_url: string) =>
      respostaOk({ itens: [], paginacao: { pagina_atual: 2, tamanho_pagina: 5, total_itens: 0, total_paginas: 0 } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await consultarAvisosSincronizacao(2, 5);

    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("pagina=2");
    expect(String(url)).toContain("tamanho_pagina=5");
  });

  it("503 vira ErroAnaliticaIndisponivel", async () => {
    const fetchMock = vi.fn(async () => respostaComStatus(503));
    vi.stubGlobal("fetch", fetchMock);

    await expect(consultarAvisosSincronizacao()).rejects.toBeInstanceOf(ErroAnaliticaIndisponivel);
  });
});

// Sprint 19.6.2 — `GET /indicadores`.
describe("obterIndicadores", () => {
  it("monta a query string só com os filtros informados e devolve o resultado", async () => {
    const corpo = {
      total_diarias: 4,
      total_servidores: 4,
      valor_total: 730.75,
      valor_medio: 243.5833333333333,
      sincronizacao: { sincronizado_em: "2026-07-31T14:32:00", total_avisos: 0 },
    };
    const fetchMock = vi.fn(async (_url: string) => respostaOk(corpo));
    vi.stubGlobal("fetch", fetchMock);

    const resultado = await obterIndicadores({ motivo: "Reunião", municipio: "recife" });

    expect(resultado).toEqual(corpo);
    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/api/v1/analitica/indicadores?");
    expect(String(url)).toContain("motivo=Reuni");
    expect(String(url)).toContain("municipio=recife");
  });

  it("filtros vazios/undefined nunca viram parâmetro na URL", async () => {
    const fetchMock = vi.fn(async (_url: string) =>
      respostaOk({
        total_diarias: 0,
        total_servidores: 0,
        valor_total: null,
        valor_medio: null,
        sincronizacao: { sincronizado_em: "2026-07-31T14:32:00", total_avisos: 0 },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await obterIndicadores({ q: "", sei: undefined, cpf: null });

    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).not.toContain("q=");
    expect(String(url)).not.toContain("sei=");
    expect(String(url)).not.toContain("cpf=");
  });

  it("nunca envia parâmetro de paginação/ordenação (não existem em ParametrosIndicadoresQuery)", async () => {
    const fetchMock = vi.fn(async (_url: string) =>
      respostaOk({
        total_diarias: 0,
        total_servidores: 0,
        valor_total: null,
        valor_medio: null,
        sincronizacao: { sincronizado_em: "2026-07-31T14:32:00", total_avisos: 0 },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await obterIndicadores({ motivo: "Reunião" });

    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).not.toContain("pagina=");
    expect(String(url)).not.toContain("ordenar_por=");
  });

  it("503 vira ErroAnaliticaIndisponivel", async () => {
    const fetchMock = vi.fn(async () => respostaComStatus(503));
    vi.stubGlobal("fetch", fetchMock);

    await expect(obterIndicadores({})).rejects.toBeInstanceOf(ErroAnaliticaIndisponivel);
  });

  it("422 (ex.: valor máximo menor que o mínimo) vira mensagem legível", async () => {
    const fetchMock = vi.fn(async () => resposta422("Valor máximo não pode ser menor que o valor mínimo."));
    vi.stubGlobal("fetch", fetchMock);

    await expect(obterIndicadores({})).rejects.toThrow(
      "Valor máximo não pode ser menor que o valor mínimo.",
    );
  });
});

describe("obterDistribuicao", () => {
  it("monta a query string com os filtros e a dimensão, e devolve o resultado", async () => {
    const corpo = {
      dimensao: "motivo",
      pontos: [
        { rotulo: "Reunião", contagem: 2, valor: 200.0 },
        { rotulo: "Fiscalização", contagem: 1, valor: 350.5 },
      ],
    };
    const fetchMock = vi.fn(async (_url: string) => respostaOk(corpo));
    vi.stubGlobal("fetch", fetchMock);

    const resultado = await obterDistribuicao({ dimensao: "motivo", municipio: "recife" });

    expect(resultado).toEqual(corpo);
    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/api/v1/analitica/distribuicoes?");
    expect(String(url)).toContain("dimensao=motivo");
    expect(String(url)).toContain("municipio=recife");
  });

  it("filtros vazios/undefined nunca viram parâmetro na URL", async () => {
    const fetchMock = vi.fn(async (_url: string) =>
      respostaOk({ dimensao: "periodo", pontos: [] }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await obterDistribuicao({ dimensao: "periodo", q: "", sei: undefined, cpf: null });

    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).not.toContain("q=");
    expect(String(url)).not.toContain("sei=");
    expect(String(url)).not.toContain("cpf=");
  });

  it("nunca envia parâmetro de paginação/ordenação (não existem em ParametrosDistribuicaoQuery)", async () => {
    const fetchMock = vi.fn(async (_url: string) =>
      respostaOk({ dimensao: "motivo", pontos: [] }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await obterDistribuicao({ dimensao: "motivo", motivo: "Reunião" });

    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).not.toContain("pagina=");
    expect(String(url)).not.toContain("ordenar_por=");
  });

  it("503 vira ErroAnaliticaIndisponivel", async () => {
    const fetchMock = vi.fn(async () => respostaComStatus(503));
    vi.stubGlobal("fetch", fetchMock);

    await expect(obterDistribuicao({ dimensao: "periodo" })).rejects.toBeInstanceOf(
      ErroAnaliticaIndisponivel,
    );
  });

  it("422 (ex.: dimensão ainda não aceita) vira mensagem legível", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 422,
      json: async () => ({
        detail: [
          {
            type: "literal_error",
            loc: ["query", "dimensao"],
            msg: "Input should be 'periodo', 'servidor', 'municipio', 'motivo', 'situacao' or 'origem_destino'",
          },
        ],
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(obterDistribuicao({ dimensao: "completude" as never })).rejects.toThrow();
  });
});

describe("gerarRelatorio", () => {
  const PARAMETROS_BASE = {
    filtros: { motivo: "Reunião" },
    tipo: "executivo" as const,
    formato: "pdf" as const,
    incluir_indicadores: true,
    incluir_graficos: true,
    incluir_tabela: true,
    incluir_inconsistencias: true,
    modo: "final" as const,
  };

  it("faz POST com o corpo JSON exato e devolve o resultado", async () => {
    const corpo = {
      caminho_arquivo_temporario: "C:\\Temp\\extrator_diarias_relatorios\\abc123.pdf",
      nome_sugerido: "Relatório Executivo - 04-08-2026.pdf",
      sincronizado_em: "2026-08-04T10:00:00",
    };
    const fetchMock = vi.fn(async (_url: string, _opcoes: RequestInit) => respostaOk(corpo));
    vi.stubGlobal("fetch", fetchMock);

    const resultado = await gerarRelatorio(PARAMETROS_BASE);

    expect(resultado).toEqual(corpo);
    const [url, opcoes] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("http://127.0.0.1:8756/api/v1/analitica/relatorios");
    expect(opcoes.method).toBe("POST");
    expect(JSON.parse(opcoes.body as string)).toEqual(PARAMETROS_BASE);
  });

  it("503 vira ErroAnaliticaIndisponivel", async () => {
    const fetchMock = vi.fn(async () => respostaComStatus(503));
    vi.stubGlobal("fetch", fetchMock);

    await expect(gerarRelatorio(PARAMETROS_BASE)).rejects.toBeInstanceOf(ErroAnaliticaIndisponivel);
  });

  it("422 (ex.: gráficos fora do PDF) vira mensagem legível", async () => {
    const fetchMock = vi.fn(async () => resposta422("Gráficos estão disponíveis apenas para o formato PDF."));
    vi.stubGlobal("fetch", fetchMock);

    await expect(gerarRelatorio(PARAMETROS_BASE)).rejects.toThrow(
      "Gráficos estão disponíveis apenas para o formato PDF.",
    );
  });

  it("422 (tipo ainda não implementado, ex.: 'inconsistencias') vira mensagem legível", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 422,
      json: async () => ({
        detail:
          'O tipo de relatório "inconsistencias" depende do catálogo de diagnósticos (Sprint 19.8), ainda não implementado.',
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(gerarRelatorio({ ...PARAMETROS_BASE, tipo: "inconsistencias" })).rejects.toThrow(
      /ainda não implementado/,
    );
  });
});

describe("obterDiagnostico", () => {
  const CORPO = {
    resumo: { esperado: 3, atencao: 1, inconsistencia: 0 },
    registros: [{ sei: "SEI-1", classificacao: "atencao", casos: [] }],
  };

  it("monta a query string só com os filtros informados e devolve o resultado", async () => {
    const fetchMock = vi.fn(async (_url: string) => respostaOk(CORPO));
    vi.stubGlobal("fetch", fetchMock);

    const resultado = await obterDiagnostico({ motivo: "Reunião", municipio: "recife" });

    expect(resultado).toEqual(CORPO);
    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/api/v1/analitica/diagnostico?");
    expect(String(url)).toContain("motivo=Reuni");
    expect(String(url)).toContain("municipio=recife");
  });

  it("filtros vazios/undefined nunca viram parâmetro na URL", async () => {
    const fetchMock = vi.fn(async (_url: string) => respostaOk(CORPO));
    vi.stubGlobal("fetch", fetchMock);

    await obterDiagnostico({ q: "", sei: undefined, cpf: null });

    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).not.toContain("q=");
    expect(String(url)).not.toContain("sei=");
    expect(String(url)).not.toContain("cpf=");
  });

  it("nunca envia parâmetro de paginação/ordenação (não existem em ParametrosDiagnosticoQuery)", async () => {
    const fetchMock = vi.fn(async (_url: string) => respostaOk(CORPO));
    vi.stubGlobal("fetch", fetchMock);

    await obterDiagnostico({ motivo: "Reunião" });

    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).not.toContain("pagina=");
    expect(String(url)).not.toContain("ordenar_por=");
  });

  it("503 vira ErroAnaliticaIndisponivel", async () => {
    const fetchMock = vi.fn(async () => respostaComStatus(503));
    vi.stubGlobal("fetch", fetchMock);

    await expect(obterDiagnostico({})).rejects.toBeInstanceOf(ErroAnaliticaIndisponivel);
  });

  it("422 (ex.: período final antes do inicial) vira mensagem legível", async () => {
    const fetchMock = vi.fn(async () => resposta422("Período final não pode ser anterior ao período inicial."));
    vi.stubGlobal("fetch", fetchMock);

    await expect(obterDiagnostico({})).rejects.toThrow("Período final não pode ser anterior ao período inicial.");
  });
});
