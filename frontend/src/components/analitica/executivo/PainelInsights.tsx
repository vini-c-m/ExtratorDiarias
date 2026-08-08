import { useEffect, useState } from "react";
import Alerta from "../../ui/Alerta";
import Botao from "../../ui/Botao";
import type { Insight, TipoInsight } from "./insightsExecutivos";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";
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
const INSIGHTS_COM_GRAFICO_RELACIONADO = new Set(["concentracao-gastos"]);

/** Extrai o primeiro número (percentual, se houver; senão o primeiro
 * inteiro) já presente no texto do insight, só para destaque tipográfico —
 * nunca um cálculo novo, o texto completo continua exibido abaixo, intacto.
 * `null` quando o texto não tem nenhum número (não deveria ocorrer hoje,
 * mas o card degrada bem: mostra só o texto, sem número em destaque). */
function extrairDestaque(texto: string): string | null {
  return texto.match(/[+-]?\d[\d.,]*%/)?.[0] ?? texto.match(/\d[\d.,]*/)?.[0] ?? null;
}

const RESET_BOTAO_MARCADOR = "appearance-none border-0 bg-transparent p-0 cursor-pointer";

/** BI 4.0 — marcador da timeline: decorativo (`<span>`) quando há um único
 * insight (nada para navegar); vira um `<button>` real (foco/teclado
 * nativos) quando há mais de um — a "paginação discreta" pedida para
 * seleção manual do item em destaque na rotação, reaproveitando o mesmo
 * marcador colorido por `tipo` já existente, nunca um segundo controle. */
function PontoInsight({
  tipo,
  ativo,
  numero,
  selecionavel,
  aoSelecionar,
}: {
  tipo: TipoInsight;
  ativo: boolean;
  numero: number;
  selecionavel: boolean;
  aoSelecionar: () => void;
}) {
  const classeBase = `relative z-10 mt-0.5 h-3 w-3 shrink-0 rounded-full ring-4 ring-[#0b1120] transition-[transform,opacity] duration-300 motion-reduce:transition-none ${
    CORES_STATUS[VARIANTE_POR_TIPO[tipo]].ponto
  } ${ativo ? "scale-125 opacity-100" : "scale-90 opacity-50"}`;

  if (!selecionavel) {
    return <span aria-hidden="true" className={classeBase} />;
  }

  return (
    <button
      type="button"
      onClick={aoSelecionar}
      aria-label={`Ir para o insight ${numero}`}
      aria-current={ativo ? "true" : undefined}
      className={`${classeBase} ${RESET_BOTAO_MARCADOR} ${FOCO_ANEL}`}
    />
  );
}

// BI 4.0 — duração do "insight dominante" trocando de lugar (recolhe/
// expande): 450ms, dentro da janela 400-500ms pedida — claramente
// perceptível, sem ser lento. `motion-reduce:transition-none` some com a
// animação (a troca de item continua funcionando, só vira instantânea —
// "versão estática premium", nunca painel quebrado).
const DURACAO_DOMINANTE = "duration-[450ms] ease-out motion-reduce:transition-none";

/** BI 4.0 — cada insight é um nó DOM ESTÁVEL (nunca remonta ao trocar o
 * destaque — só troca de classe): cabeçalho sempre visível (marcador +
 * `tituloCurto`, ex. "PICO MENSAL"); bloco de detalhe (número em
 * destaque + texto completo + ação) recolhido a 0 de altura quando não é
 * o item ativo, expandido com fade + slide-down quando é ("grid-rows"
 * 0fr↔1fr — técnica CSS padrão para animar altura sem medir em JS). Só o
 * item ativo mostra o texto completo — os demais reduzem à legenda curta
 * da timeline (ver mock aprovado pelo usuário: "○ 02 │ Pico mensal"). */
