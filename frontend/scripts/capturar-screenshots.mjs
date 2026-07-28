// Sprint 10 — automação de captura das screenshots usadas no README.
// Sprint 14.1 — estendido para o fluxo completo de 4 telas (Boas-vindas →
// Hub → Processamento | Central de Conferência), que substituiu o antigo
// fluxo de tela única a partir da Sprint 14.
//
// Sobe o app de verdade (Vite dev server + backend local, do jeito que
// `npm run dev` já faz) e usa o Electron real do projeto — via
// `playwright`'s `_electron` — para dirigir o fluxo completo: Boas-vindas,
// Hub, processamento (selecionar PDFs de demonstração, processar, revisar
// o resultado, preencher a planilha, abrir o relatório) e Central de
// Conferência (diagnóstico + geração do histórico do e-Fisco). Cada etapa é
// capturada na mesma janela (1024x720, tamanho fixo do app — ver
// `frontend/electron/main.ts`), então todas as imagens saem com a mesma
// resolução/zoom sem nenhum passo manual.
//
// Não usa nenhum documento real: os PDFs e a planilha vêm de
// `scripts/demo/`, gerados por um script Python dedicado (que também
// cadastra os 3 servidores fictícios na aba `Dados`, Sprint 14.1 — sem
// isso a Central de Conferência só responderia "servidor não cadastrado"),
// nunca dos mesmos dados usados nos testes automatizados nem de qualquer
// arquivo institucional.
//
// Uso: `npm run screenshots` (a partir de `frontend/`). Pré-requisito:
// `python scripts/demo/gerar_demo.py` já ter sido rodado (uma vez — o
// script chama de novo sozinho, ver `main()` abaixo).
//
// Este mesmo fluxo é reaproveitado por `gerar-gif.mjs` (Sprint 14.1) para
// montar o GIF de demonstração do README — ver aquele arquivo para o
// motivo de não terem sido unificados num só script.

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

// Mesmo CPF do primeiro PDF de demonstração (`scripts/demo/gerar_demo.py`),
// já cadastrado na aba `Dados` — mas com um período que NÃO existe em
// `Controle de Diárias`, de propósito, para o diagnóstico dar
// APTO_PARA_PROCESSAMENTO (fluxo feliz, com Etapa 2 disponível) em vez de
// REVISAR por duplicidade. Ano de 1999 é deliberado: qualquer que seja a
// data em que este script rodar no futuro, a janela operacional (RN-06,
// período inicial − 15 dias) já estará liberada.
const CONFERENCIA_DEMO = {
  cpf: "111.111.111-11",
  periodoInicial: "1999-01-10",
  periodoFinal: "1999-01-10",
  sei: "19.20.0009.0000201/2026-01",
  origem: "Recife",
  destino: "Garanhuns",
};

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
  mkdirSync(PASTA_SCREENSHOTS, { recursive: true });

  // `gerar_demo.py` sempre roda primeiro, sem depender de nada já existir —
  // funciona partindo de um checkout limpo, sem `scripts/demo/pdfs`/
  // `planilha_demo.xlsx` prévios (a planilha é escrita IN PLACE pelo app, mas
  // regerá-la aqui no início de cada execução é o que evita que a 2ª captura
  // em diante veja os processos da execução anterior como duplicados). As
  // checagens abaixo são pós-condição (o gerador rodou mas não produziu o
  // esperado), não pré-requisito — checar `existsSync` ANTES de chamar
  // `gerar_demo.py` (erro corrigido na Sprint 14.1) quebrava justamente o
  // caso de uso mais comum: a primeira execução, num checkout novo.
  console.log("Gerando planilha/PDFs de demonstração...");
  const pythonBackend = path.join(RAIZ_PROJETO, "backend", ".venv", "Scripts", "python.exe");
  const python = existsSync(pythonBackend) ? pythonBackend : "python";
  await executar(python, ["gerar_demo.py"], DEMO_DIR);

  for (const pdf of PDFS_DEMO) {
    if (!existsSync(pdf)) {
      throw new Error(`gerar_demo.py rodou, mas ${pdf} não foi criado — verifique a saída acima.`);
    }
  }
  if (!existsSync(PLANILHA_DEMO)) {
    throw new Error(`gerar_demo.py rodou, mas ${PLANILHA_DEMO} não foi criada — verifique a saída acima.`);
  }

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

    await janela.getByRole("button", { name: "Começar" }).waitFor({ timeout: 30000 });
    await capturar(janela, "01-boas-vindas");

    console.log("Indo para o Hub...");
    await janela.getByRole("button", { name: "Começar" }).click();
    await janela.getByText("O que você precisa fazer agora?").waitFor({ timeout: 10000 });
    // Backend local sobe em paralelo à janela — aguarda o indicador de
    // status sair de "offline" antes de qualquer interação (Sprint 14: o
    // aviso passou a aparecer já no Hub, não mais só na 1ª funcionalidade).
    await janela
      .getByText("Aguardando o aplicativo terminar de iniciar")
      .waitFor({ state: "hidden", timeout: 30000 })
      .catch(() => {});
    await janela.waitForTimeout(1000);
    await capturar(janela, "02-hub");

    // `fluxoProcessamento` sempre termina de volta no Hub — não há botão
    // "← Hub" na própria tela do Hub (só existe dentro de cada
    // funcionalidade, ver `Cabecalho.tsx`), então essa responsabilidade é
    // de cada fluxo, não de `main()`.
    await fluxoProcessamento(janela);
    await fluxoConferencia(janela);

    await app.close();
    console.log(`Screenshots salvas em ${PASTA_SCREENSHOTS}`);
  } finally {
    await matarArvore(vite);
  }
}

