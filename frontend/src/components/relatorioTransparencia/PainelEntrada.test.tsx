// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  RequisicaoConfigurarFontesRelatorioTransparencia,
  StatusFontesRelatorioTransparencia,
} from "../../types/relatorioTransparencia";

vi.mock("../../services/api", async (importarOriginal) => {
  const real = await importarOriginal<typeof import("../../services/api")>();
  return {
    ...real,
    obterStatusFontesRelatorioTransparencia: vi.fn(),
    configurarFontesRelatorioTransparencia: vi.fn(),
  };
});

import {
  configurarFontesRelatorioTransparencia,
  obterStatusFontesRelatorioTransparencia,
} from "../../services/api";
import PainelEntrada from "./PainelEntrada";

const statusMock = vi.mocked(obterStatusFontesRelatorioTransparencia);
const configurarMock = vi.mocked(configurarFontesRelatorioTransparencia);

const CAMINHO_CONFIGURACAO_FONTES = "C:\\fake\\AppData\\relatorio_transparencia_fontes_configuracao.json";
const NAO_CONFIGURADO = { configurado: false, disponivel: false, caminho: null };

function criarXlsx(nome: string): File {
  return new File(["conteúdo fictício"], nome, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

function criarOds(nome: string): File {
  return new File(["conteúdo fictício"], nome, {
    type: "application/vnd.oasis.opendocument.spreadsheet",
  });
}

beforeEach(() => {
  window.api = {
    ...window.api,
    getPathForFile: (arquivo: File) => `G:\\Meu Drive\\DIMCAC\\${arquivo.name}`,
  };
  statusMock.mockResolvedValue({
    base_efisco: NAO_CONFIGURADO,
    controle_dimcac: NAO_CONFIGURADO,
    planilha_passagens: NAO_CONFIGURADO,
  });
  // Micro-sprint UX operacional — cada seleção persiste só o campo enviado;
  // o mock ecoa exatamente esse comportamento (mesmo contrato do backend
  // real: atualização parcial, nunca apaga os outros campos). Sprint 1
  // (plano "Valor da Passagem no XLSX Oficial") estendeu o mesmo mecanismo
  // para uma 3ª fonte.
  configurarMock.mockImplementation(
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
          controle_dimcac: NAO_CONFIGURADO,
          planilha_passagens: NAO_CONFIGURADO,
        };
      }
      if (requisicao.caminho_planilha_passagens) {
        return {
          base_efisco: NAO_CONFIGURADO,
          controle_dimcac: NAO_CONFIGURADO,
          planilha_passagens: {
            configurado: true,
            disponivel: true,
            caminho: requisicao.caminho_planilha_passagens,
          },
        };
      }
      return {
        base_efisco: NAO_CONFIGURADO,
        controle_dimcac: {
          configurado: true,
          disponivel: true,
          caminho: requisicao.caminho_controle_dimcac ?? null,
        },
        planilha_passagens: NAO_CONFIGURADO,
      };
    },
  );
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function preencherFormularioCompleto(usuario: ReturnType<typeof userEvent.setup>) {
  const inputs = document.querySelectorAll('input[type="file"][accept=".xlsx"]');
  await usuario.upload(inputs[0] as HTMLInputElement, criarXlsx("OB_2026_08.xlsx"));
  await usuario.upload(inputs[1] as HTMLInputElement, criarXlsx("Controle_DIMCAC_2026.xlsx"));
  await usuario.type(screen.getByLabelText("Responsável pela revisão"), "servidor.teste");
}

describe("PainelEntrada", () => {
  it("botão 'Preparar Relatório' começa desabilitado (fontes/autor ainda não preenchidos)", () => {
    render(
      <PainelEntrada
        erro={null}
        preparando={false}
        caminhoDecisoesResolvido
        caminhoConfiguracaoFontes={CAMINHO_CONFIGURACAO_FONTES}
        onPreparar={vi.fn()}
        coberturaInsuficiente={null}
        onPrepararComCoberturaParcial={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Preparar Relatório" })).toBeDisabled();
  });

  it("preencher competência, as duas fontes e o responsável habilita 'Preparar Relatório'", async () => {
    const usuario = userEvent.setup();
    render(
      <PainelEntrada
        erro={null}
        preparando={false}
        caminhoDecisoesResolvido
        caminhoConfiguracaoFontes={CAMINHO_CONFIGURACAO_FONTES}
        onPreparar={vi.fn()}
        coberturaInsuficiente={null}
        onPrepararComCoberturaParcial={vi.fn()}
      />,
    );

    await preencherFormularioCompleto(usuario);

    expect(screen.getByRole("button", { name: "Preparar Relatório" })).toBeEnabled();
  });

  it("caminho de decisões ainda não resolvido: 'Preparar Relatório' continua desabilitado mesmo com tudo preenchido", async () => {
    const usuario = userEvent.setup();
    render(
      <PainelEntrada
        erro={null}
        preparando={false}
        caminhoDecisoesResolvido={false}
        caminhoConfiguracaoFontes={CAMINHO_CONFIGURACAO_FONTES}
        onPreparar={vi.fn()}
        coberturaInsuficiente={null}
        onPrepararComCoberturaParcial={vi.fn()}
      />,
    );

    await preencherFormularioCompleto(usuario);

    expect(screen.getByRole("button", { name: "Preparar Relatório" })).toBeDisabled();
  });

  it("clicar em 'Preparar Relatório' chama onPreparar com os parâmetros e o autor", async () => {
    const usuario = userEvent.setup();
    const onPreparar = vi.fn();
    render(
      <PainelEntrada
        erro={null}
        preparando={false}
        caminhoDecisoesResolvido
        caminhoConfiguracaoFontes={CAMINHO_CONFIGURACAO_FONTES}
        onPreparar={onPreparar}
        coberturaInsuficiente={null}
        onPrepararComCoberturaParcial={vi.fn()}
      />,
    );

    await preencherFormularioCompleto(usuario);
    await usuario.click(screen.getByRole("button", { name: "Preparar Relatório" }));

    expect(onPreparar).toHaveBeenCalledTimes(1);
    const [parametros, autor] = onPreparar.mock.calls[0];
    expect(parametros).toEqual({
      ano_exercicio: expect.any(Number),
      mes_referencia: expect.any(Number),
      caminho_base_efisco: "G:\\Meu Drive\\DIMCAC\\OB_2026_08.xlsx",
      caminho_controle_dimcac: "G:\\Meu Drive\\DIMCAC\\Controle_DIMCAC_2026.xlsx",
    });
    expect(autor).toBe("servidor.teste");
  });

  it("mostra o nome dos arquivos selecionados, nunca o caminho absoluto", async () => {
    const usuario = userEvent.setup();
    render(
      <PainelEntrada
        erro={null}
        preparando={false}
        caminhoDecisoesResolvido
        caminhoConfiguracaoFontes={CAMINHO_CONFIGURACAO_FONTES}
        onPreparar={vi.fn()}
        coberturaInsuficiente={null}
        onPrepararComCoberturaParcial={vi.fn()}
      />,
    );

    await preencherFormularioCompleto(usuario);

    expect(screen.getByText("OB_2026_08.xlsx")).toBeInTheDocument();
    expect(screen.queryByText(/G:\\Meu Drive/)).not.toBeInTheDocument();
  });

  it("preparando: botão mostra estado de carregamento e fica desabilitado (bloqueia duplo envio)", () => {
    render(
      <PainelEntrada
        erro={null}
        preparando
        caminhoDecisoesResolvido
        caminhoConfiguracaoFontes={CAMINHO_CONFIGURACAO_FONTES}
        onPreparar={vi.fn()}
        coberturaInsuficiente={null}
        onPrepararComCoberturaParcial={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Preparar Relatório" })).toBeDisabled();
  });

  it("erro: mostra o alerta com a mensagem recebida", () => {
    render(
      <PainelEntrada
        erro="Não encontramos o arquivo da Base E-Fisco selecionado."
        preparando={false}
        caminhoDecisoesResolvido
        caminhoConfiguracaoFontes={CAMINHO_CONFIGURACAO_FONTES}
        onPreparar={vi.fn()}
        coberturaInsuficiente={null}
        onPrepararComCoberturaParcial={vi.fn()}
      />,
    );

    expect(
      screen.getByText("Não encontramos o arquivo da Base E-Fisco selecionado."),
    ).toBeInTheDocument();
  });
});

// Micro-sprint UX operacional (item 3) — persistência dos caminhos de Base
// OB e Controle DIMCAC: uma vez selecionados, ficam pré-selecionados na
// próxima abertura do módulo; arquivo indisponível avisa e permite
// reselecionar; nada aqui reescreve/duplica a lógica de validação de
// conteúdo (`preparar_relatorio` continua sendo a única fonte de verdade
// disso).
describe("PainelEntrada — persistência das fontes (Base OB / Controle DIMCAC)", () => {
  it("reabrir com fontes já configuradas: aparecem pré-selecionadas, sem exigir nova seleção", async () => {
    statusMock.mockResolvedValue({
      base_efisco: { configurado: true, disponivel: true, caminho: "G:\\Salvo\\OB_anterior.xlsx" },
      controle_dimcac: { configurado: true, disponivel: true, caminho: "G:\\Salvo\\Controle_anterior.xlsx" },
      planilha_passagens: NAO_CONFIGURADO,
    });

    render(
      <PainelEntrada
        erro={null}
        preparando={false}
        caminhoDecisoesResolvido
        caminhoConfiguracaoFontes={CAMINHO_CONFIGURACAO_FONTES}
        onPreparar={vi.fn()}
        coberturaInsuficiente={null}
        onPrepararComCoberturaParcial={vi.fn()}
      />,
    );

    expect(await screen.findByText("OB_anterior.xlsx")).toBeInTheDocument();
    expect(screen.getByText("Controle_anterior.xlsx")).toBeInTheDocument();
    // Já reaproveitado: "Preparar Relatório" só falta o responsável.
    expect(screen.getByRole("button", { name: "Preparar Relatório" })).toBeDisabled();
  });

  it("selecionar uma fonte persiste (chama a API) e o outro campo, se já configurado, permanece intacto", async () => {
    statusMock.mockResolvedValue({
      base_efisco: NAO_CONFIGURADO,
      controle_dimcac: { configurado: true, disponivel: true, caminho: "G:\\Salvo\\Controle_anterior.xlsx" },
      planilha_passagens: NAO_CONFIGURADO,
    });
    const usuario = userEvent.setup();

    render(
      <PainelEntrada
        erro={null}
        preparando={false}
        caminhoDecisoesResolvido
        caminhoConfiguracaoFontes={CAMINHO_CONFIGURACAO_FONTES}
        onPreparar={vi.fn()}
        coberturaInsuficiente={null}
        onPrepararComCoberturaParcial={vi.fn()}
      />,
    );

    await screen.findByText("Controle_anterior.xlsx");
    const inputs = document.querySelectorAll('input[type="file"][accept=".xlsx"]');
    await usuario.upload(inputs[0] as HTMLInputElement, criarXlsx("OB_nova.xlsx"));

    expect(configurarMock).toHaveBeenCalledWith({
      caminho_configuracao_fontes: CAMINHO_CONFIGURACAO_FONTES,
      caminho_base_efisco: "G:\\Meu Drive\\DIMCAC\\OB_nova.xlsx",
    });
    expect(await screen.findByText("OB_nova.xlsx")).toBeInTheDocument();
    // Controle DIMCAC nunca foi reenviado nem some da tela.
    expect(screen.getByText("Controle_anterior.xlsx")).toBeInTheDocument();
  });

  it("fonte persistida mas arquivo sumiu: mostra aviso de indisponível, nunca falha silenciosamente", async () => {
    statusMock.mockResolvedValue({
      base_efisco: { configurado: true, disponivel: false, caminho: null },
      controle_dimcac: NAO_CONFIGURADO,
      planilha_passagens: NAO_CONFIGURADO,
    });

    render(
      <PainelEntrada
        erro={null}
        preparando={false}
        caminhoDecisoesResolvido
        caminhoConfiguracaoFontes={CAMINHO_CONFIGURACAO_FONTES}
        onPreparar={vi.fn()}
        coberturaInsuficiente={null}
        onPrepararComCoberturaParcial={vi.fn()}
      />,
    );

    expect(await screen.findByText(/não foi encontrado/i)).toBeInTheDocument();
  });

  it("'Alterar' um arquivo já indisponível continua funcionando (nova seleção substitui)", async () => {
    statusMock.mockResolvedValue({
      base_efisco: { configurado: true, disponivel: false, caminho: null },
      controle_dimcac: NAO_CONFIGURADO,
      planilha_passagens: NAO_CONFIGURADO,
    });
    const usuario = userEvent.setup();

    render(
      <PainelEntrada
        erro={null}
        preparando={false}
        caminhoDecisoesResolvido
        caminhoConfiguracaoFontes={CAMINHO_CONFIGURACAO_FONTES}
        onPreparar={vi.fn()}
        coberturaInsuficiente={null}
        onPrepararComCoberturaParcial={vi.fn()}
      />,
    );

    await screen.findByText(/não foi encontrado/i);
    const inputs = document.querySelectorAll('input[type="file"][accept=".xlsx"]');
    await usuario.upload(inputs[0] as HTMLInputElement, criarXlsx("OB_substituta.xlsx"));

    expect(await screen.findByText("OB_substituta.xlsx")).toBeInTheDocument();
    expect(screen.queryByText(/não foi encontrado/i)).not.toBeInTheDocument();
  });
});

// Sprint 1 (plano "Valor da Passagem no XLSX Oficial") — terceira fonte
// persistida (Planilha de Passagens), mesmo mecanismo das duas acima, mas
// AINDA NÃO integrada a `onPreparar` (isso é escopo dos próximos sprints) —
// por isso não deve gatear "Preparar Relatório".
describe("PainelEntrada — terceira fonte (Planilha de Passagens)", () => {
  it("mostra o seletor da Planilha de Passagens aceitando .ods", () => {
    render(
      <PainelEntrada
        erro={null}
        preparando={false}
        caminhoDecisoesResolvido
        caminhoConfiguracaoFontes={CAMINHO_CONFIGURACAO_FONTES}
        onPreparar={vi.fn()}
        coberturaInsuficiente={null}
        onPrepararComCoberturaParcial={vi.fn()}
      />,
    );

    expect(screen.getByText("Planilha de Passagens")).toBeInTheDocument();
    expect(document.querySelector('input[type="file"][accept=".ods"]')).not.toBeNull();
  });

  it("selecionar a Planilha de Passagens persiste, mas NÃO habilita 'Preparar Relatório' sozinha", async () => {
    const usuario = userEvent.setup();
    render(
      <PainelEntrada
        erro={null}
        preparando={false}
        caminhoDecisoesResolvido
        caminhoConfiguracaoFontes={CAMINHO_CONFIGURACAO_FONTES}
        onPreparar={vi.fn()}
        coberturaInsuficiente={null}
        onPrepararComCoberturaParcial={vi.fn()}
      />,
    );

    const inputPassagens = document.querySelector('input[type="file"][accept=".ods"]');
    await usuario.upload(inputPassagens as HTMLInputElement, criarOds("passagens_julho.ods"));

    expect(configurarMock).toHaveBeenCalledWith({
      caminho_configuracao_fontes: CAMINHO_CONFIGURACAO_FONTES,
      caminho_planilha_passagens: "G:\\Meu Drive\\DIMCAC\\passagens_julho.ods",
    });
    expect(await screen.findByText("passagens_julho.ods")).toBeInTheDocument();
    // Base OB e Controle DIMCAC continuam obrigatórios — a passagem sozinha
    // nunca libera o botão principal.
    expect(screen.getByRole("button", { name: "Preparar Relatório" })).toBeDisabled();
  });

  it("preencher tudo, incluindo a Planilha de Passagens, envia onPreparar COM o caminho da passagem (fechamento HOMO-RT-06)", async () => {
    const usuario = userEvent.setup();
    const onPreparar = vi.fn();
    render(
      <PainelEntrada
        erro={null}
        preparando={false}
        caminhoDecisoesResolvido
        caminhoConfiguracaoFontes={CAMINHO_CONFIGURACAO_FONTES}
        onPreparar={onPreparar}
        coberturaInsuficiente={null}
        onPrepararComCoberturaParcial={vi.fn()}
      />,
    );

    await preencherFormularioCompleto(usuario);
    const inputPassagens = document.querySelector('input[type="file"][accept=".ods"]');
    await usuario.upload(inputPassagens as HTMLInputElement, criarOds("passagens_julho.ods"));
    await screen.findByText("passagens_julho.ods");
    await usuario.click(screen.getByRole("button", { name: "Preparar Relatório" }));

    const [parametros] = onPreparar.mock.calls[0];
    expect(parametros).toEqual({
      ano_exercicio: expect.any(Number),
      mes_referencia: expect.any(Number),
      caminho_base_efisco: "G:\\Meu Drive\\DIMCAC\\OB_2026_08.xlsx",
      caminho_controle_dimcac: "G:\\Meu Drive\\DIMCAC\\Controle_DIMCAC_2026.xlsx",
      caminho_planilha_passagens: "G:\\Meu Drive\\DIMCAC\\passagens_julho.ods",
    });
  });

  it("preparar SEM selecionar a Planilha de Passagens envia onPreparar com o campo undefined (retrocompatível)", async () => {
    const usuario = userEvent.setup();
    const onPreparar = vi.fn();
    render(
      <PainelEntrada
        erro={null}
        preparando={false}
        caminhoDecisoesResolvido
        caminhoConfiguracaoFontes={CAMINHO_CONFIGURACAO_FONTES}
        onPreparar={onPreparar}
        coberturaInsuficiente={null}
        onPrepararComCoberturaParcial={vi.fn()}
      />,
    );

    await preencherFormularioCompleto(usuario);
    await usuario.click(screen.getByRole("button", { name: "Preparar Relatório" }));

    const [parametros] = onPreparar.mock.calls[0];
    expect(parametros.caminho_planilha_passagens).toBeUndefined();
  });
});
