// Sprint 14.1 — gera o GIF de demonstração do README (docs/screenshots/demo.gif).
//
// Reaproveita a mesma automação de `capturar-screenshots.mjs` (sobe o app
// real — Vite + backend local + Electron via Playwright — e dirige o fluxo
// completo sobre os dados 100% sintéticos de `scripts/demo/`), mas em vez
// de uma screenshot por etapa, captura uma sequência de quadros fixos
// (1024x720, mesmo tamanho da janela do app) e monta um GIF com `gifenc`
// — encoder em JavaScript puro, sem nenhum binário nativo (ffmpeg,
// ImageMagick, gifski) — porque nenhuma dessas ferramentas está disponível
// no ambiente de desenvolvimento usado nesta Sprint. `gifenc` e `sharp`
// (já uma devDependency, usado hoje por `gerar-icone.mjs`) só são usados
// aqui, no processo de documentação — nunca no runtime do app nem no
// instalador distribuído (não fazem parte de nenhuma dependência de
// produção nem do pacote gerado por `npm run release`).
//
// Não é um vídeo contínuo: é um "slideshow" de estados reais do app, cada
// um seguro por um tempo perceptível (ver `MOMENTOS` abaixo) — suficiente
// para um GIF curto e fluido sem a complexidade de capturar/comprimir
// dezenas de quadros por segundo sem as ferramentas de vídeo usuais.
//
// Uso: `npm run gif` (a partir de `frontend/`). Mesmo pré-requisito de
// `npm run screenshots`: `python scripts/demo/gerar_demo.py` já ter sido
// rodado ao menos uma vez (este script chama de novo sozinho).
//
// Para regenerar o GIF depois de qualquer mudança visual no app, rode
// `npm run gif` de novo — nenhum passo manual além disso. Se algum dia
// ffmpeg/ImageMagick estiverem disponíveis no ambiente, este script pode
// ser trocado por uma gravação de vídeo real sem afetar nenhuma outra
// parte da documentação (o README só referencia o arquivo final
// `docs/screenshots/demo.gif`, não como ele foi gerado).

import { _electron as electron } from "playwright";
// `gifenc` é publicado como CommonJS — sem export nomeado no ESM, precisa
// importar o objeto default e desestruturar.
import gifenc from "gifenc";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const { GIFEncoder, quantize, applyPalette } = gifenc;

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = path.resolve(AQUI, "..");
const RAIZ_PROJETO = path.resolve(FRONTEND_DIR, "..");
const DEMO_DIR = path.join(RAIZ_PROJETO, "scripts", "demo");
const CAMINHO_GIF = path.join(RAIZ_PROJETO, "docs", "screenshots", "demo.gif");

const PDFS_DEMO = [
  "SEI_19.20.0009.0000201_2026_01.pdf",
  "SEI_19.20.0009.0000202_2026_02.pdf",
  "SEI_19.20.0009.0000203_2026_03.pdf",
].map((nome) => path.join(DEMO_DIR, "pdfs", nome));
const PLANILHA_DEMO = path.join(DEMO_DIR, "planilha_demo.xlsx");

// Mesmo CPF/período de `capturar-screenshots.mjs` — cadastrado na aba
// `Dados` (ver `scripts/demo/gerar_demo.py`), mas sem diária registrada
// para este período, então o diagnóstico dá sempre APTO_PARA_PROCESSAMENTO
// (fluxo feliz, com a Etapa 2 disponível para o GIF mostrar também a
// geração do histórico).
const CONFERENCIA_DEMO = {
  cpf: "111.111.111-11",
  periodoInicial: "1999-01-10",
  periodoFinal: "1999-01-10",
  sei: "19.20.0009.0000201/2026-01",
  origem: "Recife",
  destino: "Garanhuns",
};

// Janela nativa do app (`frontend/electron/main.ts`) — todo quadro sai
// deste mesmo tamanho, nunca `fullPage`, justamente para o GIF ter
// dimensão consistente em todos os quadros sem precisar de letterbox.
const LARGURA_JANELA = 1024;
const ALTURA_JANELA = 720;
// GIF final em 60% do tamanho da janela — arquivo leve o bastante para o
// README sem perder legibilidade do texto da interface.
const ESCALA_GIF = 0.6;

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

