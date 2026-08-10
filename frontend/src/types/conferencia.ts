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

// Cadastro de Servidor/Membro pela Central de Conferência — espelha 1:1
// `app/schemas/cadastro_dados.py`. Módulo de escrita separado de
// `app/api/conferencia.py` (RN-11 preservada — ver `docs/central-conferencia/README.md`).
export type EstadoCadastroServidor = "duplicado" | "nao_salvo" | "salvo_sync_pendente" | "concluido";

export interface RequisicaoCadastroServidor {
  cpf: string;
  nome: string;
  matricula: string;
  cargo: string;
  previdencia?: string | null;
  orgao_origem?: string | null;
  regime_previdencia?: string | null;
  situacao?: string | null;
}

export interface RespostaCadastroServidor {
  estado: EstadoCadastroServidor;
  mensagem: string | null;
  servidor: ServidorConferencia | null;
}

/** `GET /api/v1/dados/opcoes-cadastro` — valores reais já levantados na aba
 * `Dados` (RN-01), para o combobox pesquisável (cargo/órgão de origem) e o
 * seletor fechado (previdência/regime/situação) do modal de Cadastro de
 * Servidor/Membro. Nunca uma lista hardcoded no frontend. */
export interface OpcoesCadastroServidorResposta {
  cargos: string[];
  orgaos_origem: string[];
  previdencias: string[];
  regimes_previdencia: string[];
  situacoes: string[];
}
