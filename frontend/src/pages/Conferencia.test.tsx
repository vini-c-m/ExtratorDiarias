// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Conferencia from "./Conferencia";
import { ErroConferenciaIndisponivel } from "../services/api";
import type { ResultadoConferencia } from "../types/conferencia";
import type { ConfiguracaoAtiva } from "../types/configuracao";

// Cadastro de Servidor/Membro (wiring em `Conferencia.tsx`) — mockado como
// um dublê interativo simples (mesmo padrão já usado em `App.test.tsx`
// para `SelecionarProcessar`): a cobertura do formulário/estados internos
// do modal já vive em `ModalCadastrarServidor.test.tsx`, este arquivo só
// prova a integração (quando o botão aparece, o CPF repassado, e o
// reconsultar automático via `onCpfResolvido`).
vi.mock("../components/conferencia/ModalCadastrarServidor", () => ({
  default: ({
    cpf,
    onFechar,
    onCpfResolvido,
  }: {
    cpf: string;
    onFechar: () => void;
    onCpfResolvido: (cpfFinal: string) => void;
  }) => (
    <div>
      <span>Modal de cadastro — CPF {cpf}</span>
      <button onClick={onFechar}>Fechar modal de cadastro</button>
      <button onClick={() => onCpfResolvido(cpf)}>Concluir cadastro (dublê)</button>
      {/* Simula o CPF editável (item 2/6 do pedido "Ajuste Funcional +
          UX"): o modal real pode resolver um CPF DIFERENTE do que foi
          originalmente pesquisado, quando o usuário corrige o valor
          antes de salvar. */}
      <button onClick={() => onCpfResolvido("22222222222")}>
        Concluir cadastro com CPF corrigido (dublê)
      </button>
    </div>
  ),
}));

// Sprint 13 — cobre o portão da Etapa 2 (só existe quando o veredito é
// APTO_PARA_PROCESSAMENTO ou quando o servidor escolhe "Prosseguir mesmo
// assim" com pendência exclusiva da janela do DH, nunca antes de conferir e
// nunca em REVISAR por outro motivo) e o estado de falha técnica (503 nunca
// vira um veredito de negócio).

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

vi.mock("../services/api", async (importarOriginal) => {
  const real = await importarOriginal<typeof import("../services/api")>();
  return {
    ...real,
    conferir: vi.fn(),
    gerarHistorico: vi.fn(),
    gerarHistoricoComplemento: vi.fn(),
    buscarCandidatosComplemento: vi.fn(),
    calcularValorDiaria: vi.fn(),
  };
});

import {
  buscarCandidatosComplemento,
  calcularValorDiaria,
  conferir,
  gerarHistorico,
  gerarHistoricoComplemento,
} from "../services/api";
import type { ResultadoValorDiaria } from "../types/conferencia";

const conferirMock = vi.mocked(conferir);
const gerarHistoricoMock = vi.mocked(gerarHistorico);
const gerarHistoricoComplementoMock = vi.mocked(gerarHistoricoComplemento);
const buscarCandidatosComplementoMock = vi.mocked(buscarCandidatosComplemento);
const calcularValorDiariaMock = vi.mocked(calcularValorDiaria);

// Micro-sprint A ("Valor Automático da Diária") — resultado padrão usado
// pelos testes já existentes (que não testam o Valor em si): sempre
// "calculado", nunca dispara loading/erro/confirmação de UF nos testes que
// não esperam por isso.
const VALOR_CALCULADO_PADRAO: ResultadoValorDiaria = {
  situacao: "calculado",
  categoria_funcional: "SERVIDOR",
  uf_destino: "PERNAMBUCO",
  valor_integral: "308.19",
  valor_parcial: "154.09",
  valor_total: "462.28",
  motivo: null,
  ufs_disponiveis: null,
};

const RESULTADO_APTO: ResultadoConferencia = {
  veredito: "APTO_PARA_PROCESSAMENTO",
  providencia: "Nenhuma — pronto para seguir",
  checklist: [
    { item: "cadastro_localizado", ok: true, valor: null },
    { item: "nome", ok: true, valor: "Maria Aparecida Souza" },
    { item: "cargo", ok: true, valor: "Analista Judiciário" },
    { item: "duplicidade", ok: true, valor: null },
    { item: "janela_processamento", ok: true, valor: null },
  ],
  servidor: { nome: "Maria Aparecida Souza", cargo: "Analista Judiciário", previdencia: "FUNAFIN" },
  duplicidade: null,
  janela_processamento: { liberado: true, data_liberacao: "2026-07-06" },
};

