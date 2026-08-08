import { FOCO_ANEL } from "../../../theme/estilos";

export interface PontoBarra {
  rotulo: string;
  valor: number;
  /** Sprint 19.6.5 — `false` para buckets sintéticos ("Servidor sem
   * cadastro", "Sem destino informado"...) que não representam um valor real
   * filtrável — a barra continua visível (nunca escondida), só deixa de ser
   * clicável. `undefined`/ausente equivale a `true`. */
  filtravel?: boolean;
  /** BI 4.0 — texto pequeno opcional abaixo do rótulo (só orientação
   * horizontal), ex. "R$ 42.720,00 · 24,8%" — sempre calculado por quem
   * chama a partir de dado já recebido (nenhum cálculo/fetch novo aqui,
   * mesmo critério de `subtitulo` em `CartaoGrafico`). Usado hoje só pelo
   * ranking "Municípios" de `GradeGraficosExecutivos`. */
  subvalor?: string;
}

interface Props {
  pontos: PontoBarra[];
  orientacao: "vertical" | "horizontal";
  /** Cor única — todo `GraficoBarras` é uma série única (magnitude), nunca
   * uma cor por barra: a identidade de cada barra é o rótulo (nome/mês), não
   * a cor (`v2-arquitetura-funcional.md` § 6.2 — rankings/série temporal,
   * nunca categoria). */
  cor: string;
  formatarValor: (valor: number) => string;
  /** Sprint 19.6.5 — clique refina o recorte (`v2-arquitetura-funcional.md`
   * § 6.3). Quando presente, cada barra `filtravel` vira um `<button>` real
   * (foco/teclado nativos, sem reimplementar `onKeyDown`) — e por isso
   * `CartaoGrafico` deixa de escondê-la de leitor de tela (`interativo`,
   * ver lá): o botão já é seu próprio equivalente acessível, com
   * `aria-label` descrevendo rótulo e valor. Ausente = gráfico só leitura
   * (mesmo comportamento da Sprint 19.6.4). */
  aoClicarPonto?: (indice: number) => void;
  /** Refinamento visual do Modo Executivo (2026-08-07) — "grande" é usado
   * pelo gráfico hero (mais espaço, melhor leitura); default "padrao"
   * preserva a altura já homologada em todo o resto do app. Correção UX
   * (2026-08-07) — "expandido" é só para o modo de análise em tela cheia
   * (`ModalExpandirGrafico`, via `CartaoGrafico.children(expandido)`):
   * puramente apresentacional (altura de barra vertical, largura de
   * rótulo/valor no horizontal, quantos rótulos verticais cabem) — nunca
   * muda quantos pontos/barras existem. Na orientação vertical, só a área
   * de barras cresce — as linhas fixas de valor/rótulo acima/abaixo não
   * mudam, então os offsets de overlay de `GraficoEvolucaoComZoom`
   * (calibrados a essas linhas, não à altura da barra) continuam corretos
   * nos três tamanhos. */
  alturaBarra?: "padrao" | "grande" | "expandido";
  /** Redesign BI 3.0 (2026-08-07) — "ranking premium": só orientação
   * horizontal. `numerado` prefixa cada linha com a posição (1, 2, 3...);
   * `destacarPrimeiro` dá um realce discreto (numeral e rótulo mais
   * fortes) só à primeira linha. Puramente apresentacional — a ORDEM já
   * vem pronta de `pontos` (decidida por quem chama, nunca recalculada
   * aqui); nenhum dos dois reordena nem filtra nada. Hoje só usados em
   * "Municípios" (`GradeGraficosExecutivos`). */
  numerado?: boolean;
  destacarPrimeiro?: boolean;
}

const ALTURA_AREA_BARRA_VERTICAL: Record<"padrao" | "grande" | "expandido", string> = {
  padrao: "h-32", // 128px, altura já homologada
  grande: "h-56", // 224px
  expandido: "h-[52vh]", // modo de análise em tela cheia — relativo ao viewport, não um px fixo
};
// Correção UX (2026-08-07) — no horizontal, "expandido" dá mais espaço para
// rótulos/valores longos (nomes de município, unidade solicitante) em vez
// de continuar truncando na mesma largura fixa de sempre.
const LARGURA_ROTULO_HORIZONTAL: Record<"padrao" | "grande" | "expandido", string> = {
  padrao: "w-28",
  grande: "w-28",
  expandido: "w-56",
};
const LARGURA_VALOR_HORIZONTAL: Record<"padrao" | "grande" | "expandido", string> = {
  padrao: "w-20",
  grande: "w-20",
  expandido: "w-28",
};
const LARGURA_MINIMA_VISIVEL = 2; // % — barra com valor > 0 nunca fica visualmente "zero"

const RESET_BOTAO = "appearance-none border-0 bg-transparent p-0 text-left cursor-pointer";

/** Sprint 19.6.4 — barras em HTML/CSS (não SVG): `rounded-t`/`rounded-r` do
 * Tailwind já produzem exatamente a especificação de mark "4px arredondado
 * na ponta que cresce, quadrado na base" sem precisar desenhar um path SVG
 * à mão, e texto HTML trunca com `truncate`/`title` de graça — SVG `<text>`
 * não trunca nativamente, o que importava aqui porque nomes de servidor e
 * pares "Origem → Destino" podem ser longos. */
