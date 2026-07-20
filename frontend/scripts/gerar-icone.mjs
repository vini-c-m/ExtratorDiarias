// Sprint 08 — gera build/icon.ico a partir do monograma SVG já aprovado
// (public/brand/logo-color.svg, Sprint 07.1), sem depender de nenhuma
// ferramenta de design externa: rasteriza o SVG em cada resolução com
// `sharp` (rasterização vetorial determinística — nada de screenshot de
// navegador, que se mostrou instável em canvases pequenos/renderizações
// pontuais) e empacota tudo num único .ico com `png-to-ico`. Script de
// build, não faz parte do app em runtime.
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import pngToIco from "png-to-ico";

const TAMANHOS = [16, 32, 48, 64, 128, 256];
const svg = readFileSync(new URL("../public/brand/logo-color.svg", import.meta.url));

const pasta = mkdtempSync(path.join(tmpdir(), "icone-"));
const pngs = [];

for (const tamanho of TAMANHOS) {
  const caminhoPng = path.join(pasta, `${tamanho}.png`);
  await sharp(svg, { density: 512 }).resize(tamanho, tamanho).png().toFile(caminhoPng);
  pngs.push(caminhoPng);
}

const buffer = await pngToIco(pngs);
const destino = new URL("../build/icon.ico", import.meta.url);
writeFileSync(destino, buffer);
rmSync(pasta, { recursive: true, force: true });

console.log(`build/icon.ico gerado a partir de ${TAMANHOS.length} resoluções (${TAMANHOS.join(", ")}px).`);
