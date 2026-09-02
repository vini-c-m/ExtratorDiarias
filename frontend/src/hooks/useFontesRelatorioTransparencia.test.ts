// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../services/api", async (importarOriginal) => {
  const real = await importarOriginal<typeof import("../services/api")>();
  return {
    ...real,
    obterStatusFontesRelatorioTransparencia: vi.fn(),
    configurarFontesRelatorioTransparencia: vi.fn(),
  };
});

import {
  configurarFontesRelatorioTransparencia,
  obterStatusFontesRelatorioTransparencia,
} from "../services/api";
import { useFontesRelatorioTransparencia } from "./useFontesRelatorioTransparencia";

const statusMock = vi.mocked(obterStatusFontesRelatorioTransparencia);
const configurarMock = vi.mocked(configurarFontesRelatorioTransparencia);

const CAMINHO_CONFIGURACAO_FONTES = "C:\\fake\\AppData\\relatorio_transparencia_fontes_configuracao.json";

const NAO_CONFIGURADO = { configurado: false, disponivel: false, caminho: null };

afterEach(() => {
  vi.clearAllMocks();
});

// Micro-sprint UX operacional (item 3) — a Base de Ordens Bancárias e o
// Controle DIMCAC, uma vez selecionados, devem persistir e reaparecer já
// pré-selecionados ao reabrir o módulo. Este hook orquestra `GET/POST
// /fontes`; estes testes cobrem o carregamento inicial, a configuração de
// cada arquivo independentemente e o tratamento de arquivo indisponível.
describe("useFontesRelatorioTransparencia", () => {
  beforeEach(() => {
    statusMock.mockResolvedValue({
      base_ordens_bancarias: NAO_CONFIGURADO,
      controle_dimcac: NAO_CONFIGURADO,
      planilha_passagens: NAO_CONFIGURADO,
    });
  });

  it("carrega o status das duas fontes assim que caminhoConfiguracaoFontes é resolvido", async () => {
    const { result } = renderHook(() => useFontesRelatorioTransparencia(CAMINHO_CONFIGURACAO_FONTES));

    await waitFor(() => expect(result.current.statusBaseOB).toEqual({ fase: "nao-configurado" }));
    expect(result.current.statusControleDimcac).toEqual({ fase: "nao-configurado" });
    expect(statusMock).toHaveBeenCalledWith(CAMINHO_CONFIGURACAO_FONTES);
  });

  it("nunca chama a API enquanto caminhoConfiguracaoFontes é null", () => {
    renderHook(() => useFontesRelatorioTransparencia(null));

    expect(statusMock).not.toHaveBeenCalled();
  });

  it("fonte configurada e disponível: fase 'pronto', com o NOME do arquivo (nunca o caminho técnico exposto à UI)", async () => {
    statusMock.mockResolvedValue({
      base_ordens_bancarias: { configurado: true, disponivel: true, caminho: "C:\\fake\\OB_Agosto.xlsx" },
      controle_dimcac: NAO_CONFIGURADO,
      planilha_passagens: NAO_CONFIGURADO,
    });

    const { result } = renderHook(() => useFontesRelatorioTransparencia(CAMINHO_CONFIGURACAO_FONTES));

    await waitFor(() =>
      expect(result.current.statusBaseOB).toEqual({
        fase: "pronto",
        caminho: "C:\\fake\\OB_Agosto.xlsx",
        nomeArquivo: "OB_Agosto.xlsx",
      }),
    );
  });

  it("fonte configurada mas arquivo sumiu: fase 'indisponivel' (nunca falha silenciosamente)", async () => {
    statusMock.mockResolvedValue({
      base_ordens_bancarias: NAO_CONFIGURADO,
      controle_dimcac: { configurado: true, disponivel: false, caminho: null },
      planilha_passagens: NAO_CONFIGURADO,
    });

    const { result } = renderHook(() => useFontesRelatorioTransparencia(CAMINHO_CONFIGURACAO_FONTES));

    await waitFor(() => expect(result.current.statusControleDimcac).toEqual({ fase: "indisponivel" }));
  });

  it("configurarBaseOB chama a API e atualiza só o status da Base OB, sem tocar no Controle DIMCAC", async () => {
    configurarMock.mockResolvedValue({
      base_ordens_bancarias: { configurado: true, disponivel: true, caminho: "C:\\fake\\NovaOB.xlsx" },
      controle_dimcac: NAO_CONFIGURADO,
      planilha_passagens: NAO_CONFIGURADO,
    });

    const { result } = renderHook(() => useFontesRelatorioTransparencia(CAMINHO_CONFIGURACAO_FONTES));
    await waitFor(() => expect(result.current.statusBaseOB).toEqual({ fase: "nao-configurado" }));

    await result.current.configurarBaseOB("C:\\fake\\NovaOB.xlsx");

    expect(configurarMock).toHaveBeenCalledWith({
      caminho_configuracao_fontes: CAMINHO_CONFIGURACAO_FONTES,
      caminho_base_ordens_bancarias: "C:\\fake\\NovaOB.xlsx",
    });
    await waitFor(() =>
      expect(result.current.statusBaseOB).toEqual({
        fase: "pronto",
        caminho: "C:\\fake\\NovaOB.xlsx",
        nomeArquivo: "NovaOB.xlsx",
      }),
    );
  });

  it("configurarControleDimcac chama a API e atualiza só o status do Controle DIMCAC", async () => {
    configurarMock.mockResolvedValue({
      base_ordens_bancarias: NAO_CONFIGURADO,
      controle_dimcac: { configurado: true, disponivel: true, caminho: "C:\\fake\\NovoControle.xlsx" },
      planilha_passagens: NAO_CONFIGURADO,
    });

    const { result } = renderHook(() => useFontesRelatorioTransparencia(CAMINHO_CONFIGURACAO_FONTES));
    await waitFor(() => expect(result.current.statusControleDimcac).toEqual({ fase: "nao-configurado" }));

    await result.current.configurarControleDimcac("C:\\fake\\NovoControle.xlsx");

    expect(configurarMock).toHaveBeenCalledWith({
      caminho_configuracao_fontes: CAMINHO_CONFIGURACAO_FONTES,
      caminho_controle_dimcac: "C:\\fake\\NovoControle.xlsx",
    });
    await waitFor(() =>
      expect(result.current.statusControleDimcac).toEqual({
        fase: "pronto",
        caminho: "C:\\fake\\NovoControle.xlsx",
        nomeArquivo: "NovoControle.xlsx",
      }),
    );
  });

  it("erro ao configurar uma fonte não bloqueia a outra — cada status é independente", async () => {
    configurarMock.mockRejectedValue(new Error("Falha simulada"));

    const { result } = renderHook(() => useFontesRelatorioTransparencia(CAMINHO_CONFIGURACAO_FONTES));
    await waitFor(() => expect(result.current.statusBaseOB).toEqual({ fase: "nao-configurado" }));

    await result.current.configurarBaseOB("C:\\fake\\OB.xlsx");

    await waitFor(() => expect(result.current.statusBaseOB.fase).toBe("erro"));
    expect(result.current.statusControleDimcac).toEqual({ fase: "nao-configurado" });
  });

  // Sprint 1 (plano "Valor da Passagem no XLSX Oficial") — terceira fonte
  // persistida, mesmo mecanismo independente das duas acima.
  it("configurarPlanilhaPassagens chama a API e atualiza só o status da Planilha de Passagens", async () => {
    configurarMock.mockResolvedValue({
      base_ordens_bancarias: NAO_CONFIGURADO,
      controle_dimcac: NAO_CONFIGURADO,
      planilha_passagens: { configurado: true, disponivel: true, caminho: "C:\\fake\\passagens.ods" },
    });

    const { result } = renderHook(() => useFontesRelatorioTransparencia(CAMINHO_CONFIGURACAO_FONTES));
    await waitFor(() => expect(result.current.statusPlanilhaPassagens).toEqual({ fase: "nao-configurado" }));

    await result.current.configurarPlanilhaPassagens("C:\\fake\\passagens.ods");

    expect(configurarMock).toHaveBeenCalledWith({
      caminho_configuracao_fontes: CAMINHO_CONFIGURACAO_FONTES,
      caminho_planilha_passagens: "C:\\fake\\passagens.ods",
    });
    await waitFor(() =>
      expect(result.current.statusPlanilhaPassagens).toEqual({
        fase: "pronto",
        caminho: "C:\\fake\\passagens.ods",
        nomeArquivo: "passagens.ods",
      }),
    );
  });
});
