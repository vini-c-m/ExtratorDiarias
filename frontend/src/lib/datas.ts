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