function executar(comando, args, cwd) {
  return new Promise((resolve, reject) => {
    const processo = spawn(comando, args, { cwd, shell: true, stdio: "inherit" });
    processo.on("exit", (codigo) => {
      if (codigo === 0) resolve();
      else reject(new Error(`${comando} ${args.join(" ")} saiu com código ${codigo}`));
    });
  });
}

class GravadorGif {
  constructor() {
    this.encoder = GIFEncoder();
    this.largura = Math.round(LARGURA_JANELA * ESCALA_GIF);
    this.altura = Math.round(ALTURA_JANELA * ESCALA_GIF);
  }

  /** Captura o estado atual da janela e prende esse quadro na tela por
   * `seguraMs` (delay do próprio quadro no GIF — não é uma pausa real na
   * automação). */
  async capturar(janela, rotulo, seguraMs) {
    // Mesma redação de `capturar-screenshots.mjs`: o painel de resultado
    // mostra o caminho absoluto local, que na máquina de geração inclui o
    // nome do usuário do Windows — não deve ir para um GIF público.
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

    const pngBuffer = await janela.screenshot({ fullPage: false });
    const { data } = await sharp(pngBuffer)
      .resize(this.largura, this.altura)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const paleta = quantize(data, 256);
    const indice = applyPalette(data, paleta);
    this.encoder.writeFrame(indice, this.largura, this.altura, { palette: paleta, delay: seguraMs });
    console.log(`  quadro: ${rotulo} (${seguraMs}ms)`);
  }

  salvar(caminho) {
    this.encoder.finish();
    writeFileSync(caminho, this.encoder.bytes());
  }
}

