// Espelha 1:1 `app/schemas/conferencia.py` — mesmo padrão de `types/processamento.ts`.

export type Veredito = "APTO_PARA_PROCESSAMENTO" | "REVISAR";

// RN-14 — Modo Complemento de Diárias.
export type ModoConferencia = "PADRAO" | "COMPLEMENTO";

export interface ItemChecklist {
  item: string;
  ok: boolean;
  valor: string | null;
}

export interface ServidorConferencia {
  nome: string;
  cargo: string;
  previdencia: string;
}

export interface DuplicidadeEncontrada {
  linha: number;
  sei: string;
  trecho: string;
  periodo_inicial: string;
  periodo_final: string;
}

export interface JanelaProcessamento {
  liberado: boolean;
  data_liberacao: string;
}

export interface ResultadoConferencia {
  veredito: Veredito;
  providencia: string;
  checklist: ItemChecklist[];
  servidor: ServidorConferencia | null;
  duplicidade: DuplicidadeEncontrada | null;
  janela_processamento: JanelaProcessamento;
}

// Continuidade Processual (RN-15) — candidatos a "diária original" de um
// Complemento de Diárias. `evidencias` é sempre texto simples, nunca um
// score — o usuário confirma manualmente, o sistema nunca vincula sozinho.
export interface RegistroCandidato {
  sei: string;
  dh: string | null;
  periodo_inicial: string;
  periodo_final: string;
  cidade_origem: string | null;
  cidade_destino: string | null;
  motivo: string;
  valor_total_diarias: number | null;
  linha_planilha: number;
  servidor_nome: string | null;
}

export interface CandidatoDiariaOriginal {
  registro: RegistroCandidato;
  evidencias: string[];
}
