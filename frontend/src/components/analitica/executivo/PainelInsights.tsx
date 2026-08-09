import { useEffect, useState } from "react";
import Alerta from "../../ui/Alerta";
import Botao from "../../ui/Botao";
import type { Insight, TipoInsight } from "./insightsExecutivos";
import MarketTapeInsights from "./MarketTapeInsights";
import type { CampoDeFiltro } from "../../../hooks/useDiarias";
import { CORES_STATUS } from "../../../theme/cores";
import { FOCO_ANEL } from "../../../theme/estilos";
import { TIPOGRAFIA } from "../../../theme/tipografia";

// Redesign BI 3.0 (2026-08-07) — "menos caixa fechada": mesma família
// visual de `SUPERFICIE_BASE`, sem borda/sombra própria — o painel lê como
// parte do dashboard (fundo sutil, cantos arredondados), não como um
// sidebar de configurações à parte. Erro/carregando/pronto usam a mesma
// superfície, para nunca "piscar" uma moldura diferente entre estados.
const SUPERFICIE_INSIGHTS = "rounded-card bg-white/[0.03] backdrop-blur-sm";

interface Props {
  insights: Insight[];
  carregando: boolean;
  erro: string | null;
  tentarNovamente: () => void;
  onMudarFiltro: (parcial: Partial<Record<CampoDeFiltro, string | undefined>>) => void;
  /** Correção de regressão (2026-08-07) — quando o insight carrega
   * `filtroDiagnostico`, é repassado aqui: abre o Diagnóstico já filtrado
   * só para aquele caso, nunca a lista inteira do recorte. */
  aoAbrirDiagnostico: (filtro?: { titulo: string; rotulo: string }) => void;
  /** Refinamento visual do Modo Executivo (2026-08-07) — conexão visual
   * Insight ↔ Gráfico (nenhum cálculo/filtro/fetch novo, só realce): id do
   * insight em destaque (hover ou clique), e os dois gatilhos que o
   * definem. Opcionais — omitidos em contextos sem gráfico ao lado (ex.:
   * Modo Apresentação), onde a conexão não faz sentido. */
  insightEmDestaque?: string | null;
  aoPassarMouseInsight?: (id: string | null) => void;
  aoClicarInsight?: (insight: Insight) => void;
}

// Sprint 21.5 — RN-08 aplicada aos insights: `atencao` usa âmbar
// (`CORES_STATUS.aviso`), nunca vermelho ("erro" é reservado a falha
// técnica real, jamais a um sinal de negócio, por mais desfavorável que
// seja). `neutro`/`positivo` usam tons discretos, sem alarme visual.
const VARIANTE_POR_TIPO: Record<TipoInsight, "aviso" | "info" | "sucesso"> = {
  atencao: "aviso",
  neutro: "info",
  positivo: "sucesso",
};

// Refinamento visual (2026-08-07) — só os insights com um destino visual
// real ganham a interação de destaque de gráfico (RN "versão simples e
// puramente visual", sem inventar mapeamento para gráficos que não
// existem). Hoje só "concentração de gastos" aponta para o cartão
// "Municípios" de `GradeGraficosExecutivos` (mesmo `id="grafico-municipio"`
// usado lá para o scroll).
const INSIGHTS_COM_GRAFICO_RELACIONADO = new Set(["concentracao-gastos", "pico-mensal"]);

/** Extrai o primeiro número (percentual, se houver; senão o primeiro
 * inteiro) já presente no texto do insight, só para destaque tipográfico —
 * nunca um cálculo novo, o texto completo continua exibido abaixo, intacto.
 * `null` quando o texto não tem nenhum número (não deveria ocorrer hoje,
 * mas o card degrada bem: mostra só o texto, sem número em destaque). */
function extrairDestaque(texto: string): string | null {
  return texto.match(/[+-]?\d[\d.,]*%/)?.[0] ?? texto.match(/R\$\s*\d[\d.,]*/)?.[0] ?? texto.match(/\d[\d.,]*/)?.[0] ?? null;
}

