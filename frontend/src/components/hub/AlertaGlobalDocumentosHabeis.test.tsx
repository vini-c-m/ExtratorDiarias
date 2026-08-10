// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import AlertaGlobalDocumentosHabeis from "./AlertaGlobalDocumentosHabeis";

vi.mock("../../services/api", async (importarOriginal) => {
  const original = await importarOriginal<typeof import("../../services/api")>();
  return {
    ...original,
    consultarEstadoSincronizacao: vi.fn(),
    dispararSincronizacaoManual: vi.fn(),
    obterDocumentosHabeisPendentes: vi.fn(),
  };
});

import {
  SincronizacaoEmAndamentoError,
  consultarEstadoSincronizacao,
  dispararSincronizacaoManual,
  obterDocumentosHabeisPendentes,
} from "../../services/api";

const consultarMock = vi.mocked(consultarEstadoSincronizacao);
const dispararMock = vi.mocked(dispararSincronizacaoManual);
const documentosMock = vi.mocked(obterDocumentosHabeisPendentes);

afterEach(() => {
  vi.clearAllMocks();
  cleanup();
});

const ESTADO_ATUALIZADO = {
  sincronizado_em: "2026-08-07T10:00:00",
  origem: "pos_preenchimento",
  possivelmente_desatualizado: false,
  total_avisos: 0,
  status: "atualizado" as const,
};

const RESUMO_SUCESSO = {
  status: "sucesso" as const,
  sincronizado_em: "2026-08-07T10:00:00",
  linhas_diarias: 10,
  linhas_servidores_lidos: 10,
  linhas_ignoradas: 0,
  total_avisos: 0,
};

const RESUMO_FALHA = {
  status: "falha" as const,
  sincronizado_em: null,
  linhas_diarias: null,
  linhas_servidores_lidos: null,
  linhas_ignoradas: null,
  total_avisos: null,
};

function documentos(revisaoManual: number, aguardando: number) {
  return {
    resumo: { aguardando_liberacao: aguardando, revisao_manual_necessaria: revisaoManual },
    registros:
      aguardando > 0
        ? [
            {
              sei: "19.20.0000.0000001/2026-01",
              servidor_nome: null,
              cpf_mascarado: null,
              periodo: { inicial: "2026-08-01", final: "2026-08-01" },
              destino: null,
              data_liberacao_prevista: "2026-08-10",
              situacao: "aguardando_liberacao" as const,
              dias_restantes: 1,
              dias_atraso: null,
              texto_contagem: "Liberação prevista para amanhã.",
              mensagem: "",
            },
          ]
        : [],
  };
}

