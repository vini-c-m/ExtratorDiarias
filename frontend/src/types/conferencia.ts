// Espelha 1:1 `app/schemas/conferencia.py` — mesmo padrão de `types/processamento.ts`.

export type Veredito = "APTO_PARA_PROCESSAMENTO" | "REVISAR";

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
