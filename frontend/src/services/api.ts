import { mensagemAmigavel } from "../lib/mensagens";
import type {
  DiagnosticoResposta,
  DiariaCompletaResposta,
  DistribuicaoResposta,
  DocumentosHabeisPendentesResposta,
  EstadoSincronizacaoResposta,
  ExecucaoSincronizacaoResposta,
  IndicadoresResposta,
  OpcoesFiltroResposta,
  PaginaAvisosResposta,
  ParametrosDiagnosticoQuery,
  ParametrosDistribuicaoQuery,
  ParametrosDocumentosHabeisPendentesQuery,
  ParametrosIndicadoresQuery,
  ParametrosPesquisaDiariasQuery,
  ParametrosRelatorioQuery,
  RelatorioGeradoResposta,
  ResultadoPesquisaResposta,
} from "../types/analitica";
import type { ConfiguracaoAtiva, EstadoConfiguracao } from "../types/configuracao";
import type { CandidatoDiariaOriginal, ModoConferencia, ResultadoConferencia } from "../types/conferencia";
import type {
  ItemParaConfirmar,
  RespostaAnaliseFinalizacao,
  RespostaConfirmacaoFinalizacao,
} from "../types/finalizacao";
import type {
  LoteProcessamento,
  ModoProcessamento,
  Processo,
  ResultadoPreenchimento,
} from "../types/processamento";

export const BACKEND_URL = "http://127.0.0.1:8756";

export async function processarLote(
  caminhos: string[],
  signal?: AbortSignal,
  modo: ModoProcessamento = "PADRAO",
): Promise<LoteProcessamento> {
  const resposta = await fetch(`${BACKEND_URL}/api/v1/processamento`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ arquivos: caminhos, modo }),
    signal,
  });

  if (!resposta.ok) {
    throw new Error(`Backend respondeu ${resposta.status}`);
  }

  return resposta.json();
}

/** Sprint 05.3 — sinaliza que `processarLoteComProgresso` foi interrompido a
 * pedido do usuário (não é uma falha de rede/backend). Quem chama distingue
 * este erro dos demais para descartar o processamento em vez de exibir uma
 * mensagem de falha. */
export class ProcessamentoCanceladoError extends Error {
  constructor() {
    super("Processamento cancelado pelo usuário.");
    this.name = "ProcessamentoCanceladoError";
  }
}

export interface ProgressoProcessamento {
  concluidos: number;
  total: number;
  arquivoAtual: string;
}

function nomeDoArquivo(caminho: string): string {
  return caminho.split(/[\\/]/).pop() ?? caminho;
}

/** Mesma extração PDF a PDF já existente em `/api/v1/processamento` — sem
 * nenhum endpoint novo, nenhuma regra nova. A única diferença é chamar o
 * endpoint uma vez por arquivo em vez de uma vez para o lote inteiro, o que
 * dá visibilidade real de progresso (arquivo atual, X de Y, tempo decorrido)
 * sem inventar números: cada PDF já processado é um PDF que realmente
 * terminou. Deduplicação por SEI só acontece depois, no preenchimento da
 * planilha — continua olhando para o lote completo, exatamente como antes.
 *
 * Uma falha de rede/conexão isolada num arquivo (ex.: instabilidade
 * momentânea) não interrompe o restante do lote: vira um Processo com
 * status de erro para aquele arquivo, do mesmo jeito que o backend já trata
 * um PDF corrompido — o resto da fila continua sendo processado.
 *
 * Sprint 05.3 — `signal`, quando fornecido e abortado (usuário clicou em
 * "Interromper Processamento"), interrompe o laço antes do próximo arquivo
 * e cancela a requisição em andamento. Nesse caso o laço termina lançando
 * `ProcessamentoCanceladoError` em vez de devolver um lote parcial: nenhum
 * resultado parcial chega a existir para quem chamou, então não há nada
 * para descartar — como se o processamento nunca tivesse começado. */
