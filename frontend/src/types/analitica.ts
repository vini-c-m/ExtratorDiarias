/** Espelha 1:1 `backend/app/schemas/analitica.py` (Sprint 17.4, homologado
 * — não redefinido aqui, só traduzido para TypeScript). Nenhum campo
 * inventado, renomeado ou omitido em relação ao schema Pydantic
 * correspondente. Ver `docs/central-analitica/ui-plano-tecnico.md` § 4. */

export type CampoOrdenacao = "sei" | "periodo" | "servidor" | "destino" | "valor";
export type DirecaoOrdenacao = "asc" | "desc";

/** Sprint 20 (2026-08-05) — filtro primário "Todos | Membros | Servidores"
 * do Recorte Analítico. Só `MEMBRO`/`SERVIDOR` são valores de filtro
 * válidos (`CategoriaFuncionalFiltro`, `schemas/analitica.py`); "Todos" é
 * a ausência do parâmetro. `CategoriaFuncionalResposta` inclui também
 * `NAO_IDENTIFICADO` — só aparece em respostas (tabela/detalhamento),
 * nunca como valor selecionável do filtro. */
export type CategoriaFuncionalFiltro = "MEMBRO" | "SERVIDOR";
export type CategoriaFuncionalResposta = "MEMBRO" | "SERVIDOR" | "NAO_IDENTIFICADO";

/** Corresponde a `ParametrosPesquisaDiariasQuery` — todos os campos são
 * query params de `GET /diarias`; os quatro últimos têm default no
 * backend, por isso opcionais aqui também. */
export interface ParametrosPesquisaDiariasQuery {
  q?: string | null;
  sei?: string | null;
  cpf?: string | null;
  servidor_nome?: string | null;
  servidor_matricula?: string | null;
  municipio?: string | null;
  motivo?: string | null;
  situacao?: string | null;
  periodo_inicial?: string | null;
  periodo_final?: string | null;
  /** Sprint 19.5.3 — isolados de `municipio` (que casa origem OU destino).
   * `valor_minimo`/`valor_maximo` trafegam como texto (mesmo padrão já
   * usado por `periodo_inicial`/`periodo_final`, que também representam
   * um tipo não-string no backend) — o valor de um parâmetro de query
   * HTTP é sempre string; o backend converte. */
  origem?: string | null;
  destino?: string | null;
  trecho?: string | null;
  valor_minimo?: string | null;
  valor_maximo?: string | null;
  /** Tipado como `string` (não `CategoriaFuncionalFiltro`), mesma convenção
   * já usada por `situacao`/`motivo`/`municipio` acima: todo campo desta
   * interface de query é uma string solta — quem restringe os 2 valores
   * válidos (`"MEMBRO"`/`"SERVIDOR"`) é o componente de UI que produz o
   * filtro (`FiltroCategoriaFuncional`), nunca o tipo do parâmetro em si
   * (evita que `useDiarias.aplicarFiltro`, que mescla filtros como
   * `string | undefined` genérico, precise de um caso especial só para
   * este campo). */
  categoria_funcional?: string | null;
  pagina?: number;
  tamanho_pagina?: number;
  ordenar_por?: CampoOrdenacao;
  ordem?: DirecaoOrdenacao;
}

/** Corresponde a `ParametrosIndicadoresQuery` — os mesmos 15 campos de
 * filtro de `ParametrosPesquisaDiariasQuery`, sem paginação/ordenação
 * (`GET /indicadores` opera sobre o recorte inteiro, § 12.2). */
export interface ParametrosIndicadoresQuery {
  q?: string | null;
  sei?: string | null;
  cpf?: string | null;
  servidor_nome?: string | null;
  servidor_matricula?: string | null;
  municipio?: string | null;
  motivo?: string | null;
  situacao?: string | null;
  periodo_inicial?: string | null;
  periodo_final?: string | null;
  origem?: string | null;
  destino?: string | null;
  trecho?: string | null;
  valor_minimo?: string | null;
  valor_maximo?: string | null;
  /** Tipado como `string` (não `CategoriaFuncionalFiltro`), mesma convenção
   * já usada por `situacao`/`motivo`/`municipio` acima: todo campo desta
   * interface de query é uma string solta — quem restringe os 2 valores
   * válidos (`"MEMBRO"`/`"SERVIDOR"`) é o componente de UI que produz o
   * filtro (`FiltroCategoriaFuncional`), nunca o tipo do parâmetro em si
   * (evita que `useDiarias.aplicarFiltro`, que mescla filtros como
   * `string | undefined` genérico, precise de um caso especial só para
   * este campo). */
  categoria_funcional?: string | null;
}

