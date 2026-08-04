// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import BarraPesquisaGlobal from "./BarraPesquisaGlobal";

afterEach(() => {
  cleanup();
});

describe("BarraPesquisaGlobal", () => {
  it("digitar um termo e apertar Enter chama onPesquisar com o termo (sem espaços nas pontas)", async () => {
    const usuario = userEvent.setup();
    const onPesquisar = vi.fn();
    render(<BarraPesquisaGlobal onPesquisar={onPesquisar} />);

    await usuario.type(
      screen.getByRole("searchbox", { name: /Pesquisar por SEI, CPF, servidor ou município/ }),
      "  araripina  {Enter}",
    );

    expect(onPesquisar).toHaveBeenCalledTimes(1);
    expect(onPesquisar).toHaveBeenCalledWith("araripina");
  });

  it("submeter com o campo vazio não chama onPesquisar", async () => {
    const usuario = userEvent.setup();
    const onPesquisar = vi.fn();
    render(<BarraPesquisaGlobal onPesquisar={onPesquisar} />);

    await usuario.type(screen.getByRole("searchbox"), "{Enter}");

    expect(onPesquisar).not.toHaveBeenCalled();
  });

  it("desabilitado=true desabilita o campo", () => {
    render(<BarraPesquisaGlobal onPesquisar={vi.fn()} desabilitado />);

    expect(screen.getByRole("searchbox")).toBeDisabled();
  });
});
