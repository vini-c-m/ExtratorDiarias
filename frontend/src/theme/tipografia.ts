/** Sprint 07 — hierarquia tipográfica única do app: Título, Subtítulo,
 * Texto, Legenda, Status. Cada tela usa uma destas constantes em vez de
 * escolher tamanho/peso/cor "no olho" — mudar a fonte/peso da marca em
 * qualquer nível da hierarquia é uma linha só, aqui. Toda a hierarquia usa
 * Inter; o que muda por nível é peso, tamanho e cor. Cores recalibradas
 * nesta Sprint de `gray-*` (pensada para fundo branco) para `slate-*`
 * (legível sobre o fundo escuro `#0F172A` da nova identidade). */

export const TIPOGRAFIA = {
  /** Título do cabeçalho do app ("Automatizador de Diárias") — Inter ExtraBold,
   * 30px, leve espaçamento de letras, branco quase puro (`slate-50`).
   * Sprint 09 — 2px maior que a Sprint 07 (o monograma também cresceu),
   * mantendo o cabeçalho baixo/compacto (item "Novo Cabeçalho"). */
  tituloApp: "text-[30px] font-extrabold leading-tight tracking-[0.01em] text-slate-50",
  /** Tagline única do cabeçalho ("Automação Inteligente de Processos") —
   * Inter Medium, 15px, leve caixa alta com espaçamento de letras (item
   * "Mais espaçamento/respiro" da Sprint 09 — a tagline agora lê como um
   * rótulo técnico discreto, não como frase corrida), tom discreto
   * (`slate-400`). */
  subtituloApp: "text-[13px] font-medium uppercase tracking-[0.14em] text-slate-400",
  /** Título de seção/tela. */
  titulo: "text-xl font-semibold tracking-tight text-slate-50",
  /** Subtítulo de bloco/seção interna. */
  subtitulo: "text-sm font-semibold text-slate-100",
  /** Texto de corpo padrão. */
  texto: "text-sm leading-relaxed text-slate-300",
  /** Texto de corpo com mais ênfase (rótulos de ação, valores). */
  textoForte: "text-sm font-medium text-slate-200",
  /** Legenda pequena (rótulo de cartão, cabeçalho de tabela). */
  legenda: "text-xs uppercase tracking-wider text-slate-500",
  /** Texto pequeno auxiliar (descrições, notas de rodapé de seção) — mesmo
   * tamanho da legenda, mas em frase normal, sem caixa alta. */
  textoAuxiliar: "text-xs leading-relaxed text-slate-500",
  /** Texto de status/badge. */
  status: "text-xs font-medium",
  /** BI 4.0 — rótulo pequeno de destaque acima de um valor grande (hero,
   * KPI, item de timeline de insights): caixa alta, espaçamento largo, cor
   * de marca (cyan) em vez do slate neutro de `legenda` — marca "isto é o
   * contexto de um número importante", não um cabeçalho de tabela. */
  eyebrow: "text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-400/80",
} as const;
