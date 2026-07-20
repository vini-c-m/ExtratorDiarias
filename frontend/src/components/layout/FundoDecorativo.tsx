import { useEffect, useRef, type CSSProperties } from "react";
import { CAMINHO_MONOGRAMA } from "./Logo";

// Sprint 09.1/09.2/09.3 — camada puramente decorativa da identidade "Neon
// Tech UI": a marca d'água institucional (monograma "ED") continua sendo o
// elemento principal do fundo, com um leve parallax ao mover o mouse. A
// Sprint 09 tinha partículas "estrela" nesta camada e foram removidas por
// completo na 09.1 (pareciam céu estrelado, competiam com a marca); a
// Sprint 09.2 trouxe a ideia de volta, mas só como "detalhe de
// profundidade" quase invisível (8 pontos, 2–6% de opacidade). A Sprint
// 09.3 muda o conceito de "partículas" para um "campo estelar tecnológico"
// deliberado: ~100–120 estrelas em quatro categorias (ver `gerarCampoEstelar`
// abaixo), agora espalhadas por toda a viewport — não só na periferia como
// os monogramas — para lembrar um céu tecnológico sofisticado, sem roubar a
// cena do monograma nem do conteúdo real do app. Continua vivendo na mesma
// camada de parallax dos monogramas. Fixa atrás de todo o conteúdo
// (`App.tsx` empilha o resto da UI num wrapper `relative z-10`),
// `pointer-events-none` de ponta a ponta — nunca intercepta clique/arraste
// de arquivo, nunca participa da leitura de tela (`aria-hidden`), nunca
// guarda estado de negócio algum.

interface Monograma {
  top: string;
  left: string;
  tamanho: number;
  rotacao: number;
  opacidade: number;
  /** Só documentação — qual papel esta peça cumpre na composição. */
  papel: string;
}

