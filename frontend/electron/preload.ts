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
  salvarRelatorio: (
    caminhoOrigem: string,
    pastaResultados: string,
  ): Promise<{ caminhoArquivo: string; pastaArquivo: string } | null> =>
    ipcRenderer.invoke("relatorio:salvar-como", caminhoOrigem, pastaResultados),
  copiarHistorico: (texto: string): Promise<void> =>
    ipcRenderer.invoke("conferencia:copiar-historico", texto),
  selecionarPlanilhaOficial: (): Promise<string | null> =>
    ipcRenderer.invoke("configuracao:selecionar-planilha"),
});
