import { useEffect, useRef, type CSSProperties } from "react";
import { CAMINHO_MONOGRAMA } from "./Logo";

// Sprint 09.1/09.2/09.3 — camada puramente decorativa da identidade "Neon
// Tech UI", com leve parallax ao mover o mouse (`camadaParallaxRef`).
//
// Sprint 14 — decisão oficial (ver `docs/branding/README.md` § "Fundo
// decorativo"): os monogramas deixam de ser um detalhe descartável e
// passam a fazer parte permanente da identidade visual. O fundo agora é
// **uma cena com três camadas integradas**, sempre nesta ordem de
// prioridade visual (a maior por último no DOM, para nunca ficar coberta
// por uma camada de menor prioridade num overlap raro):
//
//   1. Campo estrelado (`CAMPO_ESTELAR`, Sprint 09.3, mantido) — a camada
//      mais discreta, textura de fundo.
//   2. Partículas luminosas (`PARTICULAS_LUMINOSAS`, nova) — poucos brilhos
//      difusos, camada intermediária de atmosfera/profundidade.
//   3. Logos holográficos (`MONOGRAMAS`) — a marca d'água, maior presença
//      das três camadas de fundo (mas sempre abaixo do logo principal e do
//      conteúdo real da tela, que continuam fora deste componente).
//
// As três compartilham a mesma família de cor (ciano/violeta da marca) e a
// mesma composição "orgânica" de posição/tamanho/opacidade — deliberado,
// para nunca lerem como três efeitos independentes, e sim como uma única
// cena. Continua vivendo na mesma camada de parallax, fixa atrás de todo o
// conteúdo (`App.tsx` empilha o resto da UI num wrapper `relative z-10`),
// `pointer-events-none` de ponta a ponta.

interface Monograma {
  top: string;
  left: string;
  tamanho: number;
  rotacao: number;
  opacidade: number;
  /** Sprint 14 — variação por peça da intensidade do próprio glow (não
   * amarrada ao tamanho), parte da "profundidade" pedida: nenhuma peça deve
   * brilhar exatamente igual à vizinha. Faixa estreita (0.85–1.2) — "nada
   * exagerado". */
  intensidadeGlow: number;
  /** Só documentação — qual papel esta peça cumpre na composição. */
  papel: string;
}

// Sprint 09.1 — composição desenhada à mão (grade solta de 4×3 zonas,
// nunca alinhada em grade perceptível, âncoras grandes nos cantos + peças
// pequenas nas bordas/entrelinhas, rotação em leque a partir do centro).
// Posições e tamanhos preservados na Sprint 14 (a composição espacial já
// funcionava); o que muda é o acabamento — ver `intensidadeGlow` e o
// tratamento de traço/glow no render abaixo, em vez de preenchimento
// borrado.
const MONOGRAMAS: Monograma[] = [
  { papel: "âncora superior-esquerda, grande", top: "-6%", left: "-4%", tamanho: 260, rotacao: -11, opacidade: 0.08, intensidadeGlow: 1.15 },
  { papel: "âncora superior-direita, grande", top: "-8%", left: "82%", tamanho: 240, rotacao: 12, opacidade: 0.075, intensidadeGlow: 0.95 },
  { papel: "recorte na borda superior, pequena", top: "-6%", left: "34%", tamanho: 140, rotacao: -6, opacidade: 0.055, intensidadeGlow: 1.05 },

  { papel: "recorte na borda direita, média", top: "34%", left: "92%", tamanho: 200, rotacao: 9, opacidade: 0.065, intensidadeGlow: 0.9 },
  { papel: "meio-direita inferior, pequena, recorte na borda", top: "64%", left: "97%", tamanho: 150, rotacao: 13, opacidade: 0.055, intensidadeGlow: 1.1 },

  { papel: "âncora inferior-direita, grande", top: "96%", left: "88%", tamanho: 250, rotacao: 8, opacidade: 0.08, intensidadeGlow: 1.0 },
  { papel: "âncora inferior-esquerda, média", top: "92%", left: "6%", tamanho: 210, rotacao: -9, opacidade: 0.07, intensidadeGlow: 1.15 },
  { papel: "recorte na borda inferior, pequena", top: "98%", left: "56%", tamanho: 130, rotacao: 5, opacidade: 0.05, intensidadeGlow: 0.9 },

  { papel: "recorte na borda esquerda, média", top: "46%", left: "-6%", tamanho: 190, rotacao: -13, opacidade: 0.065, intensidadeGlow: 1.05 },
  { papel: "meio-esquerda superior, pequena", top: "16%", left: "10%", tamanho: 150, rotacao: -6, opacidade: 0.055, intensidadeGlow: 0.95 },

  { papel: "entrelinha superior-direita, pequena", top: "22%", left: "70%", tamanho: 160, rotacao: 7, opacidade: 0.055, intensidadeGlow: 1.1 },
  { papel: "entrelinha inferior-esquerda, pequena", top: "74%", left: "24%", tamanho: 145, rotacao: -8, opacidade: 0.05, intensidadeGlow: 1.0 },
];

