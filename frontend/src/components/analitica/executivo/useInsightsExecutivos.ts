import { useEffect, useState } from "react";
import { calcularInsightsExecutivos, type Insight } from "./insightsExecutivos";
import { obterIndicadores } from "../../../services/api";
import { mensagemAmigavel } from "../../../lib/mensagens";
import { formatarPeriodoBr } from "../../../lib/datas";
import type {
  IndicadoresResposta,
  ParametrosPesquisaDiariasQuery,
  PontoDistribuicaoResposta,
} from "../../../types/analitica";

export interface EstadoUseInsightsExecutivos {
  insights: Insight[];
  carregando: boolean;
  erro: string | null;
  tentarNovamente: () => void;
  /** Refinamento visual do Modo Executivo (2026-08-07) — os indicadores
   * completos do "período anterior", já buscados para o insight de
   * variação (ver `insightVariacaoPeriodo`); reaproveitados por
   * `GradeKpisExecutivos` para mostrar delta nos 4 KPIs centrais, sem
   * nenhuma chamada de rede adicional. `null` nas mesmas condições em que
   * o insight de variação também fica ausente. */
  indicadoresPeriodoAnterior: IndicadoresResposta | null;
}

/** `YYYY-MM-DD` local (nunca `toISOString`, mesma disciplina de fuso
 * horário de `FiltrosRapidos.tsx`/`useComparacaoExecutiva.ts`). */
function paraIso(data: Date): string {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}-${String(data.getDate()).padStart(2, "0")}`;
}

function paraData(dataIso: string): Date {
  const [ano, mes, dia] = dataIso.split("-").map(Number);
  return new Date(ano, mes - 1, dia);
}

function somarDias(data: Date, dias: number): Date {
  const copia = new Date(data);
  copia.setDate(copia.getDate() + dias);
  return copia;
}

/** "Período anterior" para o insight de variação (Sprint 21.5) — sempre a
 * mesma DURAÇÃO do recorte atual (em dias), imediatamente antes, nunca um
 * "mês anterior" fixo (que seria uma suposição não fundamentada para um
 * recorte de duração arbitrária, ex. 6 semanas). `null` quando o recorte
 * não tem os dois limites de período definidos — sem base para calcular
 * "anterior" a partir de "Todos os períodos". */
function calcularPeriodoAnterior(
  periodoInicial: string,
  periodoFinal: string,
): { periodo_inicial: string; periodo_final: string } {
  const inicio = paraData(periodoInicial);
  const fim = paraData(periodoFinal);
  const duracaoDias = Math.round((fim.getTime() - inicio.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  const novoFim = somarDias(inicio, -1);
  const novoInicio = somarDias(novoFim, -(duracaoDias - 1));
  return { periodo_inicial: paraIso(novoInicio), periodo_final: paraIso(novoFim) };
}

/** Sprint 21.5 (Insights determinísticos) — orquestra a única chamada de
 * rede própria deste bloco (indicadores do período anterior, só quando o
 * recorte já tem período definido) e delega toda a decisão de texto para
 * `calcularInsightsExecutivos` (módulo puro, sem I/O). `pontosPeriodo`/
 * `pontosMunicipio`/`pontosCategoriaFuncional`/`pontosDocOrigem` chegam como
 * parâmetros — já carregados por `ModoExecutivo` (mesmas instâncias de
 * `useDistribuicoes` que alimentam a grade de gráficos, nunca uma segunda
 * busca dos mesmos dados — BI 4.0). */
export function useInsightsExecutivos(
  filtros: ParametrosPesquisaDiariasQuery,
  valorTotalAtual: number | null,
  valorMedioAtual: number | null,
  pontosPeriodo: PontoDistribuicaoResposta[],
  pontosMunicipio: PontoDistribuicaoResposta[],
  pontosCategoriaFuncional: PontoDistribuicaoResposta[],
  pontosDocOrigem: PontoDistribuicaoResposta[],
): EstadoUseInsightsExecutivos {
  const [indicadoresPeriodoAnterior, setIndicadoresPeriodoAnterior] = useState<IndicadoresResposta | null>(
    null,
  );
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [tentativaManual, setTentativaManual] = useState(0);

  const periodoInicial = filtros.periodo_inicial ?? null;
  const periodoFinal = filtros.periodo_final ?? null;
  const temPeriodo = periodoInicial !== null && periodoFinal !== null;
  const periodoAnterior = temPeriodo ? calcularPeriodoAnterior(periodoInicial as string, periodoFinal as string) : null;
  const rotuloPeriodoAnterior = periodoAnterior
    ? formatarPeriodoBr(periodoAnterior.periodo_inicial, periodoAnterior.periodo_final)
    : null;

  useEffect(() => {
    if (periodoAnterior === null) {
      setIndicadoresPeriodoAnterior(null);
      setErro(null);
      setCarregando(false);
      return;
    }

    let cancelado = false;
    setCarregando(true);
    setErro(null);

    (async () => {
      try {
        const resultado = await obterIndicadores({ ...filtros, ...periodoAnterior });
        if (!cancelado) setIndicadoresPeriodoAnterior(resultado);
      } catch (erroCaptura) {
        if (!cancelado) {
          setIndicadoresPeriodoAnterior(null);
          setErro(mensagemAmigavel(erroCaptura, "Não foi possível calcular os insights."));
        }
      } finally {
        if (!cancelado) setCarregando(false);
      }
    })();

    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(periodoAnterior), tentativaManual]);

  const insights = calcularInsightsExecutivos({
    valorTotalAtual,
    valorTotalPeriodoAnterior: indicadoresPeriodoAnterior?.valor_total ?? null,
    valorMedioAtual,
    valorMedioPeriodoAnterior: indicadoresPeriodoAnterior?.valor_medio ?? null,
    rotuloPeriodoAnterior,
    pontosPeriodo,
    pontosMunicipio,
    pontosCategoriaFuncional,
    pontosDocOrigem,
  });

  return {
    insights,
    carregando,
    erro,
    tentarNovamente: () => setTentativaManual((atual) => atual + 1),
    indicadoresPeriodoAnterior,
  };
}
