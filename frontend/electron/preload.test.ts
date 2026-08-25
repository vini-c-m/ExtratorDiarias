import { beforeEach, describe, expect, it, vi } from "vitest";

const { contextBridgeMock, ipcRendererMock, webUtilsMock } = vi.hoisted(() => ({
  contextBridgeMock: { exposeInMainWorld: vi.fn() },
  ipcRendererMock: { invoke: vi.fn() },
  webUtilsMock: { getPathForFile: vi.fn() },
}));

vi.mock("electron", () => ({
  contextBridge: contextBridgeMock,
  ipcRenderer: ipcRendererMock,
  webUtils: webUtilsMock,
}));

// Sprint 19.5.8.1 — correção da lacuna N1 da Auditoria Técnica (19.5.8
// REPROVADA): `preload.ts` nunca teve teste próprio. `contextBridge` é a
// única ponte real do app (dublê aqui, nunca `window` de verdade) — o
// arquivo executa `exposeInMainWorld` como efeito colateral do próprio
// import, por isso cada teste reimporta o módulo (`vi.resetModules`) para
// capturar o objeto exposto de novo.
describe("preload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  async function importarApiExposta() {
    await import("./preload");
    const chamada = contextBridgeMock.exposeInMainWorld.mock.calls[0];
    return chamada[1] as Record<string, (...args: unknown[]) => unknown>;
  }

  it("expõe window.api uma única vez, exclusivamente via contextBridge (nenhum objeto Electron exposto direto)", async () => {
    await importarApiExposta();

    expect(contextBridgeMock.exposeInMainWorld).toHaveBeenCalledTimes(1);
    expect(contextBridgeMock.exposeInMainWorld).toHaveBeenCalledWith("api", expect.any(Object));
  });

  it("copiarTexto invoca ipcRenderer.invoke no canal 'clipboard:copiar-texto' com o texto exato", async () => {
    const api = await importarApiExposta();

    api.copiarTexto("19.20.0903.0030720/2024-36");

    expect(ipcRendererMock.invoke).toHaveBeenCalledWith("clipboard:copiar-texto", "19.20.0903.0030720/2024-36");
  });

  it("copiarHistorico (canal antigo da Conferência) continua expondo o mesmo canal/assinatura", async () => {
    const api = await importarApiExposta();

    api.copiarHistorico("texto do histórico");

    expect(ipcRendererMock.invoke).toHaveBeenCalledWith("conferencia:copiar-historico", "texto do histórico");
  });

  it("abrirLinkExterno (link Arquimedes) invoca ipcRenderer.invoke no canal 'link:abrir-externo' com a URL exata", async () => {
    const api = await importarApiExposta();

    api.abrirLinkExterno("https://arquimedes.mppe.mp.br/arquimedes/");

    expect(ipcRendererMock.invoke).toHaveBeenCalledWith(
      "link:abrir-externo",
      "https://arquimedes.mppe.mp.br/arquimedes/",
    );
  });

  // Organização Automática de PDFs.
  it("selecionarPastaOperacional invoca ipcRenderer.invoke no canal 'configuracao:selecionar-pasta'", async () => {
    const api = await importarApiExposta();

    api.selecionarPastaOperacional();

    expect(ipcRendererMock.invoke).toHaveBeenCalledWith("configuracao:selecionar-pasta");
  });

  // Correção pós-regressão (P0): o cálculo de path.resolve/path.relative
  // NUNCA pode rodar dentro do preload — este processo roda sandboxado
  // neste app (padrão do Electron desde a v20, nunca desabilitado) e
  // `require("path")`/`require("node:path")` falham aí com "module not
  // found", derrubando a execução do preload inteiro ANTES de
  // `contextBridge.exposeInMainWorld` rodar (foi exatamente essa a causa
  // da regressão P0 encontrada na validação manual). Por isso
  // `caminhoDentroDaPasta` só invoca IPC — a lógica real (e os testes da
  // guarda Windows-safe em si) vivem em `ipc/configuracao.ts` /
  // `ipc/configuracao.test.ts`, no processo main (nunca sandboxado).
  it("caminhoDentroDaPasta invoca ipcRenderer.invoke no canal 'configuracao:caminho-dentro-da-pasta', nunca usa o módulo path direto no preload", async () => {
    const api = await importarApiExposta();

    api.caminhoDentroDaPasta("C:\\PDFs\\a processar\\arquivo.pdf", "C:\\PDFs\\a processar");

    expect(ipcRendererMock.invoke).toHaveBeenCalledWith(
      "configuracao:caminho-dentro-da-pasta",
      "C:\\PDFs\\a processar\\arquivo.pdf",
      "C:\\PDFs\\a processar",
    );
  });

  // Micro-sprint 3E.1 — Relatório do Portal da Transparência.
  it("obterCaminhoDecisoesRelatorioTransparencia invoca ipcRenderer.invoke no canal 'relatorio-transparencia:obter-caminho-decisoes'", async () => {
    const api = await importarApiExposta();

    api.obterCaminhoDecisoesRelatorioTransparencia();

    expect(ipcRendererMock.invoke).toHaveBeenCalledWith("relatorio-transparencia:obter-caminho-decisoes");
  });

  // Micro-sprint 3H — Template Oficial / geração do XLSX final.
  it("obterCaminhoConfiguracaoTemplateRelatorioTransparencia invoca ipcRenderer.invoke no canal 'relatorio-transparencia:obter-caminho-configuracao-template'", async () => {
    const api = await importarApiExposta();

    api.obterCaminhoConfiguracaoTemplateRelatorioTransparencia();

    expect(ipcRendererMock.invoke).toHaveBeenCalledWith(
      "relatorio-transparencia:obter-caminho-configuracao-template",
    );
  });

  it("escolherDestinoRelatorioTransparencia invoca ipcRenderer.invoke no canal 'relatorio-transparencia:escolher-destino' com o nome sugerido", async () => {
    const api = await importarApiExposta();

    api.escolherDestinoRelatorioTransparencia("Relatório de Diárias - Portal da Transparência - Agosto 2026.xlsx");

    expect(ipcRendererMock.invoke).toHaveBeenCalledWith(
      "relatorio-transparencia:escolher-destino",
      "Relatório de Diárias - Portal da Transparência - Agosto 2026.xlsx",
    );
  });
});
