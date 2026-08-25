// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nomeArquivoRelatorioTransparencia, useGerarRelatorioTransparencia } from "./useGerarRelatorioTransparencia";

vi.mock("../services/api", async (importarOriginal) => {
  const real = await importarOriginal<typeof import("../services/api")>();
  return {
    ...real,
    obterStatusTemplateRelatorioTransparencia: vi.fn(),
    configurarTemplateRelatorioTransparencia: vi.fn(),
    gerarRelatorioTransparencia: vi.fn(),
  };
});

import {
  configurarTemplateRelatorioTransparencia,
  gerarRelatorioTransparencia,
  obterStatusTemplateRelatorioTransparencia,
} from "../services/api";

const statusMock = vi.mocked(obterStatusTemplateRelatorioTransparencia);
const configurarMock = vi.mocked(configurarTemplateRelatorioTransparencia);
const gerarMock = vi.mocked(gerarRelatorioTransparencia);

const PARAMETROS_FONTES = {
  caminho_base_ordens_bancarias: "C:\\fake\\ob.xlsx",
  caminho_controle_dimcac: "C:\\fake\\dimcac.xlsx",
  ano_exercicio: 2026,
  mes_referencia: 8,
  caminho_decisoes: "C:\\fake\\decisoes.json",
};

const CAMINHO_CONFIGURACAO_TEMPLATE = "C:\\fake\\AppData\\relatorio_transparencia_template_configuracao.json";

