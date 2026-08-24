// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useRelatorioTransparencia } from "./useRelatorioTransparencia";

vi.mock("../services/api", async (importarOriginal) => {
  const real = await importarOriginal<typeof import("../services/api")>();
  return {
    ...real,
    prepararRelatorioTransparencia: vi.fn(),
    registrarDecisaoRevisaoRelatorioTransparencia: vi.fn(),
  };
});

import {
  prepararRelatorioTransparencia,
  registrarDecisaoRevisaoRelatorioTransparencia,
} from "../services/api";

const prepararMock = vi.mocked(prepararRelatorioTransparencia);
const decidirMock = vi.mocked(registrarDecisaoRevisaoRelatorioTransparencia);

const PARAMETROS_FONTES = {
  caminho_base_ordens_bancarias: "C:\\fake\\ob.xlsx",
  caminho_controle_dimcac: "C:\\fake\\dimcac.xlsx",
  ano_exercicio: 2026,
  mes_referencia: 8,
  caminho_decisoes: "C:\\fake\\decisoes.json",
};

function revisao(identidade: string, estado: "pendente" | "decidida" | "adiada" | "desatualizada") {
  return {
    identidade_grupo: identidade,
    regra: "RN07",
    estado,
    explicacao: "explicação fictícia",
    campos_iguais: ["beneficiario"],
    campos_diferentes: ["ob"],
    ocorrencias: [],
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("useRelatorioTransparencia", () => {
  it("estado inicial: fase 'entrada', sem erro", () => {
    const { result } = renderHook(() => useRelatorioTransparencia());

    expect(result.current.estado).toEqual({ fase: "entrada", erro: null });
    expect(result.current.preparando).toBe(false);
  });

  it("preparar com sucesso avança para a fase 'resumo' com o resumo do backend", async () => {
    const resumo = {
      total_candidatos_normais: 1799,
      total_revisoes: 2,
      total_pendentes: 2,
      total_decididas: 0,
      total_adiadas: 0,
      total_desatualizadas: 0,
      total_ocorrencias_nao_publicaveis: 0,
      pode_gerar_relatorio: false,
      revisoes: [revisao("grupo-1", "pendente"), revisao("grupo-2", "pendente")],
    };
    prepararMock.mockResolvedValue(resumo);
    const { result } = renderHook(() => useRelatorioTransparencia());

    await act(async () => {
      await result.current.preparar(PARAMETROS_FONTES);
    });

    expect(result.current.estado).toEqual({ fase: "resumo", resumo });
  });

  it("preparar com falha permanece na fase 'entrada' com mensagem amigável", async () => {
    prepararMock.mockRejectedValue(new Error("Backend respondeu 404"));
    const { result } = renderHook(() => useRelatorioTransparencia());

    await act(async () => {
      await result.current.preparar(PARAMETROS_FONTES);
    });

    expect(result.current.estado.fase).toBe("entrada");
    expect((result.current.estado as { erro: string }).erro).toBeTruthy();
  });

  it("bloqueia duplo envio: duas chamadas de preparar simultâneas resultam em uma única chamada à API", async () => {
    let resolverPreparar: (valor: Awaited<ReturnType<typeof prepararMock>>) => void = () => {};
    prepararMock.mockReturnValue(
      new Promise((resolve) => {
        resolverPreparar = resolve;
      }),
    );
    const { result } = renderHook(() => useRelatorioTransparencia());

    let primeira: Promise<void> = Promise.resolve();
    let segunda: Promise<void> = Promise.resolve();
    act(() => {
      primeira = result.current.preparar(PARAMETROS_FONTES);
      segunda = result.current.preparar(PARAMETROS_FONTES);
    });
    await act(async () => {
      resolverPreparar({
        total_candidatos_normais: 1,
        total_revisoes: 0,
        total_pendentes: 0,
        total_decididas: 0,
        total_adiadas: 0,
        total_desatualizadas: 0,
        total_ocorrencias_nao_publicaveis: 0,
        pode_gerar_relatorio: true,
        revisoes: [],
      });
      await primeira;
      await segunda;
    });

    expect(prepararMock).toHaveBeenCalledTimes(1);
  });

  async function irParaRevisaoComDoisCasosPendentes() {
    const resumo = {
      total_candidatos_normais: 1799,
      total_revisoes: 2,
      total_pendentes: 2,
      total_decididas: 0,
      total_adiadas: 0,
      total_desatualizadas: 0,
      total_ocorrencias_nao_publicaveis: 0,
      pode_gerar_relatorio: false,
      revisoes: [revisao("grupo-1", "pendente"), revisao("grupo-2", "pendente")],
    };
    prepararMock.mockResolvedValue(resumo);
    const { result } = renderHook(() => useRelatorioTransparencia());
    await act(async () => {
      await result.current.preparar(PARAMETROS_FONTES);
    });
    act(() => {
      result.current.iniciarRevisao();
    });
    return result;
  }

  it("iniciarRevisao move a fase 'resumo' para 'revisao'", async () => {
    const result = await irParaRevisaoComDoisCasosPendentes();

    expect(result.current.estado.fase).toBe("revisao");
  });

  it("confirmarDecisao com pendências restantes: permanece na fase 'revisao' com o resumo atualizado", async () => {
    const result = await irParaRevisaoComDoisCasosPendentes();
    const resumoAtualizado = {
      total_candidatos_normais: 1799,
      total_revisoes: 2,
      total_pendentes: 1,
      total_decididas: 1,
      total_adiadas: 0,
      total_desatualizadas: 0,
      total_ocorrencias_nao_publicaveis: 0,
      pode_gerar_relatorio: false,
      revisoes: [revisao("grupo-1", "decidida"), revisao("grupo-2", "pendente")],
    };
    decidirMock.mockResolvedValue(resumoAtualizado);

    await act(async () => {
      await result.current.confirmarDecisao("grupo-1", ["2026OB000241"], "servidor.teste");
    });

    expect(result.current.estado).toEqual({ fase: "revisao", resumo: resumoAtualizado, erro: null });
    expect(decidirMock).toHaveBeenCalledWith("grupo-1", PARAMETROS_FONTES, {
      acao: "publicar",
      obs_selecionadas: ["2026OB000241"],
      autor: "servidor.teste",
    });
  });

  it("confirmarDecisao resolvendo o último caso pendente: avança para a fase 'resumo'", async () => {
    const result = await irParaRevisaoComDoisCasosPendentes();
    const resumoFinal = {
      total_candidatos_normais: 1799,
      total_revisoes: 2,
      total_pendentes: 0,
      total_decididas: 2,
      total_adiadas: 0,
      total_desatualizadas: 0,
      total_ocorrencias_nao_publicaveis: 0,
      pode_gerar_relatorio: true,
      revisoes: [revisao("grupo-1", "decidida"), revisao("grupo-2", "decidida")],
    };
    decidirMock.mockResolvedValue(resumoFinal);

    await act(async () => {
      await result.current.confirmarDecisao("grupo-2", ["2026OB000389"], "servidor.teste");
    });

    expect(result.current.estado).toEqual({ fase: "resumo", resumo: resumoFinal });
  });

  it("confirmarDecisao com seleção vazia + justificativa: encaminha a justificativa como observacao (3E.2)", async () => {
    const result = await irParaRevisaoComDoisCasosPendentes();
    decidirMock.mockResolvedValue({
      total_candidatos_normais: 1799,
      total_revisoes: 2,
      total_pendentes: 1,
      total_decididas: 1,
      total_adiadas: 0,
      total_desatualizadas: 0,
      total_ocorrencias_nao_publicaveis: 1,
      pode_gerar_relatorio: false,
      revisoes: [revisao("grupo-1", "decidida"), revisao("grupo-2", "pendente")],
    });

    await act(async () => {
      await result.current.confirmarDecisao(
        "grupo-1",
        [],
        "servidor.teste",
        "Excluída até apuração interna.",
      );
    });

    expect(decidirMock).toHaveBeenCalledWith("grupo-1", PARAMETROS_FONTES, {
      acao: "publicar",
      obs_selecionadas: [],
      autor: "servidor.teste",
      observacao: "Excluída até apuração interna.",
    });
  });

  it("adiarCaso envia acao 'adiar' com obs_selecionadas vazio", async () => {
    const result = await irParaRevisaoComDoisCasosPendentes();
    decidirMock.mockResolvedValue({
      total_candidatos_normais: 1799,
      total_revisoes: 2,
      total_pendentes: 1,
      total_decididas: 0,
      total_adiadas: 1,
      total_desatualizadas: 0,
      total_ocorrencias_nao_publicaveis: 0,
      pode_gerar_relatorio: false,
      revisoes: [revisao("grupo-1", "adiada"), revisao("grupo-2", "pendente")],
    });

    await act(async () => {
      await result.current.adiarCaso("grupo-1", "servidor.teste");
    });

    expect(decidirMock).toHaveBeenCalledWith("grupo-1", PARAMETROS_FONTES, {
      acao: "adiar",
      obs_selecionadas: [],
      autor: "servidor.teste",
    });
  });

  it("decisão com falha: permanece na fase 'revisao' com o MESMO resumo anterior e uma mensagem de erro", async () => {
    const result = await irParaRevisaoComDoisCasosPendentes();
    const resumoAntesDaFalha = result.current.estado;
    decidirMock.mockRejectedValue(new Error("Backend respondeu 422"));

    await act(async () => {
      await result.current.confirmarDecisao("grupo-1", ["2026OB000241"], "servidor.teste");
    });

    expect(result.current.estado.fase).toBe("revisao");
    expect((result.current.estado as { resumo: unknown }).resumo).toEqual(
      (resumoAntesDaFalha as { resumo: unknown }).resumo,
    );
    expect((result.current.estado as { erro: string }).erro).toBeTruthy();
  });

  it("bloqueia duplo envio de decisão: duas chamadas simultâneas resultam em uma única chamada à API", async () => {
    const result = await irParaRevisaoComDoisCasosPendentes();
    let resolverDecisao: (valor: Awaited<ReturnType<typeof decidirMock>>) => void = () => {};
    decidirMock.mockReturnValue(
      new Promise((resolve) => {
        resolverDecisao = resolve;
      }),
    );

    act(() => {
      result.current.confirmarDecisao("grupo-1", ["2026OB000241"], "servidor.teste");
      result.current.confirmarDecisao("grupo-1", ["2026OB000241"], "servidor.teste");
    });
    await act(async () => {
      resolverDecisao({
        total_candidatos_normais: 1799,
        total_revisoes: 2,
        total_pendentes: 1,
        total_decididas: 1,
        total_adiadas: 0,
        total_desatualizadas: 0,
        total_ocorrencias_nao_publicaveis: 0,
        pode_gerar_relatorio: false,
        revisoes: [revisao("grupo-1", "decidida"), revisao("grupo-2", "pendente")],
      });
    });

    expect(decidirMock).toHaveBeenCalledTimes(1);
  });

  it("voltarParaEntrada volta para a fase 'entrada' sem erro", async () => {
    const result = await irParaRevisaoComDoisCasosPendentes();

    act(() => {
      result.current.voltarParaEntrada();
    });

    expect(result.current.estado).toEqual({ fase: "entrada", erro: null });
  });
});
