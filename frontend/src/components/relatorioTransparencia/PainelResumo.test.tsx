// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PainelResumo from "./PainelResumo";
import type { ParametrosFontesRelatorioTransparencia, ResumoRelatorioTransparencia } from "../../types/relatorioTransparencia";

vi.mock("../../services/api", async (importarOriginal) => {
  const real = await importarOriginal<typeof import("../../services/api")>();
  return {
    ...real,
    obterStatusTemplateRelatorioTransparencia: vi.fn(),
    configurarTemplateRelatorioTransparencia: vi.fn(),
    gerarRelatorioTransparencia: vi.fn(),
  };
});

import {
  configurarTemplateRelatorioTransparencia,
  gerarRelatorioTransparencia,
  obterStatusTemplateRelatorioTransparencia,
} from "../../services/api";

const statusMock = vi.mocked(obterStatusTemplateRelatorioTransparencia);
const configurarMock = vi.mocked(configurarTemplateRelatorioTransparencia);
const gerarMock = vi.mocked(gerarRelatorioTransparencia);

const CAMINHO_CONFIGURACAO_TEMPLATE = "C:\\fake\\AppData\\relatorio_transparencia_template_configuracao.json";

const PARAMETROS_FONTES: ParametrosFontesRelatorioTransparencia = {
  caminho_base_ordens_bancarias: "C:\\fake\\ob.xlsx",
  caminho_controle_dimcac: "C:\\fake\\dimcac.xlsx",
  ano_exercicio: 2026,
  mes_referencia: 8,
  caminho_decisoes: "C:\\fake\\decisoes.json",
};

