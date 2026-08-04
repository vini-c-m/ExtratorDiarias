import { useEffect, useState } from "react";
import { mensagemAmigavel } from "../lib/mensagens";
import { obterOpcoesFiltro } from "../services/api";
import type { OpcoesFiltroResposta } from "../types/analitica";

export interface EstadoUseOpcoesFiltro {
  carregando: boolean;
  erro: string | null;
  opcoes: OpcoesFiltroResposta | null;
  /** Sprint 18.5.1 — correção NC2 da auditoria: antes a falha desta busca
   * era descartada silenciosamente por quem consumia o hook. Agora expõe
   * uma forma explícita de tentar de novo, mesmo padrão de `atualizar` em
   * `useSincronizacao`/`useConfiguracao`. */
  tentarNovamente: () => void;
}

/** `GET /api/v1/analitica/opcoes-filtro` (Sprint 17.4.5, homologado) —
 * buscado uma única vez ao montar a Central Analítica, nunca refeito por
 * mudança de filtro (são as opções *possíveis*, não as atuais). Mesmo
 * padrão de 3 estados (`carregando`/`erro`/`dado`) de `useConfiguracao`. */
export function useOpcoesFiltro(backendOnline: boolean): EstadoUseOpcoesFiltro {
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [opcoes, setOpcoes] = useState<OpcoesFiltroResposta | null>(null);
  const [tentativaManual, setTentativaManual] = useState(0);

  useEffect(() => {
    if (!backendOnline) return;

    let cancelado = false;

    (async () => {
      setCarregando(true);
      setErro(null);
      try {
        const resultado = await obterOpcoesFiltro();
        if (!cancelado) setOpcoes(resultado);
      } catch (erroCaptura) {
        if (!cancelado) {
          setErro(mensagemAmigavel(erroCaptura, "Não foi possível carregar as opções de filtro."));
        }
      } finally {
        if (!cancelado) setCarregando(false);
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [backendOnline, tentativaManual]);

  function tentarNovamente() {
    setTentativaManual((atual) => atual + 1);
  }

  return { carregando, erro, opcoes, tentarNovamente };
}