type EstiloComVariaveis = CSSProperties & Record<`--${string}`, string | number>;

type TipoEstrela = "poeira" | "ciano" | "roxo" | "sparkle";

interface Estrela {
  top: number;
  left: number;
  tamanho: number;
  tipo: TipoEstrela;
  opacidadeBase: number;
  /** Só uma fração cintila (ver `gerarCampoEstelar`) — a maioria fica com
   * brilho fixo, senão o campo inteiro parece piscando ao mesmo tempo. */
  cintila: boolean;
  duracaoCintilarS: number;
  atrasoCintilarS: number;
}

// PRNG determinístico (mulberry32) só para gerar o campo uma única vez, na
// carga do módulo — nunca `Math.random()` a cada render, o que faria as
// estrelas "pularem" de posição a cada re-render do componente.
function criarGeradorPseudoAleatorio(semente: number) {
  let estado = semente;
  return function proximoAleatorio(): number {
    estado |= 0;
    estado = (estado + 0x6d2b79f5) | 0;
    let t = Math.imul(estado ^ (estado >>> 15), 1 | estado);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const aleatorio = criarGeradorPseudoAleatorio(0x09032026);
function entre(minimo: number, maximo: number): number {
  return minimo + aleatorio() * (maximo - minimo);
}

// Sprint 09.3 — "campo estelar tecnológico": ~100–120 estrelas em quatro
// categorias que criam hierarquia visual entre si:
//  - maioria (poeira, 1px) — brilho discreto;
//  - quantidade menor (ciano, 2px) — glow ciano;
//  - poucas (roxo, 3px) — glow roxo;
//  - só algumas (4–8, sparkle "✦") — simulam estrelas mais intensas.
// ~1 em cada 3 estrelas ganha uma cintilação própria — oscilação lenta
// (6–12s) e suave de opacidade, nunca abrupta, com atraso aleatório para
// não sincronizar.
//
// Sprint 14 — auditoria encontrou a causa raiz do "parece pixel preto"
// relatado: a categoria `poeira` (70 das ~112 estrelas, a maioria do
// campo) nunca teve entrada em `GLOW_POR_TIPO` — um círculo de 1px sem
// nenhum halo, com opacidade mínima de 0,15, não tem massa visual
// suficiente para ler como ponto de luz. Toda categoria ganha glow mínimo
// agora (ver `GLOW_POR_TIPO` abaixo) e o piso de opacidade da poeira sobe
// de 0,15 para 0,25 — nenhuma estrela deste campo pode mais renderizar sem
// nenhum brilho.
function gerarCampoEstelar(): Estrela[] {
  const categorias: Array<{
    tipo: TipoEstrela;
    quantidade: number;
    tamanho: number;
    opacidade: [number, number];
  }> = [
    { tipo: "poeira", quantidade: 70, tamanho: 1, opacidade: [0.25, 0.45] },
    { tipo: "ciano", quantidade: 26, tamanho: 2, opacidade: [0.35, 0.55] },
    { tipo: "roxo", quantidade: 10, tamanho: 3, opacidade: [0.4, 0.6] },
    { tipo: "sparkle", quantidade: 6, tamanho: 11, opacidade: [0.55, 0.8] },
  ];

  const estrelas: Estrela[] = [];
  for (const categoria of categorias) {
    for (let indice = 0; indice < categoria.quantidade; indice += 1) {
      estrelas.push({
        top: entre(2, 98),
        left: entre(2, 98),
        tamanho: categoria.tamanho,
        tipo: categoria.tipo,
        opacidadeBase: entre(categoria.opacidade[0], categoria.opacidade[1]),
        cintila: aleatorio() < 0.35,
        duracaoCintilarS: entre(6, 12),
        atrasoCintilarS: entre(0, 10),
      });
    }
  }
  return estrelas;
}

const CAMPO_ESTELAR = gerarCampoEstelar();

// Sprint 14 — toda categoria tem glow agora (era só ciano/roxo); poeira
// ganha um halo muito pequeno (2px), suficiente para nunca mais ler como
// "pixel apagado" sem se tornar uma segunda categoria "ciano".
const GLOW_POR_TIPO: Record<Exclude<TipoEstrela, "sparkle">, string> = {
  poeira: "0 0 2px 0.5px rgb(226 232 255 / 0.65)",
  ciano: "0 0 4px 1px rgb(34 211 238 / 0.6)",
  roxo: "0 0 6px 1.5px rgb(168 85 247 / 0.55)",
};

interface Particula {
  top: number;
  left: number;
  tamanho: number;
  desfoque: number;
  opacidadeBase: number;
  cor: "ciano" | "violeta" | "branca";
  cintila: boolean;
  duracaoCintilarS: number;
  atrasoCintilarS: number;
}

// Sprint 14 — nova camada intermediária pedida na decisão oficial: "poucas,
// suaves, glow difuso maior que uma estrela — nunca competem com os
// logos". Continua consumindo o mesmo PRNG do módulo (determinístico, sem
// "pular" entre renders) — poucas peças (12) de propósito, para não
// competir em quantidade com o campo estelar nem com os logos.
function gerarParticulasLuminosas(): Particula[] {
  const cores: Particula["cor"][] = ["ciano", "violeta", "branca"];
  const quantidade = 12;
  const particulas: Particula[] = [];
  for (let indice = 0; indice < quantidade; indice += 1) {
    particulas.push({
      top: entre(4, 96),
      left: entre(4, 96),
      tamanho: entre(14, 32),
      desfoque: entre(10, 20),
      opacidadeBase: entre(0.06, 0.15),
      cor: cores[Math.floor(entre(0, cores.length))],
      cintila: aleatorio() < 0.5,
      duracaoCintilarS: entre(9, 16),
      atrasoCintilarS: entre(0, 12),
    });
  }
  return particulas;
}

const PARTICULAS_LUMINOSAS = gerarParticulasLuminosas();

const COR_PARTICULA: Record<Particula["cor"], string> = {
  ciano: "34 211 238",
  violeta: "167 139 250",
  branca: "226 232 255",
};

function estiloCintilarDe(
  opacidadeBase: number,
  cintila: boolean,
  duracaoS: number,
  atrasoS: number,
): EstiloComVariaveis | undefined {
  if (!cintila) return undefined;
  return {
    "--estrela-opacidade-min": String(opacidadeBase * 0.5),
    "--estrela-opacidade-max": String(Math.min(opacidadeBase * 1.6, 0.95)),
    animation: `estrela-cintilar ${duracaoS.toFixed(2)}s ease-in-out ${atrasoS.toFixed(2)}s infinite`,
  };
}

// Deslocamento máximo do parallax — 2 a 3px, exatamente o pedido pela
// Sprint 09 ("apenas para dar profundidade"), nunca mais que isso.
const PARALLAX_MAX_PX = 3;

export default function FundoDecorativo() {
  const camadaParallaxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const reduzMovimento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduzMovimento) return;

    const camada = camadaParallaxRef.current;
    if (!camada) return;

    let quadroAgendado = false;
    let ultimoX = 0;
    let ultimoY = 0;

    function aplicarParallax() {
      quadroAgendado = false;
      camada!.style.transform = `translate3d(${ultimoX}px, ${ultimoY}px, 0)`;
    }

    // rAF-throttled: a posição do mouse chega a cada `mousemove`, mas o
    // `transform` só é aplicado uma vez por quadro — nunca mais de um
    // deslocamento de layer por frame, custo desprezível mesmo em janelas
    // grandes do Electron.
    function aoMoverMouse(evento: MouseEvent) {
      const proporcaoX = evento.clientX / window.innerWidth - 0.5;
      const proporcaoY = evento.clientY / window.innerHeight - 0.5;
      ultimoX = proporcaoX * PARALLAX_MAX_PX * 2;
      ultimoY = proporcaoY * PARALLAX_MAX_PX * 2;
      if (!quadroAgendado) {
        quadroAgendado = true;
        requestAnimationFrame(aplicarParallax);
      }
    }

    window.addEventListener("mousemove", aoMoverMouse, { passive: true });
    return () => window.removeEventListener("mousemove", aoMoverMouse);
  }, []);

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {/* Gradiente único compartilhado por todos os logos holográficos —
          definido uma vez e referenciado por `url(#logo-holografico)` em
          cada `<path>`, em vez de repetir o mesmo `<linearGradient>` 12
          vezes. Mesmos tons do gradiente de marca (`--gradient-marca`). */}
      <svg width="0" height="0" focusable="false">
        <defs>
          <linearGradient id="logo-holografico" x1="50" y1="16" x2="50" y2="84" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#2563EB" />
            <stop offset="50%" stopColor="#06B6D4" />
            <stop offset="100%" stopColor="#8B5CF6" />
          </linearGradient>
        </defs>
      </svg>

      <div ref={camadaParallaxRef} className="absolute inset-0 will-change-transform">
        {/* Camada 1 — campo estrelado (a mais discreta das três). */}
        {CAMPO_ESTELAR.map((estrela, indice) => {
          const classeCintilar = estrela.cintila ? " estrela-cintilante" : "";
          const estiloBase: EstiloComVariaveis = {
            top: `${estrela.top}%`,
            left: `${estrela.left}%`,
            transform: "translate(-50%, -50%)",
            opacity: estrela.cintila ? undefined : estrela.opacidadeBase,
            ...estiloCintilarDe(estrela.opacidadeBase, estrela.cintila, estrela.duracaoCintilarS, estrela.atrasoCintilarS),
          };

          if (estrela.tipo === "sparkle") {
            return (
              <span
                key={indice}
                className={`absolute select-none leading-none text-cyan-100${classeCintilar}`}
                style={{
                  ...estiloBase,
                  fontSize: estrela.tamanho,
                  textShadow: "0 0 6px rgb(255 255 255 / 0.75), 0 0 12px rgb(125 211 252 / 0.45)",
                }}
              >
                ✦
              </span>
            );
          }

          return (
            <span
              key={indice}
              className={`absolute rounded-full bg-slate-100${classeCintilar}`}
              style={{
                ...estiloBase,
                width: estrela.tamanho,
                height: estrela.tamanho,
                boxShadow: GLOW_POR_TIPO[estrela.tipo],
              }}
            />
          );
        })}

        {/* Camada 2 — partículas luminosas (atmosfera/profundidade). */}
        {PARTICULAS_LUMINOSAS.map((particula, indice) => {
          const classeCintilar = particula.cintila ? " estrela-cintilante" : "";
          const cor = COR_PARTICULA[particula.cor];
          const estilo: EstiloComVariaveis = {
            top: `${particula.top}%`,
            left: `${particula.left}%`,
            width: particula.tamanho,
            height: particula.tamanho,
            transform: "translate(-50%, -50%)",
            background: `radial-gradient(circle, rgb(${cor} / 0.9), rgb(${cor} / 0.25) 55%, transparent 75%)`,
            filter: `blur(${particula.desfoque.toFixed(1)}px)`,
            opacity: particula.cintila ? undefined : particula.opacidadeBase,
            ...estiloCintilarDe(particula.opacidadeBase, particula.cintila, particula.duracaoCintilarS, particula.atrasoCintilarS),
          };
          return <span key={indice} className={`absolute rounded-full${classeCintilar}`} style={estilo} />;
        })}

        {/* Camada 3 — logos holográficos (maior presença das três camadas
            de fundo). Sprint 14: contorno (traço), não preenchimento —
            nítido em qualquer opacidade, sem depender de blur para
            "amaciar" uma forma cheia. O glow vem só do `filter`
            (drop-shadow em duas camadas, mesma fórmula de intensidade dos
            tokens oficiais — núcleo curto + auréola mais larga), nunca do
            próprio traço, que fica sempre nítido. */}
        {MONOGRAMAS.map((monograma) => {
          const nucleo = (2.4 * monograma.intensidadeGlow).toFixed(1);
          const aureola = (11 * monograma.intensidadeGlow).toFixed(1);
          return (
            <svg
              key={monograma.papel}
              viewBox="0 0 100 100"
              className="absolute"
              style={{
                top: monograma.top,
                left: monograma.left,
                width: monograma.tamanho,
                height: monograma.tamanho,
                opacity: monograma.opacidade,
                transform: `translate(-50%, -50%) rotate(${monograma.rotacao}deg)`,
                filter: `drop-shadow(0 0 ${nucleo}px rgb(34 211 238 / 0.55)) drop-shadow(0 0 ${aureola}px rgb(139 92 246 / 0.4))`,
              }}
            >
              <path
                fillRule="evenodd"
                d={CAMINHO_MONOGRAMA}
                fill="none"
                stroke="url(#logo-holografico)"
                strokeWidth={2}
                strokeLinejoin="round"
              />
            </svg>
          );
        })}
      </div>
    </div>
  );
}
