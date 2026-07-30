// Sprint 15 — Configuração Inicial da Planilha Oficial. Espelha o contrato
// de `GET /api/v1/configuracao` (docs/configuracao-inicial/README.md § 4):
// booleanos independentes, sem estados de texto — a união discriminada por
// `configurado`/`planilha_acessivel` permite ao TypeScript estreitar o tipo
// sem nenhum campo opcional "às vezes presente, às vezes não".
export interface ConfiguracaoNaoDefinida {
  configurado: false;
}

export interface ConfiguracaoInacessivel {
  configurado: true;
  planilha_acessivel: false;
}

export interface ConfiguracaoAtiva {
  configurado: true;
  planilha_acessivel: true;
  requer_revalidacao: boolean;
  caminho_planilha_oficial: string;
  configurado_em: string;
}

export type EstadoConfiguracao = ConfiguracaoNaoDefinida | ConfiguracaoInacessivel | ConfiguracaoAtiva;