function CartaoInsight({
  insight,
  indice,
  ativo,
  emDestaqueNaRotacao,
  selecionavelNaRotacao,
  aoPassarMouseInsight,
  aoClicarInsight,
  acionar,
  aoSelecionarNaRotacao,
}: {
  insight: Insight;
  indice: number;
  ativo: boolean;
  /** BI 4.0 — item dominante da rotação (independente de `ativo`, que é a
   * conexão visual insight↔gráfico via hover/clique): só este mostra o
   * bloco de detalhe completo (número + texto + ação); os demais ficam
   * reduzidos ao cabeçalho (marcador + `tituloCurto`), nunca escondidos
   * do DOM/leitor de tela — só recolhidos. */
  emDestaqueNaRotacao: boolean;
  /** Só há paginação manual (marcador/cabeçalho viram botão) com mais de
   * 1 insight — com um único item não há para onde navegar. */
  selecionavelNaRotacao: boolean;
  aoPassarMouseInsight?: (id: string | null) => void;
  aoClicarInsight?: (insight: Insight) => void;
  acionar: (insight: Insight) => void;
  aoSelecionarNaRotacao: () => void;
}) {
  const temGraficoRelacionado = INSIGHTS_COM_GRAFICO_RELACIONADO.has(insight.id) && aoClicarInsight !== undefined;
  const destaque = extrairDestaque(insight.texto);
  const variante = VARIANTE_POR_TIPO[insight.tipo];

  const Conteudo = temGraficoRelacionado ? "button" : "div";
  const CabecalhoElemento = selecionavelNaRotacao ? "button" : "div";

  return (
    <li
      className="relative animate-entrada-conteudo pl-7 [animation-fill-mode:backwards]"
      style={{ animationDelay: `${indice * 60}ms` }}
      onMouseEnter={() => aoPassarMouseInsight?.(insight.id)}
      onMouseLeave={() => aoPassarMouseInsight?.(null)}
    >
      <PontoInsight
        tipo={insight.tipo}
        ativo={emDestaqueNaRotacao}
        numero={indice + 1}
        selecionavel={selecionavelNaRotacao}
        aoSelecionar={aoSelecionarNaRotacao}
      />
      <div
        className={`rounded-lg px-3 py-1.5 transition-colors motion-reduce:transition-none ${
          ativo ? `${CORES_STATUS[variante].alerta} border` : "border border-transparent"
        }`}
      >
        <CabecalhoElemento
          {...(selecionavelNaRotacao ? { type: "button", onClick: aoSelecionarNaRotacao } : {})}
          className={`block w-full text-left ${selecionavelNaRotacao ? `rounded ${FOCO_ANEL}` : ""}`}
        >
          <span
            className={`text-xs font-semibold uppercase tracking-wide transition-colors motion-reduce:transition-none ${
              emDestaqueNaRotacao ? "text-slate-100" : "text-slate-500"
            }`}
          >
            {insight.tituloCurto}
          </span>
        </CabecalhoElemento>

        {/* BI 4.0 — bloco de detalhe: 0fr↔1fr anima a altura (sem medir em
            JS); `overflow-hidden` no filho impede vazamento durante a
            transição; opacity+translateY dão o fade/slide pedido. */}
        <div className={`grid transition-[grid-template-rows] ${DURACAO_DOMINANTE} ${emDestaqueNaRotacao ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
          <div className="overflow-hidden">
            <div
              className={`pt-2 transition-[opacity,transform] ${DURACAO_DOMINANTE} ${
                emDestaqueNaRotacao ? "translate-y-0 opacity-100" : "-translate-y-3 opacity-0"
              }`}
            >
              <Conteudo
                {...(temGraficoRelacionado
                  ? { type: "button", onClick: () => aoClicarInsight?.(insight), onFocus: () => aoPassarMouseInsight?.(insight.id) }
                  : {})}
                className={`w-full text-left ${temGraficoRelacionado ? `appearance-none border-0 bg-transparent p-0 ${FOCO_ANEL} rounded` : ""}`}
              >
                {destaque && <div className={`text-3xl font-bold ${CORES_STATUS[variante].texto}`}>{destaque}</div>}
                <p className={`mt-1 ${TIPOGRAFIA.texto}`}>{insight.texto}</p>
              </Conteudo>
              {insight.acao && (
                <div className="mt-2">
                  <Botao variante="secundaria" onClick={() => acionar(insight)}>
                    {insight.acao.rotulo}
                  </Botao>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </li>
  );
}

// BI 4.0 — cadência da rotação editorial: "5–8 segundos" pedido
// explicitamente (nunca um carrossel/ticker acelerado).
const INTERVALO_ROTACAO_MS = 6500;

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

  const [indiceRotacao, setIndiceRotacao] = useState(0);
  const [pausado, setPausado] = useState(false);
  const movimentoReduzido = usePrefersReducedMotion();

  // Chave estável (por conteúdo, não por referência do array — que muda a
  // cada cálculo de `useInsightsExecutivos`): só reinicia a rotação quando
  // o CONJUNTO de insights realmente muda (novo recorte), nunca a cada
  // re-render do componente pai.
  const chaveInsights = insights.map((insight) => insight.id).join("|");

  useEffect(() => {
    setIndiceRotacao(0);
  }, [chaveInsights]);

  useEffect(() => {
    if (movimentoReduzido || pausado || insights.length <= 1) return;
    const idIntervalo = setInterval(() => {
      setIndiceRotacao((atual) => (atual + 1) % insights.length);
    }, INTERVALO_ROTACAO_MS);
    return () => clearInterval(idIntervalo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movimentoReduzido, pausado, insights.length, chaveInsights]);

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
    <div
      className={`p-5 ${SUPERFICIE_INSIGHTS}`}
      onMouseEnter={() => setPausado(true)}
      onMouseLeave={() => setPausado(false)}
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className={TIPOGRAFIA.subtitulo}>Insights</h3>
        <button
          type="button"
          onClick={() => setColapsado((atual) => !atual)}
          className={`rounded xl:hidden ${TIPOGRAFIA.textoAuxiliar} ${FOCO_ANEL} hover:text-slate-300`}
        >
          {colapsado ? `Ver (${insights.length})` : "Ocultar"}
        </button>
      </div>
      <ul className={`${colapsado ? "hidden" : "block"} mt-4 space-y-2.5 border-l border-white/10 xl:!block`}>
        {insights.map((insight, indice) => (
          <CartaoInsight
            key={insight.id}
            insight={insight}
            indice={indice}
            ativo={insightEmDestaque === insight.id}
            emDestaqueNaRotacao={indice === indiceRotacao}
            selecionavelNaRotacao={insights.length > 1}
            aoPassarMouseInsight={aoPassarMouseInsight}
            aoClicarInsight={aoClicarInsight}
            acionar={acionar}
            aoSelecionarNaRotacao={() => setIndiceRotacao(indice)}
          />
        ))}
      </ul>
    </div>
  );
}