// `vite.kill()` sozinho não basta no Windows: `dev:vite` foi criado com
// `shell: true` (`spawn("npm.cmd", ...)`), então o processo devolvido por
// `spawn` é o `cmd.exe` que envolve o `npm-cli.js`, que por sua vez sobe o
// `vite.js` de verdade — três processos, e o Windows não propaga sinal como
// o POSIX propaga para um grupo de processos. `.kill()` mata só o `cmd.exe`
// do meio; `npm-cli.js`/`vite.js` sobrevivem como órfãos, continuam
// segurando a porta 5173 (quebrando a próxima execução com "Port already in
// use") e mantêm o event loop deste script vivo pelos streams de
// stdout/stderr ainda abertos — o script nunca chega a encerrar sozinho
// (achado na validação da Sprint 14.1: rodar duas vezes seguidas falhava).
// `taskkill /T /F` mata a árvore inteira pelo PID raiz.
function matarArvore(processo) {
  if (!processo.pid) return Promise.resolve();
  if (process.platform !== "win32") {
    processo.kill();
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const matar = spawn("taskkill", ["/pid", String(processo.pid), "/T", "/F"], { shell: true });
    matar.on("exit", () => resolve());
    matar.on("error", () => resolve());
  });
}

async function fluxoProcessamento(janela) {
  console.log("Abrindo Processamento da Planilha...");
  await janela.getByRole("button", { name: /Processamento da Planilha/ }).click();
  await janela.getByText("Selecionar e Processar").waitFor({ timeout: 10000 });

  console.log("Selecionando PDFs de demonstração...");
  await janela.locator('input[type="file"][accept=".pdf"]').setInputFiles(PDFS_DEMO);
  await janela.getByText("SEI_19.20.0009.0000201_2026_01.pdf").waitFor({ timeout: 10000 });
  await capturar(janela, "03-selecao-pdfs");

  console.log("Processando...");
  const botaoProcessar = janela.getByRole("button", { name: "Processar", exact: true });
  await botaoProcessar.waitFor({ state: "visible", timeout: 15000 });
  const cliquePromise = botaoProcessar.click();
  await janela.waitForTimeout(60); // melhor esforço: captura em pleno andamento
  await capturar(janela, "04-processamento");
  await cliquePromise;

  console.log("  aguardando painel 'Preencher planilha'...");
  await janela.getByText("Total:").waitFor({ timeout: 30000 });
  await janela.waitForTimeout(500);
  await capturar(janela, "05-resultado");

  console.log("Selecionando a planilha de demonstração...");
  await janela.locator('input[type="file"][accept=".xlsx"]').setInputFiles(PLANILHA_DEMO);
  await janela.getByRole("button", { name: "Preencher planilha" }).click();
  await janela.getByText("Processamento concluído").waitFor({ timeout: 30000 });
  await janela.waitForTimeout(500);
  await capturar(janela, "06-preenchimento-planilha");

  console.log("Localizando o relatório gerado...");
  const caminhoRelatorio = encontrarRelatorioMaisRecente();
  if (caminhoRelatorio) {
    await janela.goto(`file:///${caminhoRelatorio.replace(/\\/g, "/")}`);
    await janela.waitForTimeout(500);
    await capturar(janela, "07-relatorio");
    // Volta para o app (a navegação acima trocou a página inteira da
    // janela para o HTML do relatório, uma navegação real de browser — não
    // troca de rota dentro da SPA, já que o app não usa `react-router`,
    // ver `App.tsx`). Isso remonta o React do zero, de volta à Boas-vindas
    // (estado inicial de `pagina`, sem persistência de propósito), então o
    // fluxo passa por ela de novo até o Hub.
    await janela.goto("http://localhost:5173");
    await janela.getByRole("button", { name: "Começar" }).waitFor({ timeout: 10000 });
    await janela.getByRole("button", { name: "Começar" }).click();
    await janela.getByText("O que você precisa fazer agora?").waitFor({ timeout: 10000 });
  } else {
    console.warn("Relatório não encontrado em scripts/demo/resultado_*/relatorio.html — pulando.");
    console.log("Voltando ao Hub...");
    await janela.getByRole("button", { name: "Hub" }).click();
    await janela.getByText("O que você precisa fazer agora?").waitFor({ timeout: 10000 });
  }
}

