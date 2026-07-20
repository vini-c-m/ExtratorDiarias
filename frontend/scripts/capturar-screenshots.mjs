// Sprint 10 — automação de captura das screenshots usadas no README.
//
// Sobe o app de verdade (Vite dev server + backend local, do jeito que
// `npm run dev` já faz) e usa o Electron real do projeto — via
// `playwright`'s `_electron` — para dirigir o fluxo completo: selecionar
// PDFs de demonstração (100% sintéticos, ver `scripts/demo/gerar_demo.py`),
// processar, revisar o resultado, preencher a planilha de demonstração e
// abrir o relatório gerado. Cada etapa é capturada na mesma janela
// (1024x720, tamanho fixo do app — ver `frontend/electron/main.ts`), então
// todas as imagens saem com a mesma resolução/zoom sem nenhum passo manual.
//
// Não usa nenhum documento real: os PDFs e a planilha vêm de
// `scripts/demo/`, gerados por um script Python dedicado, nunca dos
// mesmos dados usados nos testes automatizados nem de qualquer arquivo
// institucional.
//
// Uso: `npm run screenshots` (a partir de `frontend/`). Pré-requisito:
// `python scripts/demo/gerar_demo.py` já ter sido rodado (uma vez).

import { _electron as electron } from "playwright";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = path.resolve(AQUI, "..");
const RAIZ_PROJETO = path.resolve(FRONTEND_DIR, "..");
const DEMO_DIR = path.join(RAIZ_PROJETO, "scripts", "demo");
const PASTA_SCREENSHOTS = path.join(RAIZ_PROJETO, "docs", "screenshots");

const PDFS_DEMO = [
  "SEI_19.20.0009.0000201_2026_01.pdf",
  "SEI_19.20.0009.0000202_2026_02.pdf",
  "SEI_19.20.0009.0000203_2026_03.pdf",
].map((nome) => path.join(DEMO_DIR, "pdfs", nome));
const PLANILHA_DEMO = path.join(DEMO_DIR, "planilha_demo.xlsx");

function aguardarPorta(porta, tentativasMax = 60) {
  return new Promise((resolve, reject) => {
    let tentativas = 0;
    const tentar = () => {
      tentativas += 1;
      const socket = net.createConnection(porta, "localhost");
      socket.once("connect", () => {
        socket.end();
        resolve();
      });
      socket.once("error", () => {
        socket.destroy();
        if (tentativas >= tentativasMax) reject(new Error(`Porta ${porta} não respondeu a tempo`));
        else setTimeout(tentar, 500);
      });
    };
    tentar();
  });
}

