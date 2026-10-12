// Sprint 15 — Configuração Inicial da Planilha Oficial. Espelha o contrato
// de `GET /api/v1/configuracao` (docs/configuracao-inicial/README.md § 4):
// booleanos independentes, sem estados de texto — a união discriminada por
// `configurado`/`planilha_acessivel` permite ao TypeScript estreitar o tipo
// sem nenhum campo opcional "às vezes presente, às vezes não".
export interface ConfiguracaoNaoDefinida {
  configurado: false;
}

// Organização Automática de PDFs — quatro pastas operacionais,
// independentes da planilha oficial (por isso presentes tanto em
// `ConfiguracaoInacessivel` quanto em `ConfiguracaoAtiva`: a planilha estar
// inacessível não impede consultar/editar as pastas já configuradas).
export interface PastasOperacionais {
  caminho_pdfs_a_processar: string | null;
  caminho_pdfs_complemento_a_processar: string | null;
  caminho_pdfs_processados: string | null;
  caminho_pdfs_diarias_a_confirmar: string | null;
}

export interface ProntidaoPastas {
  liberado: boolean;
  pastas_faltando: string[];
}

export interface ProntidaoFuncionalidade {
  processamento_padrao: ProntidaoPastas;
  complemento: ProntidaoPastas;
  finalizacao: ProntidaoPastas;
}

export interface ConfiguracaoInacessivel extends PastasOperacionais {
  configurado: true;
  planilha_acessivel: false;
  prontidao_pastas: ProntidaoFuncionalidade;
}

export interface ConfiguracaoAtiva extends PastasOperacionais {
  configurado: true;
  planilha_acessivel: true;
  requer_revalidacao: boolean;
  caminho_planilha_oficial: string;
  configurado_em: string;
  prontidao_pastas: ProntidaoFuncionalidade;
}

export type EstadoConfiguracao = ConfiguracaoNaoDefinida | ConfiguracaoInacessivel | ConfiguracaoAtiva;
