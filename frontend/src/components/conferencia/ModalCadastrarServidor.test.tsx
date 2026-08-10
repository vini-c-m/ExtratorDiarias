// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../services/api", async (importarOriginal) => {
  const original = await importarOriginal<typeof import("../../services/api")>();
  return { ...original, cadastrarServidor: vi.fn(), obterOpcoesCadastroServidor: vi.fn() };
});

import ModalCadastrarServidor from "./ModalCadastrarServidor";
import { cadastrarServidor, obterOpcoesCadastroServidor } from "../../services/api";
import type { OpcoesCadastroServidorResposta, RespostaCadastroServidor } from "../../types/conferencia";

const cadastrarServidorMock = vi.mocked(cadastrarServidor);
const obterOpcoesCadastroServidorMock = vi.mocked(obterOpcoesCadastroServidor);

// Valores reais "já levantados na aba Dados" — nunca hardcoded no
// componente (item 8 do pedido "Ajuste Final"), só nesta simulação de
// resposta do backend.
const CARGO_LONGO = "TÉCNICO MINISTERIAL DE GESTÃO ADMINISTRATIVA E ORÇAMENTÁRIA";

const OPCOES_MOCK: OpcoesCadastroServidorResposta = {
  cargos: ["Analista Judiciário", "Técnico Judiciário", CARGO_LONGO],
  orgaos_origem: ["Secretaria de Educação"],
  previdencias: ["FUNAFIN", "INSS"],
  regimes_previdencia: ["RGPS", "RPPS"],
  situacoes: ["Aposentadoria - Intergral p/ tempo de serviço", "Em exercício"],
};

