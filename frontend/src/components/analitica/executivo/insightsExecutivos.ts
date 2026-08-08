import { formatarPeriodoMensal } from "../../../lib/datas";
import { formatarVariacaoPercentual, variacaoPercentual } from "../../../lib/variacao";
import type { PontoDistribuicaoResposta, RegistroDiagnosticadoResposta } from "../../../types/analitica";

/** Sprint 21.5 (Insights determinísticos) — `docs/central-analitica/
 * modo-executivo-arquitetura-funcional.md § 5`/`§ 10`, decisão 5: todo
 * insight é uma fórmula fixa e documentada sobre dado já calculado pelo
 * backend (indicadores/distribuições/diagnóstico) — nunca IA generativa,
 * nunca heurística probabilística, nunca um número novo inventado no
 * cliente. Este módulo é 100% puro (sem I/O, sem React) — os hooks que o
 * alimentam (`useInsightsExecutivos.ts`) só buscam dado, nunca decidem o
 * texto do insight.
 *
 * BI 4.0 (2026-08-08) — "Insights Executivos 2.0": a lateral do Modo
 * Executivo passou a ser EXCLUSIVAMENTE financeira/gerencial (pedido
 * explícito do usuário). `insightsDiagnostico`/`insightTransporteNaoIdentificado`
 * continuam aqui, testados e funcionais — só deixaram de ser chamados por
 * `calcularInsightsExecutivos` (a composição usada pela lateral executiva).
 * O dado que eles resumem continua 100% acessível: Diagnóstico geral (e o
 * drill-down por gráfico do painel lateral, `PainelLateralExecutivo`) para
 * o primeiro; o gráfico "Meio de transporte" (`GradeGraficosExecutivos`,
 * não alterado) para o segundo. A célula "Atenção (diagnóstico)" que
 * existia na faixa de KPI foi removida do Modo Executivo nesta mesma
 * Sprint (pedido explícito do usuário — "Modo Executivo = financeiro +
 * gerencial", nunca diagnóstico operacional). */

export type TipoInsight = "atencao" | "neutro" | "positivo";

export interface Insight {
  id: string;
  tipo: TipoInsight;
  texto: string;
  /** BI 4.0 — legenda curta e fixa por tipo de insight (ex. "PICO MENSAL",
   * "UNIDADE LÍDER"), usada só pela timeline de `PainelInsights` quando o
   * item está recolhido (marcador + legenda, sem o texto completo).
   * Puramente apresentacional — mesmo dado/cálculo de `texto`, só um
   * rótulo mais curto para caber ao lado do marcador. */
  tituloCurto: string;
  /** Ação equivalente à do painel lateral (Sprint 21.4) — só `municipio`
   * (concentração de gastos) e `"diagnostico"` (casos do catálogo de
   * diagnóstico) são usados nesta etapa; ausente quando o insight é só
   * informativo (variação, pico mensal, tendência, participação, unidade
   * líder — nenhum deles tem um destino de filtro/diagnóstico próprio).
   *
   * Correção de regressão (2026-08-07) — `filtroDiagnostico` reaproveita o
   * MESMO título de caso já usado para compor `texto` (`TITULO_*` abaixo,
   * idênticos aos de `app/domain/analitica/diagnostico.py`): "abrir
   * diagnóstico" a partir de um insight específico não pode mais abrir a
   * lista inteira do recorte, só os registros com aquele caso — nenhuma
   * classificação nova, só o recorte de apresentação já existente sendo
   * repassado para `PainelDiagnostico` filtrar. */
  acao?:
    | { rotulo: string; municipio: string }
    | { rotulo: string; abrirDiagnostico: true; filtroDiagnostico: { titulo: string; rotulo: string } };
}

