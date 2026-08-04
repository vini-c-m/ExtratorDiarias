import { describe, expect, it } from "vitest";
import { filtrosParaRelatorio } from "./parametrosRelatorio";

describe("filtrosParaRelatorio", () => {
  it("copia os 15 campos de filtro, ignorando paginação/ordenação", () => {
    const resultado = filtrosParaRelatorio({
      motivo: "Reunião",
      periodo_inicial: "2026-06-01",
      periodo_final: "2026-06-30",
      pagina: 2,
      tamanho_pagina: 50,
      ordenar_por: "valor",
      ordem: "asc",
    });

    expect(resultado).toEqual({
      q: undefined,
      sei: undefined,
      cpf: undefined,
      servidor_nome: undefined,
      servidor_matricula: undefined,
      municipio: undefined,
      motivo: "Reunião",
      situacao: undefined,
      periodo_inicial: "2026-06-01",
      periodo_final: "2026-06-30",
      origem: undefined,
      destino: undefined,
      trecho: undefined,
      valor_minimo: undefined,
      valor_maximo: undefined,
    });
    expect(resultado).not.toHaveProperty("pagina");
    expect(resultado).not.toHaveProperty("ordenar_por");
  });
});
