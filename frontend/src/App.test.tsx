// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

// `FundoDecorativo` chama `window.matchMedia` (checagem de
// `prefers-reduced-motion`) — jsdom não implementa isso nativamente. Este é
// o primeiro teste a montar a árvore inteira (`App`, que sempre renderiza
// `FundoDecorativo`), então precisa do stub; os demais testes de página
// renderizam a página isolada e nunca passam por aqui.
beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
});

// Isola a navegação de `App` do restante das duas páginas de funcionalidade
// — cada uma já tem sua própria suíte (`SelecionarProcessar.test.tsx`,
// `Conferencia.test.tsx`); aqui o único contrato sob teste é a máquina de
// estados Boas-vindas → Hub → funcionalidade.
vi.mock("./hooks/useBackendStatus", () => ({
  useBackendStatus: () => "conectado" as const,
}));
// Sprint (Loading/Bloqueio de Ações/Navegação Segura, itens 14-15) — mock
// interativo mínimo: expõe só a FIAÇÃO real do contrato
// `aoMudarEstado`/`aoMudarSolicitarSaidaSegura` que `App.tsx` consome,
// sem reimplementar a lógica profunda de interrupção (diálogo real,
// abort, etc.) — essa já está coberta em `SelecionarProcessar.test.tsx`.
// `aoConcluirPendente` é module-scoped (não `useState`) de propósito: o
// mock nunca precisa re-renderizar sozinho, só guardar o callback que o
// teste vai disparar depois, simulando "a interrupção terminou".
vi.mock("./pages/SelecionarProcessar", () => {
  let aoConcluirPendente: (() => void) | null = null;
  return {
    default: (props: {
      aoMudarEstado?: (estado: string) => void;
      aoMudarSolicitarSaidaSegura?: (funcao: ((aoConcluir: () => void) => void) | null) => void;
    }) => (
      <div>
        <p>Tela de Processamento</p>
        <button
          type="button"
          onClick={() => {
            props.aoMudarEstado?.("processando");
            props.aoMudarSolicitarSaidaSegura?.((aoConcluir: () => void) => {
              aoConcluirPendente = aoConcluir;
            });
          }}
        >
          Simular processamento ativo
        </button>
        <button type="button" onClick={() => aoConcluirPendente?.()}>
          Confirmar interrupção (simulada)
        </button>
      </div>
    ),
  };
});
vi.mock("./pages/Conferencia", () => ({
  default: () => <div>Tela de Conferência</div>,
}));
// Sprint 18.4.2 — mesmo isolamento das duas funcionalidades acima; a
// Central Analítica já tem sua própria suíte (`CentralAnalitica.test.tsx`).
vi.mock("./pages/CentralAnalitica", () => ({
  default: () => <div>Tela da Central Analítica</div>,
}));
// Micro-sprint 3E.1 — mesmo isolamento das demais funcionalidades; já tem
// sua própria suíte (`RelatorioPortalTransparencia.test.tsx`).
vi.mock("./pages/RelatorioPortalTransparencia", () => ({
  default: () => <div>Tela do Relatório do Portal da Transparência</div>,
}));

// Sprint 15 — Configuração Inicial da Planilha Oficial: `useConfiguracao`
// mockado para que os testes de navegação (Sprint 14, acima) continuem
// isolados do gate novo — por padrão, "já configurado e acessível", o
// mesmo estado em que o app operava antes desta Sprint.
vi.mock("./hooks/useConfiguracao", () => ({
  useConfiguracao: vi.fn(),
}));

import { useConfiguracao } from "./hooks/useConfiguracao";

const useConfiguracaoMock = vi.mocked(useConfiguracao);
const atualizarConfiguracaoMock = vi.fn();

// Organização Automática de PDFs — pastas operacionais aditivas, nenhuma
// configurada nestes testes de navegação (não são o foco desta suíte).
const PRONTIDAO_PASTAS_VAZIA = {
  processamento_padrao: { liberado: false, pastas_faltando: ["PDFs a Processar", "PDFs Processados"] },
  complemento: {
    liberado: false,
    pastas_faltando: ["PDFs de Complemento a Processar", "PDFs Processados"],
  },
  finalizacao: { liberado: false, pastas_faltando: ["PDFs de Diárias a Confirmar"] },
};

const CONFIGURACAO_ATIVA = {
  configurado: true as const,
  planilha_acessivel: true as const,
  requer_revalidacao: false,
  caminho_planilha_oficial: "G:\\Meu Drive\\DIMCAC\\Controle de Diárias.xlsx",
  configurado_em: "2026-07-30T14:32:10",
  caminho_pdfs_a_processar: null,
  caminho_pdfs_complemento_a_processar: null,
  caminho_pdfs_processados: null,
  caminho_pdfs_diarias_a_confirmar: null,
  prontidao_pastas: PRONTIDAO_PASTAS_VAZIA,
};