function useViewportLargo(): boolean {
  const consultar = () => typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(min-width: 960px)").matches
    : true;
  const [largo, setLargo] = useState(consultar);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const consulta = window.matchMedia("(min-width: 960px)");
    const atualizar = () => setLargo(consulta.matches);
    atualizar();
    consulta.addEventListener("change", atualizar);
    return () => consulta.removeEventListener("change", atualizar);
  }, []);

  return largo;
}

/** MS2 (Redesign dos Insights, 2026-08-09) — "financial intelligence rail":
 * rótulo (`tituloCurto`) / valor (número extraído) / contexto
 * (`insight.texto`) — nenhum card, nenhuma moldura, nenhuma animação de
 * altura própria (a antiga "rotação" que justificava isso foi removida
 * junto com o carrossel antigo; este componente só era chamado com o
 * detalhe sempre expandido, então a complexidade de recolher/expandir
 * nunca fazia nada visível — removida aqui). `ativo` (conexão visual
 * insight↔gráfico, hover/clique em `GradeGraficosExecutivos`) vira um
 * traço ciano de 2px à esquerda — o único acento de cor deste cartão,
 * nunca uma pílula preenchida. Cor semântica por `tipo` (`CORES_STATUS`)
 * fica só no rótulo pequeno, nunca no valor — números são sempre
 * off-white (ver `.insight-destaque` em `modoExecutivo.css`). */
function CartaoInsight({
  insight,
  ativo,
  aoPassarMouseInsight,
  aoClicarInsight,
  acionar,
  copiaVisual = false,
}: {
  insight: Insight;
  ativo: boolean;
  aoPassarMouseInsight?: (id: string | null) => void;
  aoClicarInsight?: (insight: Insight) => void;
  acionar: (insight: Insight) => void;
  copiaVisual?: boolean;
}) {
  const temGraficoRelacionado = INSIGHTS_COM_GRAFICO_RELACIONADO.has(insight.id) && aoClicarInsight !== undefined;
  const destaque = extrairDestaque(insight.texto);
  const variante = VARIANTE_POR_TIPO[insight.tipo];

  const Conteudo = temGraficoRelacionado ? "button" : "div";

  return (
    <div
      className={`conteudo-insight-market-tape ${ativo ? "insight-item-ativo" : ""}`}
      onMouseEnter={() => aoPassarMouseInsight?.(insight.id)}
      onMouseLeave={() => aoPassarMouseInsight?.(null)}
    >
      <span className={`insight-titulo ${CORES_STATUS[variante].texto}`}>{insight.tituloCurto}</span>
      <Conteudo
        {...(temGraficoRelacionado
          ? { type: "button", onClick: () => aoClicarInsight?.(insight), onFocus: () => aoPassarMouseInsight?.(insight.id) }
          : {})}
        className={`block w-full text-left ${temGraficoRelacionado ? `appearance-none border-0 bg-transparent p-0 ${FOCO_ANEL} rounded` : ""}`}
      >
        {destaque && <div className="insight-destaque">{destaque}</div>}
        <p className="insight-contexto">{insight.texto}</p>
      </Conteudo>
      {insight.acao && !copiaVisual && (
        <div className="mt-2.5">
          <Botao variante="secundaria" onClick={() => acionar(insight)}>
            {insight.acao.rotulo}
          </Botao>
        </div>
      )}
    </div>
  );
}

