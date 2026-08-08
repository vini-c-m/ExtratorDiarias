import { useEffect, useMemo, useState } from "react";
import { obterIndicadores } from "../../../services/api";
import { mensagemAmigavel } from "../../../lib/mensagens";
import { formatarPeriodoBr } from "../../../lib/datas";
import type { CampoDeFiltro } from "../../../hooks/useDiarias";
import type { IndicadoresResposta, ParametrosPesquisaDiariasQuery } from "../../../types/analitica";

export type TipoComparacao = "mes_anterior" | "ano_anterior" | "membros_servidores";

export interface EstadoUseComparacaoExecutiva {
  ativa: boolean;
  tipo: TipoComparacao | null;
  /** Rótulos já resolvidos para exibição — sempre na ordem visual atual
   * (considera `invertida`), quem consome nunca precisa saber qual dos
   * dois é "A" ou "B" internamente. */
  rotuloPrimeiro: string;
  rotuloSegundo: string;
  indicadoresPrimeiro: IndicadoresResposta | null;
  indicadoresSegundo: IndicadoresResposta | null;
  /** Estados de carregamento/erro do lado que depende de uma busca própria
   * (o recorte B) — já reordenados conforme `inverter()`: se invertida,
   * é o "Primeiro" que carrega; `indicadoresA` (do recorte principal)
   * nunca tem seu próprio carregando/erro aqui, porque chega já resolvido
   * do componente pai (`GradeKpisExecutivos` só entra em modo comparação
   * depois que `indicadores` — o A — já existe). */
  carregandoPrimeiro: boolean;
  erroPrimeiro: string | null;
  carregandoSegundo: boolean;
  erroSegundo: string | null;
  /** `filtro` (parcial) do segundo recorte, exposto só para telas que
   * precisam montá-lo (ex.: distribuição comparada) sem duplicar a lógica
   * de derivação de `filtrosB` deste hook. */
  filtrosSegundo: ParametrosPesquisaDiariasQuery | null;
  iniciar: (tipo: TipoComparacao) => void;
  encerrar: () => void;
  inverter: () => void;
  /** Sempre refaz a busca do recorte B — independente de `inverter()`
   * (que só troca a ordem de apresentação, nunca qual lado tem busca
   * própria). */
  tentarNovamenteB: () => void;
}