const FORMATADOR_PERCENTUAL = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const FORMATADOR_INTEIRO = new Intl.NumberFormat("pt-BR");
const FORMATADOR_MOEDA = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** Insight 1 — variação do valor total em relação ao período anterior de
 * mesma duração (só quando o recorte já tem período definido; "período
 * anterior" é sempre a mesma quantidade de dias, imediatamente antes,
 * calculada por `useInsightsExecutivos.ts` — nunca um "mês anterior"
 * fixo, que seria uma suposição para um recorte de duração arbitrária).
 * Fórmula de variação reaproveitada de `lib/variacao.ts` — única
 * implementação usada também por `GradeKpisExecutivos`/hero editorial
 * (BI 4.0). */
export function insightVariacaoPeriodo(
  valorAtual: number | null,
  valorAnterior: number | null,
  rotuloPeriodoAnterior: string,
): Insight | null {
  const percentualTexto = formatarVariacaoPercentual(valorAnterior, valorAtual);
  if (percentualTexto === null) return null;
  const variacao = variacaoPercentual(valorAnterior, valorAtual) as number;
  const seta = variacao > 0 ? "🔼" : variacao < 0 ? "🔽" : "▪";
  return {
    id: "variacao-periodo",
    // RN-08: variação de negócio nunca é "atenção"/vermelho só por ser
    // negativa — é sempre neutra (informativa), a direção já está no sinal.
    tipo: "neutro",
    texto: `${seta} Valor total ${percentualTexto} em relação a ${rotuloPeriodoAnterior}`,
    tituloCurto: "VALOR TOTAL",
  };
}

/** Insight — variação do valor médio por diária em relação ao período
 * anterior (mesma fórmula/proteção de `insightVariacaoPeriodo`, só que
 * sobre `valor_medio` em vez de `valor_total` — mesmos indicadores do
 * período anterior já buscados por `useInsightsExecutivos.ts`, nenhuma
 * chamada de rede nova). BI 4.0. */
export function insightVariacaoValorMedio(
  valorMedioAtual: number | null,
  valorMedioAnterior: number | null,
  rotuloPeriodoAnterior: string,
): Insight | null {
  const percentualTexto = formatarVariacaoPercentual(valorMedioAnterior, valorMedioAtual);
  if (percentualTexto === null) return null;
  return {
    id: "variacao-valor-medio",
    tipo: "neutro",
    texto: `Valor médio por diária ${percentualTexto} em relação a ${rotuloPeriodoAnterior}`,
    tituloCurto: "VALOR MÉDIO",
  };
}

/** Insight — pico mensal: o mês de maior valor financeiro dentro da série
 * já carregada para o gráfico "Evolução de gastos" (`distribuicaoPeriodo`,
 * BI 4.0). Só aparece com pelo menos 2 meses com valor — com um único mês,
 * ele é trivialmente "o maior", não uma descoberta. Nunca reordena/filtra a
 * série, só lê o ponto de maior `valor` já pronto. */
export function insightPicoMensal(pontosPeriodo: PontoDistribuicaoResposta[]): Insight | null {
  const comValor = pontosPeriodo.filter((ponto) => ponto.valor !== null && ponto.valor > 0);
  if (comValor.length < 2) return null;

  const maior = comValor.reduce((atual, ponto) => ((ponto.valor as number) > (atual.valor as number) ? ponto : atual));
  return {
    id: "pico-mensal",
    tipo: "neutro",
    texto: `${FORMATADOR_MOEDA.format(maior.valor as number)} — ${formatarPeriodoMensal(maior.rotulo)} concentrou o maior volume financeiro do período`,
    tituloCurto: "PICO MENSAL",
  };
}

/** Mês "completo" (BI 4.0, guarda contra narrativa enganosa) — um mês só
 * entra numa comparação de tendência quando já terminou de verdade: o mês
 * corrente (`hoje`) ainda está em andamento, então nunca é comparável a um
 * mês anterior fechado (ex.: "agosto caiu 14%" no dia 8 de agosto, quando
 * agosto mal começou). Comparação em string funciona porque as chaves são
 * sempre `YYYY-MM` (mesmo formato de `_chave_periodo` no backend). */
