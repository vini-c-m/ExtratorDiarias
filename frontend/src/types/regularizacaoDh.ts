// Micro-sprint B ("Central de Regularização de DH", SOMENTE LEITURA) —
// espelha 1:1 `app/schemas/regularizacao_dh.py`. Mesma fonte homologada da
// Central Analítica (`GET /analitica/documentos-habeis-pendentes`) por
// trás, só com campos adicionais de apresentação (categoria_funcional,
// trecho, CPF mascarado) que o contrato daquele endpoint não expõe.

export type SituacaoDocumentoHabilPendente = "aguardando_liberacao" | "revisao_manual_necessaria";

export type CategoriaFuncional = "MEMBRO" | "SERVIDOR" | "NAO_IDENTIFICADO";

export interface Periodo {
  inicial: string;
  final: string;
}

export interface Trecho {
  origem: string | null;
  destino: string | null;
}

export interface ProcessoAguardandoDH {
  sei: string;
  servidor_nome: string | null;
  cpf_mascarado: string | null;
  categoria_funcional: CategoriaFuncional;
  periodo: Periodo;
  trecho: Trecho;
  situacao: SituacaoDocumentoHabilPendente;
  mensagem: string;
  data_liberacao_prevista: string;
  dias_restantes: number | null;
  dias_atraso: number | null;
  texto_contagem: string | null;
}

export interface ListaProcessosAguardandoDH {
  total: number;
  processos: ProcessoAguardandoDH[];
}

// Micro-sprint C ("Histórico e-Fisco + Valor") — `valor` chega como STRING
// (mesma convenção já homologada em `types/conferencia.ts::ResultadoValorDiaria`,
// Micro-sprint A): o backend serializa `Decimal` como texto para preservar
// precisão exata ponta a ponta. O mesmo formatador
// (`formatarValorDiariaCopiavel`) é reaproveitado sem alteração.
export interface HistoricoEFisco {
  situacao: "gerado" | "indisponivel";
  texto: string | null;
  motivo: string | null;
}

export interface ValorDiaria {
  situacao: "disponivel" | "indisponivel";
  valor: string | null;
  motivo: string | null;
}

/** Item 11 D do pedido — `ainda_aguardando_dh: false` é um estado de
 * negócio legítimo (o registro deixou de ser pendente entre a lista e o
 * clique), nunca um erro. `historico`/`valor` (Micro-sprint C) são
 * independentes entre si e do resto do detalhe. */
export interface DetalheProcessoAguardandoDH {
  sei: string;
  servidor_nome: string | null;
  cpf_mascarado: string | null;
  categoria_funcional: CategoriaFuncional;
  periodo: Periodo;
  trecho: Trecho;
  ainda_aguardando_dh: boolean;
  situacao: SituacaoDocumentoHabilPendente | null;
  mensagem: string;
  data_liberacao_prevista: string | null;
  dias_restantes: number | null;
  dias_atraso: number | null;
  texto_contagem: string | null;
  historico: HistoricoEFisco;
  valor: ValorDiaria;
}

// Micro-sprint D ("Escrita Exclusiva do DH") — única capacidade de escrita
// desta Central. `situacao` nunca é `"concluido"` por acidente: um estado
// diferente é sempre um resultado de negócio conhecido (linha desatualizada
// ou DH conflitante), nunca uma exceção de rede — só falhas técnicas
// genuínas (SEI inexistente, Base Local/Planilha indisponível) chegam como
// erro HTTP.
export type SituacaoRegistroDH = "concluido" | "salvo_sync_pendente" | "nao_salvo";

export interface ResultadoRegistroDH {
  situacao: SituacaoRegistroDH;
  sei: string;
  dh: string;
  mensagem: string;
}
