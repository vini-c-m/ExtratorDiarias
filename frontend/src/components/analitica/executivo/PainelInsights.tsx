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
  destaqueSequencial,
  aoPassarMouseInsight,
  aoClicarInsight,
  acionar,
}: {
  insight: Insight;
  ativo: boolean;
  /** MS — Insights vivos por destaque sequencial: sinal INDEPENDENTE de
   * `ativo` (que é a conexão visual insight↔gráfico, hover/clique em
   * `GradeGraficosExecutivos`, inalterada por esta Sprint) — este vem de
   * `MarketTapeInsights`, é a vez deste item na sequência automática (ou o
   * usuário está com mouse/foco sobre ele). Os dois podem estar ativos ao
   * mesmo tempo, em itens diferentes ou no mesmo item, sem conflito: cada
   * um pinta um detalhe visual distinto (traço à esquerda × cartão/glow). */
  destaqueSequencial: boolean;
  aoPassarMouseInsight?: (id: string | null) => void;
  aoClicarInsight?: (insight: Insight) => void;
  acionar: (insight: Insight) => void;
}) {
  const temGraficoRelacionado = INSIGHTS_COM_GRAFICO_RELACIONADO.has(insight.id) && aoClicarInsight !== undefined;
  const destaque = extrairDestaque(insight.texto);
  const variante = VARIANTE_POR_TIPO[insight.tipo];

  const Conteudo = temGraficoRelacionado ? "button" : "div";

  return (
    <div
      className={`conteudo-insight-market-tape ${ativo ? "insight-item-ativo" : ""} ${destaqueSequencial ? "market-tape-item-spotlight" : ""}`}
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
      {/* MS — Insights vivos por destaque sequencial (item 7): o CTA
          "Aplicar filtro" do insight de concentração territorial (Municípios)
          foi removido — o insight continua informativo e mantém a conexão
          visual com o gráfico (`INSIGHTS_COM_GRAFICO_RELACIONADO`, acima),
          só deixa de oferecer esse atalho de filtro na lateral. `acao` com
          `municipio` nunca renderiza mais o botão; ações de diagnóstico
          ("Abrir diagnóstico") continuam intactas. Cálculo do insight
          (`insightConcentracaoGastos`, `insightsExecutivos.ts`) inalterado —
          `acao.municipio` continua computado, só não é mais lido aqui. */}
      {insight.acao && !("municipio" in insight.acao) && (
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
 * MS — Insights vivos por destaque sequencial (2026-08-10) — os insights
 * ficam FIXOS na lateral (`MarketTapeInsights`, sem scroll/ticker); um por
 * vez "acende" em sequência, sempre de cima para baixo, em loop, como se o
 * usuário tivesse passado o mouse sobre ele. Pausa com hover/foco em
 * qualquer ponto da lista, retoma de onde parou ao sair — nunca reinicia
 * do primeiro item. AJUSTE FINAL (2026-08-10): `prefers-reduced-motion`
 * NUNCA desliga a sequência (nenhuma configuração do Windows precisa
 * mudar para o usuário ver algum destaque) — só reduz a PELE do card ativo
 * a luminância/background/contraste de texto, sem nenhum deslocamento
 * espacial (`modoExecutivo.css`). Independente da conexão insight↔gráfico
 * (`insightEmDestaque`, hover/clique em `GradeGraficosExecutivos`,
 * inalterada por esta Sprint). */
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
          {/* MS FINAL — indicador "ao vivo" discreto (item 11): nunca
              pisca/anima — só o ponto ciano mínimo já permitido pela
              paleta desta faixa (item 12, "pequeno indicador"), texto em
              slate neutro. Fora do `<h3>` de propósito: `ModoApresentacao.
              tsx` (fora do escopo desta Sprint) identifica a seção 2 pelo
              nome acessível deste heading — precisa continuar sendo
              exatamente "Insights". */}
          <div className="mt-1 flex items-center gap-2">
            <h3 className={TIPOGRAFIA.subtitulo}>Insights</h3>
            <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-cyan-400/70" />
              Ao vivo
            </span>
          </div>
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
            renderizar={(insight, destaqueSequencial) => (
              <CartaoInsight
                insight={insight}
                ativo={insightEmDestaque === insight.id}
                destaqueSequencial={destaqueSequencial}
                aoPassarMouseInsight={aoPassarMouseInsight}
                aoClicarInsight={aoClicarInsight}
                acionar={acionar}
              />
            )}
          />
        </div>
      )}
    </div>
  );
}
