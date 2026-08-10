import { useEffect, useState } from "react";
import { mensagemAmigavel } from "../lib/mensagens";
import { obterOpcoesCadastroServidor } from "../services/api";
import type { OpcoesCadastroServidorResposta } from "../types/conferencia";

export interface EstadoUseOpcoesCadastroServidor {
  carregando: boolean;
  erro: string | null;
  opcoes: OpcoesCadastroServidorResposta | null;
}

/** `GET /api/v1/dados/opcoes-cadastro` — buscado uma única vez ao montar o
 * `ModalCadastrarServidor` (mesmo padrão de `useOpcoesFiltro`, só sem o
 * gate de `backendOnline`: o modal só abre depois de uma consulta de
 * Conferência já ter respondido, então o backend já está confirmadamente
 * acessível). Uma falha aqui nunca bloqueia o cadastro — Cargo/Órgão de
 * origem continuam aceitando texto livre sem sugestões, e os seletores
 * fechados (Previdência/Regime/Situação) ficam só com a opção em branco
 * até a próxima tentativa. */
export function useOpcoesCadastroServidor(): EstadoUseOpcoesCadastroServidor {
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [opcoes, setOpcoes] = useState<OpcoesCadastroServidorResposta | null>(null);

  useEffect(() => {
    let cancelado = false;

    (async () => {
      setCarregando(true);
      setErro(null);
      try {
        const resultado = await obterOpcoesCadastroServidor();
        if (!cancelado) setOpcoes(resultado);
      } catch (erroCaptura) {
        if (!cancelado) {
          setErro(mensagemAmigavel(erroCaptura, "Não foi possível carregar as opções de cadastro."));
        }
      } finally {
        if (!cancelado) setCarregando(false);
      }
    })();

    return () => {
      cancelado = true;
    };
  }, []);

  return { carregando, erro, opcoes };
}