/** Corresponde a `DimensaoDistribuicao` (`schemas/analitica.py`, Sprint
 * 19.6.3) — só as 6 dimensões cujo comportamento já está integralmente
 * definido nos documentos homologados. `"completude"` (7ª dimensão do
 * catálogo completo, `v2-arquitetura-funcional.md` § 6.2) fica
 * deliberadamente de fora: depende da definição fechada de "registro
 * incompleto" (§ 9 pergunta 7 / § 14 pergunta 5), ainda pendente do
 * DIMCAC — mesmo critério já homologado na Sprint 19.6.1 para os KPIs
 * pendentes (nunca implementar com suposição). Aditivo: incluir
 * `"completude"` aqui quando a definição existir não quebra nenhum
 * cliente já integrado. */
/** Sprint 21.1 (Modo Executivo, 2026-08-05) acrescenta `categoria_funcional`
 * (gráfico "Membros × Servidores"), `doc_origem` (gráfico "Unidade
 * solicitante (documento de origem)") e `transporte` (gráfico "Meio de
 * transporte") — extensão aditiva, espelha 1:1
 * `backend/app/domain/analitica/distribuicoes.py::DimensaoDistribuicao`. */
export type DimensaoDistribuicao =
  | "periodo"
  | "servidor"
  | "municipio"
  | "motivo"
  | "situacao"
  | "origem_destino"
  | "categoria_funcional"
  | "doc_origem"
  | "transporte";

/** Corresponde a `ParametrosDistribuicaoQuery` — os mesmos 15 campos de
 * filtro de `ParametrosPesquisaDiariasQuery`, sem paginação/ordenação
 * (`GET /distribuicoes` opera sobre o recorte inteiro, § 12.3), mais
 * `dimensao` (obrigatório, um valor por chamada). */
export interface ParametrosDistribuicaoQuery {
  q?: string | null;
  sei?: string | null;
  cpf?: string | null;
  servidor_nome?: string | null;
  servidor_matricula?: string | null;
  municipio?: string | null;
  motivo?: string | null;
  situacao?: string | null;
  periodo_inicial?: string | null;
  periodo_final?: string | null;
  origem?: string | null;
  destino?: string | null;
  trecho?: string | null;
  valor_minimo?: string | null;
  valor_maximo?: string | null;
  /** Tipado como `string` (não `CategoriaFuncionalFiltro`), mesma convenção
   * já usada por `situacao`/`motivo`/`municipio` acima: todo campo desta
   * interface de query é uma string solta — quem restringe os 2 valores
   * válidos (`"MEMBRO"`/`"SERVIDOR"`) é o componente de UI que produz o
   * filtro (`FiltroCategoriaFuncional`), nunca o tipo do parâmetro em si
   * (evita que `useDiarias.aplicarFiltro`, que mescla filtros como
   * `string | undefined` genérico, precise de um caso especial só para
   * este campo). */
  categoria_funcional?: string | null;
  dimensao: DimensaoDistribuicao;
}

export interface PontoDistribuicaoResposta {
  rotulo: string;
  contagem: number;
  valor: number | null;
}

/** Resposta de `GET /distribuicoes` (Sprint 19.6.3) — só `dimensao`/
 * `pontos`, sem `sincronizacao` embutida (contrato aprovado,
 * `v2-plano-tecnico.md` § 12.3 — decisão já tomada no plano técnico,
 * diferente de `IndicadoresResposta`/`ResultadoPesquisaResposta`). */
export interface DistribuicaoResposta {
  dimensao: DimensaoDistribuicao;
  pontos: PontoDistribuicaoResposta[];
}

export interface ServidorResumoResposta {
  nome: string;
  matricula: string;
  /** Sprint 19.5.7.1 — sem relação com CPF/privacidade, só mais um dado
   * já lido pela consulta de listagem. */
  situacao?: string | null;
}