const RESULTADO_REVISAR: ResultadoConferencia = {
  veredito: "REVISAR",
  providencia: "Verifique se não é um caso de complemento de diária antes de prosseguir.",
  checklist: [
    { item: "cadastro_localizado", ok: true, valor: null },
    { item: "nome", ok: true, valor: "Maria Aparecida Souza" },
    { item: "cargo", ok: true, valor: "Analista Judiciário" },
    { item: "duplicidade", ok: false, valor: null },
    { item: "janela_processamento", ok: true, valor: null },
  ],
  servidor: { nome: "Maria Aparecida Souza", cargo: "Analista Judiciário", previdencia: "FUNAFIN" },
  duplicidade: {
    linha: 547,
    sei: "19.20.0902.0004521/2026-11",
    trecho: "RECIFE - GARANHUNS",
    periodo_inicial: "2026-07-21",
    periodo_final: "2026-07-23",
  },
  janela_processamento: { liberado: true, data_liberacao: "2026-07-06" },
};

// Bloco de refinamento (2026-08-06) — pendência exclusiva da janela do
// Documento Hábil: cadastro localizado, sem duplicidade, só a janela ainda
// não liberada.
const RESULTADO_REVISAR_APENAS_JANELA: ResultadoConferencia = {
  veredito: "REVISAR",
  providencia: "Aguardar até 05/08/2026 para dar continuidade.",
  checklist: [
    { item: "cadastro_localizado", ok: true, valor: null },
    { item: "nome", ok: true, valor: "Maria Aparecida Souza" },
    { item: "cargo", ok: true, valor: "Analista Judiciário" },
    { item: "duplicidade", ok: true, valor: null },
    { item: "janela_processamento", ok: false, valor: null },
  ],
  servidor: { nome: "Maria Aparecida Souza", cargo: "Analista Judiciário", previdencia: "FUNAFIN" },
  duplicidade: null,
  janela_processamento: { liberado: false, data_liberacao: "2026-08-05" },
};

// Cadastro de Servidor/Membro — CPF consultado e NÃO localizado na aba
// Dados (`cadastro_localizado.ok: false`), o único gatilho da ação.
const RESULTADO_REVISAR_CADASTRO_AUSENTE: ResultadoConferencia = {
  veredito: "REVISAR",
  providencia: "Servidor não cadastrado — verifique antes de prosseguir.",
  checklist: [
    { item: "cadastro_localizado", ok: false, valor: null },
    { item: "nome", ok: false, valor: null },
    { item: "cargo", ok: false, valor: null },
    { item: "duplicidade", ok: true, valor: null },
    { item: "janela_processamento", ok: true, valor: null },
  ],
  servidor: null,
  duplicidade: null,
  janela_processamento: { liberado: true, data_liberacao: "2026-07-06" },
};

const CONFIGURACAO_ATIVA: ConfiguracaoAtiva = {
  configurado: true,
  planilha_acessivel: true,
  requer_revalidacao: false,
  caminho_planilha_oficial: "C:\\planilha-oficial.xlsx",
  configurado_em: "2026-08-01T10:00:00",
};

beforeEach(() => {
  window.api = {
    getPathForFile: (arquivo: File) => arquivo.name,
    abrirArquivo: vi.fn(),
    salvarComo: vi.fn(),
    salvarRelatorio: vi.fn(),
    copiarHistorico: vi.fn(),
    selecionarPlanilhaOficial: vi.fn(),
    copiarTexto: vi.fn(),
  };
  buscarCandidatosComplementoMock.mockResolvedValue([]);
  calcularValorDiariaMock.mockResolvedValue(VALOR_CALCULADO_PADRAO);
});

async function preencherEConferir(usuario: ReturnType<typeof userEvent.setup>) {
  await usuario.type(screen.getByLabelText("CPF do servidor"), "12345678901");
  fireEvent.change(screen.getByLabelText("Período inicial"), { target: { value: "2026-07-21" } });
  fireEvent.change(screen.getByLabelText("Período final"), { target: { value: "2026-07-23" } });
  await usuario.click(screen.getByRole("button", { name: "Realizar Conferência" }));
}

