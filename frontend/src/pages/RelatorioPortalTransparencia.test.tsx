// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RelatorioPortalTransparencia from "./RelatorioPortalTransparencia";
import type { ResumoRelatorioTransparencia } from "../types/relatorioTransparencia";

vi.mock("../services/api", async (importarOriginal) => {
  const real = await importarOriginal<typeof import("../services/api")>();
  return {
    ...real,
    prepararRelatorioTransparencia: vi.fn(),
    registrarDecisaoRevisaoRelatorioTransparencia: vi.fn(),
    obterStatusTemplateRelatorioTransparencia: vi.fn(),
    gerarRelatorioTransparencia: vi.fn(),
    obterStatusFontesRelatorioTransparencia: vi.fn(),
    configurarFontesRelatorioTransparencia: vi.fn(),
  };
});

import {
  configurarFontesRelatorioTransparencia,
  gerarRelatorioTransparencia,
  obterStatusFontesRelatorioTransparencia,
  obterStatusTemplateRelatorioTransparencia,
  prepararRelatorioTransparencia,
  registrarDecisaoRevisaoRelatorioTransparencia,
} from "../services/api";
import type {
  RequisicaoConfigurarFontesRelatorioTransparencia,
  StatusFontesRelatorioTransparencia,
} from "../types/relatorioTransparencia";

const prepararMock = vi.mocked(prepararRelatorioTransparencia);
const decidirMock = vi.mocked(registrarDecisaoRevisaoRelatorioTransparencia);
const statusTemplateMock = vi.mocked(obterStatusTemplateRelatorioTransparencia);
const gerarMock = vi.mocked(gerarRelatorioTransparencia);
const statusFontesMock = vi.mocked(obterStatusFontesRelatorioTransparencia);
const configurarFontesMock = vi.mocked(configurarFontesRelatorioTransparencia);
const FONTE_NAO_CONFIGURADA = { configurado: false, disponivel: false, caminho: null };

