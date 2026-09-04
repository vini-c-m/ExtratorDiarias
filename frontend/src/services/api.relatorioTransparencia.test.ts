import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CoberturaEfiscoInsuficienteError,
  ErroRelatorioTransparenciaIndisponivel,
  configurarFontesRelatorioTransparencia,
  gerarRelatorioTransparencia,
  listarRevisoesRelatorioTransparencia,
  obterStatusFontesRelatorioTransparencia,
  obterStatusTemplateRelatorioTransparencia,
  prepararRelatorioTransparencia,
  registrarDecisaoRevisaoRelatorioTransparencia,
} from "./api";

// Dados 100% fictícios (nenhum CPF/OB/DH/SEI real) — mesmo critério dos
// mockups da investigação UX 3E.
const PARAMETROS_FONTES = {
  caminho_base_efisco: "C:\\fake\\OB_Transparencia_2026_08.xlsx",
  caminho_controle_dimcac: "C:\\fake\\Controle_DIMCAC_2026.xlsx",
  ano_exercicio: 2026,
  mes_referencia: 8,
  caminho_decisoes: "C:\\fake\\AppData\\ExtratorDiarias\\relatorio_transparencia_decisoes.json",
};

function respostaOk(corpo: unknown) {
  return { ok: true, status: 200, json: async () => corpo };
}

function resposta404(detail: string) {
  return { ok: false, status: 404, json: async () => ({ detail }) };
}

function resposta503() {
  return { ok: false, status: 503, json: async () => ({ detail: "versão de esquema incompatível" }) };
}

function resposta422(detail: string) {
  return { ok: false, status: 422, json: async () => ({ detail }) };
}

