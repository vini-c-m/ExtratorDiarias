import { BrowserWindow, dialog, ipcMain, shell } from "electron";
import * as fs from "fs/promises";
import * as path from "path";

export function registrarIpcPlanilha(): void {
  ipcMain.handle("planilha:abrir-arquivo", async (_evento, caminho: string) => {
    const erro = await shell.openPath(caminho);
    if (erro) throw new Error(erro);
  });

  ipcMain.handle("planilha:salvar-como", async (evento, caminhoOrigem: string) => {
    const janela = BrowserWindow.fromWebContents(evento.sender);
    const opcoes = {
      defaultPath: path.basename(caminhoOrigem),
      filters: [{ name: "Planilha Excel", extensions: ["xlsx"] }],
    };
    const resultado = await (janela
      ? dialog.showSaveDialog(janela, opcoes)
      : dialog.showSaveDialog(opcoes));

    if (resultado.canceled || !resultado.filePath) return null;

    await fs.copyFile(caminhoOrigem, resultado.filePath);
    return resultado.filePath;
  });
}
