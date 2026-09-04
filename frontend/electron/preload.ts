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
  // Organização Automática de PDFs — seletor nativo de pasta (mesmo padrão
  // de `selecionarPlanilhaOficial`), usado pelas quatro Pastas
  // Operacionais. Decisão confirmada: a seleção de PDFs continua via
  // `<input type="file">` + `getPathForFile` acima — nunca trocada por
  // este seletor nativo.
  selecionarPastaOperacional: (): Promise<string | null> =>
    ipcRenderer.invoke("configuracao:selecionar-pasta"),
  // Guarda Windows-safe (path.resolve + path.relative — nunca prefixo de
  // string ingênuo) para bloquear, antes do processamento, um PDF
  // selecionado fora da pasta operacional configurada para aquele fluxo.
  // Correção pós-regressão: o preload roda em processo sandboxado (padrão
  // do Electron desde a v20, nunca desabilitado neste app) — `require("path")`
  // e `require("node:path")` falham aí ("module not found"), derrubando a
  // execução do script inteiro ANTES de `contextBridge.exposeInMainWorld`
  // rodar (por isso a regressão derrubou também APIs antigas sem nenhuma
  // relação com esta). Mesmo padrão de todas as outras APIs deste arquivo:
  // só `ipcRenderer.invoke`, o `path` de verdade fica no processo main
  // (`ipc/configuracao.ts`, nunca sandboxado).
  caminhoDentroDaPasta: (caminhoArquivo: string, pasta: string): Promise<boolean> =>
    ipcRenderer.invoke("configuracao:caminho-dentro-da-pasta", caminhoArquivo, pasta),
  // Micro-sprint 3E.1 — Relatório do Portal da Transparência: `caminho_decisoes`
  // é infraestrutura interna da API (nunca um campo escolhido pelo
  // servidor). Este único caminho resolve para dentro da mesma pasta de
  // dados do usuário já usada pelo resto do app (ver `ipc/relatorioTransparencia.ts`).
  obterCaminhoDecisoesRelatorioTransparencia: (): Promise<string> =>
    ipcRenderer.invoke("relatorio-transparencia:obter-caminho-decisoes"),
  // Micro-sprint 3H — mesmo critério de `obterCaminhoDecisoesRelatorioTransparencia`
  // acima, mas para a configuração isolada do Template Oficial (arquivo
  // próprio, nunca o mesmo de decisões nem de `configuracao.json` da
  // Central de Conferência).
  obterCaminhoConfiguracaoTemplateRelatorioTransparencia: (): Promise<string> =>
    ipcRenderer.invoke("relatorio-transparencia:obter-caminho-configuracao-template"),
  // Micro-sprint UX operacional — mesmo critério acima, mas para a
  // configuração isolada dos caminhos de Base E-Fisco e Controle DIMCAC
  // (arquivo próprio, nunca o mesmo de decisões nem do Template Oficial).
  obterCaminhoConfiguracaoFontesRelatorioTransparencia: (): Promise<string> =>
    ipcRenderer.invoke("relatorio-transparencia:obter-caminho-configuracao-fontes"),
  // Micro-sprint 3H — diálogo nativo "Salvar como" para o XLSX final do
  // Relatório do Portal da Transparência. Diferente de `salvarRelatorio`
  // (que copia um arquivo já gerado pelo backend): aqui o backend ainda não
  // gerou nada — só o caminho escolhido é devolvido (`POST /gerar` escreve
  // diretamente nele), ou `null` se o usuário cancelar o diálogo.
  escolherDestinoRelatorioTransparencia: (nomeSugerido: string): Promise<string | null> =>
    ipcRenderer.invoke("relatorio-transparencia:escolher-destino", nomeSugerido),
});
