// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import NotificacaoDocumentosHabeisPendentes from "./NotificacaoDocumentosHabeisPendentes";

afterEach(() => {
  cleanup();
});

// MS UX — Simplificação da Central Analítica (2026-08-10, item 5/13-I): a
// notificação ocupa o lugar da antiga barra de pesquisa rápida — mesma
// contagem, mesmo clique, agora com aparência de notificação em destaque.
describe("NotificacaoDocumentosHabeisPendentes", () => {
  it("resumo nulo: não renderiza nada", () => {
    const { container } = render(<NotificacaoDocumentosHabeisPendentes resumo={null} aoAbrir={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("total zero: não renderiza nada", () => {
    const { container } = render(
      <NotificacaoDocumentosHabeisPendentes
        resumo={{ aguardando_liberacao: 0, revisao_manual_necessaria: 0 }}
        aoAbrir={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("I) mostra a contagem total em destaque e abre ao clicar", async () => {
    const usuario = userEvent.setup();
    const aoAbrir = vi.fn();
    render(
      <NotificacaoDocumentosHabeisPendentes
        resumo={{ aguardando_liberacao: 7, revisao_manual_necessaria: 5 }}
        aoAbrir={aoAbrir}
      />,
    );

    const botao = screen.getByRole("button", { name: /12 Documentos Hábeis Pendentes/ });
    expect(botao).toBeInTheDocument();

    await usuario.click(botao);
    expect(aoAbrir).toHaveBeenCalledTimes(1);
  });

  it("singular quando o total é 1", () => {
    render(
      <NotificacaoDocumentosHabeisPendentes
        resumo={{ aguardando_liberacao: 1, revisao_manual_necessaria: 0 }}
        aoAbrir={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: /1 Documento Hábil Pendente/ })).toBeInTheDocument();
  });
});
