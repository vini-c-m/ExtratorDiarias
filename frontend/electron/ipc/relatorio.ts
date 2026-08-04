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

/** Sprint 19.7.5 — extraído de `nomeRelatorioSugerido` para reaproveitar a
 * mesma lógica de deduplicação com um nome/extensão arbitrários (Central
 * Analítica já chega aqui com o nome pronto, ex.: "Relatório Executivo -
 * 04-08-2026.pdf"), sem duplicar a busca por " (2)", " (3)", ... —
 * `nomeRelatorioSugerido` (abaixo) passa a ser só quem sabe montar o nome
 * *base* do Processamento, delegando a deduplicação em si para cá. */
function nomeArquivoDisponivel(
  nomeBase: string,
  existeArquivo: (caminho: string) => boolean,
  pasta: string,
): string {
  const extensao = path.extname(nomeBase);
  const semExtensao = extensao ? nomeBase.slice(0, -extensao.length) : nomeBase;

  let nome = nomeBase;
  let contador = 2;
  while (existeArquivo(path.join(pasta, nome))) {
    nome = `${semExtensao} (${contador})${extensao}`;
    contador += 1;
  }
  return nome;
}

// Segue o mesmo padrão do Windows para evitar sobrescrita acidental:
// "Relatório Processamento - DD-MM-AAAA.html", e se já existir, tenta
// " (2)", " (3)", ... até achar um nome livre na pasta de destino.
// Assinatura/comportamento público inalterados pela Sprint 19.7.5 (mesmos
// testes de `nomeRelatorioSugerido` continuam válidos sem alteração) —
// só o miolo de deduplicação foi extraído para `nomeArquivoDisponivel`.
export function nomeRelatorioSugerido(
  data: Date,
  existeArquivo: (caminho: string) => boolean,
  pasta: string,
): string {
  return nomeArquivoDisponivel(`Relatório Processamento - ${formatarData(data)}.html`, existeArquivo, pasta);
}

// Sprint 19.7.5 — filtro do diálogo nativo por extensão real do arquivo,
// não mais fixo em ".html". `html` preserva o rótulo já homologado do
// Processamento; os 3 formatos novos da Central Analítica (`POST
// /relatorios`, Sprint 19.7.2) entram aqui, sem inventar nome nenhum além
// do já usado no próprio formulário (`ModalRelatorio.tsx`: "PDF", "Excel
// (.xlsx)", "CSV").
const FILTRO_POR_EXTENSAO: Record<string, { name: string; extensions: string[] }> = {
  html: { name: "Relatório HTML", extensions: ["html"] },
  pdf: { name: "PDF", extensions: ["pdf"] },
  xlsx: { name: "Excel", extensions: ["xlsx"] },
  csv: { name: "CSV", extensions: ["csv"] },
};

function filtroParaNomeArquivo(nomeArquivo: string): { name: string; extensions: string[] } {
  const extensao = path.extname(nomeArquivo).replace(/^\./, "").toLowerCase();
  return FILTRO_POR_EXTENSAO[extensao] ?? { name: "Arquivo", extensions: extensao ? [extensao] : ["*"] };
}

/** Sprint 19.7.5 — generaliza o mesmo canal IPC já existente (`relatorio:
 * salvar-como`, nenhum canal novo criado) para servir tanto o relatório
 * HTML de Processamento quanto os relatórios PDF/Excel/CSV da Central
 * Analítica (`POST /relatorios`, Sprint 19.7.2): `nomeSugerido` é
 * **opcional** — quando ausente (chamada existente do Processamento,
 * `SelecionarProcessar.tsx`, nenhum call site alterado), o comportamento
 * é exatamente o mesmo de antes (`nomeRelatorioSugerido` + filtro HTML);
 * quando presente (Central Analítica, `useGerarRelatorio.ts`), o nome e o
 * filtro do diálogo nativo passam a refletir o formato real do arquivo
 * gerado (`RelatorioGeradoResposta.nome_sugerido`, já com a extensão
 * certa — 19.7.2). */
export function registrarIpcRelatorio(): void {
  ipcMain.handle(
    "relatorio:salvar-como",
    async (evento, caminhoOrigem: string, pastaResultados: string, nomeSugerido?: string) => {
      const janela = BrowserWindow.fromWebContents(evento.sender);
      const nomeDisponivel = nomeSugerido
        ? nomeArquivoDisponivel(nomeSugerido, existsSync, pastaResultados)
        : nomeRelatorioSugerido(new Date(), existsSync, pastaResultados);
      const opcoes = {
        defaultPath: path.join(pastaResultados, nomeDisponivel),
        filters: [filtroParaNomeArquivo(nomeDisponivel)],
      };
      const resultado = await (janela
        ? dialog.showSaveDialog(janela, opcoes)
        : dialog.showSaveDialog(opcoes));

      if (resultado.canceled || !resultado.filePath) return null;

      // Copia o artefato já gerado pelo backend — nunca gera um relatório
      // novo aqui, garantindo que visualização/prévia e arquivo salvo
      // sejam sempre exatamente o mesmo documento (Processamento e
      // Central Analítica, mesmo princípio para os dois).
      await fs.copyFile(caminhoOrigem, resultado.filePath);
      return {
        caminhoArquivo: resultado.filePath,
        pastaArquivo: path.dirname(resultado.filePath),
      };
    },
  );
}
