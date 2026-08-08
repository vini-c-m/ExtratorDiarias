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
  /** Correção UX (2026-08-07) — "expandido" só no modo de análise em tela
   * cheia (`ModalExpandirGrafico`): anel/traço/texto maiores, puramente
   * geometria SVG — os mesmos `segmentos` (mesmo dado, mesma agregação),
   * só desenhados numa escala maior. Default "padrao" preserva 100% do
   * visual já homologado no cartão compacto. */
  tamanho?: "padrao" | "expandido";
}

// Redesign BI 3.0 (2026-08-07) — "padrao" ganha ~10% (120→132px) — a
// composição assimétrica (`GradeGraficosExecutivos`) dá mais espaço a
// alguns donuts agora, então o círculo aproveita melhor sem precisar do
// tier "expandido" (esse continua reservado ao modo de análise em tela
// cheia). Só geometria SVG — mesmos segmentos, mesma agregação.
const DIMENSOES: Record<"padrao" | "expandido", { tamanho: number; raio: number; espessura: number }> = {
  padrao: { tamanho: 132, raio: 50, espessura: 17 },
  expandido: { tamanho: 260, raio: 100, espessura: 30 },
};
const ESTILO_TEXTO: Record<
  "padrao" | "expandido",
  { neutro: string; dominante: string; rotulo: string; deslocPercentual: number; deslocRotulo: number }
> = {
  padrao: { neutro: "text-[15px]", dominante: "text-[16px]", rotulo: "text-[8px]", deslocPercentual: 7, deslocRotulo: 10 },
  expandido: { neutro: "text-[32px]", dominante: "text-[34px]", rotulo: "text-[15px]", deslocPercentual: 15, deslocRotulo: 22 },
};

/** Sprint 19.6.4 — único gráfico desta Sprint que precisa de geometria real
 * (arco), então é o único em SVG puro (os demais, `GraficoBarras`, usam
 * HTML/CSS — ver o comentário lá). Um `<circle>` por segmento, cada um
 * "cortado" via `strokeDasharray`/`strokeDashoffset` — técnica padrão de
 * donut em SVG, sem depender de `<path>` com cálculo de arco manual. Sempre
 * renderizado dentro do wrapper de `CartaoGrafico` — `aria-hidden` quando só
 * leitura (19.6.4), exposto quando `interativo` (19.6.5, ver lá). */
export default function GraficoDonut({ segmentos, formatarValor, aoClicarSegmento, tamanho = "padrao" }: Props) {
  const total = segmentos.reduce((soma, segmento) => soma + segmento.valor, 0);
  if (segmentos.length === 0 || total <= 0) return null;

  const { tamanho: TAMANHO, raio: RAIO, espessura: ESPESSURA } = DIMENSOES[tamanho];
  const CENTRO = TAMANHO / 2;
  const CIRCUNFERENCIA = 2 * Math.PI * RAIO;
  const estiloTexto = ESTILO_TEXTO[tamanho];

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
  // Refinamento visual 2.0 (2026-08-07) — segmento "claramente dominante"
  // (>=60%, bem mais que metade, nunca perto de um empate 50/50 ambíguo)
  // ganha o rótulo embaixo do percentual, só apresentação sobre
  // `arco.percentual` já calculado acima — nenhuma leitura/interpretação
  // nova. Abaixo do limiar, mantém o texto único de sempre. SVG `<text>`
  // não trunca via CSS como HTML — corta em JS para nomes longos.
  const dominante = maior.percentual >= 60;
  const rotuloDominante = maior.rotulo.length > 10 ? `${maior.rotulo.slice(0, 9)}…` : maior.rotulo;

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
                className="transition-[stroke-dasharray] duration-500 ease-out motion-reduce:transition-none"
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
        {dominante ? (
          <>
            <text
              x={CENTRO}
              y={CENTRO - estiloTexto.deslocPercentual}
              textAnchor="middle"
              dominantBaseline="middle"
              className={`fill-slate-200 font-bold ${estiloTexto.dominante}`}
            >
              {Math.round(maior.percentual)}%
            </text>
            <text
              x={CENTRO}
              y={CENTRO + estiloTexto.deslocRotulo}
              textAnchor="middle"
              dominantBaseline="middle"
              className={`fill-slate-500 font-medium uppercase tracking-wide ${estiloTexto.rotulo}`}
            >
              {rotuloDominante}
            </text>
          </>
        ) : (
          <text x={CENTRO} y={CENTRO} textAnchor="middle" dominantBaseline="middle" className={`fill-slate-200 font-semibold ${estiloTexto.neutro}`}>
            {Math.round(maior.percentual)}%
          </text>
        )}
      </svg>
    </div>
  );
}
