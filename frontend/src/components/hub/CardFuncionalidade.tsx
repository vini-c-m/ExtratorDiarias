import { ArrowRight } from "lucide-react";
import type { ComponentType } from "react";
import { FOCO_ANEL, PRESSIONAR, SUPERFICIE_BASE } from "../../theme/estilos";
import { TIPOGRAFIA } from "../../theme/tipografia";

type Cor = "roxo" | "ciano";

interface Props {
  titulo: string;
  descricao: string;
  icone: ComponentType<{ className?: string }>;
  cor: Cor;
  onClick: () => void;
}

// Sprint 14 — card do Hub de funcionalidades: mesma fórmula de "superfície
// vidro + glow colorido sempre visível" já usada em `Cartao.tsx`
// (Estatísticas), aplicada a um <button> em vez de um <div> de leitura — o
// cartão inteiro é a ação, não uma pílula "Abrir" dentro dele. Elevação de
// hover própria (não `CARTAO_INTERATIVO`) pelo mesmo motivo documentado em
// `Cartao.tsx`: a borda já é colorida e sempre visível via `GLOW_POR_COR`,
// então usar `CARTAO_INTERATIVO` duplicaria uma borda branca concorrendo
// com a colorida no mesmo estado (ordem de geração do Tailwind decidiria
// qual vence, não a ordem das classes no JSX).
//
// Cor por grupo funcional, mesma convenção do resto do app: Processamento
// = roxo (`GLOW_PROCESSAMENTO`, já é a cor da `BarraProgresso`);
// Central de Conferência = ciano (`shadow-glow-cyan`, a mesma cor
// semântica de "informativo/consultivo" de `CORES_STATUS.info` — RN-08/
// RN-11, a Central nunca decide, só informa). Escalável: um 3º módulo
// futuro só precisa de uma nova entrada neste mapa, nunca um valor de
// sombra novo.
const GLOW_POR_COR: Record<Cor, string> = {
  roxo: "border-violet-400/20 shadow-glow-purple hover:border-violet-400/35",
  ciano: "border-cyan-400/20 shadow-glow-cyan hover:border-cyan-400/35",
};

const SELO_POR_COR: Record<Cor, string> = {
  roxo: "bg-violet-500/10 text-violet-300",
  ciano: "bg-cyan-500/10 text-cyan-300",
};

const SETA_POR_COR: Record<Cor, string> = {
  roxo: "text-violet-300",
  ciano: "text-cyan-300",
};

const HOVER_ELEVACAO = "transition hover:-translate-y-1 hover:bg-white/[0.06] hover:shadow-floating";

export default function CardFuncionalidade({ titulo, descricao, icone: Icone, cor, onClick }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${SUPERFICIE_BASE} ${HOVER_ELEVACAO} ${GLOW_POR_COR[cor]} ${FOCO_ANEL} ${PRESSIONAR} flex w-full flex-col items-start gap-4 p-7 text-left`}
    >
      <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${SELO_POR_COR[cor]}`}>
        <Icone className="h-6 w-6" />
      </span>
      <div>
        <h3 className={TIPOGRAFIA.subtitulo}>{titulo}</h3>
        <p className={`mt-1.5 ${TIPOGRAFIA.texto}`}>{descricao}</p>
      </div>
      <span
        className={`mt-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide ${SETA_POR_COR[cor]}`}
      >
        Abrir
        <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
      </span>
    </button>
  );
}
