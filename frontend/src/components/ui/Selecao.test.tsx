// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Selecao from "./Selecao";

afterEach(() => {
  cleanup();
});

const OPCOES = ["Janeiro", "Fevereiro", "Março"];

function SelecaoControlada({ valorInicial = "" }: { valorInicial?: string }) {
  const [valor, setValor] = useState(valorInicial);
  return <Selecao rotulo="Mês" valor={valor} opcoes={OPCOES} onMudar={setValor} />;
}

// Investigação visual (HOMO-RT-02/UX) — reprodução real via Chromium/
// Playwright comprovou que o painel de opções, embora `position: absolute;
// z-index: 10`, ficava coberto pelo próximo cartão da tela: todo cartão do
// app usa `backdrop-blur-sm`, e `backdrop-filter` cria um novo *stacking
// context* por CSS spec — o `z-index` do painel só valia DENTRO do próprio
// cartão. Corrigido com um portal para `document.body`. jsdom não faz
// layout real (não reproduz o bug visual em si), mas testa a parte
// estruturalmente verificável: o painel sai da árvore do cartão.
describe("Selecao — painel em portal (correção do bug de empilhamento visual)", () => {
  it("o painel de opções é renderizado fora do container do campo (document.body), nunca aninhado nele", async () => {
    const usuario = userEvent.setup();
    const { container } = render(<SelecaoControlada />);

    await usuario.click(screen.getByRole("combobox", { name: "Mês" }));

    const listbox = screen.getByRole("listbox");
    expect(container.contains(listbox)).toBe(false);
    expect(document.body.contains(listbox)).toBe(true);
  });

  it("mesmo em portal, selecionar uma opção funciona e fecha o painel", async () => {
    const usuario = userEvent.setup();
    render(<SelecaoControlada />);

    await usuario.click(screen.getByRole("combobox", { name: "Mês" }));
    await usuario.click(screen.getByRole("option", { name: "Fevereiro" }));

    expect(screen.getByRole("combobox", { name: "Mês" })).toHaveTextContent("Fevereiro");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("clicar fora (fora do campo E fora do painel em portal) fecha sem selecionar", async () => {
    const usuario = userEvent.setup();
    render(
      <div>
        <SelecaoControlada />
        <button type="button">Fora</button>
      </div>,
    );

    await usuario.click(screen.getByRole("combobox", { name: "Mês" }));
    expect(screen.getByRole("listbox")).toBeInTheDocument();

    await usuario.click(screen.getByRole("button", { name: "Fora" }));

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Mês" })).toHaveTextContent("Selecione");
  });

  it("rolar a página enquanto o painel está aberto fecha o painel (coordenadas do portal não seguem o layout)", async () => {
    const usuario = userEvent.setup();
    render(<SelecaoControlada />);

    await usuario.click(screen.getByRole("combobox", { name: "Mês" }));
    expect(screen.getByRole("listbox")).toBeInTheDocument();

    window.dispatchEvent(new Event("scroll"));

    await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
  });

  it("desabilitado: nunca abre o painel", async () => {
    const usuario = userEvent.setup();
    render(<Selecao rotulo="Mês" valor="" opcoes={OPCOES} onMudar={vi.fn()} disabled />);

    await usuario.click(screen.getByRole("combobox", { name: "Mês" }));

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("navegação por teclado (seta para baixo + Enter) continua funcionando com o painel em portal", async () => {
    const usuario = userEvent.setup();
    render(<SelecaoControlada />);

    const campo = screen.getByRole("combobox", { name: "Mês" });
    campo.focus();
    await usuario.keyboard("{ArrowDown}"); // abre, destaca "Selecione"
    await usuario.keyboard("{ArrowDown}"); // destaca "Janeiro"
    await usuario.keyboard("{Enter}");

    expect(campo).toHaveTextContent("Janeiro");
  });
});
