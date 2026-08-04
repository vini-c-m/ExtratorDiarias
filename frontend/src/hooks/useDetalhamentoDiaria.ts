import { useEffect, useState } from "react";
import { mensagemAmigavel } from "../lib/mensagens";
import { DiariaNaoEncontradaError, detalharDiaria } from "../services/api";
import type { DiariaCompletaResposta } from "../types/analitica";

export interface EstadoUseDetalhamentoDiaria {
  carregando: boolean;
  /** Falha técnica real (503/erro de rede/etc.) — nunca inclui o 404 de
   * "não encontrada", que é resultado de negócio, não falha do sistema. */
  erro: string | null;
  /** Sprint 18.5.1 — correção B1 da auditoria (RN-08): antes, um 404
   * (`DiariaNaoEncontradaError`) virava a mesma `erro` genérica de uma
   * falha técnica, sempre renderizada em vermelho — violando a regra
   * repetida em todo o app ("vermelho nunca representa veredito de
   * negócio"). Agora é um estado próprio, distinto de `erro`. */
  naoEncontrada: boolean;
  registro: DiariaCompletaResposta | null;
}

/** Busca `GET /api/v1/analitica/diarias/{sei}` sob demanda, ao abrir o
 * painel de detalhamento (`ui-plano-tecnico.md` § 5) — `sei` chega literal
 * (RN-12 herdada, sem `.trim()`/normalização no cliente). `sei === null`
 * significa "painel fechado": nenhuma busca é feita e o estado volta ao
 * inicial. */
export function useDetalhamentoDiaria(sei: string | null): EstadoUseDetalhamentoDiaria {
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [naoEncontrada, setNaoEncontrada] = useState(false);
  const [registro, setRegistro] = useState<DiariaCompletaResposta | null>(null);

  useEffect(() => {
    if (sei === null) {
      setCarregando(false);
      setErro(null);
      setNaoEncontrada(false);
      setRegistro(null);
      return;
    }

    let cancelado = false;

    (async () => {
      setCarregando(true);
      setErro(null);
      setNaoEncontrada(false);
      try {
        const resultado = await detalharDiaria(sei);
        if (!cancelado) setRegistro(resultado);
      } catch (erroCaptura) {
        if (!cancelado) {
          setRegistro(null);
          if (erroCaptura instanceof DiariaNaoEncontradaError) {
            setNaoEncontrada(true);
          } else {
            setErro(mensagemAmigavel(erroCaptura, "Não foi possível carregar o detalhamento."));
          }
        }
      } finally {
        if (!cancelado) setCarregando(false);
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [sei]);

  return { carregando, erro, naoEncontrada, registro };
}
