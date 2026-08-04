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
    };
  }
}
