/** Sprint 07 — classes utilitárias compostas, reaproveitadas por mais de um
 * componente (foco de teclado, base de cartão/painel, microinterações,
 * scrollbar). Existem para que nenhum componente repita a mesma sequência de
 * utilitários Tailwind "no olho" — qualquer ajuste na sensação de
 * foco/elevação/pressão do app inteiro é uma linha só, aqui.
 *
 * `transition`/`transition-colors`/etc. do Tailwind já usam a duração e a
 * curva da marca (220ms, ease padrão) por padrão — definidas uma única vez
 * em `theme.css` via `--default-transition-duration`/
 * `--default-transition-timing-function`. Não é preciso repetir `duration-*`
 * em cada componente.
 *
 * Sprint 09.1 — convenção de espaçamento: o app usa só a escala numérica
 * padrão do Tailwind (não existe uma segunda escala nomeada `xs/sm/md/lg/xl`
 * paralela — seria uma segunda fonte de verdade para os mesmos valores).
 * Papel de cada faixa, para quem for escrever um componente novo:
 * `gap-2`/`p-2` (8px) = xs, entre elementos muito próximos de um mesmo
 * controle; `gap-3`/`p-3` (12px) = sm, dentro de itens de lista; `gap-4`/
 * `p-5` (16–20px) = md, entre blocos relacionados; `p-7`/`gap-6` (24–28px) =
 * lg, padding padrão de qualquer card/painel (ver `SUPERFICIE_BASE`); `p-8`/
 * `mt-10` (32–40px) = xl, separação entre seções inteiras de uma tela. */

/** Anel de foco visível (navegação por Tab) — sempre azul (cor de marca),
 * sempre com offset na cor real do fundo do app (Sprint 09 — primeira parada
 * do novo degradê, `--color-bg-1`/`#060818`, no lugar do `slate-900` da
 * Sprint 07) para não colar no elemento. */
export const FOCO_ANEL =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#060818]";

/** Base compartilhada por qualquer cartão/painel de conteúdo — superfície
 * "vidro" translúcida sobre o fundo escuro do app (borda e preenchimento
 * quase transparentes, leve desfoque atrás), raio grande (20px, item
 * "Cards" da Sprint 09) e sombra discreta. Estilo Linear/Vercel: nunca um
 * retângulo opaco cru. */
export const SUPERFICIE_BASE =
  "rounded-card border border-white/10 bg-white/[0.04] backdrop-blur-sm shadow-card";

/** Cartão com resposta discreta ao hover — leve elevação, superfície um
 * pouco mais clara e sombra mais presente (`shadow-floating`, escala de
 * sombra do Design System em `theme.css`), nunca chamativa. */
export const CARTAO_INTERATIVO = `${SUPERFICIE_BASE} transition hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.06] hover:shadow-floating`;

/** Sprint 09.1 — glow neon "roxo/violeta" do grupo Processamento (painel da
 * `BarraProgresso`). Um único token (`--shadow-glow-purple`, ver
 * `theme.css`) aplicado sempre, não só no hover — é a "sensação de painel
 * aceso" pedida pela Sprint. A borda ganha a mesma cor do glow (mas como
 * utilidade `border-*` separada, nunca embutida no valor de sombra); a
 * respiração (`animate-glow-pulse`) fica a critério de quem usa o token —
 * só a `BarraProgresso` a aplica, para se diferenciar do glow estático de
 * PDFs/Estatísticas sem precisar de um valor de sombra próprio. */
export const GLOW_PROCESSAMENTO = "border-violet-400/20 shadow-glow-purple";

/** Sprint 09.1 — glow neon "azul petróleo" do grupo PDFs (`ZonaArrastar`).
 * Mesmo princípio do glow de Processamento, um único token
 * (`--shadow-glow-blue`), sempre visível, nunca só no hover. */
export const GLOW_PDFS = "border-blue-800/30 shadow-glow-blue";

/** Sprint 14 — "painel de LED" do logo principal (monograma "ED"): usado no
 * cabeçalho compacto e na tela de Boas-vindas (hero, maior). Substitui o
 * halo largo e difuso da Sprint 09.1 (`opacity-10` + `shadow-glow-purple`/
 * `shadow-glow-blue` empilhados atrás do ícone, sem nenhum contorno) por um
 * anel justo à silhueta do logo — um aro nítido de 1px seguido das duas
 * camadas oficiais de glow (mesmos tokens de sempre, só compostas como
 * "aro" em vez de "névoa solta"). É isso que lê como painel iluminado por
 * trás em vez de mancha ao redor de um ícone nítido. Um único token — quem
 * usa só aplica no elemento posicionado exatamente sobre os limites do
 * logo (mesma proporção/raio), nunca um valor de sombra próprio. */