// MS UX (2026-08-10) — `useSincronizacao` passou a disparar a sincronização
// automaticamente ao montar (mesmo item 7 aplicado à Central Analítica); a
// checagem condicional prévia ("só sincroniza se possivelmente
// desatualizado") saiu — agora é sempre sincronizado ao entrar, sem exceção.
describe("AlertaGlobalDocumentosHabeis", () => {
  it("enquanto sincroniza automaticamente, mostra o texto de atualização, nunca as pendências direto", () => {
    dispararMock.mockReturnValue(new Promise(() => {})); // nunca resolve nesta asserção

    render(<AlertaGlobalDocumentosHabeis backendOnline aoAbrirPendencias={vi.fn()} />);

    expect(screen.getByText(/Atualizando dados da Planilha Oficial/)).toBeInTheDocument();
    expect(screen.queryByText(/DOCUMENTOS HÁBEIS PENDENTES/)).not.toBeInTheDocument();
  });

  it("dispara sincronização automática ao montar, sempre — mesmo mecanismo do botão manual", async () => {
    dispararMock.mockResolvedValueOnce(RESUMO_SUCESSO);
    consultarMock.mockResolvedValue(ESTADO_ATUALIZADO);
    documentosMock.mockResolvedValueOnce(documentos(0, 0));

    render(<AlertaGlobalDocumentosHabeis backendOnline aoAbrirPendencias={vi.fn()} />);

    await screen.findByText("✓ Nenhum Documento Hábil exige atenção hoje.");
    expect(dispararMock).toHaveBeenCalledTimes(1);
  });

  it("sincronização automática com sucesso: consulta e exibe Documentos Hábeis Pendentes", async () => {
    dispararMock.mockResolvedValueOnce(RESUMO_SUCESSO);
    consultarMock.mockResolvedValue(ESTADO_ATUALIZADO);
    documentosMock.mockResolvedValueOnce(documentos(0, 0));

    render(<AlertaGlobalDocumentosHabeis backendOnline aoAbrirPendencias={vi.fn()} />);

    expect(await screen.findByText("✓ Nenhum Documento Hábil exige atenção hoje.")).toBeInTheDocument();
  });

  it("falha na sincronização automática: mostra fallback sem consultar Documentos Hábeis Pendentes", async () => {
    dispararMock.mockResolvedValueOnce(RESUMO_FALHA);
    consultarMock.mockResolvedValue({ ...ESTADO_ATUALIZADO, status: "possivelmente_desatualizado", possivelmente_desatualizado: true });

    render(<AlertaGlobalDocumentosHabeis backendOnline aoAbrirPendencias={vi.fn()} />);

    expect(await screen.findByText("BASE LOCAL PRECISA SER ATUALIZADA")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Não foi possível atualizar os dados automaticamente. Sincronize para verificar Documentos Hábeis pendentes.",
      ),
    ).toBeInTheDocument();
    expect(documentosMock).not.toHaveBeenCalled();
  });

  it("alerta com 1 DH pendente usa singular", async () => {
    dispararMock.mockResolvedValueOnce(RESUMO_SUCESSO);
    consultarMock.mockResolvedValue(ESTADO_ATUALIZADO);
    documentosMock.mockResolvedValueOnce(documentos(1, 0));

    render(<AlertaGlobalDocumentosHabeis backendOnline aoAbrirPendencias={vi.fn()} />);

    expect(
      await screen.findByText("1 processo atingiu a data de liberação e continua sem Documento Hábil."),
    ).toBeInTheDocument();
  });

  it("alerta com vários DHs pendentes usa plural", async () => {
    dispararMock.mockResolvedValueOnce(RESUMO_SUCESSO);
    consultarMock.mockResolvedValue(ESTADO_ATUALIZADO);
    documentosMock.mockResolvedValueOnce(documentos(3, 0));

    render(<AlertaGlobalDocumentosHabeis backendOnline aoAbrirPendencias={vi.fn()} />);

    expect(
      await screen.findByText(
        "3 processos atingiram a data de liberação e continuam sem Documento Hábil.",
      ),
    ).toBeInTheDocument();
  });

  it("sem revisão manual pendente mas com aguardando liberação: mostra linha informativa", async () => {
    dispararMock.mockResolvedValueOnce(RESUMO_SUCESSO);
    consultarMock.mockResolvedValue(ESTADO_ATUALIZADO);
    documentosMock.mockResolvedValueOnce(documentos(0, 1));

    render(<AlertaGlobalDocumentosHabeis backendOnline aoAbrirPendencias={vi.fn()} />);

    expect(
      await screen.findByText(/1 Documento Hábil aguardando data de liberação\..*Liberação prevista para amanhã\./),
    ).toBeInTheDocument();
  });

  it("sem nenhuma pendência: mensagem discreta de tudo certo", async () => {
    dispararMock.mockResolvedValueOnce(RESUMO_SUCESSO);
    consultarMock.mockResolvedValue(ESTADO_ATUALIZADO);
    documentosMock.mockResolvedValueOnce(documentos(0, 0));

    render(<AlertaGlobalDocumentosHabeis backendOnline aoAbrirPendencias={vi.fn()} />);

    expect(await screen.findByText("✓ Nenhum Documento Hábil exige atenção hoje.")).toBeInTheDocument();
  });

  it("botão 'Ver Pendências' aciona o callback de navegação", async () => {
    dispararMock.mockResolvedValueOnce(RESUMO_SUCESSO);
    consultarMock.mockResolvedValue(ESTADO_ATUALIZADO);
    documentosMock.mockResolvedValueOnce(documentos(2, 0));
    const aoAbrirPendencias = vi.fn();
    const usuario = userEvent.setup();

    render(<AlertaGlobalDocumentosHabeis backendOnline aoAbrirPendencias={aoAbrirPendencias} />);

    await usuario.click(await screen.findByRole("button", { name: "Ver Pendências" }));
    expect(aoAbrirPendencias).toHaveBeenCalledTimes(1);
  });

  it("botão 'Sincronizar Agora' no fallback usa o mesmo mecanismo existente e atualiza o alerta", async () => {
    dispararMock.mockResolvedValueOnce(RESUMO_FALHA);
    consultarMock.mockResolvedValue({ ...ESTADO_ATUALIZADO, status: "possivelmente_desatualizado", possivelmente_desatualizado: true });

    const usuario = userEvent.setup();
    render(<AlertaGlobalDocumentosHabeis backendOnline aoAbrirPendencias={vi.fn()} />);

    const botao = await screen.findByRole("button", { name: "Sincronizar Agora" });

    dispararMock.mockResolvedValueOnce(RESUMO_SUCESSO);
    consultarMock.mockResolvedValue(ESTADO_ATUALIZADO);
    documentosMock.mockResolvedValueOnce(documentos(0, 0));

    await usuario.click(botao);

    expect(await screen.findByText("✓ Nenhum Documento Hábil exige atenção hoje.")).toBeInTheDocument();
    expect(dispararMock).toHaveBeenCalledTimes(2);
  });

  it("proteção contra sincronização simultânea: 409 nunca vira falha, estado real prevalece", async () => {
    dispararMock.mockRejectedValueOnce(new SincronizacaoEmAndamentoError());
    consultarMock.mockResolvedValue(ESTADO_ATUALIZADO);
    documentosMock.mockResolvedValueOnce(documentos(0, 0));

    render(<AlertaGlobalDocumentosHabeis backendOnline aoAbrirPendencias={vi.fn()} />);

    expect(await screen.findByText("✓ Nenhum Documento Hábil exige atenção hoje.")).toBeInTheDocument();
    expect(screen.queryByText("BASE LOCAL PRECISA SER ATUALIZADA")).not.toBeInTheDocument();
  });

  it("backend offline: não renderiza nada", () => {
    render(<AlertaGlobalDocumentosHabeis backendOnline={false} aoAbrirPendencias={vi.fn()} />);
    expect(consultarMock).not.toHaveBeenCalled();
    expect(dispararMock).not.toHaveBeenCalled();
  });
});
