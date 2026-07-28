import { clipboard, ipcMain } from "electron";

// Sprint 13 — cópia via `clipboard` nativo do Electron (processo main), não
// `navigator.clipboard` do renderer: mais confiável num app desktop do que
// depender de permissão de área de transferência do Chromium embutido.
export function registrarIpcConferencia(): void {
  ipcMain.handle("conferencia:copiar-historico", (_evento, texto: string) => {
    clipboard.writeText(texto);
  });
}