// Sprint 09.1 — a marca d'água deixa de ser "espalha e reza" e passa a ser
// uma composição desenhada à mão, como a peça de um designer, não uma
// distribuição aleatória:
//
//  - A viewport é pensada como uma grade solta de 4 colunas × 3 linhas; cada
//    peça ocupa uma "zona" específica (canto, borda, meio-termo), nunca
//    alinhada em grade perceptível — sempre com deslocamento manual dentro
//    da zona.
//  - Três famílias de tamanho (grande 240–260px / média 190–210px / pequena
//    130–160px, bem abaixo dos 420–660px da Sprint 09) criam ritmo: poucas
//    âncoras grandes nos cantos, mais peças pequenas preenchendo bordas e
//    entrelinhas — nunca peças do mesmo tamanho lado a lado.
//  - Rotação (5°–15° de magnitude) segue uma regra de composição, não sorteio:
//    peças da metade esquerda giram para a esquerda (negativo), peças da
//    metade direita giram para a direita (positivo) — sugere um leque que se
//    abre a partir do centro, em vez de ruído.
//  - As quatro âncoras de canto ficam parcialmente cortadas pela borda da
//    janela de propósito (posição negativa/>90%); mais 4 peças cortam as
//    quatro bordas (topo/base/esquerda/direita) para a naturalidade pedida,
//    sem concentrar o corte só nos cantos.
//  - A faixa central (onde o conteúdo real do app fica) é deliberadamente
//    mais vazia — a textura vive na periferia, nunca compete com o card em
//    primeiro plano.
//  - Opacidade sempre entre 3% e 5%: âncoras grandes um pouco mais presentes
//    (4–4,5%), peças pequenas mais discretas (3%). Blur proporcional ao
//    tamanho (~6% do tamanho, 8–16px) — um blur fixo grande (era 48px)
//    dissolvia peças pequenas até ficarem ilegíveis como monograma.
const MONOGRAMAS: Monograma[] = [
  { papel: "âncora superior-esquerda, grande", top: "-6%", left: "-4%", tamanho: 260, rotacao: -11, opacidade: 0.045 },
  { papel: "âncora superior-direita, grande", top: "-8%", left: "82%", tamanho: 240, rotacao: 12, opacidade: 0.04 },
  { papel: "recorte na borda superior, pequena", top: "-6%", left: "34%", tamanho: 140, rotacao: -6, opacidade: 0.03 },

  { papel: "recorte na borda direita, média", top: "34%", left: "92%", tamanho: 200, rotacao: 9, opacidade: 0.035 },
  { papel: "meio-direita inferior, pequena, recorte na borda", top: "64%", left: "97%", tamanho: 150, rotacao: 13, opacidade: 0.03 },

  { papel: "âncora inferior-direita, grande", top: "96%", left: "88%", tamanho: 250, rotacao: 8, opacidade: 0.045 },
  { papel: "âncora inferior-esquerda, média", top: "92%", left: "6%", tamanho: 210, rotacao: -9, opacidade: 0.04 },
  { papel: "recorte na borda inferior, pequena", top: "98%", left: "56%", tamanho: 130, rotacao: 5, opacidade: 0.03 },

  { papel: "recorte na borda esquerda, média", top: "46%", left: "-6%", tamanho: 190, rotacao: -13, opacidade: 0.035 },
  { papel: "meio-esquerda superior, pequena", top: "16%", left: "10%", tamanho: 150, rotacao: -6, opacidade: 0.03 },

  { papel: "entrelinha superior-direita, pequena", top: "22%", left: "70%", tamanho: 160, rotacao: 7, opacidade: 0.03 },
  { papel: "entrelinha inferior-esquerda, pequena", top: "74%", left: "24%", tamanho: 145, rotacao: -8, opacidade: 0.03 },
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

// Sprint 09.3 — o conceito de "partículas" (poucos pontos quase invisíveis)
// vira um "campo estelar tecnológico": ~100–120 estrelas espalhadas por
// toda a viewport, em quatro categorias que criam hierarquia visual entre
// si sem nenhuma delas competir com o monograma ou o conteúdo do app:
//  - maioria (poeira, 1px) — brilho discreto, sem glow;
//  - quantidade menor (ciano, 2px) — glow ciano;
//  - poucas (roxo, 3px) — glow roxo;
//  - só algumas (4–8, sparkle "✦") — simulam estrelas mais intensas.
// ~1 em cada 3 estrelas ganha uma cintilação própria — oscilação lenta
// (6–12s) e suave de opacidade, nunca abrupta, com atraso aleatório para
// não sincronizar (senão o campo "respira" todo junto, artificial demais).
function gerarCampoEstelar(): Estrela[] {
  const categorias: Array<{
    tipo: TipoEstrela;
    quantidade: number;
    tamanho: number;
    opacidade: [number, number];
  }> = [
    { tipo: "poeira", quantidade: 70, tamanho: 1, opacidade: [0.15, 0.4] },
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

const GLOW_POR_TIPO: Partial<Record<TipoEstrela, string>> = {
  ciano: "0 0 4px 1px rgb(34 211 238 / 0.6)",
  roxo: "0 0 6px 1.5px rgb(168 85 247 / 0.55)",
};

function estiloCintilarDe(estrela: Estrela): EstiloComVariaveis | undefined {
  if (!estrela.cintila) return undefined;
  return {
    "--estrela-opacidade-min": String(estrela.opacidadeBase * 0.5),
    "--estrela-opacidade-max": String(Math.min(estrela.opacidadeBase * 1.6, 0.95)),
    animation: `estrela-cintilar ${estrela.duracaoCintilarS.toFixed(2)}s ease-in-out ${estrela.atrasoCintilarS.toFixed(2)}s infinite`,
  };
}

// Deslocamento máximo do parallax — 2 a 3px, exatamente o pedido pela
// Sprint ("apenas para dar profundidade"), nunca mais que isso.
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
      <div ref={camadaParallaxRef} className="absolute inset-0 will-change-transform">
        {MONOGRAMAS.map((monograma) => (
          <svg
            key={monograma.papel}
            viewBox="0 0 100 100"
            className="absolute text-white"
            style={{
              top: monograma.top,
              left: monograma.left,
              width: monograma.tamanho,
              height: monograma.tamanho,
              opacity: monograma.opacidade,
              transform: `translate(-50%, -50%) rotate(${monograma.rotacao}deg)`,
              filter: `blur(${Math.round(monograma.tamanho * 0.06)}px)`,
            }}
          >
            <path fillRule="evenodd" d={CAMINHO_MONOGRAMA} fill="currentColor" />
          </svg>
        ))}

        {CAMPO_ESTELAR.map((estrela, indice) => {
          const classeCintilar = estrela.cintila ? " estrela-cintilante" : "";
          const estiloBase: EstiloComVariaveis = {
            top: `${estrela.top}%`,
            left: `${estrela.left}%`,
            transform: "translate(-50%, -50%)",
            opacity: estrela.cintila ? undefined : estrela.opacidadeBase,
            ...estiloCintilarDe(estrela),
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
      </div>
    </div>
  );
}
