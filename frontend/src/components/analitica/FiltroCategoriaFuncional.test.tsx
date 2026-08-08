// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import FiltroCategoriaFuncional from "./FiltroCategoriaFuncional";

afterEach(() => {
  cleanup();
});

describe("FiltroCategoriaFuncional", () => {
  it("mostra as 3 opções, 'Todos' marcado por padrão quando o filtro está ausente", () => {
    render(<FiltroCategoriaFuncional valor={undefined} onMudarFiltro={vi.fn()} />);

    expect(screen.getByRole("radio", { name: "Todos" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Membros" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("radio", { name: "Servidores" })).toHaveAttribute("aria-checked", "false");
  });

  it("clicar em 'Membros' aplica categoria_funcional=MEMBRO", async () => {
    const onMudarFiltro = vi.fn();
    render(<FiltroCategoriaFuncional valor={undefined} onMudarFiltro={onMudarFiltro} />);

    await userEvent.click(screen.getByRole("radio", { name: "Membros" }));

    expect(onMudarFiltro).toHaveBeenCalledWith({ categoria_funcional: "MEMBRO" });
  });

  it("clicar em 'Servidores' aplica categoria_funcional=SERVIDOR", async () => {
    const onMudarFiltro = vi.fn();
    render(<FiltroCategoriaFuncional valor={undefined} onMudarFiltro={onMudarFiltro} />);

    await userEvent.click(screen.getByRole("radio", { name: "Servidores" }));

    expect(onMudarFiltro).toHaveBeenCalledWith({ categoria_funcional: "SERVIDOR" });
  });

  it("clicar em 'Todos' quando outro já está selecionado remove o filtro (undefined)", async () => {
    const onMudarFiltro = vi.fn();
    render(<FiltroCategoriaFuncional valor="MEMBRO" onMudarFiltro={onMudarFiltro} />);

    expect(screen.getByRole("radio", { name: "Membros" })).toHaveAttribute("aria-checked", "true");

    await userEvent.click(screen.getByRole("radio", { name: "Todos" }));

    expect(onMudarFiltro).toHaveBeenCalledWith({ categoria_funcional: undefined });
  });
});
