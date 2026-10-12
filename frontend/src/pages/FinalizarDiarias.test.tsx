// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import FinalizarDiarias from "./FinalizarDiarias";
import type { EstadoConfiguracao } from "../types/configuracao";
import type { ItemAnaliseFinalizacao, RespostaConfirmacaoFinalizacao } from "../types/finalizacao";

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

vi.mock("../services/api", async (importarOriginal) => {
  const real = await importarOriginal<typeof import("../services/api")>();
  return {
    ...real,
    analisarFinalizacao: vi.fn(),
    confirmarFinalizacao: vi.fn(),
  };
});

import { analisarFinalizacao, confirmarFinalizacao } from "../services/api";

const analisarMock = vi.mocked(analisarFinalizacao);
const confirmarMock = vi.mocked(confirmarFinalizacao);

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
});

function itemPronto(
  sei = "19.20.0000.0000001/2026-01",
  arquivo = "processo.pdf",
): ItemAnaliseFinalizacao {
  return {
    arquivo_origem: arquivo,
    sei,
    status: "pronto",
    motivo: null,
    avaliacao: {
      confirmacao_encontrada: true,
      confirmacao_valida: true,
      comprovante_encontrado: true,
      situacao_comprovante: "encontrado",
      ordem_bancaria_encontrada: false,
      apto: true,
      pendente_analitico: false,
      alertas: [],
    },
    candidatos: [
      {
        linha: 4,
        cpf: "11111111111",
        periodo_inicial: "2026-01-07",
        periodo_final: "2026-01-07",
        trecho: "RECIFE - OLINDA",
        dh: null,
        aviso: null,
        x_atual: null,
        y_atual: null,
        estado: "pronta",
      },
    ],
  };
}

function itemProntoComAlerta(
  sei = "19.20.0000.0000008/2026-08",
  arquivo = "com-alerta.pdf",
): ItemAnaliseFinalizacao {
  return {
    arquivo_origem: arquivo,
    sei,
    status: "pronto",
    motivo: null,
    avaliacao: {
      confirmacao_encontrada: true,
      confirmacao_valida: true,
      comprovante_encontrado: false,
      situacao_comprovante: "pendente",
      ordem_bancaria_encontrada: false,
      apto: false,
      pendente_analitico: true,
      alertas: ["Comprovante anexado, mas o título não permite confirmação automática — revisar manualmente."],
    },
    candidatos: [
      {
        linha: 9,
        cpf: "99999999999",
        periodo_inicial: "2026-01-07",
        periodo_final: "2026-01-07",
        trecho: "RECIFE - OLINDA",
        dh: null,
        aviso: null,
        x_atual: null,
        y_atual: null,
        estado: "pronta",
      },
    ],
  };
}

function itemJaConfirmado(
  sei = "19.20.0000.0000004/2026-04",
  arquivo = "ja-confirmado.pdf",
): ItemAnaliseFinalizacao {
  return {
    arquivo_origem: arquivo,
    sei,
    status: "ja_finalizado",
    motivo: "Já confirmado na Planilha Oficial.",
    avaliacao: {
      confirmacao_encontrada: true,
      confirmacao_valida: true,
      comprovante_encontrado: true,
      situacao_comprovante: "encontrado",
      ordem_bancaria_encontrada: true,
      apto: true,
      pendente_analitico: false,
      alertas: [],
    },
    candidatos: [],
  };
}

function itemSeiNaoEncontrado(
  sei = "19.20.0000.0000005/2026-05",
  arquivo = "nao-localizado.pdf",
): ItemAnaliseFinalizacao {
  return {
    arquivo_origem: arquivo,
    sei,
    status: "sei_nao_encontrado",
    motivo: "SEI não localizado na Planilha Oficial.",
    avaliacao: {
      confirmacao_encontrada: true,
      confirmacao_valida: true,
      comprovante_encontrado: true,
      situacao_comprovante: "encontrado",
      ordem_bancaria_encontrada: false,
      apto: true,
      pendente_analitico: false,
      alertas: [],
    },
    candidatos: [],
  };
}