// Sprint D.1 (P2, cobertura parcial E-Fisco) — reproduz o 422 ESTRUTURADO
// de `CoberturaInsuficienteEfisco` (`app/api/relatorio_transparencia.py::
// _levantar_erro_de_fontes`), nunca só texto.
function resposta422CoberturaInsuficiente(coberturaPagaAte: string | null) {
  return {
    ok: false,
    status: 422,
    json: async () => ({
      detail: {
        tipo: "cobertura_efisco_insuficiente",
        mensagem: "A Base E-Fisco não tem cobertura comprovada até o fim da competência solicitada.",
        cobertura_paga_ate: coberturaPagaAte,
      },
    }),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("prepararRelatorioTransparencia", () => {
  it("envia os 5 parâmetros de fonte no corpo e devolve o resumo do backend", async () => {
    const resumo = {
      total_candidatos_normais: 1799,
      total_revisoes: 8,
      total_pendentes: 8,
      total_decididas: 6,
      total_adiadas: 0,
      total_desatualizadas: 0,
      total_ocorrencias_nao_publicaveis: 0,
      pode_gerar_relatorio: false,
      revisoes: [],
    };
    const fetchMock = vi.fn(async (_url: string, _opcoes?: RequestInit) => respostaOk(resumo));
    vi.stubGlobal("fetch", fetchMock);

    const resultado = await prepararRelatorioTransparencia(PARAMETROS_FONTES);

    expect(resultado).toEqual(resumo);
    const [url, opcoes] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/api/v1/relatorio-transparencia/preparar");
    expect(JSON.parse((opcoes as RequestInit).body as string)).toEqual(PARAMETROS_FONTES);
  });

  it("404 de Base E-Fisco não encontrada vira mensagem amigável, nunca expõe o caminho absoluto", async () => {
    const fetchMock = vi.fn(async () =>
      resposta404("Base E-Fisco não encontrada: C:\\fake\\OB_Transparencia_2026_08.xlsx"),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(prepararRelatorioTransparencia(PARAMETROS_FONTES)).rejects.toThrow(
      /Não encontramos o arquivo da Base E-Fisco/,
    );
    await expect(prepararRelatorioTransparencia(PARAMETROS_FONTES)).rejects.not.toThrow(/C:\\fake/);
  });

  it("404 de Controle DIMCAC não encontrado vira mensagem amigável específica", async () => {
    const fetchMock = vi.fn(async () =>
      resposta404("Controle DIMCAC não encontrado: C:\\fake\\Controle_DIMCAC_2026.xlsx"),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(prepararRelatorioTransparencia(PARAMETROS_FONTES)).rejects.toThrow(
      /Não encontramos o arquivo do Controle DIMCAC/,
    );
  });

  it("503 (persistência de decisões indisponível) vira ErroRelatorioTransparenciaIndisponivel", async () => {
    const fetchMock = vi.fn(async () => resposta503());
    vi.stubGlobal("fetch", fetchMock);

    await expect(prepararRelatorioTransparencia(PARAMETROS_FONTES)).rejects.toBeInstanceOf(
      ErroRelatorioTransparenciaIndisponivel,
    );
  });

  it("422 (estrutura inválida) propaga a mensagem já curada do backend", async () => {
    const fetchMock = vi.fn(async () => resposta422("Aba 'Dados' não encontrada na planilha"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(prepararRelatorioTransparencia(PARAMETROS_FONTES)).rejects.toThrow(
      "Aba 'Dados' não encontrada na planilha",
    );
  });

  // Sprint D.1 (P2, cobertura parcial E-Fisco) — o 422 estruturado de
  // `CoberturaInsuficienteEfisco` nunca pode cair no tratamento genérico de
  // 422 (que só devolveria texto) — precisa virar `CoberturaEfiscoInsuficienteError`,
  // com `coberturaPagaAte` extraído do corpo, para a tela oferecer as duas
  // ações sem reparsear a mensagem.
  it("422 de cobertura E-Fisco insuficiente vira CoberturaEfiscoInsuficienteError com a data-limite", async () => {
    const fetchMock = vi.fn(async () => resposta422CoberturaInsuficiente("2026-07-31"));
    vi.stubGlobal("fetch", fetchMock);

    const erro = await prepararRelatorioTransparencia(PARAMETROS_FONTES).catch((e) => e);

    expect(erro).toBeInstanceOf(CoberturaEfiscoInsuficienteError);
    expect((erro as CoberturaEfiscoInsuficienteError).coberturaPagaAte).toBe("2026-07-31");
    expect((erro as Error).message).toMatch(/cobertura comprovada/);
  });

  it("422 de cobertura E-Fisco insuficiente sem NENHUM pagamento confirmado vem com coberturaPagaAte nulo", async () => {
    const fetchMock = vi.fn(async () => resposta422CoberturaInsuficiente(null));
    vi.stubGlobal("fetch", fetchMock);

    const erro = await prepararRelatorioTransparencia(PARAMETROS_FONTES).catch((e) => e);

    expect(erro).toBeInstanceOf(CoberturaEfiscoInsuficienteError);
    expect((erro as CoberturaEfiscoInsuficienteError).coberturaPagaAte).toBeNull();
  });

  it("envia aceitar_cobertura_parcial=true quando o chamador pede para prosseguir sob cobertura parcial", async () => {
    const resumoParcial = {
      total_candidatos_normais: 1799,
      total_revisoes: 0,
      total_pendentes: 0,
      total_decididas: 0,
      total_adiadas: 0,
      total_desatualizadas: 0,
      total_requer_nova_decisao: 0,
      total_ocorrencias_nao_publicaveis: 0,
      pode_gerar_relatorio: true,
      revisoes: [],
      avisos_qualidade_fonte: [],
      diagnosticos_qualidade_fonte: [],
      total_decisoes_reaproveitadas: 0,
      cobertura_parcial: true,
      cobertura_efisco_ate: "2026-07-31",
    };
    const fetchMock = vi.fn(async (_url: string, _opcoes?: RequestInit) => respostaOk(resumoParcial));
    vi.stubGlobal("fetch", fetchMock);

    const resultado = await prepararRelatorioTransparencia({ ...PARAMETROS_FONTES, aceitar_cobertura_parcial: true });

    expect(resultado).toEqual(resumoParcial);
    const [, opcoes] = fetchMock.mock.calls[0];
    const corpoEnviado = JSON.parse((opcoes as RequestInit).body as string);
    expect(corpoEnviado.aceitar_cobertura_parcial).toBe(true);
  });

  it("nunca envia aceitar_cobertura_parcial quando o chamador não pede cobertura parcial (comportamento padrão preservado)", async () => {
    const fetchMock = vi.fn(async (_url: string, _opcoes?: RequestInit) =>
      respostaOk({
        total_candidatos_normais: 0,
        total_revisoes: 0,
        total_pendentes: 0,
        total_decididas: 0,
        total_adiadas: 0,
        total_desatualizadas: 0,
        total_requer_nova_decisao: 0,
        total_ocorrencias_nao_publicaveis: 0,
        pode_gerar_relatorio: true,
        revisoes: [],
        avisos_qualidade_fonte: [],
        diagnosticos_qualidade_fonte: [],
        total_decisoes_reaproveitadas: 0,
        cobertura_parcial: false,
        cobertura_efisco_ate: null,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await prepararRelatorioTransparencia(PARAMETROS_FONTES);

    const [, opcoes] = fetchMock.mock.calls[0];
    const corpoEnviado = JSON.parse((opcoes as RequestInit).body as string);
    expect(corpoEnviado.aceitar_cobertura_parcial).toBeUndefined();
  });
});

describe("listarRevisoesRelatorioTransparencia", () => {
  it("monta a query string com os 5 parâmetros de fonte", async () => {
    const fetchMock = vi.fn(async (_url: string) => respostaOk({ total: 0, revisoes: [] }));
    vi.stubGlobal("fetch", fetchMock);

    await listarRevisoesRelatorioTransparencia(PARAMETROS_FONTES);

    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/api/v1/relatorio-transparencia/revisoes?");
    expect(String(url)).toContain("mes_referencia=8");
    expect(String(url)).toContain("ano_exercicio=2026");
  });
});

describe("registrarDecisaoRevisaoRelatorioTransparencia", () => {
  it("publicar: envia acao/obs_selecionadas/autor junto dos parâmetros de fonte, no caminho da identidade do grupo", async () => {
    const resumoAtualizado = {
      total_candidatos_normais: 1799,
      total_revisoes: 8,
      total_pendentes: 7,
      total_decididas: 1,
      total_adiadas: 0,
      total_desatualizadas: 0,
      total_ocorrencias_nao_publicaveis: 1,
      pode_gerar_relatorio: false,
      revisoes: [],
    };
    const fetchMock = vi.fn(async (_url: string, _opcoes?: RequestInit) => respostaOk(resumoAtualizado));
    vi.stubGlobal("fetch", fetchMock);

    const resultado = await registrarDecisaoRevisaoRelatorioTransparencia(
      "grupo-fake-abc123",
      PARAMETROS_FONTES,
      { acao: "publicar", obs_selecionadas: ["2026OB000241"], autor: "servidor.teste" },
    );

    expect(resultado).toEqual(resumoAtualizado);
    const [url, opcoes] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/api/v1/relatorio-transparencia/revisoes/grupo-fake-abc123/decisao");
    expect(JSON.parse((opcoes as RequestInit).body as string)).toEqual({
      ...PARAMETROS_FONTES,
      acao: "publicar",
      obs_selecionadas: ["2026OB000241"],
      autor: "servidor.teste",
    });
  });

  it("adiar: obs_selecionadas vazio", async () => {
    const fetchMock = vi.fn(async (_url: string, _opcoes?: RequestInit) =>
      respostaOk({
        total_candidatos_normais: 0,
        total_revisoes: 1,
        total_pendentes: 0,
        total_decididas: 0,
        total_adiadas: 1,
        total_desatualizadas: 0,
        total_ocorrencias_nao_publicaveis: 0,
        pode_gerar_relatorio: false,
        revisoes: [],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await registrarDecisaoRevisaoRelatorioTransparencia("grupo-fake-abc123", PARAMETROS_FONTES, {
      acao: "adiar",
      obs_selecionadas: [],
      autor: "servidor.teste",
    });

    const [, opcoes] = fetchMock.mock.calls[0];
    expect(JSON.parse((opcoes as RequestInit).body as string)).toMatchObject({
      acao: "adiar",
      obs_selecionadas: [],
    });
  });

  it("404 (revisão não encontrada) vira mensagem amigável, nunca expõe identidade_grupo/fingerprint", async () => {
    const fetchMock = vi.fn(async () =>
      resposta404("Nenhuma revisão pendente encontrada para o grupo 'grupo-fake-abc123'."),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      registrarDecisaoRevisaoRelatorioTransparencia("grupo-fake-abc123", PARAMETROS_FONTES, {
        acao: "publicar",
        obs_selecionadas: [],
        autor: "servidor.teste",
      }),
    ).rejects.toThrow(/Este caso não foi encontrado/);
  });

  it("422 (OB fora do grupo) propaga a mensagem do backend", async () => {
    const fetchMock = vi.fn(async () => resposta422("OB(s) fora do grupo desta revisão: ['2026OB999999']"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      registrarDecisaoRevisaoRelatorioTransparencia("grupo-fake-abc123", PARAMETROS_FONTES, {
        acao: "publicar",
        obs_selecionadas: ["2026OB999999"],
        autor: "servidor.teste",
      }),
    ).rejects.toThrow(/OB\(s\) fora do grupo/);
  });
});

// --- Confronto QA Codex / QA-RT-03 — 503 de configuração de template
// corrompida (`ConfiguracaoTemplateCorrompida`, backend) precisa de uma
// mensagem distinta do 503 genérico de persistência de decisões
// indisponível (`ErroRelatorioTransparenciaIndisponivel`, mensagem fixa
// sobre "dados de decisões" — enganosa para este caso).


function resposta503TemplateCorrompido() {
  return {
    ok: false,
    status: 503,
    json: async () => ({
      detail: "Configuração do template oficial corrompida (JSON inválido: linha 1 coluna 3).",
    }),
  };
}

describe("obterStatusTemplateRelatorioTransparencia", () => {
  it("503 de template corrompido vira mensagem específica, nunca a de 'dados de decisões'", async () => {
    const fetchMock = vi.fn(async () => resposta503TemplateCorrompido());
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      obterStatusTemplateRelatorioTransparencia("C:\\fake\\AppData\\template_configuracao.json"),
    ).rejects.toThrow(/template oficial.*corrompido/i);
  });

  it("503 sem relação com template continua caindo no erro genérico já existente", async () => {
    const fetchMock = vi.fn(async () => resposta503());
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      obterStatusTemplateRelatorioTransparencia("C:\\fake\\AppData\\template_configuracao.json"),
    ).rejects.toThrow(ErroRelatorioTransparenciaIndisponivel);
  });
});

describe("gerarRelatorioTransparencia — 503 de template corrompido", () => {
  const REQUISICAO_GERAR = {
    ...PARAMETROS_FONTES,
    caminho_configuracao_template: "C:\\fake\\AppData\\template_configuracao.json",
    caminho_destino: "C:\\fake\\Relatorio.xlsx",
  };

  it("503 de template corrompido vira mensagem específica", async () => {
    const fetchMock = vi.fn(async () => resposta503TemplateCorrompido());
    vi.stubGlobal("fetch", fetchMock);

    await expect(gerarRelatorioTransparencia(REQUISICAO_GERAR)).rejects.toThrow(/template oficial.*corrompido/i);
  });

  it("503 sem relação com template continua caindo no erro genérico já existente", async () => {
    const fetchMock = vi.fn(async () => resposta503());
    vi.stubGlobal("fetch", fetchMock);

    await expect(gerarRelatorioTransparencia(REQUISICAO_GERAR)).rejects.toThrow(
      ErroRelatorioTransparenciaIndisponivel,
    );
  });
});

// --- Micro-sprint UX operacional — persistência dos caminhos de Base de
// Ordens Bancárias e Controle DIMCAC.

function resposta503FontesCorrompidas() {
  return {
    ok: false,
    status: 503,
    json: async () => ({
      detail: "Configuração das fontes corrompida (JSON inválido: linha 1 coluna 3).",
    }),
  };
}

describe("obterStatusFontesRelatorioTransparencia", () => {
  it("envia o caminho de configuração na query e devolve o status das duas fontes", async () => {
    const statusFontes = {
      base_efisco: { configurado: true, disponivel: true, caminho: "C:\\fake\\ob.xlsx" },
      controle_dimcac: { configurado: false, disponivel: false, caminho: null },
      planilha_passagens: { configurado: false, disponivel: false, caminho: null },
    };
    const fetchMock = vi.fn(async (_url: string) => respostaOk(statusFontes));
    vi.stubGlobal("fetch", fetchMock);

    const resultado = await obterStatusFontesRelatorioTransparencia("C:\\fake\\AppData\\fontes_configuracao.json");

    expect(resultado).toEqual(statusFontes);
    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain("/fontes?");
    expect(url).toContain(encodeURIComponent("C:\\fake\\AppData\\fontes_configuracao.json"));
  });

  it("503 de fontes corrompidas vira mensagem específica, nunca a de 'dados de decisões'", async () => {
    const fetchMock = vi.fn(async () => resposta503FontesCorrompidas());
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      obterStatusFontesRelatorioTransparencia("C:\\fake\\AppData\\fontes_configuracao.json"),
    ).rejects.toThrow(/Base E-Fisco.*corrompido/i);
  });

  it("503 sem relação com fontes continua caindo no erro genérico já existente", async () => {
    const fetchMock = vi.fn(async () => resposta503());
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      obterStatusFontesRelatorioTransparencia("C:\\fake\\AppData\\fontes_configuracao.json"),
    ).rejects.toThrow(ErroRelatorioTransparenciaIndisponivel);
  });
});

describe("configurarFontesRelatorioTransparencia", () => {
  it("envia a requisição no corpo e devolve o status atualizado das duas fontes", async () => {
    const statusFontes = {
      base_efisco: { configurado: true, disponivel: true, caminho: "C:\\fake\\ob.xlsx" },
      controle_dimcac: { configurado: true, disponivel: true, caminho: "C:\\fake\\dimcac.xlsx" },
      planilha_passagens: { configurado: false, disponivel: false, caminho: null },
    };
    const fetchMock = vi.fn(async (_url: string, _opcoes: RequestInit) => respostaOk(statusFontes));
    vi.stubGlobal("fetch", fetchMock);

    const resultado = await configurarFontesRelatorioTransparencia({
      caminho_configuracao_fontes: "C:\\fake\\AppData\\fontes_configuracao.json",
      caminho_base_efisco: "C:\\fake\\ob.xlsx",
    });

    expect(resultado).toEqual(statusFontes);
    const [, opcoes] = fetchMock.mock.calls[0];
    expect(opcoes.method).toBe("POST");
    expect(JSON.parse(opcoes.body as string)).toEqual({
      caminho_configuracao_fontes: "C:\\fake\\AppData\\fontes_configuracao.json",
      caminho_base_efisco: "C:\\fake\\ob.xlsx",
    });
  });

  it("503 de fontes corrompidas vira mensagem específica", async () => {
    const fetchMock = vi.fn(async () => resposta503FontesCorrompidas());
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      configurarFontesRelatorioTransparencia({ caminho_configuracao_fontes: "C:\\fake\\fontes.json" }),
    ).rejects.toThrow(/Base E-Fisco.*corrompido/i);
  });
});