export interface PeriodoResposta {
  inicial: string;
  final: string;
}

export interface DiariaResumoResposta {
  sei: string;
  periodo: PeriodoResposta;
  destino: string | null;
  servidor: ServidorResumoResposta | null;
  motivo: string;
  valor_total_diarias: number | null;
  /** Sprint 19.5.7.1 — Configuração de Colunas. Nenhum campo `trecho`
   * aqui: "Trecho completo" é composto no frontend a partir de `origem` +
   * `destino` (já existente), nunca duplicado no contrato. `cpf_mascarado`
   * é o único campo relacionado a CPF permitido nesta resposta — o valor
   * completo nunca trafega em `GET /diarias` (decisão vinculante,
   * `ui-arquitetura.md` § 0.7); ele só existe em `DiariaCompletaResposta`
   * (`GET /diarias/{sei}`), inalterado por esta Sprint. */
  origem?: string | null;
  doc_origem?: string | null;
  transporte?: string | null;
  cpf_mascarado?: string | null;
  /** Sprint 20 (2026-08-05) — classificação já calculada na Base Local,
   * exibida na tabela para a origem da classificação nunca ficar
   * implícita. Default `"NAO_IDENTIFICADO"` no backend; opcional aqui só
   * para não quebrar mocks de teste já existentes que não passam o campo. */
  categoria_funcional?: CategoriaFuncionalResposta;
}

/** Versão completa do servidor, exclusiva do detalhamento — `matricula`/
 * `situacao` são `string | null` (decisão 17.4.4.1, formalizada em
 * `api-plano-tecnico.md` § 8). */
export interface ServidorCompletoResposta {
  nome: string;
  cargo: string;
  previdencia: string;
  matricula: string | null;
  situacao: string | null;
}

export interface TrechoResposta {
  origem: string | null;
  destino: string | null;
}

export interface ReferenciaAdministrativaResposta {
  linha_planilha: number;
}

/** Versão mínima do carimbo de sincronização embutido em `GET /diarias`/
 * `GET /diarias/{sei}` — distinta de `EstadoSincronizacaoResposta` (`GET
 * /sincronizacao`), nunca fundida com ela. */
export interface EstadoSincronizacaoResumidoResposta {
  sincronizado_em: string;
  total_avisos: number;
}

/** Corresponde a `ClassificacaoDiagnostico` (Sprint 19.8.2). */
export type ClassificacaoDiagnostico = "esperado" | "atencao" | "inconsistencia";

/** Mesma estrutura usada tanto em `RegistroDiagnosticadoResposta.casos`
 * (`GET /diagnostico`) quanto em `DiariaCompletaResposta.diagnosticos`
 * (`GET /diarias/{sei}`) — garante que `CartaoDiagnostico.tsx` seja o
 * mesmo componente nas duas telas (§ 12.4, regra de não duplicar). Sem
 * `classificacao`: só o agregado por SEI carrega essa informação. */
export interface CasoDiagnosticoResposta {
  campo: string | null;
  titulo: string;
  motivo: string;
  acao_recomendada: string;
}

/** Resposta de `GET /diarias/{sei}` — inclui `cpf` completo, sem máscara;
 * a máscara é responsabilidade exclusiva da apresentação no frontend
 * (regra vinculante, `ui-arquitetura.md` § 0.7 — nenhum código desta
 * etapa aplica a máscara ainda, isso é `PainelDetalhamentoDiaria`,
 * etapa 18.5.3).
 *
 * `diagnosticos` (Sprint 19.8.3) — vazio quando o registro é "esperado"
 * sem nenhum caso a reportar, nunca `null`/omitido; nunca inclui
 * duplicidade (que depende de um recorte que este endpoint de SEI único
 * não tem). */
export interface DiariaCompletaResposta {
  sei: string;
  periodo: PeriodoResposta;
  destino: string | null;
  servidor: ServidorCompletoResposta | null;
  motivo: string;
  valor_total_diarias: number | null;
  doc_origem: string;
  cpf: string;
  trecho: TrechoResposta;
  transporte: string | null;
  referencia_administrativa: ReferenciaAdministrativaResposta;
  sincronizacao: EstadoSincronizacaoResumidoResposta;
  diagnosticos: CasoDiagnosticoResposta[];
  categoria_funcional?: CategoriaFuncionalResposta;
}