function mesEhCompleto(chavePeriodo: string, hoje: Date): boolean {
  const chaveHoje = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
  return chavePeriodo < chaveHoje;
}

/** Insight — tendência recente: o último mês FECHADO da série vs. o mês
 * imediatamente anterior a ele (mesma `distribuicaoPeriodo` do hero, BI
 * 4.0). Guarda de mês incompleto (`mesEhCompleto`): se o último ponto da
 * série é o mês corrente (ainda em andamento), nenhum insight é gerado —
 * "menos insights, maior confiabilidade" (pedido explícito do usuário),
 * nunca uma narrativa de "queda"/"alta" só porque o mês não terminou.
 * `hoje` é injetável (default `new Date()`) só para o módulo continuar
 * puro e testável. */
export function insightTendenciaRecente(pontosPeriodo: PontoDistribuicaoResposta[], hoje: Date = new Date()): Insight | null {
  const comValor = pontosPeriodo.filter((ponto) => ponto.valor !== null);
  const ordenados = [...comValor].sort((a, b) => (a.rotulo < b.rotulo ? -1 : a.rotulo > b.rotulo ? 1 : 0));
  if (ordenados.length < 2) return null;

  const ultimo = ordenados[ordenados.length - 1];
  const penultimo = ordenados[ordenados.length - 2];
  if (!mesEhCompleto(ultimo.rotulo, hoje)) return null;

  const variacao = variacaoPercentual(penultimo.valor, ultimo.valor);
  if (variacao === null || variacao === 0) return null;

  const direcao = variacao > 0 ? "a mais" : "a menos";
  const percentualAbsoluto = FORMATADOR_PERCENTUAL.format(Math.abs(variacao));
  return {
    id: "tendencia-recente",
    tipo: "neutro",
    texto: `${formatarPeriodoMensal(ultimo.rotulo)} registrou ${percentualAbsoluto}% ${direcao} de gastos que ${formatarPeriodoMensal(penultimo.rotulo)}`,
    tituloCurto: "TENDÊNCIA RECENTE",
  };
}

/** Insight 2 — concentração de gastos (regra de Pareto) sobre a
 * distribuição por município já carregada pela grade de gráficos: acha o
 * menor N de municípios cuja soma de valor já alcança 80% do valor total
 * do recorte — nunca um "top 3" fixo, o ponto de corte é sempre
 * recalculado a partir do dado real. Só aparece quando há concentração
 * de fato (N é uma fração pequena do total de municípios, < 50%) — caso
 * contrário, o gasto está bem distribuído e não há nada a destacar. */
export function insightConcentracaoGastos(pontosMunicipio: PontoDistribuicaoResposta[]): Insight | null {
  const comValor = pontosMunicipio.filter((ponto) => ponto.valor !== null && ponto.valor > 0);
  if (comValor.length < 2) return null;

  const valorTotal = comValor.reduce((soma, ponto) => soma + (ponto.valor as number), 0);
  if (valorTotal <= 0) return null;

  const ordenados = [...comValor].sort((a, b) => (b.valor as number) - (a.valor as number));
  let acumulado = 0;
  let n = 0;
  for (const ponto of ordenados) {
    acumulado += ponto.valor as number;
    n += 1;
    if (acumulado / valorTotal >= 0.8) break;
  }

  const percentualMunicipios = (n / ordenados.length) * 100;
  if (percentualMunicipios >= 50) return null; // sem concentração relevante

  const percentualValor = (acumulado / valorTotal) * 100;
  return {
    id: "concentracao-gastos",
    tipo: "neutro",
    texto: `${FORMATADOR_INTEIRO.format(n)} de ${FORMATADOR_INTEIRO.format(ordenados.length)} município(s) concentram ${FORMATADOR_PERCENTUAL.format(percentualValor)}% do valor total`,
    tituloCurto: "CONCENTRAÇÃO TERRITORIAL",
    acao: { rotulo: "Aplicar filtro", municipio: ordenados[0].rotulo },
  };
}

