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
      ) => Promise<{ caminhoArquivo: string; pastaArquivo: string } | null>;
      copiarHistorico: (texto: string) => Promise<void>;
      selecionarPlanilhaOficial: () => Promise<string | null>;
    };
  }
}