async function fluxoConferencia(janela) {
  console.log("Abrindo Central Inteligente de Conferência...");
  await janela.getByRole("button", { name: /Central Inteligente de Conferência/ }).click();
  await janela.getByText("Central de Conferência").waitFor({ timeout: 10000 });

  console.log("Preenchendo CPF e período...");
  await janela.getByLabel("CPF do servidor").fill(CONFERENCIA_DEMO.cpf);
  await janela.getByLabel("Período inicial").fill(CONFERENCIA_DEMO.periodoInicial);
  await janela.getByLabel("Período final").fill(CONFERENCIA_DEMO.periodoFinal);

  console.log("Realizando a conferência...");
  await janela.getByRole("button", { name: "Realizar Conferência" }).click();
  await janela.getByRole("heading", { name: "APTO PARA PROCESSAMENTO" }).waitFor({ timeout: 15000 });
  await janela.waitForTimeout(300);
  await capturar(janela, "08-conferencia-checklist");

  console.log("Gerando o histórico do e-Fisco...");
  await janela.getByLabel("Número do SEI").fill(CONFERENCIA_DEMO.sei);
  await janela.getByLabel("Origem").fill(CONFERENCIA_DEMO.origem);
  await janela.getByLabel("Destino").fill(CONFERENCIA_DEMO.destino);
  await janela.getByRole("button", { name: "Gerar Histórico" }).click();
  await janela.getByRole("heading", { name: "Histórico para o e-Fisco", exact: true }).waitFor({ timeout: 15000 });
  await janela.waitForTimeout(300);
  await capturar(janela, "09-conferencia-historico");
}

// O painel de resultado ("Pasta de resultados") e o relatório HTML mostram
// o caminho absoluto de arquivos locais — em produção isso é informação
// útil para o servidor, mas na máquina usada para gerar estas screenshots
// o caminho carrega o nome do usuário do Windows (`C:\Users\<nome>\...`),
// que não deve ir para um repositório público. Redige só o segmento do
// nome de usuário, mantendo o resto do caminho (que é só a estrutura do
// projeto, sem informação sensível) para a screenshot continuar realista.
async function redigirCaminhosLocais(janela) {
  await janela.evaluate(() => {
    const alvo = /([A-Za-z]:\\Users\\)[^\\]+(\\)/g;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (alvo.test(node.nodeValue)) {
        node.nodeValue = node.nodeValue.replace(alvo, "$1usuario$2");
      }
      alvo.lastIndex = 0;
    }
  });
}

async function capturar(janela, nome) {
  await redigirCaminhosLocais(janela);

  // Página inteira, não só a janela 1024x720: o conteúdo cresce conforme o
  // fluxo avança (resultado, painel de planilha, checklist), e cortar no
  // viewport esconderia justamente o que a screenshot precisa mostrar.
  // Largura continua fixa (1024px) em todas — só a altura varia com o
  // conteúdo.
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

main()
  .then(() => process.exit(0))
  .catch((erro) => {
    console.error(erro);
    process.exit(1);
  });