/** Insight — participação Membros × Servidores: qual das duas categorias
 * lidera a CONTAGEM de diárias do recorte (mesma base — total de pontos da
 * dimensão `categoria_funcional`, incluindo "não identificado" no
 * denominador — já usada por `GradeKpisExecutivos` para a célula "Membros ·
 * Servidores"). Métrica é sempre quantidade (nunca valor financeiro — esta
 * distribuição descreve "quem", não "quanto"). Sem insight em caso de
 * empate exato (não há um "líder" determinístico para escolher). */
export function insightParticipacaoCategoriaFuncional(pontosCategoriaFuncional: PontoDistribuicaoResposta[]): Insight | null {
  const total = pontosCategoriaFuncional.reduce((soma, ponto) => soma + ponto.contagem, 0);
  if (total <= 0) return null;

  const contagemMembro = pontosCategoriaFuncional.find((ponto) => ponto.rotulo === "MEMBRO")?.contagem ?? 0;
  const contagemServidor = pontosCategoriaFuncional.find((ponto) => ponto.rotulo === "SERVIDOR")?.contagem ?? 0;
  if (contagemMembro === contagemServidor) return null;

  const [rotuloLider, contagemLider] =
    contagemServidor > contagemMembro ? (["Servidores", contagemServidor] as const) : (["Membros", contagemMembro] as const);
  if (contagemLider <= 0) return null;

  const percentual = (contagemLider / total) * 100;
  return {
    id: "participacao-categoria-funcional",
    tipo: "neutro",
    texto: `${rotuloLider} representaram ${FORMATADOR_PERCENTUAL.format(percentual)}% das diárias registradas no período`,
    tituloCurto: "MEMBROS × SERVIDORES",
  };
}

// Mesmo rótulo sintético de `GradeGraficosExecutivos.ROTULO_DOC_ORIGEM_AUSENTE`/
// `distribuicoes.py::_chave_doc_origem` — reproduzido letra por letra: uma
// "unidade não informada" nunca pode virar "unidade líder".
const ROTULO_DOC_ORIGEM_AUSENTE = "Unidade solicitante não informada";

/** Insight — unidade solicitante líder: a unidade (documento de origem)
 * com mais registros no recorte (mesma `distribuicaoDocOrigem` do ranking
 * "Unidade solicitante", já ordenada por contagem decrescente pelo
 * backend). Métrica é sempre quantidade de registros — esta dimensão não
 * tem um campo de filtro/valor associado na UI hoje (mesmo motivo de
 * `GradeGraficosExecutivos` não dar `aoClicarPonto` a este gráfico), então
 * o insight também não carrega `acao`. */
export function insightUnidadeLider(pontosDocOrigem: PontoDistribuicaoResposta[]): Insight | null {
  const reais = pontosDocOrigem.filter((ponto) => ponto.rotulo !== ROTULO_DOC_ORIGEM_AUSENTE && ponto.contagem > 0);
  if (reais.length === 0) return null;

  const lider = reais.reduce((atual, ponto) => (ponto.contagem > atual.contagem ? ponto : atual));
  return {
    id: "unidade-lider",
    tipo: "neutro",
    texto: `${lider.rotulo} liderou as solicitações, com ${FORMATADOR_INTEIRO.format(lider.contagem)} registro(s) no período`,
    tituloCurto: "UNIDADE LÍDER",
  };
}

/** Insight 3 — meio de transporte não identificado (mesmo bucket
 * sintético de `distribuicoes.py::_ROTULO_TRANSPORTE_NAO_IDENTIFICADO`,
 * reproduzido letra por letra — nunca um segundo texto). BI 4.0: não é
 * mais chamado por `calcularInsightsExecutivos` (é um alerta de
 * preenchimento, não financeiro/gerencial) — continua exportado e
 * testado, o dado segue disponível no gráfico "Meio de transporte". */
