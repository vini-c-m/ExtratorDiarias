/** Sprint 19.6.4 — paleta de cores dos gráficos do Dashboard, validada com a
 * skill `dataviz` (`node scripts/validate_palette.js`) contra a superfície
 * escura real deste app (`#0b1120`, mesmo tom de `SUPERFICIE_BASE`): banda de
 * luminosidade, piso de croma, separação CVD (daltonismo), piso de visão
 * normal e contraste — todas as checagens em PASS. Ver a decisão registrada
 * em `docs/central-analitica/v2-plano-tecnico.md` § 18 (entrada 19.6.4).
 *
 * Nunca reaproveita as 4 cores de status já reservadas do app
 * (`theme/cores.ts`: esmeralda=sucesso, âmbar=aviso, vermelho/laranja=erro,
 * ciano=info) — um gráfico categórico (motivo, situação) nunca deve parecer
 * um veredito de status só porque uma fatia calhou de sair na mesma família
 * de cor (mesmo espírito de RN-08, ainda que RN-08 em si trate só do
 * veredito da Central de Conferência). */

/** Série única de gráficos de magnitude (barras de contagem) — mesmo ciano
 * já usado como cor "padrão"/neutra de estatística em `Cartao`
 * (`theme/cores.ts` → `CORES_STATUS.info`), para não introduzir uma segunda
 * cor neutra concorrente. */
export const COR_MAGNITUDE_CONTAGEM = "#22d3ee"; // cyan-400

/** Segunda série de magnitude (barras de valor em R$), quando um gráfico de
 * contagem e um de valor aparecem lado a lado no mesmo Dashboard (Evolução
 * × Valores por período) — hue distinto do ciano acima para os dois cartões
 * nunca se confundirem à primeira vista, mesmo critério de "dois contextos
 * sequenciais simultâneos" da skill `dataviz`. */
export const COR_MAGNITUDE_VALOR = "#3987e5"; // azul

/** Paleta categórica dos donuts (Distribuição por motivo / por situação do
 * servidor) — ordem fixa, nunca ciclada. Índice 0/1/2 = as 3 categorias
 * reais mais frequentes; o restante agrupa em "Outros" (`COR_OUTROS`), nunca
 * uma 4ª cor gerada. */
export const PALETA_CATEGORICA = ["#3987e5", "#d55181", "#9085e9"] as const;

/** Bucket "Outros" — sempre cinza neutro (mesma convenção já usada no app
 * para "neutro estrutural", `theme/cores.ts`), nunca uma cor categórica a
 * mais: "Outros" não é uma categoria com identidade própria, é a soma do que
 * sobrou. */
export const COR_OUTROS = "#94a3b8"; // slate-400
