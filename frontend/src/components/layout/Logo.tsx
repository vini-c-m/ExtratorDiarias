// Sprint 07.1 — identidade visual definitiva do produto: monograma exclusivo
// "ED" (Extrator de Diárias), substituindo a marca abstrata de barras da
// Sprint 07. Um único caminho SVG (`fill-rule="evenodd"`), três sub-traçados:
//
//   1. Silhueta externa — um "D" fechado e arredondado (tronco reto à
//      esquerda + bojo semicircular à direita). É a leitura instantânea do
//      símbolo: à distância ou em tamanhos pequenos (favicon, 24px), só essa
//      silhueta aparece — um selo geométrico limpo, sem parecer letra nenhuma.
//   2. Um "buraco" (contracurva) recortado no bojo do D, mesma técnica de
//      espaço negativo de qualquer contraforma tipográfica (o "olho" de um
//      "D" de verdade).
//   3. Duas barras horizontais curtas, presas à parede esquerda desse
//      buraco, soltas do lado direito — dividem o vão em três faixas
//      horizontais que só aparecem de perto: a leitura de um "E" (tronco +
//      três braços), inteiramente contida dentro do "D". Nenhum traço é
//      literalmente desenhado como letra — a letra só emerge da geometria.
//
// Mesma peça em `public/brand/` (favicon, GitHub, documentação) — qualquer
// ajuste de proporção é uma linha só, aqui.
type Variante = "cor" | "mono-clara" | "mono-escura";

interface Props {
  variante?: Variante;
  className?: string;
}

/** Único caminho do monograma, viewBox 0 0 100 100 — reaproveitado por
 * todas as variantes (só o preenchimento muda). Consistente com o mesmo
 * SVG usado em `public/brand/*.svg`. */
export const CAMINHO_MONOGRAMA =
  "M 23 22 A 6 6 0 0 1 29 16 H 43 A 34 34 0 0 1 43 84 H 29 A 6 6 0 0 1 23 78 Z " +
  "M 47 39 A 10 10 0 0 1 67 39 L 67 61 A 10 10 0 0 1 47 61 Z " +
  "M 47 39 H 56 A 4 4 0 0 1 56 47 H 47 Z " +
  "M 47 53 H 56 A 4 4 0 0 1 56 61 H 47 Z";

const COR_PREENCHIMENTO: Record<Variante, string> = {
  cor: "url(#logo-gradiente-marca)",
  "mono-clara": "#FFFFFF",
  "mono-escura": "#0F172A",
};

export default function Logo({ variante = "cor", className }: Props) {
  return (
    <svg viewBox="0 0 100 100" role="img" aria-label="Extrator de Diárias" className={className}>
      {variante === "cor" && (
        <defs>
          {/* Degradê vertical (azul → ciano → roxo), conforme a identidade
           * oficial — confinado à extensão vertical real do símbolo
           * (y: 16 a 84), não ao viewBox inteiro, para o efeito ficar
           * elegante e não "esticado". */}
          <linearGradient id="logo-gradiente-marca" x1="50" y1="16" x2="50" y2="84" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#2563EB" />
            <stop offset="50%" stopColor="#06B6D4" />
            <stop offset="100%" stopColor="#8B5CF6" />
          </linearGradient>
        </defs>
      )}
      <path fillRule="evenodd" d={CAMINHO_MONOGRAMA} fill={COR_PREENCHIMENTO[variante]} />
    </svg>
  );
}
