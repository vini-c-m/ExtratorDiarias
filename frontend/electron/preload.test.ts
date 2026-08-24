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

  // Micro-sprint 3E.1 — Relatório do Portal da Transparência.
  it("obterCaminhoDecisoesRelatorioTransparencia invoca ipcRenderer.invoke no canal 'relatorio-transparencia:obter-caminho-decisoes'", async () => {
    const api = await importarApiExposta();

    api.obterCaminhoDecisoesRelatorioTransparencia();

    expect(ipcRendererMock.invoke).toHaveBeenCalledWith("relatorio-transparencia:obter-caminho-decisoes");
  });
});
