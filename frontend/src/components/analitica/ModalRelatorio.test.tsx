// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../services/api", async (importarOriginal) => {
  const real = await importarOriginal<typeof import("../../services/api")>();
  return { ...real, gerarRelatorio: vi.fn() };
});

import ModalRelatorio from "./ModalRelatorio";
import { MENSAGENS } from "../../lib/mensagens";
import { gerarRelatorio } from "../../services/api";

const gerarRelatorioMock = vi.mocked(gerarRelatorio);
const MENSAGENS_RELATORIO_SALVO = MENSAGENS.relatorioSalvoComSucesso;

const FILTROS_BASE = {
  motivo: "Reunião",
  periodo_inicial: "2026-06-01",
  periodo_final: "2026-06-30",
  pagina: 1,
  tamanho_pagina: 25,
};

const PROPS_BASE = {
  aberto: true,
  filtros: FILTROS_BASE,
  totalRegistros: 312,
  aoFechar: () => {},
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ModalRelatorio", () => {
  it("aberto=false: não renderiza nada", () => {
    render(<ModalRelatorio {...PROPS_BASE} aberto={false} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renderiza como diálogo modal com título e resumo do recorte", () => {
    render(<ModalRelatorio {...PROPS_BASE} />);

    const dialogo = screen.getByRole("dialog", { name: "Gerar relatório" });
    expect(dialogo).toHaveAttribute("aria-modal", "true");
    expect(screen.getByText(/Recorte atual: 312 registros/)).toBeInTheDocument();
    expect(screen.getByText(/01–30\/06\/2026/)).toBeInTheDocument();
  });

  it("foco inicial vai para o botão 'Fechar' ao abrir (auditoria de acessibilidade — foco em modal)", () => {
    render(<ModalRelatorio {...PROPS_BASE} />);
    expect(screen.getByRole("button", { name: "Fechar" })).toHaveFocus();
  });

  it("botão 'Fechar' (X) e 'Cancelar' acionam aoFechar", () => {
    const aoFechar = vi.fn();
    render(<ModalRelatorio {...PROPS_BASE} aoFechar={aoFechar} />);

    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    expect(aoFechar).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(aoFechar).toHaveBeenCalledTimes(2);
  });

  it("tecla Esc aciona aoFechar (auditoria de acessibilidade — navegação por teclado em modais)", () => {
    const aoFechar = vi.fn();
    render(<ModalRelatorio {...PROPS_BASE} aoFechar={aoFechar} />);

    fireEvent.keyDown(window, { key: "Escape" });

    expect(aoFechar).toHaveBeenCalledTimes(1);
  });

  it("aberto=false: Esc não aciona aoFechar (listener não fica pendurado)", () => {
    const aoFechar = vi.fn();
    render(<ModalRelatorio {...PROPS_BASE} aberto={false} aoFechar={aoFechar} />);

    fireEvent.keyDown(window, { key: "Escape" });

    expect(aoFechar).not.toHaveBeenCalled();
  });

  it("2 grupos de rádio (Tipo de relatório, Formato), com 'Executivo'/'PDF' selecionados por padrão", () => {
    render(<ModalRelatorio {...PROPS_BASE} />);

    const grupos = screen.getAllByRole("radiogroup");
    expect(grupos).toHaveLength(2);

    expect(screen.getByRole("radio", { name: /Executivo/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: "PDF" })).toBeChecked();
  });

  // Decisão de produto 2026-08-06: os tipos "Inconsistências"/"Qualidade
  // dos dados" (sempre desabilitados, sem regra de negócio homologada nem
  // endpoint funcional) foram retirados da lista — não devem mais aparecer.
  it("não mostra mais os tipos retirados da interface (Inconsistências / Qualidade dos dados)", () => {
    render(<ModalRelatorio {...PROPS_BASE} />);

    expect(screen.queryByRole("radio", { name: "Inconsistências" })).not.toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "Qualidade dos dados" })).not.toBeInTheDocument();
  });

  it("todos os 6 tipos de relatório restantes vêm habilitados", () => {
    render(<ModalRelatorio {...PROPS_BASE} />);

    for (const nome of [/Executivo/, /Detalhado/, /Financeiro/, /Por servidor/, /Por município/, /Por situação/]) {
      expect(screen.getByRole("radio", { name: nome })).toBeEnabled();
    }
  });

  it("clicar num tipo disponível troca a seleção", () => {
    render(<ModalRelatorio {...PROPS_BASE} />);

    fireEvent.click(screen.getByRole("radio", { name: /Financeiro/ }));

    expect(screen.getByRole("radio", { name: /Financeiro/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /Executivo/ })).not.toBeChecked();
  });

  it("não mostra mais o checkbox 'Inconsistências' (conteúdo) retirado da interface", () => {
    render(<ModalRelatorio {...PROPS_BASE} />);

    expect(screen.queryByRole("checkbox", { name: "Inconsistências" })).not.toBeInTheDocument();
  });

  it("trocar formato para Excel desmarca e desabilita 'Gráficos' automaticamente (regra real do backend)", () => {
    render(<ModalRelatorio {...PROPS_BASE} />);

    const checkboxGraficos = screen.getByRole("checkbox", { name: "Gráficos*" });
    expect(checkboxGraficos).toBeChecked();
    expect(checkboxGraficos).not.toBeDisabled();

    fireEvent.click(screen.getByRole("radio", { name: "Excel (.xlsx)" }));

    expect(checkboxGraficos).not.toBeChecked();
    expect(checkboxGraficos).toBeDisabled();
  });

  it("voltar para PDF depois de Excel reabilita 'Gráficos' (mas não remarca sozinho)", () => {
    render(<ModalRelatorio {...PROPS_BASE} />);

    fireEvent.click(screen.getByRole("radio", { name: "CSV" }));
    fireEvent.click(screen.getByRole("radio", { name: "PDF" }));

    const checkboxGraficos = screen.getByRole("checkbox", { name: "Gráficos*" });
    expect(checkboxGraficos).not.toBeDisabled();
  });

  it("'Pré-visualizar' chama gerarRelatorio com modo='previsualizacao' e os filtros do recorte (sem paginação)", async () => {
    gerarRelatorioMock.mockResolvedValueOnce({
      caminho_arquivo_temporario: "C:\\Temp\\abc.pdf",
      nome_sugerido: "Relatório Executivo - 04-08-2026.pdf",
      sincronizado_em: "2026-08-04T10:00:00",
    });
    render(<ModalRelatorio {...PROPS_BASE} />);

    fireEvent.click(screen.getByRole("button", { name: "Pré-visualizar" }));

    await waitFor(() => expect(gerarRelatorioMock).toHaveBeenCalledTimes(1));
    const [parametros] = gerarRelatorioMock.mock.calls[0];
    expect(parametros.modo).toBe("previsualizacao");
    expect(parametros.tipo).toBe("executivo");
    expect(parametros.formato).toBe("pdf");
    expect(parametros.filtros).toEqual({
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
    expect(parametros.incluir_inconsistencias).toBe(false);

    await waitFor(() => expect(screen.getByText(/Pré-visualização — Relatório Executivo \(PDF\)/)).toBeInTheDocument());
    // Depois de sair de "configurando", o formulário (rádios) não fica
    // mais visível.
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
  });

  // Sprint (Loading/Bloqueio de Ações, item 1, exemplo obrigatório) —
  // estado real de operação em andamento (nunca debounce): o botão
  // "Pré-visualizar" mostra spinner + texto "Pré-visualizando...", fica
  // desabilitado (nativo, via `disabled`, não só visual), "Cancelar"
  // também fica indisponível (ação incompatível com uma chamada em voo),
  // e tudo volta ao normal em sucesso OU erro.
  describe("loading do botão 'Pré-visualizar' (item 13)", () => {
    it("A/C) durante a chamada, o botão mostra spinner/texto de carregamento e fica desabilitado — 'Cancelar' também", async () => {
      let resolverPreVisualizacao!: (valor: {
        caminho_arquivo_temporario: string;
        nome_sugerido: string;
        sincronizado_em: string;
      }) => void;
      gerarRelatorioMock.mockReturnValueOnce(
        new Promise((resolve) => {
          resolverPreVisualizacao = resolve;
        }),
      );
      render(<ModalRelatorio {...PROPS_BASE} />);

      fireEvent.click(screen.getByRole("button", { name: "Pré-visualizar" }));

      const botaoCarregando = await screen.findByRole("button", { name: "Pré-visualizando..." });
      expect(botaoCarregando).toBeDisabled();
      expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled();

      resolverPreVisualizacao({
        caminho_arquivo_temporario: "C:\\Temp\\abc.pdf",
        nome_sugerido: "Relatório Executivo - 04-08-2026.pdf",
        sincronizado_em: "2026-08-04T10:00:00",
      });
      await waitFor(() => expect(screen.getByText(/Pré-visualização/)).toBeInTheDocument());
    });

    it("B) clique duplo rápido dispara só uma chamada a gerarRelatorio", async () => {
      let resolverPreVisualizacao!: (valor: {
        caminho_arquivo_temporario: string;
        nome_sugerido: string;
        sincronizado_em: string;
      }) => void;
      gerarRelatorioMock.mockReturnValueOnce(
        new Promise((resolve) => {
          resolverPreVisualizacao = resolve;
        }),
      );
      render(<ModalRelatorio {...PROPS_BASE} />);
      const botao = screen.getByRole("button", { name: "Pré-visualizar" });

      fireEvent.click(botao);
      fireEvent.click(botao); // segundo clique na mesma janela síncrona

      expect(gerarRelatorioMock).toHaveBeenCalledTimes(1);
      resolverPreVisualizacao({
        caminho_arquivo_temporario: "C:\\Temp\\abc.pdf",
        nome_sugerido: "Relatório Executivo - 04-08-2026.pdf",
        sincronizado_em: "2026-08-04T10:00:00",
      });
      await waitFor(() => expect(screen.getByText(/Pré-visualização/)).toBeInTheDocument());
      expect(gerarRelatorioMock).toHaveBeenCalledTimes(1);
    });

    it("D) sucesso: o botão de carregamento não existe mais (a fase mudou, formulário some por completo)", async () => {
      gerarRelatorioMock.mockResolvedValueOnce({
        caminho_arquivo_temporario: "C:\\Temp\\abc.pdf",
        nome_sugerido: "Relatório Executivo - 04-08-2026.pdf",
        sincronizado_em: "2026-08-04T10:00:00",
      });
      render(<ModalRelatorio {...PROPS_BASE} />);

      fireEvent.click(screen.getByRole("button", { name: "Pré-visualizar" }));
      await waitFor(() => expect(screen.getByText(/Pré-visualização/)).toBeInTheDocument());

      expect(screen.queryByRole("button", { name: "Pré-visualizando..." })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Pré-visualizar" })).not.toBeInTheDocument();
    });

    it("E) erro: o botão volta a ficar habilitado, com o rótulo normal", async () => {
      gerarRelatorioMock.mockRejectedValueOnce(new Error("Não foi possível pré-visualizar o relatório."));
      render(<ModalRelatorio {...PROPS_BASE} />);

      fireEvent.click(screen.getByRole("button", { name: "Pré-visualizar" }));

      await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
      const botao = screen.getByRole("button", { name: "Pré-visualizar" });
      expect(botao).toBeEnabled();
    });
  });

  it("falha ao pré-visualizar: mostra alerta inline, permanece na fase 'configurando' (formulário continua visível)", async () => {
    gerarRelatorioMock.mockRejectedValueOnce(new Error("Não foi possível pré-visualizar o relatório."));
    render(<ModalRelatorio {...PROPS_BASE} />);

    fireEvent.click(screen.getByRole("button", { name: "Pré-visualizar" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível pré-visualizar o relatório."));
    expect(screen.getAllByRole("radiogroup")).toHaveLength(2);
  });

  it("recorte com 1 registro usa singular", () => {
    render(<ModalRelatorio {...PROPS_BASE} totalRegistros={1} />);
    expect(screen.getByText(/Recorte atual: 1 registro(?!s)/)).toBeInTheDocument();
  });

  it("sem período nos filtros: resumo não mostra intervalo de datas", () => {
    render(<ModalRelatorio {...PROPS_BASE} filtros={{ pagina: 1, tamanho_pagina: 25 }} />);
    expect(screen.getByText("Recorte atual: 312 registros")).toBeInTheDocument();
  });

  // --- Sprint 19.7.4 — pré-visualização, progresso, sucesso, erro --------

  const RESPOSTA_GERADA = {
    caminho_arquivo_temporario: "C:\\Temp\\extrator_diarias_relatorios\\abc123.pdf",
    nome_sugerido: "Relatório Executivo - 04-08-2026.pdf",
    sincronizado_em: "2026-08-04T10:32:00",
  };

  async function irParaPreVisualizacao() {
    gerarRelatorioMock.mockResolvedValueOnce(RESPOSTA_GERADA);
    render(<ModalRelatorio {...PROPS_BASE} />);
    fireEvent.click(screen.getByRole("button", { name: "Pré-visualizar" }));
    await waitFor(() => expect(screen.getByText(/Pré-visualização/)).toBeInTheDocument());
  }

  describe("fase 'pre-visualizando'", () => {
    it("mostra o nome sugerido e o horário de sincronização devolvidos pelo backend", async () => {
      await irParaPreVisualizacao();

      expect(screen.getByText(RESPOSTA_GERADA.nome_sugerido)).toBeInTheDocument();
      expect(screen.getByText((_texto, elemento) => elemento?.textContent === "Sincronizado às 04/08/2026 10:32")).toBeInTheDocument();
    });

    it("'← Voltar' retorna para 'configurando' (formulário volta a aparecer)", async () => {
      await irParaPreVisualizacao();

      fireEvent.click(screen.getByRole("button", { name: "← Voltar" }));

      expect(screen.getAllByRole("radiogroup")).toHaveLength(2);
    });

    it("'Abrir para conferir' chama window.api.abrirArquivo com o caminho temporário", async () => {
      const abrirArquivoMock = vi.fn().mockResolvedValue(undefined);
      window.api = { abrirArquivo: abrirArquivoMock } as unknown as Window["api"];
      await irParaPreVisualizacao();

      fireEvent.click(screen.getByRole("button", { name: "Abrir para conferir" }));

      await waitFor(() => expect(abrirArquivoMock).toHaveBeenCalledWith(RESPOSTA_GERADA.caminho_arquivo_temporario));
    });

    it("'Abrir para conferir' com falha mostra alerta inline, sem sair da fase de pré-visualização", async () => {
      window.api = {
        abrirArquivo: vi.fn().mockRejectedValue(new Error("falha ao abrir")),
      } as unknown as Window["api"];
      await irParaPreVisualizacao();

      fireEvent.click(screen.getByRole("button", { name: "Abrir para conferir" }));

      await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("falha ao abrir"));
      expect(screen.getByText(RESPOSTA_GERADA.nome_sugerido)).toBeInTheDocument();
    });

    it("'Gerar relatório' chama gerarRelatorio de novo com modo='final'", async () => {
      await irParaPreVisualizacao();
      gerarRelatorioMock.mockResolvedValueOnce(RESPOSTA_GERADA);
      window.api = {
        salvarRelatorio: vi.fn().mockResolvedValue({ caminhoArquivo: "x", pastaArquivo: "y" }),
      } as unknown as Window["api"];

      fireEvent.click(screen.getByRole("button", { name: "Gerar relatório" }));

      await waitFor(() => expect(gerarRelatorioMock).toHaveBeenCalledTimes(2));
      const [parametros] = gerarRelatorioMock.mock.calls[1];
      expect(parametros.modo).toBe("final");
    });
  });

  describe("fase 'gerando'", () => {
    it("mostra 'Gerando relatório...' (indeterminado, sem %) enquanto a geração está em andamento", async () => {
      await irParaPreVisualizacao();
      let resolverGeracao!: (valor: typeof RESPOSTA_GERADA) => void;
      gerarRelatorioMock.mockReturnValueOnce(
        new Promise((resolve) => {
          resolverGeracao = resolve;
        }),
      );
      window.api = {
        salvarRelatorio: vi.fn().mockResolvedValue({ caminhoArquivo: "x", pastaArquivo: "y" }),
      } as unknown as Window["api"];

      fireEvent.click(screen.getByRole("button", { name: "Gerar relatório" }));

      await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Gerando relatório..."));
      expect(screen.queryByText(/%/)).not.toBeInTheDocument();

      resolverGeracao(RESPOSTA_GERADA);
      await waitFor(() => expect(screen.getByText(MENSAGENS_RELATORIO_SALVO)).toBeInTheDocument());
    });
  });

  describe("fase 'sucesso'", () => {
    async function irParaSucesso() {
      await irParaPreVisualizacao();
      gerarRelatorioMock.mockResolvedValueOnce(RESPOSTA_GERADA);
      const salvarMock = vi.fn().mockResolvedValue({ caminhoArquivo: "C:\\x\\relatorio.pdf", pastaArquivo: "C:\\x" });
      window.api = { salvarRelatorio: salvarMock, abrirArquivo: vi.fn().mockResolvedValue(undefined) } as unknown as Window["api"];

      fireEvent.click(screen.getByRole("button", { name: "Gerar relatório" }));
      await waitFor(() => expect(screen.getByText(MENSAGENS_RELATORIO_SALVO)).toBeInTheDocument());
      return salvarMock;
    }

    it("mostra a mensagem de sucesso já homologada (mesmo texto do Processamento) e o botão 'Abrir Local'", async () => {
      await irParaSucesso();
      expect(screen.getByRole("button", { name: /Abrir Local/ })).toBeInTheDocument();
    });

    it("'Abrir Local' chama window.api.abrirArquivo com a pasta do arquivo salvo", async () => {
      await irParaSucesso();
      const abrirArquivoMock = (window.api as unknown as { abrirArquivo: ReturnType<typeof vi.fn> }).abrirArquivo;

      fireEvent.click(screen.getByRole("button", { name: /Abrir Local/ }));

      await waitFor(() => expect(abrirArquivoMock).toHaveBeenCalledWith("C:\\x"));
    });

    it("'Concluir' aciona aoFechar", async () => {
      const aoFechar = vi.fn();
      gerarRelatorioMock.mockResolvedValueOnce(RESPOSTA_GERADA);
      render(<ModalRelatorio {...PROPS_BASE} aoFechar={aoFechar} />);
      fireEvent.click(screen.getByRole("button", { name: "Pré-visualizar" }));
      await waitFor(() => expect(screen.getByText(/Pré-visualização/)).toBeInTheDocument());

      gerarRelatorioMock.mockResolvedValueOnce(RESPOSTA_GERADA);
      window.api = {
        salvarRelatorio: vi.fn().mockResolvedValue({ caminhoArquivo: "x", pastaArquivo: "y" }),
      } as unknown as Window["api"];
      fireEvent.click(screen.getByRole("button", { name: "Gerar relatório" }));
      await waitFor(() => expect(screen.getByText(MENSAGENS_RELATORIO_SALVO)).toBeInTheDocument());

      fireEvent.click(screen.getByRole("button", { name: "Concluir" }));
      expect(aoFechar).toHaveBeenCalledTimes(1);
    });
  });

  describe("fase 'erro'", () => {
    async function irParaErro() {
      await irParaPreVisualizacao();
      gerarRelatorioMock.mockRejectedValueOnce(new Error("Não foi possível gerar o relatório."));

      fireEvent.click(screen.getByRole("button", { name: "Gerar relatório" }));
      await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível gerar o relatório."));
    }

    it("mostra o alerta de erro e o botão 'Tentar novamente'", async () => {
      await irParaErro();
      expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeInTheDocument();
    });

    it("'Tentar novamente' repete a geração com os mesmos parâmetros", async () => {
      await irParaErro();
      gerarRelatorioMock.mockResolvedValueOnce(RESPOSTA_GERADA);
      window.api = {
        salvarRelatorio: vi.fn().mockResolvedValue({ caminhoArquivo: "x", pastaArquivo: "y" }),
      } as unknown as Window["api"];

      fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));

      await waitFor(() => expect(screen.getByText(MENSAGENS_RELATORIO_SALVO)).toBeInTheDocument());
    });

    it("'Cancelar' retorna para 'configurando' (formulário volta a aparecer)", async () => {
      await irParaErro();

      fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

      expect(screen.getAllByRole("radiogroup")).toHaveLength(2);
    });
  });
});
