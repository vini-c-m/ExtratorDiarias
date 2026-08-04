// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import CartaoDiagnostico from "./CartaoDiagnostico";
import type { CasoDiagnosticoResposta } from "../../types/analitica";

afterEach(() => {
  cleanup();
});

const CASO_DH: CasoDiagnosticoResposta = {
  campo: "dh",
  titulo: "Documento Hábil (DH) ainda não emitido",
  motivo: "O Documento Hábil está vazio...",
  acao_recomendada: "Nenhuma ação imediata; se o processo já é antigo, confira manualmente o andamento no SEI.",
};

const CASO_SEM_CAMPO: CasoDiagnosticoResposta = {
  campo: null,
  titulo: "Possível duplicidade",
  motivo: "Mesmo CPF e mesmo período de outro registro.",
  acao_recomendada: "Confira manualmente.",
};

describe("CartaoDiagnostico", () => {
  it("mostra título, campo problemático, motivo e ação recomendada", () => {
    render(<CartaoDiagnostico caso={CASO_DH} />);

    expect(screen.getByText("Documento Hábil (DH) ainda não emitido")).toBeInTheDocument();
    expect(screen.getByText("Campo problemático:").closest("p")).toHaveTextContent("Campo problemático: dh");
    expect(screen.getByText("Motivo provável:").closest("p")).toHaveTextContent(`Motivo provável: ${CASO_DH.motivo}`);
    expect(screen.getByText("Ação recomendada:").closest("p")).toHaveTextContent(
      `Ação recomendada: ${CASO_DH.acao_recomendada}`,
    );
  });

  it("caso sem campo (campo=null) não mostra a linha 'Campo problemático'", () => {
    render(<CartaoDiagnostico caso={CASO_SEM_CAMPO} />);
    expect(screen.queryByText("Campo problemático:")).not.toBeInTheDocument();
  });

  it("sem classificacao: nenhum selo de severidade é renderizado", () => {
    render(<CartaoDiagnostico caso={CASO_DH} />);
    expect(screen.queryByText("Esperado")).not.toBeInTheDocument();
    expect(screen.queryByText("Atenção")).not.toBeInTheDocument();
    expect(screen.queryByText("Inconsistência")).not.toBeInTheDocument();
  });

  it("classificacao='atencao' mostra o selo 'Atenção' em âmbar", () => {
    render(<CartaoDiagnostico caso={CASO_DH} classificacao="atencao" />);
    const selo = screen.getByText("Atenção");
    expect(selo).toBeInTheDocument();
    expect(selo.className).toContain("amber");
  });

  it("classificacao='esperado' mostra o selo 'Esperado' em verde", () => {
    render(<CartaoDiagnostico caso={CASO_DH} classificacao="esperado" />);
    const selo = screen.getByText("Esperado");
    expect(selo.className).toContain("emerald");
  });

  it("classificacao='inconsistencia' mostra o selo 'Inconsistência' em laranja, nunca vermelho (RN-08)", () => {
    render(<CartaoDiagnostico caso={CASO_DH} classificacao="inconsistencia" />);
    const selo = screen.getByText("Inconsistência");
    expect(selo.className).toContain("orange");
    expect(selo.className).not.toContain("red");
  });
});
