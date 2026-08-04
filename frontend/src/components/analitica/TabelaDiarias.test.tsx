// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import TabelaDiarias from "./TabelaDiarias";
import type {
  DiariaResumoResposta,
  ParametrosPesquisaDiariasQuery,
  ResultadoPesquisaResposta,
} from "../../types/analitica";

const FILTROS_VAZIOS: ParametrosPesquisaDiariasQuery = { pagina: 1, tamanho_pagina: 25 };

const ITEM: DiariaResumoResposta = {
  sei: "19.20.0903.0030720/2024-36",
  periodo: { inicial: "2025-01-08", final: "2025-01-10" },
  destino: "Araripina-PE",
  servidor: { nome: "João da Silva", matricula: "12345" },
  motivo: "Curso",
  valor_total_diarias: 480,
};

function resultadoCom(itens: DiariaResumoResposta[], totalPaginas = 1, paginaAtual = 1): ResultadoPesquisaResposta {
  return {
    itens,
    paginacao: { pagina_atual: paginaAtual, tamanho_pagina: 25, total_itens: itens.length, total_paginas: totalPaginas },
    sincronizacao: { sincronizado_em: "2026-08-01T10:00:00", total_avisos: 0 },
  };
}

afterEach(() => {
  cleanup();
});

describe("TabelaDiarias", () => {
  it("carregando: mostra o esqueleto, nunca a tabela nem um erro", () => {
    const { container } = render(
      <TabelaDiarias
        carregando
        erro={null}
        resultado={null}
        filtros={FILTROS_VAZIOS}
        onTentarNovamente={vi.fn()}
        onOrdenarPor={vi.fn()}
        onIrParaPagina={vi.fn()}
        onSelecionarLinha={vi.fn()}
      />,
    );

    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(container.querySelector(".animate-pulse")).not.toBeNull();
  });

  it("erro: mostra Alerta e 'Tentar novamente' chama onTentarNovamente", async () => {
    const usuario = userEvent.setup();
    const onTentarNovamente = vi.fn();
    render(
      <TabelaDiarias
        carregando={false}
        erro="Não foi possível carregar os resultados."
        resultado={null}
        filtros={FILTROS_VAZIOS}
        onTentarNovamente={onTentarNovamente}
        onOrdenarPor={vi.fn()}
        onIrParaPagina={vi.fn()}
        onSelecionarLinha={vi.fn()}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível carregar os resultados.");
    await usuario.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(onTentarNovamente).toHaveBeenCalledTimes(1);
  });

  it("vazio (nenhum filtro aplicado, J7): mostra o estado 'nunca sincronizado'", () => {
    render(
      <TabelaDiarias
        carregando={false}
        erro={null}
        resultado={resultadoCom([])}
        filtros={FILTROS_VAZIOS}
        onTentarNovamente={vi.fn()}
        onOrdenarPor={vi.fn()}
        onIrParaPagina={vi.fn()}
        onSelecionarLinha={vi.fn()}
      />,
    );

    expect(screen.getByText("Ainda não há dados para pesquisar.")).toBeInTheDocument();
  });

  it("sem resultados com busca global ativa: quota o termo buscado", () => {
    render(
      <TabelaDiarias
        carregando={false}
        erro={null}
        resultado={resultadoCom([])}
        filtros={{ ...FILTROS_VAZIOS, q: "xyz123" }}
        onTentarNovamente={vi.fn()}
        onOrdenarPor={vi.fn()}
        onIrParaPagina={vi.fn()}
        onSelecionarLinha={vi.fn()}
      />,
    );

    expect(screen.getByText('Nada encontrado para "xyz123".')).toBeInTheDocument();
  });

  it("sem resultados com filtro nomeado (sem q): mensagem genérica", () => {
    render(
      <TabelaDiarias
        carregando={false}
        erro={null}
        resultado={resultadoCom([])}
        filtros={{ ...FILTROS_VAZIOS, municipio: "Araripina" }}
        onTentarNovamente={vi.fn()}
        onOrdenarPor={vi.fn()}
        onIrParaPagina={vi.fn()}
        onSelecionarLinha={vi.fn()}
      />,
    );

    expect(screen.getByText("Nada encontrado para os filtros aplicados.")).toBeInTheDocument();
  });

  it("populada: mostra as 5 colunas formatadas, nunca uma coluna de CPF", () => {
    // Regressão deliberada (`ui-plano-tecnico.md` § 12): mesmo se o item de
    // dado, por erro de programação futuro, tivesse um campo `cpf`, a
    // tabela nunca deve renderizá-lo.
    const itemComCpfVazado = { ...ITEM, cpf: "12345678911" } as unknown as DiariaResumoResposta;

    render(
      <TabelaDiarias
        carregando={false}
        erro={null}
        resultado={resultadoCom([itemComCpfVazado])}
        filtros={FILTROS_VAZIOS}
        onTentarNovamente={vi.fn()}
        onOrdenarPor={vi.fn()}
        onIrParaPagina={vi.fn()}
        onSelecionarLinha={vi.fn()}
      />,
    );

    expect(screen.getByRole("columnheader", { name: /SEI/ })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /Servidor/ })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /Período/ })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /Destino/ })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /Valor/ })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: /CPF/ })).not.toBeInTheDocument();

    const linha = screen.getByText(ITEM.sei).closest("tr")!;
    expect(within(linha).getByText("João da Silva")).toBeInTheDocument();
    expect(within(linha).getByText("08–10/01/2025")).toBeInTheDocument();
    expect(within(linha).getByText("Araripina-PE")).toBeInTheDocument();
    expect(within(linha).getByText("R$ 480,00")).toBeInTheDocument();
    expect(within(linha).queryByText("12345678911")).not.toBeInTheDocument();
  });

  it("servidor/destino/valor ausentes mostram travessão, sem quebrar", () => {
    const itemIncompleto: DiariaResumoResposta = {
      sei: "sei-x",
      periodo: { inicial: "2025-01-08", final: "2025-01-10" },
      destino: null,
      servidor: null,
      motivo: "Curso",
      valor_total_diarias: null,
    };

    render(
      <TabelaDiarias
        carregando={false}
        erro={null}
        resultado={resultadoCom([itemIncompleto])}
        filtros={FILTROS_VAZIOS}
        onTentarNovamente={vi.fn()}
        onOrdenarPor={vi.fn()}
        onIrParaPagina={vi.fn()}
        onSelecionarLinha={vi.fn()}
      />,
    );

    const linha = screen.getByText("sei-x").closest("tr")!;
    expect(within(linha).getAllByText("—").length).toBe(3);
  });

  // Sprint 19.5.7 — configuração de colunas, tooltip acessível e destaque
  // de vazio (`v2-plano-tecnico.md` § 18, 19.5.7).
  describe("colunas opcionais (Sprint 19.5.7)", () => {
    it("por padrão, nenhuma coluna opcional aparece", () => {
      render(
        <TabelaDiarias
          carregando={false}
          erro={null}
          resultado={resultadoCom([ITEM])}
          filtros={FILTROS_VAZIOS}
          onTentarNovamente={vi.fn()}
          onOrdenarPor={vi.fn()}
          onIrParaPagina={vi.fn()}
          onSelecionarLinha={vi.fn()}
        />,
      );

      expect(screen.queryByRole("columnheader", { name: "Motivo" })).not.toBeInTheDocument();
      expect(screen.queryByRole("columnheader", { name: "Matrícula" })).not.toBeInTheDocument();
    });

    it("ativar 'Motivo' via ConfiguracaoColunas mostra a coluna com o dado real, sem chamar nenhum callback de busca", async () => {
      const usuario = userEvent.setup();
      const onOrdenarPor = vi.fn();
      const onIrParaPagina = vi.fn();
      const onTentarNovamente = vi.fn();
      render(
        <TabelaDiarias
          carregando={false}
          erro={null}
          resultado={resultadoCom([ITEM])}
          filtros={FILTROS_VAZIOS}
          onTentarNovamente={onTentarNovamente}
          onOrdenarPor={onOrdenarPor}
          onIrParaPagina={onIrParaPagina}
          onSelecionarLinha={vi.fn()}
        />,
      );

      await usuario.click(screen.getByRole("button", { name: /Colunas/ }));
      await usuario.click(screen.getByRole("checkbox", { name: "Motivo" }));

      expect(screen.getByRole("columnheader", { name: "Motivo" })).toBeInTheDocument();
      const linha = screen.getByText(ITEM.sei).closest("tr")!;
      // Aparece 2x na linha: o texto visível truncado e a descrição
      // sr-only associada (mesmo conteúdo, dois nós — ver teste dedicado
      // de tooltip abaixo).
      expect(within(linha).getAllByText(ITEM.motivo).length).toBeGreaterThan(0);

      // Ativar/desativar coluna é 100% local — nenhum dos callbacks que
      // disparariam uma nova busca/página/retry foi chamado.
      expect(onOrdenarPor).not.toHaveBeenCalled();
      expect(onIrParaPagina).not.toHaveBeenCalled();
      expect(onTentarNovamente).not.toHaveBeenCalled();
    });

    it("ativar 'Matrícula' mostra a coluna com a matrícula do servidor", async () => {
      const usuario = userEvent.setup();
      render(
        <TabelaDiarias
          carregando={false}
          erro={null}
          resultado={resultadoCom([ITEM])}
          filtros={FILTROS_VAZIOS}
          onTentarNovamente={vi.fn()}
          onOrdenarPor={vi.fn()}
          onIrParaPagina={vi.fn()}
          onSelecionarLinha={vi.fn()}
        />,
      );

      await usuario.click(screen.getByRole("button", { name: /Colunas/ }));
      await usuario.click(screen.getByRole("checkbox", { name: "Matrícula" }));

      expect(screen.getByRole("columnheader", { name: "Matrícula" })).toBeInTheDocument();
      const linha = screen.getByText(ITEM.sei).closest("tr")!;
      expect(within(linha).getByText(ITEM.servidor!.matricula)).toBeInTheDocument();
    });

    it("colunas opcionais não têm aria-sort nem botão de ordenação", async () => {
      const usuario = userEvent.setup();
      render(
        <TabelaDiarias
          carregando={false}
          erro={null}
          resultado={resultadoCom([ITEM])}
          filtros={FILTROS_VAZIOS}
          onTentarNovamente={vi.fn()}
          onOrdenarPor={vi.fn()}
          onIrParaPagina={vi.fn()}
          onSelecionarLinha={vi.fn()}
        />,
      );

      await usuario.click(screen.getByRole("button", { name: /Colunas/ }));
      await usuario.click(screen.getByRole("checkbox", { name: "Motivo" }));

      const cabecalhoMotivo = screen.getByRole("columnheader", { name: "Motivo" });
      expect(cabecalhoMotivo).not.toHaveAttribute("aria-sort");
      expect(within(cabecalhoMotivo).queryByRole("button")).not.toBeInTheDocument();
    });

    it("motivo longo é truncado visualmente mas o texto completo fica acessível via aria-describedby + sr-only", async () => {
      const usuario = userEvent.setup();
      const itemMotivoLongo: DiariaResumoResposta = {
        ...ITEM,
        motivo:
          "Participação em curso de capacitação e atualização profissional promovido pela Secretaria Estadual de Administração",
      };
      render(
        <TabelaDiarias
          carregando={false}
          erro={null}
          resultado={resultadoCom([itemMotivoLongo])}
          filtros={FILTROS_VAZIOS}
          onTentarNovamente={vi.fn()}
          onOrdenarPor={vi.fn()}
          onIrParaPagina={vi.fn()}
          onSelecionarLinha={vi.fn()}
        />,
      );

      await usuario.click(screen.getByRole("button", { name: /Colunas/ }));
      await usuario.click(screen.getByRole("checkbox", { name: "Motivo" }));

      // O texto completo aparece 2x no DOM (visível truncado + descrição
      // sr-only) — identificamos o nó visível pela classe `truncate`.
      const ocorrencias = screen.getAllByText(itemMotivoLongo.motivo);
      const trechoVisivel = ocorrencias.find((el) => el.className.includes("truncate"))!;
      expect(trechoVisivel).toBeDefined();
      expect(trechoVisivel).toHaveClass("truncate");
      expect(trechoVisivel).toHaveAttribute("title", itemMotivoLongo.motivo);

      const idDescricao = trechoVisivel.getAttribute("aria-describedby");
      expect(idDescricao).toBeTruthy();
      const descricaoCompleta = document.getElementById(idDescricao!);
      expect(descricaoCompleta).toHaveClass("sr-only");
      expect(descricaoCompleta).toHaveTextContent(itemMotivoLongo.motivo);
    });

    it("célula vazia é destacada (nunca em vermelho) quando a coluna Motivo está ativa e o motivo está em branco", async () => {
      const usuario = userEvent.setup();
      const itemSemMotivo: DiariaResumoResposta = { ...ITEM, motivo: "" };
      render(
        <TabelaDiarias
          carregando={false}
          erro={null}
          resultado={resultadoCom([itemSemMotivo])}
          filtros={FILTROS_VAZIOS}
          onTentarNovamente={vi.fn()}
          onOrdenarPor={vi.fn()}
          onIrParaPagina={vi.fn()}
          onSelecionarLinha={vi.fn()}
        />,
      );

      await usuario.click(screen.getByRole("button", { name: /Colunas/ }));
      await usuario.click(screen.getByRole("checkbox", { name: "Motivo" }));

      const linha = screen.getByText(ITEM.sei).closest("tr")!;
      const travessoes = within(linha).getAllByText("—");
      // Servidor/Destino/Valor já preenchidos neste item — só a nova
      // célula de Motivo vazio soma um travessão a mais.
      const travessaoMotivo = travessoes.find((el) => el.className.includes("amber"));
      expect(travessaoMotivo).toBeDefined();
      expect(travessaoMotivo?.className).not.toContain("red");
    });
  });

  // Sprint 19.5.7.1 — as 6 colunas que completam o wireframe, com foco
  // especial em CPF (privacidade) e Trecho completo (composição segura).
  describe("colunas novas: CPF mascarado, Origem, Situação, Doc. origem, Transporte, Trecho (Sprint 19.5.7.1)", () => {
    const ITEM_COMPLETO: DiariaResumoResposta = {
      ...ITEM,
      origem: "Recife-PE",
      doc_origem: "PJTESTE",
      transporte: "Aéreo",
      cpf_mascarado: "***.***.***-11",
      servidor: { nome: "João da Silva", matricula: "12345", situacao: "Em exercício" },
    };

    it("ativar 'CPF (mascarado)' mostra exatamente o valor de cpf_mascarado, sem nenhum mascaramento adicional no cliente", async () => {
      const usuario = userEvent.setup();
      render(
        <TabelaDiarias
          carregando={false}
          erro={null}
          resultado={resultadoCom([ITEM_COMPLETO])}
          filtros={FILTROS_VAZIOS}
          onTentarNovamente={vi.fn()}
          onOrdenarPor={vi.fn()}
          onIrParaPagina={vi.fn()}
          onSelecionarLinha={vi.fn()}
        />,
      );

      await usuario.click(screen.getByRole("button", { name: /Colunas/ }));
      await usuario.click(screen.getByRole("checkbox", { name: "CPF (mascarado)" }));

      expect(screen.getByRole("columnheader", { name: "CPF (mascarado)" })).toBeInTheDocument();
      const linha = screen.getByText(ITEM.sei).closest("tr")!;
      // Exatamente a string recebida — nenhuma transformação a mais.
      expect(within(linha).getByText("***.***.***-11")).toBeInTheDocument();
    });

    it("Origem, Situação do servidor, Documento de origem e Transporte mostram o dado real", async () => {
      const usuario = userEvent.setup();
      render(
        <TabelaDiarias
          carregando={false}
          erro={null}
          resultado={resultadoCom([ITEM_COMPLETO])}
          filtros={FILTROS_VAZIOS}
          onTentarNovamente={vi.fn()}
          onOrdenarPor={vi.fn()}
          onIrParaPagina={vi.fn()}
          onSelecionarLinha={vi.fn()}
        />,
      );

      await usuario.click(screen.getByRole("button", { name: /Colunas/ }));
      for (const rotulo of ["Origem", "Situação do servidor", "Documento de origem", "Transporte"]) {
        await usuario.click(screen.getByRole("checkbox", { name: rotulo }));
      }

      const linha = screen.getByText(ITEM.sei).closest("tr")!;
      expect(within(linha).getByText("Recife-PE")).toBeInTheDocument();
      expect(within(linha).getByText("Em exercício")).toBeInTheDocument();
      expect(within(linha).getByText("PJTESTE")).toBeInTheDocument();
      expect(within(linha).getByText("Aéreo")).toBeInTheDocument();
    });

    it("valor ausente nas colunas novas é destacado em âmbar, nunca em vermelho", async () => {
      const usuario = userEvent.setup();
      const itemSemDado: DiariaResumoResposta = {
        ...ITEM,
        origem: null,
        doc_origem: "",
        transporte: null,
        cpf_mascarado: null,
        servidor: { nome: "João da Silva", matricula: "12345", situacao: null },
      };
      render(
        <TabelaDiarias
          carregando={false}
          erro={null}
          resultado={resultadoCom([itemSemDado])}
          filtros={FILTROS_VAZIOS}
          onTentarNovamente={vi.fn()}
          onOrdenarPor={vi.fn()}
          onIrParaPagina={vi.fn()}
          onSelecionarLinha={vi.fn()}
        />,
      );

      await usuario.click(screen.getByRole("button", { name: /Colunas/ }));
      for (const rotulo of ["Origem", "Situação do servidor", "Documento de origem", "Transporte", "CPF (mascarado)"]) {
        await usuario.click(screen.getByRole("checkbox", { name: rotulo }));
      }

      const linha = screen.getByText(ITEM.sei).closest("tr")!;
      const travessoes = within(linha).getAllByText("—");
      const todosAmbar = travessoes.every((el) => el.className.includes("amber") && !el.className.includes("red"));
      expect(travessoes.length).toBeGreaterThanOrEqual(5);
      expect(todosAmbar).toBe(true);
    });

    it("colunas novas não têm aria-sort nem botão de ordenação (CPF como representante)", async () => {
      const usuario = userEvent.setup();
      render(
        <TabelaDiarias
          carregando={false}
          erro={null}
          resultado={resultadoCom([ITEM_COMPLETO])}
          filtros={FILTROS_VAZIOS}
          onTentarNovamente={vi.fn()}
          onOrdenarPor={vi.fn()}
          onIrParaPagina={vi.fn()}
          onSelecionarLinha={vi.fn()}
        />,
      );

      await usuario.click(screen.getByRole("button", { name: /Colunas/ }));
      await usuario.click(screen.getByRole("checkbox", { name: "CPF (mascarado)" }));

      const cabecalhoCpf = screen.getByRole("columnheader", { name: "CPF (mascarado)" });
      expect(cabecalhoCpf).not.toHaveAttribute("aria-sort");
      expect(within(cabecalhoCpf).queryByRole("button")).not.toBeInTheDocument();
    });

    it("ativar as colunas novas não chama onOrdenarPor/onIrParaPagina/onTentarNovamente (sem chamada de rede)", async () => {
      const usuario = userEvent.setup();
      const onOrdenarPor = vi.fn();
      const onIrParaPagina = vi.fn();
      const onTentarNovamente = vi.fn();
      render(
        <TabelaDiarias
          carregando={false}
          erro={null}
          resultado={resultadoCom([ITEM_COMPLETO])}
          filtros={FILTROS_VAZIOS}
          onTentarNovamente={onTentarNovamente}
          onOrdenarPor={onOrdenarPor}
          onIrParaPagina={onIrParaPagina}
          onSelecionarLinha={vi.fn()}
        />,
      );

      await usuario.click(screen.getByRole("button", { name: /Colunas/ }));
      for (const rotulo of ["Origem", "Situação do servidor", "Documento de origem", "Transporte", "CPF (mascarado)"]) {
        await usuario.click(screen.getByRole("checkbox", { name: rotulo }));
      }

      expect(onOrdenarPor).not.toHaveBeenCalled();
      expect(onIrParaPagina).not.toHaveBeenCalled();
      expect(onTentarNovamente).not.toHaveBeenCalled();
    });

    describe("Trecho completo — composição segura (nunca 'None - destino'/'origem - null'/separador isolado)", () => {
      it("origem e destino preenchidos: compõe 'origem - destino'", async () => {
        const usuario = userEvent.setup();
        const item: DiariaResumoResposta = { ...ITEM, origem: "Recife-PE", destino: "Araripina-PE" };
        render(
          <TabelaDiarias
            carregando={false}
            erro={null}
            resultado={resultadoCom([item])}
            filtros={FILTROS_VAZIOS}
            onTentarNovamente={vi.fn()}
            onOrdenarPor={vi.fn()}
            onIrParaPagina={vi.fn()}
            onSelecionarLinha={vi.fn()}
          />,
        );

        await usuario.click(screen.getByRole("button", { name: /Colunas/ }));
        await usuario.click(screen.getByRole("checkbox", { name: "Trecho completo" }));

        const linha = screen.getByText(ITEM.sei).closest("tr")!;
        expect(within(linha).getByText("Recife-PE - Araripina-PE")).toBeInTheDocument();
      });

      it("origem ausente: mostra vazio em âmbar, nunca 'null - destino'", async () => {
        const usuario = userEvent.setup();
        const item: DiariaResumoResposta = { ...ITEM, origem: null, destino: "Araripina-PE" };
        render(
          <TabelaDiarias
            carregando={false}
            erro={null}
            resultado={resultadoCom([item])}
            filtros={FILTROS_VAZIOS}
            onTentarNovamente={vi.fn()}
            onOrdenarPor={vi.fn()}
            onIrParaPagina={vi.fn()}
            onSelecionarLinha={vi.fn()}
          />,
        );

        await usuario.click(screen.getByRole("button", { name: /Colunas/ }));
        await usuario.click(screen.getByRole("checkbox", { name: "Trecho completo" }));

        expect(screen.queryByText(/null/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/none/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/^-\s*Araripina-PE$/)).not.toBeInTheDocument();
        const linha = screen.getByText(ITEM.sei).closest("tr")!;
        const celulaTrecho = within(linha).getAllByText("—").find((el) => el.className.includes("amber"));
        expect(celulaTrecho).toBeDefined();
      });

      it("destino ausente: mostra vazio em âmbar, nunca 'origem - null'", async () => {
        const usuario = userEvent.setup();
        const item: DiariaResumoResposta = { ...ITEM, origem: "Recife-PE", destino: null };
        render(
          <TabelaDiarias
            carregando={false}
            erro={null}
            resultado={resultadoCom([item])}
            filtros={FILTROS_VAZIOS}
            onTentarNovamente={vi.fn()}
            onOrdenarPor={vi.fn()}
            onIrParaPagina={vi.fn()}
            onSelecionarLinha={vi.fn()}
          />,
        );

        await usuario.click(screen.getByRole("button", { name: /Colunas/ }));
        await usuario.click(screen.getByRole("checkbox", { name: "Trecho completo" }));

        expect(screen.queryByText(/null/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/none/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/^Recife-PE\s*-\s*$/)).not.toBeInTheDocument();
      });

      it("ambos ausentes: mostra vazio em âmbar, sem separador isolado", async () => {
        const usuario = userEvent.setup();
        const item: DiariaResumoResposta = { ...ITEM, origem: null, destino: null };
        render(
          <TabelaDiarias
            carregando={false}
            erro={null}
            resultado={resultadoCom([item])}
            filtros={FILTROS_VAZIOS}
            onTentarNovamente={vi.fn()}
            onOrdenarPor={vi.fn()}
            onIrParaPagina={vi.fn()}
            onSelecionarLinha={vi.fn()}
          />,
        );

        await usuario.click(screen.getByRole("button", { name: /Colunas/ }));
        await usuario.click(screen.getByRole("checkbox", { name: "Trecho completo" }));

        expect(screen.queryByText("-")).not.toBeInTheDocument();
        const linha = screen.getByText(ITEM.sei).closest("tr")!;
        const celulaTrecho = within(linha).getAllByText("—").find((el) => el.className.includes("amber"));
        expect(celulaTrecho).toBeDefined();
      });
    });
  });

  it("clicar numa linha chama onSelecionarLinha com o SEI da linha", async () => {
    const usuario = userEvent.setup();
    const onSelecionarLinha = vi.fn();
    render(
      <TabelaDiarias
        carregando={false}
        erro={null}
        resultado={resultadoCom([ITEM])}
        filtros={FILTROS_VAZIOS}
        onTentarNovamente={vi.fn()}
        onOrdenarPor={vi.fn()}
        onIrParaPagina={vi.fn()}
        onSelecionarLinha={onSelecionarLinha}
      />,
    );

    await usuario.click(screen.getByText(ITEM.sei));

    expect(onSelecionarLinha).toHaveBeenCalledWith(ITEM.sei);
  });

  it("clicar no cabeçalho de uma coluna chama onOrdenarPor com o campo certo", async () => {
    const usuario = userEvent.setup();
    const onOrdenarPor = vi.fn();
    render(
      <TabelaDiarias
        carregando={false}
        erro={null}
        resultado={resultadoCom([ITEM])}
        filtros={FILTROS_VAZIOS}
        onTentarNovamente={vi.fn()}
        onOrdenarPor={onOrdenarPor}
        onIrParaPagina={vi.fn()}
        onSelecionarLinha={vi.fn()}
      />,
    );

    await usuario.click(screen.getByRole("button", { name: /Valor/ }));

    expect(onOrdenarPor).toHaveBeenCalledWith("valor");
  });

  it("coluna ativa de ordenação expõe aria-sort correto", () => {
    render(
      <TabelaDiarias
        carregando={false}
        erro={null}
        resultado={resultadoCom([ITEM])}
        filtros={{ ...FILTROS_VAZIOS, ordenar_por: "valor", ordem: "asc" }}
        onTentarNovamente={vi.fn()}
        onOrdenarPor={vi.fn()}
        onIrParaPagina={vi.fn()}
        onSelecionarLinha={vi.fn()}
      />,
    );

    expect(screen.getByRole("columnheader", { name: /Valor/ })).toHaveAttribute("aria-sort", "ascending");
    expect(screen.getByRole("columnheader", { name: /SEI/ })).toHaveAttribute("aria-sort", "none");
  });

  it("uma única página: não mostra a navegação de paginação", () => {
    render(
      <TabelaDiarias
        carregando={false}
        erro={null}
        resultado={resultadoCom([ITEM], 1, 1)}
        filtros={FILTROS_VAZIOS}
        onTentarNovamente={vi.fn()}
        onOrdenarPor={vi.fn()}
        onIrParaPagina={vi.fn()}
        onSelecionarLinha={vi.fn()}
      />,
    );

    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });

  it("múltiplas páginas: clicar num número de página chama onIrParaPagina", async () => {
    const usuario = userEvent.setup();
    const onIrParaPagina = vi.fn();
    render(
      <TabelaDiarias
        carregando={false}
        erro={null}
        resultado={resultadoCom([ITEM], 5, 2)}
        filtros={FILTROS_VAZIOS}
        onTentarNovamente={vi.fn()}
        onOrdenarPor={vi.fn()}
        onIrParaPagina={onIrParaPagina}
        onSelecionarLinha={vi.fn()}
      />,
    );

    await usuario.click(screen.getByRole("button", { name: "3" }));

    expect(onIrParaPagina).toHaveBeenCalledWith(3);
  });

  it("página anterior desabilitada na primeira página, próxima desabilitada na última", () => {
    render(
      <TabelaDiarias
        carregando={false}
        erro={null}
        resultado={resultadoCom([ITEM], 3, 1)}
        filtros={FILTROS_VAZIOS}
        onTentarNovamente={vi.fn()}
        onOrdenarPor={vi.fn()}
        onIrParaPagina={vi.fn()}
        onSelecionarLinha={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Página anterior" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Próxima página" })).not.toBeDisabled();
  });

  // Sprint 18.5.1 — correção B2 da auditoria: seleção de linha acessível
  // por teclado.
  describe("acessibilidade da seleção de linha (correção B2)", () => {
    it("a linha é alcançável por Tab", () => {
      render(
        <TabelaDiarias
          carregando={false}
          erro={null}
          resultado={resultadoCom([ITEM])}
          filtros={FILTROS_VAZIOS}
          onTentarNovamente={vi.fn()}
          onOrdenarPor={vi.fn()}
          onIrParaPagina={vi.fn()}
          onSelecionarLinha={vi.fn()}
        />,
      );

      expect(screen.getByText(ITEM.sei).closest("tr")).toHaveAttribute("tabindex", "0");
    });

    it("pressionar Enter com a linha focada chama onSelecionarLinha", async () => {
      const usuario = userEvent.setup();
      const onSelecionarLinha = vi.fn();
      render(
        <TabelaDiarias
          carregando={false}
          erro={null}
          resultado={resultadoCom([ITEM])}
          filtros={FILTROS_VAZIOS}
          onTentarNovamente={vi.fn()}
          onOrdenarPor={vi.fn()}
          onIrParaPagina={vi.fn()}
          onSelecionarLinha={onSelecionarLinha}
        />,
      );

      const linha = screen.getByText(ITEM.sei).closest("tr")!;
      linha.focus();
      await usuario.keyboard("{Enter}");

      expect(onSelecionarLinha).toHaveBeenCalledWith(ITEM.sei);
    });

    it("pressionar Espaço com a linha focada chama onSelecionarLinha", async () => {
      const usuario = userEvent.setup();
      const onSelecionarLinha = vi.fn();
      render(
        <TabelaDiarias
          carregando={false}
          erro={null}
          resultado={resultadoCom([ITEM])}
          filtros={FILTROS_VAZIOS}
          onTentarNovamente={vi.fn()}
          onOrdenarPor={vi.fn()}
          onIrParaPagina={vi.fn()}
          onSelecionarLinha={onSelecionarLinha}
        />,
      );

      const linha = screen.getByText(ITEM.sei).closest("tr")!;
      linha.focus();
      await usuario.keyboard(" ");

      expect(onSelecionarLinha).toHaveBeenCalledWith(ITEM.sei);
    });

    it("a linha tem nome acessível descrevendo a ação", () => {
      render(
        <TabelaDiarias
          carregando={false}
          erro={null}
          resultado={resultadoCom([ITEM])}
          filtros={FILTROS_VAZIOS}
          onTentarNovamente={vi.fn()}
          onOrdenarPor={vi.fn()}
          onIrParaPagina={vi.fn()}
          onSelecionarLinha={vi.fn()}
        />,
      );

      expect(screen.getByText(ITEM.sei).closest("tr")).toHaveAttribute(
        "aria-label",
        `Ver detalhamento da diária ${ITEM.sei}`,
      );
    });

    it("clicar com o mouse continua funcionando (comportamento preservado)", async () => {
      const usuario = userEvent.setup();
      const onSelecionarLinha = vi.fn();
      render(
        <TabelaDiarias
          carregando={false}
          erro={null}
          resultado={resultadoCom([ITEM])}
          filtros={FILTROS_VAZIOS}
          onTentarNovamente={vi.fn()}
          onOrdenarPor={vi.fn()}
          onIrParaPagina={vi.fn()}
          onSelecionarLinha={onSelecionarLinha}
        />,
      );

      await usuario.click(screen.getByText(ITEM.sei));

      expect(onSelecionarLinha).toHaveBeenCalledWith(ITEM.sei);
    });
  });

  // Sprint 18.5.1 — correção NC3 da auditoria: semântica acessível dos
  // estados de carregando/vazio/sem-resultados (erro já tinha `role="alert"`
  // via `Alerta`, sem alteração necessária ali — "não duplicar anúncios").
  describe("semântica acessível dos estados (correção NC3)", () => {
    it("carregando: expõe um texto sr-only com role=status", () => {
      render(
        <TabelaDiarias
          carregando
          erro={null}
          resultado={null}
          filtros={FILTROS_VAZIOS}
          onTentarNovamente={vi.fn()}
          onOrdenarPor={vi.fn()}
          onIrParaPagina={vi.fn()}
          onSelecionarLinha={vi.fn()}
        />,
      );

      expect(screen.getByRole("status")).toHaveTextContent("Carregando resultados...");
    });

    it("vazio: o bloco tem role=status", () => {
      render(
        <TabelaDiarias
          carregando={false}
          erro={null}
          resultado={resultadoCom([])}
          filtros={FILTROS_VAZIOS}
          onTentarNovamente={vi.fn()}
          onOrdenarPor={vi.fn()}
          onIrParaPagina={vi.fn()}
          onSelecionarLinha={vi.fn()}
        />,
      );

      expect(screen.getByRole("status")).toHaveTextContent("Ainda não há dados para pesquisar.");
    });

    it("sem resultados: o bloco tem role=status", () => {
      render(
        <TabelaDiarias
          carregando={false}
          erro={null}
          resultado={resultadoCom([])}
          filtros={{ ...FILTROS_VAZIOS, municipio: "Araripina" }}
          onTentarNovamente={vi.fn()}
          onOrdenarPor={vi.fn()}
          onIrParaPagina={vi.fn()}
          onSelecionarLinha={vi.fn()}
        />,
      );

      expect(screen.getByRole("status")).toHaveTextContent("Nada encontrado para os filtros aplicados.");
    });

    it("erro: continua expondo role=alert (via Alerta), sem role duplicado ao redor", () => {
      render(
        <TabelaDiarias
          carregando={false}
          erro="Não foi possível carregar os resultados."
          resultado={null}
          filtros={FILTROS_VAZIOS}
          onTentarNovamente={vi.fn()}
          onOrdenarPor={vi.fn()}
          onIrParaPagina={vi.fn()}
          onSelecionarLinha={vi.fn()}
        />,
      );

      expect(screen.getAllByRole("alert")).toHaveLength(1);
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });
  });
});