// Ajuste de 2026-08-07: mesmo SEI em duas linhas (diária + Complemento de
// Diárias) — a regra é do processo inteiro, "pronto" cobre as duas.
function itemProntoComDuasLinhas(): ItemAnaliseFinalizacao {
  return {
    arquivo_origem: "duas-linhas.pdf",
    sei: "19.20.0000.0000003/2026-03",
    status: "pronto",
    motivo: null,
    avaliacao: {
      confirmacao_encontrada: true,
      confirmacao_valida: true,
      comprovante_encontrado: true,
      situacao_comprovante: "encontrado",
      ordem_bancaria_encontrada: false,
      apto: true,
      pendente_analitico: false,
      alertas: [],
    },
    candidatos: [
      {
        linha: 10,
        cpf: "22222222222",
        periodo_inicial: "2026-02-01",
        periodo_final: "2026-02-02",
        trecho: "RECIFE - GARANHUNS",
        dh: "2026DH000010",
        aviso: null,
        x_atual: null,
        y_atual: null,
        estado: "pronta",
      },
      {
        linha: 25,
        cpf: "22222222222",
        periodo_inicial: "2026-02-01",
        periodo_final: "2026-02-02",
        trecho: "RECIFE - GARANHUNS",
        dh: "2026DH000011",
        aviso: "COMPLEMENTO DE DIÁRIAS",
        x_atual: "SIM",
        y_atual: "SIM",
        estado: "ja_finalizada",
      },
    ],
  };
}

