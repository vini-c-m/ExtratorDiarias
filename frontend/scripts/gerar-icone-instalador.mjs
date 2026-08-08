// Correção do bug de distribuição (2026-08-07) — causa raiz confirmada:
// o Setup.exe e o app instalado compartilhavam o MESMO ícone (e o mesmo
// ProductName/FileDescription, que o electron-builder não permite
// diferenciar por config). Resultado: indistinguíveis na busca do Menu
// Iniciar do Windows — o usuário clica no Setup (baixado, ex.: em
// Downloads) pensando que é o app instalado, e o instalador reabre.
//
// Este script gera um ícone SÓ do instalador: o mesmo monograma (para
// continuar reconhecível como o produto), com um selo de "instalador"
// (seta para uma bandeja, símbolo universal de download/instalação) no
// canto inferior direito — visualmente distinto do ícone do app em
// qualquer lugar do Windows (Explorer, Busca, Barra de Tarefas).
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import pngToIco from "png-to-ico";

const TAMANHOS = [16, 32, 48, 64, 128, 256];
const svgLogo = readFileSync(new URL("../public/brand/logo-color.svg", import.meta.url));

function svgSelo(tamanho) {
  // Selo circular (seta para bandeja) ocupando ~45% do canto inferior
  // direito — proporção fixa em relação ao tamanho final do ícone, para
  // ficar legível também em 16px.
  const r = tamanho * 0.32;
  const cx = tamanho - r - tamanho * 0.02;
  const cy = tamanho - r - tamanho * 0.02;
  return Buffer.from(`
    <svg width="${tamanho}" height="${tamanho}" xmlns="http://www.w3.org/2000/svg">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="#1d4ed8" stroke="#ffffff" stroke-width="${r * 0.12}"/>
      <g stroke="#ffffff" stroke-width="${r * 0.22}" fill="none" stroke-linecap="round" stroke-linejoin="round">
        <line x1="${cx}" y1="${cy - r * 0.55}" x2="${cx}" y2="${cy + r * 0.15}"/>
        <polyline points="${cx - r * 0.35},${cy - r * 0.1} ${cx},${cy + r * 0.3} ${cx + r * 0.35},${cy - r * 0.1}"/>
        <line x1="${cx - r * 0.5}" y1="${cy + r * 0.55}" x2="${cx + r * 0.5}" y2="${cy + r * 0.55}"/>
      </g>
    </svg>
  `);
}

const pasta = mkdtempSync(path.join(tmpdir(), "icone-instalador-"));
const pngs = [];

for (const tamanho of TAMANHOS) {
  const caminhoPng = path.join(pasta, `${tamanho}.png`);
  const base = await sharp(svgLogo, { density: 512 }).resize(tamanho, tamanho).png().toBuffer();
  await sharp(base)
    .composite([{ input: svgSelo(tamanho), top: 0, left: 0 }])
    .png()
    .toFile(caminhoPng);
  pngs.push(caminhoPng);
}

const buffer = await pngToIco(pngs);
const destino = new URL("../build/icon-installer.ico", import.meta.url);
writeFileSync(destino, buffer);
rmSync(pasta, { recursive: true, force: true });

console.log(`build/icon-installer.ico gerado (${TAMANHOS.length} resoluções).`);
