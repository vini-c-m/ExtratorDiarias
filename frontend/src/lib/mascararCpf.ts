/** Máscara de CPF para exibição no Detalhamento (`ui-arquitetura.md` § 0.7,
 * decisão vinculante: mascarado por padrão, sem mecanismo de revelar nesta
 * fase). Função pura, sem estado, sem efeito colateral — mesma categoria de
 * `lib/arquivos.ts`/`lib/progresso.ts`.
 *
 * Formato (`ui-wireframes.md` § 3, rascunho ainda sujeito a validação com o
 * DIMCAC): últimos 2 dígitos visíveis, resto asterisco — "***.***.***-11".
 * O backend sempre devolve o CPF como 11 dígitos sem pontuação
 * (`validacao_diaria._cpf_valido`) — aceita também uma entrada já formatada
 * (remove qualquer caractere não numérico antes de mascarar).
 *
 * Entrada malformada (não são 11 dígitos) nunca lança — devolve o valor
 * original sem máscara, para nunca esconder um dado inesperado atrás de um
 * placeholder silencioso. */
export function mascararCpf(cpf: string): string {
  const digitos = cpf.replace(/\D/g, "");
  if (digitos.length !== 11) return cpf;

  const ultimosDoisDigitos = digitos.slice(-2);
  return `***.***.***-${ultimosDoisDigitos}`;
}
