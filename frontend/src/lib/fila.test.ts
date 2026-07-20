import { describe, expect, it } from "vitest";
import { adicionarArquivos, limparFila, removerArquivo, type ItemFila } from "./fila";

function arquivo(nome: string): File {
  return new File(["conteudo"], nome);
}

// Nos testes, a "chave" é só o nome do arquivo — no app real é o caminho
// absoluto (via window.api.getPathForFile), mas a lógica de fila não
// precisa saber disso: só recebe um extrator de chave.
const chaveDe = (arquivo: File) => arquivo.name;

describe("adicionarArquivos", () => {
  it("adiciona arquivos novos a uma fila vazia", () => {
    const resultado = adicionarArquivos([], [arquivo("a.pdf"), arquivo("b.pdf")], chaveDe);

    expect(resultado.fila.map((item) => item.chave)).toEqual(["a.pdf", "b.pdf"]);
    expect(resultado.adicionados).toBe(2);
    expect(resultado.duplicados).toBe(0);
  });

  it("ignora um PDF já presente na fila (botão depois de já ter arrastado o mesmo arquivo)", () => {
    const filaInicial = adicionarArquivos([], [arquivo("a.pdf")], chaveDe).fila;

    const resultado = adicionarArquivos(filaInicial, [arquivo("a.pdf"), arquivo("b.pdf")], chaveDe);

    expect(resultado.fila.map((item) => item.chave)).toEqual(["a.pdf", "b.pdf"]);
    expect(resultado.adicionados).toBe(1);
    expect(resultado.duplicados).toBe(1);
  });

  it("ignora duplicados dentro do mesmo lote arrastado de uma vez", () => {
    const resultado = adicionarArquivos([], [arquivo("a.pdf"), arquivo("a.pdf")], chaveDe);

    expect(resultado.fila).toHaveLength(1);
    expect(resultado.adicionados).toBe(1);
    expect(resultado.duplicados).toBe(1);
  });

  it("não modifica a fila original (imutável)", () => {
    const filaInicial = adicionarArquivos([], [arquivo("a.pdf")], chaveDe).fila;
    const filaOriginalCopia = [...filaInicial];

    adicionarArquivos(filaInicial, [arquivo("b.pdf")], chaveDe);

    expect(filaInicial).toEqual(filaOriginalCopia);
  });
});

describe("removerArquivo", () => {
  it("remove só o item com a chave indicada, preservando os demais", () => {
    const fila: ItemFila[] = [
      { chave: "a.pdf", arquivo: arquivo("a.pdf") },
      { chave: "b.pdf", arquivo: arquivo("b.pdf") },
      { chave: "c.pdf", arquivo: arquivo("c.pdf") },
    ];

    const resultado = removerArquivo(fila, "b.pdf");

    expect(resultado.map((item) => item.chave)).toEqual(["a.pdf", "c.pdf"]);
  });

  it("chave inexistente não altera a fila", () => {
    const fila: ItemFila[] = [{ chave: "a.pdf", arquivo: arquivo("a.pdf") }];
    const resultado = removerArquivo(fila, "nao-existe.pdf");
    expect(resultado).toEqual(fila);
  });
});

describe("limparFila", () => {
  it("devolve uma fila vazia", () => {
    expect(limparFila()).toEqual([]);
  });
});