function criarXlsx(nome: string): File {
  return new File(["conteúdo fictício"], nome, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

function revisao(identidade: string, estado: "pendente" | "decidida") {
  return {
    identidade_grupo: identidade,
    regra: "RN07",
    estado,
    explicacao: "explicação fictícia",
    campos_iguais: ["beneficiario"],
    campos_diferentes: ["ob"],
    ocorrencias: [
      {
        ob: `2026OB${identidade}`,
        dh: `2026DH${identidade}`,
        beneficiario: "Servidor Fictício",
        sei: "00000.000000/2026-00",
        data_ob: "2026-08-10T00:00:00",
        periodo_inicial: "2026-08-01",
        periodo_final: "2026-08-03",
        trecho: "Recife/PE → Caruaru/PE",
        valor: 500,
        motivo: "Motivo fictício",
        restituicao: null,
        identidade: `2026OB${identidade}`,
      },
    ],
    autor: null,
    decidido_em: null,
    observacao: null,
    obs_publicaveis: null,
    reaplicada_de_execucao_anterior: false,
  };
}

beforeEach(() => {
  window.api = {
    ...window.api,
    getPathForFile: (arquivo: File) => `C:\\fake\\${arquivo.name}`,
    obterCaminhoDecisoesRelatorioTransparencia: vi.fn().mockResolvedValue("C:\\fake\\AppData\\decisoes.json"),
    obterCaminhoConfiguracaoTemplateRelatorioTransparencia: vi
      .fn()
      .mockResolvedValue("C:\\fake\\AppData\\template_configuracao.json"),
    obterCaminhoConfiguracaoFontesRelatorioTransparencia: vi
      .fn()
      .mockResolvedValue("C:\\fake\\AppData\\fontes_configuracao.json"),
    escolherDestinoRelatorioTransparencia: vi.fn(),
    abrirArquivo: vi.fn().mockResolvedValue(undefined),
  };
  statusTemplateMock.mockResolvedValue({
    configurado: true,
    disponivel: true,
    caminho_template: "C:\\fake\\Modelo_Oficial.xlsx",
  });
  statusFontesMock.mockResolvedValue({
    base_efisco: FONTE_NAO_CONFIGURADA,
    controle_dimcac: FONTE_NAO_CONFIGURADA,
    planilha_passagens: FONTE_NAO_CONFIGURADA,
  });
  // Micro-sprint UX operacional — atualização parcial: ecoa só o campo
  // enviado, mesmo contrato do backend real (nunca apaga os outros). Sprint 1
  // (plano "Valor da Passagem no XLSX Oficial") estendeu para a 3ª fonte.
  configurarFontesMock.mockImplementation(
    async (
      requisicao: RequisicaoConfigurarFontesRelatorioTransparencia,
    ): Promise<StatusFontesRelatorioTransparencia> => {
      if (requisicao.caminho_base_efisco) {
        return {
          base_efisco: {
            configurado: true,
            disponivel: true,
            caminho: requisicao.caminho_base_efisco,
          },
          controle_dimcac: FONTE_NAO_CONFIGURADA,
          planilha_passagens: FONTE_NAO_CONFIGURADA,
        };
      }
      if (requisicao.caminho_planilha_passagens) {
        return {
          base_efisco: FONTE_NAO_CONFIGURADA,
          controle_dimcac: FONTE_NAO_CONFIGURADA,
          planilha_passagens: {
            configurado: true,
            disponivel: true,
            caminho: requisicao.caminho_planilha_passagens,
          },
        };
      }
      return {
        base_efisco: FONTE_NAO_CONFIGURADA,
        controle_dimcac: {
          configurado: true,
          disponivel: true,
          caminho: requisicao.caminho_controle_dimcac ?? null,
        },
        planilha_passagens: FONTE_NAO_CONFIGURADA,
      };
    },
  );
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function prepararComSucesso(
  usuario: ReturnType<typeof userEvent.setup>,
  resumo: ResumoRelatorioTransparencia,
) {
  prepararMock.mockResolvedValue(resumo);
  await waitFor(() => expect(window.api.obterCaminhoDecisoesRelatorioTransparencia).toHaveBeenCalled());
  await waitFor(() => expect(statusFontesMock).toHaveBeenCalled());

  const inputs = document.querySelectorAll('input[type="file"][accept=".xlsx"]');
  await usuario.upload(inputs[0] as HTMLInputElement, criarXlsx("OB_2026_08.xlsx"));
  await usuario.upload(inputs[1] as HTMLInputElement, criarXlsx("Controle_DIMCAC_2026.xlsx"));
  await usuario.type(screen.getByLabelText("Responsável pela revisão"), "servidor.teste");
  await usuario.click(screen.getByRole("button", { name: "Preparar Relatório" }));

  await waitFor(() => expect(prepararMock).toHaveBeenCalledTimes(1));
}

describe("RelatorioPortalTransparencia", () => {
  it("mostra o título do módulo", () => {
    render(<RelatorioPortalTransparencia backendOnline />);

    expect(screen.getByText("Relatório do Portal da Transparência")).toBeInTheDocument();
  });

  it("backend offline: mostra o aviso, mas a tela de entrada continua utilizável", () => {
    render(<RelatorioPortalTransparencia backendOnline={false} />);

    expect(screen.getByText("Aguardando o aplicativo terminar de iniciar...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Preparar Relatório" })).toBeInTheDocument();
  });

  it("preparar com sucesso (sem pendências) mostra o resumo de conclusão, enviando caminho_decisoes resolvido via IPC (nunca exposto na tela)", async () => {
    const usuario = userEvent.setup();
    render(<RelatorioPortalTransparencia backendOnline />);

    await prepararComSucesso(usuario, {
      total_candidatos_normais: 1799,
      total_revisoes: 0,
      total_pendentes: 0,
      total_decididas: 0,
      total_adiadas: 0,
      total_desatualizadas: 0,
      total_requer_nova_decisao: 0,
      total_ocorrencias_nao_publicaveis: 0,
      pode_gerar_relatorio: true,
      revisoes: [],
      avisos_qualidade_fonte: [],
      diagnosticos_qualidade_fonte: [],
      total_decisoes_reaproveitadas: 0,
      cobertura_parcial: false,
      cobertura_efisco_ate: null,
    });

    expect(screen.getByText("Todas as revisões foram concluídas.")).toBeInTheDocument();
    expect(prepararMock).toHaveBeenCalledWith(
      expect.objectContaining({ caminho_decisoes: "C:\\fake\\AppData\\decisoes.json" }),
    );
    expect(screen.queryByText("C:\\fake\\AppData\\decisoes.json")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/decis/i)).not.toBeInTheDocument();
  });

  it("preparar com pendências → Revisar Casos → confirmar decisão → avança para o próximo caso", async () => {
    const usuario = userEvent.setup();
    render(<RelatorioPortalTransparencia backendOnline />);

    await prepararComSucesso(usuario, {
      total_candidatos_normais: 1799,
      total_revisoes: 2,
      total_pendentes: 2,
      total_decididas: 0,
      total_adiadas: 0,
      total_desatualizadas: 0,
      total_requer_nova_decisao: 0,
      total_ocorrencias_nao_publicaveis: 0,
      pode_gerar_relatorio: false,
      revisoes: [revisao("1", "pendente"), revisao("2", "pendente")],
      avisos_qualidade_fonte: [],
      diagnosticos_qualidade_fonte: [],
      total_decisoes_reaproveitadas: 0,
      cobertura_parcial: false,
      cobertura_efisco_ate: null,
    });

    await usuario.click(screen.getByRole("button", { name: "Revisar 2 Casos" }));
    expect(screen.getByText("Caso 1 de 2")).toBeInTheDocument();

    decidirMock.mockResolvedValue({
      total_candidatos_normais: 1799,
      total_revisoes: 2,
      total_pendentes: 1,
      total_decididas: 1,
      total_adiadas: 0,
      total_desatualizadas: 0,
      total_requer_nova_decisao: 0,
      total_ocorrencias_nao_publicaveis: 0,
      pode_gerar_relatorio: false,
      revisoes: [revisao("1", "decidida"), revisao("2", "pendente")],
      avisos_qualidade_fonte: [],
      diagnosticos_qualidade_fonte: [],
      total_decisoes_reaproveitadas: 0,
      cobertura_parcial: false,
      cobertura_efisco_ate: null,
    });

    await usuario.click(screen.getAllByRole("checkbox")[0]);
    await usuario.click(screen.getByRole("button", { name: "Confirmar Decisão" }));

    await waitFor(() => expect(screen.getByText("Caso 2 de 2")).toBeInTheDocument());
    expect(decidirMock).toHaveBeenCalledWith(
      "1",
      expect.objectContaining({ caminho_decisoes: "C:\\fake\\AppData\\decisoes.json" }),
      { acao: "publicar", obs_selecionadas: ["2026OB1"], autor: "servidor.teste" },
    );
  });

  it("Micro-sprint 3E.2 — publicar zero OBs: exige justificativa, envia via observacao, e mostra o erro se o backend rejeitar (contorno da UX)", async () => {
    const usuario = userEvent.setup();
    render(<RelatorioPortalTransparencia backendOnline />);

    await prepararComSucesso(usuario, {
      total_candidatos_normais: 1799,
      total_revisoes: 1,
      total_pendentes: 1,
      total_decididas: 0,
      total_adiadas: 0,
      total_desatualizadas: 0,
      total_requer_nova_decisao: 0,
      total_ocorrencias_nao_publicaveis: 0,
      pode_gerar_relatorio: false,
      revisoes: [revisao("1", "pendente")],
      avisos_qualidade_fonte: [],
      diagnosticos_qualidade_fonte: [],
      total_decisoes_reaproveitadas: 0,
      cobertura_parcial: false,
      cobertura_efisco_ate: null,
    });
    await usuario.click(screen.getByRole("button", { name: "Revisar 1 Caso" }));

    // Sem nenhuma OB selecionada, o diálogo pede justificativa e o botão
    // de confirmar fica desabilitado enquanto ela estiver vazia.
    await usuario.click(screen.getByRole("button", { name: "Confirmar Decisão" }));
    expect(screen.getByRole("button", { name: "Confirmar decisão" })).toBeDisabled();

    // Simula alguém contornando a UX (ex.: backend rejeita mesmo com uma
    // justificativa "válida" na tela, ex.: corrida com outra decisão) — o
    // erro do backend precisa aparecer, o frontend nunca decide sozinho.
    decidirMock.mockRejectedValueOnce(new Error("Backend respondeu 422"));
    await usuario.type(screen.getByLabelText("Justificativa (obrigatória)"), "Excluída até apuração.");
    await usuario.click(screen.getByRole("button", { name: "Confirmar decisão" }));

    await waitFor(() => expect(decidirMock).toHaveBeenCalledTimes(1));
    expect(decidirMock).toHaveBeenCalledWith(
      "1",
      expect.objectContaining({ caminho_decisoes: "C:\\fake\\AppData\\decisoes.json" }),
      {
        acao: "publicar",
        obs_selecionadas: [],
        autor: "servidor.teste",
        observacao: "Excluída até apuração.",
      },
    );
    // Mensagem amigável (`mensagemAmigavel`), nunca o "Backend respondeu 422" cru.
    await waitFor(() =>
      expect(screen.getByText("Não foi possível concluir a operação. Tente novamente.")).toBeInTheDocument(),
    );

    // Tenta de novo, agora com sucesso — a mesma justificativa continua no
    // campo (não foi perdida pela tentativa anterior).
    decidirMock.mockResolvedValueOnce({
      total_candidatos_normais: 1799,
      total_revisoes: 1,
      total_pendentes: 0,
      total_decididas: 1,
      total_adiadas: 0,
      total_desatualizadas: 0,
      total_requer_nova_decisao: 0,
      total_ocorrencias_nao_publicaveis: 1,
      pode_gerar_relatorio: true,
      revisoes: [revisao("1", "decidida")],
      avisos_qualidade_fonte: [],
      diagnosticos_qualidade_fonte: [],
      total_decisoes_reaproveitadas: 0,
      cobertura_parcial: false,
      cobertura_efisco_ate: null,
    });
    await usuario.click(screen.getByRole("button", { name: "Confirmar Decisão" }));
    await usuario.click(screen.getByRole("button", { name: "Confirmar decisão" }));

    await waitFor(() => expect(screen.getByText("Todas as revisões foram concluídas.")).toBeInTheDocument());
  });

  it("resolver o último caso pendente volta para a tela de resumo (agora concluído)", async () => {
    const usuario = userEvent.setup();
    render(<RelatorioPortalTransparencia backendOnline />);

    await prepararComSucesso(usuario, {
      total_candidatos_normais: 1799,
      total_revisoes: 1,
      total_pendentes: 1,
      total_decididas: 0,
      total_adiadas: 0,
      total_desatualizadas: 0,
      total_requer_nova_decisao: 0,
      total_ocorrencias_nao_publicaveis: 0,
      pode_gerar_relatorio: false,
      revisoes: [revisao("1", "pendente")],
      avisos_qualidade_fonte: [],
      diagnosticos_qualidade_fonte: [],
      total_decisoes_reaproveitadas: 0,
      cobertura_parcial: false,
      cobertura_efisco_ate: null,
    });

    await usuario.click(screen.getByRole("button", { name: "Revisar 1 Caso" }));

    decidirMock.mockResolvedValue({
      total_candidatos_normais: 1800,
      total_revisoes: 1,
      total_pendentes: 0,
      total_decididas: 1,
      total_adiadas: 0,
      total_desatualizadas: 0,
      total_requer_nova_decisao: 0,
      total_ocorrencias_nao_publicaveis: 0,
      pode_gerar_relatorio: true,
      revisoes: [revisao("1", "decidida")],
      avisos_qualidade_fonte: [],
      diagnosticos_qualidade_fonte: [],
      total_decisoes_reaproveitadas: 0,
      cobertura_parcial: false,
      cobertura_efisco_ate: null,
    });

    await usuario.click(screen.getAllByRole("checkbox")[0]);
    await usuario.click(screen.getByRole("button", { name: "Confirmar Decisão" }));

    await waitFor(() => expect(screen.getByText("Todas as revisões foram concluídas.")).toBeInTheDocument());
  });

  it("Micro-sprint 3H — ponta a ponta sintético: preparar sem pendências → template pronto → Gerar Relatório → sucesso → Abrir relatório/pasta", async () => {
    const usuario = userEvent.setup();
    render(<RelatorioPortalTransparencia backendOnline />);

    await prepararComSucesso(usuario, {
      total_candidatos_normais: 1799,
      total_revisoes: 0,
      total_pendentes: 0,
      total_decididas: 0,
      total_adiadas: 0,
      total_desatualizadas: 0,
      total_requer_nova_decisao: 0,
      total_ocorrencias_nao_publicaveis: 0,
      pode_gerar_relatorio: true,
      revisoes: [],
      avisos_qualidade_fonte: [],
      diagnosticos_qualidade_fonte: [],
      total_decisoes_reaproveitadas: 0,
      cobertura_parcial: false,
      cobertura_efisco_ate: null,
    });

    expect(screen.getByText("Todas as revisões foram concluídas.")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Gerar Relatório" })).toBeEnabled());

    (window.api.escolherDestinoRelatorioTransparencia as ReturnType<typeof vi.fn>).mockResolvedValue(
      "C:\\fake\\pasta\\Relatorio.xlsx",
    );
    gerarMock.mockResolvedValue({
      caminho_arquivo: "C:\\fake\\pasta\\Relatorio.xlsx",
      total_ocorrencias: 1799,
      total_valor_diarias: 250000,
      primeira_linha_dados: 7,
      ultima_linha_dados: 1805,
      linha_total: 1806,
      caminho_arquivo_nao_publicadas: null,
      total_nao_publicadas: 0,
      total_categoria_a: 0,
      total_categoria_b: 0,
      nao_publicadas_gerado: false,
      erro_nao_publicadas: null,
    });

    await usuario.click(screen.getByRole("button", { name: "Gerar Relatório" }));

    await waitFor(() => expect(screen.getByText("Relatório gerado com sucesso.")).toBeInTheDocument());
    expect(gerarMock).toHaveBeenCalledWith(
      expect.objectContaining({
        ano_exercicio: expect.any(Number),
        mes_referencia: expect.any(Number),
        caminho_configuracao_template: "C:\\fake\\AppData\\template_configuracao.json",
        caminho_destino: "C:\\fake\\pasta\\Relatorio.xlsx",
      }),
    );

    await usuario.click(screen.getByRole("button", { name: "Abrir relatório" }));
    expect(window.api.abrirArquivo).toHaveBeenCalledWith("C:\\fake\\pasta\\Relatorio.xlsx");

    await usuario.click(screen.getByRole("button", { name: /Abrir pasta/ }));
    expect(window.api.abrirArquivo).toHaveBeenCalledWith("C:\\fake\\pasta");
  });

  it("'Selecionar outra competência ou fontes' volta para a tela de entrada", async () => {
    const usuario = userEvent.setup();
    render(<RelatorioPortalTransparencia backendOnline />);

    await prepararComSucesso(usuario, {
      total_candidatos_normais: 1799,
      total_revisoes: 0,
      total_pendentes: 0,
      total_decididas: 0,
      total_adiadas: 0,
      total_desatualizadas: 0,
      total_requer_nova_decisao: 0,
      total_ocorrencias_nao_publicaveis: 0,
      pode_gerar_relatorio: true,
      revisoes: [],
      avisos_qualidade_fonte: [],
      diagnosticos_qualidade_fonte: [],
      total_decisoes_reaproveitadas: 0,
      cobertura_parcial: false,
      cobertura_efisco_ate: null,
    });

    await usuario.click(screen.getByRole("button", { name: "Selecionar outra competência ou fontes" }));

    expect(screen.getByRole("button", { name: "Preparar Relatório" })).toBeInTheDocument();
  });
});
