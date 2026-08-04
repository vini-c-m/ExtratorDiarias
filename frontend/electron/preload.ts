// Ponte segura entre o processo main e o React (renderer).
import { contextBridge, ipcRenderer, webUtils } from "electron";

// A partir do Electron 32, File.path deixou de existir no renderer por
// segurança. webUtils.getPathForFile é a forma suportada de obter o
// caminho absoluto de um File selecionado via <input type="file">.
contextBridge.exposeInMainWorld("api", {
  getPathForFile: (arquivo: File) => webUtils.getPathForFile(arquivo),
  abrirArquivo: (caminho: string): Promise<void> =>
    ipcRenderer.invoke("planilha:abrir-arquivo", caminho),
  salvarComo: (caminhoOrigem: string): Promise<string | null> =>
    ipcRenderer.invoke("planilha:salvar-como", caminhoOrigem),
  // Sprint 19.7.5 — `nomeSugerido` opcional: ausente preserva o
  // comportamento já homologado do Processamento (nome/filtro fixos em
  // ".html", calculados dentro do próprio IPC); presente, o diálogo
  // nativo usa o nome/extensão reais do arquivo gerado (Central
  // Analítica — PDF/Excel/CSV, `POST /relatorios`).
  salvarRelatorio: (
    caminhoOrigem: string,
    pastaResultados: string,
    nomeSugerido?: string,
  ): Promise<{ caminhoArquivo: string; pastaArquivo: string } | null> =>
    ipcRenderer.invoke("relatorio:salvar-como", caminhoOrigem, pastaResultados, nomeSugerido),
  copiarHistorico: (texto: string): Promise<void> =>
    ipcRenderer.invoke("conferencia:copiar-historico", texto),
  selecionarPlanilhaOficial: (): Promise<string | null> =>
    ipcRenderer.invoke("configuracao:selecionar-planilha"),
  // Sprint 19.5.8 — mecanismo genérico de cópia (ver `ipc/clipboard.ts`),
  // usado por "Copiar SEI" da Central Analítica.
  copiarTexto: (texto: string): Promise<void> =>
    ipcRenderer.invoke("clipboard:copiar-texto", texto),
});
