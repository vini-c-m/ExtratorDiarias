import { useEffect, useState } from "react";

/** BI 4.0 — única implementação de "o SO pediu menos movimento?", usada
 * por `PainelInsights.tsx` (rotação da timeline) e `useValorAnimado.ts`
 * (interpolação numérica dos KPIs/hero). `matchMedia` não pode ser lido
 * de forma estável na primeira renderização (SSR/hidratação) — por isso
 * é um hook (com `useState` + reavaliação em `change`, para o usuário
 * poder alternar a preferência do sistema sem recarregar a página), não
 * uma função pura chamada direto no render. */
function preferenciaAtual(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;
}

export function usePrefersReducedMotion(): boolean {
  const [reduzido, setReduzido] = useState(preferenciaAtual);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const consulta = window.matchMedia("(prefers-reduced-motion: reduce)");
    const aoMudar = () => setReduzido(consulta.matches);
    consulta.addEventListener("change", aoMudar);
    return () => consulta.removeEventListener("change", aoMudar);
  }, []);

  return reduzido;
}
