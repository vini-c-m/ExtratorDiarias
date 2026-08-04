import { FOCO_ANEL } from "../../../theme/estilos";

export interface PontoBarra {
  rotulo: string;
  valor: number;
  /** Sprint 19.6.5 — `false` para buckets sintéticos ("Servidor sem
   * cadastro", "Sem destino informado"...) que não representam um valor real
   * filtrável — a barra continua visível (nunca escondida), só deixa de ser
   * clicável. `undefined`/ausente equivale a `true`. */
  filtravel?: boolean;
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
}

const ALTURA_AREA_BARRA_VERTICAL = "h-32"; // 128px, altura fixa da área de barras (rótulo/valor ficam fora)
const LARGURA_MINIMA_VISIVEL = 2; // % — barra com valor > 0 nunca fica visualmente "zero"

const RESET_BOTAO = "appearance-none border-0 bg-transparent p-0 text-left cursor-pointer";

/** Sprint 19.6.4 — barras em HTML/CSS (não SVG): `rounded-t`/`rounded-r` do
 * Tailwind já produzem exatamente a especificação de mark "4px arredondado
 * na ponta que cresce, quadrado na base" sem precisar desenhar um path SVG
 * à mão, e texto HTML trunca com `truncate`/`title` de graça — SVG `<text>`
 * não trunca nativamente, o que importava aqui porque nomes de servidor e
 * pares "Origem → Destino" podem ser longos. */
export default function GraficoBarras({ pontos, orientacao, cor, formatarValor, aoClicarPonto }: Props) {
  if (pontos.length === 0) return null;

  const maximo = Math.max(...pontos.map((ponto) => ponto.valor), 0);
  const indiceMaximo = pontos.findIndex((ponto) => ponto.valor === maximo);

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
              <span className="w-28 shrink-0 truncate text-xs text-slate-400" title={ponto.rotulo}>
                {ponto.rotulo}
              </span>
              <div className="h-4 min-w-0 flex-1">
                <div
                  className="h-full rounded-r"
                  style={{ width: `${percentual(ponto.valor)}%`, backgroundColor: cor }}
                />
              </div>
              <span className="w-20 shrink-0 text-right text-xs font-medium text-slate-300">
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
            className={`flex flex-1 flex-col items-center rounded ${clicavel ? `${RESET_BOTAO} ${FOCO_ANEL} hover:bg-white/5` : ""}`}
          >
            <span className="mb-1 h-3.5 text-[10px] font-medium text-slate-300">
              {indice === indiceMaximo ? formatarValor(ponto.valor) : ""}
            </span>
            <div className={`flex w-full items-end ${ALTURA_AREA_BARRA_VERTICAL}`}>
              <div className="w-full rounded-t" style={{ height: `${percentual(ponto.valor)}%`, backgroundColor: cor }} />
            </div>
            <span className="mt-1 max-w-full truncate text-[10px] text-slate-500">{ponto.rotulo}</span>
          </Elemento>
        );
      })}
    </div>
  );
}