describe("Conferencia — portão da Etapa 2", () => {
  it("não mostra 'Gerar Histórico' antes de qualquer conferência", () => {
    render(<Conferencia backendOnline />);
    expect(screen.queryByText("Gerar Histórico para o e-Fisco")).not.toBeInTheDocument();
  });

  it("veredito APTO revela a Etapa 2 só depois da conferência", async () => {
    const usuario = userEvent.setup();
    conferirMock.mockResolvedValue(RESULTADO_APTO);

    render(<Conferencia backendOnline />);
    expect(screen.queryByText("Gerar Histórico para o e-Fisco")).not.toBeInTheDocument();

    await preencherEConferir(usuario);

    expect(await screen.findByText("APTO PARA PROCESSAMENTO")).toBeInTheDocument();
    expect(screen.getByText("Gerar Histórico para o e-Fisco")).toBeInTheDocument();
  });

  it("veredito REVISAR nunca revela a Etapa 2", async () => {
    const usuario = userEvent.setup();
    conferirMock.mockResolvedValue(RESULTADO_REVISAR);

    render(<Conferencia backendOnline />);
    await preencherEConferir(usuario);

    expect(await screen.findByText("REVISAR")).toBeInTheDocument();
    expect(screen.queryByText("Gerar Histórico para o e-Fisco")).not.toBeInTheDocument();
  });

  it("falha técnica (503) mostra alerta de erro, nunca um veredito", async () => {
    const usuario = userEvent.setup();
    conferirMock.mockRejectedValue(new ErroConferenciaIndisponivel());

    render(<Conferencia backendOnline />);
    await preencherEConferir(usuario);

    expect(
      await screen.findByText(/Não foi possível acessar os registros administrativos/),
    ).toBeInTheDocument();
    expect(screen.queryByText("APTO PARA PROCESSAMENTO")).not.toBeInTheDocument();
    expect(screen.queryByText("REVISAR")).not.toBeInTheDocument();
  });
});

