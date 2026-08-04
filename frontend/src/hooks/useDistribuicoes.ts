import { useEffect, useState } from "react";
import { mensagemAmigavel } from "../lib/mensagens";
import { obterDistribuicao } from "../services/api";
import type { DimensaoDistribuicao, DistribuicaoResposta, ParametrosPesquisaDiariasQuery } from "../types/analitica";
import { CAMPOS_DE_FILTRO } from "./useDiarias";

export interface EstadoUseDistribuicoes {
  carregando: boolean;
  erro: string | null;
  distribuicao: DistribuicaoResposta | null;
  /** Refaz a busca para o mesmo recorte/dimensão vigentes — mesmo padrão
   * de `tentarNovamente` já usado em `useIndicadores`/`useOpcoesFiltro`/
   * `useDiarias`. */
  tentarNovamente: () => void;
}

/** `GET /api/v1/analitica/distribuicoes` (Sprint 19.6.3) — reaproveita os
 * mesmos `filtros` já geridos por `useDiarias` (nunca duplica estado de
 * filtro), mais `dimensao` (qual das 6 dimensões buscar — um valor por
 * chamada, § 12.3; cada gráfico do futuro Dashboard, 19.6.4, terá sua
 * própria instância deste hook, uma por dimensão ativa — decisão de
 * orquestração explicitamente fora do escopo desta Sprint). Só refaz a
 * busca quando um FILTRO de fato muda ou a `dimensao` muda —
 * `CAMPOS_DE_FILTRO` (mesma lista já usada por `useDiarias`/
 * `useIndicadores`, 15 campos) exclui `pagina`/`tamanho_pagina`/
 * `ordenar_por`/`ordem`, que não afetam o recorte inteiro que este
 * endpoint calcula.
 *
 * Mesma correção da 19.6.2.1 (achado da Auditoria Técnica da 19.6.2) já
 * aplicada aqui desde o início, não como correção posterior:
 * `distribuicao`/`erro` são limpos para `null` de imediato, no mesmo
 * instante em que o recorte ou a dimensão mudam (antes mesmo de chamar a
 * API) — nunca depois que a nova resposta chega. Sem isso, a distribuição
 * de um recorte/dimensão anterior poderia ficar visível junto de um
 * recorte novo enquanto a busca ainda estivesse em andamento — mesmo
 * raciocínio documentado em `useIndicadores.ts`. */
export function useDistribuicoes(
  filtros: ParametrosPesquisaDiariasQuery,
  dimensao: DimensaoDistribuicao,
): EstadoUseDistribuicoes {
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [distribuicao, setDistribuicao] = useState<DistribuicaoResposta | null>(null);
  const [tentativaManual, setTentativaManual] = useState(0);

  const chaveDeFiltro = JSON.stringify(
    Object.fromEntries(CAMPOS_DE_FILTRO.map((campo) => [campo, filtros[campo]])),
  );

  useEffect(() => {
    let cancelado = false;
    const parametrosFiltro = JSON.parse(chaveDeFiltro) as ParametrosPesquisaDiariasQuery;

    // Invalida a distribuição do recorte/dimensão anterior IMEDIATAMENTE
    // — antes de chamar a API, nunca depois.
    setCarregando(true);
    setErro(null);
    setDistribuicao(null);

    (async () => {
      try {
        const resultado = await obterDistribuicao({ ...parametrosFiltro, dimensao });
        if (!cancelado) setDistribuicao(resultado);
      } catch (erroCaptura) {
        if (!cancelado) {
          setDistribuicao(null);
          setErro(mensagemAmigavel(erroCaptura, "Não foi possível carregar a distribuição."));
        }
      } finally {
        if (!cancelado) setCarregando(false);
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [chaveDeFiltro, dimensao, tentativaManual]);

  function tentarNovamente() {
    setTentativaManual((atual) => atual + 1);
  }

  return { carregando, erro, distribuicao, tentarNovamente };
}
