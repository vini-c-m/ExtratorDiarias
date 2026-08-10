// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useGerarRelatorio } from "./useGerarRelatorio";

vi.mock("../services/api", async (importarOriginal) => {
  const original = await importarOriginal<typeof import("../services/api")>();
  return { ...original, gerarRelatorio: vi.fn() };
});

import { gerarRelatorio } from "../services/api";
import type { ParametrosRelatorioQuery } from "../types/analitica";

const gerarRelatorioMock = vi.mocked(gerarRelatorio);

const PARAMETROS: ParametrosRelatorioQuery = {
  filtros: {},
  tipo: "executivo",
  formato: "pdf",
  incluir_indicadores: true,
  incluir_graficos: true,
  incluir_tabela: true,
  incluir_inconsistencias: true,
  modo: "final",
};

const RESPOSTA_GERADA = {
  caminho_arquivo_temporario: "C:\\Temp\\extrator_diarias_relatorios\\abc123.pdf",
  nome_sugerido: "Relatório Executivo - 04-08-2026.pdf",
  sincronizado_em: "2026-08-04T10:00:00",
};

beforeEach(() => {
  window.api = { salvarRelatorio: vi.fn() } as unknown as Window["api"];
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("useGerarRelatorio", () => {
  it("começa na fase 'configurando', sem erro", () => {
    const { result } = renderHook(() => useGerarRelatorio());
    expect(result.current.estado).toEqual({ fase: "configurando", erro: null });
  });

  describe("preVisualizar", () => {
    it("sucesso: vai para 'pre-visualizando' com modo='previsualizacao'", async () => {
      gerarRelatorioMock.mockResolvedValueOnce(RESPOSTA_GERADA);
      const { result } = renderHook(() => useGerarRelatorio());

      await act(async () => {
        await result.current.preVisualizar(PARAMETROS);
      });

      expect(gerarRelatorioMock).toHaveBeenCalledWith({ ...PARAMETROS, modo: "previsualizacao" });
      expect(result.current.estado).toEqual({
        fase: "pre-visualizando",
        previa: {
          caminhoArquivoTemporario: RESPOSTA_GERADA.caminho_arquivo_temporario,
          nomeSugerido: RESPOSTA_GERADA.nome_sugerido,
          sincronizadoEm: RESPOSTA_GERADA.sincronizado_em,
        },
      });
    });

    it("falha: permanece em 'configurando', com a mensagem de erro anexada (§ 11.2 não desenha uma fase de erro própria aqui)", async () => {
      gerarRelatorioMock.mockRejectedValueOnce(new Error("Gráficos estão disponíveis apenas para o formato PDF."));
      const { result } = renderHook(() => useGerarRelatorio());

      await act(async () => {
        await result.current.preVisualizar(PARAMETROS);
      });

      expect(result.current.estado).toEqual({
        fase: "configurando",
        erro: "Gráficos estão disponíveis apenas para o formato PDF.",
      });
    });

    // Sprint (Loading/Bloqueio de Ações, item 1) — estado real de operação
    // em andamento (nunca debounce): `carregandoPreVisualizacao` fica
    // `true` durante toda a chamada, e uma trava síncrona (`useRef`)
    // impede uma segunda chamada concorrente mesmo antes do primeiro
    // re-render (clique duplo — item 13.B).
    it("A/C) carregandoPreVisualizacao fica true durante a chamada e volta a false ao concluir", async () => {
      gerarRelatorioMock.mockResolvedValueOnce(RESPOSTA_GERADA);
      const { result } = renderHook(() => useGerarRelatorio());
      expect(result.current.carregandoPreVisualizacao).toBe(false);

      let promessa!: Promise<void>;
      act(() => {
        promessa = result.current.preVisualizar(PARAMETROS);
      });
      expect(result.current.carregandoPreVisualizacao).toBe(true); // C) permanece "desabilitado" enquanto executa

      await act(async () => {
        await promessa;
      });

      expect(result.current.carregandoPreVisualizacao).toBe(false); // D) sucesso — volta ao normal
    });

    it("E) erro também devolve carregandoPreVisualizacao a false", async () => {
      gerarRelatorioMock.mockRejectedValueOnce(new Error("falha simulada"));
      const { result } = renderHook(() => useGerarRelatorio());

      await act(async () => {
        await result.current.preVisualizar(PARAMETROS);
      });

      expect(result.current.carregandoPreVisualizacao).toBe(false);
    });

    it("B) clique duplo (chamada concorrente antes do primeiro terminar) dispara só UMA requisição", async () => {
      let resolverPrimeira!: (valor: typeof RESPOSTA_GERADA) => void;
      gerarRelatorioMock.mockImplementationOnce(
        () => new Promise((resolve) => { resolverPrimeira = resolve; }),
      );
      const { result } = renderHook(() => useGerarRelatorio());

      let primeiraChamada!: Promise<void>;
      let segundaChamada!: Promise<void>;
      act(() => {
        primeiraChamada = result.current.preVisualizar(PARAMETROS);
        // Segunda chamada disparada ANTES da primeira resolver — mesma
        // janela de um clique duplo real, já que `carregando` do `Botao`
        // só desabilita depois do primeiro re-render.
        segundaChamada = result.current.preVisualizar(PARAMETROS);
      });

      expect(gerarRelatorioMock).toHaveBeenCalledTimes(1);

      await act(async () => {
        resolverPrimeira(RESPOSTA_GERADA);
        await Promise.all([primeiraChamada, segundaChamada]);
      });

      expect(gerarRelatorioMock).toHaveBeenCalledTimes(1);
    });
  });

  it("voltar: de 'pre-visualizando' retorna para 'configurando' sem erro", async () => {
    gerarRelatorioMock.mockResolvedValueOnce(RESPOSTA_GERADA);
    const { result } = renderHook(() => useGerarRelatorio());
    await act(async () => {
      await result.current.preVisualizar(PARAMETROS);
    });

    act(() => {
      result.current.voltar();
    });

    expect(result.current.estado).toEqual({ fase: "configurando", erro: null });
  });

  describe("gerar", () => {
    it("sucesso: POST com modo='final' + IPC concluído vai para 'sucesso'", async () => {
      gerarRelatorioMock.mockResolvedValueOnce(RESPOSTA_GERADA);
      const salvarMock = vi.fn().mockResolvedValue({ caminhoArquivo: "C:\\Users\\x\\relatorio.pdf", pastaArquivo: "C:\\Users\\x" });
      window.api = { salvarRelatorio: salvarMock } as unknown as Window["api"];
      const { result } = renderHook(() => useGerarRelatorio());

      let promessa!: Promise<void>;
      act(() => {
        promessa = result.current.gerar(PARAMETROS);
      });
      expect(result.current.estado).toEqual({ fase: "gerando" });
      await act(async () => {
        await promessa;
      });

      expect(gerarRelatorioMock).toHaveBeenCalledWith({ ...PARAMETROS, modo: "final" });
      expect(salvarMock).toHaveBeenCalledWith(
        RESPOSTA_GERADA.caminho_arquivo_temporario,
        "",
        RESPOSTA_GERADA.nome_sugerido,
      );
      expect(result.current.estado).toEqual({
        fase: "sucesso",
        resultado: { caminhoArquivo: "C:\\Users\\x\\relatorio.pdf", pastaArquivo: "C:\\Users\\x" },
      });
    });

    it("usuário cancela o diálogo nativo (IPC devolve null): volta para 'configurando' sem erro, nunca 'erro'", async () => {
      gerarRelatorioMock.mockResolvedValueOnce(RESPOSTA_GERADA);
      window.api = { salvarRelatorio: vi.fn().mockResolvedValue(null) } as unknown as Window["api"];
      const { result } = renderHook(() => useGerarRelatorio());

      await act(async () => {
        await result.current.gerar(PARAMETROS);
      });

      expect(result.current.estado).toEqual({ fase: "configurando", erro: null });
    });

    it("falha na geração (POST rejeita): vai para 'erro'", async () => {
      gerarRelatorioMock.mockRejectedValueOnce(new Error("Não foi possível acessar os registros da Central Analítica agora. Tente novamente em instantes."));
      const { result } = renderHook(() => useGerarRelatorio());

      await act(async () => {
        await result.current.gerar(PARAMETROS);
      });

      expect(result.current.estado).toEqual({
        fase: "erro",
        mensagem: "Não foi possível acessar os registros da Central Analítica agora. Tente novamente em instantes.",
      });
    });

    it("falha no salvamento (IPC rejeita): vai para 'erro'", async () => {
      gerarRelatorioMock.mockResolvedValueOnce(RESPOSTA_GERADA);
      window.api = { salvarRelatorio: vi.fn().mockRejectedValue(new Error("falha ao copiar arquivo")) } as unknown as Window["api"];
      const { result } = renderHook(() => useGerarRelatorio());

      await act(async () => {
        await result.current.gerar(PARAMETROS);
      });

      expect(result.current.estado.fase).toBe("erro");
    });

    it("window.api ausente (preload não anexado): vai para 'erro', nunca lança exceção não tratada", async () => {
      gerarRelatorioMock.mockResolvedValueOnce(RESPOSTA_GERADA);
      // @ts-expect-error — simula o preload não ter anexado `window.api`.
      delete window.api;
      const { result } = renderHook(() => useGerarRelatorio());

      await act(async () => {
        await result.current.gerar(PARAMETROS);
      });

      expect(result.current.estado.fase).toBe("erro");
    });
  });

  describe("tentarNovamente", () => {
    it("repete 'gerar' com os últimos parâmetros usados", async () => {
      gerarRelatorioMock.mockRejectedValueOnce(new Error("falha simulada"));
      const { result } = renderHook(() => useGerarRelatorio());
      await act(async () => {
        await result.current.gerar(PARAMETROS);
      });
      expect(result.current.estado.fase).toBe("erro");

      gerarRelatorioMock.mockResolvedValueOnce(RESPOSTA_GERADA);
      window.api = {
        salvarRelatorio: vi.fn().mockResolvedValue({ caminhoArquivo: "x", pastaArquivo: "y" }),
      } as unknown as Window["api"];

      await act(async () => {
        result.current.tentarNovamente();
        await Promise.resolve();
      });

      expect(gerarRelatorioMock).toHaveBeenLastCalledWith({ ...PARAMETROS, modo: "final" });
    });

    it("sem geração anterior: não faz nada (nenhuma chamada a gerarRelatorio)", () => {
      const { result } = renderHook(() => useGerarRelatorio());

      act(() => {
        result.current.tentarNovamente();
      });

      expect(gerarRelatorioMock).not.toHaveBeenCalled();
      expect(result.current.estado).toEqual({ fase: "configurando", erro: null });
    });
  });

  it("cancelar: de 'erro' retorna para 'configurando' sem erro", async () => {
    gerarRelatorioMock.mockRejectedValueOnce(new Error("falha simulada"));
    const { result } = renderHook(() => useGerarRelatorio());
    await act(async () => {
      await result.current.gerar(PARAMETROS);
    });
    expect(result.current.estado.fase).toBe("erro");

    act(() => {
      result.current.cancelar();
    });

    expect(result.current.estado).toEqual({ fase: "configurando", erro: null });
  });
});
