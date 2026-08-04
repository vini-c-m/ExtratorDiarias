import { clipboard, ipcMain } from "electron";

// Sprint 19.5.8 — extrai para um módulo genérico o mecanismo de cópia
// nativa já homologado na Sprint 13 (`conferencia.ts`,
// `conferencia:copiar-historico`), que usa o `clipboard` do Electron em vez
// de `navigator.clipboard` do renderer por ser mais confiável num app
// desktop. A Central Analítica ("Copiar SEI") precisava do mesmo tipo de
// ação, mas para um texto qualquer, não só o histórico do e-Fisco — em vez
// de um segundo mecanismo de cópia (o que o `v2-plano-tecnico.md` § 5
// previa, com `navigator.clipboard`), este módulo generaliza o já existente
// para qualquer texto, mantendo um único caminho real de interação com a
// área de transferência do sistema operacional. `conferencia.ts` passa a
// delegar para `copiarTexto` (ver esse arquivo) — canal, comportamento e
// consumidores existentes (`window.api.copiarHistorico`) não mudam.
export function copiarTexto(texto: string): void {
  clipboard.writeText(texto);
}

export function registrarIpcClipboard(): void {
  ipcMain.handle("clipboard:copiar-texto", (_evento, texto: string) => {
    copiarTexto(texto);
  });
}
