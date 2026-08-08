import { useEffect, useState } from "react";
import { mensagemAmigavel } from "../lib/mensagens";
import { obterDocumentosHabeisPendentes } from "../services/api";
import type { DocumentosHabeisPendentesResposta, ParametrosPesquisaDiariasQuery } from "../types/analitica";
import { CAMPOS_DE_FILTRO } from "./useDiarias";

export interface EstadoUseDocumentosHabeisPendentes {
  carregando: boolean;
  erro: string | null;
  documentosHabeisPendentes: DocumentosHabeisPendentesResposta | null;
  tentarNovamente: () => void;
}

/** `GET /api/v1/analitica/documentos-habeis-pendentes` (correção de foco,
 * 2026-08-05) — mesmo padrão eager de `useIndicadores`/`useDiagnostico`:
 * reaproveita os `filtros` já geridos por `useDiarias`, refaz a busca só
 * quando um FILTRO de fato muda (`CAMPOS_DE_FILTRO`, exclui paginação/
 * ordenação), limpa o estado de forma síncrona antes de chamar a API.
 *
 * Diferente de `useDiagnostico` (chamado só dentro de `PainelDiagnostico`,
 * sob demanda): este hook é chamado uma única vez em `CentralAnalitica`
 * (mesmo nível de `useIndicadores`) porque o resumo alimenta o badge do
 * botão "Documentos Hábeis Pendentes" e o aviso de liberação atingida, que
 * precisam estar visíveis mesmo antes do usuário abrir a lista — nunca uma
 * segunda instância/busca duplicada dentro de `PainelDocumentosHabeisPendentes`,
 * que só lê o resultado já carregado aqui. */
export function useDocumentosHabeisPendentes(
  filtros: ParametrosPesquisaDiariasQuery,
): EstadoUseDocumentosHabeisPendentes {
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [documentosHabeisPendentes, setDocumentosHabeisPendentes] =
    useState<DocumentosHabeisPendentesResposta | null>(null);
  const [tentativaManual, setTentativaManual] = useState(0);

  const chaveDeFiltro = JSON.stringify(
    Object.fromEntries(CAMPOS_DE_FILTRO.map((campo) => [campo, filtros[campo]])),
  );

  useEffect(() => {
    let cancelado = false;
    const parametrosFiltro = JSON.parse(chaveDeFiltro) as ParametrosPesquisaDiariasQuery;

    setCarregando(true);
    setErro(null);
    setDocumentosHabeisPendentes(null);

    (async () => {
      try {
        const resultado = await obterDocumentosHabeisPendentes(parametrosFiltro);
        if (!cancelado) setDocumentosHabeisPendentes(resultado);
      } catch (erroCaptura) {
        if (!cancelado) {
          setDocumentosHabeisPendentes(null);
          setErro(mensagemAmigavel(erroCaptura, "Não foi possível carregar os Documentos Hábeis Pendentes."));
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

  return { carregando, erro, documentosHabeisPendentes, tentarNovamente };
}