async function main() {
  mkdirSync(path.dirname(CAMINHO_GIF), { recursive: true });

  // `gerar_demo.py` sempre roda primeiro, sem depender de nada já existir —
  // este script funciona partindo de um checkout limpo, sem
  // `scripts/demo/pdfs`/`planilha_demo.xlsx` prévios. A checagem abaixo é
  // pós-condição (o gerador rodou mas não produziu o esperado), não
  // pré-requisito — checar `existsSync` ANTES de chamar `gerar_demo.py`
  // (erro corrigido na Sprint 14.1) quebrava justamente o caso de uso mais
  // comum: a primeira execução, num checkout novo.
  console.log("Gerando planilha/PDFs de demonstração...");
  const pythonBackend = path.join(RAIZ_PROJETO, "backend", ".venv", "Scripts", "python.exe");
  const python = existsSync(pythonBackend) ? pythonBackend : "python";
  await executar(python, ["gerar_demo.py"], DEMO_DIR);

  if (!existsSync(PLANILHA_DEMO)) {
    throw new Error(`gerar_demo.py rodou, mas ${PLANILHA_DEMO} não foi criada — verifique a saída acima.`);
  }

  console.log("Compilando o processo Electron (main/preload)...");
  await executar("npm.cmd", ["run", "build:electron"], FRONTEND_DIR);

  console.log("Subindo o Vite dev server...");
  const vite = spawn("npm.cmd", ["run", "dev:vite"], { cwd: FRONTEND_DIR, shell: true });
  vite.stdout.on("data", (d) => process.stdout.write(`[vite] ${d}`));
  vite.stderr.on("data", (d) => process.stderr.write(`[vite] ${d}`));

  const gravador = new GravadorGif();

  try {
    await aguardarPorta(5173);
    console.log("Vite pronto. Iniciando o Electron via Playwright...");

    const app = await electron.launch({ args: ["dist-electron/main.js"], cwd: FRONTEND_DIR });
    const janela = await app.firstWindow();
    await janela.setViewportSize({ width: LARGURA_JANELA, height: ALTURA_JANELA });

    await janela.getByRole("button", { name: "Começar" }).waitFor({ timeout: 30000 });
    await gravador.capturar(janela, "boas-vindas", 1600);

    await janela.getByRole("button", { name: "Começar" }).click();
    await janela.getByText("O que você precisa fazer agora?").waitFor({ timeout: 10000 });
    await janela
      .getByText("Aguardando o aplicativo terminar de iniciar")
      .waitFor({ state: "hidden", timeout: 30000 })
      .catch(() => {});
    await janela.waitForTimeout(400);
    await gravador.capturar(janela, "hub", 1300);

    await janela.getByRole("button", { name: /Processamento da Planilha/ }).click();
    await janela.getByText("Selecionar e Processar").waitFor({ timeout: 10000 });
    await janela.locator('input[type="file"][accept=".pdf"]').setInputFiles(PDFS_DEMO);
    await janela.getByText("SEI_19.20.0009.0000201_2026_01.pdf").waitFor({ timeout: 10000 });
    await gravador.capturar(janela, "selecao-pdfs", 1300);

    const botaoProcessar = janela.getByRole("button", { name: "Processar", exact: true });
    await botaoProcessar.waitFor({ state: "visible", timeout: 15000 });
    const cliqueProcessar = botaoProcessar.click();
    await janela.waitForTimeout(80);
    await gravador.capturar(janela, "processando-1", 250);
    await janela.waitForTimeout(300);
    await gravador.capturar(janela, "processando-2", 250);
    await cliqueProcessar;

    await janela.getByText("Total:").waitFor({ timeout: 30000 });
    await janela.waitForTimeout(400);
    await gravador.capturar(janela, "resultado", 1500);

    await janela.locator('input[type="file"][accept=".xlsx"]').setInputFiles(PLANILHA_DEMO);
    await janela.getByRole("button", { name: "Preencher planilha" }).click();
    await janela.getByText("Processamento concluído").waitFor({ timeout: 30000 });
    await janela.waitForTimeout(400);
    await gravador.capturar(janela, "preenchimento", 1600);

    console.log("Voltando ao Hub...");
    await janela.getByRole("button", { name: "Hub" }).click();
    await janela.getByText("O que você precisa fazer agora?").waitFor({ timeout: 10000 });
    await gravador.capturar(janela, "hub-2", 900);

    await janela.getByRole("button", { name: /Central Inteligente de Conferência/ }).click();
    await janela.getByText("Central de Conferência").waitFor({ timeout: 10000 });
    await janela.getByLabel("CPF do servidor").fill(CONFERENCIA_DEMO.cpf);
    await janela.getByLabel("Período inicial").fill(CONFERENCIA_DEMO.periodoInicial);
    await janela.getByLabel("Período final").fill(CONFERENCIA_DEMO.periodoFinal);
    await gravador.capturar(janela, "conferencia-formulario", 1000);

    await janela.getByRole("button", { name: "Realizar Conferência" }).click();
    await janela.getByRole("heading", { name: "APTO PARA PROCESSAMENTO" }).waitFor({ timeout: 15000 });
    await janela.waitForTimeout(300);
    await gravador.capturar(janela, "conferencia-checklist", 1700);

    await janela.getByLabel("Número do SEI").fill(CONFERENCIA_DEMO.sei);
    await janela.getByLabel("Origem").fill(CONFERENCIA_DEMO.origem);
    await janela.getByLabel("Destino").fill(CONFERENCIA_DEMO.destino);
    await janela.getByRole("button", { name: "Gerar Histórico" }).click();
    await janela.getByRole("heading", { name: "Histórico para o e-Fisco", exact: true }).waitFor({ timeout: 15000 });
    await janela.waitForTimeout(300);
    await gravador.capturar(janela, "conferencia-historico", 2200);

    await janela.getByRole("button", { name: "Hub" }).click();
    await janela.getByText("O que você precisa fazer agora?").waitFor({ timeout: 10000 });
    await gravador.capturar(janela, "hub-final", 1400);

    await app.close();

    gravador.salvar(CAMINHO_GIF);
    console.log(`GIF salvo em ${CAMINHO_GIF}`);
  } finally {
    await matarArvore(vite);
  }
}

// `vite.kill()` sozinho não basta no Windows — mesmo problema documentado em
// `capturar-screenshots.mjs`: `dev:vite` foi criado com `shell: true`, então
// `.kill()` só derruba o `cmd.exe` do meio, não a árvore inteira
// (`npm-cli.js`/`vite.js` sobrevivem como órfãos, seguram a porta 5173 e
// mantêm o event loop deste script vivo pelos streams ainda abertos —
// achado na validação da Sprint 14.1: rodar duas vezes seguidas travava).
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

main()
  .then(() => process.exit(0))
  .catch((erro) => {
    console.error(erro);
    process.exit(1);
  });