/** Corresponde a `RegistroDiagnosticadoResposta` (`GET /diagnostico`,
 * § 12.4). */
export interface RegistroDiagnosticadoResposta {
  sei: string;
  classificacao: ClassificacaoDiagnostico;
  casos: CasoDiagnosticoResposta[];
}

export interface ResumoDiagnosticoResposta {
  esperado: number;
  atencao: number;
  inconsistencia: number;
}

/** Resposta de `GET /diagnostico` — sem `sincronizacao` embutida, mesmo
 * critério já usado em `DistribuicaoResposta`. */
export interface DiagnosticoResposta {
  resumo: ResumoDiagnosticoResposta;
  registros: RegistroDiagnosticadoResposta[];
}

/** Corresponde a `ParametrosDiagnosticoQuery` — os mesmos 15 campos de
 * filtro de `ParametrosPesquisaDiariasQuery`, sem paginação/ordenação
 * (`GET /diagnostico` opera sobre o recorte inteiro, § 8.3). */
export interface ParametrosDiagnosticoQuery {
  q?: string | null;
  sei?: string | null;
  cpf?: string | null;
  servidor_nome?: string | null;
  servidor_matricula?: string | null;
  municipio?: string | null;
  motivo?: string | null;
  situacao?: string | null;
  periodo_inicial?: string | null;
  periodo_final?: string | null;
  origem?: string | null;
  destino?: string | null;
  trecho?: string | null;
  valor_minimo?: string | null;
  valor_maximo?: string | null;
  /** Tipado como `string` (não `CategoriaFuncionalFiltro`), mesma convenção
   * já usada por `situacao`/`motivo`/`municipio` acima: todo campo desta
   * interface de query é uma string solta — quem restringe os 2 valores
   * válidos (`"MEMBRO"`/`"SERVIDOR"`) é o componente de UI que produz o
   * filtro (`FiltroCategoriaFuncional`), nunca o tipo do parâmetro em si
   * (evita que `useDiarias.aplicarFiltro`, que mescla filtros como
   * `string | undefined` genérico, precise de um caso especial só para
   * este campo). */
  categoria_funcional?: string | null;
}

export interface PaginacaoResposta {
  pagina_atual: number;
  tamanho_pagina: number;
  total_itens: number;
  total_paginas: number;
}

export interface ResultadoPesquisaResposta {
  itens: DiariaResumoResposta[];
  paginacao: PaginacaoResposta;
  sincronizacao: EstadoSincronizacaoResumidoResposta;
}

/** Resposta de `GET /indicadores` (Sprint 19.6.2) — só os 4 KPIs sem
 * decisão pendente (Sprint 19.6.1). Os demais do catálogo completo
 * (`v2-plano-tecnico.md` § 12.2: total de municípios, registros
 * completos/incompletos, aguardando liberação) dependem de perguntas
 * ainda em aberto com o DIMCAC — omitidos deste contrato por ora, nunca
 * com suposição; serão campos aditivos quando as decisões existirem. */
export interface IndicadoresResposta {
  total_diarias: number;
  total_servidores: number;
  valor_total: number | null;
  valor_medio: number | null;
  sincronizacao: EstadoSincronizacaoResumidoResposta;
}

export interface OpcoesFiltroResposta {
  motivos: string[];
  situacoes: string[];
  municipios: string[];
}

export type StatusSincronizacao = "nunca_sincronizado" | "atualizado" | "possivelmente_desatualizado";

/** Resposta de `GET /sincronizacao` — classe própria, nunca fundida com
 * `EstadoSincronizacaoResumidoResposta`. */
export interface EstadoSincronizacaoResposta {
  sincronizado_em: string | null;
  origem: string | null;
  possivelmente_desatualizado: boolean;
  total_avisos: number;
  status: StatusSincronizacao;
}

export type StatusExecucaoSincronizacao = "sucesso" | "falha";

/** Resposta de `POST /sincronizacao` — `status: "falha"` deixa as demais
 * contagens `null`. */
