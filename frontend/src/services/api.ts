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
import type {
  ConfiguracaoAtiva,
  EstadoConfiguracao,
  PastasOperacionais,
} from "../types/configuracao";
import type {
  CandidatoDiariaOriginal,
  ModoConferencia,
  OpcoesCadastroServidorResposta,
  RequisicaoCadastroServidor,
  ResultadoConferencia,
  ResultadoValorDiaria,
  RespostaCadastroServidor,
} from "../types/conferencia";
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
import type {
  DetalheProcessoAguardandoDH,
  ListaProcessosAguardandoDH,
  ResultadoRegistroDH,
} from "../types/regularizacaoDh";
import type {
  ListaRevisoesRelatorioTransparencia,
  ParametrosFontesRelatorioTransparencia,
  RelatorioGeradoRelatorioTransparencia,
  RequisicaoConfigurarTemplateRelatorioTransparencia,
  RequisicaoDecisaoRelatorioTransparencia,
  RequisicaoGerarRelatorioTransparencia,
  ResumoRelatorioTransparencia,
  StatusTemplateRelatorioTransparencia,
} from "../types/relatorioTransparencia";

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
// Organização Automática de PDFs — `caminhosAbsolutos` mapeia
// `arquivo_origem` (nome-base, a mesma chave já usada por `Processo`) ->
// caminho absoluto do PDF selecionado, para o backend conseguir mover o
// arquivo depois de gravado com sucesso. Opcional: ausente, o corpo da
// requisição fica idêntico ao de antes desta melhoria.
export async function preencherPlanilha(
  processos: Processo[],
  tempoProcessamentoMs?: number | null,
  modo: ModoProcessamento = "PADRAO",
  caminhosAbsolutos?: Record<string, string>,
): Promise<ResultadoPreenchimento> {
  const itens = processos
    .filter((processo) => processo.status === "sucesso" && processo.diaria)
    .map((processo) => ({
      arquivo_origem: processo.arquivo_origem,
      diaria: processo.diaria,
      ...(caminhosAbsolutos?.[processo.arquivo_origem]
        ? { caminho_absoluto: caminhosAbsolutos[processo.arquivo_origem] }
        : {}),
    }));

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

/** Histórico e-Fisco de Membro — `quantidadeDiariaIntegralMembro`/
 * `quantidadeDiariaParcialMembro` são opcionais; omitidos (nenhum chamador
 * de Servidor os informa), o corpo da requisição fica idêntico ao de antes
 * desta melhoria. Só enviados quando a categoria funcional consultada é
 * MEMBRO (ver `pages/Conferencia.tsx`). */
export async function gerarHistorico(
  cpf: string,
  periodoInicial: string,
  periodoFinal: string,
  sei: string,
  destino: string,
  quantidadeDiariaIntegralMembro?: number,
  quantidadeDiariaParcialMembro?: number,
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
      ...(quantidadeDiariaIntegralMembro !== undefined
        ? { quantidade_diaria_integral_membro: quantidadeDiariaIntegralMembro }
        : {}),
      ...(quantidadeDiariaParcialMembro !== undefined
        ? { quantidade_diaria_parcial_membro: quantidadeDiariaParcialMembro }
        : {}),
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
 * Central de Conferência continua só consultiva: nunca grava nada.
 *
 * `quantidadeDiariaParcial` (P1, Sprint pré-build 2026-08-11) — opcional;
 * omitido (equivalente a não enviar o campo) preserva 100% o comportamento
 * atual (padrão institucional 0 aplicado no backend). Só é enviado quando o
 * usuário marca explicitamente que a simulação representa uma parcial
 * isolada (ver `pages/Conferencia.tsx`).
 *
 * `quantidadeDiariaIntegralMembro`/`quantidadeDiariaParcialMembro`
 * (Histórico e-Fisco de Membro) — mesmo contrato de `gerarHistorico`: só
 * enviados quando a categoria funcional é MEMBRO; substituem, só neste
 * Complemento, tanto o cálculo automático de integrais quanto
 * `quantidadeDiariaParcial` acima (que continua funcionando normalmente
 * para Servidor). */
export async function gerarHistoricoComplemento(
  cpf: string,
  periodoInicial: string,
  periodoFinal: string,
  sei: string,
  destino: string,
  quantidadeDiariaParcial?: number,
  quantidadeDiariaIntegralMembro?: number,
  quantidadeDiariaParcialMembro?: number,
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
      ...(quantidadeDiariaParcial !== undefined
        ? { quantidade_diaria_parcial: quantidadeDiariaParcial }
        : {}),
      ...(quantidadeDiariaIntegralMembro !== undefined
        ? { quantidade_diaria_integral_membro: quantidadeDiariaIntegralMembro }
        : {}),
      ...(quantidadeDiariaParcialMembro !== undefined
        ? { quantidade_diaria_parcial_membro: quantidadeDiariaParcialMembro }
        : {}),
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

/** Micro-sprint A ("Valor Automático da Diária na Central de Conferência")
 * — RN-05, homologada por auditoria financeira real (2026-08-12). Endpoint
 * independente de `gerarHistorico`/`gerarHistoricoComplemento` de propósito:
 * uma falha de leitura da Tabela Valores (503) nunca deve impedir o
 * Histórico e-Fisco de ser exibido normalmente — os dois nunca são
 * combinados numa única chamada.
 *
 * `ufConfirmada` (RN de segurança) — só enviado depois que o servidor
 * confirma manualmente a UF, num retorno anterior `"uf_nao_resolvida"`/
 * `"uf_fora_da_tabela"`; nunca uma escolha automática do sistema. */
export async function calcularValorDiaria(
  cpf: string,
  periodoInicial: string,
  periodoFinal: string,
  destino: string,
  opcoes?: {
    ufConfirmada?: string;
    modo?: ModoConferencia;
    quantidadeDiariaParcial?: number;
  },
): Promise<ResultadoValorDiaria> {
  const resposta = await fetch(`${BACKEND_URL}/api/v1/conferencia/valor`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      cpf,
      periodo_inicial: periodoInicial,
      periodo_final: periodoFinal,
      destino,
      uf_confirmada: opcoes?.ufConfirmada ?? null,
      modo: opcoes?.modo ?? "PADRAO",
      ...(opcoes?.quantidadeDiariaParcial !== undefined
        ? { quantidade_diaria_parcial: opcoes.quantidadeDiariaParcial }
        : {}),
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

/** Cadastro de Servidor/Membro pela Central de Conferência — único endpoint
 * de escrita desta feature, num módulo backend separado de
 * `app/api/conferencia.py` (RN-11 preservada). Sempre responde 200 com um
 * `estado` explícito (`duplicado`/`nao_salvo`/`salvo_sync_pendente`/
 * `concluido`) — nunca um HTTP de erro para um resultado de negócio, mesmo
 * padrão de `conferir`. "Tentar sincronizar novamente" reenvia esta mesma
 * função com os mesmos dados (nunca reescreve a linha duas vezes — ver
 * `cadastro_dados_service.cadastrar_servidor_membro`). */
export async function cadastrarServidor(
  requisicao: RequisicaoCadastroServidor,
): Promise<RespostaCadastroServidor> {
  const resposta = await fetch(`${BACKEND_URL}/api/v1/dados/servidores`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requisicao),
  });

  if (!resposta.ok) {
    const corpo = await resposta.json().catch(() => null);
    throw new Error(mensagemDoErro422(corpo, resposta.status));
  }

  return resposta.json();
}

/** `GET /api/v1/dados/opcoes-cadastro` — valores reais já levantados na aba
 * `Dados` (RN-01), fonte do combobox pesquisável e do seletor fechado do
 * modal de Cadastro de Servidor/Membro (nunca lista hardcoded). Mesmo
 * padrão de `ErroConferenciaIndisponivel`/503 de `conferir`, já que lê a
 * mesma Base Local. */
export async function obterOpcoesCadastroServidor(): Promise<OpcoesCadastroServidorResposta> {
  const resposta = await fetch(`${BACKEND_URL}/api/v1/dados/opcoes-cadastro`);

  if (resposta.status === 503) {
    throw new ErroConferenciaIndisponivel();
  }
  if (!resposta.ok) {
    const corpo = await resposta.json().catch(() => null);
    throw new Error(mensagemDoErro422(corpo, resposta.status));
  }

  return resposta.json();
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

/** Organização Automática de PDFs — `POST /api/v1/configuracao/pastas`.
 * `pastas` normalmente traz só um campo por chamada (um "Selecionar pasta"
 * de cada vez em `SecaoPastasOperacionais`); os demais, já configurados
 * antes, são preservados pelo backend. Devolve o `EstadoConfiguracao`
 * completo (mesmo contrato de `buscarConfiguracao`), já que a planilha
 * oficial pode estar acessível ou não independente das pastas. */
export async function definirPastasOperacionais(
  pastas: Partial<PastasOperacionais>,
): Promise<EstadoConfiguracao> {
  const resposta = await fetch(`${BACKEND_URL}/api/v1/configuracao/pastas`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(pastas),
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

/** Micro-sprint B ("Central de Regularização de DH", SOMENTE LEITURA) —
 * `GET /regularizacao-dh`, sempre sobre o recorte inteiro (nenhum filtro:
 * mesma base de comparação usada pelo teste de invariante desta Central
 * contra `obterDocumentosHabeisPendentes` acima — mesma fonte homologada,
 * nunca uma segunda regra). Reaproveita `ErroAnaliticaIndisponivel`: é a
 * mesma condição técnica (Base Local em SQLite indisponível). */
export async function listarProcessosAguardandoDH(): Promise<ListaProcessosAguardandoDH> {
  const resposta = await fetch(`${BACKEND_URL}/api/v1/regularizacao-dh`);

  if (resposta.status === 503) {
    throw new ErroAnaliticaIndisponivel();
  }
  if (!resposta.ok) {
    const corpo = await resposta.json().catch(() => null);
    throw new Error(mensagemDoErro422(corpo, resposta.status));
  }

  return resposta.json();
}

/** `GET /regularizacao-dh/{sei}` — mesmo tratamento de 404 já usado por
 * `detalharDiaria` (reaproveita `DiariaNaoEncontradaError`, mesma
 * semântica: SEI sem registro correspondente). */
export async function detalharProcessoAguardandoDH(sei: string): Promise<DetalheProcessoAguardandoDH> {
  const resposta = await fetch(`${BACKEND_URL}/api/v1/regularizacao-dh/${sei}`);

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

/** Micro-sprint D ("Escrita Exclusiva do DH") — única chamada de escrita
 * desta Central. `situacao` diferente de `"concluido"` NUNCA lança (é
 * sempre um resultado de negócio, tratado pela UI); só falhas técnicas
 * genuínas (404/503/422) viram exceção, mesmo padrão de toda a API. */
export async function registrarDH(sei: string, dh: string): Promise<ResultadoRegistroDH> {
  const resposta = await fetch(`${BACKEND_URL}/api/v1/regularizacao-dh/${sei}/dh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dh }),
  });

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

// Micro-sprint 3E.1 — Relatório do Portal da Transparência (integração com
// a API própria da Micro-sprint 3D, `app/api/relatorio_transparencia.py`).
// Nenhuma regra de negócio aqui: os 3 endpoints já devolvem tudo resolvido
// (classificação RN01-RN07, campos_iguais/campos_diferentes, estado da
// revisão) — este arquivo só traduz HTTP <-> tipos TS, exatamente como o
// resto de `api.ts`.

/** Falha técnica da persistência de decisões (JSON com versão de esquema
 * incompatível ou corrompido) — sempre HTTP 503, nunca um resultado de
 * negócio (mesmo critério de `ErroConferenciaIndisponivel`/
 * `ErroAnaliticaIndisponivel`). */
export class ErroRelatorioTransparenciaIndisponivel extends Error {
  constructor() {
    super(
      "Não foi possível acessar os dados de decisões salvos para este relatório agora. Tente novamente em instantes.",
    );
    this.name = "ErroRelatorioTransparenciaIndisponivel";
  }
}

/** Os 404 de `preparar_relatorio`/`listar_revisoes`/`registrar_decisao_revisao`
 * (`BaseOBNaoEncontrada`, `ControleDimcacNaoEncontrado`,
 * `RevisaoNaoEncontrada`) vêm do backend com o CAMINHO ABSOLUTO do arquivo
 * embutido na mensagem (`app/services/relatorio_transparencia_service.py`)
 * — apropriado para um log técnico, não para a tela (item 3/19 da
 * investigação UX 3E: nunca mostrar caminho interno desnecessário). Reescrita
 * puramente de apresentação por prefixo de texto, mesmo espírito de
 * `PADROES_TECNICOS` em `lib/mensagens.ts` — não interpreta nem classifica
 * o erro, só troca como ele é exibido. */
function mensagemFonteOuRevisaoNaoEncontrada(detail: string): string {
  if (detail.startsWith("Base de Ordens Bancárias não encontrada")) {
    return "Não encontramos o arquivo da Base de Ordens Bancárias selecionado. Verifique se ele ainda existe no local indicado e selecione novamente.";
  }
  if (detail.startsWith("Controle DIMCAC não encontrado")) {
    return "Não encontramos o arquivo do Controle DIMCAC selecionado. Verifique se ele ainda existe no local indicado e selecione novamente.";
  }
  // Micro-sprint 3H — `TemplateOficialIndisponivel` (não configurado, ou
  // configurado mas o arquivo sumiu): as duas mensagens já vêm prontas do
  // backend, sem caminho embutido (`configuracao_template_relatorio_
  // transparencia.py`) — passam direto, mesmo critério de "mensagem já
  // curada" do topo de `lib/mensagens.ts`.
  if (
    detail.startsWith("Nenhum template oficial configurado") ||
    detail.startsWith("O template oficial configurado não foi encontrado")
  ) {
    return detail;
  }
  return "Este caso não foi encontrado — ele pode já ter sido resolvido em outra revisão. Atualize a tela e tente novamente.";
}

/** Micro-sprint 3H — `POST /gerar` 409: duas causas distintas
 * (`RelatorioBloqueadoPorPendencias`/G05 e `DestinoJaExiste`). A primeira já
 * vem amigável do backend (sem caminho); a segunda embute o caminho de
 * destino que o próprio usuário acabou de escolher no diálogo nativo —
 * reescrita aqui por polish de UX (item 10: "mensagem compreensível"), não
 * por privacidade (é o próprio caminho que o usuário selecionou segundos
 * antes). */
function mensagemGerarBloqueado(detail: string): string {
  if (detail.startsWith("Já existe um arquivo no destino")) {
    return "Já existe um arquivo com esse nome no local selecionado. Escolha outro nome ou local e tente novamente.";
  }
  return detail || "Não é possível gerar o relatório no momento.";
}

/** Micro-sprint 3H — `POST /gerar` 422: o único caso com caminho embutido
 * (`TemplateEstruturalmenteInvalido` quando o arquivo configurado
 * desaparece entre a resolução e a geração, uma corrida de baixa
 * probabilidade — o caminho é interno, resolvido pelo backend, nunca algo
 * que o usuário escolheu nesta ação). Os demais casos de
 * `TemplateEstruturalmenteInvalido` (aba ausente, mesclagem inesperada)
 * já vêm sem caminho e passam por `mensagemDoErro422` sem alteração. */
function mensagem422Gerar(corpo: unknown, status: number): string {
  const detail = (corpo as { detail?: unknown } | null)?.detail;
  if (typeof detail === "string" && detail.startsWith("Template não encontrado")) {
    return "O modelo do relatório está indisponível no momento. Selecione o template novamente e tente de novo.";
  }
  return mensagemDoErro422(corpo, status);
}

const CAMINHO_BASE_RELATORIO_TRANSPARENCIA = `${BACKEND_URL}/api/v1/relatorio-transparencia`;

/** `POST /preparar` — sem sessão no backend: os 5 parâmetros de fonte
 * (`ParametrosFontesRelatorioTransparencia`) precisam ser reenviados em toda
 * chamada subsequente (revisões, decisão), nunca só na primeira. */
export async function prepararRelatorioTransparencia(
  parametros: ParametrosFontesRelatorioTransparencia,
): Promise<ResumoRelatorioTransparencia> {
  const resposta = await fetch(`${CAMINHO_BASE_RELATORIO_TRANSPARENCIA}/preparar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(parametros),
  });

  if (resposta.status === 404) {
    const corpo = await resposta.json().catch(() => null);
    throw new Error(mensagemFonteOuRevisaoNaoEncontrada((corpo as { detail?: string })?.detail ?? ""));
  }
  if (resposta.status === 503) {
    throw new ErroRelatorioTransparenciaIndisponivel();
  }
  if (!resposta.ok) {
    const corpo = await resposta.json().catch(() => null);
    throw new Error(mensagemDoErro422(corpo, resposta.status));
  }

  return resposta.json();
}

/** `GET /revisoes` — não é usado pelo fluxo principal (`preparar`/`decidir`
 * já devolvem a lista de revisões atualizada dentro do próprio resumo, sem
 * round-trip extra), mas faz parte do contrato dos 3 endpoints da API 3D e
 * fica disponível para um eventual "atualizar" independente. */
export async function listarRevisoesRelatorioTransparencia(
  parametros: ParametrosFontesRelatorioTransparencia,
): Promise<ListaRevisoesRelatorioTransparencia> {
  const resposta = await fetch(
    `${CAMINHO_BASE_RELATORIO_TRANSPARENCIA}/revisoes${construirQueryString(parametros)}`,
  );

  if (resposta.status === 404) {
    const corpo = await resposta.json().catch(() => null);
    throw new Error(mensagemFonteOuRevisaoNaoEncontrada((corpo as { detail?: string })?.detail ?? ""));
  }
  if (resposta.status === 503) {
    throw new ErroRelatorioTransparenciaIndisponivel();
  }
  if (!resposta.ok) {
    const corpo = await resposta.json().catch(() => null);
    throw new Error(mensagemDoErro422(corpo, resposta.status));
  }

  return resposta.json();
}

/** `POST /revisoes/{id}/decisao` — resposta já é o resumo recalculado
 * (equivalente a um novo `preparar`), então quem chama nunca precisa
 * refazer `preparar`/`listarRevisoes` depois de decidir. */
export async function registrarDecisaoRevisaoRelatorioTransparencia(
  identidadeGrupo: string,
  parametrosFontes: ParametrosFontesRelatorioTransparencia,
  decisao: RequisicaoDecisaoRelatorioTransparencia,
): Promise<ResumoRelatorioTransparencia> {
  const resposta = await fetch(
    `${CAMINHO_BASE_RELATORIO_TRANSPARENCIA}/revisoes/${encodeURIComponent(identidadeGrupo)}/decisao`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...parametrosFontes, ...decisao }),
    },
  );

  if (resposta.status === 404) {
    const corpo = await resposta.json().catch(() => null);
    throw new Error(mensagemFonteOuRevisaoNaoEncontrada((corpo as { detail?: string })?.detail ?? ""));
  }
  if (resposta.status === 503) {
    throw new ErroRelatorioTransparenciaIndisponivel();
  }
  if (!resposta.ok) {
    const corpo = await resposta.json().catch(() => null);
    throw new Error(mensagemDoErro422(corpo, resposta.status));
  }

  return resposta.json();
}

/** Micro-sprint 3H — `GET /template`: status do Template Oficial
 * (configuração exclusiva do módulo, item 11 da especificação). Nunca
 * expõe o caminho na tela — quem chama só usa `configurado`/`disponivel`
 * para decidir o que mostrar; `caminho_template` (quando presente) serve
 * só para extrair o NOME do arquivo, mesmo critério de `SeletorArquivoFonte`. */
export async function obterStatusTemplateRelatorioTransparencia(
  caminhoConfiguracaoTemplate: string,
): Promise<StatusTemplateRelatorioTransparencia> {
  const resposta = await fetch(
    `${CAMINHO_BASE_RELATORIO_TRANSPARENCIA}/template${construirQueryString({
      caminho_configuracao_template: caminhoConfiguracaoTemplate,
    })}`,
  );

  if (resposta.status === 503) {
    throw new ErroRelatorioTransparenciaIndisponivel();
  }
  if (!resposta.ok) {
    const corpo = await resposta.json().catch(() => null);
    throw new Error(mensagemDoErro422(corpo, resposta.status));
  }

  return resposta.json();
}

/** Micro-sprint 3H — `POST /template`: seleciona o Template Oficial uma
 * vez; o caminho passa a ser reaproveitado em toda geração futura (nunca
 * pedido de novo). */
export async function configurarTemplateRelatorioTransparencia(
  requisicao: RequisicaoConfigurarTemplateRelatorioTransparencia,
): Promise<StatusTemplateRelatorioTransparencia> {
  const resposta = await fetch(`${CAMINHO_BASE_RELATORIO_TRANSPARENCIA}/template`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requisicao),
  });

  if (!resposta.ok) {
    const corpo = await resposta.json().catch(() => null);
    throw new Error(mensagemDoErro422(corpo, resposta.status));
  }

  return resposta.json();
}

/** Micro-sprint 3H — `POST /gerar`: único ponto que produz o XLSX final.
 * Nunca envia lista de OBs publicáveis nem qualquer conteúdo montado pelo
 * frontend — só os 5 parâmetros de fonte (iguais aos das demais operações),
 * o ponteiro da configuração do template e o destino escolhido pelo
 * usuário no diálogo nativo. */
export async function gerarRelatorioTransparencia(
  requisicao: RequisicaoGerarRelatorioTransparencia,
): Promise<RelatorioGeradoRelatorioTransparencia> {
  const resposta = await fetch(`${CAMINHO_BASE_RELATORIO_TRANSPARENCIA}/gerar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requisicao),
  });

  if (resposta.status === 404) {
    const corpo = await resposta.json().catch(() => null);
    throw new Error(mensagemFonteOuRevisaoNaoEncontrada((corpo as { detail?: string })?.detail ?? ""));
  }
  if (resposta.status === 409) {
    const corpo = await resposta.json().catch(() => null);
    throw new Error(mensagemGerarBloqueado((corpo as { detail?: string })?.detail ?? ""));
  }
  if (resposta.status === 503) {
    throw new ErroRelatorioTransparenciaIndisponivel();
  }
  if (!resposta.ok) {
    const corpo = await resposta.json().catch(() => null);
    throw new Error(mensagem422Gerar(corpo, resposta.status));
  }

  return resposta.json();
}
