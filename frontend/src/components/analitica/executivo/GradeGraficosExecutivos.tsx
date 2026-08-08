import type { ReactNode } from "react";
import Alerta from "../../ui/Alerta";
import Botao from "../../ui/Botao";
import CartaoGrafico from "../graficos/CartaoGrafico";
import GraficoBarras from "../graficos/GraficoBarras";
import GraficoDonut, { type SegmentoDonut } from "../graficos/GraficoDonut";
import { COR_MAGNITUDE_CONTAGEM, COR_MAGNITUDE_VALOR, COR_OUTROS, PALETA_CATEGORICA } from "../graficos/cores";
import GraficoEvolucaoComZoom from "./GraficoEvolucaoComZoom";
import { useValorAnimado } from "./useValorAnimado";
import type { CampoDeFiltro } from "../../../hooks/useDiarias";
import type { EstadoUseDistribuicoes } from "../../../hooks/useDistribuicoes";
import { formatarPeriodoMensal } from "../../../lib/datas";
import { formatarVariacaoPercentual } from "../../../lib/variacao";
import { FOCO_ANEL, SUPERFICIE_BASE } from "../../../theme/estilos";
import { TIPOGRAFIA } from "../../../theme/tipografia";
import type { DistribuicaoResposta, IndicadoresResposta, PontoDistribuicaoResposta } from "../../../types/analitica";
import type { PontoSelecionadoExecutivo } from "./tiposSelecao";

interface Props {
  /** BI 4.0 — cabeçalho editorial do hero ("Evolução financeira"): mesmos
   * indicadores já buscados por `ModoExecutivo` (KPI "Valor total"/insight
   * de variação), nenhuma chamada nova. `indicadores === null` (ainda
   * carregando) esconde o cabeçalho editorial sem afetar o gráfico. */
  indicadores: IndicadoresResposta | null;
  indicadoresPeriodoAnterior: IndicadoresResposta | null;
  distribuicaoPeriodo: EstadoUseDistribuicoes;
  distribuicaoMunicipio: EstadoUseDistribuicoes;
  distribuicaoMotivo: EstadoUseDistribuicoes;
  distribuicaoSituacao: EstadoUseDistribuicoes;
  distribuicaoOrigemDestino: EstadoUseDistribuicoes;
  distribuicaoCategoriaFuncional: EstadoUseDistribuicoes;
  distribuicaoDocOrigem: EstadoUseDistribuicoes;
  distribuicaoTransporte: EstadoUseDistribuicoes;
  /** Sprint 21.4 — substitui o clique-refina direto da Sprint 21.3: um
   * clique num ponto filtrável agora abre o painel lateral contextual
   * (`ModoExecutivo`/`PainelLateralExecutivo`), nunca aplica o filtro nem
   * sai do Modo Executivo por conta própria — "quem decide ir para a
   * tabela é o usuário, via ação explícita no painel lateral"
   * (`modo-executivo-wireframes.md § 4`). */
  aoSelecionarPonto: (selecao: PontoSelecionadoExecutivo) => void;
  /** Sprint 21.7 (Zoom temporal) — só os 2 gráficos de "Evolução" usam
   * este caminho direto (nunca o painel lateral): selecionar um intervalo
   * por arraste/teclado e aplicar já atualiza o Recorte Analítico
   * compartilhado, permanecendo no Modo Executivo para ver o resultado
   * refletido em toda a grade — mesmo `aplicarFiltro` de sempre, só um
   * caminho de UI diferente do clique-abre-painel das demais dimensões. */
  onMudarFiltro: (parcial: Partial<Record<CampoDeFiltro, string | undefined>>) => void;
  /** Conexão visual Insight ↔ Gráfico (2026-08-07; BI 4.0 adiciona
   * "periodo") — id do gráfico a realçar, ver `ModoExecutivo.
   * GRAFICO_POR_INSIGHT`. `null`/ausente = nenhum realce, comportamento
   * idêntico ao de antes desta Sprint. */
  graficoEmDestaque?: "municipio" | "periodo" | null;
  /** Redesign BI 3.0 (2026-08-07) — repassado a todo `CartaoGrafico` desta
   * grade; só o Modo Apresentação passa `true` ("menos controles
   * administrativos"). Default `false` preserva o comportamento normal. */
  somenteLeitura?: boolean;
}

