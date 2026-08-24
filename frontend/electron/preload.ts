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
  // Ajuste Final (link Arquimedes, modal de Cadastro de Servidor/Membro) —
  // abre um link no navegador padrão do sistema via `shell.openExternal`
  // (processo main), nunca dentro de uma janela do próprio app.
  abrirLinkExterno: (url: string): Promise<void> => ipcRenderer.invoke("link:abrir-externo", url),
  // Sprint (Loading/Bloqueio de Ações/Navegação Segura, itens 8-10) — o
  // processo main intercepta o fechamento nativo da janela (`main.ts`,
  // evento `close` do `BrowserWindow` — cobre X, Alt+F4 e `app.quit()` por
  // igual, ao contrário de `window.beforeunload`) e empurra este evento
  // para o renderer decidir a confirmação (só ele sabe se há operação
  // crítica ativa). `aoSolicitarFechamento` devolve uma função de
  // cancelamento da assinatura, mesmo padrão de `useEffect` do React.
  aoSolicitarFechamento: (callback: () => void): (() => void) => {
    const ouvinte = () => callback();
    ipcRenderer.on("app:solicitar-fechamento", ouvinte);
    return () => ipcRenderer.removeListener("app:solicitar-fechamento", ouvinte);
  },
  confirmarFechamento: (): Promise<void> => ipcRenderer.invoke("app:confirmar-fechamento"),
  // Micro-sprint 3E.1 — Relatório do Portal da Transparência: `caminho_decisoes`
  // é infraestrutura interna da API (nunca um campo escolhido pelo
  // servidor). Este único caminho resolve para dentro da mesma pasta de
  // dados do usuário já usada pelo resto do app (ver `ipc/relatorioTransparencia.ts`).
  obterCaminhoDecisoesRelatorioTransparencia: (): Promise<string> =>
    ipcRenderer.invoke("relatorio-transparencia:obter-caminho-decisoes"),
});
