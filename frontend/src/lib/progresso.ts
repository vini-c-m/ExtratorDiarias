/** Cálculos puros de progresso — percentual, formatação de duração e
 * estimativa de tempo restante — usados pela barra de progresso durante o
 * processamento. Nenhuma dependência de React/DOM, para poder ser testado
 * isoladamente. */

export function calcularPercentual(concluidos: number, total: number): number {
  if (total <= 0) return 0;
  const percentual = (concluidos / total) * 100;
  return Math.max(0, Math.min(100, Math.round(percentual)));
}

export function formatarDuracao(ms: number): string {
  if (ms < 0) ms = 0;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const minutos = Math.floor(ms / 60_000);
  const segundos = Math.round((ms % 60_000) / 1000);
  return `${minutos}min ${segundos}s`;
}

/** Estimativa linear simples: tempo médio por PDF já concluído, projetado
 * para os PDFs que faltam. Só calculável depois de pelo menos 1 PDF
 * concluído — antes disso não há base nenhuma para estimar, e a função
 * devolve null (a interface deve then omitir a estimativa, não mostrar um
 * número inventado). */
export function estimarTempoRestanteMs(
  elapsedMs: number,
  concluidos: number,
  total: number,
): number | null {
  if (concluidos <= 0 || concluidos >= total) return null;
  const mediaPorPdf = elapsedMs / concluidos;
  const restantes = total - concluidos;
  return Math.round(mediaPorPdf * restantes);
}