function paraIso(data: Date): string {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}-${String(data.getDate()).padStart(2, "0")}`;
}

// Mesma definição de "Mês atual"/"Mês anterior" já homologada em
// `FiltrosRapidos.tsx` (duplicada aqui de propósito — presentacional,
// não regra de negócio; nenhuma das duas exporta a outra hoje) — a
// comparação nunca inventa uma janela de tempo nova, reaproveita a mesma
// noção de "mês atual"/"mês anterior" que o usuário já vê no Operacional.
function calcularMesAtual(hoje: Date) {
  return { periodo_inicial: paraIso(new Date(hoje.getFullYear(), hoje.getMonth(), 1)), periodo_final: paraIso(hoje) };
}

function calcularMesAnterior(hoje: Date) {
  return {
    periodo_inicial: paraIso(new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1)),
    periodo_final: paraIso(new Date(hoje.getFullYear(), hoje.getMonth(), 0)),
  };
}

// Mesma janela de "Ano inteiro" já homologada em `FiltrosRapidos.tsx`,
// aplicada ao ano atual e ao ano anterior.
function calcularAnoAtual(hoje: Date) {
  return {
    periodo_inicial: paraIso(new Date(hoje.getFullYear(), 0, 1)),
    periodo_final: paraIso(new Date(hoje.getFullYear(), 11, 31)),
  };
}

function calcularAnoAnterior(hoje: Date) {
  return {
    periodo_inicial: paraIso(new Date(hoje.getFullYear() - 1, 0, 1)),
    periodo_final: paraIso(new Date(hoje.getFullYear() - 1, 11, 31)),
  };
}

function rotuloPeriodo(filtros: ParametrosPesquisaDiariasQuery): string {
  if (filtros.periodo_inicial && filtros.periodo_final) {
    return formatarPeriodoBr(filtros.periodo_inicial, filtros.periodo_final);
  }
  return "Todos os períodos";
}

function rotuloCategoria(categoria: string | null | undefined): string {
  return categoria === "MEMBRO" ? "Membros" : categoria === "SERVIDOR" ? "Servidores" : "Todos";
}

/** Sprint 21.6 (Comparação) — `docs/central-analitica/modo-executivo-
 * plano-tecnico.md § 6/§ 8`. `filtrosA` é sempre `useDiarias.filtros`
 * (nunca substituído por um estado paralelo, decisão 2 da arquitetura
 * funcional): `iniciar()` primeiro aplica o recorte A canônico via
 * `onMudarFiltroA` (mesmo `aplicarFiltro` já usado em toda a Central
 * Analítica — mesmo mecanismo de `FiltrosRapidos`), só depois deriva o
 * recorte B localmente. `filtrosB` preserva todos os demais campos de
 * `filtrosA`, mudando só o(s) campo(s) do tipo de comparação escolhido
 * (decisão 11 de `modo-executivo-arquitetura-funcional.md § 0`). Nunca um
 * endpoint novo — só mais uma chamada a `GET /indicadores`, já existente,
 * para o recorte B. */
export function useComparacaoExecutiva(
  filtrosA: ParametrosPesquisaDiariasQuery,
  indicadoresA: IndicadoresResposta | null,
  onMudarFiltroA: (parcial: Partial<Record<CampoDeFiltro, string | undefined>>) => void,
): EstadoUseComparacaoExecutiva {
  const [tipo, setTipo] = useState<TipoComparacao | null>(null);
  // Sprint 21.6, achado da suíte de testes: `filtrosA` só reflete a
  // categoria que `iniciar()` acabou de aplicar (via `onMudarFiltroA`)
  // depois que o componente pai (dono de `useDiarias.filtros`) re-renderiza
  // — nunca no mesmo instante síncrono de `iniciar()`. Guardar a categoria
  // alvo de A aqui, no momento da escolha, evita que `filtrosB` dependa de
  // esse timing de propagação (React já garante em produção, mas o hook
  // fica correto e testável sem depender dessa garantia).
  const [categoriaAlvoA, setCategoriaAlvoA] = useState<"MEMBRO" | "SERVIDOR" | null>(null);
  const [invertida, setInvertida] = useState(false);
  const [indicadoresB, setIndicadoresB] = useState<IndicadoresResposta | null>(null);
  const [carregandoB, setCarregandoB] = useState(false);
  const [erroB, setErroB] = useState<string | null>(null);
  const [tentativaManual, setTentativaManual] = useState(0);

  const filtrosB = useMemo<ParametrosPesquisaDiariasQuery | null>(() => {
    if (tipo === null) return null;
    const hoje = new Date();
    if (tipo === "mes_anterior") return { ...filtrosA, ...calcularMesAnterior(hoje) };
    if (tipo === "ano_anterior") return { ...filtrosA, ...calcularAnoAnterior(hoje) };
    return { ...filtrosA, categoria_funcional: categoriaAlvoA === "MEMBRO" ? "SERVIDOR" : "MEMBRO" };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo, categoriaAlvoA, JSON.stringify(filtrosA)]);

  useEffect(() => {
    if (filtrosB === null) {
      setIndicadoresB(null);
      setErroB(null);
      setCarregandoB(false);
      return;
    }

    let cancelado = false;
    setCarregandoB(true);
    setErroB(null);
    setIndicadoresB(null);

    (async () => {
      try {
        const resultado = await obterIndicadores(filtrosB);
        if (!cancelado) setIndicadoresB(resultado);
      } catch (erroCaptura) {
        if (!cancelado) {
          setIndicadoresB(null);
          setErroB(mensagemAmigavel(erroCaptura, "Não foi possível carregar a comparação."));
        }
      } finally {
        if (!cancelado) setCarregandoB(false);
      }
    })();

    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(filtrosB), tentativaManual]);

  function iniciar(novoTipo: TipoComparacao) {
    const hoje = new Date();
    if (novoTipo === "mes_anterior") onMudarFiltroA(calcularMesAtual(hoje));
    else if (novoTipo === "ano_anterior") onMudarFiltroA(calcularAnoAtual(hoje));
    else {
      const categoriaA = filtrosA.categoria_funcional === "SERVIDOR" ? "SERVIDOR" : "MEMBRO";
      onMudarFiltroA({ categoria_funcional: categoriaA });
      setCategoriaAlvoA(categoriaA);
    }
    setInvertida(false);
    setTipo(novoTipo);
  }

  function encerrar() {
    setTipo(null);
    setInvertida(false);
    setCategoriaAlvoA(null);
  }

  const rotuloA = tipo === "membros_servidores" ? rotuloCategoria(categoriaAlvoA) : rotuloPeriodo(filtrosA);
  const rotuloB = filtrosB
    ? tipo === "membros_servidores"
      ? rotuloCategoria(filtrosB.categoria_funcional)
      : rotuloPeriodo(filtrosB)
    : "";

  return {
    ativa: tipo !== null,
    tipo,
    rotuloPrimeiro: invertida ? rotuloB : rotuloA,
    rotuloSegundo: invertida ? rotuloA : rotuloB,
    indicadoresPrimeiro: invertida ? indicadoresB : indicadoresA,
    indicadoresSegundo: invertida ? indicadoresA : indicadoresB,
    carregandoPrimeiro: invertida ? carregandoB : false,
    erroPrimeiro: invertida ? erroB : null,
    carregandoSegundo: invertida ? false : carregandoB,
    erroSegundo: invertida ? null : erroB,
    filtrosSegundo: filtrosB,
    iniciar,
    encerrar,
    inverter: () => setInvertida((atual) => !atual),
    tentarNovamenteB: () => setTentativaManual((atual) => atual + 1),
  };
}
