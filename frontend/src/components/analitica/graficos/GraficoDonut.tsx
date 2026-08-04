export interface SegmentoDonut {
  rotulo: string;
  valor: number;
  cor: string;
  /** Sprint 19.6.5 — `false` para o bucket agregado "Outros", que não é um
   * valor real filtrável. `undefined`/ausente equivale a `true`. */
  filtravel?: boolean;
}

interface Props {
  segmentos: SegmentoDonut[];
  formatarValor: (valor: number) => string;
  /** Sprint 19.6.5 — clique numa fatia refina o recorte. Convite só para
   * mouse (o `<circle>` do SVG não vira foco/`role`) — o caminho acessível
   * por teclado/leitor de tela para a mesma ação é a legenda de
   * `CartaoGrafico` (`aoClicarLegenda`), que já é HTML real fora do SVG. */
  aoClicarSegmento?: (indice: number) => void;
}

const TAMANHO = 120;
const RAIO = 45;
const ESPESSURA = 16;
const CENTRO = TAMANHO / 2;
const CIRCUNFERENCIA = 2 * Math.PI * RAIO;

/** Sprint 19.6.4 — único gráfico desta Sprint que precisa de geometria real
 * (arco), então é o único em SVG puro (os demais, `GraficoBarras`, usam
 * HTML/CSS — ver o comentário lá). Um `<circle>` por segmento, cada um
 * "cortado" via `strokeDasharray`/`strokeDashoffset` — técnica padrão de
 * donut em SVG, sem depender de `<path>` com cálculo de arco manual. Sempre
 * renderizado dentro do wrapper de `CartaoGrafico` — `aria-hidden` quando só
 * leitura (19.6.4), exposto quando `interativo` (19.6.5, ver lá). */
export default function GraficoDonut({ segmentos, formatarValor, aoClicarSegmento }: Props) {
  const total = segmentos.reduce((soma, segmento) => soma + segmento.valor, 0);
  if (segmentos.length === 0 || total <= 0) return null;

  let acumulado = 0;
  const arcos = segmentos.map((segmento, indice) => {
    const percentual = (segmento.valor / total) * 100;
    const comprimento = (percentual / 100) * CIRCUNFERENCIA;
    const deslocamento = -(acumulado / 100) * CIRCUNFERENCIA;
    acumulado += percentual;
    return { ...segmento, indice, percentual, comprimento, deslocamento };
  });

  // Rótulo direto seletivo (mark spec — nunca um número por fatia): só o
  // maior segmento, no centro do próprio anel.
  const maior = arcos.reduce((atual, arco) => (arco.percentual > atual.percentual ? arco : atual), arcos[0]);

  return (
    <div className="flex items-center justify-center">
      <svg viewBox={`0 0 ${TAMANHO} ${TAMANHO}`} width={TAMANHO} height={TAMANHO}>
        <g transform={`rotate(-90 ${CENTRO} ${CENTRO})`}>
          {arcos.map((arco) => {
            const clicavel = aoClicarSegmento !== undefined && arco.filtravel !== false;
            return (
              <circle
                key={arco.rotulo}
                cx={CENTRO}
                cy={CENTRO}
                r={RAIO}
                fill="none"
                stroke={arco.cor}
                strokeWidth={ESPESSURA}
                strokeDasharray={`${arco.comprimento} ${CIRCUNFERENCIA - arco.comprimento}`}
                strokeDashoffset={arco.deslocamento}
                style={clicavel ? { cursor: "pointer" } : undefined}
                onClick={clicavel ? () => aoClicarSegmento(arco.indice) : undefined}
              >
                <title>
                  {arco.rotulo}: {formatarValor(arco.valor)} ({Math.round(arco.percentual)}%)
                </title>
              </circle>
            );
          })}
        </g>
        <text x={CENTRO} y={CENTRO} textAnchor="middle" dominantBaseline="middle" className="fill-slate-200 text-[15px] font-semibold">
          {Math.round(maior.percentual)}%
        </text>
      </svg>
    </div>
  );
}
