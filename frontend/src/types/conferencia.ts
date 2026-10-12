// Espelha 1:1 `app/schemas/conferencia.py` — mesmo padrão de `types/processamento.ts`.

export type Veredito = "APTO_PARA_PROCESSAMENTO" | "REVISAR";

// RN-14 — Modo Complemento de Diárias.
export type ModoConferencia = "PADRAO" | "COMPLEMENTO";

export interface ItemChecklist {
  item: string;
  ok: boolean;
  valor: string | null;
}

// Histórico e-Fisco de Membro — mesmo `CategoriaFuncional` já usado por
// `ResultadoValorDiaria` (Micro-sprint A), movido para cima para também ser
// usado por `ServidorConferencia`.
export type CategoriaFuncional = "MEMBRO" | "SERVIDOR" | "NAO_IDENTIFICADO";

export interface ServidorConferencia {
  nome: string;
  cargo: string;
  previdencia: string;
  // Opcional (espelha `ServidorResposta.categoria_funcional` no backend, que
  // é `None` por padrão porque o mesmo schema também é usado pelo Cadastro
  // de Servidor/Membro — `RespostaCadastroServidor.servidor` nunca o
  // popula) — sempre populado pela Etapa 1 da Central de Conferência
  // (`POST /conferencia`).
  categoria_funcional?: CategoriaFuncional | null;
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

// Micro-sprint A ("Valor Automático da Diária na Central de Conferência") —
// RN-05, homologada por auditoria financeira real (2026-08-12). Espelha 1:1
// `RequisicaoValorDiaria`/`RespostaValorDiaria` em `app/schemas/conferencia.py`.
export type SituacaoValorDiaria =
  | "calculado"
  | "indisponivel_para_categoria"
  | "uf_nao_resolvida"
  | "uf_fora_da_tabela";

// `CategoriaFuncional` está definido acima, perto de `ServidorConferencia`
// (movido nesta melhoria — Histórico e-Fisco de Membro).

/** `valor_integral`/`valor_parcial`/`valor_total` chegam como STRING (ex.
 * `"616.38"`, ponto decimal) — o backend serializa `Decimal` como texto de
 * propósito, para preservar a precisão exata ponta a ponta (nunca reintroduz
 * o risco de ponto flutuante binário que `Decimal` existe para evitar no
 * domínio). Formatar para exibição/cópia é responsabilidade do frontend
 * (`lib/formatarValorDiaria.ts`), nunca reinterpretar como `number` cedo
 * demais. */
export interface ResultadoValorDiaria {
  situacao: SituacaoValorDiaria;
  categoria_funcional: CategoriaFuncional;
  uf_destino: string | null;
  valor_integral: string | null;
  valor_parcial: string | null;
  valor_total: string | null;
  motivo: string | null;
  // Só populado quando `situacao` é `"uf_nao_resolvida"`/`"uf_fora_da_tabela"`
  // — exatamente as UFs/regiões que a Tabela Valores oficial tem agora
  // (nunca um catálogo geográfico próprio do frontend).
  ufs_disponiveis: string[] | null;
}
