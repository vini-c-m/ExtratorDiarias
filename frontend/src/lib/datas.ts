/** Formata uma data ISO (`YYYY-MM-DD`, formato de `date` do Pydantic/
 * `<input type="date">`) para o formato brasileiro `DD/MM/YYYY` — usado em
 * `ChipsFiltroAtivo`, `TabelaDiarias` e `PainelDetalhamentoDiaria`. Entrada
 * malformada nunca lança — devolve o valor original (mesmo critério de
 * `mascararCpf`). */
export function formatarDataBr(dataIso: string): string {
  const partes = dataIso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!partes) return dataIso;
  const [, ano, mes, dia] = partes;
  return `${dia}/${mes}/${ano}`;
}

/** Formata um período (`{ inicial, final }`, ambos `YYYY-MM-DD`) no mesmo
 * estilo do wireframe (`ui-wireframes.md` § 2): "08–10/01/2025" quando
 * ambas as datas caem no mesmo mês/ano, "08/12/2024 – 10/01/2025" quando
 * não. */
export function formatarPeriodoBr(inicial: string, final: string): string {
  const inicialFormatada = formatarDataBr(inicial);
  const finalFormatada = formatarDataBr(final);
  const [diaInicial, mesInicial, anoInicial] = inicialFormatada.split("/");
  const [, mesFinal, anoFinal] = finalFormatada.split("/");

  if (mesInicial === mesFinal && anoInicial === anoFinal) {
    return `${diaInicial}–${finalFormatada}`;
  }
  return `${inicialFormatada} – ${finalFormatada}`;
}

const MESES_ABREV = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** Formata uma chave de período mensal (`YYYY-MM`, mesmo rótulo devolvido
 * pela dimensão `periodo` de `GET /distribuicoes`) como "jul/2026" — única
 * implementação (BI 4.0, extraída de `GradeGraficosExecutivos.formatarPeriodo`,
 * reaproveitada também por `insightsExecutivos.ts`, que é um módulo puro sem
 * acesso a componentes React). Entrada malformada devolve o mês bruto, nunca
 * lança (mesmo critério de `formatarDataBr`). */
export function formatarPeriodoMensal(chavePeriodo: string): string {
  const [ano, mes] = chavePeriodo.split("-");
  const indice = Number(mes) - 1;
  return `${MESES_ABREV[indice] ?? mes}/${ano}`;
}
