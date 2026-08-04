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

function estado(status: "nunca_sincronizado" | "atualizado" | "possivelmente_desatualizado") {
  return {
    sincronizado_em: status === "nunca_sincronizado" ? null : "2026-07-31T14:32:00",
    origem: status === "nunca_sincronizado" ? null : "pos_preenchimento",
    possivelmente_desatualizado: status === "possivelmente_desatualizado",
    total_avisos: 0,
    status,
  };
}

afterEach(() => {
  vi.clearAllMocks();
  cleanup();
});

describe("IndicadorSincronizacao — estados de leitura", () => {
  it("verificando (carregando inicial)", () => {
    consultarMock.mockReturnValue(new Promise(() => {})); // nunca resolve nesta asserção

    render(<IndicadorSincronizacao backendOnline />);

    expect(screen.getByText(/Verificando atualizações/)).toBeInTheDocument();
  });

  it("nunca sincronizado (J7)", async () => {
    consultarMock.mockResolvedValueOnce(estado("nunca_sincronizado"));

    render(<IndicadorSincronizacao backendOnline />);

    expect(await screen.findByText("Nenhuma sincronização realizada ainda.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sincronizar agora" })).toBeInTheDocument();
  });

  it("atualizado", async () => {
    consultarMock.mockResolvedValueOnce(estado("atualizado"));

    render(<IndicadorSincronizacao backendOnline />);

    expect(await screen.findByText(/Base Local sincronizada às 14:32/)).toBeInTheDocument();
  });

  it("possivelmente desatualizado", async () => {
    consultarMock.mockResolvedValueOnce(estado("possivelmente_desatualizado"));

    render(<IndicadorSincronizacao backendOnline />);

    expect(await screen.findByText("Os dados podem estar desatualizados.")).toBeInTheDocument();
  });

  it("Base Local indisponível (503 em GET /sincronizacao) — nunca é um veredito de negócio", async () => {
    consultarMock.mockRejectedValueOnce(new ErroAnaliticaIndisponivel());

    render(<IndicadorSincronizacao backendOnline />);

    expect(
      await screen.findByText("Não foi possível carregar o status de sincronização agora."),
    ).toBeInTheDocument();
    const botaoTentarNovamente = screen.getByRole("button", { name: "Tentar novamente" });
    expect(botaoTentarNovamente).toBeInTheDocument();

    consultarMock.mockResolvedValueOnce(estado("atualizado"));
    const usuario = userEvent.setup();
    await usuario.click(botaoTentarNovamente);

    expect(await screen.findByText(/Base Local sincronizada às 14:32/)).toBeInTheDocument();
  });
});

