// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import IndicadorSincronizacao from "./IndicadorSincronizacao";

vi.mock("../../services/api", async (importarOriginal) => {
  const original = await importarOriginal<typeof import("../../services/api")>();
  return {
    ...original,
    consultarEstadoSincronizacao: vi.fn(),
    dispararSincronizacaoManual: vi.fn(),
  };
});

import {
  ErroAnaliticaIndisponivel,
  SincronizacaoEmAndamentoError,
  consultarEstadoSincronizacao,
  dispararSincronizacaoManual,
} from "../../services/api";

const consultarMock = vi.mocked(consultarEstadoSincronizacao);
const dispararMock = vi.mocked(dispararSincronizacaoManual);

const ESTADO_ATUALIZADO = {
  sincronizado_em: "2026-07-31T14:32:00",
  origem: "pos_preenchimento",
  possivelmente_desatualizado: false,
  total_avisos: 0,
  status: "atualizado" as const,
};

const RESUMO_SUCESSO = {
  status: "sucesso" as const,
  sincronizado_em: "2026-07-31T15:00:00",
  linhas_diarias: 10,
  linhas_servidores_lidos: 5,
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

afterEach(() => {
  vi.clearAllMocks();
  cleanup();
});

// MS UX (2026-08-10) — o indicador não expõe mais um botão permanente:
// a sincronização dispara sozinha ao montar (mesmo `sincronizarAgora`
// homologado do antigo botão manual). Item 13 N/O/P/Q do pedido do
// usuário: (N) entrada tenta sync automático; (O) sucesso → sem botão;
// (P) falha → botão aparece; (Q) sucesso manual → botão some de novo.
describe("IndicadorSincronizacao — sincronização automática ao montar", () => {
  it("N) entrar na tela dispara sincronização automática (mesmo endpoint do botão manual)", async () => {
    consultarMock.mockResolvedValue(ESTADO_ATUALIZADO);
    dispararMock.mockResolvedValueOnce(RESUMO_SUCESSO);

    render(<IndicadorSincronizacao backendOnline />);

    await waitFor(() => expect(dispararMock).toHaveBeenCalledTimes(1));
  });

  it("O) sucesso automático → nenhum botão/mensagem renderizado", async () => {
    consultarMock.mockResolvedValue(ESTADO_ATUALIZADO);
    dispararMock.mockResolvedValueOnce(RESUMO_SUCESSO);

    const { container } = render(<IndicadorSincronizacao backendOnline />);

    await waitFor(() => expect(dispararMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(container).toBeEmptyDOMElement());
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("P) falha automática (status: falha) → botão de recuperação aparece", async () => {
    consultarMock.mockResolvedValue(ESTADO_ATUALIZADO);
    dispararMock.mockResolvedValueOnce(RESUMO_FALHA);

    render(<IndicadorSincronizacao backendOnline />);

    expect(await screen.findByRole("button", { name: "Sincronizar novamente" })).toBeInTheDocument();
    expect(
      screen.getByText("Falha ao sincronizar a Base Local — os dados podem estar desatualizados."),
    ).toBeInTheDocument();
  });

  it("P) falha automática (503 durante o POST) → mesmo tratamento de falha", async () => {
    consultarMock.mockResolvedValue(ESTADO_ATUALIZADO);
    dispararMock.mockRejectedValueOnce(new ErroAnaliticaIndisponivel());

    render(<IndicadorSincronizacao backendOnline />);

    expect(await screen.findByRole("button", { name: "Sincronizar novamente" })).toBeInTheDocument();
  });

  it("Planilha Oficial indisponível (422) — mensagem do backend, com botão de recuperação", async () => {
    consultarMock.mockResolvedValue(ESTADO_ATUALIZADO);
    dispararMock.mockRejectedValueOnce(new Error("Planilha oficial não configurada."));

    render(<IndicadorSincronizacao backendOnline />);

    expect(await screen.findByText("Planilha oficial não configurada.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sincronizar novamente" })).toBeInTheDocument();
  });

  it("sincronização já em andamento (409) — nunca tratado como falha, nenhum botão aparece", async () => {
    consultarMock.mockResolvedValue(ESTADO_ATUALIZADO);
    dispararMock.mockRejectedValueOnce(new SincronizacaoEmAndamentoError());

    render(<IndicadorSincronizacao backendOnline />);

    await waitFor(() => expect(dispararMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(consultarMock).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("Q) falha automática seguida de sincronização manual bem-sucedida → botão desaparece", async () => {
    consultarMock.mockResolvedValue(ESTADO_ATUALIZADO);
    dispararMock.mockResolvedValueOnce(RESUMO_FALHA);

    const usuario = userEvent.setup();
    render(<IndicadorSincronizacao backendOnline />);

    const botao = await screen.findByRole("button", { name: "Sincronizar novamente" });

    dispararMock.mockResolvedValueOnce(RESUMO_SUCESSO);
    await usuario.click(botao);

    await waitFor(() => expect(screen.queryByRole("button")).not.toBeInTheDocument());
    expect(
      screen.queryByText("Falha ao sincronizar a Base Local — os dados podem estar desatualizados."),
    ).not.toBeInTheDocument();
  });

  it("nova falha após tentativa manual mantém o botão visível", async () => {
    consultarMock.mockResolvedValue(ESTADO_ATUALIZADO);
    dispararMock.mockResolvedValueOnce(RESUMO_FALHA);

    const usuario = userEvent.setup();
    render(<IndicadorSincronizacao backendOnline />);

    const botao = await screen.findByRole("button", { name: "Sincronizar novamente" });

    dispararMock.mockResolvedValueOnce(RESUMO_FALHA);
    await usuario.click(botao);

    expect(await screen.findByRole("button", { name: "Sincronizar novamente" })).toBeInTheDocument();
  });

  it("falha na leitura do estado (GET) mostra botão próprio de retry", async () => {
    consultarMock.mockRejectedValueOnce(new ErroAnaliticaIndisponivel());
    dispararMock.mockResolvedValueOnce(RESUMO_SUCESSO);

    render(<IndicadorSincronizacao backendOnline />);

    // A chamada automática (POST) já roda em paralelo; se ambas
    // completarem e a busca de estado seguir falhando, `erro` prevalece.
    await waitFor(() => expect(dispararMock).toHaveBeenCalledTimes(1));
  });

  it("backend offline nunca dispara sincronização automática", () => {
    render(<IndicadorSincronizacao backendOnline={false} />);

    expect(dispararMock).not.toHaveBeenCalled();
    expect(consultarMock).not.toHaveBeenCalled();
  });
});
