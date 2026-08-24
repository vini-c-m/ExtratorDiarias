import { ArrowRight } from "lucide-react";
import type { ComponentType } from "react";
import { FOCO_ANEL, PRESSIONAR, SUPERFICIE_BASE } from "../../theme/estilos";
import { TIPOGRAFIA } from "../../theme/tipografia";

type Cor = "roxo" | "ciano" | "azul" | "verde" | "indigo";

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
//
// Sprint 18.4.2 — Central Analítica = azul (`shadow-glow-blue`), exatamente
// a extensão que o comentário acima previa, confirmando a proposta já
// registrada em `docs/central-analitica/ui-plano-tecnico.md` § 1/§ 11.
// `shadow-glow-blue` já tem outro consumidor (`GLOW_PDFS`, zona de
// arrastar PDFs em Processamento) — sem conflito visual real (as duas
// telas nunca aparecem juntas), só reaproveita o mesmo token de sombra;
// o tom de borda/selo/seta usa `blue-400`/`blue-500`, uma família Tailwind
// diferente do `blue-800` de `GLOW_PDFS`, para não duplicar exatamente a
// mesma aparência de outro elemento já existente.
// Micro-sprint B — Central de Regularização de DH = verde
// (`shadow-glow-green`, já existente para o estado "sucesso" — RN
// semântica: esta central resolve/regulariza uma pendência, o mesmo
// significado que "sucesso" já carrega no resto do app). Mesma extensão
// aditiva prevista no comentário original: só uma entrada nova em cada
// mapa, nenhum valor de sombra novo.
// Micro-sprint 3E.1 — 5ª entrada (Relatório do Portal da Transparência):
// índigo, token novo (`shadow-glow-indigo`, `theme.css`), nunca âmbar —
// âmbar já é a cor semântica de "aviso/revisão" (`CORES_STATUS.aviso`) em
// todo o app; usá-la aqui confundiria identidade de módulo com estado de
// alerta (correção aprovada na investigação UX 3E). Extensão aditiva pura:
// só uma entrada nova em cada mapa, exatamente como os comentários originais
// abaixo já previam.
const GLOW_POR_COR: Record<Cor, string> = {
  roxo: "border-violet-400/20 shadow-glow-purple hover:border-violet-400/35",
  ciano: "border-cyan-400/20 shadow-glow-cyan hover:border-cyan-400/35",
  azul: "border-blue-400/20 shadow-glow-blue hover:border-blue-400/35",
  verde: "border-emerald-400/20 shadow-glow-green hover:border-emerald-400/35",
  indigo: "border-indigo-400/20 shadow-glow-indigo hover:border-indigo-400/35",
};

const SELO_POR_COR: Record<Cor, string> = {
  roxo: "bg-violet-500/10 text-violet-300",
  ciano: "bg-cyan-500/10 text-cyan-300",
  azul: "bg-blue-500/10 text-blue-300",
  verde: "bg-emerald-500/10 text-emerald-300",
  indigo: "bg-indigo-500/10 text-indigo-300",
};

const SETA_POR_COR: Record<Cor, string> = {
  roxo: "text-violet-300",
  ciano: "text-cyan-300",
  azul: "text-blue-300",
  verde: "text-emerald-300",
  indigo: "text-indigo-300",
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