beforeEach(() => {
  window.api = {
    ...window.api,
    escolherDestinoRelatorioTransparencia: vi.fn(),
    abrirArquivo: vi.fn().mockResolvedValue(undefined),
  };
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("nomeArquivoRelatorioTransparencia", () => {
  it("reflete o mesmo texto do título escrito no XLSX ('PAGAS ATÉ MÊS/ANO')", () => {
    expect(nomeArquivoRelatorioTransparencia(2026, 8)).toBe(
      "Relatório de Diárias - Portal da Transparência - Agosto 2026.xlsx",
    );
  });
});

describe("useGerarRelatorioTransparencia — status do template", () => {
  it("carrega o status assim que caminhoConfiguracaoTemplate é resolvido", async () => {
    statusMock.mockResolvedValue({ configurado: false, disponivel: false, caminho_template: null });

    const { result } = renderHook(() => useGerarRelatorioTransparencia(CAMINHO_CONFIGURACAO_TEMPLATE));

    await waitFor(() => expect(result.current.statusTemplate).toEqual({ fase: "nao-configurado" }));
    expect(statusMock).toHaveBeenCalledWith(CAMINHO_CONFIGURACAO_TEMPLATE);
  });

  it("nunca chama a API enquanto caminhoConfiguracaoTemplate é null", () => {
    renderHook(() => useGerarRelatorioTransparencia(null));

    expect(statusMock).not.toHaveBeenCalled();
  });

  it("template configurado e disponível: fase 'pronto', mostrando só o NOME (nunca o caminho técnico)", async () => {
    statusMock.mockResolvedValue({
      configurado: true,
      disponivel: true,
      caminho_template: "C:\\fake\\Modelo_Oficial.xlsx",
    });

    const { result } = renderHook(() => useGerarRelatorioTransparencia(CAMINHO_CONFIGURACAO_TEMPLATE));

    await waitFor(() =>
      expect(result.current.statusTemplate).toEqual({ fase: "pronto", nomeArquivo: "Modelo_Oficial.xlsx" }),
    );
  });

  it("template configurado mas arquivo sumiu: fase 'indisponivel'", async () => {
    statusMock.mockResolvedValue({ configurado: true, disponivel: false, caminho_template: null });

    const { result } = renderHook(() => useGerarRelatorioTransparencia(CAMINHO_CONFIGURACAO_TEMPLATE));

    await waitFor(() => expect(result.current.statusTemplate).toEqual({ fase: "indisponivel" }));
  });

  it("configurarTemplate chama a API e atualiza o status para 'pronto'", async () => {
    statusMock.mockResolvedValue({ configurado: false, disponivel: false, caminho_template: null });
    configurarMock.mockResolvedValue({
      configurado: true,
      disponivel: true,
      caminho_template: "C:\\fake\\NovoModelo.xlsx",
    });

    const { result } = renderHook(() => useGerarRelatorioTransparencia(CAMINHO_CONFIGURACAO_TEMPLATE));
    await waitFor(() => expect(result.current.statusTemplate).toEqual({ fase: "nao-configurado" }));

    await act(async () => {
      await result.current.configurarTemplate("C:\\fake\\NovoModelo.xlsx");
    });

    expect(configurarMock).toHaveBeenCalledWith({
      caminho_configuracao_template: CAMINHO_CONFIGURACAO_TEMPLATE,
      caminho_template: "C:\\fake\\NovoModelo.xlsx",
    });
    expect(result.current.statusTemplate).toEqual({ fase: "pronto", nomeArquivo: "NovoModelo.xlsx" });
  });
});

describe("useGerarRelatorioTransparencia — gerar", () => {
  beforeEach(() => {
    statusMock.mockResolvedValue({
      configurado: true,
      disponivel: true,
      caminho_template: "C:\\fake\\Modelo.xlsx",
    });
  });

  it("abre o diálogo de destino com o nome sugerido correto", async () => {
    (window.api.escolherDestinoRelatorioTransparencia as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const { result } = renderHook(() => useGerarRelatorioTransparencia(CAMINHO_CONFIGURACAO_TEMPLATE));
    await waitFor(() => expect(result.current.statusTemplate.fase).toBe("pronto"));

    await act(async () => {
      await result.current.gerar(PARAMETROS_FONTES);
    });

    expect(window.api.escolherDestinoRelatorioTransparencia).toHaveBeenCalledWith(
      "Relatório de Diárias - Portal da Transparência - Agosto 2026.xlsx",
    );
  });

  it("cancelar o diálogo de destino: não chama /gerar, não mostra erro, volta ao estado ocioso", async () => {
    (window.api.escolherDestinoRelatorioTransparencia as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const { result } = renderHook(() => useGerarRelatorioTransparencia(CAMINHO_CONFIGURACAO_TEMPLATE));
    await waitFor(() => expect(result.current.statusTemplate.fase).toBe("pronto"));

    await act(async () => {
      await result.current.gerar(PARAMETROS_FONTES);
    });

    expect(gerarMock).not.toHaveBeenCalled();
    expect(result.current.estadoGeracao).toEqual({ fase: "ocioso" });
    expect(result.current.gerando).toBe(false);
  });

  it("destino confirmado: chama /gerar com caminho_configuracao_template + caminho_destino, nunca lista de OBs", async () => {
    (window.api.escolherDestinoRelatorioTransparencia as ReturnType<typeof vi.fn>).mockResolvedValue(
      "C:\\fake\\Relatorio.xlsx",
    );
    gerarMock.mockResolvedValue({
      caminho_arquivo: "C:\\fake\\Relatorio.xlsx",
      total_ocorrencias: 5,
      total_valor_diarias: 1000,
      primeira_linha_dados: 7,
      ultima_linha_dados: 11,
      linha_total: 12,
    });

    const { result } = renderHook(() => useGerarRelatorioTransparencia(CAMINHO_CONFIGURACAO_TEMPLATE));
    await waitFor(() => expect(result.current.statusTemplate.fase).toBe("pronto"));

    await act(async () => {
      await result.current.gerar(PARAMETROS_FONTES);
    });

    expect(gerarMock).toHaveBeenCalledWith({
      ...PARAMETROS_FONTES,
      caminho_configuracao_template: CAMINHO_CONFIGURACAO_TEMPLATE,
      caminho_destino: "C:\\fake\\Relatorio.xlsx",
    });
    const payloadEnviado = gerarMock.mock.calls[0][0] as unknown as Record<string, unknown>;
    expect(payloadEnviado).not.toHaveProperty("obs_selecionadas");
    expect(payloadEnviado).not.toHaveProperty("revisoes");
    expect(result.current.estadoGeracao).toEqual({
      fase: "sucesso",
      caminhoArquivo: "C:\\fake\\Relatorio.xlsx",
      caminhoPasta: "C:\\fake",
      totalOcorrencias: 5,
    });
  });

  it("bloqueia um segundo 'gerar' enquanto o primeiro está em voo (duplo clique)", async () => {
    let resolverPrimeiraChamada!: () => void;
    (window.api.escolherDestinoRelatorioTransparencia as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise((resolve) => {
        resolverPrimeiraChamada = () => resolve("C:\\fake\\Relatorio.xlsx");
      }),
    );
    gerarMock.mockResolvedValue({
      caminho_arquivo: "C:\\fake\\Relatorio.xlsx",
      total_ocorrencias: 1,
      total_valor_diarias: 100,
      primeira_linha_dados: 7,
      ultima_linha_dados: 7,
      linha_total: 8,
    });

    const { result } = renderHook(() => useGerarRelatorioTransparencia(CAMINHO_CONFIGURACAO_TEMPLATE));
    await waitFor(() => expect(result.current.statusTemplate.fase).toBe("pronto"));

    let primeiraChamada!: Promise<void>;
    act(() => {
      primeiraChamada = result.current.gerar(PARAMETROS_FONTES);
    });
    expect(result.current.gerando).toBe(true);

    await act(async () => {
      await result.current.gerar(PARAMETROS_FONTES);
    });

    expect(window.api.escolherDestinoRelatorioTransparencia).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolverPrimeiraChamada();
      await primeiraChamada;
    });
  });

  it("erro do backend (ex.: 409 pendências) mostra mensagem amigável, mantém gerando=false", async () => {
    (window.api.escolherDestinoRelatorioTransparencia as ReturnType<typeof vi.fn>).mockResolvedValue(
      "C:\\fake\\Relatorio.xlsx",
    );
    gerarMock.mockRejectedValue(
      new Error("Não é possível gerar o relatório: existem revisões sem decisão válida."),
    );

    const { result } = renderHook(() => useGerarRelatorioTransparencia(CAMINHO_CONFIGURACAO_TEMPLATE));
    await waitFor(() => expect(result.current.statusTemplate.fase).toBe("pronto"));

    await act(async () => {
      await result.current.gerar(PARAMETROS_FONTES);
    });

    expect(result.current.estadoGeracao).toEqual({
      fase: "erro",
      mensagem: "Não é possível gerar o relatório: existem revisões sem decisão válida.",
    });
    expect(result.current.gerando).toBe(false);
  });
});

describe("useGerarRelatorioTransparencia — abrir relatório/pasta", () => {
  async function gerarComSucesso() {
    statusMock.mockResolvedValue({ configurado: true, disponivel: true, caminho_template: "C:\\fake\\Modelo.xlsx" });
    (window.api.escolherDestinoRelatorioTransparencia as ReturnType<typeof vi.fn>).mockResolvedValue(
      "C:\\fake\\pasta\\Relatorio.xlsx",
    );
    gerarMock.mockResolvedValue({
      caminho_arquivo: "C:\\fake\\pasta\\Relatorio.xlsx",
      total_ocorrencias: 1,
      total_valor_diarias: 100,
      primeira_linha_dados: 7,
      ultima_linha_dados: 7,
      linha_total: 8,
    });

    const { result } = renderHook(() => useGerarRelatorioTransparencia(CAMINHO_CONFIGURACAO_TEMPLATE));
    await waitFor(() => expect(result.current.statusTemplate.fase).toBe("pronto"));
    await act(async () => {
      await result.current.gerar(PARAMETROS_FONTES);
    });
    return result;
  }

  it("abrirRelatorio chama abrirArquivo com o caminho do arquivo gerado", async () => {
    const result = await gerarComSucesso();

    await act(async () => {
      await result.current.abrirRelatorio();
    });

    expect(window.api.abrirArquivo).toHaveBeenCalledWith("C:\\fake\\pasta\\Relatorio.xlsx");
  });

  it("abrirPasta chama abrirArquivo com a pasta do arquivo gerado", async () => {
    const result = await gerarComSucesso();

    await act(async () => {
      await result.current.abrirPasta();
    });

    expect(window.api.abrirArquivo).toHaveBeenCalledWith("C:\\fake\\pasta");
  });

  it("falha ao abrir relatório: mostra erro amigável, mantém a fase 'sucesso' (retry continua possível)", async () => {
    const result = await gerarComSucesso();
    (window.api.abrirArquivo as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("ENOENT"));

    await act(async () => {
      await result.current.abrirRelatorio();
    });

    expect(result.current.erroAcaoPosGeracao).toBe(
      "Não foi possível abrir o relatório. Localize-o manualmente na pasta de destino.",
    );
    expect(result.current.estadoGeracao.fase).toBe("sucesso");
  });

  it("falha ao abrir pasta: mostra erro amigável, mantém a fase 'sucesso'", async () => {
    const result = await gerarComSucesso();
    (window.api.abrirArquivo as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("ENOENT"));

    await act(async () => {
      await result.current.abrirPasta();
    });

    expect(result.current.erroAcaoPosGeracao).toBe("Não foi possível abrir a pasta do relatório.");
    expect(result.current.estadoGeracao.fase).toBe("sucesso");
  });
});
