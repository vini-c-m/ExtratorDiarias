import { useEffect, useState } from "react";
import { mensagemAmigavel } from "../lib/mensagens";
import { listarProcessosAguardandoDH } from "../services/api";
import type { ListaProcessosAguardandoDH } from "../types/regularizacaoDh";

export interface EstadoUseProcessosAguardandoDH {
  carregando: boolean;
  erro: string | null;
  resultado: ListaProcessosAguardandoDH | null;
  atualizar: () => void;
}

/** Micro-sprint B ("Central de Regularização de DH", SOMENTE LEITURA) —
 * `GET /regularizacao-dh`, mesma fonte homologada da Central Analítica por
 * trás. `atualizar()` só reconsulta a mesma fonte (item 12 do pedido) —
 * nunca sincroniza a Planilha, nunca escreve nada. */
export function useProcessosAguardandoDH(): EstadoUseProcessosAguardandoDH {
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ListaProcessosAguardandoDH | null>(null);
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    let cancelado = false;

    setCarregando(true);
    setErro(null);

    (async () => {
      try {
        const dados = await listarProcessosAguardandoDH();
        if (!cancelado) setResultado(dados);
      } catch (erroCaptura) {
        if (!cancelado) {
          setResultado(null);
          setErro(mensagemAmigavel(erroCaptura, "Não foi possível carregar os processos aguardando DH."));
        }
      } finally {
        if (!cancelado) setCarregando(false);
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [tentativa]);

  function atualizar() {
    setTentativa((atual) => atual + 1);
  }

  return { carregando, erro, resultado, atualizar };
}
