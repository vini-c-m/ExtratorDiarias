// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SelecionarProcessar from "./SelecionarProcessar";
import { ProcessamentoCanceladoError } from "../services/api";
import type { LoteProcessamento, ResultadoPreenchimento } from "../types/processamento";

// Sprint 05.3 — cobre o fluxo de cancelamento seguro do processamento a
// partir da tela: troca de botão, diálogo de confirmação, "Continuar
// Processando" x "Interromper", e o retorno da interface ao estado inicial
// preservando a fila de PDFs selecionados.
//
// Vitest não roda com `globals: true` neste projeto, então a limpeza
// automática do RTL entre testes não é registrada sozinha.
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

vi.mock("../services/api", async (importarOriginal) => {
  const real = await importarOriginal<typeof import("../services/api")>();
  return {
    ...real,
    processarLoteComProgresso: vi.fn(),
    preencherPlanilha: vi.fn(),
    buscarConfiguracao: vi.fn(),
    definirConfiguracao: vi.fn(),
  };
});

import {
  buscarConfiguracao,
  definirConfiguracao,
  preencherPlanilha,
  processarLoteComProgresso,
} from "../services/api";

const processarMock = vi.mocked(processarLoteComProgresso);
const preencherMock = vi.mocked(preencherPlanilha);
const buscarConfiguracaoMock = vi.mocked(buscarConfiguracao);
const definirConfiguracaoMock = vi.mocked(definirConfiguracao);

// Sprint 15 — Configuração Inicial da Planilha Oficial: substitui o antigo
// seletor manual de arquivo `.xlsx`. Por padrão, os testes assumem uma
// planilha oficial já configurada e acessível — cada teste que precisar de
// um estado diferente (inacessível, requer revalidação) sobrescreve com
// `buscarConfiguracaoMock.mockResolvedValueOnce(...)`.
const CONFIGURACAO_ATIVA_PADRAO = {
  configurado: true as const,
  planilha_acessivel: true as const,
  requer_revalidacao: false,
  caminho_planilha_oficial: "G:\\Meu Drive\\DIMCAC\\Controle de Diárias.xlsx",
  configurado_em: "2026-07-30T14:32:10",
};

function criarPdf(nome: string): File {
  return new File(["conteudo"], nome, { type: "application/pdf" });
}

async function selecionarPdf(usuario: ReturnType<typeof userEvent.setup>, nome: string) {
  const input = document.querySelector('input[type="file"][accept=".pdf"]') as HTMLInputElement;
  await usuario.upload(input, criarPdf(nome));
}

beforeEach(() => {
  window.api = {
    getPathForFile: (arquivo: File) => `C:/pdfs/${arquivo.name}`,
    abrirArquivo: vi.fn(),
    salvarComo: vi.fn(),
    salvarRelatorio: vi.fn(),
    copiarHistorico: vi.fn(),
    selecionarPlanilhaOficial: vi.fn(),
  };
  buscarConfiguracaoMock.mockResolvedValue(CONFIGURACAO_ATIVA_PADRAO);
});

