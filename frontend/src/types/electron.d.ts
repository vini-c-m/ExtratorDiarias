export {};

declare global {
  interface Window {
    api: {
      getPathForFile: (arquivo: File) => string;
      abrirArquivo: (caminho: string) => Promise<void>;
      salvarComo: (caminhoOrigem: string) => Promise<string | null>;
      salvarRelatorio: (
        caminhoOrigem: string,
        pastaResultados: string,
        nomeSugerido?: string,
      ) => Promise<{ caminhoArquivo: string; pastaArquivo: string } | null>;
      copiarHistorico: (texto: string) => Promise<void>;
      selecionarPlanilhaOficial: () => Promise<string | null>;
      // Sprint 19.5.8 — opcional só para não exigir atualização dos mocks
      // de `window.api` já homologados em testes de outras telas
      // (Central de Conferência, Sprint 13) que montam o objeto inteiro;
      // no app real (`preload.ts`) está sempre definido.
      copiarTexto?: (texto: string) => Promise<void>;
      // Sprint (Loading/Bloqueio de Ações/Navegação Segura, itens 8-10) —
      // mesmo critério de opcionalidade acima. `aoSolicitarFechamento`
      // registra o callback chamado quando o processo main intercepta um
      // fechamento nativo da janela (X, Alt+F4, `app.quit()`) e devolve uma
      // função de cancelamento da assinatura. `confirmarFechamento` avisa o
      // main que pode fechar de verdade agora.
      aoSolicitarFechamento?: (callback: () => void) => () => void;
      confirmarFechamento?: () => Promise<void>;
      // Ajuste Final (link Arquimedes) — mesmo critério de opcionalidade
      // acima. Abre um link no navegador padrão do sistema
      // (`shell.openExternal`, processo main), nunca dentro do app.
      abrirLinkExterno?: (url: string) => Promise<void>;
      // Micro-sprint 3E.1 — Relatório do Portal da Transparência. Mesmo
      // critério de opcionalidade acima (não quebra testes/mocks parciais
      // de `window.api` já homologados).
      obterCaminhoDecisoesRelatorioTransparencia?: () => Promise<string>;
    };
  }
}
