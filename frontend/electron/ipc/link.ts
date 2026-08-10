import { ipcMain, shell } from "electron";

// Canal genérico para abrir um link em QUALQUER navegador padrão do sistema
// operacional (nunca dentro de uma janela do próprio app — Electron nega
// `window.open`/`target="_blank"` por padrão desde a v14, então a única
// forma real de "abrir no navegador" é `shell.openExternal`, sempre pelo
// processo main). Só http/https são aceitos — mesmo canal podendo um dia
// receber qualquer texto vindo do renderer, nunca repassamos um esquema
// arbitrário (`file:`, `javascript:`, etc.) para `shell.openExternal`.
export function abrirLinkExterno(url: string): void {
  const protocoloPermitido = /^https?:\/\//i.test(url);
  if (!protocoloPermitido) {
    throw new Error(`Link não permitido (só http/https): ${url}`);
  }
  void shell.openExternal(url);
}

export function registrarIpcLink(): void {
  ipcMain.handle("link:abrir-externo", (_evento, url: string) => {
    abrirLinkExterno(url);
  });
}
