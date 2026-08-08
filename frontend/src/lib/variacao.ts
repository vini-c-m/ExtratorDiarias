/** BI 4.0 — única implementação da variação percentual entre dois valores
 * (`((atual - anterior) / anterior) * 100`), extraída de
 * `GradeKpisExecutivos.formatarVariacao`/`insightsExecutivos.variacaoPercentual`
 * (duplicadas antes desta Sprint). Puramente apresentacional — não recalcula
 * nenhum indicador, só formata uma comparação sobre valores já prontos.
 * `null` quando `anterior` é nulo/zero (resultado matematicamente indefinido:
 * nunca `Infinity`/`NaN` apresentado). */
export function variacaoPercentual(anterior: number | null, atual: number | null): number | null {
  if (anterior === null || atual === null || anterior === 0) return null;
  return ((atual - anterior) / anterior) * 100;
}

const FORMATADOR_PERCENTUAL = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

/** Texto pronto "+X,X%"/"-X,X%" — sinal sempre explícito, nunca cor/palavra
 * de julgamento embutida (RN-08: variação de negócio não é falha técnica,
 * quem interpreta é o gestor). `null` nas mesmas condições de
 * `variacaoPercentual`. */
export function formatarVariacaoPercentual(anterior: number | null, atual: number | null): string | null {
  const variacao = variacaoPercentual(anterior, atual);
  if (variacao === null) return null;
  const sinal = variacao > 0 ? "+" : "";
  return `${sinal}${FORMATADOR_PERCENTUAL.format(variacao)}%`;
}