describe("Conferencia — prosseguir mesmo assim antes da liberação do DH (2026-08-06)", () => {
  it("oferece 'Voltar'/'Prosseguir mesmo assim' quando a única pendência é a janela, sem revelar a Etapa 2 direto", async () => {
    const usuario = userEvent.setup();
    conferirMock.mockResolvedValue(RESULTADO_REVISAR_APENAS_JANELA);

    render(<Conferencia backendOnline />);
    await preencherEConferir(usuario);

    expect(await screen.findByText("REVISAR")).toBeInTheDocument();
    expect(screen.getByText("O Documento Hábil ainda não foi liberado")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Voltar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Prosseguir mesmo assim" })).toBeInTheDocument();
    expect(screen.queryByText("Gerar Histórico para o e-Fisco")).not.toBeInTheDocument();
  });

  it("'Prosseguir mesmo assim' revela a Etapa 2 sem alterar o veredito", async () => {
    const usuario = userEvent.setup();
    conferirMock.mockResolvedValue(RESULTADO_REVISAR_APENAS_JANELA);

    render(<Conferencia backendOnline />);
    await preencherEConferir(usuario);
    await screen.findByText("O Documento Hábil ainda não foi liberado");

    await usuario.click(screen.getByRole("button", { name: "Prosseguir mesmo assim" }));

    expect(screen.getByText("Gerar Histórico para o e-Fisco")).toBeInTheDocument();
    expect(screen.getByText("REVISAR")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Prosseguir mesmo assim" }),
    ).not.toBeInTheDocument();
  });

  it("'Voltar' limpa o diagnóstico, sem revelar a Etapa 2", async () => {
    const usuario = userEvent.setup();
    conferirMock.mockResolvedValue(RESULTADO_REVISAR_APENAS_JANELA);

    render(<Conferencia backendOnline />);
    await preencherEConferir(usuario);
    await screen.findByText("O Documento Hábil ainda não foi liberado");

    await usuario.click(screen.getByRole("button", { name: "Voltar" }));

    expect(screen.queryByText("REVISAR")).not.toBeInTheDocument();
    expect(screen.queryByText("O Documento Hábil ainda não foi liberado")).not.toBeInTheDocument();
    expect(screen.queryByText("Gerar Histórico para o e-Fisco")).not.toBeInTheDocument();
  });

  it("REVISAR por duplicidade não oferece 'Prosseguir mesmo assim'", async () => {
    const usuario = userEvent.setup();
    conferirMock.mockResolvedValue(RESULTADO_REVISAR);

    render(<Conferencia backendOnline />);
    await preencherEConferir(usuario);

    expect(await screen.findByText("REVISAR")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Prosseguir mesmo assim" })).not.toBeInTheDocument();
  });
});

describe("Conferencia — validação de entrada (Sprint 13.1)", () => {
  it("bloqueia 'Realizar Conferência' quando período final é anterior ao inicial", async () => {
    render(<Conferencia backendOnline />);

    await userEvent.type(screen.getByLabelText("CPF do servidor"), "12345678901");
    fireEvent.change(screen.getByLabelText("Período inicial"), { target: { value: "2026-07-23" } });
    fireEvent.change(screen.getByLabelText("Período final"), { target: { value: "2026-07-21" } });

    expect(
      await screen.findByText("Período final não pode ser anterior ao período inicial."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Realizar Conferência" })).toBeDisabled();
    expect(conferirMock).not.toHaveBeenCalled();
  });

  it("bloqueia 'Gerar Histórico' enquanto SEI ou Destino estiverem vazios", async () => {
    const usuario = userEvent.setup();
    conferirMock.mockResolvedValue(RESULTADO_APTO);

    render(<Conferencia backendOnline />);
    await preencherEConferir(usuario);
    await screen.findByText("Gerar Histórico para o e-Fisco");

    expect(screen.getByRole("button", { name: "Gerar Histórico" })).toBeDisabled();

    await usuario.type(screen.getByLabelText("Número do SEI"), "19.20.0000.0000000/2026-00");
    expect(screen.getByRole("button", { name: "Gerar Histórico" })).toBeDisabled();

    await usuario.type(screen.getByLabelText("Destino"), "Garanhuns");
    expect(screen.getByRole("button", { name: "Gerar Histórico" })).toBeEnabled();
    expect(gerarHistoricoMock).not.toHaveBeenCalled();
  });

  it("Etapa 2 não pede mais Origem (correção de 2026-08-05)", async () => {
    const usuario = userEvent.setup();
    conferirMock.mockResolvedValue(RESULTADO_APTO);

    render(<Conferencia backendOnline />);
    await preencherEConferir(usuario);
    await screen.findByText("Gerar Histórico para o e-Fisco");

    expect(screen.queryByLabelText("Origem")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Destino")).toBeInTheDocument();
  });
});

describe("Conferencia — geração e cópia do histórico", () => {
  it("botão 'Copiar Histórico' chama window.api.copiarHistorico com o texto gerado", async () => {
    const usuario = userEvent.setup();
    conferirMock.mockResolvedValue(RESULTADO_APTO);
    gerarHistoricoMock.mockResolvedValue("19.20.0000.0000000/2026-00 MARIA APARECIDA SOUZA TEXTO");

    render(<Conferencia backendOnline />);
    await preencherEConferir(usuario);
    await screen.findByText("Gerar Histórico para o e-Fisco");

    await usuario.type(screen.getByLabelText("Número do SEI"), "19.20.0000.0000000/2026-00");
    await usuario.type(screen.getByLabelText("Destino"), "Garanhuns");
    await usuario.click(screen.getByRole("button", { name: "Gerar Histórico" }));

    await screen.findByText("19.20.0000.0000000/2026-00 MARIA APARECIDA SOUZA TEXTO");
    expect(gerarHistoricoMock).toHaveBeenCalledWith(
      "12345678901",
      "2026-07-21",
      "2026-07-23",
      "19.20.0000.0000000/2026-00",
      "Garanhuns",
    );

    await usuario.click(screen.getByRole("button", { name: /Copiar Histórico/ }));

    expect(window.api.copiarHistorico).toHaveBeenCalledWith(
      "19.20.0000.0000000/2026-00 MARIA APARECIDA SOUZA TEXTO",
    );
  });
});

// RN-14 — o backend, em modo Complemento, já devolve APTO mesmo com
// duplicidade encontrada (a duplicidade continua no campo `duplicidade`
// para exibição, só não bloqueia mais o veredito).
const RESULTADO_APTO_COMPLEMENTO: ResultadoConferencia = {
  ...RESULTADO_APTO,
  duplicidade: RESULTADO_REVISAR.duplicidade,
};

describe("Conferencia — Modo Complemento de Diárias (RN-14)", () => {
  it("botão alterna o rótulo e envia modo=COMPLEMENTO para conferir()", async () => {
    const usuario = userEvent.setup();
    conferirMock.mockResolvedValue(RESULTADO_APTO_COMPLEMENTO);

    render(<Conferencia backendOnline />);
    await usuario.click(screen.getByRole("button", { name: "Modo Complemento de Diárias" }));
    expect(
      screen.getByRole("button", { name: "Modo Complemento de Diárias (ativo)" }),
    ).toBeInTheDocument();

    await preencherEConferir(usuario);

    expect(conferirMock).toHaveBeenCalledWith("12345678901", "2026-07-21", "2026-07-23", "COMPLEMENTO");
  });

  it("exibe aviso de que a duplicidade não bloqueia mais o resultado", async () => {
    const usuario = userEvent.setup();
    render(<Conferencia backendOnline />);

    await usuario.click(screen.getByRole("button", { name: "Modo Complemento de Diárias" }));

    expect(
      screen.getByText(/duplicidade deixa de bloquear o resultado/),
    ).toBeInTheDocument();
  });

  it("mostra o painel de Continuidade Processual com os candidatos encontrados", async () => {
    const usuario = userEvent.setup();
    conferirMock.mockResolvedValue(RESULTADO_APTO_COMPLEMENTO);
    buscarCandidatosComplementoMock.mockResolvedValue([
      {
        registro: {
          sei: "19.20.0001.0004758/2026-36",
          dh: "2026DH900453",
          periodo_inicial: "2026-03-17",
          periodo_final: "2026-03-19",
          cidade_origem: "Ouricuri",
          cidade_destino: "Recife",
          motivo: "Recolhimento de material",
          valor_total_diarias: 154.09,
          linha_planilha: 457,
          servidor_nome: "Roberto Alves Ferreira",
        },
        evidencias: ["Período coincide ou é próximo: diária já lançada 2026-03-17 a 2026-03-19."],
      },
    ]);

    render(<Conferencia backendOnline />);
    await usuario.click(screen.getByRole("button", { name: "Modo Complemento de Diárias" }));
    await preencherEConferir(usuario);

    expect(await screen.findByText("Continuidade Processual")).toBeInTheDocument();
    expect(await screen.findByText("Roberto Alves Ferreira")).toBeInTheDocument();
    expect(screen.getByText(/Período coincide ou é próximo/)).toBeInTheDocument();
    expect(buscarCandidatosComplementoMock).toHaveBeenCalledWith(
      "12345678901",
      "2026-07-21",
      "2026-07-23",
    );
  });

  it("Etapa 2 usa o título 'Gerar Histórico de Complemento' e chama gerarHistoricoComplemento", async () => {
    const usuario = userEvent.setup();
    conferirMock.mockResolvedValue(RESULTADO_APTO_COMPLEMENTO);
    gerarHistoricoComplementoMock.mockResolvedValue("TEXTO (COMPLEMENTO DE DIÁRIAS).");

    render(<Conferencia backendOnline />);
    await usuario.click(screen.getByRole("button", { name: "Modo Complemento de Diárias" }));
    await preencherEConferir(usuario);
    await screen.findByText("Gerar Histórico de Complemento");

    await usuario.type(screen.getByLabelText("Número do SEI"), "19.20.0001.0004758/2026-36");
    await usuario.type(screen.getByLabelText("Destino"), "Recife");
    await usuario.click(screen.getByRole("button", { name: "Gerar Histórico" }));

    await screen.findByText("TEXTO (COMPLEMENTO DE DIÁRIAS).");
    expect(gerarHistoricoComplementoMock).toHaveBeenCalledWith(
      "12345678901",
      "2026-07-21",
      "2026-07-23",
      "19.20.0001.0004758/2026-36",
      "Recife",
      // P1 (Sprint pré-build, 2026-08-11) — checkbox "parcial isolada"
      // desmarcado por padrão: undefined preserva o padrão institucional
      // (0) aplicado no backend.
      undefined,
    );
    expect(gerarHistoricoMock).not.toHaveBeenCalled();
  });

  it("P1 — marcar 'parcial isolada' envia quantidade_diaria_parcial=1 ao gerar o histórico de Complemento", async () => {
    const usuario = userEvent.setup();
    conferirMock.mockResolvedValue(RESULTADO_APTO_COMPLEMENTO);
    gerarHistoricoComplementoMock.mockResolvedValue("...UMA PARCIAL, DEST. RECIFE...");

    render(<Conferencia backendOnline />);
    await usuario.click(screen.getByRole("button", { name: "Modo Complemento de Diárias" }));
    await preencherEConferir(usuario);
    await screen.findByText("Gerar Histórico de Complemento");

    await usuario.type(screen.getByLabelText("Número do SEI"), "19.20.0001.0004758/2026-36");
    await usuario.type(screen.getByLabelText("Destino"), "Recife");
    await usuario.click(
      screen.getByLabelText("Esta simulação representa uma parcial isolada (sem diária integral)"),
    );
    await usuario.click(screen.getByRole("button", { name: "Gerar Histórico" }));

    await screen.findByText("...UMA PARCIAL, DEST. RECIFE...");
    expect(gerarHistoricoComplementoMock).toHaveBeenCalledWith(
      "12345678901",
      "2026-07-21",
      "2026-07-23",
      "19.20.0001.0004758/2026-36",
      "Recife",
      1,
    );
  });

  it("P1 — o checkbox de parcial isolada nunca aparece no fluxo Padrão", async () => {
    const usuario = userEvent.setup();
    conferirMock.mockResolvedValue(RESULTADO_APTO);

    render(<Conferencia backendOnline />);
    await preencherEConferir(usuario);
    await screen.findByText("Gerar Histórico para o e-Fisco");

    expect(
      screen.queryByLabelText("Esta simulação representa uma parcial isolada (sem diária integral)"),
    ).not.toBeInTheDocument();
  });

  it("desativar o modo Complemento volta ao fluxo Padrão normalmente", async () => {
    const usuario = userEvent.setup();
    conferirMock.mockResolvedValue(RESULTADO_APTO);

    render(<Conferencia backendOnline />);
    await usuario.click(screen.getByRole("button", { name: "Modo Complemento de Diárias" }));
    await usuario.click(screen.getByRole("button", { name: "Modo Complemento de Diárias (ativo)" }));

    await preencherEConferir(usuario);

    expect(conferirMock).toHaveBeenCalledWith("12345678901", "2026-07-21", "2026-07-23", "PADRAO");
    expect(await screen.findByText("Gerar Histórico para o e-Fisco")).toBeInTheDocument();
    expect(screen.queryByText("Continuidade Processual")).not.toBeInTheDocument();
  });
});

describe("Conferencia — Cadastro de Servidor/Membro (wiring com ChecklistConferencia/ModalCadastrarServidor)", () => {
  it("A) mostra 'Cadastrar servidor/membro' quando o CPF não é localizado e a Planilha Oficial está disponível", async () => {
    const usuario = userEvent.setup();
    conferirMock.mockResolvedValue(RESULTADO_REVISAR_CADASTRO_AUSENTE);

    render(<Conferencia backendOnline configuracaoAtiva={CONFIGURACAO_ATIVA} />);
    await preencherEConferir(usuario);

    expect(await screen.findByText("REVISAR")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cadastrar servidor/membro" })).toBeInTheDocument();
  });

  it("B) não mostra a ação quando o cadastro já foi localizado", async () => {
    const usuario = userEvent.setup();
    conferirMock.mockResolvedValue(RESULTADO_APTO);

    render(<Conferencia backendOnline configuracaoAtiva={CONFIGURACAO_ATIVA} />);
    await preencherEConferir(usuario);

    expect(await screen.findByText("APTO PARA PROCESSAMENTO")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cadastrar servidor/membro" })).not.toBeInTheDocument();
  });

  it("item 12 — não mostra a ação quando a Planilha Oficial não está disponível para escrita", async () => {
    const usuario = userEvent.setup();
    conferirMock.mockResolvedValue(RESULTADO_REVISAR_CADASTRO_AUSENTE);

    render(<Conferencia backendOnline configuracaoAtiva={{ configurado: false }} />);
    await preencherEConferir(usuario);

    expect(await screen.findByText("REVISAR")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cadastrar servidor/membro" })).not.toBeInTheDocument();
  });

  it("item 12 — não mostra a ação quando a planilha exige revalidação", async () => {
    const usuario = userEvent.setup();
    conferirMock.mockResolvedValue(RESULTADO_REVISAR_CADASTRO_AUSENTE);

    render(
      <Conferencia
        backendOnline
        configuracaoAtiva={{ ...CONFIGURACAO_ATIVA, requer_revalidacao: true }}
      />,
    );
    await preencherEConferir(usuario);

    expect(await screen.findByText("REVISAR")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cadastrar servidor/membro" })).not.toBeInTheDocument();
  });

  it("abre o modal com o CPF já consultado ao clicar em 'Cadastrar servidor/membro'", async () => {
    const usuario = userEvent.setup();
    conferirMock.mockResolvedValue(RESULTADO_REVISAR_CADASTRO_AUSENTE);

    render(<Conferencia backendOnline configuracaoAtiva={CONFIGURACAO_ATIVA} />);
    await preencherEConferir(usuario);
    await usuario.click(await screen.findByRole("button", { name: "Cadastrar servidor/membro" }));

    expect(screen.getByText("Modal de cadastro — CPF 12345678901")).toBeInTheDocument();
  });

  it("O) ao concluir o cadastro, fecha o modal e reconsulta o MESMO CPF/período — nunca aceita um resultado montado no frontend (RN-11)", async () => {
    const usuario = userEvent.setup();
    conferirMock
      .mockResolvedValueOnce(RESULTADO_REVISAR_CADASTRO_AUSENTE)
      .mockResolvedValueOnce(RESULTADO_APTO);

    render(<Conferencia backendOnline configuracaoAtiva={CONFIGURACAO_ATIVA} />);
    await preencherEConferir(usuario);
    await usuario.click(await screen.findByRole("button", { name: "Cadastrar servidor/membro" }));

    await usuario.click(screen.getByRole("button", { name: "Concluir cadastro (dublê)" }));

    expect(screen.queryByText(/Modal de cadastro/)).not.toBeInTheDocument();
    expect(conferirMock).toHaveBeenCalledTimes(2);
    expect(conferirMock).toHaveBeenNthCalledWith(2, "12345678901", "2026-07-21", "2026-07-23", "PADRAO");
    expect(await screen.findByText("APTO PARA PROCESSAMENTO")).toBeInTheDocument();
  });

  it("item 6 do pedido 'Ajuste Funcional + UX': CPF corrigido no modal — reconsulta usa o CPF FINAL salvo, nunca o originalmente pesquisado", async () => {
    const usuario = userEvent.setup();
    conferirMock
      .mockResolvedValueOnce(RESULTADO_REVISAR_CADASTRO_AUSENTE)
      .mockResolvedValueOnce(RESULTADO_APTO);

    render(<Conferencia backendOnline configuracaoAtiva={CONFIGURACAO_ATIVA} />);
    await preencherEConferir(usuario); // pesquisa 12345678901
    await usuario.click(await screen.findByRole("button", { name: "Cadastrar servidor/membro" }));

    // No modal real, o usuário teria corrigido o CPF de 12345678901 para
    // 22222222222 antes de salvar — o dublê simula exatamente esse
    // resultado via `onCpfResolvido("22222222222")`.
    await usuario.click(
      screen.getByRole("button", { name: "Concluir cadastro com CPF corrigido (dublê)" }),
    );

    expect(conferirMock).toHaveBeenCalledTimes(2);
    expect(conferirMock).toHaveBeenNthCalledWith(2, "22222222222", "2026-07-21", "2026-07-23", "PADRAO");
    expect(await screen.findByText("APTO PARA PROCESSAMENTO")).toBeInTheDocument();

    // O campo de busca da tela também reflete o CPF final — nunca fica
    // "preso" mostrando o CPF antigo enquanto o resultado já é do novo.
    expect(screen.getByLabelText("CPF do servidor")).toHaveValue("22222222222");
  });

  it("'Fechar' no modal fecha sem reconsultar", async () => {
    const usuario = userEvent.setup();
    conferirMock.mockResolvedValue(RESULTADO_REVISAR_CADASTRO_AUSENTE);

    render(<Conferencia backendOnline configuracaoAtiva={CONFIGURACAO_ATIVA} />);
    await preencherEConferir(usuario);
    await usuario.click(await screen.findByRole("button", { name: "Cadastrar servidor/membro" }));

    await usuario.click(screen.getByRole("button", { name: "Fechar modal de cadastro" }));

    expect(screen.queryByText(/Modal de cadastro/)).not.toBeInTheDocument();
    expect(conferirMock).toHaveBeenCalledTimes(1);
  });
});

async function gerarHistoricoAte(usuario: ReturnType<typeof userEvent.setup>, textoEsperado: string) {
  conferirMock.mockResolvedValue(RESULTADO_APTO);
  gerarHistoricoMock.mockResolvedValue(textoEsperado);

  render(<Conferencia backendOnline />);
  await preencherEConferir(usuario);
  await screen.findByText("Gerar Histórico para o e-Fisco");

  await usuario.type(screen.getByLabelText("Número do SEI"), "19.20.0000.0000000/2026-00");
  await usuario.type(screen.getByLabelText("Destino"), "Garanhuns");
  await usuario.click(screen.getByRole("button", { name: "Gerar Histórico" }));

  await screen.findByText(textoEsperado);
}

describe("Conferencia — Valor Automático da Diária (Micro-sprint A)", () => {
  it("exibe o valor calculado formatado (vírgula, sem 'R$') junto do Histórico", async () => {
    const usuario = userEvent.setup();
    await gerarHistoricoAte(usuario, "TEXTO DO HISTORICO");

    expect(await screen.findByText("462,28")).toBeInTheDocument();
    expect(calcularValorDiariaMock).toHaveBeenCalledWith(
      "12345678901",
      "2026-07-21",
      "2026-07-23",
      "Garanhuns",
      { ufConfirmada: undefined, modo: "PADRAO", quantidadeDiariaParcial: undefined },
    );
  });

  it("botão 'Copiar Valor' copia só o número via window.api.copiarTexto, nunca 'R$' nem rótulo", async () => {
    const usuario = userEvent.setup();
    await gerarHistoricoAte(usuario, "TEXTO DO HISTORICO");
    await screen.findByText("462,28");

    await usuario.click(screen.getByRole("button", { name: /Copiar Valor/ }));

    expect(window.api.copiarTexto).toHaveBeenCalledWith("462,28");
  });

  it("falha ao calcular o valor NUNCA apaga/impede o Histórico já gerado", async () => {
    const usuario = userEvent.setup();
    // `mensagemAmigavel` usa `erro.message` quando não bate com nenhum
    // padrão técnico conhecido (ver `lib/mensagens.ts`) — texto arbitrário
    // aqui só para provar que ele chega até a tela, nunca some.
    calcularValorDiariaMock.mockRejectedValue(new Error("falha de rede"));

    await gerarHistoricoAte(usuario, "TEXTO DO HISTORICO PRESERVADO");

    expect(screen.getByText("TEXTO DO HISTORICO PRESERVADO")).toBeInTheDocument();
    expect(await screen.findByText("falha de rede")).toBeInTheDocument();
  });

  it("Membro: mostra que o valor automático não está disponível, sem caixa de valor", async () => {
    const usuario = userEvent.setup();
    calcularValorDiariaMock.mockResolvedValue({
      situacao: "indisponivel_para_categoria",
      categoria_funcional: "MEMBRO",
      uf_destino: null,
      valor_integral: null,
      valor_parcial: null,
      valor_total: null,
      motivo: "Valor automático disponível apenas para diárias de Servidor nesta consulta.",
      ufs_disponiveis: null,
    });

    await gerarHistoricoAte(usuario, "TEXTO DO HISTORICO");

    expect(
      await screen.findByText(/Valor automático disponível apenas para diárias de Servidor/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Copiar Valor/ })).not.toBeInTheDocument();
  });

  it("UF ambígua/não resolvida oferece decisão humana — nunca escolhe silenciosamente", async () => {
    const usuario = userEvent.setup();
    calcularValorDiariaMock.mockResolvedValue({
      situacao: "uf_nao_resolvida",
      categoria_funcional: "SERVIDOR",
      uf_destino: null,
      valor_integral: null,
      valor_parcial: null,
      valor_total: null,
      motivo: "Cidade de destino existe em mais de um estado.",
      ufs_disponiveis: ["ACRE", "MATO GROSSO"],
    });

    await gerarHistoricoAte(usuario, "TEXTO DO HISTORICO");

    expect(
      await screen.findByText(/Não foi possível determinar com segurança a UF de destino/),
    ).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Confirme a UF de destino" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Copiar Valor/ })).not.toBeInTheDocument();
  });

  it("após confirmar a UF manualmente, recalcula e mostra o valor", async () => {
    const usuario = userEvent.setup();
    calcularValorDiariaMock.mockResolvedValueOnce({
      situacao: "uf_nao_resolvida",
      categoria_funcional: "SERVIDOR",
      uf_destino: null,
      valor_integral: null,
      valor_parcial: null,
      valor_total: null,
      motivo: "Cidade de destino existe em mais de um estado.",
      ufs_disponiveis: ["ACRE", "MATO GROSSO"],
    });

    await gerarHistoricoAte(usuario, "TEXTO DO HISTORICO");
    await screen.findByRole("combobox", { name: "Confirme a UF de destino" });

    calcularValorDiariaMock.mockResolvedValueOnce({
      situacao: "calculado",
      categoria_funcional: "SERVIDOR",
      uf_destino: "ACRE",
      valor_integral: "539.33",
      valor_parcial: "308.19",
      valor_total: "847.52",
      motivo: null,
      ufs_disponiveis: null,
    });

    await usuario.click(screen.getByRole("combobox", { name: "Confirme a UF de destino" }));
    await usuario.click(screen.getByRole("option", { name: "ACRE" }));
    await usuario.click(screen.getByRole("button", { name: "Confirmar" }));

    expect(await screen.findByText("847,52")).toBeInTheDocument();
    expect(calcularValorDiariaMock).toHaveBeenLastCalledWith(
      "12345678901",
      "2026-07-21",
      "2026-07-23",
      "Garanhuns",
      { ufConfirmada: "ACRE", modo: "PADRAO", quantidadeDiariaParcial: undefined },
    );
  });

  it("modo Complemento envia modo=COMPLEMENTO ao calcular o valor", async () => {
    const usuario = userEvent.setup();
    conferirMock.mockResolvedValue(RESULTADO_APTO_COMPLEMENTO);
    gerarHistoricoComplementoMock.mockResolvedValue("TEXTO (COMPLEMENTO DE DIÁRIAS).");

    render(<Conferencia backendOnline />);
    await usuario.click(screen.getByRole("button", { name: "Modo Complemento de Diárias" }));
    await preencherEConferir(usuario);
    await screen.findByText("Gerar Histórico de Complemento");

    await usuario.type(screen.getByLabelText("Número do SEI"), "19.20.0001.0004758/2026-36");
    await usuario.type(screen.getByLabelText("Destino"), "Recife");
    await usuario.click(screen.getByRole("button", { name: "Gerar Histórico" }));

    await screen.findByText("TEXTO (COMPLEMENTO DE DIÁRIAS).");
    expect(calcularValorDiariaMock).toHaveBeenCalledWith(
      "12345678901",
      "2026-07-21",
      "2026-07-23",
      "Recife",
      { ufConfirmada: undefined, modo: "COMPLEMENTO", quantidadeDiariaParcial: undefined },
    );
  });
});
