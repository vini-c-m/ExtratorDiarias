import { _electron as electron } from "playwright";
import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import net from "node:net";

delete process.env.ELECTRON_RUN_AS_NODE;
const vite = spawn("npm.cmd", ["run", "dev:vite"], { cwd: process.cwd(), shell: true });
await new Promise((resolve, reject) => {
  let n = 0;
  const tentar = () => {
    n += 1;
    const socket = net.createConnection(5173, "localhost");
    socket.once("connect", () => { socket.end(); resolve(); });
    socket.once("error", () => { socket.destroy(); n >= 60 ? reject(new Error("Vite indisponível")) : setTimeout(tentar, 500); });
  };
  tentar();
});

const app = await electron.launch({ args: ["dist-electron/main.js"], cwd: process.cwd() });
const page = await app.firstWindow();

async function navegar() {
  const comecar = page.getByRole("button", { name: "Começar" });
  await comecar.waitFor({ state: "visible", timeout: 30000 });
  await comecar.click();
  await page.getByText("O que você precisa fazer agora?").waitFor({ timeout: 30000 });
  await page.getByText("Aguardando o aplicativo terminar de iniciar").waitFor({ state: "hidden", timeout: 30000 }).catch(() => {});
  await page.getByRole("button", { name: /Central Analítica/ }).click();
  const modo = page.getByRole("button", { name: "Modo Executivo" });
  await modo.waitFor({ state: "visible", timeout: 30000 });
  await page.waitForFunction(() => ![...document.querySelectorAll("button")].find(b => b.textContent?.includes("Modo Executivo"))?.disabled, null, { timeout: 30000 });
  await modo.click();
  await page.getByRole("heading", { name: "Modo Executivo" }).waitFor({ timeout: 30000 });
  await page.waitForTimeout(1000);
}

async function medir(nome) {
  const main = await app.evaluate(({ BrowserWindow, screen }) => {
    const win = BrowserWindow.getAllWindows()[0];
    const bounds = win.getBounds();
    const contentBounds = win.getContentBounds();
    const display = screen.getDisplayMatching(bounds);
    return { bounds, contentBounds, zoomFactor: win.webContents.getZoomFactor(), url: win.webContents.getURL(), displayScaleFactor: display.scaleFactor };
  });
  const renderer = await page.evaluate((estado) => {
    const cockpit = document.querySelector('.cockpit-executivo');
    const hero = document.querySelector('.hero-executivo');
    const rail = document.querySelector('.rail-insights-executivo');
    const tape = document.querySelector('[data-testid="market-tape-continuo"]');
    const trilho = document.querySelector('.market-tape-trilho');
    const estilos = (el) => el ? getComputedStyle(el) : null;
    const retangulo = (el) => el ? { x: el.getBoundingClientRect().x, y: el.getBoundingClientRect().y, width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height } : null;
    const cssCockpit = estilos(cockpit);
    const cssTrilho = estilos(trilho);
    return {
      estado,
      innerWidth,
      innerHeight,
      devicePixelRatio,
      scrollY,
      media960: matchMedia('(min-width: 960px)').matches,
      media1024: matchMedia('(min-width: 1024px)').matches,
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      cockpit: retangulo(cockpit),
      hero: retangulo(hero),
      rail: retangulo(rail),
      tape: retangulo(tape),
      tapeDisplay: tape ? estilos(tape).display : null,
      gridTemplateColumns: cssCockpit?.gridTemplateColumns ?? null,
      animationName: cssTrilho?.animationName ?? null,
      animationPlayState: cssTrilho?.animationPlayState ?? null,
      transform: cssTrilho?.transform ?? null,
      distancia: trilho?.style.getPropertyValue('--market-tape-distancia') ?? null,
      classesCockpit: cockpit?.className ?? null,
      stylesheets: [...document.styleSheets].map(s => s.href ?? 'inline'),
    };
  }, nome);
  return { nome, main, renderer };
}

try {
  await navegar();
  const ruim = await medir('normal-sem-scroll-forcado');
  await page.screenshot({ path: '../comparacao-janela-ruim.png', fullPage: false });

  await page.setViewportSize({ width: 1024, height: 720 });
  await page.locator('.cockpit-executivo').scrollIntoViewIfNeeded();
  await page.mouse.move(5, 5);
  await page.waitForTimeout(500);
  const boa = await medir('validacao-playwright');
  await page.screenshot({ path: '../comparacao-janela-boa.png', fullPage: false });

  const resultado = { comandoHistoricoBom: 'node scripts/validar-sessao-npm-dev.mjs', ruim, boa };
  await writeFile('../comparacao-execucoes-bi.json', JSON.stringify(resultado, null, 2));
  console.log(JSON.stringify(resultado, null, 2));
} finally {
  await app.close();
  spawn("taskkill", ["/pid", String(vite.pid), "/T", "/F"], { shell: true });
}