export interface ExecucaoSincronizacaoResposta {
  status: StatusExecucaoSincronizacao;
  sincronizado_em: string | null;
  linhas_diarias: number | null;
  linhas_servidores_lidos: number | null;
  linhas_ignoradas: number | null;
  total_avisos: number | null;
}

export interface AvisoSincronizacaoResposta {
  aba: string;
  linha: number;
  motivo: string;
}

/** Resposta de `GET /sincronizacao/avisos` — sem `sincronizacao`
 * embutida, mesmo critério de `OpcoesFiltroResposta`. */
export interface PaginaAvisosResposta {
  itens: AvisoSincronizacaoResposta[];
  paginacao: PaginacaoResposta;
}

/** Correção de foco — "Documentos Hábeis Pendentes" (pedido explícito do
 * usuário, 2026-08-05): substitui a experiência antes exposta pelo botão
 * "Análise Rápida (Diagnóstico)" por uma tela exclusiva de `dh` vazio.
 * `DiagnosticoResposta`/`ParametrosDiagnosticoQuery` acima continuam
 * existindo sem nenhuma mudança de contrato — usados internamente pelo
 * Modo Executivo. Espelha 1:1 os novos tipos de `schemas/analitica.py`. */
export type SituacaoDocumentoHabilPendente = "aguardando_liberacao" | "revisao_manual_necessaria";

/** Corresponde a `ParametrosDocumentosHabeisPendentesQuery` — os mesmos 15
 * campos de filtro de `ParametrosPesquisaDiariasQuery`, sem paginação/
 * ordenação (opera sobre o recorte inteiro), para a contagem exibida no
 * botão/badge sempre respeitar o Recorte Analítico atual (§ 7 do pedido). */
export interface ParametrosDocumentosHabeisPendentesQuery {
  q?: string | null;
  sei?: string | null;
  cpf?: string | null;
  servidor_nome?: string | null;
  servidor_matricula?: string | null;
  municipio?: string | null;
  motivo?: string | null;
  situacao?: string | null;
  periodo_inicial?: string | null;
  periodo_final?: string | null;
  origem?: string | null;
  destino?: string | null;
  trecho?: string | null;
  valor_minimo?: string | null;
  valor_maximo?: string | null;
  categoria_funcional?: string | null;
}

/** Corresponde a `DocumentoHabilPendenteResposta` — um registro com `dh`
 * vazio já classificado; `dias_restantes`/`texto_contagem` só vêm
 * preenchidos quando `situacao === "aguardando_liberacao"`; `dias_atraso`
 * só quando `situacao === "revisao_manual_necessaria"` (nunca os dois ao
 * mesmo tempo). `cpf_mascarado` segue a mesma regra vinculante de
 * `DiariaResumoResposta` — CPF completo nunca sai desta lista. */
export interface DocumentoHabilPendenteResposta {
  sei: string;
  servidor_nome: string | null;
  cpf_mascarado: string | null;
  periodo: PeriodoResposta;
  destino: string | null;
  data_liberacao_prevista: string;
  situacao: SituacaoDocumentoHabilPendente;
  dias_restantes: number | null;
  dias_atraso: number | null;
  texto_contagem: string | null;
  mensagem: string;
}

export interface ResumoDocumentosHabeisPendentesResposta {
  aguardando_liberacao: number;
  revisao_manual_necessaria: number;
}

/** Resposta de `GET /documentos-habeis-pendentes` — sem `sincronizacao`
 * embutida, mesmo critério já usado em `DiagnosticoResposta`. Já vem
 * ordenada pelo backend (revisão manual mais antiga primeiro, depois
 * aguardando por menor quantidade de dias restantes) — o frontend nunca
 * reordena. */
export interface DocumentosHabeisPendentesResposta {
  resumo: ResumoDocumentosHabeisPendentesResposta;
  registros: DocumentoHabilPendenteResposta[];
}

/** Corresponde a `TipoRelatorio` (`schemas/analitica.py`, Sprint 19.7.2)
 * — os 8 tipos do catálogo completo (`v2-arquitetura-funcional.md`
 * § 7.1) já aparecem aqui, mesmo contrato aditivo do backend.
 * `"inconsistencias"`/`"qualidade_dados"` são aceitos pela API mas
 * recusados com `422` até `diagnostico.py` existir (Sprint 19.8) — quem
 * consome este tipo (`ModalRelatorio`, 19.7.3) trata os 2 como
 * desabilitados/pendentes, nunca escondidos. */
