import { describe, expect, it } from "vitest";
import { ehArquivoPdf, filtrarSomentePdf } from "./arquivos";

function arquivo(nome: string): File {
  return new File(["conteudo"], nome);
}

describe("ehArquivoPdf", () => {
  it("aceita extensão .pdf em minúsculo", () => {
    expect(ehArquivoPdf("processo.pdf")).toBe(true);
  });

  it("aceita extensão .PDF em maiúsculo", () => {
    expect(ehArquivoPdf("PROCESSO.PDF")).toBe(true);
  });

  it("rejeita outras extensões", () => {
    expect(ehArquivoPdf("planilha.xlsx")).toBe(false);
    expect(ehArquivoPdf("imagem.png")).toBe(false);
    expect(ehArquivoPdf("documento")).toBe(false);
  });
});

describe("filtrarSomentePdf", () => {
  it("separa válidos e inválidos mantendo a ordem", () => {
    const arquivos = [arquivo("a.pdf"), arquivo("b.docx"), arquivo("c.pdf")];

    const { validos, invalidos } = filtrarSomentePdf(arquivos);

    expect(validos.map((a) => a.name)).toEqual(["a.pdf", "c.pdf"]);
    expect(invalidos.map((a) => a.name)).toEqual(["b.docx"]);
  });

  it("lista vazia devolve os dois grupos vazios", () => {
    const { validos, invalidos } = filtrarSomentePdf([]);
    expect(validos).toEqual([]);
    expect(invalidos).toEqual([]);
  });

  it("todos inválidos não vazam para o grupo de válidos", () => {
    const { validos, invalidos } = filtrarSomentePdf([arquivo("a.txt"), arquivo("b.jpg")]);
    expect(validos).toEqual([]);
    expect(invalidos).toHaveLength(2);
  });
});