describe("IndicadorSincronizacao — sincronização manual", () => {
  it("sincronizando: botão desabilita durante o POST", async () => {
    consultarMock.mockResolvedValue(estado("atualizado"));
    let resolverDisparo!: (valor: Awaited<ReturnType<typeof dispararSincronizacaoManual>>) => void;
    dispararMock.mockReturnValue(
      new Promise((resolver) => {
        resolverDisparo = resolver;
      }),
    );

    const usuario = userEvent.setup();
    render(<IndicadorSincronizacao backendOnline />);
    const botao = await screen.findByRole("button", { name: "Sincronizar agora" });

    await usuario.click(botao);

    expect(screen.getByText(/Sincronizando/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sincronizar agora" })).toBeDisabled();

    // limpa a promise pendente para não vazar entre testes
    resolverDisparo({
      status: "sucesso",
      sincronizado_em: "2026-07-31T15:00:00",
      linhas_diarias: 1,
      linhas_servidores_lidos: 1,
      linhas_ignoradas: 0,
      total_avisos: 0,
    });
  });

  it("sucesso: mostra 'Base Local atualizada'", async () => {
    consultarMock.mockResolvedValue(estado("atualizado"));
    dispararMock.mockResolvedValueOnce({
      status: "sucesso",
      sincronizado_em: "2026-07-31T15:00:00",
      linhas_diarias: 10,
      linhas_servidores_lidos: 5,
      linhas_ignoradas: 0,
      total_avisos: 0,
    });

    const usuario = userEvent.setup();
    render(<IndicadorSincronizacao backendOnline />);
    await usuario.click(await screen.findByRole("button", { name: "Sincronizar agora" }));

    expect(await screen.findByText("Base Local atualizada.")).toBeInTheDocument();
  });

  it("falha (status: falha na resposta do backend)", async () => {
    consultarMock.mockResolvedValue(estado("atualizado"));
    dispararMock.mockResolvedValueOnce({
      status: "falha",
      sincronizado_em: null,
      linhas_diarias: null,
      linhas_servidores_lidos: null,
      linhas_ignoradas: null,
      total_avisos: null,
    });

    const usuario = userEvent.setup();
    render(<IndicadorSincronizacao backendOnline />);
    await usuario.click(await screen.findByRole("button", { name: "Sincronizar agora" }));

    expect(
      await screen.findByText("Falha ao sincronizar — os dados podem estar desatualizados."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeInTheDocument();
  });

  it("falha (503 durante o POST) — mesmo tratamento de falha, nunca um erro não tratado", async () => {
    consultarMock.mockResolvedValue(estado("atualizado"));
    dispararMock.mockRejectedValueOnce(new ErroAnaliticaIndisponivel());

    const usuario = userEvent.setup();
    render(<IndicadorSincronizacao backendOnline />);
    await usuario.click(await screen.findByRole("button", { name: "Sincronizar agora" }));

    expect(
      await screen.findByText("Falha ao sincronizar — os dados podem estar desatualizados."),
    ).toBeInTheDocument();
  });

  it("Planilha Oficial indisponível (422) — mensagem do backend, nunca tratado como falha genérica", async () => {
    consultarMock.mockResolvedValue(estado("atualizado"));
    dispararMock.mockRejectedValueOnce(new Error("Planilha oficial não configurada."));

    const usuario = userEvent.setup();
    render(<IndicadorSincronizacao backendOnline />);
    await usuario.click(await screen.findByRole("button", { name: "Sincronizar agora" }));

    expect(await screen.findByText("Planilha oficial não configurada.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeInTheDocument();
    expect(screen.queryByText("Falha ao sincronizar — os dados podem estar desatualizados.")).not.toBeInTheDocument();
  });

  it("sincronização já em andamento (409) — mostra 'Sincronizando' durante a chamada, nunca um erro", async () => {
    consultarMock.mockResolvedValue(estado("atualizado"));
    dispararMock.mockRejectedValueOnce(new SincronizacaoEmAndamentoError());

    const usuario = userEvent.setup();
    render(<IndicadorSincronizacao backendOnline />);
    await usuario.click(await screen.findByRole("button", { name: "Sincronizar agora" }));

    await waitFor(() => {
      expect(consultarMock).toHaveBeenCalledTimes(2);
    });
    expect(screen.queryByText(/Falha ao sincronizar/)).not.toBeInTheDocument();
  });

  it("409: resolução — depois da chamada recusada, o botão volta a funcionar (correção 18.4.3.1)", async () => {
    // Antes da correção 18.4.3.1, este cenário deixava o indicador preso
    // em "Sincronizando..." com o botão desabilitado para sempre (achado
    // da auditoria consolidada 18.4.1–18.4.3) — este teste prova que o
    // botão volta a aparecer habilitado, no estado normal, e que uma
    // nova tentativa funciona de verdade.
    consultarMock.mockResolvedValue(estado("atualizado"));
    dispararMock.mockRejectedValueOnce(new SincronizacaoEmAndamentoError());

    const usuario = userEvent.setup();
    render(<IndicadorSincronizacao backendOnline />);
    await usuario.click(await screen.findByRole("button", { name: "Sincronizar agora" }));

    // O estado transitório "Sincronizando..." deve desaparecer sozinho,
    // caindo de volta no estado normal (derivado do `dado` reatualizado),
    // com o botão "Sincronizar agora" habilitado — nunca travado.
    await waitFor(() => {
      expect(screen.queryByText(/Sincronizando/)).not.toBeInTheDocument();
    });
    const botao = await screen.findByRole("button", { name: "Sincronizar agora" });
    expect(botao).toBeEnabled();
    expect(await screen.findByText(/Base Local sincronizada às 14:32/)).toBeInTheDocument();

    // E uma nova tentativa, desta vez bem-sucedida, funciona normalmente.
    dispararMock.mockResolvedValueOnce({
      status: "sucesso",
      sincronizado_em: "2026-07-31T16:00:00",
      linhas_diarias: 1,
      linhas_servidores_lidos: 1,
      linhas_ignoradas: 0,
      total_avisos: 0,
    });
    await usuario.click(botao);

    expect(await screen.findByText("Base Local atualizada.")).toBeInTheDocument();
  });

  it("recuperação: depois de uma falha, clicar 'Tentar novamente' com sucesso mostra 'Base Local atualizada'", async () => {
    consultarMock.mockResolvedValue(estado("atualizado"));
    dispararMock.mockResolvedValueOnce({
      status: "falha",
      sincronizado_em: null,
      linhas_diarias: null,
      linhas_servidores_lidos: null,
      linhas_ignoradas: null,
      total_avisos: null,
    });

    const usuario = userEvent.setup();
    render(<IndicadorSincronizacao backendOnline />);
    await usuario.click(await screen.findByRole("button", { name: "Sincronizar agora" }));

    const botaoTentarNovamente = await screen.findByRole("button", { name: "Tentar novamente" });
    expect(
      screen.getByText("Falha ao sincronizar — os dados podem estar desatualizados."),
    ).toBeInTheDocument();

    dispararMock.mockResolvedValueOnce({
      status: "sucesso",
      sincronizado_em: "2026-07-31T16:00:00",
      linhas_diarias: 3,
      linhas_servidores_lidos: 3,
      linhas_ignoradas: 0,
      total_avisos: 0,
    });
    await usuario.click(botaoTentarNovamente);

    expect(await screen.findByText("Base Local atualizada.")).toBeInTheDocument();
    expect(
      screen.queryByText("Falha ao sincronizar — os dados podem estar desatualizados."),
    ).not.toBeInTheDocument();
  });
});
