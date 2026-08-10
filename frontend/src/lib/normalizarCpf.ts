/** Normalização de CPF para o Cadastro de Servidor/Membro pela Central de
 * Conferência — primeira normalização/validação de entrada de CPF no
 * frontend (`mascararCpf.ts` só formata para EXIBIÇÃO, nunca normaliza
 * entrada). Mesmo rigor já usado pelo backend
 * (`escritor_planilha._cpf_normalizado`): só extração de dígitos, sem
 * dígito verificador — nenhuma parte do projeto valida isso hoje, então
 * esta função não inventa uma regra nova. */
export function normalizarCpf(valor: string): string {
  return valor.replace(/\D/g, "");
}

/** Único critério de "CPF válido" já usado no projeto (backend e frontend):
 * 11 dígitos após normalizar — nunca dígito verificador. */
export function cpfValido(valor: string): boolean {
  return normalizarCpf(valor).length === 11;
}