export const GLOW_LOGO_NEON =
  "shadow-[0_0_0_1px_rgb(255_255_255_/_0.28),var(--shadow-glow-cyan),var(--shadow-glow-purple)]";

/** Sprint 09.1 — glow vermelho de "perigo/erro" fora do sistema de 6 tokens
 * (não é um dos 5 grupos de Processamento/PDFs/Estatísticas), mas segue
 * exatamente a mesma fórmula de duas camadas dos tokens oficiais (16px/38px,
 * mesmos alfas — só o matiz muda), para nunca destoar em intensidade.
 * Auditoria da Sprint 09.1: antes desta constante, o botão "perigo", o selo
 * de ícone do `DialogoConfirmacao` e o painel do `LimiteDeErro` tinham cada
 * um o seu próprio valor de sombra vermelha "no olho" — exatamente o tipo
 * de inconsistência que a Sprint pediu para eliminar. Os três agora
 * compartilham esta única constante. */
export const GLOW_PERIGO = "shadow-[0_0_16px_rgb(239_68_68_/_0.22),0_0_38px_rgb(239_68_68_/_0.16)]";

/** Sprint 09.1 — efeito "ripple" de clique nos botões: uma camada do
 * tamanho do próprio elemento que nasce invisível (`scale(0)`) e se expande
 * cobrindo-o por completo enquanto desvanece, via `animate-ripple` (200ms,
 * definida em `theme.css`), disparado só em `:active`. O preenchimento é um
 * `radial-gradient` (branco no centro, transparente na borda) em vez de um
 * disco chapado — soma-se ao fade temporal do keyframe para um "bloom"
 * mais suave em vez de um flash sólido. Sem JavaScript nem rastreio da
 * posição do clique — mais barato que um ripple "a partir do ponto tocado"
 * e suficiente para o efeito de "clique reconhecido". `rounded-[inherit]`
 * acompanha o raio do botão/rótulo em que for aplicado (`rounded-lg` no
 * padrão, `rounded-full` em pílulas). */
export const EFEITO_RIPPLE =
  "relative overflow-hidden before:pointer-events-none before:absolute before:inset-0 before:scale-0 before:rounded-[inherit] before:bg-[radial-gradient(circle,white_0%,transparent_70%)] before:opacity-0 before:content-[''] active:before:animate-ripple";

/** Painel de modal/diálogo — precisa cobrir o conteúdo atrás (não só
 * decorar a página), então usa uma superfície mais opaca que
 * `SUPERFICIE_BASE`, com o mesmo raio/borda, a sombra mais forte da escala
 * (`shadow-dialog` — o modal precisa se destacar por cima de todo o resto
 * da interface) e a entrada animada discreta. */
export const PAINEL_MODAL =
  "rounded-card border border-white/10 bg-[#0b1120]/95 backdrop-blur-md shadow-dialog animate-entrada-painel";

/** Efeito de "pressão" ao clicar — nunca em elementos desabilitados. */
export const PRESSIONAR = "active:scale-[0.98]";

/** Remove qualquer resposta de hover/clique e reduz opacidade quando
 * desabilitado — aplicar sempre junto de `disabled:opacity-40`. */
export const DESABILITADO = "disabled:pointer-events-none disabled:opacity-40";

/** Sprint 06 — altura máxima única para qualquer lista/tabela rolável do
 * app (fila de PDFs, pré-visualização, resultado final) — mesma filosofia
 * visual em todas: altura fixa, scroll próprio, resto da tela sempre
 * visível, não importa se são 5 ou 500 linhas. `FilaArquivos` usa uma
 * altura menor (é uma lista simples de uma linha por item); as tabelas de
 * dados (mais densas, com cabeçalho) usam esta. */
export const ALTURA_LISTA_ROLAVEL = "max-h-80";

/** Sprint 07 — scrollbar fina e discreta (item "Scrollbars" da Sprint),
 * aplicada às mesmas três listas roláveis do app. O estilo em si vive em
 * `index.css` (`::-webkit-scrollbar` não tem equivalente em utilitário
 * Tailwind); esta constante existe só para nenhum componente reescrever o
 * nome da classe "no olho". */
export const SCROLL_FINO = "scroll-fino";
