// Canário anti-regressão P0 (Organização Automática de PDFs, correção
// pós-validação-manual): `preload.test.ts` mocka o módulo `electron`
// inteiro e roda `preload.ts` em Node puro — nesse ambiente
// `require("node:path")`/`require("path")` funcionam normalmente, então a
// suíte não detectou que o preload REAL, carregado dentro do processo
// sandboxado do Electron (padrão desde a v20, nunca desabilitado neste
// app), lança "module not found" para esses módulos e derruba a execução
// do script inteiro ANTES de `contextBridge.exposeInMainWorld` rodar —
// derrubando de uma vez `window.api` inteiro (por isso a regressão
// afetou também APIs antigas sem nenhuma relação com a mudança).
//
// Este teste compila `preload.ts` de verdade e o carrega no binário real
// do Electron (`node_modules/electron`, já uma devDependency do projeto),
// num `BrowserWindow` oculto, com as mesmas `webPreferences` de
// `main.ts` (nenhuma opção de sandbox sobrescrita — mesmo padrão real).
// Verifica duas coisas que nenhum outro teste cobre:
//   1. o preload carrega sem lançar exceção em runtime;
//   2. `window.api` expõe TODAS as chaves esperadas — se uma futura
//      alteração remover/renomear qualquer uma (de propósito ou por um
//      bug como este), este teste falha.
//
// Mais lento que os demais (inicia um processo Electron de verdade) —
// por isso isolado neste arquivo, nunca no `preload.test.ts` normal.
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import electronPathRaw from "electron";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const electronPath = electronPathRaw as unknown as string;

// Mesma lista de propriedades que `preload.ts` expõe hoje via
// `contextBridge.exposeInMainWorld("api", {...})` — o canário em si.
const CHAVES_ESPERADAS = [
  "getPathForFile",
  "abrirArquivo",
  "salvarComo",
  "salvarRelatorio",
  "copiarHistorico",
  "selecionarPlanilhaOficial",
  "copiarTexto",
  "abrirLinkExterno",
  "aoSolicitarFechamento",
  "confirmarFechamento",
  "selecionarPastaOperacional",
  "caminhoDentroDaPasta",
  // Micro-sprint 3E.1 — Relatório do Portal da Transparência.
  "obterCaminhoDecisoesRelatorioTransparencia",
  // Micro-sprint 3H — Template Oficial / geração do XLSX final.
  "obterCaminhoConfiguracaoTemplateRelatorioTransparencia",
  "escolherDestinoRelatorioTransparencia",
  // Micro-sprint UX operacional — persistência dos caminhos de Base de
  // Ordens Bancárias e Controle DIMCAC.
  "obterCaminhoConfiguracaoFontesRelatorioTransparencia",
].sort();

interface ResultadoSonda {
  hasApi: string;
  keys: string[];
  preloadErro: string | null;
}

function compilarPreloadParaComparar(): string {
  const origem = readFileSync(join(__dirname, "preload.ts"), "utf-8");
  const { outputText } = ts.transpileModule(origem, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  });
  return outputText;
}

const MAIN_SONDA = `
const { app, BrowserWindow } = require("electron");
const path = require("path");

app.whenReady().then(() => {
  let preloadErro = null;
  const win = new BrowserWindow({
    show: false,
    webPreferences: { preload: path.join(__dirname, "preload.js") },
  });
  win.webContents.on("preload-error", (_evento, _caminho, erro) => {
    preloadErro = erro.message;
  });
  win.loadURL("data:text/html,<h1>sonda</h1>");
  win.webContents
    .executeJavaScript(
      "JSON.stringify({ hasApi: typeof window.api, keys: window.api ? Object.keys(window.api) : [] })",
    )
    .then((resultadoJson) => {
      const parcial = JSON.parse(resultadoJson);
      console.log("RESULTADO_SONDA::" + JSON.stringify({ ...parcial, preloadErro }));
      app.quit();
    })
    .catch((erro) => {
      console.log(
        "RESULTADO_SONDA::" +
          JSON.stringify({ hasApi: "erro", keys: [], preloadErro: preloadErro || String(erro) }),
      );
      app.quit();
    });
});
`;

async function rodarPreloadNoElectronReal(): Promise<ResultadoSonda> {
  const dir = mkdtempSync(join(tmpdir(), "preload-sandbox-canario-"));
  writeFileSync(join(dir, "preload.js"), compilarPreloadParaComparar(), "utf-8");
  writeFileSync(join(dir, "main.js"), MAIN_SONDA, "utf-8");
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({ name: "preload-sandbox-canario", version: "1.0.0", main: "main.js" }),
    "utf-8",
  );

  const saida = await new Promise<string>((resolve, reject) => {
    const processo = spawn(electronPath, [dir], { timeout: 25000 });
    let stdout = "";
    let stderr = "";
    processo.stdout.on("data", (dado) => {
      stdout += dado.toString();
    });
    processo.stderr.on("data", (dado) => {
      stderr += dado.toString();
    });
    processo.on("error", reject);
    processo.on("close", () => resolve(stdout || stderr));
  });

  const linha = saida.split("\n").find((l) => l.includes("RESULTADO_SONDA::"));
  if (!linha) {
    throw new Error(
      `O processo Electron da sonda não produziu RESULTADO_SONDA::. Saída completa:\n${saida}`,
    );
  }
  return JSON.parse(linha.slice(linha.indexOf("RESULTADO_SONDA::") + "RESULTADO_SONDA::".length));
}

describe("preload — carregamento real no processo sandboxado do Electron (canário anti-regressão P0)", () => {
  it(
    "contextBridge expõe window.api com todas as chaves esperadas, sem erro de preload em runtime",
    async () => {
      const resultado = await rodarPreloadNoElectronReal();

      expect(
        resultado.preloadErro,
        `O preload lançou uma exceção em runtime dentro do processo sandboxado do Electron ` +
          `(nunca detectável por testes que mockam o módulo "electron" e rodam em Node puro): ` +
          `${resultado.preloadErro}`,
      ).toBeNull();
      expect(resultado.hasApi).toBe("object");
      expect(resultado.keys.slice().sort()).toEqual(CHAVES_ESPERADAS);
    },
    30000,
  );
});
