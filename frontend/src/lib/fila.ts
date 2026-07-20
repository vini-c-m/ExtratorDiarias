/** Gerenciamento da fila de PDFs selecionados — arrastar-e-soltar e o botão
 * "Selecionar PDFs" alimentam a mesma fila, então a deduplicação (por
 * caminho absoluto do arquivo, via `chaveDe`) vale para os dois em
 * conjunto: soltar de novo um PDF já selecionado pelo botão (ou vice-versa)
 * não duplica a entrada na fila. `chaveDe` é injetado (em vez de assumir
 * `window.api.getPathForFile`) para esta lógica ficar pura e testável fora
 * do Electron. */

export interface ItemFila {
  chave: string;
  arquivo: File;
}

export interface ResultadoAdicao {
  fila: ItemFila[];
  adicionados: number;
  duplicados: number;
}

export function adicionarArquivos(
  filaAtual: ItemFila[],
  novosArquivos: File[],
  chaveDe: (arquivo: File) => string,
): ResultadoAdicao {
  const chavesExistentes = new Set(filaAtual.map((item) => item.chave));
  const itensNovos: ItemFila[] = [];
  let duplicados = 0;

  for (const arquivo of novosArquivos) {
    const chave = chaveDe(arquivo);
    if (chavesExistentes.has(chave)) {
      duplicados += 1;
      continue;
    }
    chavesExistentes.add(chave);
    itensNovos.push({ chave, arquivo });
  }

  return {
    fila: [...filaAtual, ...itensNovos],
    adicionados: itensNovos.length,
    duplicados,
  };
}

export function removerArquivo(filaAtual: ItemFila[], chave: string): ItemFila[] {
  return filaAtual.filter((item) => item.chave !== chave);
}

export function limparFila(): ItemFila[] {
  return [];
}
