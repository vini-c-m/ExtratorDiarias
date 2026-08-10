import { useState } from "react";
import CabecalhoExecutivo from "./CabecalhoExecutivo";
import GradeGraficosExecutivos from "./GradeGraficosExecutivos";
import GradeKpisExecutivos from "./GradeKpisExecutivos";
import ModoApresentacao from "./ModoApresentacao";
import PainelInsights from "./PainelInsights";
import PainelLateralExecutivo from "./PainelLateralExecutivo";
import type { PontoSelecionadoExecutivo } from "./tiposSelecao";
import { useComparacaoExecutiva } from "./useComparacaoExecutiva";
import { useInsightsExecutivos } from "./useInsightsExecutivos";
import { useModoApresentacao } from "./useModoApresentacao";
import type { CampoDeFiltro } from "../../../hooks/useDiarias";
import { useDistribuicoes } from "../../../hooks/useDistribuicoes";
import { useGerarRelatorio } from "../../../hooks/useGerarRelatorio";
import { mensagemAmigavel } from "../../../lib/mensagens";
import { filtrosParaRelatorio } from "../../../lib/parametrosRelatorio";
import type { IndicadoresResposta, ParametrosPesquisaDiariasQuery } from "../../../types/analitica";
import type { Insight } from "./insightsExecutivos";
import "./modoExecutivo.css";

// Conexão visual Insight ↔ Gráfico (2026-08-07; BI 4.0 adiciona o 2º caso)
// — mapeamento fixo e minúsculo: "concentração de gastos" → cartão
// "Municípios" (`id="grafico-municipio"`), "pico mensal" → hero "Evolução
// de gastos" (`id="grafico-periodo"`), ambos em `GradeGraficosExecutivos`.
// Puramente visual: nunca aplica filtro, nunca busca dado novo.
const GRAFICO_POR_INSIGHT: Record<string, "municipio" | "periodo"> = {
  "concentracao-gastos": "municipio",
  "pico-mensal": "periodo",
};

interface Props {
  filtros: ParametrosPesquisaDiariasQuery;
  indicadores: IndicadoresResposta | null;
  indicadoresCarregando: boolean;
  indicadoresErro: string | null;
  aoTentarNovamenteIndicadores: () => void;
  onMudarFiltro: (parcial: Partial<Record<CampoDeFiltro, string | undefined>>) => void;
  aoVoltar: () => void;
  /** Sprint 21.4 — ações do painel lateral que navegam para fora do Modo
   * Executivo (`v2-arquitetura-funcional.md`-style: `CentralAnalitica.tsx`
   * é quem possui `visualizacao`, nunca duplicado aqui). O painel aplica o
   * filtro do ponto clicado e delega a troca de tela para estes 2
   * callbacks, exatamente como já faz `PainelAcoesRecorte`. */
  aoAbrirRelatorio: () => void;
  /** Correção de regressão (2026-08-07) — `filtro` opcional (título do
   * caso de diagnóstico + rótulo), repassado por `PainelInsights` quando o
   * insight clicado tem um caso específico; `PainelLateralExecutivo` (drill-
   * down por gráfico, não por insight) continua chamando sem argumento. */
  aoAbrirDiagnostico: (filtro?: { titulo: string; rotulo: string }) => void;
}

/** Shell do Modo Executivo (`docs/central-analitica/modo-executivo-
 * arquitetura-funcional.md § 6`, componente 1) — orquestra cabeçalho,
 * grade de KPIs, grade de gráficos, painel de insights, painel lateral
 * contextual e modo apresentação, todos consumindo o mesmo
 * `useDiarias.filtros` já recebido de `CentralAnalitica.tsx` (mesma
 * instância, nenhum estado de filtro paralelo, decisão 2 da arquitetura
 * funcional). `indicadores`/`indicadoresCarregando`/`indicadoresErro`
 * chegam como props — mesmo `useIndicadores(diarias.filtros)` já usado
 * por `DashboardRecorte` (uma única chamada por recorte, nunca duplicada
 * entre os dois modos). As 8 distribuições, a comparação e os insights têm
 * suas próprias instâncias de hook aqui, montadas só quando
 * `visualizacao === "executivo"` — e reaproveitadas tanto pela tela normal
 * quanto pelo Modo apresentação (Sprint 21.8): nenhuma segunda busca dos
 * mesmos dados só porque a apresentação está ativa. BI 4.0 — `useDiagnostico`
 * foi removido daqui (sem consumidor após a célula "Atenção" sair da
 * faixa de KPI); Diagnóstico geral e o drill-down por gráfico
 * (`PainelLateralExecutivo`) têm suas próprias buscas, independentes.
 *
 * `pontoSelecionado` é estado de UI local (qual ponto de gráfico está com
 * o painel lateral aberto) — nunca promovido a `CentralAnalitica.tsx`,
 * nunca confundido com `FiltrosDiaria` (só um filtro é aplicado de fato
 * quando o usuário aciona uma ação dentro do painel, nunca só por clicar
 * no ponto). `PainelLateralExecutivo` só monta quando há uma seleção —
 * suas próprias chamadas de distribuição (`motivo`/`servidor` filtrados)
 * nunca disparam com o painel fechado. */
