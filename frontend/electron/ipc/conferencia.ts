import { ipcMain } from "electron";
import { copiarTexto } from "./clipboard";

// Sprint 13 — cópia via `clipboard` nativo do Electron (processo main), não
// `navigator.clipboard` do renderer: mais confiável num app desktop do que
// depender de permissão de área de transferência do Chromium embutido.
// Sprint 19.5.8 — delega para o mecanismo genérico de `clipboard.ts`
// (mesma chamada nativa, sem duplicar); canal e comportamento deste handler
// não mudam para quem já consome `window.api.copiarHistorico`.
export function registrarIpcConferencia(): void {
  ipcMain.handle("conferencia:copiar-historico", (_evento, texto: string) => {
    copiarTexto(texto);
  });
}