export async function processarLoteComProgresso(
  caminhos: string[],
  onProgresso?: (progresso: ProgressoProcessamento) => void,
  signal?: AbortSignal,
  modo: ModoProcessamento = "PADRAO",
): Promise<LoteProcessamento> {
  const total = caminhos.length;
  const processos: Processo[] = [];

  for (let indice = 0; indice < total; indice += 1) {
    if (signal?.aborted) {
      throw new ProcessamentoCanceladoError();
    }

    const caminho = caminhos[indice];
    onProgresso?.({ concluidos: indice, total, arquivoAtual: nomeDoArquivo(caminho) });

    // Checagem repetida de propósito: o cancelamento pode acontecer durante
    // o próprio callback de progresso (ex.: o clique do usuário processado
    // de forma síncrona), e não só entre uma iteração e outra.
    if (signal?.aborted) {
      throw new ProcessamentoCanceladoError();
    }

    try {
      const loteDoArquivo = await processarLote([caminho], signal, modo);
      processos.push(...loteDoArquivo.processos);
    } catch (erro) {
      if (signal?.aborted) {
        throw new ProcessamentoCanceladoError();
      }
      processos.push({
        id: `falha-conexao-${indice}`,
        arquivo_origem: nomeDoArquivo(caminho),
        status: "erro",
        diaria: null,
        erro: { motivos: [mensagemAmigavel(erro, "Não foi possível processar este documento.")] },
        avisos: [],
      });
    }
  }

  if (signal?.aborted) {
    throw new ProcessamentoCanceladoError();
  }

  onProgresso?.({ concluidos: total, total, arquivoAtual: "" });

  return {
    id: `lote-${Date.now()}`,
    total: processos.length,
    sucesso: processos.filter((p) => p.status === "sucesso").length,
    erro: processos.filter((p) => p.status === "erro").length,
    processos,
  };
}

// Sprint 15 — Configuração Inicial da Planilha Oficial (§7.1): o caminho de
// destino deixou de ser escolhido a cada execução. O backend resolve
// sozinho, a partir da configuração já validada — esta função não recebe
// (nem envia) mais nenhum caminho de planilha.
export async function preencherPlanilha(
  processos: Processo[],
  tempoProcessamentoMs?: number | null,
  modo: ModoProcessamento = "PADRAO",
): Promise<ResultadoPreenchimento> {
  const itens = processos
    .filter((processo) => processo.status === "sucesso" && processo.diaria)
    .map((processo) => ({ arquivo_origem: processo.arquivo_origem, diaria: processo.diaria }));

  const erros = processos
    .filter((processo) => processo.status === "erro" && processo.erro)
    .map((processo) => ({
      arquivo_origem: processo.arquivo_origem,
      motivos: processo.erro!.motivos,
    }));

  const avisos = processos
    .filter((processo) => processo.avisos && processo.avisos.length > 0)
    .map((processo) => ({
      arquivo_origem: processo.arquivo_origem,
      mensagens: processo.avisos,
    }));

  const resposta = await fetch(`${BACKEND_URL}/api/v1/planilha/preencher`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      itens,
      erros,
      avisos,
      // Sprint 05.1 — só para o "Tempo de processamento" do resumo
      // executivo do relatório HTML; não afeta nenhuma regra de negócio.
      tempo_processamento_ms: tempoProcessamentoMs ?? null,
      modo,
    }),
  });

  if (!resposta.ok) {
    const corpo = await resposta.json().catch(() => null);
    throw new Error(corpo?.detail ?? `Backend respondeu ${resposta.status}`);
  }

  return resposta.json();
}

/** Sprint 13.1 — as rotas de conferência têm validação própria no schema
 * (`app/schemas/conferencia.py`, ex.: período final antes do inicial, SEI
 * vazio, origem igual a destino) que o FastAPI devolve como HTTP 422 com
 * `detail` sendo uma LISTA de objetos `{msg, loc, type, ...}` — formato
 * diferente do `detail` como string simples usado pelas outras rotas do
 * app (ex.: os 503/404 desta mesma API). `corpo?.detail` sozinho não cobre
 * essa forma: virava `new Error([objeto])`, que o JS serializa como
 * "[object Object]" — mensagem ilegível na tela em vez do texto de
 * validação já amigável vindo do backend (ex.: "Período final não pode ser
 * anterior ao período inicial."). */
function mensagemDoErro422(corpo: unknown, status: number): string {
  const detail = (corpo as { detail?: unknown } | null)?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail.length > 0) {
    const primeiro = detail[0] as { msg?: unknown } | undefined;
    if (typeof primeiro?.msg === "string") {
      return primeiro.msg.replace(/^Value error,\s*/, "");
    }
  }
  return `Backend respondeu ${status}`;
}

/** Sprint 13 — falha técnica da própria Central (RN-11: nunca um resultado
 * de negócio), sempre HTTP 503 — distinta de `Error` genérico para a tela
 * poder mostrar a mensagem operacional certa sem depender do texto vindo do
 * backend. */
