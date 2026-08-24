// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import DialogoConfirmacao from "./DialogoConfirmacao";

// Vitest não roda com `globals: true` neste projeto (todo teste importa
// `describe`/`it`/etc. explicitamente — ver vitest.config.ts), então a
// limpeza automática do RTL entre testes não é registrada sozinha.
afterEach(cleanup);

describe("DialogoConfirmacao", () => {
  it("mostra título, mensagem e os dois botões de ação", () => {
    render(
      <DialogoConfirmacao
        titulo="Interromper processamento?"
        mensagem="Todo o processamento será descartado."
        rotuloConfirmar="Interromper"
        rotuloCancelar="Continuar Processando"
        onConfirmar={vi.fn()}
        onCancelar={vi.fn()}
      />,
    );

    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(screen.getByText("Interromper processamento?")).toBeInTheDocument();
    expect(screen.getByText("Todo o processamento será descartado.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continuar Processando" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Interromper" })).toBeInTheDocument();
  });

  it("chama onCancelar ao clicar em 'Continuar Processando'", async () => {
    const onConfirmar = vi.fn();
    const onCancelar = vi.fn();
    const usuario = userEvent.setup();

    render(
      <DialogoConfirmacao
        titulo="t"
        mensagem="m"
        rotuloConfirmar="Interromper"
        rotuloCancelar="Continuar Processando"
        onConfirmar={onConfirmar}
        onCancelar={onCancelar}
      />,
    );

    await usuario.click(screen.getByRole("button", { name: "Continuar Processando" }));
    expect(onCancelar).toHaveBeenCalledTimes(1);
    expect(onConfirmar).not.toHaveBeenCalled();
  });

  it("chama onConfirmar ao clicar em 'Interromper'", async () => {
    const onConfirmar = vi.fn();
    const onCancelar = vi.fn();
    const usuario = userEvent.setup();

    render(
      <DialogoConfirmacao
        titulo="t"
        mensagem="m"
        rotuloConfirmar="Interromper"
        rotuloCancelar="Continuar Processando"
        onConfirmar={onConfirmar}
        onCancelar={onCancelar}
      />,
    );

    await usuario.click(screen.getByRole("button", { name: "Interromper" }));
    expect(onConfirmar).toHaveBeenCalledTimes(1);
    expect(onCancelar).not.toHaveBeenCalled();
  });

  // Micro-sprint 3E.2 — prop opcional nova, usada pelo Relatório do Portal
  // da Transparência para exigir justificativa antes de confirmar.
  it("sem confirmarDesabilitado (uso já existente): botão de confirmar continua habilitado", () => {
    render(
      <DialogoConfirmacao
        titulo="t"
        mensagem="m"
        rotuloConfirmar="Interromper"
        rotuloCancelar="Continuar Processando"
        onConfirmar={vi.fn()}
        onCancelar={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Interromper" })).toBeEnabled();
  });

  it("confirmarDesabilitado=true: botão de confirmar fica desabilitado e não aciona onConfirmar", async () => {
    const onConfirmar = vi.fn();
    const usuario = userEvent.setup();
    render(
      <DialogoConfirmacao
        titulo="t"
        mensagem="m"
        rotuloConfirmar="Confirmar decisão"
        rotuloCancelar="Revisar seleção"
        onConfirmar={onConfirmar}
        onCancelar={vi.fn()}
        confirmarDesabilitado
      />,
    );

    const botaoConfirmar = screen.getByRole("button", { name: "Confirmar decisão" });
    expect(botaoConfirmar).toBeDisabled();
    await usuario.click(botaoConfirmar);
    expect(onConfirmar).not.toHaveBeenCalled();
  });
});