describe("FinalizarDiarias", () => {
  it("mostra título e subtítulo da funcionalidade", () => {
    render(<FinalizarDiarias backendOnline />);
    expect(screen.getByRole("heading", { name: "Finalizar Diárias" })).toBeInTheDocument();
    expect(
      screen.getByText("Confirmar comprovantes e confirmação de diárias na Planilha Oficial."),
    ).toBeInTheDocument();
  });

  it("botão 'Analisar' fica desabilitado sem nenhum PDF selecionado", () => {
    render(<FinalizarDiarias backendOnline />);
    expect(screen.getByRole("button", { name: "Analisar" })).toBeDisabled();
  });

  it("analisa o lote e mostra o resumo em 4 baldes", async () => {
    const usuario = userEvent.setup();
    analisarMock.mockResolvedValue({
      itens: [itemPronto(), itemJaConfirmado(), itemSeiNaoEncontrado()],
    });

    render(<FinalizarDiarias backendOnline />);
    await selecionarPdf(usuario, "processo.pdf");
    await usuario.click(screen.getByRole("button", { name: "Analisar" }));

    expect(await screen.findByText(/3 processo\(s\) analisado\(s\)/)).toBeInTheDocument();
    expect(screen.getByText(/1 já confirmado\(s\) na Planilha Oficial/)).toBeInTheDocument();
    expect(screen.getByText(/1 pronto\(s\) para confirmação/)).toBeInTheDocument();
    expect(screen.getByText(/1 não localizado\(s\)/)).toBeInTheDocument();
    expect(analisarMock).toHaveBeenCalledWith(["C:/pdfs/processo.pdf"]);
  });

  it("mostra mensagem de erro quando a análise falha", async () => {
    const usuario = userEvent.setup();
    analisarMock.mockRejectedValue(new Error("Backend respondeu 500"));

    render(<FinalizarDiarias backendOnline />);
    await selecionarPdf(usuario, "processo.pdf");
    await usuario.click(screen.getByRole("button", { name: "Analisar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Ocorreu um erro inesperado. Tente novamente em instantes.",
    );
  });

  it("SEI com múltiplas linhas fica pronto sem seleção manual, listando os registros vinculados", async () => {
    const usuario = userEvent.setup();
    analisarMock.mockResolvedValue({ itens: [itemProntoComDuasLinhas()] });

    render(<FinalizarDiarias backendOnline />);
    await selecionarPdf(usuario, "duas-linhas.pdf");
    await usuario.click(screen.getByRole("button", { name: "Analisar" }));

    await screen.findByText(/2 registros vinculados a este SEI serão finalizados juntos/);
    expect(screen.getByText(/Linha 10/)).toBeInTheDocument();
    expect(screen.getByText(/Linha 25/)).toBeInTheDocument();
    expect(screen.getByText(/COMPLEMENTO DE DIÁRIAS/)).toBeInTheDocument();

    expect(screen.getByRole("button", { name: "Finalizar 1 processo(s) restante(s)" })).toBeEnabled();
  });

  it("clicar em 'Finalizar' abre a confirmação antes de gravar (item 6)", async () => {
    const usuario = userEvent.setup();
    analisarMock.mockResolvedValue({ itens: [itemPronto()] });

    render(<FinalizarDiarias backendOnline />);
    await selecionarPdf(usuario, "processo.pdf");
    await usuario.click(screen.getByRole("button", { name: "Analisar" }));
    await usuario.click(await screen.findByRole("button", { name: "Finalizar 1 processo(s) restante(s)" }));

    expect(await screen.findByRole("alertdialog")).toHaveTextContent(
      "Você está prestes a finalizar 1 processo(s) localizado(s) na Planilha Oficial.",
    );
    expect(confirmarMock).not.toHaveBeenCalled();
  });

  it("cancelar a confirmação não grava nada", async () => {
    const usuario = userEvent.setup();
    analisarMock.mockResolvedValue({ itens: [itemPronto()] });

    render(<FinalizarDiarias backendOnline />);
    await selecionarPdf(usuario, "processo.pdf");
    await usuario.click(screen.getByRole("button", { name: "Analisar" }));
    await usuario.click(await screen.findByRole("button", { name: "Finalizar 1 processo(s) restante(s)" }));
    await usuario.click(await screen.findByRole("button", { name: "Cancelar" }));

    expect(confirmarMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("confirma a finalização e mostra o relatório de execução", async () => {
    const usuario = userEvent.setup();
    analisarMock.mockResolvedValue({ itens: [itemPronto()] });
    const resultado: RespostaConfirmacaoFinalizacao = {
      total_finalizado: 1,
      total_ja_confirmado: 0,
      total_ignorado: 0,
      itens: [
        {
          arquivo_origem: "processo.pdf",
          sei: "19.20.0000.0000001/2026-01",
          categoria: "finalizado",
          linhas_atualizadas: [4],
          linhas_mantidas: [],
          motivo: null,
          organizacao: null,
        },
      ],
    };
    confirmarMock.mockResolvedValue(resultado);

    render(<FinalizarDiarias backendOnline />);
    await selecionarPdf(usuario, "processo.pdf");
    await usuario.click(screen.getByRole("button", { name: "Analisar" }));
    await usuario.click(await screen.findByRole("button", { name: "Finalizar 1 processo(s) restante(s)" }));
    await usuario.click(await screen.findByRole("button", { name: "Confirmar finalização" }));

    expect(await screen.findByRole("heading", { name: "Finalização concluída" })).toBeInTheDocument();
    expect(screen.getByText("1 processo(s) analisado(s)")).toBeInTheDocument();
    expect(screen.getByText(/1 confirmado\(s\) nesta operação/)).toBeInTheDocument();
    expect(confirmarMock).toHaveBeenCalledWith([
      {
        arquivo_origem: "processo.pdf",
        sei: "19.20.0000.0000001/2026-01",
        // Organização Automática de PDFs — caminho absoluto capturado a
        // partir de `window.api.getPathForFile` no momento da análise.
        caminho_absoluto: "C:/pdfs/processo.pdf",
      },
    ]);
  });

  it("exibe estado 'já confirmada' sem permitir regravação, nunca como erro", async () => {
    const usuario = userEvent.setup();
    analisarMock.mockResolvedValue({ itens: [itemJaConfirmado()] });

    render(<FinalizarDiarias backendOnline />);
    await selecionarPdf(usuario, "ja-confirmado.pdf");
    await usuario.click(screen.getByRole("button", { name: "Analisar" }));

    await screen.findByText("Já confirmada na Planilha Oficial");
    expect(screen.getByRole("button", { name: /Finalizar 0 processo/ })).toBeDisabled();
  });

  // --- Regra definitiva (Sprint pré-build, 2026-08-11) ----------------------

  it("(E) alerta documental + SEI localizado entra no lote a finalizar normalmente", async () => {
    const usuario = userEvent.setup();
    analisarMock.mockResolvedValue({ itens: [itemPronto(), itemProntoComAlerta()] });

    render(<FinalizarDiarias backendOnline />);
    await selecionarPdf(usuario, "qualquer.pdf");
    await usuario.click(screen.getByRole("button", { name: "Analisar" }));

    expect(await screen.findByText(/1 pronto\(s\) para confirmação/)).toBeInTheDocument();
    expect(screen.getByText(/1 localizado\(s\) com alertas/)).toBeInTheDocument();
    expect(screen.getByText(/revisar manualmente/)).toBeInTheDocument();
    // O botão inclui os DOIS — sem alerta e com alerta — nunca separa.
    expect(screen.getByRole("button", { name: "Finalizar 2 processo(s) restante(s)" })).toBeInTheDocument();
  });

  it("(F/G) já confirmados e não localizados ficam de fora da contagem do botão", async () => {
    const usuario = userEvent.setup();
    analisarMock.mockResolvedValue({
      itens: [itemPronto(), itemJaConfirmado(), itemSeiNaoEncontrado()],
    });

    render(<FinalizarDiarias backendOnline />);
    await selecionarPdf(usuario, "qualquer.pdf");
    await usuario.click(screen.getByRole("button", { name: "Analisar" }));

    // Só o "pronto" entra na contagem do botão — nem o já confirmado, nem o não localizado.
    expect(await screen.findByRole("button", { name: "Finalizar 1 processo(s) restante(s)" })).toBeEnabled();
  });

  it("(H) 'já confirmado' aparece com o selo informativo, nunca 'erro'", async () => {
    const usuario = userEvent.setup();
    analisarMock.mockResolvedValue({ itens: [itemJaConfirmado()] });

    render(<FinalizarDiarias backendOnline />);
    await selecionarPdf(usuario, "ja-confirmado.pdf");
    await usuario.click(screen.getByRole("button", { name: "Analisar" }));

    const badge = await screen.findByText("Já confirmada na Planilha Oficial");
    // Badge "info" (azul/ciano) — não usa a classe de variante "erro".
    expect(badge.className).not.toMatch(/red/);
  });

  it("(I) mensagem verde aparece quando pelo menos 1 processo é confirmado nesta operação", async () => {
    const usuario = userEvent.setup();
    analisarMock.mockResolvedValue({ itens: [itemPronto()] });
    confirmarMock.mockResolvedValue({
      total_finalizado: 1,
      total_ja_confirmado: 0,
      total_ignorado: 0,
      itens: [
        {
          arquivo_origem: "processo.pdf",
          sei: "19.20.0000.0000001/2026-01",
          categoria: "finalizado",
          linhas_atualizadas: [4],
          linhas_mantidas: [],
          motivo: null,
          organizacao: null,
        },
      ],
    });

    render(<FinalizarDiarias backendOnline />);
    await selecionarPdf(usuario, "processo.pdf");
    await usuario.click(screen.getByRole("button", { name: "Analisar" }));
    await usuario.click(await screen.findByRole("button", { name: "Finalizar 1 processo(s) restante(s)" }));
    await usuario.click(await screen.findByRole("button", { name: "Confirmar finalização" }));

    await screen.findByRole("heading", { name: "Finalização concluída" });
    expect(
      screen.getByText(/DIÁRIAS CONFIRMADAS 2026/),
    ).toBeInTheDocument();
  });

  it("(J) mensagem verde NÃO aparece quando nada foi confirmado nesta operação (só já confirmados)", async () => {
    const usuario = userEvent.setup();
    // Só itens já confirmados na análise -- nada "pronto" para enviar, mas
    // simulamos o usuário confirmando um lote vazio de "restantes" via um
    // item pronto que, na hora de gravar, já tinha sido confirmado por
    // outra operação (revalidação no momento da gravação).
    analisarMock.mockResolvedValue({ itens: [itemPronto()] });
    confirmarMock.mockResolvedValue({
      total_finalizado: 0,
      total_ja_confirmado: 1,
      total_ignorado: 0,
      itens: [
        {
          arquivo_origem: "processo.pdf",
          sei: "19.20.0000.0000001/2026-01",
          categoria: "ja_confirmado",
          linhas_atualizadas: [],
          linhas_mantidas: [4],
          motivo: "Já confirmado na Planilha Oficial.",
          organizacao: null,
        },
      ],
    });

    render(<FinalizarDiarias backendOnline />);
    await selecionarPdf(usuario, "processo.pdf");
    await usuario.click(screen.getByRole("button", { name: "Analisar" }));
    await usuario.click(await screen.findByRole("button", { name: "Finalizar 1 processo(s) restante(s)" }));
    await usuario.click(await screen.findByRole("button", { name: "Confirmar finalização" }));

    await screen.findByRole("heading", { name: "Finalização concluída" });
    expect(screen.queryByText(/DIÁRIAS CONFIRMADAS 2026/)).not.toBeInTheDocument();
    expect(screen.getByText(/1 já estava\(m\) confirmado\(s\)/)).toBeInTheDocument();
  });

  it("(K) rastreabilidade: todo processo analisado aparece classificado no relatório final, nenhum some", async () => {
    const usuario = userEvent.setup();
    analisarMock.mockResolvedValue({
      itens: [itemPronto(), itemJaConfirmado(), itemSeiNaoEncontrado()],
    });
    confirmarMock.mockResolvedValue({
      total_finalizado: 1,
      total_ja_confirmado: 0,
      total_ignorado: 0,
      itens: [
        {
          arquivo_origem: "processo.pdf",
          sei: "19.20.0000.0000001/2026-01",
          categoria: "finalizado",
          linhas_atualizadas: [4],
          linhas_mantidas: [],
          motivo: null,
          organizacao: null,
        },
      ],
    });

    render(<FinalizarDiarias backendOnline />);
    await selecionarPdf(usuario, "qualquer.pdf");
    await usuario.click(screen.getByRole("button", { name: "Analisar" }));
    await usuario.click(await screen.findByRole("button", { name: "Finalizar 1 processo(s) restante(s)" }));
    await usuario.click(await screen.findByRole("button", { name: "Confirmar finalização" }));

    await screen.findByRole("heading", { name: "Finalização concluída" });
    expect(screen.getByText("3 processo(s) analisado(s)")).toBeInTheDocument();
    expect(screen.getByText("processo.pdf")).toBeInTheDocument();
    expect(screen.getByText("ja-confirmado.pdf")).toBeInTheDocument();
    expect(screen.getByText("nao-localizado.pdf")).toBeInTheDocument();
    expect(screen.getByText(/1 confirmado\(s\) nesta operação/)).toBeInTheDocument();
    expect(screen.getByText(/1 já estava\(m\) confirmado\(s\)/)).toBeInTheDocument();
    expect(screen.getByText(/1 não finalizado\(s\)/)).toBeInTheDocument();
  });
});

// Organização Automática de PDFs — guarda de pasta (decisão confirmada:
// seleção de PDF continua via <input type="file"> + webUtils.
// getPathForFile) e bloqueio de UX quando a pasta "Diárias a Confirmar"
// não está configurada.
describe("FinalizarDiarias — Organização Automática de PDFs", () => {
  function configuracaoComPasta(liberado: boolean): EstadoConfiguracao {
    return {
      configurado: true,
      planilha_acessivel: true,
      requer_revalidacao: false,
      caminho_planilha_oficial: "C:/planilha.xlsx",
      configurado_em: "2026-08-01T10:00:00",
      caminho_pdfs_a_processar: null,
      caminho_pdfs_complemento_a_processar: null,
      caminho_pdfs_processados: null,
      caminho_pdfs_diarias_a_confirmar: liberado ? "C:/a-confirmar" : null,
      prontidao_pastas: {
        processamento_padrao: { liberado: true, pastas_faltando: [] },
        complemento: { liberado: true, pastas_faltando: [] },
        finalizacao: {
          liberado,
          pastas_faltando: liberado ? [] : ["PDFs de Diárias a Confirmar"],
        },
      },
    };
  }

  it("PDF fora da pasta configurada não entra na fila — mostra o aviso", async () => {
    const usuario = userEvent.setup();
    window.api.getPathForFile = (arquivo: File) => `C:/outra-pasta/${arquivo.name}`;
    window.api.caminhoDentroDaPasta = async (caminho: string, pasta: string) => caminho.startsWith(pasta);

    render(<FinalizarDiarias backendOnline configuracaoAtiva={configuracaoComPasta(true)} />);
    await selecionarPdf(usuario, "fora-da-pasta.pdf");

    expect(screen.getByText("Selecione os PDFs na pasta configurada para esta função.")).toBeInTheDocument();
    expect(screen.queryByText("fora-da-pasta.pdf")).not.toBeInTheDocument();
  });

  it("PDF dentro da pasta configurada entra normalmente na fila", async () => {
    const usuario = userEvent.setup();
    window.api.getPathForFile = (arquivo: File) => `C:/a-confirmar/${arquivo.name}`;
    window.api.caminhoDentroDaPasta = async (caminho: string, pasta: string) => caminho.startsWith(pasta);

    render(<FinalizarDiarias backendOnline configuracaoAtiva={configuracaoComPasta(true)} />);
    await selecionarPdf(usuario, "dentro-da-pasta.pdf");

    expect(screen.getByText("dentro-da-pasta.pdf")).toBeInTheDocument();
  });

  it("pasta não configurada: bloqueia a tela operacional com a lista de pastas faltando", () => {
    render(<FinalizarDiarias backendOnline configuracaoAtiva={configuracaoComPasta(false)} />);

    expect(
      screen.getByText("Antes de utilizar esta função, configure as pastas necessárias."),
    ).toBeInTheDocument();
    expect(screen.getByText("PDFs de Diárias a Confirmar")).toBeInTheDocument();
    expect(screen.queryByText("Selecionar PDFs")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Analisar" })).not.toBeInTheDocument();
  });

  it("'Configurar agora' no bloqueio aciona aoAbrirConfiguracoes", async () => {
    const usuario = userEvent.setup();
    const aoAbrirConfiguracoes = vi.fn();

    render(
      <FinalizarDiarias
        backendOnline
        configuracaoAtiva={configuracaoComPasta(false)}
        aoAbrirConfiguracoes={aoAbrirConfiguracoes}
      />,
    );
    await usuario.click(screen.getByRole("button", { name: "Configurar agora" }));

    expect(aoAbrirConfiguracoes).toHaveBeenCalledTimes(1);
  });

  it("configuracaoAtiva ausente (prop não passada): nunca bloqueia — mesmo comportamento de antes desta melhoria", () => {
    render(<FinalizarDiarias backendOnline />);

    expect(screen.getByText("Selecionar PDFs")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Analisar" })).toBeInTheDocument();
  });

  it("confirmarFinalizacao recebe o caminho absoluto capturado no momento de analisar()", async () => {
    const usuario = userEvent.setup();
    analisarMock.mockResolvedValue({ itens: [itemPronto()] });
    confirmarMock.mockResolvedValue({
      total_finalizado: 1,
      total_ja_confirmado: 0,
      total_ignorado: 0,
      itens: [
        {
          arquivo_origem: "processo.pdf",
          sei: "19.20.0000.0000001/2026-01",
          categoria: "finalizado",
          linhas_atualizadas: [4],
          linhas_mantidas: [],
          motivo: null,
          organizacao: { sucesso: true, status: "excluido", detalhe: null },
        },
      ],
    });

    render(<FinalizarDiarias backendOnline />);
    await selecionarPdf(usuario, "processo.pdf");
    await usuario.click(screen.getByRole("button", { name: "Analisar" }));
    await usuario.click(await screen.findByRole("button", { name: "Finalizar 1 processo(s) restante(s)" }));
    await usuario.click(await screen.findByRole("button", { name: "Confirmar finalização" }));

    await screen.findByRole("heading", { name: "Finalização concluída" });
    expect(confirmarMock).toHaveBeenCalledWith([
      {
        arquivo_origem: "processo.pdf",
        sei: "19.20.0000.0000001/2026-01",
        caminho_absoluto: "C:/pdfs/processo.pdf",
      },
    ]);
    expect(screen.getByText("Excluído da pasta de origem")).toBeInTheDocument();
  });
});
