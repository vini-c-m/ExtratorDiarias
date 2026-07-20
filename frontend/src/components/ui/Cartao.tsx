import type { ComponentType, ReactNode } from "react";
import { CORES_STATUS } from "../../theme/cores";
import { SUPERFICIE_BASE } from "../../theme/estilos";
import { TIPOGRAFIA } from "../../theme/tipografia";

type Cor = "padrao" | "sucesso" | "atencao" | "info" | "erro";
type Tamanho = "grande" | "compacto";

interface Props {
  rotulo: string;
  valor: ReactNode;
  cor?: Cor;
  tamanho?: Tamanho;
  /** Sprint 07 — ícone Lucide exibido em destaque acima do valor (item
   * "Dashboard de Resultados" da Sprint: todo indicador vira um cartão com
   * ícone + número + descrição). */
  icone?: ComponentType<{ className?: string }>;
}

const COR_VALOR: Record<Cor, string> = {
  padrao: "text-slate-50",
  sucesso: CORES_STATUS.sucesso.texto,
  atencao: CORES_STATUS.aviso.texto,
  info: CORES_STATUS.info.texto,
  erro: CORES_STATUS.erro.texto,
};

// Selo do ícone: fundo translúcido + cor do ícone na mesma família semântica
// do valor, para que o cartão inteiro (não só o número) comunique o status
// à primeira vista.
const COR_SELO_ICONE: Record<Cor, string> = {
  padrao: "bg-blue-500/10 text-blue-400",
  sucesso: "bg-emerald-500/10 text-emerald-400",
  atencao: "bg-amber-500/10 text-amber-400",
  info: "bg-cyan-500/10 text-cyan-400",
  erro: "bg-red-500/10 text-red-400",
};

// Sprint 09.1 — glow neon do grupo "Estatísticas", sempre visível (não só
// no hover — "hoje os painéis possuem apenas sombra... quero que
// transmitam a sensação de estarem energizados"), na mesma magnitude dos
// painéis de Processamento/PDFs (mesmos tokens `--shadow-glow-*`, só a cor
// muda — nenhum cartão deve parecer "mais forte" que os outros só por
// existir uma diferença de valor). Cada cartão brilha na cor do próprio
// status, não numa cor única para o grupo inteiro: `padrao`/`info`
// (cartões neutros — PDFs analisados, tempo, pasta) usam o ciano padrão de
// Estatísticas, `sucesso` o verde, `atencao` (duplicadas — o grupo
// "Revisão" do pedido) o âmbar, `erro` (o grupo "Erros") o laranja — sem
// recolorir badge/texto de status já estabelecidos (que continuam
// vermelho/âmbar em `theme/cores.ts`).
// `hover:border-*` explícito (mesma família de cor, só mais opaco) em cada
// entrada — sem isso, o `hover:border-white/20` de `CARTAO_INTERATIVO`
// venceria a borda colorida no hover (mesmo variante `hover:`, ordem de
// geração do Tailwind decidiria, não a ordem das classes no JSX).
const COR_GLOW: Record<Cor, string> = {
  padrao: "border-cyan-400/20 shadow-glow-cyan hover:border-cyan-400/35",
  sucesso: "border-emerald-400/20 shadow-glow-green hover:border-emerald-400/35",
  atencao: "border-amber-400/20 shadow-glow-amber hover:border-amber-400/35",
  info: "border-cyan-400/20 shadow-glow-cyan hover:border-cyan-400/35",
  erro: "border-orange-400/20 shadow-glow-orange hover:border-orange-400/35",
};

// "grande" para números de destaque (contagens) — o valor é o elemento
// principal do cartão (item "Estatísticas" da Sprint 09), por isso maior
// que a Sprint 07; "compacto" para valores mais longos, como o caminho da
// pasta de resultados, onde um texto grande não caberia bem no cartão.
const CLASSES_TAMANHO: Record<Tamanho, string> = {
  grande: "mt-4 truncate text-4xl font-bold",
  compacto: "mt-4 break-all text-sm font-medium",
};

// Elevação de hover própria (sem passar por `CARTAO_INTERATIVO`): a borda e
// a sombra deste cartão já são coloridas e sempre visíveis via `COR_GLOW`,
// então só faltam o leve deslocamento e o realce de fundo no hover — usar
// `CARTAO_INTERATIVO` aqui duplicaria uma borda/sombra brancas concorrendo
// com as coloridas no mesmo estado.
const HOVER_ELEVACAO = "transition hover:-translate-y-0.5 hover:bg-white/[0.06]";

export default function Cartao({ rotulo, valor, cor = "padrao", tamanho = "grande", icone: Icone }: Props) {
  return (
    <div className={`${SUPERFICIE_BASE} ${HOVER_ELEVACAO} ${COR_GLOW[cor]} p-7`}>
      {Icone && (
        <span
          className={`flex h-12 w-12 items-center justify-center rounded-2xl ${COR_SELO_ICONE[cor]}`}
        >
          <Icone className="h-6 w-6" />
        </span>
      )}
      <div
        className={`${CLASSES_TAMANHO[tamanho]} ${COR_VALOR[cor]}`}
        title={typeof valor === "string" ? valor : undefined}
      >
        {valor}
      </div>
      <div className={`mt-1.5 ${TIPOGRAFIA.legenda}`}>{rotulo}</div>
    </div>
  );
}
