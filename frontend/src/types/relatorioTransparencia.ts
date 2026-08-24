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
}

export type EstadoRevisaoRelatorioTransparencia = "pendente" | "decidida" | "adiada" | "desatualizada";

export interface RevisaoRelatorioTransparencia {
  identidade_grupo: string;
  regra: string;
  estado: EstadoRevisaoRelatorioTransparencia;
  explicacao: string;
  campos_iguais: string[];
  campos_diferentes: string[];
  ocorrencias: OcorrenciaRelatorioTransparencia[];
}

export interface ResumoRelatorioTransparencia {
  total_candidatos_normais: number;
  total_revisoes: number;
  total_pendentes: number;
  total_decididas: number;
  total_adiadas: number;
  total_desatualizadas: number;
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
