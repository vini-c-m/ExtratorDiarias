import { BrowserWindow, ipcMain } from "electron";

/** Sprint (Loading/Bloqueio de Ações/Navegação Segura, itens 8-10) —
 * confirmação ao fechar o app. Extraído de `main.ts` (mesmo padrão dos
 * demais `registrarIpc*` deste diretório) só para ficar testável
 * isoladamente. `podeFechar` — um objeto mutável, não um booleano solto —
 * é compartilhado entre o listener da janela e o handler de IPC (que
 * confirma o fechamento de fora, no processo main). */
export interface EstadoFechamento {
  podeFechar: boolean;
}

/** Intercepta o evento nativo `close` do `BrowserWindow` — cobre X da
 * janela, Alt+F4 e `app.quit()` por igual (ao contrário de
 * `window.beforeunload`, que o Electron não garante disparar de forma
 * confiável para fechamento nativo). Sem confirmação prévia
 * (`estado.podeFechar`), cancela o fechamento e pede confirmação ao
 * renderer, que decide a mensagem certa (há operação crítica ativa?) e
 * devolve a resposta via `registrarIpcFechamento` abaixo. */
export function registrarFechamentoSeguro(janela: BrowserWindow, estado: EstadoFechamento): void {
  janela.on("close", (evento) => {
    if (estado.podeFechar) return;
    evento.preventDefault();
    janela.webContents.send("app:solicitar-fechamento");
  });
}

/** Handler único (registrado uma vez em `app.whenReady()`, nunca por
 * janela — evitaria "segundo handler para o mesmo canal" se a janela
 * principal for recriada) que o renderer chama depois de confirmar (e,
 * se havia processamento ativo, depois que a interrupção segura já
 * terminou) — nunca antes. `obterJanela` (não uma referência fixa)
 * porque a janela principal pode ser recriada (`app.on("activate")`). */
export function registrarIpcFechamento(obterJanela: () => BrowserWindow | null, estado: EstadoFechamento): void {
  ipcMain.handle("app:confirmar-fechamento", () => {
    estado.podeFechar = true;
    obterJanela()?.close();
  });
}
