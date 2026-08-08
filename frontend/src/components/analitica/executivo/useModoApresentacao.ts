import { useEffect, useState } from "react";

export interface EstadoUseModoApresentacao {
  ativa: boolean;
  secaoAtual: number;
  totalSecoes: number;
  entrar: () => void;
  sair: () => void;
  proximaSecao: () => void;
  secaoAnterior: () => void;
  irParaSecao: (indice: number) => void;
}

/** 3 "slides" fixos — KPIs, Gráficos, Insights, na mesma ordem já usada na
 * tela normal do Modo Executivo (`modo-executivo-wireframes.md § 2`). */
const TOTAL_SECOES = 3;

/** Modo apresentação (`docs/central-analitica/modo-executivo-arquitetura-
 * funcional.md § 6`, componente 8; decisão de fechamento 10 — Fullscreen
 * API do navegador, sem kiosk mode do Electron, sem canal IPC novo)
 * Sprint 21.8. Tela cheia via `document.documentElement.requestFullscreen()`
 * — o app inteiro (não um contêiner próprio, que exigiria um `ref` já
 * montado antes do clique que abre o modo apresentação, uma dependência
 * circular desnecessária). `fullscreenchange` sincroniza `ativa` quando o
 * usuário sai pela tecla Esc nativa do navegador (que o Chromium também
 * intercepta antes do nosso próprio handler de teclado, em alguns casos)
 * — nunca deixa o estado interno dessincronizado da tela cheia real. */
export function useModoApresentacao(): EstadoUseModoApresentacao {
  const [ativa, setAtiva] = useState(false);
  const [secaoAtual, setSecaoAtual] = useState(0);

  useEffect(() => {
    function aoMudarTelaCheia() {
      if (!document.fullscreenElement) setAtiva(false);
    }
    document.addEventListener("fullscreenchange", aoMudarTelaCheia);
    return () => document.removeEventListener("fullscreenchange", aoMudarTelaCheia);
  }, []);

  function entrar() {
    // `requestFullscreen` pode faltar (ambiente de teste/navegador sem
    // suporte) ou ser recusado (fora de um gesto do usuário) — o modo
    // apresentação continua funcionando sem tela cheia real, nunca quebra
    // a navegação por causa disso (mesmo critério de "nunca travar" já
    // usado em `PainelDetalhamentoDiaria.copiarSei`).
    try {
      void document.documentElement.requestFullscreen?.().catch(() => {});
    } catch {
      // ignorado de propósito
    }
    setSecaoAtual(0);
    setAtiva(true);
  }

  function sair() {
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    }
    setAtiva(false);
  }

  function proximaSecao() {
    setSecaoAtual((atual) => Math.min(atual + 1, TOTAL_SECOES - 1));
  }

  function secaoAnterior() {
    setSecaoAtual((atual) => Math.max(atual - 1, 0));
  }

  function irParaSecao(indice: number) {
    setSecaoAtual(Math.max(0, Math.min(indice, TOTAL_SECOES - 1)));
  }

  // Navegação por teclado (`modo-executivo-wireframes.md § 6`) — só
  // escuta enquanto ativa, nunca captura teclas fora do modo apresentação.
  useEffect(() => {
    if (!ativa) return;
    function aoTeclar(evento: KeyboardEvent) {
      if (evento.key === "Escape") sair();
      else if (evento.key === "ArrowRight") proximaSecao();
      else if (evento.key === "ArrowLeft") secaoAnterior();
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ativa]);

  return { ativa, secaoAtual, totalSecoes: TOTAL_SECOES, entrar, sair, proximaSecao, secaoAnterior, irParaSecao };
}
