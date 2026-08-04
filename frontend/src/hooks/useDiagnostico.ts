import { useEffect, useState } from "react";
import { mensagemAmigavel } from "../lib/mensagens";
import { obterDiagnostico } from "../services/api";
import type { DiagnosticoResposta, ParametrosPesquisaDiariasQuery } from "../types/analitica";
import { CAMPOS_DE_FILTRO } from "./useDiarias";

export interface EstadoUseDiagnostico {
  carregando: boolean;
  erro: string | null;
  diagnostico: DiagnosticoResposta | null;
  tentarNovamente: () => void;
}

/** `GET /api/v1/analitica/diagnostico` (Sprint 19.8.2) — mesmo padrão de
 * `useIndicadores.ts`/`useDistribuicoes.ts`: reaproveita os `filtros` já
 * geridos por `useDiarias` (nunca duplica estado de filtro), refaz a
 * busca só quando um FILTRO de fato muda (`CAMPOS_DE_FILTRO`, exclui
 * paginação/ordenação — § 8.3, "opera sobre o recorte inteiro"), e limpa
 * `diagnostico`/`erro` de forma síncrona antes de chamar a API — mesma
 * correção já aplicada em `useIndicadores`/`useDistribuicoes` para nunca
 * mostrar o diagnóstico de um recorte anterior junto de um recorte novo
 * ainda carregando. */
export function useDiagnostico(filtros: ParametrosPesquisaDiariasQuery): EstadoUseDiagnostico {
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [diagnostico, setDiagnostico] = useState<DiagnosticoResposta | null>(null);
  const [tentativaManual, setTentativaManual] = useState(0);

  const chaveDeFiltro = JSON.stringify(
    Object.fromEntries(CAMPOS_DE_FILTRO.map((campo) => [campo, filtros[campo]])),
  );

  useEffect(() => {
    let cancelado = false;
    const parametrosFiltro = JSON.parse(chaveDeFiltro) as ParametrosPesquisaDiariasQuery;

    setCarregando(true);
    setErro(null);
    setDiagnostico(null);

    (async () => {
      try {
        const resultado = await obterDiagnostico(parametrosFiltro);
        if (!cancelado) setDiagnostico(resultado);
      } catch (erroCaptura) {
        if (!cancelado) {
          setDiagnostico(null);
          setErro(mensagemAmigavel(erroCaptura, "Não foi possível carregar o diagnóstico."));
        }
      } finally {
        if (!cancelado) setCarregando(false);
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [chaveDeFiltro, tentativaManual]);

  function tentarNovamente() {
    setTentativaManual((atual) => atual + 1);
  }

  return { carregando, erro, diagnostico, tentarNovamente };
}