// Sprint 21.3 — rótulos sintéticos de `distribuicoes.py` reproduzidos letra
// por letra (mesmo critério já usado em `DashboardRecorte.tsx`, duplicado
// aqui de propósito: o Dashboard operacional continua intocado, nenhuma
// constante é importada dele). `NAO_IDENTIFICADO` entra na mesma lista
// pelo mesmo motivo, embora não seja um bucket "sintético" de ausência
// como os demais — é um valor real de `categoria_funcional`, mas nunca um
// valor de FILTRO aceito (`CategoriaFuncionalFiltro`, `schemas/analitica.py`,
// só aceita MEMBRO/SERVIDOR, decisão da Sprint 20): filtrar por ele
// quebraria com 422, então o segmento nunca pode virar botão de filtro.
const ROTULO_MUNICIPIO_SEM_DESTINO = "Sem destino informado";
const ROTULO_ORIGEM_AUSENTE = "Sem origem informada";
const ROTULO_DESTINO_AUSENTE = "Sem destino informado";
const ROTULO_SITUACAO_NAO_INFORMADA = "Situação não informada";
const ROTULO_DOC_ORIGEM_AUSENTE = "Unidade solicitante não informada";
const ROTULO_TRANSPORTE_NAO_IDENTIFICADO = "Transporte não identificado";
const ROTULO_CATEGORIA_NAO_IDENTIFICADA = "NAO_IDENTIFICADO";
const ROTULO_OUTROS = "Outros";

const ROTULO_CATEGORIA_FUNCIONAL_EXIBICAO: Record<string, string> = {
  MEMBRO: "Membro",
  SERVIDOR: "Servidor",
  NAO_IDENTIFICADO: "Não identificado",
};

function ehBucketSintetico(rotulo: string): boolean {
  return (
    rotulo === ROTULO_MUNICIPIO_SEM_DESTINO ||
    rotulo === ROTULO_SITUACAO_NAO_INFORMADA ||
    rotulo === ROTULO_DOC_ORIGEM_AUSENTE ||
    rotulo === ROTULO_TRANSPORTE_NAO_IDENTIFICADO ||
    rotulo === ROTULO_CATEGORIA_NAO_IDENTIFICADA
  );
}

function ehParOrigemDestinoSintetico(rotulo: string): boolean {
  const [origem, destino] = rotulo.split(" → ");
  return origem === ROTULO_ORIGEM_AUSENTE || destino === ROTULO_DESTINO_AUSENTE;
}

const FORMATADOR_MOEDA = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const FORMATADOR_INTEIRO = new Intl.NumberFormat("pt-BR");
const FORMATADOR_PERCENTUAL = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

function formatarInteiro(valor: number): string {
  return FORMATADOR_INTEIRO.format(valor);
}

function formatarMoedaOuTraco(valor: number | null): string {
  return valor != null ? FORMATADOR_MOEDA.format(valor) : "—";
}

// BI 4.0 — `formatarPeriodo` mudou de nome/lugar: agora é
// `formatarPeriodoMensal` em `lib/datas.ts` (única implementação,
// reaproveitada também por `insightsExecutivos.ts`, que é puro/sem acesso
// a este módulo React).
const formatarPeriodo = formatarPeriodoMensal;

function intervaloDoMes(chavePeriodo: string): { periodo_inicial: string; periodo_final: string } {
  const [ano, mes] = chavePeriodo.split("-").map(Number);
  const paraIso = (data: Date) =>
    `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}-${String(data.getDate()).padStart(2, "0")}`;
  return {
    periodo_inicial: paraIso(new Date(ano, mes - 1, 1)),
    periodo_final: paraIso(new Date(ano, mes, 0)),
  };
}

const TOPO_RANKING = 8;

function agruparTop3ComOutros(pontos: PontoDistribuicaoResposta[]): SegmentoDonut[] {
  const top3 = pontos.slice(0, 3);
  const resto = pontos.slice(3);
  const somaResto = resto.reduce((soma, ponto) => soma + ponto.contagem, 0);
  const segmentos: SegmentoDonut[] = top3.map((ponto, indice) => ({
    rotulo: ponto.rotulo,
    valor: ponto.contagem,
    cor: PALETA_CATEGORICA[indice],
    filtravel: !ehBucketSintetico(ponto.rotulo),
  }));
  if (somaResto > 0) segmentos.push({ rotulo: ROTULO_OUTROS, valor: somaResto, cor: COR_OUTROS, filtravel: false });
  return segmentos;
}

const RESET_BOTAO_LEGENDA = "appearance-none border-0 bg-transparent p-0 cursor-pointer text-left";

/** BI 4.0 — legenda rica ao lado do donut (rótulo + valor + participação
 * %), reaproveitando a MESMA ação de clique-refina do gráfico
 * (`aoClicarSegmento`) — nunca uma segunda forma de filtrar. Percentual é
 * sempre sobre a soma dos segmentos já desenhados (a mesma base do
 * donut), nunca um total externo. */
