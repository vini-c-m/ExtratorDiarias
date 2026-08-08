export type TipoProcesso = "PADRAO" | "DIARIA_MEMBRO";

export type FonteTransporte = "EVIDENCIA_DOCUMENTAL" | "REGRA_OPERACIONAL";

// RN-14 — Modo Complemento de Diárias. Escolha explícita do usuário (botão),
// nunca detectada do PDF — eixo ortogonal a `TipoProcesso`.
export type ModoProcessamento = "PADRAO" | "COMPLEMENTO";

export interface Diaria {
  sei: string;
  doc_origem: string;
  cpf: string;
  periodo_inicial: string;
  periodo_final: string;
  cidade_origem: string;
  cidade_destino: string;
  motivo: string;
  documento_habil: string | null;
  transporte: string | null;
  estado_destino: string | null;
  tipo_processo: TipoProcesso;
  valor_total_diarias: string | null;
  transporte_fonte: FonteTransporte | null;
  // Só resolvido no modo Complemento — `null` no modo Padrão (coluna O
  // nunca escrita). Ver `escritor_planilha.AVISO_COMPLEMENTO_DE_DIARIAS`.
  quantidade_diaria_parcial_complementar: number | null;
  fonte_quantidade_complementar: string | null;
}

export interface ErroExtracao {
  motivos: string[];
}

export interface Processo {
  id: string;
  arquivo_origem: string;
  status: "sucesso" | "erro";
  diaria: Diaria | null;
  erro: ErroExtracao | null;
  avisos: string[];
}

export interface LoteProcessamento {
  id: string;
  total: number;
  sucesso: number;
  erro: number;
  processos: Processo[];
}

export type CategoriaResultado =
  | "inserido"
  | "duplicado_no_lote"
  | "duplicado_na_planilha"
  | "linha_sem_formulas_necessarias";

export interface ItemResultado {
  arquivo_origem: string;
  sei: string;
  categoria: CategoriaResultado;
  linha: number | null;
  // Só populado no modo Complemento, quando este SEI já existia (não
  // bloqueia a gravação nesse modo — só fica visível para revisão).
  sei_ja_existente_em_linha: number | null;
}

export interface ResultadoPreenchimento {
  total_gravado: number;
  duplicadas_ignoradas: number;
  linha_inicial: number;
  linha_final: number;
  itens: ItemResultado[];
  pasta_resultados: string;
  caminho_planilha_gerada: string;
  caminho_relatorio: string;
  caminho_log: string;
}
