import { useCallback, useState } from "react";

/** Sprint 19.5.7 — Motivo/Matrícula, únicas com dado disponível em
 * `DiariaResumoResposta` naquela etapa. Sprint 19.5.7.1 — as 6 restantes
 * do wireframe (`v2-wireframes.md` § 3.4) chegaram ao contrato: Origem,
 * Trecho completo (composto no frontend a partir de `origem`+`destino`,
 * sem campo próprio), Situação do servidor, CPF mascarado, Documento de
 * origem e Transporte. `cpf` aqui é sempre `cpf_mascarado` — o CPF
 * completo nunca trafega em `GET /diarias` (`ui-arquitetura.md` § 0.7). */
export type ColunaOpcional =
  | "motivo"
  | "matricula"
  | "origem"
  | "trecho"
  | "situacao"
  | "cpf"
  | "doc_origem"
  | "transporte"
  // Sprint 20 (2026-08-05) — MEMBRO/SERVIDOR/NAO_IDENTIFICADO, já calculada
  // na Base Local (`app/domain/analitica/categoria_funcional.py`).
  | "categoria_funcional";

export const COLUNAS_OPCIONAIS_DISPONIVEIS: ColunaOpcional[] = [
  "motivo",
  "matricula",
  "origem",
  "trecho",
  "situacao",
  "cpf",
  "doc_origem",
  "transporte",
  "categoria_funcional",
];

export interface EstadoUseColunasTabela {
  colunasAtivas: Set<ColunaOpcional>;
  alternarColuna: (coluna: ColunaOpcional) => void;
}

/** Preferência de colunas visíveis é local, não é dado de negócio
 * (`v2-arquitetura-funcional.md` § 4.2) — estado em memória, sem chamada de
 * rede e sem persistência entre sessões (mesmo critério já aplicado a
 * filtros/paginação, que também não persistem ao trocar de tela). */
export function useColunasTabela(): EstadoUseColunasTabela {
  const [colunasAtivas, setColunasAtivas] = useState<Set<ColunaOpcional>>(() => new Set());

  const alternarColuna = useCallback((coluna: ColunaOpcional) => {
    setColunasAtivas((atual) => {
      const nova = new Set(atual);
      if (nova.has(coluna)) {
        nova.delete(coluna);
      } else {
        nova.add(coluna);
      }
      return nova;
    });
  }, []);

  return { colunasAtivas, alternarColuna };
}
