import { useEffect, useState } from "react";
import { mensagemAmigavel } from "../lib/mensagens";
import { obterIndicadores } from "../services/api";
import type { IndicadoresResposta, ParametrosPesquisaDiariasQuery } from "../types/analitica";
import { CAMPOS_DE_FILTRO } from "./useDiarias";

export interface EstadoUseIndicadores {
  carregando: boolean;
  erro: string | null;
  indicadores: IndicadoresResposta | null;
  /** Sprint 19.6.2.1 — correção do achado da Auditoria Técnica da 19.6.2
   * (dessincronia entre `useDiarias`/`useIndicadores`): refaz a busca para
   * o mesmo recorte vigente (`filtros` atual), mesmo padrão de
   * `tentarNovamente` já usado em `useOpcoesFiltro`/`useDiarias`. */
  tentarNovamente: () => void;
}

/** `GET /api/v1/analitica/indicadores` (Sprint 19.6.2) — reaproveita os
 * mesmos `filtros` já geridos por `useDiarias` (nunca duplica estado de
 * filtro, `v2-plano-tecnico.md` § 3 "Reaproveitamento"), mas só refaz a
 * busca quando um FILTRO de fato muda: `CAMPOS_DE_FILTRO` (mesma lista já
 * usada por `useDiarias`, 15 campos) exclui `pagina`/`tamanho_pagina`/
 * `ordenar_por`/`ordem`, que não afetam o recorte inteiro que este
 * endpoint calcula — paginar ou reordenar a tabela nunca deveria refazer
 * o cálculo dos indicadores.
 *
 * Sprint 19.6.2.1 — correção do Bug encontrado na Auditoria Técnica da
 * 19.6.2: `indicadores` (e `erro`) são limpos para `null` de imediato, no
 * mesmo instante em que o recorte muda (antes mesmo de chamar a API) —
 * nunca depois que a nova resposta chega. Sem isso, o valor de um recorte
 * anterior ficava visível (via `ResumoRecorte`) junto da contagem de um
 * recorte novo, enquanto a busca de indicadores do recorte novo ainda
 * estivesse em andamento. Isso é o que garante que "indicadores do
 * recorte anterior nunca sejam apresentados como pertencentes ao recorte
 * atual" — a limpeza acontece de forma síncrona, não depende de nenhuma
 * condição de corrida ser vencida corretamente (embora o `cancelado` de
 * sempre continue protegendo contra respostas fora de ordem). */
export function useIndicadores(filtros: ParametrosPesquisaDiariasQuery): EstadoUseIndicadores {
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [indicadores, setIndicadores] = useState<IndicadoresResposta | null>(null);
  const [tentativaManual, setTentativaManual] = useState(0);

  const chaveDeFiltro = JSON.stringify(
    Object.fromEntries(CAMPOS_DE_FILTRO.map((campo) => [campo, filtros[campo]])),
  );

  useEffect(() => {
    let cancelado = false;
    const parametrosFiltro = JSON.parse(chaveDeFiltro) as ParametrosPesquisaDiariasQuery;

    // Invalida o indicador do recorte anterior IMEDIATAMENTE — antes de
    // chamar a API, nunca depois. Enquanto o recorte novo carrega, nenhum
    // valor financeiro antigo fica visível (o componente que consome este
    // hook vê `indicadores === null` e `carregando === true` juntos).
    setCarregando(true);
    setErro(null);
    setIndicadores(null);

    (async () => {
      try {
        const resultado = await obterIndicadores(parametrosFiltro);
        if (!cancelado) setIndicadores(resultado);
      } catch (erroCaptura) {
        if (!cancelado) {
          setIndicadores(null);
          setErro(mensagemAmigavel(erroCaptura, "Não foi possível carregar os indicadores."));
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

  return { carregando, erro, indicadores, tentarNovamente };
}
