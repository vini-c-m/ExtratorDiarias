import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ErroRelatorioTransparenciaIndisponivel,
  gerarRelatorioTransparencia,
  listarRevisoesRelatorioTransparencia,
  obterStatusTemplateRelatorioTransparencia,
  prepararRelatorioTransparencia,
  registrarDecisaoRevisaoRelatorioTransparencia,
} from "./api";

// Dados 100% fictícios (nenhum CPF/OB/DH/SEI real) — mesmo critério dos
// mockups da investigação UX 3E.
const PARAMETROS_FONTES = {
  caminho_base_ordens_bancarias: "C:\\fake\\OB_Transparencia_2026_08.xlsx",
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

  it("404 de Base OB não encontrada vira mensagem amigável, nunca expõe o caminho absoluto", async () => {
    const fetchMock = vi.fn(async () =>
      resposta404("Base de Ordens Bancárias não encontrada: C:\\fake\\OB_Transparencia_2026_08.xlsx"),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(prepararRelatorioTransparencia(PARAMETROS_FONTES)).rejects.toThrow(
      /Não encontramos o arquivo da Base de Ordens Bancárias/,
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