describe("SelecionarProcessar — cancelamento do processamento", () => {
  it("troca 'Processar' por '⏹ Interromper Processamento' enquanto o processamento está em andamento", async () => {
    const usuario = userEvent.setup();
    processarMock.mockImplementation(() => new Promise(() => {}));

    render(<SelecionarProcessar backendOnline />);
    await selecionarPdf(usuario, "processo-a.pdf");

    expect(screen.getByRole("button", { name: "Processar" })).toBeInTheDocument();

    await usuario.click(screen.getByRole("button", { name: "Processar" }));

    expect(processarMock).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByRole("button", { name: "⏹ Interromper Processamento" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Processar" })).not.toBeInTheDocument();
  });

  it("abre o diálogo de confirmação ao clicar em Interromper, com o texto esperado", async () => {
    const usuario = userEvent.setup();
    processarMock.mockImplementation(() => new Promise(() => {}));

    render(<SelecionarProcessar backendOnline />);
    await selecionarPdf(usuario, "processo-a.pdf");
    await usuario.click(screen.getByRole("button", { name: "Processar" }));
    await usuario.click(await screen.findByRole("button", { name: "⏹ Interromper Processamento" }));

    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(screen.getByText("Interromper processamento?")).toBeInTheDocument();
    expect(screen.getByText(/Nenhum dado será gravado na planilha/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continuar Processando" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Interromper" })).toBeInTheDocument();
  });

  it("'Continuar Processando' fecha o diálogo sem abortar nada e o processamento continua", async () => {
    const usuario = userEvent.setup();
    let sinalCapturado: AbortSignal | undefined;
    processarMock.mockImplementation((_caminhos, _onProgresso, signal) => {
      sinalCapturado = signal;
      return new Promise(() => {});
    });

    render(<SelecionarProcessar backendOnline />);
    await selecionarPdf(usuario, "processo-a.pdf");
    await usuario.click(screen.getByRole("button", { name: "Processar" }));
    await usuario.click(await screen.findByRole("button", { name: "⏹ Interromper Processamento" }));
    await usuario.click(screen.getByRole("button", { name: "Continuar Processando" }));

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "⏹ Interromper Processamento" })).toBeInTheDocument();
    expect(sinalCapturado?.aborted).toBe(false);
  });

  it("'Interromper' cancela: descarta o processamento, mantém a fila de PDFs e mostra a mensagem discreta", async () => {
    const usuario = userEvent.setup();
    processarMock.mockImplementation(
      (_caminhos, _onProgresso, signal) =>
        new Promise((_resolve, reject) => {
          signal?.addEventListener("abort", () => reject(new ProcessamentoCanceladoError()));
        }),
    );

    render(<SelecionarProcessar backendOnline />);
    await selecionarPdf(usuario, "processo-a.pdf");
    await usuario.click(screen.getByRole("button", { name: "Processar" }));
    await usuario.click(await screen.findByRole("button", { name: "⏹ Interromper Processamento" }));

    await act(async () => {
      await usuario.click(screen.getByRole("button", { name: "Interromper" }));
    });

    // Estado inicial restaurado: botão "Processar" de volta, sem diálogo,
    // sem barra de progresso.
    expect(await screen.findByRole("button", { name: "Processar" })).toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();

    // Mensagem discreta de cancelamento.
    expect(
      screen.getByText("Processamento cancelado pelo usuário. Nenhuma informação foi salva."),
    ).toBeInTheDocument();

    // PDF selecionado continua na fila — nada foi removido.
    expect(screen.getByText("processo-a.pdf")).toBeInTheDocument();
    expect(screen.getByText("1 PDF selecionado")).toBeInTheDocument();
  });

  it("cancelar logo no início (antes de qualquer progresso) também limpa tudo e preserva a fila", async () => {
    const usuario = userEvent.setup();
    processarMock.mockImplementation(
      (_caminhos, _onProgresso, signal) =>
        new Promise((_resolve, reject) => {
          if (signal?.aborted) {
            reject(new ProcessamentoCanceladoError());
            return;
          }
          signal?.addEventListener("abort", () => reject(new ProcessamentoCanceladoError()));
        }),
    );

    render(<SelecionarProcessar backendOnline />);
    await selecionarPdf(usuario, "processo-a.pdf");
    await usuario.click(screen.getByRole("button", { name: "Processar" }));

    // Interrompe imediatamente, antes de qualquer callback de progresso.
    await usuario.click(await screen.findByRole("button", { name: "⏹ Interromper Processamento" }));
    await act(async () => {
      await usuario.click(screen.getByRole("button", { name: "Interromper" }));
    });

    expect(await screen.findByRole("button", { name: "Processar" })).toBeInTheDocument();
    expect(
      screen.getByText("Processamento cancelado pelo usuário. Nenhuma informação foi salva."),
    ).toBeInTheDocument();
    expect(screen.getByText("processo-a.pdf")).toBeInTheDocument();
  });

  it("um novo clique em Processar depois de cancelar funciona normalmente, sem precisar reselecionar PDFs", async () => {
    const usuario = userEvent.setup();
    processarMock.mockImplementationOnce(
      (_caminhos, _onProgresso, signal) =>
        new Promise((_resolve, reject) => {
          signal?.addEventListener("abort", () => reject(new ProcessamentoCanceladoError()));
        }),
    );

    render(<SelecionarProcessar backendOnline />);
    await selecionarPdf(usuario, "processo-a.pdf");
    await usuario.click(screen.getByRole("button", { name: "Processar" }));
    await usuario.click(await screen.findByRole("button", { name: "⏹ Interromper Processamento" }));
    await act(async () => {
      await usuario.click(screen.getByRole("button", { name: "Interromper" }));
    });
    await screen.findByRole("button", { name: "Processar" });

    processarMock.mockImplementationOnce(
      () =>
        new Promise((resolve) =>
          resolve({ id: "lote-2", total: 1, sucesso: 1, erro: 0, processos: [] }),
        ),
    );

    await usuario.click(screen.getByRole("button", { name: "Processar" }));

    expect(processarMock).toHaveBeenCalledTimes(2);
    // O segundo processamento foi disparado com o mesmo PDF, sem reseleção.
    expect(processarMock.mock.calls[1][0]).toEqual(["C:/pdfs/processo-a.pdf"]);
  });
});