// Sprint (Loading/Bloqueio de Ações/Navegação Segura, item 15) — o
// processo main pede confirmação de fechamento via um callback registrado
// por `App.tsx` (`window.api.aoSolicitarFechamento`); os testes disparam
// esse callback aqui para simular o evento nativo `close` do
// `BrowserWindow` (X, Alt+F4, `app.quit()`), sem precisar de Electron de
// verdade.
let solicitarFechamentoCallback: (() => void) | null = null;
const confirmarFechamentoMock = vi.fn();

beforeEach(() => {
  solicitarFechamentoCallback = null;
  window.api = {
    getPathForFile: (arquivo: File) => arquivo.name,
    abrirArquivo: vi.fn(),
    salvarComo: vi.fn(),
    salvarRelatorio: vi.fn(),
    copiarHistorico: vi.fn(),
    selecionarPlanilhaOficial: vi.fn(),
    aoSolicitarFechamento: vi.fn((callback: () => void) => {
      solicitarFechamentoCallback = callback;
      return () => {
        solicitarFechamentoCallback = null;
      };
    }),
    confirmarFechamento: confirmarFechamentoMock,
  };
  confirmarFechamentoMock.mockClear();
  useConfiguracaoMock.mockReturnValue({
    estado: CONFIGURACAO_ATIVA,
    atualizar: atualizarConfiguracaoMock,
  });
});

afterEach(() => {
  cleanup();
});

describe("App — navegação Boas-vindas → Hub → funcionalidade (Sprint 14)", () => {
  it("abre em Boas-vindas, nunca direto numa funcionalidade", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "Automatizador de Diárias" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Começar" })).toBeInTheDocument();
    expect(screen.queryByText("Tela de Processamento")).not.toBeInTheDocument();
  });

  it("'Começar' leva ao Hub, com as três funcionalidades", async () => {
    const usuario = userEvent.setup();
    render(<App />);

    await usuario.click(screen.getByRole("button", { name: "Começar" }));

    expect(screen.getByText("Processamento da Planilha")).toBeInTheDocument();
    expect(screen.getByText("Central Inteligente de Conferência")).toBeInTheDocument();
    expect(screen.getByText("Central Analítica")).toBeInTheDocument();
  });

  it("selecionar um card abre a funcionalidade e mostra o link de volta ao Hub", async () => {
    const usuario = userEvent.setup();
    render(<App />);
    await usuario.click(screen.getByRole("button", { name: "Começar" }));

    await usuario.click(screen.getByRole("button", { name: /Processamento da Planilha/ }));

    expect(screen.getByText("Tela de Processamento")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Voltar/ })).toBeInTheDocument();
  });

  it("selecionar o card da Central Analítica abre o módulo e mostra o link de volta ao Hub", async () => {
    const usuario = userEvent.setup();
    render(<App />);
    await usuario.click(screen.getByRole("button", { name: "Começar" }));

    await usuario.click(screen.getByRole("button", { name: /Central Analítica/ }));

    expect(screen.getByText("Tela da Central Analítica")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Voltar/ })).toBeInTheDocument();
  });

  it("selecionar o card do Relatório do Portal da Transparência abre o módulo e mostra o link de volta ao Hub", async () => {
    const usuario = userEvent.setup();
    render(<App />);
    await usuario.click(screen.getByRole("button", { name: "Começar" }));

    await usuario.click(screen.getByRole("button", { name: /Relatório do Portal da Transparência/ }));

    expect(screen.getByText("Tela do Relatório do Portal da Transparência")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Voltar/ })).toBeInTheDocument();
  });

  // Sprint (Loading/Bloqueio de Ações/Navegação Segura, item 4) — rótulo
  // visível trocado de "Hub" para "Voltar"; rota/ação/destino inalterados
  // (continua indo para o Hub).
  it("'Voltar' retorna ao Hub a partir de qualquer funcionalidade", async () => {
    const usuario = userEvent.setup();
    render(<App />);
    await usuario.click(screen.getByRole("button", { name: "Começar" }));
    await usuario.click(screen.getByRole("button", { name: /Central Inteligente de Conferência/ }));
    expect(screen.getByText("Tela de Conferência")).toBeInTheDocument();

    await usuario.click(screen.getByRole("button", { name: /Voltar/ }));

    expect(screen.getByText("Processamento da Planilha")).toBeInTheDocument();
    expect(screen.queryByText("Tela de Conferência")).not.toBeInTheDocument();
  });

  it("o Hub não mostra o link 'Voltar' (já está nele)", async () => {
    const usuario = userEvent.setup();
    render(<App />);
    await usuario.click(screen.getByRole("button", { name: "Começar" }));

    expect(screen.queryByRole("button", { name: /^Voltar$/ })).not.toBeInTheDocument();
  });
});