/** Painel de insights automáticos (`docs/central-analitica/modo-executivo-
 * arquitetura-funcional.md § 6`, componente 7; Sprint 21.5) — cada linha já
 * vem pronta de `useInsightsExecutivos`/`insightsExecutivos.ts` (fórmulas
 * fixas, nunca geradas aqui); este componente só apresenta. Vazio
 * (`insights.length === 0`) não é um erro — é o recorte não ter nada a
 * destacar, estado normal, sem alerta nenhum.
 *
 * BI 4.0 (2026-08-08) — "Insights em movimento": timeline executiva com UM
 * insight dominante por vez (a cada `INTERVALO_ROTACAO_MS`, o item ativo
 * recolhe e o próximo expande — fade + slide de ~12px, `CartaoInsight`
 * acima; claramente perceptível, nunca um "fade de 2px"). Pausa no hover
 * do painel, retoma ao sair; marcador/cabeçalho de cada item viram
 * paginação manual clicável quando há mais de 1 insight; teclado continua
 * acessível (marcador é `<button>` real). `prefers-reduced-motion` desliga
 * o avanço automático E a transição em si (troca fica instantânea) — sem
 * remover a função: o item dominante continua trocável manualmente,
 * "versão estática premium", nunca um painel morto. Nunca um carrossel
 * horizontal/ticker. Independente da conexão insight↔gráfico
 * (`insightEmDestaque`, hover/clique, inalterada por esta Sprint). */
export default function PainelInsights({
  insights,
  carregando,
  erro,
  tentarNovamente,
  onMudarFiltro,
  aoAbrirDiagnostico,
  insightEmDestaque = null,
  aoPassarMouseInsight,
  aoClicarInsight,
}: Props) {
  // Redesign BI 3.0 (2026-08-07) — abaixo de `xl:` (1280px), o painel vira
  // seção recolhível (economiza espaço vertical numa tela onde ele empilha
  // por cima dos gráficos, não mais ao lado); em `xl:` e acima, `xl:!block`
  // força o conteúdo sempre visível independente deste estado — nunca
  // esconde nada em telas grandes, só evita competir por espaço em telas
  // menores. Estado local simples (sem biblioteca nova); default recolhido
  // (o usuário expande quando quiser, mesma leitura de "seção
  // secundária" das telas pequenas).
  const [colapsado, setColapsado] = useState(true);
  const viewportLargo = useViewportLargo();
  const tapeVisivel = viewportLargo || !colapsado;

  if (erro !== null) {
    return (
      <div className={`p-5 ${SUPERFICIE_INSIGHTS}`}>
        <div className="flex items-center justify-between gap-4">
          <Alerta variante="erro">{erro}</Alerta>
          <Botao variante="secundaria" onClick={tentarNovamente}>
            Tentar novamente
          </Botao>
        </div>
      </div>
    );
  }

  if (carregando) {
    return (
      <div role="status" className={`flex items-center justify-center p-8 ${SUPERFICIE_INSIGHTS}`}>
        <p className={TIPOGRAFIA.textoAuxiliar}>Calculando insights...</p>
      </div>
    );
  }

  if (insights.length === 0) return null;

  function acionar(insight: Insight) {
    if (!insight.acao) return;
    if ("abrirDiagnostico" in insight.acao) {
      aoAbrirDiagnostico(insight.acao.filtroDiagnostico);
    } else {
      onMudarFiltro({ municipio: insight.acao.municipio });
    }
  }

  return (
    <div className={`painel-insights-executivos p-5 ${SUPERFICIE_INSIGHTS}`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className={TIPOGRAFIA.eyebrow}>Leitura gerencial</div>
          <h3 className={`mt-1 ${TIPOGRAFIA.subtitulo}`}>Insights</h3>
        </div>
        <button
          type="button"
          onClick={() => setColapsado((atual) => !atual)}
          className={`rounded min-[960px]:hidden ${TIPOGRAFIA.textoAuxiliar} ${FOCO_ANEL} hover:text-slate-300`}
        >
          {colapsado ? `Ver (${insights.length})` : "Ocultar"}
        </button>
      </div>
      {tapeVisivel && (
        <div className="mt-3">
          <MarketTapeInsights
            itens={insights}
            chave={(insight) => insight.id}
            renderizar={(insight, copiaVisual) => (
              <CartaoInsight
                insight={insight}
                ativo={!copiaVisual && insightEmDestaque === insight.id}
                aoPassarMouseInsight={copiaVisual ? undefined : aoPassarMouseInsight}
                aoClicarInsight={copiaVisual ? undefined : aoClicarInsight}
                acionar={copiaVisual ? () => {} : acionar}
                copiaVisual={copiaVisual}
              />
            )}
          />
        </div>
      )}
    </div>
  );
}