async function main() {
  for (const pdf of PDFS_DEMO) {
    if (!existsSync(pdf)) {
      throw new Error(
        `PDF de demonstração não encontrado: ${pdf}\nRode primeiro: python scripts/demo/gerar_demo.py`,
      );
    }
  }
  if (!existsSync(PLANILHA_DEMO)) {
    throw new Error(
      `Planilha de demonstração não encontrada: ${PLANILHA_DEMO}\nRode primeiro: python scripts/demo/gerar_demo.py`,
    );
  }
  mkdirSync(PASTA_SCREENSHOTS, { recursive: true });

  // A planilha de demonstração é escrita IN PLACE pelo app (mesmo
  // comportamento da planilha oficial real) — sem regerá-la a cada
  // execução, a 2ª captura em diante veria os processos como duplicados.
  console.log("Gerando planilha/PDFs de demonstração...");
  const pythonBackend = path.join(RAIZ_PROJETO, "backend", ".venv", "Scripts", "python.exe");
  const python = existsSync(pythonBackend) ? pythonBackend : "python";
  await executar(python, ["gerar_demo.py"], DEMO_DIR);

  console.log("Compilando o processo Electron (main/preload)...");
  await executar("npm.cmd", ["run", "build:electron"], FRONTEND_DIR);

  console.log("Subindo o Vite dev server...");
  const vite = spawn("npm.cmd", ["run", "dev:vite"], { cwd: FRONTEND_DIR, shell: true });
  vite.stdout.on("data", (d) => process.stdout.write(`[vite] ${d}`));
  vite.stderr.on("data", (d) => process.stderr.write(`[vite] ${d}`));

  try {
    await aguardarPorta(5173);
    console.log("Vite pronto. Iniciando o Electron via Playwright...");

    const app = await electron.launch({
      args: ["dist-electron/main.js"],
      cwd: FRONTEND_DIR,
    });
    const janela = await app.firstWindow();
    await janela.setViewportSize({ width: 1024, height: 720 });

    await janela.getByText("Selecionar e Processar").waitFor({ timeout: 30000 });
    // Backend local sobe em paralelo à janela — aguarda o indicador de
    // status sair de "offline" antes de qualquer interação.
    await janela
      .getByText("Aguardando o aplicativo iniciar")
      .waitFor({ state: "hidden", timeout: 30000 })
      .catch(() => {});
    await janela.waitForTimeout(1000);

    await capturar(janela, "01-tela-inicial");

    console.log("Selecionando PDFs de demonstração...");
    await janela.locator('input[type="file"][accept=".pdf"]').setInputFiles(PDFS_DEMO);
    await janela.getByText("SEI_19.20.0009.0000201_2026_01.pdf").waitFor({ timeout: 10000 });
    await capturar(janela, "02-selecao-pdfs");

    console.log("Processando...");
    const botaoProcessar = janela.getByRole("button", { name: "Processar", exact: true });
    await botaoProcessar.waitFor({ state: "visible", timeout: 15000 });
    console.log("  botão Processar habilitado?", await botaoProcessar.isEnabled());
    const cliquePromise = botaoProcessar.click();
    await janela.waitForTimeout(60); // melhor esforço: captura em pleno andamento
    await capturar(janela, "03-processamento");
    await cliquePromise;

    console.log("  aguardando painel 'Preencher planilha'...");
    await janela.getByText("Total:").waitFor({ timeout: 30000 });
    console.log(
      "  headings visíveis:",
      await janela.locator("h2, h3").allTextContents(),
    );
    await janela.waitForTimeout(500);
    await capturar(janela, "04-resultado");

    console.log("Selecionando a planilha de demonstração...");
    await janela.locator('input[type="file"][accept=".xlsx"]').setInputFiles(PLANILHA_DEMO);
    await janela.getByRole("button", { name: "Preencher planilha" }).click();
    await janela.getByText("Processamento concluído").waitFor({ timeout: 30000 });
    await janela.waitForTimeout(500);
    await capturar(janela, "05-preenchimento-planilha");

    console.log("Localizando o relatório gerado...");
    const caminhoRelatorio = encontrarRelatorioMaisRecente();
    if (caminhoRelatorio) {
      await janela.goto(`file:///${caminhoRelatorio.replace(/\\/g, "/")}`);
      await janela.waitForTimeout(500);
      await capturar(janela, "06-relatorio");
    } else {
      console.warn("Relatório não encontrado em scripts/demo/resultado_*/relatorio.html — pulando.");
    }

    await app.close();
    console.log(`Screenshots salvas em ${PASTA_SCREENSHOTS}`);
  } finally {
    vite.kill();
  }
}

async function capturar(janela, nome) {
  // Página inteira, não só a janela 1024x720: o conteúdo cresce conforme o
  // fluxo avança (resultado, painel de planilha), e cortar no viewport
  // esconderia justamente o que a screenshot precisa mostrar. Largura
  // continua fixa (1024px) em todas — só a altura varia com o conteúdo.
  const caminho = path.join(PASTA_SCREENSHOTS, `${nome}.png`);
  await janela.screenshot({ path: caminho, fullPage: true });
  console.log(`  -> ${nome}.png`);
}

function encontrarRelatorioMaisRecente() {
  if (!existsSync(DEMO_DIR)) return null;
  const pastas = readdirSync(DEMO_DIR)
    .filter((nome) => nome.startsWith("resultado_"))
    .map((nome) => path.join(DEMO_DIR, nome))
    .filter((caminho) => statSync(caminho).isDirectory())
    .sort();
  if (pastas.length === 0) return null;
  const maisRecente = pastas[pastas.length - 1];
  const relatorio = path.join(maisRecente, "relatorio.html");
  return existsSync(relatorio) ? relatorio : null;
}

function executar(comando, args, cwd) {
  return new Promise((resolve, reject) => {
    const processo = spawn(comando, args, { cwd, shell: true, stdio: "inherit" });
    processo.on("exit", (codigo) => {
      if (codigo === 0) resolve();
      else reject(new Error(`${comando} ${args.join(" ")} saiu com código ${codigo}`));
    });
  });
}

main().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
