// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import Hub from "./Hub";

afterEach(() => {
  cleanup();
});

describe("Hub", () => {
  it("mostra um card por funcionalidade, com título e descrição", () => {
    render(
      <Hub
        backendOnline
        aoSelecionarProcessamento={vi.fn()}
        aoSelecionarConferencia={vi.fn()}
        aoSelecionarAnalitica={vi.fn()}
        aoAbrirDocumentosHabeisPendentes={vi.fn()}
        aoSelecionarRegularizacaoDH={vi.fn()}
      />,
    );

    expect(screen.getByText("Processamento da Planilha")).toBeInTheDocument();
    expect(screen.getByText(/Processe PDFs e alimente automaticamente/)).toBeInTheDocument();

    expect(screen.getByText("Central Inteligente de Conferência")).toBeInTheDocument();
    expect(screen.getByText(/Consulte rapidamente servidores/)).toBeInTheDocument();

    expect(screen.getByText("Central Analítica")).toBeInTheDocument();
    expect(screen.getByText(/Pesquise, filtre e analise diárias/)).toBeInTheDocument();

    expect(screen.getByText("Central de Regularização de DH")).toBeInTheDocument();
    expect(screen.getByText(/Consulte os processos já cadastrados/)).toBeInTheDocument();

    expect(screen.getByText("Relatório do Portal da Transparência")).toBeInTheDocument();
    expect(screen.getByText(/Concilia a Base E-Fisco/)).toBeInTheDocument();
  });

  it("clicar no card do Relatório do Portal da Transparência aciona só aoSelecionarRelatorioTransparencia", async () => {
    const usuario = userEvent.setup();
    const aoSelecionarRelatorioTransparencia = vi.fn();
    const aoSelecionarAnalitica = vi.fn();
    render(
      <Hub
        backendOnline
        aoSelecionarProcessamento={vi.fn()}
        aoSelecionarConferencia={vi.fn()}
        aoSelecionarAnalitica={aoSelecionarAnalitica}
        aoAbrirDocumentosHabeisPendentes={vi.fn()}
        aoSelecionarRegularizacaoDH={vi.fn()}
        aoSelecionarRelatorioTransparencia={aoSelecionarRelatorioTransparencia}
      />,
    );

    await usuario.click(screen.getByRole("button", { name: /Relatório do Portal da Transparência/ }));

    expect(aoSelecionarRelatorioTransparencia).toHaveBeenCalledTimes(1);
    expect(aoSelecionarAnalitica).not.toHaveBeenCalled();
  });

  it("card do Relatório do Portal da Transparência sem a prop (testes antigos que montam o Hub sem ela): clique não quebra", async () => {
    const usuario = userEvent.setup();
    render(
      <Hub
        backendOnline
        aoSelecionarProcessamento={vi.fn()}
        aoSelecionarConferencia={vi.fn()}
        aoSelecionarAnalitica={vi.fn()}
        aoAbrirDocumentosHabeisPendentes={vi.fn()}
        aoSelecionarRegularizacaoDH={vi.fn()}
      />,
    );

    await usuario.click(screen.getByRole("button", { name: /Relatório do Portal da Transparência/ }));

    expect(screen.getByText("Relatório do Portal da Transparência")).toBeInTheDocument();
  });

  it("clicar no card da Central de Regularização de DH aciona só aoSelecionarRegularizacaoDH", async () => {
    const usuario = userEvent.setup();
    const aoSelecionarRegularizacaoDH = vi.fn();
    const aoSelecionarAnalitica = vi.fn();
    render(
      <Hub
        backendOnline
        aoSelecionarProcessamento={vi.fn()}
        aoSelecionarConferencia={vi.fn()}
        aoSelecionarAnalitica={aoSelecionarAnalitica}
        aoAbrirDocumentosHabeisPendentes={vi.fn()}
        aoSelecionarRegularizacaoDH={aoSelecionarRegularizacaoDH}
      />,
    );

    await usuario.click(screen.getByRole("button", { name: /Central de Regularização de DH/ }));

    expect(aoSelecionarRegularizacaoDH).toHaveBeenCalledTimes(1);
    expect(aoSelecionarAnalitica).not.toHaveBeenCalled();
  });

  it("clicar no card de Processamento aciona só aoSelecionarProcessamento", async () => {
    const usuario = userEvent.setup();
    const aoSelecionarProcessamento = vi.fn();
    const aoSelecionarConferencia = vi.fn();
    const aoSelecionarAnalitica = vi.fn();
    render(
      <Hub
        backendOnline
        aoSelecionarProcessamento={aoSelecionarProcessamento}
        aoSelecionarConferencia={aoSelecionarConferencia}
        aoSelecionarAnalitica={aoSelecionarAnalitica}
        aoAbrirDocumentosHabeisPendentes={vi.fn()}
        aoSelecionarRegularizacaoDH={vi.fn()}
      />,
    );

    await usuario.click(screen.getByRole("button", { name: /Processamento da Planilha/ }));

    expect(aoSelecionarProcessamento).toHaveBeenCalledTimes(1);
    expect(aoSelecionarConferencia).not.toHaveBeenCalled();
    expect(aoSelecionarAnalitica).not.toHaveBeenCalled();
  });

  it("clicar no card de Conferência aciona só aoSelecionarConferencia", async () => {
    const usuario = userEvent.setup();
    const aoSelecionarProcessamento = vi.fn();
    const aoSelecionarConferencia = vi.fn();
    const aoSelecionarAnalitica = vi.fn();
    render(
      <Hub
        backendOnline
        aoSelecionarProcessamento={aoSelecionarProcessamento}
        aoSelecionarConferencia={aoSelecionarConferencia}
        aoSelecionarAnalitica={aoSelecionarAnalitica}
        aoAbrirDocumentosHabeisPendentes={vi.fn()}
        aoSelecionarRegularizacaoDH={vi.fn()}
      />,
    );

    await usuario.click(screen.getByRole("button", { name: /Central Inteligente de Conferência/ }));

    expect(aoSelecionarConferencia).toHaveBeenCalledTimes(1);
    expect(aoSelecionarProcessamento).not.toHaveBeenCalled();
    expect(aoSelecionarAnalitica).not.toHaveBeenCalled();
  });

  it("clicar no card da Central Analítica aciona só aoSelecionarAnalitica", async () => {
    const usuario = userEvent.setup();
    const aoSelecionarProcessamento = vi.fn();
    const aoSelecionarConferencia = vi.fn();
    const aoSelecionarAnalitica = vi.fn();
    render(
      <Hub
        backendOnline
        aoSelecionarProcessamento={aoSelecionarProcessamento}
        aoSelecionarConferencia={aoSelecionarConferencia}
        aoSelecionarAnalitica={aoSelecionarAnalitica}
        aoAbrirDocumentosHabeisPendentes={vi.fn()}
        aoSelecionarRegularizacaoDH={vi.fn()}
      />,
    );

    await usuario.click(screen.getByRole("button", { name: /Central Analítica/ }));

    expect(aoSelecionarAnalitica).toHaveBeenCalledTimes(1);
    expect(aoSelecionarProcessamento).not.toHaveBeenCalled();
    expect(aoSelecionarConferencia).not.toHaveBeenCalled();
  });

  it("backend offline: mostra o aviso, mas os cards continuam clicáveis", async () => {
    const usuario = userEvent.setup();
    const aoSelecionarProcessamento = vi.fn();
    render(
      <Hub
        backendOnline={false}
        aoSelecionarProcessamento={aoSelecionarProcessamento}
        aoSelecionarConferencia={vi.fn()}
        aoSelecionarAnalitica={vi.fn()}
        aoAbrirDocumentosHabeisPendentes={vi.fn()}
        aoSelecionarRegularizacaoDH={vi.fn()}
      />,
    );

    expect(screen.getByText("Aguardando o aplicativo terminar de iniciar...")).toBeInTheDocument();

    await usuario.click(screen.getByRole("button", { name: /Processamento da Planilha/ }));
    expect(aoSelecionarProcessamento).toHaveBeenCalledTimes(1);
  });

  it("backend online: não mostra o aviso", () => {
    render(
      <Hub
        backendOnline
        aoSelecionarProcessamento={vi.fn()}
        aoSelecionarConferencia={vi.fn()}
        aoSelecionarAnalitica={vi.fn()}
        aoAbrirDocumentosHabeisPendentes={vi.fn()}
        aoSelecionarRegularizacaoDH={vi.fn()}
      />,
    );

    expect(screen.queryByText("Aguardando o aplicativo terminar de iniciar...")).not.toBeInTheDocument();
  });

  // Organização Automática de PDFs.
  describe("aviso de pastas operacionais pendentes", () => {
    function propsBase() {
      return {
        backendOnline: true,
        aoSelecionarProcessamento: vi.fn(),
        aoSelecionarConferencia: vi.fn(),
        aoSelecionarAnalitica: vi.fn(),
        aoAbrirDocumentosHabeisPendentes: vi.fn(),
        aoSelecionarRegularizacaoDH: vi.fn(),
      };
    }

    it("nenhuma pendência: não mostra o banner", () => {
      render(
        <Hub
          {...propsBase()}
          configuracaoAtiva={{
            configurado: true,
            planilha_acessivel: true,
            requer_revalidacao: false,
            caminho_planilha_oficial: "C:/planilha.xlsx",
            configurado_em: "2026-08-01T10:00:00",
            caminho_pdfs_a_processar: "C:/pdfs",
            caminho_pdfs_complemento_a_processar: "C:/pdfs",
            caminho_pdfs_processados: "C:/processados",
            caminho_pdfs_diarias_a_confirmar: "C:/a-confirmar",
            prontidao_pastas: {
              processamento_padrao: { liberado: true, pastas_faltando: [] },
              complemento: { liberado: true, pastas_faltando: [] },
              finalizacao: { liberado: true, pastas_faltando: [] },
            },
          }}
        />,
      );

      expect(
        screen.queryByText("Configuração de pastas incompleta. Algumas funções estão indisponíveis."),
      ).not.toBeInTheDocument();
    });

    it("alguma pendência: mostra o banner e 'Configurar agora' aciona aoAbrirConfiguracoes", async () => {
      const usuario = userEvent.setup();
      const aoAbrirConfiguracoes = vi.fn();

      render(
        <Hub
          {...propsBase()}
          aoAbrirConfiguracoes={aoAbrirConfiguracoes}
          configuracaoAtiva={{
            configurado: true,
            planilha_acessivel: true,
            requer_revalidacao: false,
            caminho_planilha_oficial: "C:/planilha.xlsx",
            configurado_em: "2026-08-01T10:00:00",
            caminho_pdfs_a_processar: null,
            caminho_pdfs_complemento_a_processar: null,
            caminho_pdfs_processados: null,
            caminho_pdfs_diarias_a_confirmar: null,
            prontidao_pastas: {
              processamento_padrao: {
                liberado: false,
                pastas_faltando: ["PDFs a Processar", "PDFs Processados"],
              },
              complemento: { liberado: true, pastas_faltando: [] },
              finalizacao: { liberado: true, pastas_faltando: [] },
            },
          }}
        />,
      );

      expect(
        screen.getByText("Configuração de pastas incompleta. Algumas funções estão indisponíveis."),
      ).toBeInTheDocument();

      await usuario.click(screen.getByRole("button", { name: "Configurar agora" }));

      expect(aoAbrirConfiguracoes).toHaveBeenCalledTimes(1);
    });

    it("configuracaoAtiva ausente (prop não passada): nunca mostra o banner", () => {
      render(<Hub {...propsBase()} />);

      expect(
        screen.queryByText("Configuração de pastas incompleta. Algumas funções estão indisponíveis."),
      ).not.toBeInTheDocument();
    });
  });
});
