import type { ButtonHTMLAttributes, ReactNode } from "react";
import { DESABILITADO, EFEITO_RIPPLE, FOCO_ANEL, GLOW_PERIGO, PRESSIONAR } from "../../theme/estilos";

type Variante = "primaria" | "secundaria" | "perigo" | "link" | "ativa";
type Tamanho = "padrao" | "grande";

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> {
  variante?: Variante;
  /** Sprint 06 — "grande" é reservado para a ação principal de uma tela
   * (ex.: "Novo Processo" ao final do fluxo), quando o botão precisa se
   * destacar de todos os outros da mesma tela. Nunca mais de um botão
   * "grande" por tela. */
  tamanho?: Tamanho;
  carregando?: boolean;
  children: ReactNode;
}

// Sprint 09 — botões "premium" pedidos pela Sprint: bem mais padding que a
// Sprint 07 (item "Botões" — "maiores, muito mais padding").
const CLASSES_TAMANHO: Record<Tamanho, string> = {
  padrao: "px-7 py-4 text-sm",
  grande: "px-9 py-6 text-base",
};

// Sprint 09.1 — identidade "Neon Tech UI": primária no degradê oficial
// completo (azul → ciano → roxo, `--gradient-marca`), com glow neon só no
// hover (nunca em repouso — item "Botões": "glow no hover"). O glow do
// primário não é um token novo: é a composição dos dois tokens de
// Processamento+PDFs empilhados (`--shadow-glow-purple` + `--shadow-glow-blue`,
// a mesma combinação do glow atrás do monograma do cabeçalho) — dois tokens
// juntos leem como "um pouco mais intenso" que o glow de um painel sozinho,
// sem inventar um valor de blur/alfa próprio (ver a hierarquia de
// intensidade documentada em `theme.css`). O perigo usa a mesma fórmula de
// duas camadas dos 6 tokens oficiais (16px/38px, mesmos alfas), só com o
// vermelho semântico de ação destrutiva (`CORES_STATUS.erro`) — não vira
// token porque não é um dos 5 grupos, mas seguir a mesma fórmula é o que
// mantém todo glow do app na mesma linguagem. Secundária mantém a
// superfície "vidro" translúcida, com a sombra de elevação da escala
// (`shadow-floating`). As três (exceto "link") somam leve elevação + ripple
// de clique (`EFEITO_RIPPLE`) — a mesma microinteração em todas, só a
// paleta muda por variante.
const CLASSES_VARIANTE: Record<Variante, string> = {
  primaria:
    "bg-[image:var(--gradient-marca)] text-white shadow-none hover:shadow-[var(--shadow-glow-purple),var(--shadow-glow-blue)] hover:-translate-y-0.5",
  secundaria:
    "border border-white/15 bg-white/5 text-slate-200 hover:-translate-y-0.5 hover:border-white/25 hover:bg-white/10 hover:shadow-floating",
  perigo: `border border-red-500/30 bg-red-500/10 text-red-400 hover:-translate-y-0.5 hover:bg-red-500/15 hover:${GLOW_PERIGO}`,
  link: "text-sm font-medium text-cyan-400 underline decoration-cyan-500/40 underline-offset-2 hover:text-cyan-300",
  // MS UX (2026-08-10) — estado "ligado" de um toggle (ex.: Dark Mode
  // Executivo): acento ciano controlado, sem glow — só precisa ficar óbvio
  // que está ativo, nunca competir com a variante primária.
  ativa: "border border-cyan-400/50 bg-cyan-400/[0.14] text-cyan-200 hover:-translate-y-0.5 hover:bg-cyan-400/[0.18] hover:border-cyan-400/60",
};

export default function Botao({
  variante = "secundaria",
  tamanho = "padrao",
  carregando = false,
  disabled,
  children,
  ...resto
}: Props) {
  const ehLink = variante === "link";

  return (
    <button
      {...resto}
      disabled={disabled || carregando}
      className={`inline-flex items-center gap-2 transition ${PRESSIONAR} ${DESABILITADO} ${FOCO_ANEL} disabled:cursor-not-allowed ${
        ehLink ? "" : `rounded-lg font-semibold ${EFEITO_RIPPLE} ${CLASSES_TAMANHO[tamanho]}`
      } ${CLASSES_VARIANTE[variante]}`}
    >
      {carregando && (
        <span
          aria-hidden="true"
          className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      )}
      {children}
    </button>
  );
}