export function insightTransporteNaoIdentificado(pontosTransporte: PontoDistribuicaoResposta[]): Insight | null {
  const total = pontosTransporte.reduce((soma, ponto) => soma + ponto.contagem, 0);
  const naoIdentificado = pontosTransporte.find((ponto) => ponto.rotulo === "Transporte não identificado");
  if (!naoIdentificado || naoIdentificado.contagem === 0 || total === 0) return null;

  const percentual = (naoIdentificado.contagem / total) * 100;
  return {
    id: "transporte-nao-identificado",
    tipo: "atencao",
    texto: `${FORMATADOR_PERCENTUAL.format(percentual)}% dos registros com transporte não identificado (${FORMATADOR_INTEIRO.format(naoIdentificado.contagem)} diária(s))`,
    tituloCurto: "TRANSPORTE NÃO IDENTIFICADO",
  };
}

// Mesmos títulos já gravados por `app/domain/analitica/diagnostico.py`
// (reproduzidos letra por letra — nunca uma segunda definição do mesmo
// caso).
const TITULO_DUPLICIDADE = "Possível duplicidade";
const TITULO_DH_AUSENTE_SEM_MOTIVO = "Documento Hábil ausente — motivo não identificado";
const TITULO_AGUARDANDO_LIBERACAO = "Aguardando liberação";

function contarRegistrosComCaso(registros: RegistroDiagnosticadoResposta[], titulos: string[]): number {
  const conjunto = new Set(titulos);
  return registros.filter((registro) => registro.casos.some((caso) => conjunto.has(caso.titulo))).length;
}

/** Insights 4-6 — cada um é uma contagem de registros já classificados
 * pelo Diagnóstico (`GET /diagnostico`, catálogo fechado de
 * `diagnostico.py`) — nunca uma nova classificação, só uma soma de casos
 * já decididos pelo backend. `filtroDiagnostico` usa o MESMO título já
 * usado para contar (`contarRegistrosComCaso`) — quando o usuário abre o
 * diagnóstico a partir daqui, vê só esses registros, nunca o recorte
 * inteiro (correção de regressão, 2026-08-07).
 *
 * O insight de "trecho incompleto" (origem/destino ausente) foi removido
 * do Painel Executivo por pedido explícito do usuário (2026-08-07): é
 * consequência de como o parser lê o campo, não um problema real do
 * processo — segue existindo no catálogo do Diagnóstico geral (sem
 * filtro), só deixou de ser um insight executivo. Nenhuma mudança no
 * parser/backend.
 *
 * BI 4.0 (2026-08-08): não é mais chamado por `calcularInsightsExecutivos`
 * (diagnóstico/operacional, fora da lateral financeira/gerencial) —
 * continua exportado e testado, o dado segue disponível em Diagnóstico
 * geral e no drill-down por gráfico do painel lateral contextual. */