export class ErroConferenciaIndisponivel extends Error {
  constructor() {
    super(
      "Não foi possível acessar os registros administrativos agora. Tente novamente em instantes.",
    );
    this.name = "ErroConferenciaIndisponivel";
  }
}

export async function conferir(
  cpf: string,
  periodoInicial: string,
  periodoFinal: string,
  modo: ModoConferencia = "PADRAO",
): Promise<ResultadoConferencia> {
  const resposta = await fetch(`${BACKEND_URL}/api/v1/conferencia`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      cpf,
      periodo_inicial: periodoInicial,
      periodo_final: periodoFinal,
      modo,
    }),
  });

  if (resposta.status === 503) {
    throw new ErroConferenciaIndisponivel();
  }
  if (!resposta.ok) {
    const corpo = await resposta.json().catch(() => null);
    throw new Error(mensagemDoErro422(corpo, resposta.status));
  }

  return resposta.json();
}

export async function gerarHistorico(
  cpf: string,
  periodoInicial: string,
  periodoFinal: string,
  sei: string,
  destino: string,
): Promise<string> {
  const resposta = await fetch(`${BACKEND_URL}/api/v1/conferencia/historico`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      cpf,
      periodo_inicial: periodoInicial,
      periodo_final: periodoFinal,
      sei,
      destino,
    }),
  });

  if (resposta.status === 503) {
    throw new ErroConferenciaIndisponivel();
  }
  if (!resposta.ok) {
    const corpo = await resposta.json().catch(() => null);
    throw new Error(mensagemDoErro422(corpo, resposta.status));
  }

  const dados: { texto: string } = await resposta.json();
  return dados.texto;
}

/** GERAR HISTÓRICO DE COMPLEMENTO (RN-14/RN-16) — mesmo modelo institucional
 * do histórico normal (RN-13); só a quantidade de diária parcial varia (0
 * por padrão institucional, já que a Central não lê o texto do processo).
 * Central de Conferência continua só consultiva: nunca grava nada. */
export async function gerarHistoricoComplemento(
  cpf: string,
  periodoInicial: string,
  periodoFinal: string,
  sei: string,
  destino: string,
): Promise<string> {
  const resposta = await fetch(`${BACKEND_URL}/api/v1/conferencia/historico-complemento`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      cpf,
      periodo_inicial: periodoInicial,
      periodo_final: periodoFinal,
      sei,
      destino,
    }),
  });

  if (resposta.status === 503) {
    throw new ErroConferenciaIndisponivel();
  }
  if (!resposta.ok) {
    const corpo = await resposta.json().catch(() => null);
    throw new Error(mensagemDoErro422(corpo, resposta.status));
  }

  const dados: { texto: string } = await resposta.json();
  return dados.texto;
}

/** Continuidade Processual (RN-15) — só encontra e explica candidatos a
 * "diária original"; nunca vincula nem grava nada. `cidadeDestino`/`sei`/
 * `textoProcesso` são opcionais (a Central de Conferência normalmente só
 * tem CPF+período nesta etapa). */
export async function buscarCandidatosComplemento(
  cpf: string,
  periodoInicial: string,
  periodoFinal: string,
  opcoes?: { cidadeDestino?: string; sei?: string; textoProcesso?: string },
): Promise<CandidatoDiariaOriginal[]> {
  const resposta = await fetch(`${BACKEND_URL}/api/v1/conferencia/complemento/candidatos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      cpf,
      periodo_inicial: periodoInicial,
      periodo_final: periodoFinal,
      cidade_destino: opcoes?.cidadeDestino ?? null,
      sei: opcoes?.sei ?? null,
      texto_processo: opcoes?.textoProcesso ?? "",
    }),
  });

  if (resposta.status === 503) {
    throw new ErroConferenciaIndisponivel();
  }
  if (!resposta.ok) {
    const corpo = await resposta.json().catch(() => null);
    throw new Error(mensagemDoErro422(corpo, resposta.status));
  }

  const dados: { candidatos: CandidatoDiariaOriginal[] } = await resposta.json();
  return dados.candidatos;
}

// "FINALIZAR DIÁRIAS" (2026-08-07) — mesmo padrão das demais funções deste
// módulo: `fetch` + `mensagemDoErro422`, sem estado. Usa a mesma planilha
// oficial já configurada (§7.1) — o backend é a única autoridade sobre o
// caminho, nenhum caminho viaja no corpo da requisição.
export async function analisarFinalizacao(caminhos: string[]): Promise<RespostaAnaliseFinalizacao> {
  const resposta = await fetch(`${BACKEND_URL}/api/v1/finalizacao/analisar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ arquivos: caminhos }),
  });

  if (!resposta.ok) {
    const corpo = await resposta.json().catch(() => null);
    throw new Error(mensagemDoErro422(corpo, resposta.status));
  }

  return resposta.json();
}