function LegendaDonut({
  segmentos,
  formatarValor,
  aoClicarSegmento,
}: {
  segmentos: SegmentoDonut[];
  formatarValor: (valor: number) => string;
  aoClicarSegmento?: (indice: number) => void;
}) {
  const total = segmentos.reduce((soma, segmento) => soma + segmento.valor, 0);

  return (
    <ul className="min-w-0 flex-1 space-y-1.5">
      {segmentos.map((segmento, indice) => {
        const percentual = total > 0 ? (segmento.valor / total) * 100 : 0;
        const clicavel = aoClicarSegmento !== undefined && segmento.filtravel !== false;
        const Elemento = clicavel ? "button" : "div";
        return (
          <li key={segmento.rotulo}>
            <Elemento
              {...(clicavel
                ? { type: "button", onClick: () => aoClicarSegmento(indice), "aria-label": `Filtrar por ${segmento.rotulo}` }
                : {})}
              className={`flex w-full items-center justify-between gap-3 rounded px-1 py-0.5 ${
                clicavel ? `${RESET_BOTAO_LEGENDA} ${FOCO_ANEL} hover:bg-white/5` : ""
              }`}
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: segmento.cor }} />
                <span className="truncate text-xs text-slate-300">{segmento.rotulo}</span>
              </span>
              <span className="shrink-0 text-xs font-medium tabular-nums text-slate-200">
                {formatarValor(segmento.valor)} · {FORMATADOR_PERCENTUAL.format(percentual)}%
              </span>
            </Elemento>
          </li>
        );
      })}
    </ul>
  );
}

/** BI 4.0 — "donut à esquerda + legenda/valores à direita" (item 6 da
 * Sprint): melhor aproveitamento do espaço horizontal dos cartões de
 * distribuição do que "gráfico redondo + legenda embaixo". Em telas
 * estreitas (`sm:` para baixo) volta a empilhar. Só usado na visão
 * compacta do cartão — no modal expandido (`expandido=true`), quem chama
 * continua desenhando só `GraficoDonut` maior, com a legenda própria do
 * `CartaoGrafico` (`legendaSoNoModal`) abaixo, mais espaço para ler. */
function DonutComLegenda({
  segmentos,
  formatarValor,
  aoClicarSegmento,
}: {
  segmentos: SegmentoDonut[];
  formatarValor: (valor: number) => string;
  aoClicarSegmento?: (indice: number) => void;
}) {
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
      <GraficoDonut segmentos={segmentos} formatarValor={formatarValor} aoClicarSegmento={aoClicarSegmento} tamanho="padrao" />
      <LegendaDonut segmentos={segmentos} formatarValor={formatarValor} aoClicarSegmento={aoClicarSegmento} />
    </div>
  );
}

/** Sprint 21.3 — mesmo papel de `DashboardRecorte.SecaoGrafico`, duplicado
 * aqui (não importado de lá) para o Dashboard operacional permanecer
 * 100% intocado — princípio explícito desta Sprint. Pequeno wrapper de
 * apresentação (carregando/erro/pronto), não lógica de negócio. */
function SecaoGrafico({
  estado,
  renderizar,
}: {
  estado: EstadoUseDistribuicoes;
  renderizar: (distribuicao: DistribuicaoResposta) => ReactNode;
}) {
  if (estado.carregando) {
    return (
      <div role="status" className={`flex items-center justify-center p-10 ${SUPERFICIE_BASE}`}>
        <p className={TIPOGRAFIA.textoAuxiliar}>Carregando...</p>
      </div>
    );
  }

  if (estado.erro !== null) {
    return (
      <div className={`p-5 ${SUPERFICIE_BASE}`}>
        <div className="flex items-center justify-between gap-4">
          <Alerta variante="erro">{estado.erro}</Alerta>
          <Botao variante="secundaria" onClick={estado.tentarNovamente}>
            Tentar novamente
          </Botao>
        </div>
      </div>
    );
  }

  if (estado.distribuicao === null) return null;

  return <>{renderizar(estado.distribuicao)}</>;
}

/** Rótulo discreto de seção (Refinamento visual 2.0, 2026-08-07) — separa a
 * grade secundária em blocos narrativos ("Distribuições"/"Análise
 * Territorial") sem introduzir peso visual novo: mesma legenda tipográfica
 * já usada em cabeçalho de tabela/cartão (`TIPOGRAFIA.legenda`), nenhum
 * componente novo. */
