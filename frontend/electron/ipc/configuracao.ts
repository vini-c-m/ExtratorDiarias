import { BrowserWindow, dialog, ipcMain } from "electron";

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
}
