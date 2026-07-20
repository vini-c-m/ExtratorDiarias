import { BrowserWindow, dialog, ipcMain } from "electron";
import { existsSync } from "fs";
import * as fs from "fs/promises";
import * as path from "path";

function formatarData(data: Date): string {
  const dia = String(data.getDate()).padStart(2, "0");
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const ano = data.getFullYear();
  return `${dia}-${mes}-${ano}`;
}

// Segue o mesmo padrão do Windows para evitar sobrescrita acidental:
// "Relatório Processamento - DD-MM-AAAA.html", e se já existir, tenta
// " (2)", " (3)", ... até achar um nome livre na pasta de destino.
export function nomeRelatorioSugerido(
  data: Date,
  existeArquivo: (caminho: string) => boolean,
  pasta: string,
): string {
  const base = `Relatório Processamento - ${formatarData(data)}`;
  let nome = `${base}.html`;
  let contador = 2;
  while (existeArquivo(path.join(pasta, nome))) {
    nome = `${base} (${contador}).html`;
    contador += 1;
  }
  return nome;
}

export function registrarIpcRelatorio(): void {
  ipcMain.handle(
    "relatorio:salvar-como",
    async (evento, caminhoOrigem: string, pastaResultados: string) => {
      const janela = BrowserWindow.fromWebContents(evento.sender);
      const opcoes = {
        defaultPath: path.join(pastaResultados, nomeRelatorioSugerido(new Date(), existsSync, pastaResultados)),
        filters: [{ name: "Relatório HTML", extensions: ["html"] }],
      };
      const resultado = await (janela
        ? dialog.showSaveDialog(janela, opcoes)
        : dialog.showSaveDialog(opcoes));

      if (resultado.canceled || !resultado.filePath) return null;

      // Copia o HTML já gravado pelo backend — nunca gera um relatório
      // novo aqui, garantindo que visualização e arquivo salvo sejam
      // sempre exatamente o mesmo documento.
      await fs.copyFile(caminhoOrigem, resultado.filePath);
      return {
        caminhoArquivo: resultado.filePath,
        pastaArquivo: path.dirname(resultado.filePath),
      };
    },
  );
}