function RotuloSecao({ children }: { children: ReactNode }) {
  return <h3 className={`mb-3 ${TIPOGRAFIA.legenda}`}>{children}</h3>;
}

/** Grade de gráficos do Modo Executivo (`modo-executivo-arquitetura-
 * funcional.md § 6`, componente 4; `modo-executivo-wireframes.md § 2.2`) —
 * as dimensões aprovadas nas decisões de fechamento (2026-08-05): as 5 já
 * existentes desde a Sprint 19.6.3/19.6.4 (`periodo`, `municipio`,
 * `motivo`, `situacao`, `origem_destino`) mais as 3 novas da Sprint 21.1
 * (`categoria_funcional` — "Membros × Servidores", sempre visível,
 * independente do fluxo de "Comparar"; `doc_origem` — "Unidade
 * solicitante (documento de origem)", rótulo completo obrigatório,
 * decisão 9; `transporte` — "Meio de transporte"). "Concentração de
 * gastos" fica para a micro-sprint de insights (21.5) — é apresentação
 * derivada de uma distribuição já aqui, não uma dimensão nova. Clique num
 * ponto filtrável abre o painel lateral contextual (Sprint 21.4,
 * `aoSelecionarPonto`) — nunca aplica o filtro nem sai da tela sozinho
 * (diferença deliberada do clique-refina direto do Dashboard operacional,
 * `DashboardRecorte.refinar`, Sprint 19.6.5). */
