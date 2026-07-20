/** Filtragem de arquivos por extensão — usada tanto no botão "Selecionar
 * PDFs" quanto no arrastar-e-soltar, já que o drag-and-drop não tem
 * equivalente ao atributo `accept` do input de arquivo. */

export function ehArquivoPdf(nome: string): boolean {
  return nome.toLowerCase().endsWith(".pdf");
}

export interface FiltroArquivos {
  validos: File[];
  invalidos: File[];
}

export function filtrarSomentePdf(arquivos: File[]): FiltroArquivos {
  const validos: File[] = [];
  const invalidos: File[] = [];

  for (const arquivo of arquivos) {
    if (ehArquivoPdf(arquivo.name)) {
      validos.push(arquivo);
    } else {
      invalidos.push(arquivo);
    }
  }

  return { validos, invalidos };
}