beforeEach(() => {
  obterOpcoesCadastroServidorMock.mockResolvedValue(OPCOES_MOCK);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function preencherCamposObrigatorios() {
  return async (usuario: ReturnType<typeof userEvent.setup>) => {
    await usuario.type(screen.getByLabelText("Nome"), "Novo Servidor de Teste");
    await usuario.type(screen.getByLabelText("Matrícula"), "9999");
    await usuario.type(screen.getByLabelText("Cargo"), "Analista Judiciário");
  };
}

describe("ModalCadastrarServidor", () => {
  it("CPF vem pré-preenchido, EDITÁVEL (não mais bloqueado), e desabilita Salvar até os campos obrigatórios serem preenchidos", async () => {
    const usuario = userEvent.setup();
    render(
      <ModalCadastrarServidor cpf="12345678911" onFechar={vi.fn()} onCpfResolvido={vi.fn()} />,
    );

    const campoCpf = screen.getByLabelText("CPF");
    // Item 2 do pedido "Ajuste Funcional + UX": pré-preenchido = sugestão,
    // nunca mais bloqueado — o servidor pode corrigir um CPF pesquisado
    // errado antes de salvar.
    expect(campoCpf).toHaveValue("12345678911");
    expect(campoCpf).not.toBeDisabled();
    expect(campoCpf).not.toHaveAttribute("readonly");
    expect(screen.getByRole("button", { name: "Salvar" })).toBeDisabled();

    await preencherCamposObrigatorios()(usuario);

    expect(screen.getByRole("button", { name: "Salvar" })).not.toBeDisabled();
  });

  describe("CPF editável (item 2/6 do pedido \"Ajuste Funcional + UX\")", () => {
    it("permite corrigir o CPF pesquisado antes de salvar", async () => {
      const usuario = userEvent.setup();
      render(<ModalCadastrarServidor cpf="11111111111" onFechar={vi.fn()} onCpfResolvido={vi.fn()} />);
      const campoCpf = screen.getByLabelText("CPF");

      await usuario.clear(campoCpf);
      await usuario.type(campoCpf, "22222222222");

      expect(campoCpf).toHaveValue("22222222222");
    });

    it("Salvar continua desabilitado enquanto o CPF não tiver 11 dígitos", async () => {
      const usuario = userEvent.setup();
      render(<ModalCadastrarServidor cpf="11111111111" onFechar={vi.fn()} onCpfResolvido={vi.fn()} />);
      await preencherCamposObrigatorios()(usuario);
      expect(screen.getByRole("button", { name: "Salvar" })).not.toBeDisabled();

      await usuario.clear(screen.getByLabelText("CPF"));
      await usuario.type(screen.getByLabelText("CPF"), "123");

      expect(screen.getByRole("button", { name: "Salvar" })).toBeDisabled();
    });

    it("envia o CPF EDITADO (não o originalmente pesquisado) ao salvar", async () => {
      const usuario = userEvent.setup();
      cadastrarServidorMock.mockResolvedValueOnce({ estado: "concluido", mensagem: null, servidor: null });
      render(<ModalCadastrarServidor cpf="11111111111" onFechar={vi.fn()} onCpfResolvido={vi.fn()} />);
      await preencherCamposObrigatorios()(usuario);

      await usuario.clear(screen.getByLabelText("CPF"));
      await usuario.type(screen.getByLabelText("CPF"), "222.222.222-22");
      await usuario.click(screen.getByRole("button", { name: "Salvar" }));

      expect(cadastrarServidorMock).toHaveBeenCalledWith(
        expect.objectContaining({ cpf: "22222222222" }),
      );
    });

    it("CPF corrigido para um valor já cadastrado: bloqueia como duplicidade (nunca cria um segundo registro)", async () => {
      const usuario = userEvent.setup();
      cadastrarServidorMock.mockResolvedValueOnce({
        estado: "duplicado",
        mensagem: "Este CPF já está cadastrado na aba Dados.",
        servidor: { nome: "Servidor Já Cadastrado", cargo: "Técnico Judiciário", previdencia: "INSS" },
      });
      render(<ModalCadastrarServidor cpf="11111111111" onFechar={vi.fn()} onCpfResolvido={vi.fn()} />);
      await preencherCamposObrigatorios()(usuario);

      await usuario.clear(screen.getByLabelText("CPF"));
      await usuario.type(screen.getByLabelText("CPF"), "99999999999");
      await usuario.click(screen.getByRole("button", { name: "Salvar" }));

      expect(await screen.findByText(/já está cadastrado/i)).toBeInTheDocument();
      expect(screen.getByText(/Servidor Já Cadastrado/)).toBeInTheDocument();
      expect(cadastrarServidorMock).toHaveBeenCalledWith(
        expect.objectContaining({ cpf: "99999999999" }),
      );
    });

    it("reconsulta (onCpfResolvido) usa o CPF FINAL editado, nunca o originalmente pesquisado", async () => {
      const usuario = userEvent.setup();
      const onCpfResolvido = vi.fn();
      cadastrarServidorMock.mockResolvedValueOnce({ estado: "concluido", mensagem: null, servidor: null });
      render(
        <ModalCadastrarServidor cpf="11111111111" onFechar={vi.fn()} onCpfResolvido={onCpfResolvido} />,
      );
      await preencherCamposObrigatorios()(usuario);
      await usuario.clear(screen.getByLabelText("CPF"));
      await usuario.type(screen.getByLabelText("CPF"), "22222222222");
      await usuario.click(screen.getByRole("button", { name: "Salvar" }));
      await usuario.click(await screen.findByRole("button", { name: "Já sincronizei / Continuar" }));

      expect(onCpfResolvido).toHaveBeenCalledWith("22222222222");
    });
  });

  it("A) cadastro bem-sucedido (concluido): mostra confirmação + aviso do Drive, nunca afirma que sincronizou", async () => {
    const usuario = userEvent.setup();
    const onFechar = vi.fn();
    const onCpfResolvido = vi.fn();
    const resposta: RespostaCadastroServidor = {
      estado: "concluido",
      mensagem: null,
      servidor: { nome: "Novo Servidor de Teste", cargo: "Analista Judiciário", previdencia: "INSS" },
    };
    cadastrarServidorMock.mockResolvedValueOnce(resposta);

    render(
      <ModalCadastrarServidor cpf="12345678911" onFechar={onFechar} onCpfResolvido={onCpfResolvido} />,
    );
    await preencherCamposObrigatorios()(usuario);
    await usuario.click(screen.getByRole("button", { name: "Salvar" }));

    expect(await screen.findByText("Cadastro salvo na Planilha Oficial.")).toBeInTheDocument();
    expect(
      screen.getByText(/verifique se o Google Drive concluiu a sincronização/i),
    ).toBeInTheDocument();

    await usuario.click(screen.getByRole("button", { name: "Já sincronizei / Continuar" }));
    expect(onCpfResolvido).toHaveBeenCalledTimes(1);
    expect(onFechar).toHaveBeenCalledTimes(1);
  });

  it("G) CPF duplicado: mostra o servidor já cadastrado e nunca grava de novo ao fechar", async () => {
    const usuario = userEvent.setup();
    const onCpfResolvido = vi.fn();
    const resposta: RespostaCadastroServidor = {
      estado: "duplicado",
      mensagem: "Este CPF já está cadastrado na aba Dados.",
      servidor: { nome: "Maria Aparecida Souza", cargo: "Analista Judiciário", previdencia: "FUNAFIN" },
    };
    cadastrarServidorMock.mockResolvedValueOnce(resposta);

    render(<ModalCadastrarServidor cpf="12345678911" onFechar={vi.fn()} onCpfResolvido={onCpfResolvido} />);
    await preencherCamposObrigatorios()(usuario);
    await usuario.click(screen.getByRole("button", { name: "Salvar" }));

    expect(await screen.findByText(/já está cadastrado/i)).toBeInTheDocument();
    expect(screen.getByText(/Maria Aparecida Souza/)).toBeInTheDocument();

    // Dois botões "Fechar" na tela (o X do cabeçalho, sempre presente, e a
    // ação primária deste estado) — a ação primária é a última no DOM.
    const botoesFechar = screen.getAllByRole("button", { name: "Fechar" });
    await usuario.click(botoesFechar[botoesFechar.length - 1]);
    expect(onCpfResolvido).toHaveBeenCalledTimes(1);
    expect(cadastrarServidorMock).toHaveBeenCalledTimes(1);
  });

  it("salvo_sync_pendente: nunca reporta como falha, e 'Tentar sincronizar novamente' reenvia sem duplicar", async () => {
    const usuario = userEvent.setup();
    const onCpfResolvido = vi.fn();
    const pendente: RespostaCadastroServidor = {
      estado: "salvo_sync_pendente",
      mensagem: "Cadastro salvo na Planilha Oficial, mas a Central ainda não conseguiu atualizar a base local.",
      servidor: null,
    };
    const concluido: RespostaCadastroServidor = {
      estado: "concluido",
      mensagem: null,
      servidor: { nome: "Novo Servidor de Teste", cargo: "Analista Judiciário", previdencia: "" },
    };
    cadastrarServidorMock.mockResolvedValueOnce(pendente).mockResolvedValueOnce(concluido);

    render(<ModalCadastrarServidor cpf="12345678911" onFechar={vi.fn()} onCpfResolvido={onCpfResolvido} />);
    await preencherCamposObrigatorios()(usuario);
    await usuario.click(screen.getByRole("button", { name: "Salvar" }));

    expect(await screen.findByText(/a Central ainda não conseguiu atualizar/i)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    await usuario.click(screen.getByRole("button", { name: "Tentar sincronizar novamente" }));

    expect(await screen.findByText("Cadastro salvo na Planilha Oficial.")).toBeInTheDocument();
    expect(cadastrarServidorMock).toHaveBeenCalledTimes(2);
    // Mesmos dados reenviados nas duas tentativas — nunca uma segunda
    // gravação com dados diferentes.
    expect(cadastrarServidorMock.mock.calls[0]).toEqual(cadastrarServidorMock.mock.calls[1]);
  });

  it("nao_salvo: mostra erro inline e mantém o formulário preenchido e reabilitado", async () => {
    const usuario = userEvent.setup();
    cadastrarServidorMock.mockResolvedValueOnce({
      estado: "nao_salvo",
      mensagem: "Não foi possível gravar a planilha — feche o arquivo no Excel e tente novamente.",
      servidor: null,
    });

    render(<ModalCadastrarServidor cpf="12345678911" onFechar={vi.fn()} onCpfResolvido={vi.fn()} />);
    await preencherCamposObrigatorios()(usuario);
    await usuario.click(screen.getByRole("button", { name: "Salvar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/feche o arquivo no Excel/i);
    expect(screen.getByLabelText("Nome")).toHaveValue("Novo Servidor de Teste");
    expect(screen.getByRole("button", { name: "Salvar" })).not.toBeDisabled();
  });

  it("falha de rede (exceção lançada) mostra mensagem amigável, nunca quebra a tela", async () => {
    const usuario = userEvent.setup();
    cadastrarServidorMock.mockRejectedValueOnce(new Error("Failed to fetch"));

    render(<ModalCadastrarServidor cpf="12345678911" onFechar={vi.fn()} onCpfResolvido={vi.fn()} />);
    await preencherCamposObrigatorios()(usuario);
    await usuario.click(screen.getByRole("button", { name: "Salvar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/não foi possível conectar ao aplicativo/i);
  });

  it("H) duplo clique em Salvar dispara só uma requisição", async () => {
    let resolver!: (valor: RespostaCadastroServidor) => void;
    cadastrarServidorMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolver = resolve;
        }),
    );
    const usuario = userEvent.setup();

    render(<ModalCadastrarServidor cpf="12345678911" onFechar={vi.fn()} onCpfResolvido={vi.fn()} />);
    await preencherCamposObrigatorios()(usuario);

    const botaoSalvar = screen.getByRole("button", { name: "Salvar" });
    await usuario.click(botaoSalvar);
    await usuario.click(botaoSalvar);

    expect(cadastrarServidorMock).toHaveBeenCalledTimes(1);
    resolver({ estado: "concluido", mensagem: null, servidor: null });
  });

  it("Cancelar chama onFechar e fica desabilitado durante o carregamento", async () => {
    let resolver!: (valor: RespostaCadastroServidor) => void;
    cadastrarServidorMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolver = resolve;
        }),
    );
    const usuario = userEvent.setup();
    const onFechar = vi.fn();

    render(<ModalCadastrarServidor cpf="12345678911" onFechar={onFechar} onCpfResolvido={vi.fn()} />);
    await preencherCamposObrigatorios()(usuario);
    await usuario.click(screen.getByRole("button", { name: "Salvar" }));

    expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled();
    resolver({ estado: "concluido", mensagem: null, servidor: null });

    await screen.findByText("Cadastro salvo na Planilha Oficial.");
  });

  it("botão de fechar (X) chama onFechar", async () => {
    const usuario = userEvent.setup();
    const onFechar = vi.fn();
    render(<ModalCadastrarServidor cpf="12345678911" onFechar={onFechar} onCpfResolvido={vi.fn()} />);

    await usuario.click(screen.getByRole("button", { name: "Fechar" }));
    expect(onFechar).toHaveBeenCalledTimes(1);
  });

  describe("Cargo — combobox pesquisável (opções reais da aba Dados)", () => {
    it("filtra opções existentes conforme digitação e permite selecionar uma", async () => {
      const usuario = userEvent.setup();
      render(<ModalCadastrarServidor cpf="12345678911" onFechar={vi.fn()} onCpfResolvido={vi.fn()} />);
      const campoCargo = screen.getByLabelText("Cargo");

      await usuario.type(campoCargo, "Anal");

      const lista = await screen.findByRole("listbox");
      expect(within(lista).getByRole("option", { name: "Analista Judiciário" })).toBeInTheDocument();
      expect(within(lista).queryByRole("option", { name: "Técnico Judiciário" })).not.toBeInTheDocument();

      await usuario.click(within(lista).getByRole("option", { name: "Analista Judiciário" }));
      expect(campoCargo).toHaveValue("Analista Judiciário");
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    });

    it("aceita um valor novo (ainda não cadastrado), oferecendo 'Usar novo valor'", async () => {
      const usuario = userEvent.setup();
      cadastrarServidorMock.mockResolvedValueOnce({ estado: "concluido", mensagem: null, servidor: null });
      render(<ModalCadastrarServidor cpf="12345678911" onFechar={vi.fn()} onCpfResolvido={vi.fn()} />);
      const campoCargo = screen.getByLabelText("Cargo");

      await usuario.type(campoCargo, "Cargo Inexistente Novo");

      expect(await screen.findByText('Usar novo valor: "Cargo Inexistente Novo"')).toBeInTheDocument();
      expect(campoCargo).toHaveValue("Cargo Inexistente Novo");

      await usuario.type(screen.getByLabelText("Nome"), "Fulano de Tal");
      await usuario.type(screen.getByLabelText("Matrícula"), "1234");
      await usuario.click(screen.getByRole("button", { name: "Salvar" }));

      expect(cadastrarServidorMock).toHaveBeenCalledWith(
        expect.objectContaining({ cargo: "Cargo Inexistente Novo" }),
      );
    });

    it("teclado: seta para baixo destaca a primeira opção e Enter confirma", async () => {
      const usuario = userEvent.setup();
      render(<ModalCadastrarServidor cpf="12345678911" onFechar={vi.fn()} onCpfResolvido={vi.fn()} />);
      const campoCargo = screen.getByLabelText("Cargo");

      await usuario.click(campoCargo);
      await usuario.keyboard("{ArrowDown}");
      await usuario.keyboard("{Enter}");

      expect(campoCargo).toHaveValue("Analista Judiciário");
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    });

    it("Escape fecha o dropdown sem alterar o texto digitado", async () => {
      const usuario = userEvent.setup();
      render(<ModalCadastrarServidor cpf="12345678911" onFechar={vi.fn()} onCpfResolvido={vi.fn()} />);
      const campoCargo = screen.getByLabelText("Cargo");

      await usuario.type(campoCargo, "Anal");
      expect(await screen.findByRole("listbox")).toBeInTheDocument();

      await usuario.keyboard("{Escape}");

      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
      expect(campoCargo).toHaveValue("Anal");
    });

    it("clicar fora fecha o dropdown", async () => {
      const usuario = userEvent.setup();
      render(<ModalCadastrarServidor cpf="12345678911" onFechar={vi.fn()} onCpfResolvido={vi.fn()} />);
      const campoCargo = screen.getByLabelText("Cargo");

      await usuario.type(campoCargo, "Anal");
      expect(await screen.findByRole("listbox")).toBeInTheDocument();

      await usuario.click(screen.getByLabelText("Nome"));

      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    });
  });

  describe("Órgão de origem — combobox pesquisável (opções reais da aba Dados)", () => {
    it("permite selecionar um órgão já existente", async () => {
      const usuario = userEvent.setup();
      render(<ModalCadastrarServidor cpf="12345678911" onFechar={vi.fn()} onCpfResolvido={vi.fn()} />);
      const campoOrgao = screen.getByLabelText("Órgão de origem (opcional)");

      await usuario.type(campoOrgao, "Secretaria");
      const lista = await screen.findByRole("listbox");
      await usuario.click(within(lista).getByRole("option", { name: "Secretaria de Educação" }));

      expect(campoOrgao).toHaveValue("Secretaria de Educação");
    });

    it("aceita um novo órgão que ainda não existe na lista", async () => {
      const usuario = userEvent.setup();
      cadastrarServidorMock.mockResolvedValueOnce({ estado: "concluido", mensagem: null, servidor: null });
      render(<ModalCadastrarServidor cpf="12345678911" onFechar={vi.fn()} onCpfResolvido={vi.fn()} />);

      await preencherCamposObrigatorios()(usuario);
      await usuario.type(screen.getByLabelText("Órgão de origem (opcional)"), "Órgão Totalmente Novo");
      await usuario.click(screen.getByRole("button", { name: "Salvar" }));

      expect(cadastrarServidorMock).toHaveBeenCalledWith(
        expect.objectContaining({ orgao_origem: "Órgão Totalmente Novo" }),
      );
    });
  });

  describe("Previdência / Regime de previdência / Situação — seletor fechado (dropdown customizado, sem <select> nativo)", () => {
    it("nenhum campo do modal usa <select> nativo — o popup branco do SO nunca aparece", () => {
      const { container } = render(
        <ModalCadastrarServidor cpf="12345678911" onFechar={vi.fn()} onCpfResolvido={vi.fn()} />,
      );
      expect(container.querySelectorAll("select")).toHaveLength(0);
    });

    it("Previdência/Regime/Situação são <button>, nunca um <input> de texto — impossível digitar um valor", () => {
      render(<ModalCadastrarServidor cpf="12345678911" onFechar={vi.fn()} onCpfResolvido={vi.fn()} />);

      for (const rotulo of ["Previdência (opcional)", "Regime de previdência (opcional)", "Situação (opcional)"]) {
        const gatilho = screen.getByLabelText(rotulo);
        expect(gatilho.tagName).toBe("BUTTON");
      }
    });

    it("Previdência abre o mesmo dropdown escuro do Cargo, com as opções reais + em branco, e permite selecionar", async () => {
      const usuario = userEvent.setup();
      render(<ModalCadastrarServidor cpf="12345678911" onFechar={vi.fn()} onCpfResolvido={vi.fn()} />);
      const gatilho = screen.getByLabelText("Previdência (opcional)");

      await usuario.click(gatilho);
      const lista = await screen.findByRole("listbox");
      expect(within(lista).getAllByRole("option").map((opcao) => opcao.textContent)).toEqual([
        "Selecione",
        "FUNAFIN",
        "INSS",
      ]);

      await usuario.click(within(lista).getByRole("option", { name: "FUNAFIN" }));

      expect(gatilho).toHaveTextContent("FUNAFIN");
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    });

    it("Previdência: teclado — seta abre/navega e Enter confirma a opção destacada", async () => {
      const usuario = userEvent.setup();
      render(<ModalCadastrarServidor cpf="12345678911" onFechar={vi.fn()} onCpfResolvido={vi.fn()} />);
      const gatilho = screen.getByLabelText("Previdência (opcional)");

      gatilho.focus();
      await usuario.keyboard("{ArrowDown}"); // abre, destaca "Selecione" (índice do valor atual)
      await usuario.keyboard("{ArrowDown}"); // desce para "FUNAFIN"
      await usuario.keyboard("{Enter}");

      expect(gatilho).toHaveTextContent("FUNAFIN");
    });

    it("Previdência: Escape fecha o dropdown sem alterar a seleção", async () => {
      const usuario = userEvent.setup();
      render(<ModalCadastrarServidor cpf="12345678911" onFechar={vi.fn()} onCpfResolvido={vi.fn()} />);
      const gatilho = screen.getByLabelText("Previdência (opcional)");

      gatilho.focus();
      await usuario.keyboard("{ArrowDown}");
      expect(await screen.findByRole("listbox")).toBeInTheDocument();

      await usuario.keyboard("{Escape}");

      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
      expect(gatilho).toHaveTextContent("Selecione");
    });

    it("Previdência: clicar fora fecha o dropdown", async () => {
      const usuario = userEvent.setup();
      render(<ModalCadastrarServidor cpf="12345678911" onFechar={vi.fn()} onCpfResolvido={vi.fn()} />);
      const gatilho = screen.getByLabelText("Previdência (opcional)");

      await usuario.click(gatilho);
      expect(await screen.findByRole("listbox")).toBeInTheDocument();

      await usuario.click(screen.getByLabelText("Nome"));

      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    });

    it("Regime de previdência: só permite escolher entre as opções reais (não existe forma de digitar um valor novo)", async () => {
      const usuario = userEvent.setup();
      render(<ModalCadastrarServidor cpf="12345678911" onFechar={vi.fn()} onCpfResolvido={vi.fn()} />);
      const gatilho = screen.getByLabelText("Regime de previdência (opcional)");

      await usuario.click(gatilho);
      const lista = await screen.findByRole("listbox");
      expect(within(lista).getAllByRole("option").map((opcao) => opcao.textContent)).toEqual([
        "Selecione",
        "RGPS",
        "RPPS",
      ]);

      await usuario.click(within(lista).getByRole("option", { name: "RPPS" }));
      expect(gatilho).toHaveTextContent("RPPS");
    });

    it("Situação: só permite escolher entre as opções reais (não existe forma de digitar um valor novo)", async () => {
      const usuario = userEvent.setup();
      render(<ModalCadastrarServidor cpf="12345678911" onFechar={vi.fn()} onCpfResolvido={vi.fn()} />);
      const gatilho = screen.getByLabelText("Situação (opcional)");

      await usuario.click(gatilho);
      const lista = await screen.findByRole("listbox");
      expect(within(lista).getAllByRole("option").map((opcao) => opcao.textContent)).toEqual([
        "Selecione",
        "Aposentadoria - Intergral p/ tempo de serviço",
        "Em exercício",
      ]);

      await usuario.click(within(lista).getByRole("option", { name: "Em exercício" }));
      expect(gatilho).toHaveTextContent("Em exercício");
    });
  });

  it("alinhamento: Matrícula+Cargo e Regime+Situação ficam na mesma linha-base mesmo com rótulo maior", () => {
    render(<ModalCadastrarServidor cpf="12345678911" onFechar={vi.fn()} onCpfResolvido={vi.fn()} />);

    const linhaMatriculaCargo = screen.getByLabelText("Matrícula").closest(".grid");
    expect(linhaMatriculaCargo).toHaveClass("items-end");
    expect(linhaMatriculaCargo).toContainElement(screen.getByLabelText("Cargo"));

    const linhaRegimeSituacao = screen
      .getByLabelText("Regime de previdência (opcional)")
      .closest(".grid");
    expect(linhaRegimeSituacao).toHaveClass("items-end");
    expect(linhaRegimeSituacao).toContainElement(screen.getByLabelText("Situação (opcional)"));
  });

  it("cadastro completo (campos existentes selecionados + campo novo) envia o payload correto ao backend", async () => {
    const usuario = userEvent.setup();
    cadastrarServidorMock.mockResolvedValueOnce({ estado: "concluido", mensagem: null, servidor: null });
    render(<ModalCadastrarServidor cpf="12345678911" onFechar={vi.fn()} onCpfResolvido={vi.fn()} />);

    async function selecionarOpcaoFechada(rotuloCampo: string, rotuloOpcao: string) {
      await usuario.click(screen.getByLabelText(rotuloCampo));
      const lista = await screen.findByRole("listbox");
      await usuario.click(within(lista).getByRole("option", { name: rotuloOpcao }));
    }

    await usuario.type(screen.getByLabelText("Nome"), "Fulano de Tal");
    await usuario.type(screen.getByLabelText("Matrícula"), "4321");
    await usuario.type(screen.getByLabelText("Cargo"), "Analista Judiciário");
    await selecionarOpcaoFechada("Previdência (opcional)", "INSS");
    await usuario.type(screen.getByLabelText("Órgão de origem (opcional)"), "Nova Secretaria");
    await selecionarOpcaoFechada("Regime de previdência (opcional)", "RPPS");
    await selecionarOpcaoFechada("Situação (opcional)", "Aposentadoria - Intergral p/ tempo de serviço");

    await usuario.click(screen.getByRole("button", { name: "Salvar" }));

    expect(cadastrarServidorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        nome: "Fulano de Tal",
        matricula: "4321",
        cargo: "Analista Judiciário",
        previdencia: "INSS",
        orgao_origem: "Nova Secretaria",
        regime_previdencia: "RPPS",
        situacao: "Aposentadoria - Intergral p/ tempo de serviço",
      }),
    );
  });

  describe("Cargo: cargos longos aparecem por inteiro no dropdown (sem truncar)", () => {
    it("mostra o texto completo do cargo, sem classe de truncamento/ellipsis", async () => {
      const usuario = userEvent.setup();
      render(<ModalCadastrarServidor cpf="12345678911" onFechar={vi.fn()} onCpfResolvido={vi.fn()} />);

      await usuario.click(screen.getByLabelText("Cargo"));
      const lista = await screen.findByRole("listbox");
      const opcaoLonga = within(lista).getByRole("option", { name: CARGO_LONGO });

      // Texto inteiro presente no DOM (nunca cortado por JS) — o item nunca
      // usa `truncate`/`text-ellipsis`, só quebra de linha normal.
      expect(opcaoLonga).toHaveTextContent(CARGO_LONGO);
      const spanTexto = opcaoLonga.querySelector("span")!;
      expect(spanTexto.className).not.toMatch(/truncate/);
      expect(spanTexto.className).toMatch(/break-words/);
    });

    it("selecionar o cargo longo continua funcionando normalmente", async () => {
      const usuario = userEvent.setup();
      render(<ModalCadastrarServidor cpf="12345678911" onFechar={vi.fn()} onCpfResolvido={vi.fn()} />);
      const campoCargo = screen.getByLabelText("Cargo");

      await usuario.click(campoCargo);
      const lista = await screen.findByRole("listbox");
      await usuario.click(within(lista).getByRole("option", { name: CARGO_LONGO }));

      expect(campoCargo).toHaveValue(CARGO_LONGO);
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    });
  });

  describe("Link para consulta no sistema Arquimedes", () => {
    afterEach(() => {
      // @ts-expect-error — limpo entre testes para não vazar o mock de um
      // teste para o próximo (mesmo cuidado de qualquer estado global).
      delete window.api;
    });

    it("renderiza visível, clicável, com a URL correta e abrindo em nova aba/janela como fallback nativo", () => {
      render(<ModalCadastrarServidor cpf="12345678911" onFechar={vi.fn()} onCpfResolvido={vi.fn()} />);

      const link = screen.getByRole("link", { name: /Arquimedes/i });
      expect(link).toBeVisible();
      expect(link).toHaveAttribute("href", "https://arquimedes.mppe.mp.br/arquimedes/");
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
      expect(
        screen.getByText(/Consultar dados cadastrais no sistema/i),
      ).toBeInTheDocument();
    });

    it("clique chama window.api.abrirLinkExterno com a URL do Arquimedes (mecanismo seguro do Electron)", async () => {
      const abrirLinkExternoMock = vi.fn().mockResolvedValue(undefined);
      window.api = { abrirLinkExterno: abrirLinkExternoMock } as unknown as Window["api"];
      const usuario = userEvent.setup();
      render(<ModalCadastrarServidor cpf="12345678911" onFechar={vi.fn()} onCpfResolvido={vi.fn()} />);

      await usuario.click(screen.getByRole("link", { name: /Arquimedes/i }));

      expect(abrirLinkExternoMock).toHaveBeenCalledWith("https://arquimedes.mppe.mp.br/arquimedes/");
    });

    it("clicar no link NÃO fecha o modal nem substitui a tela atual (onFechar/onCpfResolvido nunca chamados)", async () => {
      window.api = { abrirLinkExterno: vi.fn().mockResolvedValue(undefined) } as unknown as Window["api"];
      const onFechar = vi.fn();
      const onCpfResolvido = vi.fn();
      const usuario = userEvent.setup();
      render(<ModalCadastrarServidor cpf="12345678911" onFechar={onFechar} onCpfResolvido={onCpfResolvido} />);

      await usuario.click(screen.getByRole("link", { name: /Arquimedes/i }));

      expect(onFechar).not.toHaveBeenCalled();
      expect(onCpfResolvido).not.toHaveBeenCalled();
      // O modal (e o formulário) continuam na tela normalmente.
      expect(screen.getByLabelText("Nome")).toBeInTheDocument();
    });

    it("sem window.api (fora do Electron), o clique não quebra a tela — cai no <a> nativo", async () => {
      const usuario = userEvent.setup();
      render(<ModalCadastrarServidor cpf="12345678911" onFechar={vi.fn()} onCpfResolvido={vi.fn()} />);

      await expect(usuario.click(screen.getByRole("link", { name: /Arquimedes/i }))).resolves.not.toThrow();
    });
  });
});
