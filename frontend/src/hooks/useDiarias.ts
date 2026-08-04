import { useCallback, useEffect, useRef, useState } from "react";
import { mensagemAmigavel } from "../lib/mensagens";
import { pesquisarDiarias } from "../services/api";
import type {
  CampoOrdenacao,
  ParametrosPesquisaDiariasQuery,
  ResultadoPesquisaResposta,
} from "../types/analitica";

const TAMANHO_PAGINA_PADRAO = 25;

/** Campos de `ParametrosPesquisaDiariasQuery` que representam um filtro de
 * negócio (usados para decidir "vazio" vs. "sem resultados", `§ 7` do
 * plano técnico, e para popular `ChipsFiltroAtivo`) — nunca inclui
 * paginação/ordenação, que sempre têm valor. */
export const CAMPOS_DE_FILTRO = [
  "q",
  "sei",
  "cpf",
  "servidor_nome",
  "servidor_matricula",
  "municipio",
  "motivo",
  "situacao",
  "periodo_inicial",
  "periodo_final",
  "origem",
  "destino",
  "trecho",
  "valor_minimo",
  "valor_maximo",
] as const satisfies readonly (keyof ParametrosPesquisaDiariasQuery)[];

export type CampoDeFiltro = (typeof CAMPOS_DE_FILTRO)[number];

/** `true` quando pelo menos um filtro de negócio está ativo — distingue o
 * estado "vazio" (J7, nunca sincronizado) do estado "sem resultados" (busca
 * feita, nada encontrado), mesmo critério de `ui-plano-tecnico.md` § 7. */
export function algumFiltroAplicado(filtros: ParametrosPesquisaDiariasQuery): boolean {
  return CAMPOS_DE_FILTRO.some((campo) => {
    const valor = filtros[campo];
    return valor !== undefined && valor !== null && valor !== "";
  });
}

export interface EstadoUseDiarias {
  filtros: ParametrosPesquisaDiariasQuery;
  carregando: boolean;
  erro: string | null;
  resultado: ResultadoPesquisaResposta | null;
  /** Atualiza um ou mais filtros e volta para a página 1 (mudar de filtro
   * sempre invalida a página atual — mesmo critério de qualquer busca
   * paginada). */
  aplicarFiltro: (parcial: Partial<Record<CampoDeFiltro, string | undefined>>) => void;
  /** Remove um único filtro (chip removível, `ChipsFiltroAtivo`). */
  removerFiltro: (campo: CampoDeFiltro) => void;
  /** Remove todos os filtros de uma vez ("Limpar filtros", Anexo B da UX
   * herdado) e volta para a página 1. `q` (busca global) também é limpo —
   * é um filtro de negócio como qualquer outro (`CAMPOS_DE_FILTRO`). */
  limparFiltros: () => void;
  irParaPagina: (pagina: number) => void;
  /** Clique no cabeçalho de uma coluna — alterna asc/desc se já era o campo
   * ativo, senão assume a nova coluna em ordem ascendente. */
  ordenarPor: (campo: CampoOrdenacao) => void;
  tentarNovamente: () => void;
}

/** Dono do estado de filtros/paginação/ordenação + resultados da Central
 * Analítica — vive no componente raiz (`CentralAnalitica.tsx`), sem
 * persistência entre aberturas do módulo.
 *
 * `qInicial` semeia o filtro `q` na primeira busca (vindo da
 * `BarraPesquisaGlobal`, elevada a `CentralAnalitica.tsx`); mudanças
 * posteriores de `qInicial` — o usuário pesquisa de novo pela barra global —
 * também são aplicadas, via o efeito abaixo (que pula a primeira
 * renderização para não duplicar a busca inicial). */
export function useDiarias(qInicial: string): EstadoUseDiarias {
  const [filtros, setFiltros] = useState<ParametrosPesquisaDiariasQuery>({
    q: qInicial || undefined,
    pagina: 1,
    tamanho_pagina: TAMANHO_PAGINA_PADRAO,
  });
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoPesquisaResposta | null>(null);

  // Sprint 18.5.1 — correção B3 da auditoria (condição de corrida): mesmo
  // padrão `cancelado` já usado em `useOpcoesFiltro`/`useDetalhamentoDiaria`.
  // `tentativaManual` existe só para `tentarNovamente` conseguir forçar uma
  // nova execução deste efeito mesmo quando `filtros` não mudou (retry após
  // erro, sem duplicar a busca inicial nem precisar de uma função `buscar`
  // separada fora do efeito — o que exigiria seu próprio controle de
  // corrida em paralelo).
  const [tentativaManual, setTentativaManual] = useState(0);

  useEffect(() => {
    let cancelado = false;

    (async () => {
      setCarregando(true);
      setErro(null);
      try {
        const resposta = await pesquisarDiarias(filtros);
        if (!cancelado) setResultado(resposta);
      } catch (erroCaptura) {
        if (!cancelado) {
          setResultado(null);
          setErro(mensagemAmigavel(erroCaptura, "Não foi possível carregar os resultados."));
        }
      } finally {
        if (!cancelado) setCarregando(false);
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [filtros, tentativaManual]);

  const primeiraRenderizacao = useRef(true);
  useEffect(() => {
    if (primeiraRenderizacao.current) {
      primeiraRenderizacao.current = false;
      return;
    }
    setFiltros((atual) => ({ ...atual, q: qInicial || undefined, pagina: 1 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qInicial]);

  const aplicarFiltro = useCallback((parcial: Partial<Record<CampoDeFiltro, string | undefined>>) => {
    setFiltros((atual) => ({ ...atual, ...parcial, pagina: 1 }));
  }, []);

  const removerFiltro = useCallback((campo: CampoDeFiltro) => {
    setFiltros((atual) => ({ ...atual, [campo]: undefined, pagina: 1 }));
  }, []);

  const limparFiltros = useCallback(() => {
    setFiltros((atual) => {
      const limpo = { ...atual };
      for (const campo of CAMPOS_DE_FILTRO) delete limpo[campo];
      return { ...limpo, pagina: 1 };
    });
  }, []);

  const irParaPagina = useCallback((pagina: number) => {
    setFiltros((atual) => ({ ...atual, pagina }));
  }, []);

  const ordenarPor = useCallback((campo: CampoOrdenacao) => {
    setFiltros((atual) => ({
      ...atual,
      ordenar_por: campo,
      ordem: atual.ordenar_por === campo && atual.ordem === "asc" ? "desc" : "asc",
      pagina: 1,
    }));
  }, []);

  const tentarNovamente = useCallback(() => {
    setTentativaManual((atual) => atual + 1);
  }, []);

  return {
    filtros,
    carregando,
    erro,
    resultado,
    aplicarFiltro,
    removerFiltro,
    limparFiltros,
    irParaPagina,
    ordenarPor,
    tentarNovamente,
  };
}