describe("App — gate de Configuração Inicial (Sprint 15)", () => {
  it("configurado:false bloqueia Boas-vindas e o Hub — só a Configuração Inicial aparece", () => {
    useConfiguracaoMock.mockReturnValue({
      estado: { configurado: false },
      atualizar: atualizarConfiguracaoMock,
    });

    render(<App />);

    expect(screen.getByRole("heading", { name: "Configuração inicial" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Começar" })).not.toBeInTheDocument();
  });

  it("estado ainda não carregado (null) não bloqueia — segue o fluxo normal", () => {
    useConfiguracaoMock.mockReturnValue({ estado: null, atualizar: atualizarConfiguracaoMock });

    render(<App />);

    expect(screen.getByRole("button", { name: "Começar" })).toBeInTheDocument();
  });

  it("planilha_acessivel:false NÃO bloqueia Boas-vindas/Hub — só a ação de preencher, dentro de Processamento (§7)", async () => {
    const usuario = userEvent.setup();
    useConfiguracaoMock.mockReturnValue({
      estado: {
        configurado: true,
        planilha_acessivel: false,
        caminho_pdfs_a_processar: null,
        caminho_pdfs_complemento_a_processar: null,
        caminho_pdfs_processados: null,
        caminho_pdfs_diarias_a_confirmar: null,
        prontidao_pastas: PRONTIDAO_PASTAS_VAZIA,
      },
      atualizar: atualizarConfiguracaoMock,
    });

    render(<App />);
    await usuario.click(screen.getByRole("button", { name: "Começar" }));

    expect(screen.getByText("Processamento da Planilha")).toBeInTheDocument();
  });

  it("o botão 'Configurações' do Cabecalho abre 'Alterar Planilha Oficial'", async () => {
    const usuario = userEvent.setup();
    render(<App />);
    await usuario.click(screen.getByRole("button", { name: "Começar" }));

    await usuario.click(screen.getByRole("button", { name: "Configurações" }));

    expect(screen.getByRole("dialog", { name: "Alterar Planilha Oficial" })).toBeInTheDocument();
  });
});

// Sprint (Loading/Bloqueio de Ações/Navegação Segura, item 14) — a
// FIAÇÃO de `App.tsx`: Voltar/Configurações passam pela função que
// `SelecionarProcessar` registra em vez de navegar direto. O
// comportamento profundo (diálogo, abort, cancelar/confirmar) já está
// coberto em `SelecionarProcessar.test.tsx` — aqui só a integração.
describe("App — Voltar/Configurações durante processamento (item 14)", () => {
  async function chegarNoProcessamento(usuario: ReturnType<typeof userEvent.setup>) {
    render(<App />);
    await usuario.click(screen.getByRole("button", { name: "Começar" }));
    await usuario.click(screen.getByRole("button", { name: /Processamento da Planilha/ }));
    expect(screen.getByText("Tela de Processamento")).toBeInTheDocument();
  }

  it("A) processamento ativo + Voltar não navega imediatamente", async () => {
    const usuario = userEvent.setup();
    await chegarNoProcessamento(usuario);
    await usuario.click(screen.getByRole("button", { name: "Simular processamento ativo" }));

    await usuario.click(screen.getByRole("button", { name: /Voltar/ }));

    expect(screen.getByText("Tela de Processamento")).toBeInTheDocument();
    expect(screen.queryByText("Processamento da Planilha")).not.toBeInTheDocument();
  });

  it("C) confirmar (simulado) conclui a interrupção e SÓ DEPOIS navega para o Hub", async () => {
    const usuario = userEvent.setup();
    await chegarNoProcessamento(usuario);
    await usuario.click(screen.getByRole("button", { name: "Simular processamento ativo" }));
    await usuario.click(screen.getByRole("button", { name: /Voltar/ }));
    expect(screen.getByText("Tela de Processamento")).toBeInTheDocument();

    await usuario.click(screen.getByRole("button", { name: "Confirmar interrupção (simulada)" }));

    expect(screen.getByText("Processamento da Planilha")).toBeInTheDocument();
    expect(screen.queryByText("Tela de Processamento")).not.toBeInTheDocument();
  });

  it("D) processamento ativo + Configurações tem o mesmo comportamento de segurança", async () => {
    const usuario = userEvent.setup();
    await chegarNoProcessamento(usuario);
    await usuario.click(screen.getByRole("button", { name: "Simular processamento ativo" }));

    await usuario.click(screen.getByRole("button", { name: "Configurações" }));
    expect(screen.queryByRole("dialog", { name: "Alterar Planilha Oficial" })).not.toBeInTheDocument();

    await usuario.click(screen.getByRole("button", { name: "Confirmar interrupção (simulada)" }));
    expect(screen.getByRole("dialog", { name: "Alterar Planilha Oficial" })).toBeInTheDocument();
  });

  it("F) sem processamento ativo, Voltar navega normalmente (já coberto acima, reafirmado aqui)", async () => {
    const usuario = userEvent.setup();
    await chegarNoProcessamento(usuario);

    await usuario.click(screen.getByRole("button", { name: /Voltar/ }));

    expect(screen.getByText("Processamento da Planilha")).toBeInTheDocument();
  });
});

// Sprint (Loading/Bloqueio de Ações/Navegação Segura, item 15) —
// confirmação ao fechar o app. `solicitarFechamentoCallback` simula o
// evento que o processo main dispara ao interceptar X/Alt+F4/`app.quit()`
// (cobertos estruturalmente em `electron/ipc/fechamento.test.ts` — um
// único handler nativo para os três, então a mesma confirmação vale para
// os três por construção).
describe("App — confirmação ao fechar o aplicativo (item 15)", () => {
  it("A) fechar sem operação ativa mostra a confirmação padrão", async () => {
    render(<App />);
    await act(async () => solicitarFechamentoCallback?.());

    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(screen.getByText("Tem certeza que deseja sair do aplicativo?")).toBeInTheDocument();
  });

  it("B) Cancelar fecha o diálogo e nunca confirma o fechamento", async () => {
    render(<App />);
    await act(async () => solicitarFechamentoCallback?.());

    await userEvent.setup().click(screen.getByRole("button", { name: "Cancelar" }));

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(confirmarFechamentoMock).not.toHaveBeenCalled();
  });

  it("C) Confirmar (sem operação ativa) chama window.api.confirmarFechamento na hora", async () => {
    render(<App />);
    await act(async () => solicitarFechamentoCallback?.());

    await userEvent.setup().click(screen.getByRole("button", { name: "Sair" }));

    expect(confirmarFechamentoMock).toHaveBeenCalledTimes(1);
  });

  it("D) fechar durante processamento mostra o aviso específico de operação em andamento", async () => {
    const usuario = userEvent.setup();
    render(<App />);
    await usuario.click(screen.getByRole("button", { name: "Começar" }));
    await usuario.click(screen.getByRole("button", { name: /Processamento da Planilha/ }));
    await usuario.click(screen.getByRole("button", { name: "Simular processamento ativo" }));

    await act(async () => solicitarFechamentoCallback?.());

    expect(screen.getByText("Operação em andamento")).toBeInTheDocument();
    expect(
      screen.getByText("Existe uma operação em andamento. Sair agora irá interrompê-la. Deseja realmente sair?"),
    ).toBeInTheDocument();
  });

  it("E) cancelar com operação ativa mantém o app aberto e o processamento continua", async () => {
    const usuario = userEvent.setup();
    render(<App />);
    await usuario.click(screen.getByRole("button", { name: "Começar" }));
    await usuario.click(screen.getByRole("button", { name: /Processamento da Planilha/ }));
    await usuario.click(screen.getByRole("button", { name: "Simular processamento ativo" }));
    await act(async () => solicitarFechamentoCallback?.());

    await usuario.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(confirmarFechamentoMock).not.toHaveBeenCalled();
    expect(screen.getByText("Tela de Processamento")).toBeInTheDocument();
  });

  it("F) confirmar com operação ativa interrompe primeiro (reaproveitando o mecanismo seguro) e só fecha depois", async () => {
    const usuario = userEvent.setup();
    render(<App />);
    await usuario.click(screen.getByRole("button", { name: "Começar" }));
    await usuario.click(screen.getByRole("button", { name: /Processamento da Planilha/ }));
    await usuario.click(screen.getByRole("button", { name: "Simular processamento ativo" }));
    await act(async () => solicitarFechamentoCallback?.());

    await usuario.click(screen.getByRole("button", { name: "Sair" }));
    // Ainda não fechou — a interrupção segura está "pendente" (simulada),
    // exatamente como Voltar/Configurações (item 14).
    expect(confirmarFechamentoMock).not.toHaveBeenCalled();

    await usuario.click(screen.getByRole("button", { name: "Confirmar interrupção (simulada)" }));

    expect(confirmarFechamentoMock).toHaveBeenCalledTimes(1);
  });
});
