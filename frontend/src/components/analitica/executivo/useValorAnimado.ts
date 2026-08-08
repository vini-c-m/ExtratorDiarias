import { useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

const DURACAO_PADRAO_MS = 400;

/** Ease-out cúbico — início rápido, chegada suave, sem bounce/overshoot
 * (pedido explícito do usuário: "nada de efeito chamativo"). */
function suavizar(progresso: number): number {
  return 1 - Math.pow(1 - progresso, 3);
}

/** BI 4.0 — hook apresentacional puro: interpola visualmente um número de
 * `valorAnterior` até `valorAtual` via `requestAnimationFrame`, terminando
 * SEMPRE no valor exato recebido (nunca um arredondamento por conta
 * própria da interpolação). Não recalcula/decide nada de negócio — só
 * anima a APRESENTAÇÃO de um número que `useIndicadores`/`useDistribuicoes`
 * já calcularam (KPIs/hero do Modo Executivo).
 *
 * - primeira montagem nunca anima (mostra o valor real de cara — só
 *   mudanças subsequentes, ex. troca de filtro, disparam a transição);
 * - `valorAtual` igual ao último valor exibido: não faz nada (sem
 *   reanimar, sem novo frame);
 * - novo `valorAtual` chega no meio de uma animação: cancela o frame
 *   pendente e recomeça a interpolar a partir do valor ATUALMENTE
 *   exibido na tela (nunca do valor-alvo anterior, que talvez nem tenha
 *   sido alcançado ainda);
 * - `null` (indicador genuinamente sem valor, ou ainda carregando) SEMPRE
 *   é exibido como `null` de imediato — nunca um número antigo "preso"
 *   na tela (quem formata decide "—", igual já fazia antes). Mas um
 *   `null` transitório (achado real, validado no app: todo recorte passa
 *   por `indicadores === null` por um instante durante o refetch de uma
 *   troca de filtro) NUNCA apaga a MEMÓRIA do último valor real — só o
 *   texto exibido nesse instante (que de qualquer forma não aparece:
 *   `GradeKpisExecutivos`/hero escondem o número enquanto carrega). Sem
 *   essa memória separada, toda troca de filtro passaria por "esqueço o
 *   valor antigo → não tenho de onde animar → só reapareço sem
 *   transição", que era exatamente o bug observado na validação manual;
 * - `prefers-reduced-motion` pula direto para o valor final, sem
 *   interpolar nenhum frame. */
export function useValorAnimado(valorAtual: number | null, duracaoMs: number = DURACAO_PADRAO_MS): number | null {
  const [valorExibido, setValorExibido] = useState(valorAtual);
  const reduzido = usePrefersReducedMotion();

  // Último número REAL (nunca `null`) visto — ponto de partida da
  // próxima animação; atualizado a cada frame com o valor exatamente
  // exibido na tela (para um cancelamento no meio do caminho recomeçar
  // do lugar certo), mas nunca zerado por um `null` transitório.
  const ultimoNumeroRealRef = useRef<number | null>(valorAtual);

  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }

    if (valorAtual === null) {
      setValorExibido(null);
      return;
    }

    const valorInicial = ultimoNumeroRealRef.current;

    if (valorInicial === null || valorInicial === valorAtual || reduzido) {
      setValorExibido(valorAtual);
      ultimoNumeroRealRef.current = valorAtual;
      return;
    }

    const inicio = performance.now();
    const diferenca = valorAtual - valorInicial;

    function passo(agora: number) {
      const progresso = Math.min((agora - inicio) / duracaoMs, 1);
      const valorFrame = progresso >= 1 ? valorAtual : (valorInicial as number) + diferenca * suavizar(progresso);
      setValorExibido(valorFrame);
      ultimoNumeroRealRef.current = valorFrame;
      if (progresso >= 1) {
        frameRef.current = null;
        return;
      }
      frameRef.current = requestAnimationFrame(passo);
    }

    frameRef.current = requestAnimationFrame(passo);

    return () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valorAtual, duracaoMs, reduzido]);

  return valorExibido;
}
