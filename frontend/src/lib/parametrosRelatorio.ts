import type { FiltrosRelatorioQuery, ParametrosPesquisaDiariasQuery } from "../types/analitica";

/** Sprint 19.6.6 — extraído de `ModalRelatorio.tsx` para ser reaproveitado
 * também pela exportação do Dashboard (`DashboardRecorte.tsx`): os mesmos
 * 15 campos de filtro, sem paginação/ordenação (`FiltrosRelatorioQuery`,
 * espelha `POST /relatorios`, § 12.6) — um único ponto de tradução evita
 * as duas telas divergirem silenciosamente se um filtro novo for
 * adicionado só numa delas (mesmo espírito de `_filtros_da_query` no
 * backend, `app/api/analitica.py`). */
export function filtrosParaRelatorio(filtros: ParametrosPesquisaDiariasQuery): FiltrosRelatorioQuery {
  return {
    q: filtros.q,
    sei: filtros.sei,
    cpf: filtros.cpf,
    servidor_nome: filtros.servidor_nome,
    servidor_matricula: filtros.servidor_matricula,
    municipio: filtros.municipio,
    motivo: filtros.motivo,
    situacao: filtros.situacao,
    periodo_inicial: filtros.periodo_inicial,
    periodo_final: filtros.periodo_final,
    origem: filtros.origem,
    destino: filtros.destino,
    trecho: filtros.trecho,
    valor_minimo: filtros.valor_minimo,
    valor_maximo: filtros.valor_maximo,
    categoria_funcional: filtros.categoria_funcional,
  };
}
