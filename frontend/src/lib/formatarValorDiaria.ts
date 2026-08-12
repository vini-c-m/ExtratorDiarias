// Micro-sprint A ("Valor Automático da Diária na Central de Conferência") —
// formata o valor calculado para exibição/cópia no e-Fisco: só o número,
// vírgula decimal (padrão brasileiro), sem "R$", sem separador de milhar
// (o e-Fisco espera um número puro para colar, mesmo formato do exemplo
// aprovado: "1386,81").
//
// O backend envia `Decimal` serializado como STRING (ex. "616.38", ponto
// decimal) de propósito — nunca `number` — para preservar a precisão exata
// ponta a ponta (ver `types/conferencia.ts`). Por isso a conversão aqui é
// uma troca de separador sobre o texto já correto, nunca uma nova
// formatação/arredondamento numérico: o valor exibido é sempre,
// literalmente, o mesmo que o backend calculou.
export function formatarValorDiariaCopiavel(valor: string): string {
  return valor.replace(".", ",");
}
