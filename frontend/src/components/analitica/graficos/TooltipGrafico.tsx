import type { ReactNode } from "react";

interface Props {
  /** `true` mostra o tooltip (controlado por quem chama — hover/foco do
   * próprio elemento âncora, já que o alvo de hover em `GraficoEvolucaoComZoom`
   * é uma camada de zonas separada das barras, não a barra em si). */
  visivel: boolean;
  /** Correção de regressão (2026-08-07) — quando a barra/ponto âncora fica
   * perto da borda do gráfico, um tooltip sempre centralizado (`centro`)
   * pode se estender além do próprio card. `esquerda`/`direita` alinham a
   * uma borda do próprio elemento âncora em vez de centralizar — mitiga o
   * caso, mas quem garante que nada vaza para o card vizinho de verdade é
   * o `overflow-hidden` do `CartaoGrafico` (viewport isolado), não este
   * alinhamento sozinho. Default `centro` preserva o comportamento
   * original. */
  alinhamento?: "esquerda" | "centro" | "direita";
  children: ReactNode;
}

const CLASSE_ALINHAMENTO: Record<"esquerda" | "centro" | "direita", string> = {
  esquerda: "left-0",
  centro: "left-1/2 -translate-x-1/2",
  direita: "right-0",
};

/** Tooltip rico reutilizável (refinamento visual do Modo Executivo,
 * 2026-08-07) — substitui o `title` nativo do navegador (sem estilo, sem
 * múltiplas linhas) por um cartão pequeno posicionado acima do ponto.
 * `pointer-events-none` — nunca captura o próprio hover/clique do
 * elemento que o contém. Conteúdo é sempre passado pronto por quem chama
 * (nenhum dado buscado aqui). */
export default function TooltipGrafico({ visivel, alinhamento = "centro", children }: Props) {
  if (!visivel) return null;
  return (
    <div
      role="tooltip"
      className={`pointer-events-none absolute bottom-full z-20 mb-2 whitespace-nowrap rounded-lg border border-white/10 bg-[#0b1120] px-3 py-2 text-xs shadow-dialog ${CLASSE_ALINHAMENTO[alinhamento]}`}
    >
      {children}
    </div>
  );
}
