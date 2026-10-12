import { BrowserWindow, dialog, ipcMain } from "electron";
import * as path from "path";

// Sprint 15 — Configuração Inicial da Planilha Oficial. Mesmo padrão já
// usado em `planilha:salvar-como` (ipc/planilha.ts), só com
// `showOpenDialog` no lugar de `showSaveDialog`: o usuário escolhe um
// `.xlsx` já existente, nunca cria um novo. Nenhuma cópia/gravação aqui —
// só devolve o caminho escolhido; quem persiste e valida é o backend
// (`app/api/configuracao.py`).
export function registrarIpcConfiguracao(): void {
  ipcMain.handle("configuracao:selecionar-planilha", async (evento) => {
    const janela = BrowserWindow.fromWebContents(evento.sender);
    const opcoes: Electron.OpenDialogOptions = {
      title: "Selecionar planilha oficial",
      filters: [{ name: "Planilha Excel", extensions: ["xlsx"] }],
      properties: ["openFile"],
    };
    const resultado = await (janela
      ? dialog.showOpenDialog(janela, opcoes)
      : dialog.showOpenDialog(opcoes));

    if (resultado.canceled || resultado.filePaths.length === 0) return null;
    return resultado.filePaths[0];
  });

  // Organização Automática de PDFs — seletor nativo de pasta, para as
  // quatro Pastas Operacionais (`SecaoPastasOperacionais.tsx`). Mesmo
  // padrão do handler acima, só com `openDirectory` no lugar de `openFile`
  // e sem filtro de extensão. Decisão confirmada: nenhum `defaultPath`.
  ipcMain.handle("configuracao:selecionar-pasta", async (evento) => {
    const janela = BrowserWindow.fromWebContents(evento.sender);
    const opcoes: Electron.OpenDialogOptions = {
      title: "Selecionar pasta",
      properties: ["openDirectory"],
    };
    const resultado = await (janela
      ? dialog.showOpenDialog(janela, opcoes)
      : dialog.showOpenDialog(opcoes));

    if (resultado.canceled || resultado.filePaths.length === 0) return null;
    return resultado.filePaths[0];
  });

  // Organização Automática de PDFs — guarda Windows-safe (path.resolve +
  // path.relative — nunca prefixo de string ingênuo). Vive no processo
  // main (nunca sandboxado) de propósito: o preload roda sandboxado neste
  // app (padrão do Electron desde a v20) e não tem acesso ao módulo `path`
  // do Node — ver o comentário em `preload.ts`.
  ipcMain.handle(
    "configuracao:caminho-dentro-da-pasta",
    (_evento, caminhoArquivo: string, pasta: string): boolean => {
      if (!pasta) return false;
      const caminhoResolvido = path.resolve(caminhoArquivo);
      const pastaResolvida = path.resolve(pasta);
      const relativo = path.relative(pastaResolvida, caminhoResolvido);
      return relativo !== "" && !relativo.startsWith("..") && !path.isAbsolute(relativo);
    },
  );
}