function criarXlsx(nome: string): File {
  return new File(["conteúdo fictício"], nome, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

function revisao(
  estado: "pendente" | "decidida" | "adiada" | "desatualizada" | "requer_nova_decisao",
  sobrescritas: Partial<ResumoRelatorioTransparencia["revisoes"][number]> = {},
) {
  return {
    identidade_grupo: `grupo-${estado}`,
    regra: "RN07",
    estado,
    explicacao: "explicação fictícia",
    campos_iguais: [],
    campos_diferentes: [],
    ocorrencias: [],
    autor: null,
    decidido_em: null,
    observacao: null,
    obs_publicaveis: null,
    ...sobrescritas,
  };
}

const RESUMO_COM_PENDENCIAS: ResumoRelatorioTransparencia = {
  total_candidatos_normais: 1799,
  total_revisoes: 8,
  total_pendentes: 6,
  total_decididas: 6,
  total_adiadas: 1,
  total_desatualizadas: 1,
  total_requer_nova_decisao: 0,
  total_ocorrencias_nao_publicaveis: 0,
  pode_gerar_relatorio: false,
  revisoes: [
    revisao("pendente"),
    revisao("pendente"),
    revisao("adiada"),
    revisao("desatualizada"),
    revisao("decidida", { autor: "servidor.teste", decidido_em: "2026-08-20T10:00:00Z", obs_publicaveis: ["2026OB000001"] }),
    revisao("decidida", { autor: "servidor.teste", decidido_em: "2026-08-21T10:00:00Z", obs_publicaveis: ["2026OB000002"] }),
  ],
};

const RESUMO_SEM_PENDENCIAS: ResumoRelatorioTransparencia = {
  total_candidatos_normais: 1804,
  total_revisoes: 8,
  total_pendentes: 0,
  total_decididas: 8,
  total_adiadas: 0,
  total_desatualizadas: 0,
  total_requer_nova_decisao: 0,
  total_ocorrencias_nao_publicaveis: 3,
  pode_gerar_relatorio: true,
  revisoes: [revisao("decidida"), revisao("decidida")],
};

function renderComGeracao(resumo: ResumoRelatorioTransparencia = RESUMO_SEM_PENDENCIAS) {
  return render(
    <PainelResumo
      resumo={resumo}
      parametrosFontes={PARAMETROS_FONTES}
      caminhoConfiguracaoTemplate={CAMINHO_CONFIGURACAO_TEMPLATE}
      onRevisarCasos={vi.fn()}
      onVoltarParaEntrada={vi.fn()}
    />,
  );
}

beforeEach(() => {
  window.api = {
    ...window.api,
    getPathForFile: (arquivo: File) => `C:\\fake\\${arquivo.name}`,
    escolherDestinoRelatorioTransparencia: vi.fn(),
    abrirArquivo: vi.fn().mockResolvedValue(undefined),
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("PainelResumo — com pendências (Tela 2)", () => {
  it("mostra o aviso e o número de casos que precisam de revisão (2 pendentes + 1 adiada + 1 desatualizada = 4)", () => {
    render(
      <PainelResumo
        resumo={RESUMO_COM_PENDENCIAS}
        parametrosFontes={null}
        caminhoConfiguracaoTemplate={null}
        onRevisarCasos={vi.fn()}
        onVoltarParaEntrada={vi.fn()}
      />,
    );

    expect(screen.getByText("Existem casos que precisam ser analisados antes da geração.")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Revisar 4 Casos" })).toBeInTheDocument();
  });

  it("nunca mostra o botão 'Gerar Relatório' enquanto há pendências", () => {
    render(
      <PainelResumo
        resumo={RESUMO_COM_PENDENCIAS}
        parametrosFontes={null}
        caminhoConfiguracaoTemplate={null}
        onRevisarCasos={vi.fn()}
        onVoltarParaEntrada={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: "Gerar Relatório" })).not.toBeInTheDocument();
  });

  it("clicar em 'Revisar N Casos' aciona onRevisarCasos", async () => {
    const usuario = userEvent.setup();
    const onRevisarCasos = vi.fn();
    render(
      <PainelResumo
        resumo={RESUMO_COM_PENDENCIAS}
        parametrosFontes={null}
        caminhoConfiguracaoTemplate={null}
        onRevisarCasos={onRevisarCasos}
        onVoltarParaEntrada={vi.fn()}
      />,
    );

    await usuario.click(screen.getByRole("button", { name: "Revisar 4 Casos" }));

    expect(onRevisarCasos).toHaveBeenCalledTimes(1);
  });
});

describe("PainelResumo — sem pendências (Tela 5), template ainda não configurado", () => {
  it("mostra a mensagem de conclusão, vinda apenas de resumo.pode_gerar_relatorio", async () => {
    statusMock.mockResolvedValue({ configurado: false, disponivel: false, caminho_template: null });
    renderComGeracao();

    expect(screen.getByText("Todas as revisões foram concluídas.")).toBeInTheDocument();
    expect(screen.getByText("Relatório pronto para geração.")).toBeInTheDocument();
    await waitFor(() => expect(statusMock).toHaveBeenCalled());
  });

  it("nunca mostra o botão 'Revisar Casos' quando não há pendências", async () => {
    statusMock.mockResolvedValue({ configurado: false, disponivel: false, caminho_template: null });
    renderComGeracao();

    expect(screen.queryByRole("button", { name: /^Revisar/ })).not.toBeInTheDocument();
    await waitFor(() => expect(statusMock).toHaveBeenCalled());
  });

  it("pede a seleção do template, sem mostrar o caminho técnico como campo de usuário", async () => {
    statusMock.mockResolvedValue({ configurado: false, disponivel: false, caminho_template: null });
    renderComGeracao();

    await waitFor(() =>
      expect(screen.getByText(/Selecione o template oficial do relatório/)).toBeInTheDocument(),
    );
    expect(screen.getByTitle("Selecionar Template Oficial")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Gerar Relatório" })).not.toBeInTheDocument();
    expect(screen.queryByText(CAMINHO_CONFIGURACAO_TEMPLATE)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/caminho/i)).not.toBeInTheDocument();
  });

  it("selecionar o template chama a API de configuração e libera o botão 'Gerar Relatório'", async () => {
    const usuario = userEvent.setup();
    statusMock.mockResolvedValue({ configurado: false, disponivel: false, caminho_template: null });
    configurarMock.mockResolvedValue({
      configurado: true,
      disponivel: true,
      caminho_template: "C:\\fake\\Modelo_Oficial.xlsx",
    });
    renderComGeracao();

    await waitFor(() => expect(screen.getByTitle("Selecionar Template Oficial")).toBeInTheDocument());
    const input = document.querySelector('input[type="file"][accept=".xlsx"]') as HTMLInputElement;
    await usuario.upload(input, criarXlsx("Modelo_Oficial.xlsx"));

    await waitFor(() => expect(configurarMock).toHaveBeenCalledWith({
      caminho_configuracao_template: CAMINHO_CONFIGURACAO_TEMPLATE,
      caminho_template: "C:\\fake\\Modelo_Oficial.xlsx",
    }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Gerar Relatório" })).toBeInTheDocument());
    expect(screen.getByText(/Modelo oficial:/)).toHaveTextContent("Modelo_Oficial.xlsx");
  });
});

describe("PainelResumo — template configurado mas arquivo indisponível", () => {
  it("avisa que o template sumiu e permite selecionar novamente", async () => {
    statusMock.mockResolvedValue({ configurado: true, disponivel: false, caminho_template: null });
    renderComGeracao();

    await waitFor(() =>
      expect(screen.getByText(/template oficial configurado não foi encontrado/)).toBeInTheDocument(),
    );
    expect(screen.getByTitle("Selecionar Template Oficial")).toBeInTheDocument();
  });
});

describe("PainelResumo — template pronto: geração final", () => {
  beforeEach(() => {
    statusMock.mockResolvedValue({
      configurado: true,
      disponivel: true,
      caminho_template: "C:\\fake\\Modelo.xlsx",
    });
  });

  it("'Gerar Relatório' habilitado, sem badge 'Em breve'", async () => {
    renderComGeracao();

    await waitFor(() => expect(screen.getByRole("button", { name: "Gerar Relatório" })).toBeEnabled());
    expect(screen.queryByText("Em breve")).not.toBeInTheDocument();
  });

  it("clicar em 'Gerar Relatório' abre o diálogo de destino; cancelar não chama a API nem mostra erro", async () => {
    const usuario = userEvent.setup();
    (window.api.escolherDestinoRelatorioTransparencia as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    renderComGeracao();

    await waitFor(() => expect(screen.getByRole("button", { name: "Gerar Relatório" })).toBeEnabled());
    await usuario.click(screen.getByRole("button", { name: "Gerar Relatório" }));

    await waitFor(() => expect(window.api.escolherDestinoRelatorioTransparencia).toHaveBeenCalledWith(
      "Relatório de Diárias - Portal da Transparência - Agosto 2026.xlsx",
    ));
    expect(gerarMock).not.toHaveBeenCalled();
    expect(screen.queryByText(/Não foi possível/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Gerar Relatório" })).toBeEnabled();
  });

  it("destino confirmado: mostra 'Gerando relatório...' e depois o painel de sucesso com Abrir relatório/pasta", async () => {
    const usuario = userEvent.setup();
    (window.api.escolherDestinoRelatorioTransparencia as ReturnType<typeof vi.fn>).mockResolvedValue(
      "C:\\fake\\pasta\\Relatorio.xlsx",
    );
    gerarMock.mockResolvedValue({
      caminho_arquivo: "C:\\fake\\pasta\\Relatorio.xlsx",
      total_ocorrencias: 5,
      total_valor_diarias: 1000,
      primeira_linha_dados: 7,
      ultima_linha_dados: 11,
      linha_total: 12,
      caminho_arquivo_nao_publicadas: null,
      total_nao_publicadas: 0,
      total_categoria_a: 0,
      total_categoria_b: 0,
      nao_publicadas_gerado: false,
      erro_nao_publicadas: null,
    });
    renderComGeracao();

    await waitFor(() => expect(screen.getByRole("button", { name: "Gerar Relatório" })).toBeEnabled());
    await usuario.click(screen.getByRole("button", { name: "Gerar Relatório" }));

    await waitFor(() => expect(screen.getByText("Relatório gerado com sucesso.")).toBeInTheDocument());
    expect(screen.getByText("Relatorio.xlsx")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Abrir relatório" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Abrir pasta/ })).toBeInTheDocument();

    expect(gerarMock).toHaveBeenCalledWith({
      ...PARAMETROS_FONTES,
      caminho_configuracao_template: CAMINHO_CONFIGURACAO_TEMPLATE,
      caminho_destino: "C:\\fake\\pasta\\Relatorio.xlsx",
    });
  });

  // --- Sprint 5 — resumo pós-geração dos dois artefatos ---------------------

  it("com diárias não publicadas: mostra a contagem e o botão para abrir a planilha operacional", async () => {
    const usuario = userEvent.setup();
    (window.api.escolherDestinoRelatorioTransparencia as ReturnType<typeof vi.fn>).mockResolvedValue(
      "C:\\fake\\pasta\\Relatorio.xlsx",
    );
    gerarMock.mockResolvedValue({
      caminho_arquivo: "C:\\fake\\pasta\\Relatorio.xlsx",
      total_ocorrencias: 5,
      total_valor_diarias: 1000,
      primeira_linha_dados: 7,
      ultima_linha_dados: 11,
      linha_total: 12,
      caminho_arquivo_nao_publicadas: "C:\\fake\\pasta\\Diarias_Nao_Publicadas_Agosto_2026.xlsx",
      total_nao_publicadas: 3,
      total_categoria_a: 2,
      total_categoria_b: 1,
      nao_publicadas_gerado: true,
      erro_nao_publicadas: null,
    });
    renderComGeracao();

    await waitFor(() => expect(screen.getByRole("button", { name: "Gerar Relatório" })).toBeEnabled());
    await usuario.click(screen.getByRole("button", { name: "Gerar Relatório" }));

    await waitFor(() => expect(screen.getByText("Relatório gerado com sucesso.")).toBeInTheDocument());
    const linhaResumoOperacional = screen.getByText(/Diárias para investigação/).closest("p");
    expect(linhaResumoOperacional).toHaveTextContent("Diárias para investigação: 3");
    const botaoOperacional = screen.getByRole("button", { name: "Abrir planilha de não publicadas" });
    expect(botaoOperacional).toBeInTheDocument();

    await usuario.click(botaoOperacional);
    expect(window.api.abrirArquivo).toHaveBeenCalledWith("C:\\fake\\pasta\\Diarias_Nao_Publicadas_Agosto_2026.xlsx");
  });

  it("sem diárias não publicadas: mostra a mensagem informativa, sem botão de abrir operacional", async () => {
    const usuario = userEvent.setup();
    (window.api.escolherDestinoRelatorioTransparencia as ReturnType<typeof vi.fn>).mockResolvedValue(
      "C:\\fake\\pasta\\Relatorio.xlsx",
    );
    gerarMock.mockResolvedValue({
      caminho_arquivo: "C:\\fake\\pasta\\Relatorio.xlsx",
      total_ocorrencias: 5,
      total_valor_diarias: 1000,
      primeira_linha_dados: 7,
      ultima_linha_dados: 11,
      linha_total: 12,
      caminho_arquivo_nao_publicadas: null,
      total_nao_publicadas: 0,
      total_categoria_a: 0,
      total_categoria_b: 0,
      nao_publicadas_gerado: false,
      erro_nao_publicadas: null,
    });
    renderComGeracao();

    await waitFor(() => expect(screen.getByRole("button", { name: "Gerar Relatório" })).toBeEnabled());
    await usuario.click(screen.getByRole("button", { name: "Gerar Relatório" }));

    await waitFor(() => expect(screen.getByText("Relatório gerado com sucesso.")).toBeInTheDocument());
    expect(screen.getByText("Não há diárias não publicadas para investigação.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Abrir planilha de não publicadas" })).not.toBeInTheDocument();
  });

  it("falha na geração do operacional: mostra aviso de estado parcial, nunca some com o sucesso do oficial", async () => {
    const usuario = userEvent.setup();
    (window.api.escolherDestinoRelatorioTransparencia as ReturnType<typeof vi.fn>).mockResolvedValue(
      "C:\\fake\\pasta\\Relatorio.xlsx",
    );
    gerarMock.mockResolvedValue({
      caminho_arquivo: "C:\\fake\\pasta\\Relatorio.xlsx",
      total_ocorrencias: 5,
      total_valor_diarias: 1000,
      primeira_linha_dados: 7,
      ultima_linha_dados: 11,
      linha_total: 12,
      caminho_arquivo_nao_publicadas: null,
      total_nao_publicadas: 2,
      total_categoria_a: 2,
      total_categoria_b: 0,
      nao_publicadas_gerado: false,
      erro_nao_publicadas: "Já existe um arquivo no destino.",
    });
    renderComGeracao();

    await waitFor(() => expect(screen.getByRole("button", { name: "Gerar Relatório" })).toBeEnabled());
    await usuario.click(screen.getByRole("button", { name: "Gerar Relatório" }));

    await waitFor(() => expect(screen.getByText("Relatório gerado com sucesso.")).toBeInTheDocument());
    expect(screen.getByText(/não foi possível gerar a planilha de diárias não publicadas/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Abrir relatório" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Abrir planilha de não publicadas" })).not.toBeInTheDocument();
    // Nunca expõe a mensagem técnica crua do backend (ex.: caminho de arquivo/causa interna).
    expect(screen.queryByText("Já existe um arquivo no destino.")).not.toBeInTheDocument();
  });

  it("clique duplo no botão 'Gerar Relatório' dispara o diálogo de destino uma única vez", async () => {
    const usuario = userEvent.setup();
    (window.api.escolherDestinoRelatorioTransparencia as ReturnType<typeof vi.fn>).mockImplementation(
      () => new Promise(() => {}), // nunca resolve, simula diálogo aberto
    );
    renderComGeracao();

    await waitFor(() => expect(screen.getByRole("button", { name: "Gerar Relatório" })).toBeEnabled());
    const botao = screen.getByRole("button", { name: "Gerar Relatório" });
    await usuario.click(botao);
    await usuario.click(botao);

    await waitFor(() => expect(window.api.escolherDestinoRelatorioTransparencia).toHaveBeenCalledTimes(1));
    expect(botao).toBeDisabled();
  });

  it("erro 409 de pendências mostra mensagem amigável", async () => {
    const usuario = userEvent.setup();
    (window.api.escolherDestinoRelatorioTransparencia as ReturnType<typeof vi.fn>).mockResolvedValue(
      "C:\\fake\\Relatorio.xlsx",
    );
    gerarMock.mockRejectedValue(
      new Error("Não é possível gerar o relatório: existem revisões sem decisão válida."),
    );
    renderComGeracao();

    await waitFor(() => expect(screen.getByRole("button", { name: "Gerar Relatório" })).toBeEnabled());
    await usuario.click(screen.getByRole("button", { name: "Gerar Relatório" }));

    await waitFor(() =>
      expect(
        screen.getByText("Não é possível gerar o relatório: existem revisões sem decisão válida."),
      ).toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: "Gerar Relatório" })).toBeEnabled();
  });

  it("erro de destino já existente mostra mensagem amigável, sem caminho técnico", async () => {
    const usuario = userEvent.setup();
    (window.api.escolherDestinoRelatorioTransparencia as ReturnType<typeof vi.fn>).mockResolvedValue(
      "C:\\fake\\Relatorio.xlsx",
    );
    gerarMock.mockRejectedValue(
      new Error("Já existe um arquivo com esse nome no local selecionado. Escolha outro nome ou local e tente novamente."),
    );
    renderComGeracao();

    await waitFor(() => expect(screen.getByRole("button", { name: "Gerar Relatório" })).toBeEnabled());
    await usuario.click(screen.getByRole("button", { name: "Gerar Relatório" }));

    await waitFor(() => expect(screen.getByText(/Já existe um arquivo com esse nome/)).toBeInTheDocument());
    expect(screen.queryByText("C:\\fake\\Relatorio.xlsx")).not.toBeInTheDocument();
  });

  it("erro 500 inesperado mostra mensagem amigável, nunca detalhe técnico", async () => {
    const usuario = userEvent.setup();
    (window.api.escolherDestinoRelatorioTransparencia as ReturnType<typeof vi.fn>).mockResolvedValue(
      "C:\\fake\\Relatorio.xlsx",
    );
    gerarMock.mockRejectedValue(new Error("Backend respondeu 500"));
    renderComGeracao();

    await waitFor(() => expect(screen.getByRole("button", { name: "Gerar Relatório" })).toBeEnabled());
    await usuario.click(screen.getByRole("button", { name: "Gerar Relatório" }));

    await waitFor(() =>
      expect(screen.getByText("Ocorreu um erro inesperado. Tente novamente em instantes.")).toBeInTheDocument(),
    );
  });

  it("abrir relatório e abrir pasta chamam window.api.abrirArquivo com os caminhos certos", async () => {
    const usuario = userEvent.setup();
    (window.api.escolherDestinoRelatorioTransparencia as ReturnType<typeof vi.fn>).mockResolvedValue(
      "C:\\fake\\pasta\\Relatorio.xlsx",
    );
    gerarMock.mockResolvedValue({
      caminho_arquivo: "C:\\fake\\pasta\\Relatorio.xlsx",
      total_ocorrencias: 1,
      total_valor_diarias: 100,
      primeira_linha_dados: 7,
      ultima_linha_dados: 7,
      linha_total: 8,
      caminho_arquivo_nao_publicadas: null,
      total_nao_publicadas: 0,
      total_categoria_a: 0,
      total_categoria_b: 0,
      nao_publicadas_gerado: false,
      erro_nao_publicadas: null,
    });
    renderComGeracao();

    await waitFor(() => expect(screen.getByRole("button", { name: "Gerar Relatório" })).toBeEnabled());
    await usuario.click(screen.getByRole("button", { name: "Gerar Relatório" }));
    await waitFor(() => expect(screen.getByText("Relatório gerado com sucesso.")).toBeInTheDocument());

    await usuario.click(screen.getByRole("button", { name: "Abrir relatório" }));
    expect(window.api.abrirArquivo).toHaveBeenCalledWith("C:\\fake\\pasta\\Relatorio.xlsx");

    await usuario.click(screen.getByRole("button", { name: /Abrir pasta/ }));
    expect(window.api.abrirArquivo).toHaveBeenCalledWith("C:\\fake\\pasta");
  });

  it("falha ao abrir relatório mostra mensagem amigável, sem perder o painel de sucesso", async () => {
    const usuario = userEvent.setup();
    (window.api.escolherDestinoRelatorioTransparencia as ReturnType<typeof vi.fn>).mockResolvedValue(
      "C:\\fake\\Relatorio.xlsx",
    );
    gerarMock.mockResolvedValue({
      caminho_arquivo: "C:\\fake\\Relatorio.xlsx",
      total_ocorrencias: 1,
      total_valor_diarias: 100,
      primeira_linha_dados: 7,
      ultima_linha_dados: 7,
      linha_total: 8,
      caminho_arquivo_nao_publicadas: null,
      total_nao_publicadas: 0,
      total_categoria_a: 0,
      total_categoria_b: 0,
      nao_publicadas_gerado: false,
      erro_nao_publicadas: null,
    });
    (window.api.abrirArquivo as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("ENOENT"));
    renderComGeracao();

    await waitFor(() => expect(screen.getByRole("button", { name: "Gerar Relatório" })).toBeEnabled());
    await usuario.click(screen.getByRole("button", { name: "Gerar Relatório" }));
    await waitFor(() => expect(screen.getByText("Relatório gerado com sucesso.")).toBeInTheDocument());

    await usuario.click(screen.getByRole("button", { name: "Abrir relatório" }));

    await waitFor(() =>
      expect(
        screen.getByText("Não foi possível abrir o relatório. Localize-o manualmente na pasta de destino."),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText("Relatório gerado com sucesso.")).toBeInTheDocument();
  });

  it("falha ao abrir pasta mostra mensagem amigável", async () => {
    const usuario = userEvent.setup();
    (window.api.escolherDestinoRelatorioTransparencia as ReturnType<typeof vi.fn>).mockResolvedValue(
      "C:\\fake\\Relatorio.xlsx",
    );
    gerarMock.mockResolvedValue({
      caminho_arquivo: "C:\\fake\\Relatorio.xlsx",
      total_ocorrencias: 1,
      total_valor_diarias: 100,
      primeira_linha_dados: 7,
      ultima_linha_dados: 7,
      linha_total: 8,
      caminho_arquivo_nao_publicadas: null,
      total_nao_publicadas: 0,
      total_categoria_a: 0,
      total_categoria_b: 0,
      nao_publicadas_gerado: false,
      erro_nao_publicadas: null,
    });
    (window.api.abrirArquivo as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("ENOENT"));
    renderComGeracao();

    await waitFor(() => expect(screen.getByRole("button", { name: "Gerar Relatório" })).toBeEnabled());
    await usuario.click(screen.getByRole("button", { name: "Gerar Relatório" }));
    await waitFor(() => expect(screen.getByText("Relatório gerado com sucesso.")).toBeInTheDocument());

    await usuario.click(screen.getByRole("button", { name: /Abrir pasta/ }));

    await waitFor(() =>
      expect(screen.getByText("Não foi possível abrir a pasta do relatório.")).toBeInTheDocument(),
    );
  });

  it("payload de /gerar nunca contém lista de OBs nem conteúdo montado pelo frontend", async () => {
    const usuario = userEvent.setup();
    (window.api.escolherDestinoRelatorioTransparencia as ReturnType<typeof vi.fn>).mockResolvedValue(
      "C:\\fake\\Relatorio.xlsx",
    );
    gerarMock.mockResolvedValue({
      caminho_arquivo: "C:\\fake\\Relatorio.xlsx",
      total_ocorrencias: 1,
      total_valor_diarias: 100,
      primeira_linha_dados: 7,
      ultima_linha_dados: 7,
      linha_total: 8,
      caminho_arquivo_nao_publicadas: null,
      total_nao_publicadas: 0,
      total_categoria_a: 0,
      total_categoria_b: 0,
      nao_publicadas_gerado: false,
      erro_nao_publicadas: null,
    });
    renderComGeracao();

    await waitFor(() => expect(screen.getByRole("button", { name: "Gerar Relatório" })).toBeEnabled());
    await usuario.click(screen.getByRole("button", { name: "Gerar Relatório" }));

    await waitFor(() => expect(gerarMock).toHaveBeenCalledTimes(1));
    const payload = gerarMock.mock.calls[0][0];
    expect(payload).not.toHaveProperty("obs_selecionadas");
    expect(payload).not.toHaveProperty("revisoes");
    expect(payload).not.toHaveProperty("candidatos_publicaveis");
  });
});

describe("PainelResumo — histórico de decisões (micro-sprint corretiva HOMO-RT-02)", () => {
  it("fica oculto por padrão e aparece ao clicar em 'Ver histórico de decisões' (tela com pendências)", async () => {
    const usuario = userEvent.setup();
    render(
      <PainelResumo
        resumo={RESUMO_COM_PENDENCIAS}
        parametrosFontes={null}
        caminhoConfiguracaoTemplate={null}
        onRevisarCasos={vi.fn()}
        onVoltarParaEntrada={vi.fn()}
      />,
    );

    expect(screen.queryByText("servidor.teste")).not.toBeInTheDocument();

    await usuario.click(screen.getByRole("button", { name: "Ver histórico de decisões" }));

    expect(screen.getAllByText("servidor.teste")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Ocultar histórico de decisões" })).toBeInTheDocument();
  });

  it("mostra responsável de cada revisão já decidida na linha, e a OB publicável no detalhe ('Ver decisão')", async () => {
    const usuario = userEvent.setup();
    render(
      <PainelResumo
        resumo={RESUMO_COM_PENDENCIAS}
        parametrosFontes={null}
        caminhoConfiguracaoTemplate={null}
        onRevisarCasos={vi.fn()}
        onVoltarParaEntrada={vi.fn()}
      />,
    );

    await usuario.click(screen.getByRole("button", { name: "Ver histórico de decisões" }));

    // Micro-sprint UX operacional — a OB publicável agora fica no detalhe
    // ("Ver decisão"), não mais direto na linha resumida.
    const botoesVerDecisao = screen.getAllByRole("button", { name: "Ver decisão" });
    expect(botoesVerDecisao).toHaveLength(2);

    await usuario.click(botoesVerDecisao[0]);
    expect(within(screen.getByRole("dialog")).getByText("2026OB000001")).toBeInTheDocument();

    await usuario.click(screen.getByRole("button", { name: "Fechar" }));
    await usuario.click(botoesVerDecisao[1]);
    expect(within(screen.getByRole("dialog")).getByText("2026OB000002")).toBeInTheDocument();

    // revisão pendente nunca decidida: responsável aparece como "—", nunca inventado
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("disponível também na tela sem pendências (Tela 5)", async () => {
    const usuario = userEvent.setup();
    statusMock.mockResolvedValue({ configurado: false, disponivel: false, caminho_template: null });
    renderComGeracao(RESUMO_SEM_PENDENCIAS);

    await usuario.click(screen.getByRole("button", { name: "Ver histórico de decisões" }));

    expect(screen.getAllByText("Decidida").length).toBeGreaterThan(0);
  });
});

describe("PainelResumo — voltar", () => {
  it("clicar em 'Selecionar outra competência ou fontes' aciona onVoltarParaEntrada", async () => {
    const usuario = userEvent.setup();
    const onVoltarParaEntrada = vi.fn();
    render(
      <PainelResumo
        resumo={RESUMO_COM_PENDENCIAS}
        parametrosFontes={null}
        caminhoConfiguracaoTemplate={null}
        onRevisarCasos={vi.fn()}
        onVoltarParaEntrada={onVoltarParaEntrada}
      />,
    );

    await usuario.click(screen.getByRole("button", { name: "Selecionar outra competência ou fontes" }));

    expect(onVoltarParaEntrada).toHaveBeenCalledTimes(1);
  });
});