export default function GraficoBarras({
  pontos,
  orientacao,
  cor,
  formatarValor,
  aoClicarPonto,
  alturaBarra = "padrao",
  numerado = false,
  destacarPrimeiro = false,
}: Props) {
  if (pontos.length === 0) return null;

  const maximo = Math.max(...pontos.map((ponto) => ponto.valor), 0);
  const indiceMaximo = pontos.findIndex((ponto) => ponto.valor === maximo);
  // Correção de regressão (2026-08-07) — com muitos pontos (série temporal
  // longa), mostrar o rótulo de TODOS os pontos nunca cabe de forma
  // legível; afina para no máximo ~12 rótulos visíveis (~24 no modo
  // expandido, correção UX 2026-08-07 — mais largura disponível cabe mais
  // rótulo, só apresentação), sempre incluindo o último. Nunca esconde a
  // BARRA/dado em si — só o texto do rótulo, e o tooltip
  // (`GraficoEvolucaoComZoom`)/tabela equivalente continuam dando acesso a
  // cada ponto individualmente.
  const maximoRotulosVisiveis = alturaBarra === "expandido" ? 24 : 12;
  const intervaloRotulo = Math.max(1, Math.ceil(pontos.length / maximoRotulosVisiveis));

  function percentual(valor: number): number {
    if (maximo <= 0) return 0;
    const bruto = (valor / maximo) * 100;
    return valor > 0 ? Math.max(bruto, LARGURA_MINIMA_VISIVEL) : 0;
  }

  if (orientacao === "horizontal") {
    return (
      <div className="space-y-2">
        {pontos.map((ponto, indice) => {
          const clicavel = aoClicarPonto !== undefined && ponto.filtravel !== false;
          const Elemento = clicavel ? "button" : "div";
          const primeiroColocado = destacarPrimeiro && indice === 0;
          return (
            <Elemento
              key={ponto.rotulo}
              {...(clicavel
                ? {
                    type: "button",
                    onClick: () => aoClicarPonto(indice),
                    "aria-label": `Filtrar por ${ponto.rotulo}: ${formatarValor(ponto.valor)}`,
                  }
                : {})}
              className={`flex w-full items-center gap-2 rounded ${clicavel ? `${RESET_BOTAO} ${FOCO_ANEL} hover:bg-white/5` : ""}`}
            >
              {numerado && (
                <span
                  aria-hidden="true"
                  className={`w-4 shrink-0 text-right text-[10px] font-semibold tabular-nums ${
                    primeiroColocado ? "text-cyan-400" : "text-slate-500"
                  }`}
                >
                  {indice + 1}
                </span>
              )}
              <span className={`${LARGURA_ROTULO_HORIZONTAL[alturaBarra]} shrink-0`}>
                <span
                  className={`block truncate text-xs ${primeiroColocado ? "font-semibold text-slate-200" : "text-slate-400"}`}
                  title={ponto.rotulo}
                >
                  {ponto.rotulo}
                </span>
                {ponto.subvalor && <span className="block truncate text-[10px] text-slate-500">{ponto.subvalor}</span>}
              </span>
              <div className="h-4 min-w-0 flex-1">
                <div
                  className="h-full rounded-r transition-[width] duration-500 ease-out motion-reduce:transition-none"
                  style={{ width: `${percentual(ponto.valor)}%`, backgroundColor: cor, opacity: primeiroColocado ? 1 : 0.85 }}
                />
              </div>
              <span
                className={`${LARGURA_VALOR_HORIZONTAL[alturaBarra]} shrink-0 text-right text-xs ${
                  primeiroColocado ? "font-semibold text-slate-200" : "font-medium text-slate-300"
                }`}
              >
                {formatarValor(ponto.valor)}
              </span>
            </Elemento>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex items-end gap-1.5">
      {pontos.map((ponto, indice) => {
        const clicavel = aoClicarPonto !== undefined && ponto.filtravel !== false;
        const Elemento = clicavel ? "button" : "div";
        return (
          <Elemento
            key={ponto.rotulo}
            {...(clicavel
              ? {
                  type: "button",
                  onClick: () => aoClicarPonto(indice),
                  "aria-label": `Filtrar por ${ponto.rotulo}: ${formatarValor(ponto.valor)}`,
                }
              : {})}
            className={`flex min-w-0 flex-1 flex-col items-center rounded ${clicavel ? `${RESET_BOTAO} ${FOCO_ANEL} hover:bg-white/5` : ""}`}
          >
            <span className="mb-1 h-3.5 text-[10px] font-medium text-slate-300">
              {indice === indiceMaximo ? formatarValor(ponto.valor) : ""}
            </span>
            <div className={`flex w-full items-end ${ALTURA_AREA_BARRA_VERTICAL[alturaBarra]}`}>
              <div
                className="w-full rounded-t transition-[height] duration-500 ease-out motion-reduce:transition-none"
                style={{ height: `${percentual(ponto.valor)}%`, backgroundColor: cor }}
              />
            </div>
            <span className="mt-1 h-3.5 max-w-full truncate text-[10px] text-slate-500">
              {indice % intervaloRotulo === 0 || indice === pontos.length - 1 ? ponto.rotulo : ""}
            </span>
          </Elemento>
        );
      })}
    </div>
  );
}
