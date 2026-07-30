import { mensagemAmigavel } from "../lib/mensagens";
import type { ConfiguracaoAtiva, EstadoConfiguracao } from "../types/configuracao";
import type { ResultadoConferencia } from "../types/conferencia";
import type {
  LoteProcessamento,
  Processo,
  ResultadoPreenchimento,
} from "../types/processamento";

export const BACKEND_URL = "http://127.0.0.1:8756";

export async function processarLote(
  caminhos: string[],
  signal?: AbortSignal,
): Promise<LoteProcessamento> {
  const resposta = await fetch(`${BACKEND_URL}/api/v1/processamento`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ arquivos: caminhos }),
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
      const loteDoArquivo = await processarLote([caminho], signal);
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
): Promise<ResultadoConferencia> {
  const resposta = await fetch(`${BACKEND_URL}/api/v1/conferencia`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      cpf,
      periodo_inicial: periodoInicial,
      periodo_final: periodoFinal,
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
  origem: string,
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
      origem,
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