export default function ModoExecutivo({
  filtros,
  indicadores,
  indicadoresCarregando,
  indicadoresErro,
  aoTentarNovamenteIndicadores,
  onMudarFiltro,
  aoVoltar,
  aoAbrirRelatorio,
  aoAbrirDiagnostico,
}: Props) {
  const distribuicaoPeriodo = useDistribuicoes(filtros, "periodo");
  const distribuicaoMunicipio = useDistribuicoes(filtros, "municipio");
  const distribuicaoMotivo = useDistribuicoes(filtros, "motivo");
  const distribuicaoSituacao = useDistribuicoes(filtros, "situacao");
  const distribuicaoOrigemDestino = useDistribuicoes(filtros, "origem_destino");
  const distribuicaoCategoriaFuncional = useDistribuicoes(filtros, "categoria_funcional");
  const distribuicaoDocOrigem = useDistribuicoes(filtros, "doc_origem");
  const distribuicaoTransporte = useDistribuicoes(filtros, "transporte");
  const comparacao = useComparacaoExecutiva(filtros, indicadores, onMudarFiltro);
  const insights = useInsightsExecutivos(
    filtros,
    indicadores?.valor_total ?? null,
    indicadores?.valor_medio ?? null,
    distribuicaoPeriodo.distribuicao?.pontos ?? [],
    distribuicaoMunicipio.distribuicao?.pontos ?? [],
    distribuicaoCategoriaFuncional.distribuicao?.pontos ?? [],
    distribuicaoDocOrigem.distribuicao?.pontos ?? [],
    distribuicaoMotivo.distribuicao?.pontos ?? [],
    distribuicaoTransporte.distribuicao?.pontos ?? [],
  );
  const apresentacao = useModoApresentacao();
  const { estado: estadoExportacao, gerar: gerarExportacao, tentarNovamente: tentarNovamenteExportacao } = useGerarRelatorio();
  const [erroAoAbrirLocal, setErroAoAbrirLocal] = useState<string | null>(null);

  const [pontoSelecionado, setPontoSelecionado] = useState<PontoSelecionadoExecutivo | null>(null);
  const [insightEmDestaque, setInsightEmDestaque] = useState<string | null>(null);

  function aoClicarInsight(insight: Insight) {
    setInsightEmDestaque(insight.id);
    const alvo = GRAFICO_POR_INSIGHT[insight.id];
    if (alvo) document.getElementById(`grafico-${alvo}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  // Sprint 21.9 — "PDF executivo": mesmo mecanismo de `DashboardRecorte`
  // (`POST /relatorios` via `useGerarRelatorio`, IPC `relatorio:salvar-como`),
  // com `tipo="visao_executiva"` (Sprint 21.9 no backend — as 8 dimensões da
  // grade executiva, nunca reaproveitando nem alterando "detalhado"/
  // "executivo" já homologados) e os textos de `insights.insights` (já
  // calculados por `useInsightsExecutivos`, nenhum cálculo novo aqui) como
  // strings opacas — o backend nunca reinterpreta esse texto, só o imprime.
  function aoClicarExportar() {
    gerarExportacao({
      filtros: filtrosParaRelatorio(filtros),
      tipo: "visao_executiva",
      formato: "pdf",
      incluir_indicadores: true,
      incluir_graficos: true,
      incluir_tabela: false,
      incluir_inconsistencias: false,
      modo: "final",
      insights: insights.insights.map((insight) => insight.texto),
    });
  }

  async function aoClicarAbrirLocal() {
    if (estadoExportacao.fase !== "sucesso") return;
    setErroAoAbrirLocal(null);
    try {
      if (typeof window.api?.abrirArquivo !== "function") {
        throw new Error("Não foi possível abrir a pasta do relatório salvo.");
      }
      await window.api.abrirArquivo(estadoExportacao.resultado.pastaArquivo);
    } catch (erroCaptura) {
      setErroAoAbrirLocal(mensagemAmigavel(erroCaptura, "Não foi possível abrir a pasta do relatório salvo."));
    }
  }

  const exportacao = {
    estado: estadoExportacao,
    aoExportar: aoClicarExportar,
    aoAbrirLocal: aoClicarAbrirLocal,
    aoTentarNovamente: tentarNovamenteExportacao,
    erroAoAbrirLocal,
  };

  const propsKpis = {
    indicadores,
    indicadoresCarregando,
    indicadoresErro,
    aoTentarNovamenteIndicadores,
    distribuicaoCategoriaFuncional,
    comparacao,
    indicadoresPeriodoAnterior: insights.indicadoresPeriodoAnterior,
  };

  // Sprint 21.8 — em apresentação, os gráficos/insights ficam só-leitura:
  // "sem filtros e menus" (pedido original) — clique/ação nunca aplica
  // filtro nem navega para fora da apresentação; a mesma grade continua
  // sendo desenhada (nenhum cálculo novo), só a interatividade é
  // desligada, trocando `onMudarFiltro`/`aoSelecionarPonto`/
  // `aoAbrirDiagnostico` reais por no-ops só nesta árvore.
  const propsGraficos = {
    // BI 4.0 — cabeçalho editorial do hero ("Evolução financeira"): mesmos
    // `indicadores`/`indicadoresPeriodoAnterior` já recebidos/buscados
    // acima (KPI "Valor total" e insight de variação), nenhuma chamada
    // nova. `null` enquanto carrega — `GradeGraficosExecutivos` esconde o
    // cabeçalho editorial nesse caso, sem quebrar o gráfico em si.
    indicadores,
    indicadoresPeriodoAnterior: insights.indicadoresPeriodoAnterior,
    distribuicaoPeriodo,
    distribuicaoMunicipio,
    distribuicaoMotivo,
    distribuicaoSituacao,
    distribuicaoOrigemDestino,
    distribuicaoCategoriaFuncional,
    distribuicaoDocOrigem,
    distribuicaoTransporte,
    aoSelecionarPonto: apresentacao.ativa ? () => {} : setPontoSelecionado,
    onMudarFiltro: apresentacao.ativa ? () => {} : onMudarFiltro,
    graficoEmDestaque: apresentacao.ativa ? null : GRAFICO_POR_INSIGHT[insightEmDestaque ?? ""] ?? null,
    // Redesign BI 3.0 (2026-08-07) — "menos controles administrativos" no
    // Modo Apresentação: esconde ⛶/⋯ de cada `CartaoGrafico` (mesmo
    // critério dos demais campos deste objeto, todos ligados a
    // `apresentacao.ativa`). Deliberadamente NÃO altero `alturaBarra` do
    // hero aqui (`alturaBarra="expandido"` é dimensionado para um modal
    // sozinho na tela — no slide de Apresentação ele dividiria espaço com
    // o resto da grade de gráficos, arriscando desequilibrar a
    // composição/exigir mais scroll; "grande", já usado hoje, mantém a
    // leitura à distância sem competir por altura).
    somenteLeitura: apresentacao.ativa,
  };

  const propsInsights = {
    insights: insights.insights,
    carregando: insights.carregando,
    erro: insights.erro,
    tentarNovamente: insights.tentarNovamente,
    onMudarFiltro: apresentacao.ativa ? () => {} : onMudarFiltro,
    aoAbrirDiagnostico: apresentacao.ativa ? () => {} : aoAbrirDiagnostico,
    insightEmDestaque: apresentacao.ativa ? null : insightEmDestaque,
    aoPassarMouseInsight: apresentacao.ativa ? undefined : setInsightEmDestaque,
    aoClicarInsight: apresentacao.ativa ? undefined : aoClicarInsight,
  };

  if (apresentacao.ativa) {
    return (
      <ModoApresentacao
        secaoAtual={apresentacao.secaoAtual}
        totalSecoes={apresentacao.totalSecoes}
        aoProximaSecao={apresentacao.proximaSecao}
        aoSecaoAnterior={apresentacao.secaoAnterior}
        aoIrParaSecao={apresentacao.irParaSecao}
        aoSair={apresentacao.sair}
        propsKpis={propsKpis}
        propsGraficos={propsGraficos}
        propsInsights={propsInsights}
      />
    );
  }

  return (
    <div className="modo-executivo animate-entrada-painel space-y-5">
      <CabecalhoExecutivo
        filtros={filtros}
        comparacao={comparacao}
        aoEntrarApresentacao={apresentacao.entrar}
        exportacao={exportacao}
      />

      {/* Redesign BI 3.0 (2026-08-07) — a faixa de KPIs sai da grade 2
          colunas e vira largura total, sozinha, logo abaixo do cabeçalho;
          só a partir daqui (Evolução/Distribuições/Territorial) a tela
          vira 2 colunas com o Insights — efeito direto: o painel de
          Insights passa a começar alinhado ao hero, não ao topo da
          página. `2xl:` dá mais respiro à coluna de Insights em telas bem
          grandes; abaixo de `xl:`, `PainelInsights` já se recolhe sozinho
          (ver lá) — nunca esconde o conteúdo, só evita competir por
          espaço vertical com os gráficos em telas menores. */}
      <GradeKpisExecutivos {...propsKpis} />

      <div className="cockpit-executivo grid grid-cols-1 gap-5 min-[960px]:grid-cols-[minmax(0,1fr)_360px] min-[960px]:items-stretch 2xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="conteudo-executivo min-w-0">
          <GradeGraficosExecutivos {...propsGraficos} />
        </div>
        <div className="rail-insights-executivo min-[960px]:sticky min-[960px]:top-4 min-[960px]:self-start">
          <PainelInsights {...propsInsights} />
        </div>
      </div>

      {pontoSelecionado && (
        <PainelLateralExecutivo
          selecao={pontoSelecionado}
          filtrosBase={filtros}
          aoFechar={() => setPontoSelecionado(null)}
          aoAplicarFiltro={onMudarFiltro}
          aoVoltarAoOperacional={aoVoltar}
          aoAbrirRelatorio={aoAbrirRelatorio}
          aoAbrirDiagnostico={aoAbrirDiagnostico}
        />
      )}
    </div>
  );
}