export function insightsDiagnostico(registros: RegistroDiagnosticadoResposta[]): Insight[] {
  const insights: Insight[] = [];

  const duplicidade = contarRegistrosComCaso(registros, [TITULO_DUPLICIDADE]);
  if (duplicidade > 0) {
    insights.push({
      id: "duplicidade",
      tipo: "atencao",
      texto: `${FORMATADOR_INTEIRO.format(duplicidade)} caso(s) de possível duplicidade`,
      tituloCurto: "POSSÍVEL DUPLICIDADE",
      acao: {
        rotulo: "Abrir diagnóstico",
        abrirDiagnostico: true,
        filtroDiagnostico: { titulo: TITULO_DUPLICIDADE, rotulo: "Possível duplicidade" },
      },
    });
  }

  const dhAusente = contarRegistrosComCaso(registros, [TITULO_DH_AUSENTE_SEM_MOTIVO]);
  if (dhAusente > 0) {
    insights.push({
      id: "dh-ausente",
      tipo: "atencao",
      texto: `${FORMATADOR_INTEIRO.format(dhAusente)} processo(s) com Documento Hábil ausente sem motivo identificado`,
      tituloCurto: "DOCUMENTO HÁBIL AUSENTE",
      acao: {
        rotulo: "Abrir diagnóstico",
        abrirDiagnostico: true,
        filtroDiagnostico: { titulo: TITULO_DH_AUSENTE_SEM_MOTIVO, rotulo: "Documento Hábil ausente" },
      },
    });
  }

  const aguardandoLiberacao = contarRegistrosComCaso(registros, [TITULO_AGUARDANDO_LIBERACAO]);
  if (aguardandoLiberacao > 0) {
    insights.push({
      id: "aguardando-liberacao",
      tipo: "neutro",
      texto: `${FORMATADOR_INTEIRO.format(aguardandoLiberacao)} processo(s) aguardando liberação`,
      tituloCurto: "AGUARDANDO LIBERAÇÃO",
      acao: {
        rotulo: "Abrir diagnóstico",
        abrirDiagnostico: true,
        filtroDiagnostico: { titulo: TITULO_AGUARDANDO_LIBERACAO, rotulo: "Aguardando liberação" },
      },
    });
  }

  return insights;
}

export interface DadosParaInsights {
  valorTotalAtual: number | null;
  valorTotalPeriodoAnterior: number | null;
  valorMedioAtual: number | null;
  valorMedioPeriodoAnterior: number | null;
  rotuloPeriodoAnterior: string | null;
  pontosPeriodo: PontoDistribuicaoResposta[];
  pontosMunicipio: PontoDistribuicaoResposta[];
  pontosCategoriaFuncional: PontoDistribuicaoResposta[];
  pontosDocOrigem: PontoDistribuicaoResposta[];
  /** Injetável só para teste determinístico da guarda de mês incompleto
   * (`insightTendenciaRecente`) — em produção nunca é passado, o insight
   * usa `new Date()` de verdade. */
  hoje?: Date;
}

/** Ponto único de composição da lateral do Modo Executivo (BI 4.0) — ordem
 * fixa, sempre a mesma para o painel nunca parecer "embaralhado" a cada
 * re-render: variação do total → pico mensal → tendência recente →
 * variação do valor médio → concentração territorial → participação
 * Membros×Servidores → unidade solicitante líder. Exclusivamente
 * financeiro/gerencial — nenhum insight de diagnóstico/qualidade de
 * preenchimento entra aqui (ver `insightsDiagnostico`/
 * `insightTransporteNaoIdentificado` acima, fora desta composição por
 * pedido explícito do usuário). */
export function calcularInsightsExecutivos(dados: DadosParaInsights): Insight[] {
  const insights: Insight[] = [];

  if (dados.rotuloPeriodoAnterior !== null) {
    const variacaoTotal = insightVariacaoPeriodo(dados.valorTotalAtual, dados.valorTotalPeriodoAnterior, dados.rotuloPeriodoAnterior);
    if (variacaoTotal) insights.push(variacaoTotal);
  }

  const pico = insightPicoMensal(dados.pontosPeriodo);
  if (pico) insights.push(pico);

  const tendencia = insightTendenciaRecente(dados.pontosPeriodo, dados.hoje);
  if (tendencia) insights.push(tendencia);

  if (dados.rotuloPeriodoAnterior !== null) {
    const variacaoMedia = insightVariacaoValorMedio(dados.valorMedioAtual, dados.valorMedioPeriodoAnterior, dados.rotuloPeriodoAnterior);
    if (variacaoMedia) insights.push(variacaoMedia);
  }

  const concentracao = insightConcentracaoGastos(dados.pontosMunicipio);
  if (concentracao) insights.push(concentracao);

  const participacao = insightParticipacaoCategoriaFuncional(dados.pontosCategoriaFuncional);
  if (participacao) insights.push(participacao);

  const unidadeLider = insightUnidadeLider(dados.pontosDocOrigem);
  if (unidadeLider) insights.push(unidadeLider);

  return insights;
}
