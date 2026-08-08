import type { CampoDeFiltro } from "../../../hooks/useDiarias";
import type { DimensaoDistribuicao } from "../../../types/analitica";

/** Sprint 21.4 (Painel lateral contextual) — o que um clique num ponto de
 * gráfico da grade executiva carrega para abrir o painel lateral
 * (`modo-executivo-arquitetura-funcional.md § 6`, componente 6). `filtro`
 * já vem resolvido por quem sabe converter aquele rótulo específico num
 * filtro real (ex.: `origem_destino` precisa dividir "X → Y"; `periodo`
 * precisa converter "2026-06" num intervalo) — o painel lateral em si
 * nunca decide como filtrar, só aplica o que já foi calculado. `contagem`/
 * `valor` também já vêm prontos do próprio ponto clicado (o mesmo
 * `PontoDistribuicaoResposta` já desenhado no gráfico) — nunca uma nova
 * chamada só para o resumo. */
export interface PontoSelecionadoExecutivo {
  dimensao: DimensaoDistribuicao;
  rotulo: string;
  contagem: number;
  valor: number | null;
  filtro: Partial<Record<CampoDeFiltro, string | undefined>>;
}