// Sprint (Loading/Bloqueio de Ações/Navegação Segura, itens 5-7 e 14) —
// `aoMudarSolicitarSaidaSegura` é o mecanismo que `App.tsx` usa para
// Voltar/Configurações reaproveitarem a MESMA confirmação/interrupção já
// testada acima, sem duplicar lógica nenhuma.
describe("SelecionarProcessar — solicitarSaidaSegura (Voltar/Configurações reaproveitam a interrupção)", () => {
  function montarComCaptura() {
    const funcaoRef: { atual: ((aoConcluir: () => void) => void) | null } = { atual: null };
    const utilitarios = render(
      <SelecionarProcessar
        backendOnline
        aoMudarSolicitarSaidaSegura={(funcao) => {
          funcaoRef.atual = funcao;
        }}
      />,
    );
    return { ...utilitarios, funcaoRef };
  }

  it("A/F) sem processamento ativo, conclui a saída na hora — navegação normal", async () => {
    const { funcaoRef } = montarComCaptura();
    const aoConcluir = vi.fn();

    funcaoRef.atual?.(aoConcluir);

    expect(aoConcluir).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("A) com processamento ativo, mostra a MESMA confirmação de 'Interromper Processamento' (não navega ainda)", async () => {
    const usuario = userEvent.setup();
    processarMock.mockImplementation(() => new Promise(() => {}));
    const { funcaoRef } = montarComCaptura();
    await selecionarPdf(usuario, "processo-a.pdf");
    await usuario.click(screen.getByRole("button", { name: "Processar" }));
    await screen.findByRole("button", { name: "⏹ Interromper Processamento" });
    const aoConcluir = vi.fn();

    act(() => funcaoRef.atual?.(aoConcluir));

    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(screen.getByText("Interromper processamento?")).toBeInTheDocument();
    expect(aoConcluir).not.toHaveBeenCalled();
  });

  it("B) cancelar a confirmação não conclui — permanece na tela, processamento continua, e não conclui depois", async () => {
    const usuario = userEvent.setup();
    let sinalCapturado: AbortSignal | undefined;
    processarMock.mockImplementation((_caminhos, _onProgresso, signal) => {
      sinalCapturado = signal;
      return new Promise(() => {});
    });
    const { funcaoRef } = montarComCaptura();
    await selecionarPdf(usuario, "processo-a.pdf");
    await usuario.click(screen.getByRole("button", { name: "Processar" }));
    await screen.findByRole("button", { name: "⏹ Interromper Processamento" });
    const aoConcluir = vi.fn();
    act(() => funcaoRef.atual?.(aoConcluir));

    await usuario.click(screen.getByRole("button", { name: "Continuar Processando" }));

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(sinalCapturado?.aborted).toBe(false);
    expect(aoConcluir).not.toHaveBeenCalled();
  });

  it("C) confirmar interrompe e SÓ DEPOIS conclui a saída pendente — nunca antes da interrupção terminar", async () => {
    const usuario = userEvent.setup();
    processarMock.mockImplementation(
      (_caminhos, _onProgresso, signal) =>
        new Promise((_resolve, reject) => {
          signal?.addEventListener("abort", () => reject(new ProcessamentoCanceladoError()));
        }),
    );
    const { funcaoRef } = montarComCaptura();
    await selecionarPdf(usuario, "processo-a.pdf");
    await usuario.click(screen.getByRole("button", { name: "Processar" }));
    await screen.findByRole("button", { name: "⏹ Interromper Processamento" });
    const aoConcluir = vi.fn();
    act(() => funcaoRef.atual?.(aoConcluir));

    await act(async () => {
      await usuario.click(screen.getByRole("button", { name: "Interromper" }));
    });

    expect(aoConcluir).toHaveBeenCalledTimes(1);
    // O processamento já tinha realmente terminado quando a saída concluiu
    // — de volta ao botão "Processar", sem diálogo.
    expect(screen.getByRole("button", { name: "Processar" })).toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("D) Configurações usa exatamente o mesmo mecanismo que Voltar (mesma função, sem lógica duplicada)", async () => {
    const usuario = userEvent.setup();
    processarMock.mockImplementation(
      (_caminhos, _onProgresso, signal) =>
        new Promise((_resolve, reject) => {
          signal?.addEventListener("abort", () => reject(new ProcessamentoCanceladoError()));
        }),
    );
    const { funcaoRef } = montarComCaptura();
    await selecionarPdf(usuario, "processo-a.pdf");
    await usuario.click(screen.getByRole("button", { name: "Processar" }));
    await screen.findByRole("button", { name: "⏹ Interromper Processamento" });
    const aoConcluirVoltar = vi.fn();
    const aoConcluirConfiguracoes = vi.fn();

    act(() => funcaoRef.atual?.(aoConcluirVoltar));
    // Uma segunda chamada (ex.: usuário clicou Configurações enquanto o
    // diálogo de Voltar já estava aberto) não duplica o diálogo nem quebra.
    act(() => funcaoRef.atual?.(aoConcluirConfiguracoes));
    expect(screen.getAllByRole("alertdialog")).toHaveLength(1);

    await act(async () => {
      await usuario.click(screen.getByRole("button", { name: "Interromper" }));
    });

    // Só a saída pendente MAIS RECENTE é concluída — mesma semântica de
    // "sobrescrever a intenção anterior", nunca as duas ao mesmo tempo.
    expect(aoConcluirConfiguracoes).toHaveBeenCalledTimes(1);
    expect(aoConcluirVoltar).not.toHaveBeenCalled();
  });

  it("reporta null ao desmontar — App.tsx nunca guarda uma função de um componente já saído", () => {
    const funcaoRef: { atual: ((aoConcluir: () => void) => void) | null } = { atual: null };
    const { unmount } = render(
      <SelecionarProcessar
        backendOnline
        aoMudarSolicitarSaidaSegura={(funcao) => {
          funcaoRef.atual = funcao;
        }}
      />,
    );
    expect(funcaoRef.atual).not.toBeNull();

    unmount();

    expect(funcaoRef.atual).toBeNull();
  });
});

// Sprint 05.2 — "Salvar Relatório" (diálogo nativo "Salvar Como...") e
// "Abrir Local" (pasta escolhida pelo usuário) na tela de conclusão, sem
// afetar a visualização já homologada ("Abrir Relatório").
describe("SelecionarProcessar — salvar e abrir o relatório final", () => {
  const loteFixture: LoteProcessamento = { id: "lote-1", total: 1, sucesso: 1, erro: 0, processos: [] };
  const resultadoPreenchimentoFixture: ResultadoPreenchimento = {
    total_gravado: 1,
    duplicadas_ignoradas: 0,
    linha_inicial: 4,
    linha_final: 4,
    itens: [],
    pasta_resultados: "C:/res/resultado_20260715_143218",
    caminho_planilha_gerada: "C:/res/resultado_20260715_143218/planilha.xlsx",
    caminho_relatorio: "C:/res/resultado_20260715_143218/relatorio.html",
    caminho_log: "C:/res/resultado_20260715_143218/log.txt",
  };

  async function chegarNaTelaFinal(usuario: ReturnType<typeof userEvent.setup>) {
    processarMock.mockResolvedValueOnce(loteFixture);
    preencherMock.mockResolvedValueOnce(resultadoPreenchimentoFixture);

    render(<SelecionarProcessar backendOnline />);
    await selecionarPdf(usuario, "processo-a.pdf");
    await usuario.click(screen.getByRole("button", { name: "Processar" }));
    // Sprint 15 — não há mais seleção manual: espera a planilha oficial
    // (mockada como configurada e acessível, ver CONFIGURACAO_ATIVA_PADRAO)
    // ser consultada e o botão ficar habilitado.
    await screen.findByText("Planilha configurada");
    const botaoPreencher = await screen.findByRole("button", { name: "Preencher planilha" });
    expect(botaoPreencher).toBeEnabled();
    await usuario.click(botaoPreencher);
    await screen.findByRole("button", { name: "Salvar Relatório" });
  }

  it("clique em 'Salvar Relatório' chama window.api.salvarRelatorio com os caminhos corretos", async () => {
    const usuario = userEvent.setup();
    await chegarNaTelaFinal(usuario);
    vi.mocked(window.api.salvarRelatorio).mockResolvedValueOnce({
      caminhoArquivo: "D:/arquivados/Relatório Processamento - 15-07-2026.html",
      pastaArquivo: "D:/arquivados",
    });

    await usuario.click(screen.getByRole("button", { name: "Salvar Relatório" }));

    expect(window.api.salvarRelatorio).toHaveBeenCalledWith(
      resultadoPreenchimentoFixture.caminho_relatorio,
      resultadoPreenchimentoFixture.pasta_resultados,
    );
  });

  it("sucesso ao salvar mostra a confirmação e o botão 'Abrir Local', que abre a pasta escolhida", async () => {
    const usuario = userEvent.setup();
    await chegarNaTelaFinal(usuario);
    vi.mocked(window.api.salvarRelatorio).mockResolvedValueOnce({
      caminhoArquivo: "D:/arquivados/Relatório Processamento - 15-07-2026.html",
      pastaArquivo: "D:/arquivados",
    });

    await usuario.click(screen.getByRole("button", { name: "Salvar Relatório" }));

    expect(await screen.findByText("✔ Relatório salvo com sucesso.")).toBeInTheDocument();
    const botaoAbrirLocal = await screen.findByRole("button", { name: "Abrir Local" });

    await usuario.click(botaoAbrirLocal);
    expect(window.api.abrirArquivo).toHaveBeenCalledWith("D:/arquivados");
  });

  it("cancelamento do diálogo (retorno null) não mostra sucesso, erro nem 'Abrir Local'", async () => {
    const usuario = userEvent.setup();
    await chegarNaTelaFinal(usuario);
    vi.mocked(window.api.salvarRelatorio).mockResolvedValueOnce(null);

    await usuario.click(screen.getByRole("button", { name: "Salvar Relatório" }));

    expect(screen.queryByText("✔ Relatório salvo com sucesso.")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Abrir Local" })).not.toBeInTheDocument();
  });

  it("erro ao salvar mostra mensagem amigável e não mostra 'Abrir Local'", async () => {
    const usuario = userEvent.setup();
    await chegarNaTelaFinal(usuario);
    vi.mocked(window.api.salvarRelatorio).mockRejectedValueOnce(new Error("EPERM"));

    await usuario.click(screen.getByRole("button", { name: "Salvar Relatório" }));

    expect(
      await screen.findByText(
        "Não foi possível concluir a operação porque o arquivo está aberto em outro programa (ex.: Excel). Feche-o e tente novamente.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Abrir Local" })).not.toBeInTheDocument();
  });

  it("'Abrir Relatório' continua chamando window.api.abrirArquivo com o caminho do relatório — visualização preservada", async () => {
    const usuario = userEvent.setup();
    await chegarNaTelaFinal(usuario);

    await usuario.click(screen.getByRole("button", { name: "Abrir Relatório" }));

    expect(window.api.abrirArquivo).toHaveBeenCalledWith(resultadoPreenchimentoFixture.caminho_relatorio);
  });

  it("antes de qualquer salvamento, o botão 'Abrir Local' não é exibido", async () => {
    const usuario = userEvent.setup();
    await chegarNaTelaFinal(usuario);

    expect(screen.queryByRole("button", { name: "Abrir Local" })).not.toBeInTheDocument();
  });
});

// Sprint 15 — Configuração Inicial da Planilha Oficial (§7/§7.1): bloqueio
// da ação "Preencher planilha", nunca da seleção/processamento de PDFs.
describe("SelecionarProcessar — planilha oficial inacessível ou desatualizada (Sprint 15)", () => {
  async function chegarNaEtapaDePreenchimento(usuario: ReturnType<typeof userEvent.setup>) {
    processarMock.mockResolvedValueOnce({
      id: "lote-1",
      total: 1,
      sucesso: 1,
      erro: 0,
      processos: [],
    });

    render(<SelecionarProcessar backendOnline />);
    await selecionarPdf(usuario, "processo-a.pdf");
    await usuario.click(screen.getByRole("button", { name: "Processar" }));
    await screen.findByRole("button", { name: "Preencher planilha" });
  }

  it("planilha_acessivel:false não impede selecionar/processar PDFs, só bloqueia 'Preencher planilha'", async () => {
    const usuario = userEvent.setup();
    buscarConfiguracaoMock.mockResolvedValue({ configurado: true, planilha_acessivel: false });

    await chegarNaEtapaDePreenchimento(usuario);

    expect(
      await screen.findByText(/planilha oficial configurada está inacessível/),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Preencher planilha" })).toBeDisabled();
    expect(preencherMock).not.toHaveBeenCalled();
  });

  it("requer_revalidacao:true também bloqueia 'Preencher planilha', com aviso próprio", async () => {
    const usuario = userEvent.setup();
    buscarConfiguracaoMock.mockResolvedValue({
      ...CONFIGURACAO_ATIVA_PADRAO,
      requer_revalidacao: true,
    });

    await chegarNaEtapaDePreenchimento(usuario);

    expect(
      await screen.findByText(/estrutura da planilha oficial mudou desde a última configuração/),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Preencher planilha" })).toBeDisabled();
  });

  it("'Alterar Planilha Oficial' abre o modal e, após configurar, libera 'Preencher planilha'", async () => {
    const usuario = userEvent.setup();
    buscarConfiguracaoMock.mockResolvedValue({ configurado: true, planilha_acessivel: false });

    await chegarNaEtapaDePreenchimento(usuario);
    await usuario.click(screen.getByRole("button", { name: "Alterar Planilha Oficial" }));

    expect(screen.getByRole("dialog", { name: "Alterar Planilha Oficial" })).toBeInTheDocument();

    vi.mocked(window.api.selecionarPlanilhaOficial).mockResolvedValueOnce(
      "G:\\Meu Drive\\DIMCAC\\Controle de Diárias.xlsx",
    );
    definirConfiguracaoMock.mockResolvedValueOnce(CONFIGURACAO_ATIVA_PADRAO);

    await usuario.click(screen.getByRole("button", { name: "Selecionar planilha oficial (.xlsx)" }));

    expect(await screen.findByRole("button", { name: "Preencher planilha" })).toBeEnabled();
    expect(screen.queryByRole("dialog", { name: "Alterar Planilha Oficial" })).not.toBeInTheDocument();
  });
});

// RN-14 — Modo Complemento de Diárias: fluxo separado do Processamento
// normal, mesmo parser/arquitetura já homologados, propagando `modo` para
// os dois serviços (processar e preencher).
describe("SelecionarProcessar — Modo Complemento de Diárias (RN-14)", () => {
  it("botão alterna o rótulo e fica desabilitado depois de processar", async () => {
    const usuario = userEvent.setup();
    processarMock.mockResolvedValueOnce({ id: "lote-1", total: 1, sucesso: 1, erro: 0, processos: [] });

    render(<SelecionarProcessar backendOnline />);
    const botaoModo = screen.getByRole("button", { name: "Modo Complemento de Diárias" });
    await usuario.click(botaoModo);
    expect(
      screen.getByRole("button", { name: "Modo Complemento de Diárias (ativo)" }),
    ).toBeInTheDocument();

    await selecionarPdf(usuario, "processo-a.pdf");
    await usuario.click(screen.getByRole("button", { name: "Processar" }));
    await screen.findByRole("button", { name: "Preencher planilha" });

    expect(
      screen.getByRole("button", { name: "Modo Complemento de Diárias (ativo)" }),
    ).toBeDisabled();
  });

  it("exibe o aviso explicando o comportamento do modo Complemento", async () => {
    const usuario = userEvent.setup();
    render(<SelecionarProcessar backendOnline />);

    await usuario.click(screen.getByRole("button", { name: "Modo Complemento de Diárias" }));

    expect(screen.getByText(/COMPLEMENTO DE DIÁRIAS/)).toBeInTheDocument();
    expect(screen.getByText(/SEI já existente não impede mais a gravação/)).toBeInTheDocument();
  });

  it("propaga modo=COMPLEMENTO para processarLoteComProgresso e preencherPlanilha", async () => {
    const usuario = userEvent.setup();
    processarMock.mockResolvedValueOnce({ id: "lote-1", total: 1, sucesso: 1, erro: 0, processos: [] });
    preencherMock.mockResolvedValueOnce({
      total_gravado: 1,
      duplicadas_ignoradas: 0,
      linha_inicial: 4,
      linha_final: 4,
      itens: [],
      pasta_resultados: "C:/res",
      caminho_planilha_gerada: "C:/res/planilha.xlsx",
      caminho_relatorio: "C:/res/relatorio.html",
      caminho_log: "C:/res/log.txt",
    });

    render(<SelecionarProcessar backendOnline />);
    await usuario.click(screen.getByRole("button", { name: "Modo Complemento de Diárias" }));
    await selecionarPdf(usuario, "processo-a.pdf");
    await usuario.click(screen.getByRole("button", { name: "Processar" }));
    const botaoPreencher = await screen.findByRole("button", { name: "Preencher planilha" });
    await usuario.click(botaoPreencher);
    await screen.findByRole("button", { name: "Salvar Relatório" });

    expect(processarMock.mock.calls[0][3]).toBe("COMPLEMENTO");
    expect(preencherMock.mock.calls[0][2]).toBe("COMPLEMENTO");
  });

  it("sem ativar o modo, propaga PADRAO — zero regressão do fluxo já homologado", async () => {
    const usuario = userEvent.setup();
    processarMock.mockResolvedValueOnce({ id: "lote-1", total: 1, sucesso: 1, erro: 0, processos: [] });
    preencherMock.mockResolvedValueOnce({
      total_gravado: 1,
      duplicadas_ignoradas: 0,
      linha_inicial: 4,
      linha_final: 4,
      itens: [],
      pasta_resultados: "C:/res",
      caminho_planilha_gerada: "C:/res/planilha.xlsx",
      caminho_relatorio: "C:/res/relatorio.html",
      caminho_log: "C:/res/log.txt",
    });

    render(<SelecionarProcessar backendOnline />);
    await selecionarPdf(usuario, "processo-a.pdf");
    await usuario.click(screen.getByRole("button", { name: "Processar" }));
    const botaoPreencher = await screen.findByRole("button", { name: "Preencher planilha" });
    await usuario.click(botaoPreencher);
    await screen.findByRole("button", { name: "Salvar Relatório" });

    expect(processarMock.mock.calls[0][3]).toBe("PADRAO");
    expect(preencherMock.mock.calls[0][2]).toBe("PADRAO");
  });
});
