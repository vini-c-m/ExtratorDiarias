import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

interface Props<T> {
  itens: T[];
  chave: (item: T) => string;
  renderizar: (item: T, copiaVisual: boolean) => ReactNode;
}

const VELOCIDADE_PX_POR_SEGUNDO = 18;

/** Fita vertical executiva. A lista lógica é renderizada uma única vez; o
 * segundo grupo é uma cópia estritamente visual (`aria-hidden` + `inert`),
 * usada apenas para fechar geometricamente o loop de `transform`.
 * Nenhum estado React é atualizado por frame: Chromium executa a animação
 * no compositor e `IntersectionObserver` só alterna uma classe quando um
 * item cruza a faixa central. */
export default function MarketTapeInsights<T>({ itens, chave, renderizar }: Props<T>) {
  const movimentoReduzido = usePrefersReducedMotion();
  const viewportRef = useRef<HTMLDivElement>(null);
  const grupoOriginalRef = useRef<HTMLDivElement>(null);
  const copiaVisualRef = useRef<HTMLDivElement>(null);
  const [alturaGrupo, setAlturaGrupo] = useState(0);
  const [pausado, setPausado] = useState(false);

  useLayoutEffect(() => {
    const grupo = grupoOriginalRef.current;
    if (!grupo || movimentoReduzido || itens.length <= 1) return;

    const medir = () => {
      const altura = grupo.getBoundingClientRect().height;
      if (altura > 0) setAlturaGrupo(altura);
    };
    medir();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(medir);
    observer.observe(grupo);
    return () => observer.disconnect();
  }, [itens, movimentoReduzido]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || movimentoReduzido || itens.length <= 1 || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entradas) => {
        for (const entrada of entradas) entrada.target.classList.toggle("market-tape-item-em-foco", entrada.isIntersecting);
      },
      { root: viewport, rootMargin: "-39% 0px -39% 0px", threshold: 0.15 },
    );
    viewport.querySelectorAll("[data-market-tape-item]").forEach((elemento) => observer.observe(elemento));
    return () => observer.disconnect();
  }, [alturaGrupo, itens, movimentoReduzido]);

  useEffect(() => {
    if (copiaVisualRef.current) copiaVisualRef.current.inert = true;
  }, [itens, movimentoReduzido]);

  if (itens.length === 0) return null;

  if (movimentoReduzido || itens.length === 1) {
    return (
      <div className="market-tape-estatico" data-testid="market-tape-estatico" role="list">
        {itens.map((item) => (
          <div key={chave(item)} className="market-tape-item market-tape-item-estatico" role="listitem">
            {renderizar(item, false)}
          </div>
        ))}
      </div>
    );
  }

  const animacaoPronta = alturaGrupo > 0;
  const duracao = animacaoPronta ? alturaGrupo / VELOCIDADE_PX_POR_SEGUNDO : 0;
  const estilo = {
    "--market-tape-distancia": `${-alturaGrupo}px`,
    "--market-tape-duracao": `${duracao}s`,
  } as CSSProperties;

  const Grupo = ({ copiaVisual }: { copiaVisual: boolean }) => (
    <div ref={copiaVisual ? copiaVisualRef : grupoOriginalRef} className="market-tape-grupo" aria-hidden={copiaVisual || undefined}>
      {itens.map((item) => (
        <div key={chave(item)} className="market-tape-item" data-market-tape-item="" role={copiaVisual ? undefined : "listitem"}>
          {renderizar(item, copiaVisual)}
        </div>
      ))}
    </div>
  );

  return (
    <div
      ref={viewportRef}
      className={`market-tape-viewport ${pausado ? "market-tape-pausado" : ""}`}
      data-testid="market-tape-continuo"
      role="list"
      onPointerEnter={() => setPausado(true)}
      onPointerLeave={() => setPausado(false)}
      onFocusCapture={() => setPausado(true)}
      onBlurCapture={(evento) => {
        if (!evento.currentTarget.contains(evento.relatedTarget)) setPausado(false);
      }}
    >
      <div className="market-tape-zona-foco" aria-hidden="true" />
      <div className={`market-tape-trilho ${animacaoPronta ? "market-tape-trilho-ativo" : ""}`} style={estilo}>
        <Grupo copiaVisual={false} />
        <Grupo copiaVisual />
      </div>
    </div>
  );
}