export async function confirmarFinalizacao(
  itens: ItemParaConfirmar[],
): Promise<RespostaConfirmacaoFinalizacao> {
  const resposta = await fetch(`${BACKEND_URL}/api/v1/finalizacao/confirmar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ itens }),
  });

  if (!resposta.ok) {
    const corpo = await resposta.json().catch(() => null);
    throw new Error(mensagemDoErro422(corpo, resposta.status));
  }

  return resposta.json();
}

export async function checarSaudeBackend(): Promise<boolean> {
  try {
    const resposta = await fetch(`${BACKEND_URL}/health`);
    if (!resposta.ok) return false;
    const dados = await resposta.json();
    return dados.status === "ok";
  } catch {
    return false;
  }
}

// Sprint 15 — Configuração Inicial da Planilha Oficial.
export async function buscarConfiguracao(): Promise<EstadoConfiguracao> {
  const resposta = await fetch(`${BACKEND_URL}/api/v1/configuracao`);
  if (!resposta.ok) {
    throw new Error(`Backend respondeu ${resposta.status}`);
  }
  return resposta.json();
}

/** Usada tanto pela Configuração Inicial quanto por "Alterar Planilha
 * Oficial" (§8 do doc arquitetural) — um único endpoint, uma única função
 * de validação no backend, nenhuma regra duplicada entre os dois fluxos.
 * O tipo de retorno é sempre `ConfiguracaoAtiva`: o backend só responde
 * 200 quando a validação passa por inteiro (§5) — qualquer falha vira uma
 * exceção lançada abaixo, nunca um corpo de sucesso parcial. */
export async function definirConfiguracao(caminhoPlanilhaOficial: string): Promise<ConfiguracaoAtiva> {
  const resposta = await fetch(`${BACKEND_URL}/api/v1/configuracao`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ caminho_planilha_oficial: caminhoPlanilhaOficial }),
  });

  if (!resposta.ok) {
    const corpo = await resposta.json().catch(() => null);
    throw new Error(mensagemDoErro422(corpo, resposta.status));
  }

  return resposta.json();
}

// Sprint 18.4.1 — Central Analítica (`app/api/analitica.py`, Sprint 17.4,
// homologado; nenhum contrato alterado por esta Sprint de frontend). Mesma
// convenção das demais funções deste módulo: função pura, `fetch` +
// tratamento de erro HTTP, sem estado.

/** Falha técnica da Central Analítica (Base Local em SQLite ausente ou
 * corrompida) — sempre HTTP 503, mesmo padrão de `ErroConferenciaIndisponivel`. */
export class ErroAnaliticaIndisponivel extends Error {
  constructor() {
    super("Não foi possível acessar os registros da Central Analítica agora. Tente novamente em instantes.");
    this.name = "ErroAnaliticaIndisponivel";
  }
}

/** SEI sem diária correspondente (`GET /diarias/{sei}` → 404) — resultado
 * de negócio válido, nunca uma falha técnica; classe própria para o
 * chamador distinguir isto de `ErroAnaliticaIndisponivel`. */
export class DiariaNaoEncontradaError extends Error {
  constructor(sei: string) {
    super(`Diária com SEI "${sei}" não encontrada.`);
    this.name = "DiariaNaoEncontradaError";
  }
}

/** `POST /sincronizacao` recusado (409) porque outra já está em andamento
 * (RN-A) — nunca tratado como erro, é um estado esperado. */
export class SincronizacaoEmAndamentoError extends Error {
  constructor() {
    super("Uma sincronização já está em andamento. Aguarde a conclusão antes de tentar novamente.");
    this.name = "SincronizacaoEmAndamentoError";
  }
}

/** Monta a query string a partir de um objeto de parâmetros, omitindo
 * `undefined`/`null`/string vazia — mesmo critério do backend (`if
 * filtros.q:` etc., `repositorio_analitico._montar_where`): um filtro
 * "vazio" equivale a "não aplicado", nunca vira `?campo=` na URL. */
function construirQueryString(parametros: object): string {
  const busca = new URLSearchParams();
  const entradas = Object.entries(parametros) as [string, string | number | undefined | null][];
  for (const [chave, valor] of entradas) {
    if (valor === undefined || valor === null || valor === "") continue;
    busca.set(chave, String(valor));
  }
  const query = busca.toString();
  return query ? `?${query}` : "";
}

export async function pesquisarDiarias(
  parametros: ParametrosPesquisaDiariasQuery,
): Promise<ResultadoPesquisaResposta> {
  const resposta = await fetch(
    `${BACKEND_URL}/api/v1/analitica/diarias${construirQueryString(parametros)}`,
  );

  if (resposta.status === 503) {
    throw new ErroAnaliticaIndisponivel();
  }
  if (!resposta.ok) {
    const corpo = await resposta.json().catch(() => null);
    throw new Error(mensagemDoErro422(corpo, resposta.status));
  }

  return resposta.json();
}

/** `sei` viaja literal na URL (RN-12 herdada — nunca normalizado/
 * codificado pelo cliente): a rota (`{sei:path}`) existe justamente
 * porque o número SEI contém barras (`19.20.0903.0030720/2024-36`); usar
 * `encodeURIComponent` transformaria essas barras em `%2F`, alterando a
 * forma do dado sem necessidade — o backend já trata o valor como texto
 * opaco, não como múltiplos segmentos de path. */
export async function detalharDiaria(sei: string): Promise<DiariaCompletaResposta> {
  const resposta = await fetch(`${BACKEND_URL}/api/v1/analitica/diarias/${sei}`);

  if (resposta.status === 404) {
    throw new DiariaNaoEncontradaError(sei);
  }
  if (resposta.status === 503) {
    throw new ErroAnaliticaIndisponivel();
  }
  if (!resposta.ok) {
    const corpo = await resposta.json().catch(() => null);
    throw new Error(mensagemDoErro422(corpo, resposta.status));
  }

  return resposta.json();
}

/** Sprint 19.6.2 — `GET /indicadores`. `parametros` traz só os 15 campos
 * de filtro (`ParametrosIndicadoresQuery`, sem paginação/ordenação — o
 * endpoint sempre opera sobre o recorte inteiro). */
export async function obterIndicadores(
  parametros: ParametrosIndicadoresQuery,
): Promise<IndicadoresResposta> {
  const resposta = await fetch(
    `${BACKEND_URL}/api/v1/analitica/indicadores${construirQueryString(parametros)}`,
  );

  if (resposta.status === 503) {
    throw new ErroAnaliticaIndisponivel();
  }
  if (!resposta.ok) {
    const corpo = await resposta.json().catch(() => null);
    throw new Error(mensagemDoErro422(corpo, resposta.status));
  }

  return resposta.json();
}

/** Sprint 19.6.3 — `GET /distribuicoes`. `parametros` traz os 15 campos de
 * filtro (`ParametrosDistribuicaoQuery`, sem paginação/ordenação — mesmo
 * critério de `obterIndicadores`), mais `dimensao` (obrigatório, um valor
 * por chamada, § 12.3). */
export async function obterDistribuicao(
  parametros: ParametrosDistribuicaoQuery,
): Promise<DistribuicaoResposta> {
  const resposta = await fetch(
    `${BACKEND_URL}/api/v1/analitica/distribuicoes${construirQueryString(parametros)}`,
  );

  if (resposta.status === 503) {
    throw new ErroAnaliticaIndisponivel();
  }
  if (!resposta.ok) {
    const corpo = await resposta.json().catch(() => null);
    throw new Error(mensagemDoErro422(corpo, resposta.status));
  }

  return resposta.json();
}

export async function obterOpcoesFiltro(): Promise<OpcoesFiltroResposta> {
  const resposta = await fetch(`${BACKEND_URL}/api/v1/analitica/opcoes-filtro`);

  if (resposta.status === 503) {
    throw new ErroAnaliticaIndisponivel();
  }
  if (!resposta.ok) {
    const corpo = await resposta.json().catch(() => null);
    throw new Error(mensagemDoErro422(corpo, resposta.status));
  }

  return resposta.json();
}

export async function consultarEstadoSincronizacao(): Promise<EstadoSincronizacaoResposta> {
  const resposta = await fetch(`${BACKEND_URL}/api/v1/analitica/sincronizacao`);

  if (resposta.status === 503) {
    throw new ErroAnaliticaIndisponivel();
  }
  if (!resposta.ok) {
    const corpo = await resposta.json().catch(() => null);
    throw new Error(mensagemDoErro422(corpo, resposta.status));
  }

  return resposta.json();
}

export async function dispararSincronizacaoManual(): Promise<ExecucaoSincronizacaoResposta> {
  const resposta = await fetch(`${BACKEND_URL}/api/v1/analitica/sincronizacao`, { method: "POST" });

  if (resposta.status === 409) {
    throw new SincronizacaoEmAndamentoError();
  }
  if (resposta.status === 503) {
    throw new ErroAnaliticaIndisponivel();
  }
  if (!resposta.ok) {
    const corpo = await resposta.json().catch(() => null);
    throw new Error(mensagemDoErro422(corpo, resposta.status));
  }

  return resposta.json();
}

export async function consultarAvisosSincronizacao(
  pagina: number = 1,
  tamanhoPagina: number = 25,
): Promise<PaginaAvisosResposta> {
  const query = construirQueryString({ pagina, tamanho_pagina: tamanhoPagina });
  const resposta = await fetch(`${BACKEND_URL}/api/v1/analitica/sincronizacao/avisos${query}`);

  if (resposta.status === 503) {
    throw new ErroAnaliticaIndisponivel();
  }
  if (!resposta.ok) {
    const corpo = await resposta.json().catch(() => null);
    throw new Error(mensagemDoErro422(corpo, resposta.status));
  }

  return resposta.json();
}

/** Sprint 19.7.2 — `POST /relatorios`. `422` cobre tanto validação de
 * contrato (ex.: período inválido) quanto as duas regras de negócio
 * devolvidas pelo backend com mensagem própria — "gráficos só em PDF" e
 * "tipo ainda não implementado" (`TipoRelatorioIndisponivel`, pendente de
 * `diagnostico.py`, Sprint 19.8) — `mensagemDoErro422` já extrai o texto
 * de `detail` em ambos os casos, sem precisar de uma classe de erro
 * própria para cada um (mesmo padrão de `definirConfiguracao`). */
export async function gerarRelatorio(
  parametros: ParametrosRelatorioQuery,
): Promise<RelatorioGeradoResposta> {
  const resposta = await fetch(`${BACKEND_URL}/api/v1/analitica/relatorios`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(parametros),
  });

  if (resposta.status === 503) {
    throw new ErroAnaliticaIndisponivel();
  }
  if (!resposta.ok) {
    const corpo = await resposta.json().catch(() => null);
    throw new Error(mensagemDoErro422(corpo, resposta.status));
  }

  return resposta.json();
}

/** Sprint 19.8.2 — `GET /diagnostico`. `parametros` traz só os 15 campos
 * de filtro (`ParametrosDiagnosticoQuery`, sem paginação/ordenação — o
 * endpoint sempre opera sobre o recorte inteiro, § 8.3). */
export async function obterDiagnostico(
  parametros: ParametrosDiagnosticoQuery,
): Promise<DiagnosticoResposta> {
  const resposta = await fetch(
    `${BACKEND_URL}/api/v1/analitica/diagnostico${construirQueryString(parametros)}`,
  );

  if (resposta.status === 503) {
    throw new ErroAnaliticaIndisponivel();
  }
  if (!resposta.ok) {
    const corpo = await resposta.json().catch(() => null);
    throw new Error(mensagemDoErro422(corpo, resposta.status));
  }

  return resposta.json();
}

/** Correção de foco (2026-08-05) — `GET /documentos-habeis-pendentes`.
 * `parametros` traz só os 15 campos de filtro (sem paginação/ordenação —
 * o endpoint sempre opera sobre o recorte inteiro, mesmo critério de
 * `obterDiagnostico`). Substitui a experiência antes exposta pelo botão
 * "Análise Rápida (Diagnóstico)" — `obterDiagnostico` acima continua
 * existindo, usada internamente pelo Modo Executivo. */
export async function obterDocumentosHabeisPendentes(
  parametros: ParametrosDocumentosHabeisPendentesQuery,
): Promise<DocumentosHabeisPendentesResposta> {
  const resposta = await fetch(
    `${BACKEND_URL}/api/v1/analitica/documentos-habeis-pendentes${construirQueryString(parametros)}`,
  );

  if (resposta.status === 503) {
    throw new ErroAnaliticaIndisponivel();
  }
  if (!resposta.ok) {
    const corpo = await resposta.json().catch(() => null);
    throw new Error(mensagemDoErro422(corpo, resposta.status));
  }

  return resposta.json();
}
