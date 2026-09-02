// Micro-sprint 3E.1 — espelha 1:1 `app/schemas/relatorio_transparencia.py`
// (contrato já homologado na Micro-sprint 3D). Nenhum tipo aqui reproduz
// RN01-RN07/motor de decisão — só o formato já resolvido pelo backend.
// Nomes de campo em português/snake_case propositalmente iguais ao JSON da
// API (nenhum mapeamento de nome no frontend).

export interface ParametrosFontesRelatorioTransparencia {
  caminho_base_ordens_bancarias: string;
  caminho_controle_dimcac: string;
  ano_exercicio: number;
  mes_referencia: number;
  // Infraestrutura interna (nunca escolhida pelo usuário) — ver
  // `electron/ipc/relatorioTransparencia.ts`.
  caminho_decisoes: string;
  // Sprint 3 (HOMO-RT-06), fechamento — terceira fonte, OPCIONAL: `undefined`
  // preserva o comportamento anterior (Valor da Passagem fica com célula
  // vazia). Mesmo objeto de parâmetros reaproveitado por preparar/decidir/
  // gerar (`useRelatorioTransparencia`/`useGerarRelatorioTransparencia`) —
  // nenhum estado paralelo.
  caminho_planilha_passagens?: string;
}

export interface OcorrenciaRelatorioTransparencia {
  ob: string;
  dh: string;
  beneficiario: string | null;
  sei: string | null;
  data_ob: string | null;
  periodo_inicial: string | null;
  periodo_final: string | null;
  trecho: string | null;
  valor: number | null;
  motivo: string | null;
  restituicao: number | null;
  // HOMO-RT-02 — identidade por ocorrência: igual a `ob` quando a OB não se
  // repete fisicamente no grupo (todo RN07); "{ob}#{N}" quando se repete
  // (RN04, I11). Usar SEMPRE este campo — nunca `ob` isolada — como React
  // key e como chave de seleção dos checkboxes de revisão.
  identidade: string;
}

export type EstadoRevisaoRelatorioTransparencia =
  | "pendente"
  | "decidida"
  | "adiada"
  | "desatualizada"
  | "requer_nova_decisao";

export interface RevisaoRelatorioTransparencia {
  identidade_grupo: string;
  regra: string;
  estado: EstadoRevisaoRelatorioTransparencia;
  explicacao: string;
  campos_iguais: string[];
  campos_diferentes: string[];
  ocorrencias: OcorrenciaRelatorioTransparencia[];
  // Histórico da última decisão registrada para este grupo — `null` quando
  // nunca houve decisão (PENDENTE).
  autor: string | null;
  decidido_em: string | null;
  observacao: string | null;
  obs_publicaveis: string[] | null;
}

export interface ResumoRelatorioTransparencia {
  total_candidatos_normais: number;
  total_revisoes: number;
  total_pendentes: number;
  total_decididas: number;
  total_adiadas: number;
  total_desatualizadas: number;
  total_requer_nova_decisao: number;
  total_ocorrencias_nao_publicaveis: number;
  pode_gerar_relatorio: boolean;
  revisoes: RevisaoRelatorioTransparencia[];
}

export interface ListaRevisoesRelatorioTransparencia {
  total: number;
  revisoes: RevisaoRelatorioTransparencia[];
}

export type AcaoDecisaoRelatorioTransparencia = "publicar" | "adiar";

export interface RequisicaoDecisaoRelatorioTransparencia {
  acao: AcaoDecisaoRelatorioTransparencia;
  obs_selecionadas: string[];
  autor: string;
  observacao?: string | null;
}

// Micro-sprint 3H — Template Oficial (configuração exclusiva do módulo,
// selecionada uma vez) e geração final do XLSX.

export interface StatusTemplateRelatorioTransparencia {
  configurado: boolean;
  disponivel: boolean;
  caminho_template: string | null;
}

export interface RequisicaoConfigurarTemplateRelatorioTransparencia {
  caminho_configuracao_template: string;
  caminho_template: string;
}

// Micro-sprint UX operacional — persistência dos caminhos de Base de Ordens
// Bancárias e Controle DIMCAC (mesmo espírito do Template Oficial acima,
// mas sem validação de conteúdo — só lembra onde o usuário apontou da
// última vez).

export interface StatusArquivoFonteRelatorioTransparencia {
  configurado: boolean;
  disponivel: boolean;
  caminho: string | null;
}

export interface StatusFontesRelatorioTransparencia {
  base_ordens_bancarias: StatusArquivoFonteRelatorioTransparencia;
  controle_dimcac: StatusArquivoFonteRelatorioTransparencia;
  // Sprint 1 (plano "Valor da Passagem no XLSX Oficial") — terceira fonte
  // persistida, mesmo mecanismo das duas acima.
  planilha_passagens: StatusArquivoFonteRelatorioTransparencia;
}

export interface RequisicaoConfigurarFontesRelatorioTransparencia {
  caminho_configuracao_fontes: string;
  caminho_base_ordens_bancarias?: string | null;
  caminho_controle_dimcac?: string | null;
  caminho_planilha_passagens?: string | null;
}

export interface RequisicaoGerarRelatorioTransparencia extends ParametrosFontesRelatorioTransparencia {
  // Infraestrutura interna (nunca escolhida pelo usuário) — o template real
  // é resolvido pelo backend a partir desta configuração, mesmo padrão de
  // `caminho_decisoes`.
  caminho_configuracao_template: string;
  caminho_destino: string;
}

export interface RelatorioGeradoRelatorioTransparencia {
  caminho_arquivo: string;
  total_ocorrencias: number;
  total_valor_diarias: number;
  primeira_linha_dados: number;
  ultima_linha_dados: number;
  linha_total: number;
  // Sprint 5 — geração conjunta: o XLSX operacional
  // (`Diarias_Nao_Publicadas_<competencia>.xlsx`) nasce do MESMO
  // ResultadoRevisado do oficial. `nao_publicadas_gerado=false` cobre dois
  // cenários distintos, diferenciados por `erro_nao_publicadas`:
  // - nenhuma diária não publicada nesta competência (`total_nao_publicadas
  //   === 0`, `erro_nao_publicadas === null`) — nenhum arquivo é criado, de
  //   propósito.
  // - havia diárias a reportar, mas a escrita do operacional falhou DEPOIS
  //   do oficial já ter sido salvo com sucesso (`erro_nao_publicadas`
  //   preenchido) — estado parcial, nunca "sucesso" silencioso dos dois.
  caminho_arquivo_nao_publicadas: string | null;
  total_nao_publicadas: number;
  total_categoria_a: number;
  total_categoria_b: number;
  nao_publicadas_gerado: boolean;
  erro_nao_publicadas: string | null;
}