export default function GradeGraficosExecutivos({
  indicadores,
  indicadoresPeriodoAnterior,
  distribuicaoPeriodo,
  distribuicaoMunicipio,
  distribuicaoMotivo,
  distribuicaoSituacao,
  distribuicaoOrigemDestino,
  distribuicaoCategoriaFuncional,
  distribuicaoDocOrigem,
  distribuicaoTransporte,
  aoSelecionarPonto,
  onMudarFiltro,
  graficoEmDestaque = null,
  somenteLeitura = false,
}: Props) {
  // BI 4.0 — valor grande do hero conta visualmente do valor anterior até
  // o novo (mesmo `useValorAnimado` dos KPIs) quando o recorte muda,
  // terminando exatamente no valor real recebido.
  const valorTotalHeroAnimado = useValorAnimado(indicadores?.valor_total ?? null);

  function aoAplicarIntervaloPeriodo(periodoInicial: string, periodoFinal: string) {
    onMudarFiltro({ periodo_inicial: periodoInicial, periodo_final: periodoFinal });
  }

  // BI 4.0 — cabeçalho editorial do hero: mesma fórmula de variação de
  // `lib/variacao.ts` (única implementação, também usada por
  // `GradeKpisExecutivos`/`insightsExecutivos.ts`) sobre os mesmos
  // indicadores já buscados por `ModoExecutivo` — nenhum cálculo/fetch
  // novo, só apresentação.
  const deltaHero = formatarVariacaoPercentual(
    indicadoresPeriodoAnterior?.valor_total ?? null,
    indicadores?.valor_total ?? null,
  );

  return (
    <div className="space-y-8">
      {/* Refinamento visual do Modo Executivo (2026-08-07) — "Evolução de
          gastos" é o gráfico hero: largura total, área de barras maior
          (`alturaBarra="grande"`), título maior (`variante="hero"` de
          `CartaoGrafico`), fora da grade densa dos demais. Nenhuma
          distribuição nova, nenhum dado novo — só hierarquia visual.
          BI 4.0 — ganha um cabeçalho editorial acima ("EVOLUÇÃO
          FINANCEIRA" + valor total + delta) e o `id`/realce de conexão
          insight↔gráfico ("pico mensal", ver `ModoExecutivo`). */}
      <div
        id="grafico-periodo"
        className={`rounded-card transition ${graficoEmDestaque === "periodo" ? "ring-2 ring-cyan-400/50 shadow-glow-cyan" : ""}`}
      >
        {indicadores !== null && (
          <div className="mb-5">
            <div className={TIPOGRAFIA.eyebrow}>Evolução financeira</div>
            <div className="mt-1 text-4xl font-bold text-slate-50">{formatarMoedaOuTraco(valorTotalHeroAnimado)}</div>
            {deltaHero && <p className={`mt-1 ${TIPOGRAFIA.textoAuxiliar}`}>{deltaHero} vs. período anterior</p>}
          </div>
        )}
        <SecaoGrafico
          estado={distribuicaoPeriodo}
          renderizar={(distribuicao) => {
            const comValor = distribuicao.pontos.filter((ponto) => ponto.valor !== null);
            return (
              <CartaoGrafico
                titulo="Evolução de gastos"
                subtitulo={comValor.length > 0 ? `${formatarPeriodo(comValor[0].rotulo)} – ${formatarPeriodo(comValor[comValor.length - 1].rotulo)}` : undefined}
                variante="hero"
                somenteLeitura={somenteLeitura}
                rotuloColunaValor="Valor"
                vazio={comValor.length === 0}
                interativo
                linhasTabela={distribuicao.pontos.map((ponto) => ({
                  rotulo: formatarPeriodo(ponto.rotulo),
                  valor: formatarMoedaOuTraco(ponto.valor),
                }))}
              >
                {(expandido) => (
                  <GraficoEvolucaoComZoom
                    cor={COR_MAGNITUDE_VALOR}
                    formatarValor={(valor) => FORMATADOR_MOEDA.format(valor)}
                    alturaBarra={expandido ? "expandido" : "grande"}
                    pontos={comValor.map((ponto) => ({
                      chave: ponto.rotulo,
                      rotulo: formatarPeriodo(ponto.rotulo),
                      valor: ponto.valor as number,
                    }))}
                    aoAplicarIntervalo={(chaveInicio, chaveFim) =>
                      aoAplicarIntervaloPeriodo(intervaloDoMes(chaveInicio).periodo_inicial, intervaloDoMes(chaveFim).periodo_final)
                    }
                  />
                )}
              </CartaoGrafico>
            );
          }}
        />
      </div>

      {/* Redesign BI 3.0 (2026-08-07) — composição assimétrica por
          conteúdo (não mais uma grade 50/50 fixa): "Evolução da
          quantidade" continua full-width, nível abaixo do hero (sem
          `alturaBarra="grande"`/`variante="hero"`); "Membros × Servidores"
          (donut de 2 segmentos, simples) cede espaço a "Motivos" (top-3 +
          Outros, legenda mais rica) — 40/60; "Situação"/"Transporte" têm
          conteúdo comparável, ficam 50/50 (assimetria só onde o dado pede,
          nunca por padrão estético). */}
      {/* BI 4.0 — "menos card, mais canvas": as duas seções secundárias
          (esta e "Análise Territorial", abaixo) ganham um fundo de seção
          único e sutil; os gráficos que vivem dentro perdem a borda/fundo
          próprios (`enfase="sutil"`) e passam a ler como parte da mesma
          superfície contínua, não como cartões empilhados. */}
      <div className="rounded-card bg-white/[0.015] p-6">
        <RotuloSecao>Distribuições</RotuloSecao>
        <div className="space-y-5">
          <SecaoGrafico
            estado={distribuicaoPeriodo}
            renderizar={(distribuicao) => (
              <CartaoGrafico
                titulo="Evolução da quantidade"
                somenteLeitura={somenteLeitura}
                enfase="sutil"
                rotuloColunaValor="Diárias"
                vazio={distribuicao.pontos.length === 0}
                interativo
                linhasTabela={distribuicao.pontos.map((ponto) => ({
                  rotulo: formatarPeriodo(ponto.rotulo),
                  valor: formatarInteiro(ponto.contagem),
                }))}
              >
                {(expandido) => (
                  <GraficoEvolucaoComZoom
                    cor={COR_MAGNITUDE_CONTAGEM}
                    formatarValor={formatarInteiro}
                    alturaBarra={expandido ? "expandido" : "padrao"}
                    pontos={distribuicao.pontos.map((ponto) => ({
                      chave: ponto.rotulo,
                      rotulo: formatarPeriodo(ponto.rotulo),
                      valor: ponto.contagem,
                    }))}
                    aoAplicarIntervalo={(chaveInicio, chaveFim) =>
                      aoAplicarIntervaloPeriodo(
                        intervaloDoMes(chaveInicio).periodo_inicial,
                        intervaloDoMes(chaveFim).periodo_final,
                      )
                    }
                  />
                )}
              </CartaoGrafico>
            )}
          />

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[2fr_3fr]">
          <SecaoGrafico
            estado={distribuicaoCategoriaFuncional}
            renderizar={(distribuicao) => {
              const segmentos: SegmentoDonut[] = distribuicao.pontos.map((ponto, indice) => ({
                rotulo: ROTULO_CATEGORIA_FUNCIONAL_EXIBICAO[ponto.rotulo] ?? ponto.rotulo,
                valor: ponto.contagem,
                cor: PALETA_CATEGORICA[indice] ?? COR_OUTROS,
                filtravel: !ehBucketSintetico(ponto.rotulo),
              }));
              const aoClicar = (indice: number) => {
                const ponto = distribuicao.pontos[indice];
                if (ehBucketSintetico(ponto.rotulo)) return;
                aoSelecionarPonto({
                  dimensao: "categoria_funcional",
                  rotulo: ROTULO_CATEGORIA_FUNCIONAL_EXIBICAO[ponto.rotulo] ?? ponto.rotulo,
                  contagem: ponto.contagem,
                  valor: ponto.valor,
                  filtro: { categoria_funcional: ponto.rotulo },
                });
              };
              return (
                <CartaoGrafico
                  titulo="Membros × Servidores"
                  somenteLeitura={somenteLeitura}
                  enfase="sutil"
                  rotuloColunaValor="Diárias"
                  vazio={distribuicao.pontos.length === 0}
                  interativo
                  legenda={segmentos.map((segmento) => ({ rotulo: segmento.rotulo, cor: segmento.cor, filtravel: segmento.filtravel }))}
                  aoClicarLegenda={aoClicar}
                  legendaSoNoModal
                  linhasTabela={distribuicao.pontos.map((ponto) => ({
                    rotulo: ROTULO_CATEGORIA_FUNCIONAL_EXIBICAO[ponto.rotulo] ?? ponto.rotulo,
                    valor: formatarInteiro(ponto.contagem),
                  }))}
                >
                  {(expandido) =>
                    expandido ? (
                      <GraficoDonut segmentos={segmentos} formatarValor={formatarInteiro} aoClicarSegmento={aoClicar} tamanho="expandido" />
                    ) : (
                      <DonutComLegenda segmentos={segmentos} formatarValor={formatarInteiro} aoClicarSegmento={aoClicar} />
                    )
                  }
                </CartaoGrafico>
              );
            }}
          />

          <SecaoGrafico
            estado={distribuicaoMotivo}
            renderizar={(distribuicao) => {
              const segmentos = agruparTop3ComOutros(distribuicao.pontos);
              // `segmentos[0..2]` espelham `distribuicao.pontos[0..2]` 1:1 (o
              // top 3 real); "Outros" (índice 3, se existir) nunca chega aqui
              // — `filtravel: false` já impede `GraficoDonut`/`CartaoGrafico`
              // de disparar o clique para ele.
              const aoClicar = (indice: number) => {
                const ponto = distribuicao.pontos[indice];
                aoSelecionarPonto({
                  dimensao: "motivo",
                  rotulo: ponto.rotulo,
                  contagem: ponto.contagem,
                  valor: ponto.valor,
                  filtro: { motivo: ponto.rotulo },
                });
              };
              return (
                <CartaoGrafico
                  titulo="Motivos"
                  somenteLeitura={somenteLeitura}
                  enfase="sutil"
                  rotuloColunaValor="Diárias"
                  vazio={distribuicao.pontos.length === 0}
                  interativo
                  legenda={segmentos.map((segmento) => ({ rotulo: segmento.rotulo, cor: segmento.cor, filtravel: segmento.filtravel }))}
                  aoClicarLegenda={aoClicar}
                  legendaSoNoModal
                  linhasTabela={distribuicao.pontos.map((ponto) => ({ rotulo: ponto.rotulo, valor: formatarInteiro(ponto.contagem) }))}
                >
                  {(expandido) =>
                    expandido ? (
                      <GraficoDonut segmentos={segmentos} formatarValor={formatarInteiro} aoClicarSegmento={aoClicar} tamanho="expandido" />
                    ) : (
                      <DonutComLegenda segmentos={segmentos} formatarValor={formatarInteiro} aoClicarSegmento={aoClicar} />
                    )
                  }
                </CartaoGrafico>
              );
            }}
          />
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <SecaoGrafico
            estado={distribuicaoSituacao}
            renderizar={(distribuicao) => {
              const segmentos = agruparTop3ComOutros(distribuicao.pontos);
              const aoClicar = (indice: number) => {
                const ponto = distribuicao.pontos[indice];
                aoSelecionarPonto({
                  dimensao: "situacao",
                  rotulo: ponto.rotulo,
                  contagem: ponto.contagem,
                  valor: ponto.valor,
                  filtro: { situacao: ponto.rotulo },
                });
              };
              return (
                <CartaoGrafico
                  titulo="Situação do servidor"
                  somenteLeitura={somenteLeitura}
                  enfase="sutil"
                  rotuloColunaValor="Diárias"
                  vazio={distribuicao.pontos.length === 0}
                  interativo
                  legenda={segmentos.map((segmento) => ({ rotulo: segmento.rotulo, cor: segmento.cor, filtravel: segmento.filtravel }))}
                  aoClicarLegenda={aoClicar}
                  legendaSoNoModal
                  linhasTabela={distribuicao.pontos.map((ponto) => ({ rotulo: ponto.rotulo, valor: formatarInteiro(ponto.contagem) }))}
                >
                  {(expandido) =>
                    expandido ? (
                      <GraficoDonut segmentos={segmentos} formatarValor={formatarInteiro} aoClicarSegmento={aoClicar} tamanho="expandido" />
                    ) : (
                      <DonutComLegenda segmentos={segmentos} formatarValor={formatarInteiro} aoClicarSegmento={aoClicar} />
                    )
                  }
                </CartaoGrafico>
              );
            }}
          />

          <SecaoGrafico
            estado={distribuicaoTransporte}
            renderizar={(distribuicao) => {
              // Sem `aoClicarSegmento`/`aoClicarLegenda`: `transporte` é uma
              // dimensão de distribuição nova (Sprint 21.1), mas nunca virou
              // um campo de filtro em `FiltrosDiaria` — extensão deliberadamente
              // menor que a completa (só o gráfico, não drill-down), então este
              // cartão é só leitura (`interativo` fica `false`, comportamento
              // padrão de `CartaoGrafico`), com a tabela textual equivalente
              // como única forma de consulta detalhada.
              const segmentos = agruparTop3ComOutros(distribuicao.pontos);
              return (
                <CartaoGrafico
                  titulo="Meio de transporte"
                  somenteLeitura={somenteLeitura}
                  enfase="sutil"
                  rotuloColunaValor="Diárias"
                  vazio={distribuicao.pontos.length === 0}
                  legenda={segmentos.map((segmento) => ({ rotulo: segmento.rotulo, cor: segmento.cor }))}
                  legendaSoNoModal
                  linhasTabela={distribuicao.pontos.map((ponto) => ({ rotulo: ponto.rotulo, valor: formatarInteiro(ponto.contagem) }))}
                >
                  {(expandido) =>
                    expandido ? (
                      <GraficoDonut segmentos={segmentos} formatarValor={formatarInteiro} tamanho="expandido" />
                    ) : (
                      <DonutComLegenda segmentos={segmentos} formatarValor={formatarInteiro} />
                    )
                  }
                </CartaoGrafico>
              );
            }}
          />
          </div>
        </div>
      </div>

      {/* Redesign BI 3.0 (2026-08-07) — "Municípios" vira ranking premium
          full-width (protagonismo próprio, `numerado`/`destacarPrimeiro`
          em `GraficoBarras`), em vez de disputar 60/40 com outro gráfico;
          "Unidade solicitante"/"Origem × Destino" (os 2 rankings
          restantes, ambos com rótulos longos) dividem a linha seguinte
          55/45 — largura maior não corta rótulo (a largura da coluna de
          rótulo em `GraficoBarras` horizontal é uma classe fixa, não
          proporcional ao card). */}
      {/* BI 4.0 — mesmo canvas de seção da "Distribuições" acima. */}
      <div className="rounded-card bg-white/[0.015] p-6">
        <RotuloSecao>Análise Territorial</RotuloSecao>
        <div className="space-y-5">
          <SecaoGrafico
            estado={distribuicaoMunicipio}
            renderizar={(distribuicao) => {
              const topMunicipios = distribuicao.pontos.slice(0, TOPO_RANKING);
              // BI 4.0 — "Top Municípios": além do ranking por contagem já
              // existente (BI 3.0), cada linha ganha um `subvalor` com o
              // valor financeiro e a participação % — sempre sobre a MESMA
              // distribuição já carregada (soma de `ponto.valor`, nunca um
              // total externo), e só quando o município tem valor
              // financeiro conhecido (`ponto.valor !== null`).
              const totalValorMunicipios = distribuicao.pontos.reduce((soma, ponto) => soma + (ponto.valor ?? 0), 0);
              return (
                // `id`/realce — conexão visual Insight ↔ Gráfico (2026-08-07):
                // alvo do scroll e do destaque quando o insight de "concentração
                // de gastos" está em hover/clique no painel lateral. Puramente
                // visual — nenhum filtro/cálculo muda por causa disso.
                <div
                  id="grafico-municipio"
                  className={`rounded-card transition ${
                    graficoEmDestaque === "municipio" ? "ring-2 ring-cyan-400/50 shadow-glow-cyan" : ""
                  }`}
                >
                  <CartaoGrafico
                    titulo="Municípios"
                    somenteLeitura={somenteLeitura}
                    enfase="sutil"
                    rotuloColunaValor="Diárias"
                    vazio={distribuicao.pontos.length === 0}
                    interativo
                    linhasTabela={distribuicao.pontos.map((ponto) => ({ rotulo: ponto.rotulo, valor: formatarInteiro(ponto.contagem) }))}
                  >
                    {(expandido) => (
                      <GraficoBarras
                        orientacao="horizontal"
                        cor={COR_MAGNITUDE_CONTAGEM}
                        formatarValor={formatarInteiro}
                        alturaBarra={expandido ? "expandido" : "padrao"}
                        numerado
                        destacarPrimeiro
                        pontos={topMunicipios.map((ponto) => ({
                          rotulo: ponto.rotulo,
                          valor: ponto.contagem,
                          filtravel: !ehBucketSintetico(ponto.rotulo),
                          subvalor:
                            ponto.valor !== null && totalValorMunicipios > 0
                              ? `${formatarMoedaOuTraco(ponto.valor)} · ${FORMATADOR_PERCENTUAL.format((ponto.valor / totalValorMunicipios) * 100)}%`
                              : undefined,
                        }))}
                        aoClicarPonto={(indice) => {
                          const ponto = topMunicipios[indice];
                          aoSelecionarPonto({
                            dimensao: "municipio",
                            rotulo: ponto.rotulo,
                            contagem: ponto.contagem,
                            valor: ponto.valor,
                            filtro: { municipio: ponto.rotulo },
                          });
                        }}
                      />
                    )}
                  </CartaoGrafico>
                </div>
              );
            }}
          />

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[11fr_9fr]">
          <SecaoGrafico
            estado={distribuicaoDocOrigem}
            renderizar={(distribuicao) => {
              // Mesmo caso de `transporte` acima: `doc_origem` não é campo de
              // filtro em `FiltrosDiaria` — só leitura, sem clique-refina.
              const topUnidades = distribuicao.pontos.slice(0, TOPO_RANKING);
              return (
                <CartaoGrafico
                  titulo="Unidade solicitante (documento de origem)"
                  somenteLeitura={somenteLeitura}
                  enfase="sutil"
                  rotuloColunaValor="Diárias"
                  vazio={distribuicao.pontos.length === 0}
                  linhasTabela={distribuicao.pontos.map((ponto) => ({ rotulo: ponto.rotulo, valor: formatarInteiro(ponto.contagem) }))}
                >
                  {(expandido) => (
                    <GraficoBarras
                      orientacao="horizontal"
                      cor={COR_MAGNITUDE_CONTAGEM}
                      formatarValor={formatarInteiro}
                      alturaBarra={expandido ? "expandido" : "padrao"}
                      pontos={topUnidades.map((ponto) => ({ rotulo: ponto.rotulo, valor: ponto.contagem, filtravel: false }))}
                    />
                  )}
                </CartaoGrafico>
              );
            }}
          />

          <SecaoGrafico
            estado={distribuicaoOrigemDestino}
            renderizar={(distribuicao) => {
              const topPares = distribuicao.pontos.slice(0, TOPO_RANKING);
              return (
                <CartaoGrafico
                  titulo="Origem × Destino"
                  somenteLeitura={somenteLeitura}
                  enfase="sutil"
                  rotuloColunaValor="Diárias"
                  vazio={distribuicao.pontos.length === 0}
                  interativo
                  linhasTabela={distribuicao.pontos.map((ponto) => ({ rotulo: ponto.rotulo, valor: formatarInteiro(ponto.contagem) }))}
                >
                  {(expandido) => (
                    <GraficoBarras
                      orientacao="horizontal"
                      cor={COR_MAGNITUDE_CONTAGEM}
                      formatarValor={formatarInteiro}
                      alturaBarra={expandido ? "expandido" : "padrao"}
                      pontos={topPares.map((ponto) => ({
                        rotulo: ponto.rotulo,
                        valor: ponto.contagem,
                        filtravel: !ehParOrigemDestinoSintetico(ponto.rotulo),
                      }))}
                      aoClicarPonto={(indice) => {
                        const ponto = topPares[indice];
                        const [origem, destino] = ponto.rotulo.split(" → ");
                        aoSelecionarPonto({
                          dimensao: "origem_destino",
                          rotulo: ponto.rotulo,
                          contagem: ponto.contagem,
                          valor: ponto.valor,
                          filtro: { origem, destino },
                        });
                      }}
                    />
                  )}
                </CartaoGrafico>
              );
            }}
          />
          </div>
        </div>
      </div>
    </div>
  );
}