/** Sprint 21.9 (Modo Executivo) acrescenta `"visao_executiva"` — 9º
 * valor, tipo novo e dedicado ao PDF exportado pelo Modo Executivo, nunca
 * uma mudança em `"executivo"` (já homologado no fluxo operacional de
 * Relatórios) nem em `"detalhado"` (usado pelo próprio botão "Exportar
 * PDF" do Dashboard operacional). */
export type TipoRelatorio =
  | "executivo"
  | "detalhado"
  | "financeiro"
  | "por_servidor"
  | "por_municipio"
  | "por_situacao"
  | "inconsistencias"
  | "qualidade_dados"
  | "visao_executiva";

export type FormatoRelatorio = "pdf" | "excel" | "csv";
export type ModoRelatorio = "previsualizacao" | "final";

/** Corresponde a `FiltrosRelatorioQuery` — os mesmos 15 campos de filtro
 * de `ParametrosPesquisaDiariasQuery`/`ParametrosIndicadoresQuery`, sem
 * paginação/ordenação. Aninhado em `filtros` (corpo JSON de `POST
 * /relatorios`), diferente das rotas `GET` acima (query string
 * "achatada"). */
export interface FiltrosRelatorioQuery {
  q?: string | null;
  sei?: string | null;
  cpf?: string | null;
  servidor_nome?: string | null;
  servidor_matricula?: string | null;
  municipio?: string | null;
  motivo?: string | null;
  situacao?: string | null;
  periodo_inicial?: string | null;
  periodo_final?: string | null;
  origem?: string | null;
  destino?: string | null;
  trecho?: string | null;
  valor_minimo?: string | null;
  valor_maximo?: string | null;
  /** Tipado como `string` (não `CategoriaFuncionalFiltro`), mesma convenção
   * já usada por `situacao`/`motivo`/`municipio` acima: todo campo desta
   * interface de query é uma string solta — quem restringe os 2 valores
   * válidos (`"MEMBRO"`/`"SERVIDOR"`) é o componente de UI que produz o
   * filtro (`FiltroCategoriaFuncional`), nunca o tipo do parâmetro em si
   * (evita que `useDiarias.aplicarFiltro`, que mescla filtros como
   * `string | undefined` genérico, precise de um caso especial só para
   * este campo). */
  categoria_funcional?: string | null;
}

/** Corresponde a `ParametrosRelatorioQuery` (Sprint 19.7.2, § 12.6) —
 * corpo JSON de `POST /relatorios`. Os 4 `incluir_*` são independentes
 * de `tipo`; `incluir_graficos: true` com `formato !== "pdf"` é
 * recusado pelo backend com `422` ("Gráficos disponíveis apenas para
 * PDF") — quem monta este objeto (`useGerarRelatorio`, 19.7.3) nunca
 * deve montar essa combinação, mesma regra refletida na UI. */
export interface ParametrosRelatorioQuery {
  filtros: FiltrosRelatorioQuery;
  tipo: TipoRelatorio;
  formato: FormatoRelatorio;
  incluir_indicadores: boolean;
  incluir_graficos: boolean;
  incluir_tabela: boolean;
  incluir_inconsistencias: boolean;
  modo: ModoRelatorio;
  /** Sprint 21.9 (Modo Executivo) — só usado por `tipo="visao_executiva"`;
   * cada string já vem pronta de `insightsExecutivos.ts` (fórmulas
   * determinísticas sobre dado já calculado pelo backend) — o backend
   * nunca recalcula, só inclui verbatim no PDF. Opcional/vazio para
   * qualquer outro tipo de relatório, sem mudança de comportamento. */
  insights?: string[];
}

/** Resposta de `POST /relatorios` (§ 12.6) — `caminho_arquivo_temporario`
 * é consumido pelo IPC `relatorio:salvar-como` (generalizado na Sprint
 * 19.7.5), nunca lido/exibido diretamente pela UI. */
export interface RelatorioGeradoResposta {
  caminho_arquivo_temporario: string;
  nome_sugerido: string;
  sincronizado_em: string;
}
