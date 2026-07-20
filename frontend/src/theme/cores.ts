/** Sprint 07 — mapa único de cores semânticas do Design System (nova
 * identidade visual, fundo escuro).
 *
 * Convenção fixa do app inteiro: verde = sucesso, amarelo = aviso/duplicidade,
 * vermelho = erro, ciano = informativo neutro (agora a própria cor de marca,
 * em vez do dourado institucional que a paleta restrita anterior forçava
 * aqui), slate = neutro estrutural. Nenhum componente deve escolher uma cor
 * semântica "no olho" — todos (Alerta, Badge, Cartao, cabeçalho) leem daqui,
 * então mudar o tom de "sucesso" no app inteiro é uma linha só, aqui.
 *
 * Todas as variantes seguem o mesmo padrão "dark UI": texto num tom claro da
 * família (400), fundo/borda translúcidos sobre o `slate-900` do app — nunca
 * fundo sólido opaco, que quebraria a sensação de "vidro" do resto do Design
 * System (ver `SUPERFICIE_BASE` em `estilos.ts`). */

export type VarianteStatus = "sucesso" | "aviso" | "erro" | "info" | "neutro";

interface EstiloStatus {
  /** Pílula (badge de status em tabelas, cabeçalho). */
  badge: string;
  /** Caixa de alerta (borda + fundo + texto). */
  alerta: string;
  /** Só a cor do texto — contadores, valores de Cartao. */
  texto: string;
  /** Indicador circular pequeno (dot), usado no badge de status do backend. */
  ponto: string;
}

export const CORES_STATUS: Record<VarianteStatus, EstiloStatus> = {
  sucesso: {
    badge: "bg-emerald-500/10 text-emerald-400",
    alerta: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    texto: "text-emerald-400",
    ponto: "bg-emerald-400",
  },
  aviso: {
    badge: "bg-amber-500/10 text-amber-400",
    alerta: "border-amber-500/30 bg-amber-500/10 text-amber-300",
    texto: "text-amber-400",
    ponto: "bg-amber-400",
  },
  erro: {
    badge: "bg-red-500/10 text-red-400",
    alerta: "border-red-500/30 bg-red-500/10 text-red-300",
    texto: "text-red-400",
    ponto: "bg-red-400",
  },
  // Informativo/neutro — agora usa ciano, a própria cor de marca (uma das
  // três paradas do gradiente oficial), em vez de uma gambiarra sobre o
  // dourado institucional que a paleta restrita das Sprints anteriores
  // exigia.
  info: {
    badge: "bg-cyan-500/10 text-cyan-400",
    alerta: "border-cyan-500/30 bg-cyan-500/10 text-cyan-300",
    texto: "text-cyan-400",
    ponto: "bg-cyan-400",
  },
  neutro: {
    badge: "bg-white/5 text-slate-300",
    alerta: "border-white/10 bg-white/5 text-slate-300",
    texto: "text-slate-300",
    ponto: "bg-slate-400",
  },
};

/** Destaque máximo — reservado exclusivamente para o estado "necessita
 * inserção manual" (PDF que não pôde ser processado/inserido automaticamente
 * na planilha). Sempre mais proeminente que qualquer outro badge/alerta do
 * app: vermelho, negrito, caixa alta — nunca usado como identidade da
 * aplicação, só para chamar atenção a esse caso específico. */
export const DESTAQUE_INSERCAO_MANUAL = "font-bold uppercase tracking-wide text-red-400";
