// "FINALIZAR DIÁRIAS" (2026-08-07) — espelha `app/schemas/finalizacao.py`.
// Ajuste de 2026-08-07: a regra é do PROCESSO (SEI), não da linha isolada —
// não existe mais escolha manual entre linhas do mesmo SEI.
//
// Regra de negócio definitiva (Sprint pré-build, 2026-08-11): o único
// critério que bloqueia a finalização é a localização do SEI na Planilha
// Oficial. Pendências documentais nunca mais aparecem como `status` — elas
// viram só `AvaliacaoElegibilidade.alertas`, informativo, nunca bloqueante.

export type StatusFinalizacao =
  | "pronto"
  | "ja_finalizado"
  | "sei_nao_extraido"
  | "sei_nao_encontrado"
  | "estado_parcial"
  | "erro_leitura";

export type EstadoLinhaFinalizacao = "pronta" | "incompleta" | "ja_finalizada" | "parcial";

export type SituacaoComprovante = "encontrado" | "pendente" | "ausente";

export interface AvaliacaoElegibilidade {
  confirmacao_encontrada: boolean;
  confirmacao_valida: boolean;
  comprovante_encontrado: boolean;
  situacao_comprovante: SituacaoComprovante;
  ordem_bancaria_encontrada: boolean;
  apto: boolean;
  pendente_analitico: boolean;
  // Avisos informativos sobre a documentação do processo — nunca impedem a
  // finalização. Vazio quando não há nada a revisar.
  alertas: string[];
}

export interface CandidatoLinha {
  linha: number;
  cpf: string | null;
  periodo_inicial: string | null;
  periodo_final: string | null;
  trecho: string | null;
  dh: string | null;
  aviso: string | null;
  x_atual: string | null;
  y_atual: string | null;
  estado: EstadoLinhaFinalizacao;
}

export interface ItemAnaliseFinalizacao {
  arquivo_origem: string;
  sei: string | null;
  status: StatusFinalizacao;
  motivo: string | null;
  avaliacao: AvaliacaoElegibilidade | null;
  // Todas as linhas vinculadas a este SEI (diária + Complemento de
  // Diárias, quando houver mais de uma) — sempre tratadas como um único
  // conjunto atômico, nunca uma escolha manual entre elas.
  candidatos: CandidatoLinha[];
}

export interface RespostaAnaliseFinalizacao {
  itens: ItemAnaliseFinalizacao[];
}

export interface ItemParaConfirmar {
  arquivo_origem: string;
  sei: string;
}

export type CategoriaConfirmacao = "finalizado" | "ja_confirmado" | "ignorado";

export interface ItemResultadoConfirmacao {
  arquivo_origem: string;
  sei: string;
  categoria: CategoriaConfirmacao;
  linhas_atualizadas: number[];
  linhas_mantidas: number[];
  motivo: string | null;
}

export interface RespostaConfirmacaoFinalizacao {
  total_finalizado: number;
  total_ja_confirmado: number;
  total_ignorado: number;
  itens: ItemResultadoConfirmacao[];
}
