// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PainelDetalhamentoDiaria from "./PainelDetalhamentoDiaria";
import type { DiariaCompletaResposta } from "../../types/analitica";

vi.mock("../../hooks/useDetalhamentoDiaria", () => ({
  useDetalhamentoDiaria: vi.fn(),
}));

import { useDetalhamentoDiaria } from "../../hooks/useDetalhamentoDiaria";

const useDetalhamentoDiariaMock = vi.mocked(useDetalhamentoDiaria);

const REGISTRO: DiariaCompletaResposta = {
  sei: "19.20.0903.0030720/2024-36",
  periodo: { inicial: "2025-01-08", final: "2025-01-10" },
  destino: "Araripina-PE",
  servidor: {
    nome: "João da Silva",
    cargo: "Analista",
    previdencia: "RPPS",
    matricula: "12345",
    situacao: "Em exercício",
  },
  motivo: "Curso",
  valor_total_diarias: 480,
  doc_origem: "processo.pdf",
  cpf: "12345678911",
  trecho: { origem: "Recife", destino: "Araripina-PE" },
  transporte: "Rodoviário",
  referencia_administrativa: { linha_planilha: 42 },
  sincronizacao: { sincronizado_em: "2026-08-01T10:00:00", total_avisos: 0 },
  diagnosticos: [],
};

// Sprint 19.5.8.1 — segundo registro, usado para provar que o feedback de
// "Copiar SEI" de um registro não vaza para outro (correção do Bug 2).
const REGISTRO_B: DiariaCompletaResposta = {
  ...REGISTRO,
  sei: "19.20.0099.0000099/2024-00",
  cpf: "59111111100",
};

beforeEach(() => {
  // Sprint 19.5.8 — só `copiarTexto` importa para este componente;
  // `copiarTexto` é opcional em `Window["api"]` justamente para permitir
  // este mock parcial sem tocar nos testes de outras telas que montam o
  // objeto inteiro (Central de Conferência, Sprint 13).
  window.api = { copiarTexto: vi.fn() } as unknown as Window["api"];
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe("PainelDetalhamentoDiaria", () => {
  it("sei null: não renderiza nada", () => {
    useDetalhamentoDiariaMock.mockReturnValue({ carregando: false, erro: null, naoEncontrada: false, registro: null });
    const { container } = render(
      <PainelDetalhamentoDiaria sei={null} aoFechar={vi.fn()} aoVerHistoricoCpf={vi.fn()} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("carregando: mostra o texto de carregamento", () => {
    useDetalhamentoDiariaMock.mockReturnValue({ carregando: true, erro: null, naoEncontrada: false, registro: null });
    render(<PainelDetalhamentoDiaria sei={REGISTRO.sei} aoFechar={vi.fn()} aoVerHistoricoCpf={vi.fn()} />);

    expect(screen.getByText("Carregando detalhamento...")).toBeInTheDocument();
  });

  it("erro técnico: mostra Alerta de erro (vermelho)", () => {
    useDetalhamentoDiariaMock.mockReturnValue({
      carregando: false,
      erro: "Não foi possível carregar o detalhamento.",
      naoEncontrada: false,
      registro: null,
    });
    render(<PainelDetalhamentoDiaria sei={REGISTRO.sei} aoFechar={vi.fn()} aoVerHistoricoCpf={vi.fn()} />);

    expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível carregar o detalhamento.");
  });

  // Sprint 18.5.1 — correção B1 da auditoria (RN-08).
  describe("diária não encontrada (404) — resultado de negócio, nunca falha técnica", () => {
    it("mostra um estado neutro/informativo, nunca role=alert", () => {
      useDetalhamentoDiariaMock.mockReturnValue({
        carregando: false,
        erro: null,
        naoEncontrada: true,
        registro: null,
      });
      render(<PainelDetalhamentoDiaria sei="sei-inexistente" aoFechar={vi.fn()} aoVerHistoricoCpf={vi.fn()} />);

      expect(screen.getByText(/Diária não encontrada/)).toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(screen.getByRole("status")).toHaveTextContent(/Diária não encontrada/);
    });
  });

  it("registro carregado: mostra os campos e o CPF sempre mascarado, nunca um controle de revelar", () => {
    useDetalhamentoDiariaMock.mockReturnValue({
      carregando: false,
      erro: null,
      naoEncontrada: false,
      registro: REGISTRO,
    });
    render(<PainelDetalhamentoDiaria sei={REGISTRO.sei} aoFechar={vi.fn()} aoVerHistoricoCpf={vi.fn()} />);

    expect(screen.getByRole("heading", { name: REGISTRO.sei })).toBeInTheDocument();
    expect(screen.getByText("João da Silva")).toBeInTheDocument();
    expect(screen.getByText("Analista · RPPS")).toBeInTheDocument();
    expect(screen.getByText("***.***.***-11")).toBeInTheDocument();
    expect(screen.queryByText("12345678911")).not.toBeInTheDocument();
    expect(screen.getByText("08/01/2025 – 10/01/2025")).toBeInTheDocument();
    expect(screen.getByText("Recife → Araripina-PE")).toBeInTheDocument();
    expect(screen.getByText("Curso · Rodoviário · R$ 480,00")).toBeInTheDocument();

    expect(screen.queryByRole("button", { name: /revelar/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/revelar/i)).not.toBeInTheDocument();
  });

  it("nunca renderiza o botão 'Exportar este registro' (exportação fora do escopo da 18.5)", () => {
    useDetalhamentoDiariaMock.mockReturnValue({
      carregando: false,
      erro: null,
      naoEncontrada: false,
      registro: REGISTRO,
    });
    render(<PainelDetalhamentoDiaria sei={REGISTRO.sei} aoFechar={vi.fn()} aoVerHistoricoCpf={vi.fn()} />);

    expect(screen.queryByRole("button", { name: /Exportar/i })).not.toBeInTheDocument();
  });

  it("clicar em ✕ chama aoFechar", async () => {
    useDetalhamentoDiariaMock.mockReturnValue({
      carregando: false,
      erro: null,
      naoEncontrada: false,
      registro: REGISTRO,
    });
    const usuario = userEvent.setup();
    const aoFechar = vi.fn();
    render(<PainelDetalhamentoDiaria sei={REGISTRO.sei} aoFechar={aoFechar} aoVerHistoricoCpf={vi.fn()} />);

    await usuario.click(screen.getByRole("button", { name: "Fechar detalhamento" }));

    expect(aoFechar).toHaveBeenCalledTimes(1);
  });

  it("clicar no backdrop (fora do painel) chama aoFechar", async () => {
    useDetalhamentoDiariaMock.mockReturnValue({
      carregando: false,
      erro: null,
      naoEncontrada: false,
      registro: REGISTRO,
    });
    const usuario = userEvent.setup();
    const aoFechar = vi.fn();
    render(<PainelDetalhamentoDiaria sei={REGISTRO.sei} aoFechar={aoFechar} aoVerHistoricoCpf={vi.fn()} />);

    await usuario.click(screen.getByRole("dialog").parentElement!);

    expect(aoFechar).toHaveBeenCalledTimes(1);
  });

  it("tecla Esc chama aoFechar (auditoria 19.9 — navegação por teclado em painéis modais)", async () => {
    useDetalhamentoDiariaMock.mockReturnValue({
      carregando: false,
      erro: null,
      naoEncontrada: false,
      registro: REGISTRO,
    });
    const aoFechar = vi.fn();
    render(<PainelDetalhamentoDiaria sei={REGISTRO.sei} aoFechar={aoFechar} aoVerHistoricoCpf={vi.fn()} />);

    fireEvent.keyDown(window, { key: "Escape" });

    expect(aoFechar).toHaveBeenCalledTimes(1);
  });

  it("sei null: Esc não aciona aoFechar (listener não fica pendurado)", () => {
    useDetalhamentoDiariaMock.mockReturnValue({ carregando: false, erro: null, naoEncontrada: false, registro: null });
    const aoFechar = vi.fn();
    render(<PainelDetalhamentoDiaria sei={null} aoFechar={aoFechar} aoVerHistoricoCpf={vi.fn()} />);

    fireEvent.keyDown(window, { key: "Escape" });

    expect(aoFechar).not.toHaveBeenCalled();
  });

  it("clicar dentro do conteúdo do painel não chama aoFechar", async () => {
    useDetalhamentoDiariaMock.mockReturnValue({
      carregando: false,
      erro: null,
      naoEncontrada: false,
      registro: REGISTRO,
    });
    const usuario = userEvent.setup();
    const aoFechar = vi.fn();
    render(<PainelDetalhamentoDiaria sei={REGISTRO.sei} aoFechar={aoFechar} aoVerHistoricoCpf={vi.fn()} />);

    await usuario.click(screen.getByText("João da Silva"));

    expect(aoFechar).not.toHaveBeenCalled();
  });

  // Sprint 19.5.8 — `v2-plano-tecnico.md` § 18: "Ver histórico deste CPF"/
  // "Copiar SEI", extensão de `PainelDetalhamentoDiaria.tsx`.
  describe("ação: Ver histórico deste CPF", () => {
    it("aplica o filtro do CPF deste registro (callback do componente pai) e fecha o painel", async () => {
      useDetalhamentoDiariaMock.mockReturnValue({
        carregando: false,
        erro: null,
        naoEncontrada: false,
        registro: REGISTRO,
      });
      const usuario = userEvent.setup();
      const aoFechar = vi.fn();
      const aoVerHistoricoCpf = vi.fn();
      render(
        <PainelDetalhamentoDiaria sei={REGISTRO.sei} aoFechar={aoFechar} aoVerHistoricoCpf={aoVerHistoricoCpf} />,
      );

      await usuario.click(screen.getByRole("button", { name: "Ver histórico deste CPF" }));

      expect(aoVerHistoricoCpf).toHaveBeenCalledWith(REGISTRO.cpf);
      expect(aoFechar).toHaveBeenCalledTimes(1);
    });

    it("não aparece quando não há registro carregado (carregando/erro/não encontrada)", () => {
      useDetalhamentoDiariaMock.mockReturnValue({ carregando: true, erro: null, naoEncontrada: false, registro: null });
      render(<PainelDetalhamentoDiaria sei={REGISTRO.sei} aoFechar={vi.fn()} aoVerHistoricoCpf={vi.fn()} />);

      expect(screen.queryByRole("button", { name: "Ver histórico deste CPF" })).not.toBeInTheDocument();
    });
  });

  describe("ação: Copiar SEI", () => {
    it("copia o texto exato do SEI exibido via window.api.copiarTexto (mecanismo nativo já homologado, não navigator.clipboard) e mostra sucesso", async () => {
      useDetalhamentoDiariaMock.mockReturnValue({
        carregando: false,
        erro: null,
        naoEncontrada: false,
        registro: REGISTRO,
      });
      const usuario = userEvent.setup();
      render(<PainelDetalhamentoDiaria sei={REGISTRO.sei} aoFechar={vi.fn()} aoVerHistoricoCpf={vi.fn()} />);

      await usuario.click(screen.getByRole("button", { name: "Copiar SEI" }));

      expect(window.api.copiarTexto).toHaveBeenCalledWith(REGISTRO.sei);
      expect(await screen.findByRole("status")).toHaveTextContent("SEI copiado");
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    // Sprint 19.5.8.1 — correção do Bug 3 da Auditoria Técnica (19.5.8
    // REPROVADA): "sucesso" nunca pode aparecer quando a cópia falhou, ficou
    // indisponível, ou a API não existe. Os 3 testes abaixo cobrem os 3
    // cenários pedidos pela auditoria; os 3 falhariam contra o código
    // anterior (que sempre mostrava "SEI copiado" independentemente do
    // resultado real).
    describe("falha na cópia nunca mostra sucesso (correção 19.5.8.1)", () => {
      it("copiarTexto rejeita a Promise: mostra falha, nunca sucesso, e não trava a aplicação", async () => {
        useDetalhamentoDiariaMock.mockReturnValue({
          carregando: false,
          erro: null,
          naoEncontrada: false,
          registro: REGISTRO,
        });
        window.api.copiarTexto = vi.fn().mockRejectedValue(new Error("falha simulada"));
        const usuario = userEvent.setup();
        render(<PainelDetalhamentoDiaria sei={REGISTRO.sei} aoFechar={vi.fn()} aoVerHistoricoCpf={vi.fn()} />);

        await usuario.click(screen.getByRole("button", { name: "Copiar SEI" }));

        expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível copiar o SEI. Tente novamente.");
        expect(screen.queryByRole("status")).not.toBeInTheDocument();
        // A aplicação não trava — o painel e o botão continuam presentes,
        // permitindo tentar de novo.
        expect(screen.getByRole("button", { name: "Copiar SEI" })).toBeInTheDocument();
      });

      it("window.api.copiarTexto ausente (undefined): mostra falha, nunca sucesso", async () => {
        useDetalhamentoDiariaMock.mockReturnValue({
          carregando: false,
          erro: null,
          naoEncontrada: false,
          registro: REGISTRO,
        });
        window.api = {} as unknown as Window["api"];
        const usuario = userEvent.setup();
        render(<PainelDetalhamentoDiaria sei={REGISTRO.sei} aoFechar={vi.fn()} aoVerHistoricoCpf={vi.fn()} />);

        await usuario.click(screen.getByRole("button", { name: "Copiar SEI" }));

        expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível copiar o SEI. Tente novamente.");
        expect(screen.queryByRole("status")).not.toBeInTheDocument();
      });

      it("window.api inteiramente ausente (preload não anexado): mostra falha, nunca sucesso, e não lança exceção não tratada", async () => {
        useDetalhamentoDiariaMock.mockReturnValue({
          carregando: false,
          erro: null,
          naoEncontrada: false,
          registro: REGISTRO,
        });
        // @ts-expect-error — simula o preload não ter anexado `window.api`.
        delete window.api;
        const usuario = userEvent.setup();
        render(<PainelDetalhamentoDiaria sei={REGISTRO.sei} aoFechar={vi.fn()} aoVerHistoricoCpf={vi.fn()} />);

        await usuario.click(screen.getByRole("button", { name: "Copiar SEI" }));

        expect(screen.getByRole("dialog")).toBeInTheDocument();
        expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível copiar o SEI. Tente novamente.");
        expect(screen.queryByRole("status")).not.toBeInTheDocument();
      });
    });

    it("não aparece quando não há registro carregado (carregando/erro/não encontrada)", () => {
      useDetalhamentoDiariaMock.mockReturnValue({ carregando: true, erro: null, naoEncontrada: false, registro: null });
      render(<PainelDetalhamentoDiaria sei={REGISTRO.sei} aoFechar={vi.fn()} aoVerHistoricoCpf={vi.fn()} />);

      expect(screen.queryByRole("button", { name: "Copiar SEI" })).not.toBeInTheDocument();
    });
  });

  // Sprint 19.5.8.1 — correção do Bug 2 da Auditoria Técnica (19.5.8
  // REPROVADA): reproduz exatamente o cenário pedido — abrir A, copiar,
  // fechar, abrir B antes dos 2.4s do temporizador — e falharia contra o
  // código anterior (o feedback de A aparecia em B).
  describe("feedback de cópia não vaza entre registros (correção 19.5.8.1)", () => {
    it("copiar o SEI do registro A, fechar e abrir o registro B antes de 2,4s: 'SEI copiado' não aparece em B", async () => {
      useDetalhamentoDiariaMock.mockReturnValue({
        carregando: false,
        erro: null,
        naoEncontrada: false,
        registro: REGISTRO,
      });
      const usuario = userEvent.setup();
      const { rerender } = render(
        <PainelDetalhamentoDiaria sei={REGISTRO.sei} aoFechar={vi.fn()} aoVerHistoricoCpf={vi.fn()} />,
      );

      await usuario.click(screen.getByRole("button", { name: "Copiar SEI" }));
      expect(await screen.findByRole("status")).toHaveTextContent("SEI copiado");

      // Fecha o painel (sei -> null, mesma prop que `CentralAnalitica.tsx`
      // usa) e reabre com um registro diferente — tudo dentro da janela de
      // 2400ms do feedback anterior (nenhum `setTimeout` real é esperado
      // aqui, então o teste roda bem antes desse prazo).
      rerender(<PainelDetalhamentoDiaria sei={null} aoFechar={vi.fn()} aoVerHistoricoCpf={vi.fn()} />);
      useDetalhamentoDiariaMock.mockReturnValue({
        carregando: false,
        erro: null,
        naoEncontrada: false,
        registro: REGISTRO_B,
      });
      rerender(<PainelDetalhamentoDiaria sei={REGISTRO_B.sei} aoFechar={vi.fn()} aoVerHistoricoCpf={vi.fn()} />);

      expect(screen.queryByRole("status")).not.toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();

      // Copiar o SEI do novo registro continua funcionando normalmente.
      await usuario.click(screen.getByRole("button", { name: "Copiar SEI" }));
      expect(window.api.copiarTexto).toHaveBeenCalledWith(REGISTRO_B.sei);
      expect(await screen.findByRole("status")).toHaveTextContent("SEI copiado");
    });
  });

  // Sprint 19.5.8.2 — correção da condição de corrida encontrada na
  // Auditoria Técnica da 19.5.8.1: duas (ou mais) chamadas de `copiarSei`
  // sobrepostas no MESMO registro. Todos os testes abaixo usam Promises
  // controladas manualmente (`resolver`/`rejeitar` guardados fora) para
  // forçar interleavings específicos que `mockResolvedValue` sozinho não
  // reproduz de forma determinística, e `fireEvent.click` (síncrono) em vez
  // de `userEvent` para dois cliques ficarem em andamento ao mesmo tempo
  // sem esperar um terminar antes do outro começar.
  describe("condição de corrida entre chamadas sobrepostas de Copiar SEI (correção 19.5.8.2)", () => {
    beforeEach(() => {
      useDetalhamentoDiariaMock.mockReturnValue({
        carregando: false,
        erro: null,
        naoEncontrada: false,
        registro: REGISTRO,
      });
    });

    it("3 chamadas sobrepostas com resolução em ordem totalmente diferente da invocação: só o resultado da mais recente (3ª, falha) prevalece no final", async () => {
      let resolverChamada1!: () => void;
      let resolverChamada2!: () => void;
      let rejeitarChamada3!: (erro: Error) => void;
      const promessa1 = new Promise<void>((r) => {
        resolverChamada1 = r;
      });
      const promessa2 = new Promise<void>((r) => {
        resolverChamada2 = r;
      });
      const promessa3 = new Promise<void>((_r, rej) => {
        rejeitarChamada3 = rej;
      });
      window.api.copiarTexto = vi
        .fn()
        .mockImplementationOnce(() => promessa1)
        .mockImplementationOnce(() => promessa2)
        .mockImplementationOnce(() => promessa3);
      render(<PainelDetalhamentoDiaria sei={REGISTRO.sei} aoFechar={vi.fn()} aoVerHistoricoCpf={vi.fn()} />);
      const botao = screen.getByRole("button", { name: "Copiar SEI" });

      fireEvent.click(botao); // chamada 1 (mais antiga, vai suceder)
      fireEvent.click(botao); // chamada 2 (do meio, vai suceder)
      fireEvent.click(botao); // chamada 3 (mais recente, vai FALHAR)

      // Ordem de resolução deliberadamente embaralhada, nada a ver com a
      // ordem de invocação: 2ª primeiro, depois a 3ª (mais recente), e só
      // por último a 1ª (mais antiga de todas).
      resolverChamada2();
      await Promise.resolve();
      await Promise.resolve();

      rejeitarChamada3(new Error("falha simulada"));
      await Promise.resolve();
      await Promise.resolve();
      expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível copiar o SEI. Tente novamente.");

      // A mais antiga de todas (1) resolve por último, com sucesso — não
      // pode reverter a falha da chamada mais recente (3), que é a que
      // realmente importa.
      resolverChamada1();
      await Promise.resolve();
      await Promise.resolve();

      expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível copiar o SEI. Tente novamente.");
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });

    it("timeout da chamada antiga não limpa o feedback da chamada nova (nem cedo, nem tarde)", async () => {
      vi.useFakeTimers();
      try {
        let resolverChamada1!: () => void;
        let resolverChamada2!: () => void;
        const promessa1 = new Promise<void>((r) => {
          resolverChamada1 = r;
        });
        const promessa2 = new Promise<void>((r) => {
          resolverChamada2 = r;
        });
        window.api.copiarTexto = vi
          .fn()
          .mockImplementationOnce(() => promessa1)
          .mockImplementationOnce(() => promessa2);
        render(<PainelDetalhamentoDiaria sei={REGISTRO.sei} aoFechar={vi.fn()} aoVerHistoricoCpf={vi.fn()} />);
        const botao = screen.getByRole("button", { name: "Copiar SEI" });

        fireEvent.click(botao); // chamada 1
        fireEvent.click(botao); // chamada 2, ainda com a 1 pendente

        // Chamada 1 resolve rápido — antes da correção, isso agendaria um
        // timeout para t+2400 que nada cancelaria depois.
        resolverChamada1();
        await vi.advanceTimersByTimeAsync(0);

        // Chamada 2 (a que realmente importa) só resolve 2000ms depois.
        await vi.advanceTimersByTimeAsync(2000);
        resolverChamada2();
        await vi.advanceTimersByTimeAsync(0);
        expect(screen.getByText("✓ SEI copiado")).toBeInTheDocument();

        // Avança só até o instante em que o timeout ÓRFÃO da chamada 1
        // dispararia (2400ms desde que ela resolveu, ou seja, 400ms a
        // partir de agora) — o feedback da chamada 2 deveria durar até
        // 2400ms *dela*, ou seja, ainda faltam ~2000ms.
        await vi.advanceTimersByTimeAsync(400);
        expect(screen.getByText("✓ SEI copiado")).toBeInTheDocument();

        // Só desaparece quando os 2400ms da chamada 2 (a vigente) de fato
        // se completam.
        await vi.advanceTimersByTimeAsync(2000);
        expect(screen.queryByText("✓ SEI copiado")).not.toBeInTheDocument();
      } finally {
        vi.useRealTimers();
      }
    });

    it("sucesso (mais antigo) seguido de falha (mais recente): o resultado final é falha", async () => {
      let resolverChamada1!: () => void;
      let rejeitarChamada2!: (erro: Error) => void;
      const promessa1 = new Promise<void>((r) => {
        resolverChamada1 = r;
      });
      const promessa2 = new Promise<void>((_r, rej) => {
        rejeitarChamada2 = rej;
      });
      window.api.copiarTexto = vi
        .fn()
        .mockImplementationOnce(() => promessa1)
        .mockImplementationOnce(() => promessa2);
      render(<PainelDetalhamentoDiaria sei={REGISTRO.sei} aoFechar={vi.fn()} aoVerHistoricoCpf={vi.fn()} />);
      const botao = screen.getByRole("button", { name: "Copiar SEI" });

      fireEvent.click(botao); // chamada 1 (vai suceder)
      fireEvent.click(botao); // chamada 2, mais recente (vai falhar)

      // A mais recente (2) resolve primeiro — falha.
      rejeitarChamada2(new Error("falha simulada"));
      await Promise.resolve();
      await Promise.resolve();
      expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível copiar o SEI. Tente novamente.");

      // A mais antiga (1) só sucede depois — não pode substituir a falha
      // da tentativa mais recente por um sucesso desatualizado.
      resolverChamada1();
      await Promise.resolve();
      await Promise.resolve();

      expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível copiar o SEI. Tente novamente.");
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });

    it("falha (mais antiga) seguida de sucesso (mais recente): o resultado final é sucesso", async () => {
      let rejeitarChamada1!: (erro: Error) => void;
      let resolverChamada2!: () => void;
      const promessa1 = new Promise<void>((_r, rej) => {
        rejeitarChamada1 = rej;
      });
      const promessa2 = new Promise<void>((r) => {
        resolverChamada2 = r;
      });
      window.api.copiarTexto = vi
        .fn()
        .mockImplementationOnce(() => promessa1)
        .mockImplementationOnce(() => promessa2);
      render(<PainelDetalhamentoDiaria sei={REGISTRO.sei} aoFechar={vi.fn()} aoVerHistoricoCpf={vi.fn()} />);
      const botao = screen.getByRole("button", { name: "Copiar SEI" });

      fireEvent.click(botao); // chamada 1 (vai falhar)
      fireEvent.click(botao); // chamada 2, mais recente (vai suceder)

      // A mais recente (2) resolve primeiro — sucesso.
      resolverChamada2();
      await Promise.resolve();
      await Promise.resolve();
      expect(await screen.findByRole("status")).toHaveTextContent("SEI copiado");

      // A mais antiga (1) só falha depois — não pode substituir o sucesso
      // da tentativa mais recente por uma falha desatualizada.
      rejeitarChamada1(new Error("falha simulada, tardia"));
      await Promise.resolve();
      await Promise.resolve();

      expect(screen.getByText("✓ SEI copiado")).toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("múltiplos cliques rápidos (3+) mantêm só o resultado da última chamada, todas as anteriores são descartadas", async () => {
      const resolvers: Array<() => void> = [];
      const copiarTextoMock = vi.fn().mockImplementation(
        () =>
          new Promise<void>((r) => {
            resolvers.push(r);
          }),
      );
      window.api.copiarTexto = copiarTextoMock;
      render(<PainelDetalhamentoDiaria sei={REGISTRO.sei} aoFechar={vi.fn()} aoVerHistoricoCpf={vi.fn()} />);
      const botao = screen.getByRole("button", { name: "Copiar SEI" });

      // 4 cliques rápidos, nenhum resolvido ainda.
      fireEvent.click(botao);
      fireEvent.click(botao);
      fireEvent.click(botao);
      fireEvent.click(botao);
      expect(copiarTextoMock).toHaveBeenCalledTimes(4);
      expect(resolvers).toHaveLength(4);

      // As 3 primeiras resolvem (fora de ordem, para não deixar dúvida) —
      // nenhuma delas deveria conseguir tocar o estado final.
      resolvers[1]();
      resolvers[0]();
      resolvers[2]();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      // Só a 4ª (a mais recente de todas) ainda está pendente — o painel
      // não deveria mostrar sucesso nem falha por causa das 3 anteriores.
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();

      // A 4ª (a vigente) resolve por último.
      resolvers[3]();
      await Promise.resolve();
      await Promise.resolve();

      expect(await screen.findByRole("status")).toHaveTextContent("SEI copiado");
    });
  });

  // Sprint 18.5.1 — correção NC4 da auditoria: gestão de foco.
  describe("foco", () => {
    it("ao abrir, move o foco para o título do painel", () => {
      useDetalhamentoDiariaMock.mockReturnValue({
        carregando: false,
        erro: null,
        naoEncontrada: false,
        registro: REGISTRO,
      });
      render(<PainelDetalhamentoDiaria sei={REGISTRO.sei} aoFechar={vi.fn()} aoVerHistoricoCpf={vi.fn()} />);

      expect(screen.getByRole("heading", { name: REGISTRO.sei })).toHaveFocus();
    });

    it("ao fechar, devolve o foco ao elemento que estava focado antes de abrir", () => {
      useDetalhamentoDiariaMock.mockReturnValue({
        carregando: false,
        erro: null,
        naoEncontrada: false,
        registro: REGISTRO,
      });
      const { rerender } = render(
        <>
          <button type="button">Linha da tabela</button>
          <PainelDetalhamentoDiaria sei={null} aoFechar={vi.fn()} aoVerHistoricoCpf={vi.fn()} />
        </>,
      );

      const linhaDaTabela = screen.getByRole("button", { name: "Linha da tabela" });
      linhaDaTabela.focus();
      expect(linhaDaTabela).toHaveFocus();

      rerender(
        <>
          <button type="button">Linha da tabela</button>
          <PainelDetalhamentoDiaria sei={REGISTRO.sei} aoFechar={vi.fn()} aoVerHistoricoCpf={vi.fn()} />
        </>,
      );
      expect(screen.getByRole("heading", { name: REGISTRO.sei })).toHaveFocus();

      rerender(
        <>
          <button type="button">Linha da tabela</button>
          <PainelDetalhamentoDiaria sei={null} aoFechar={vi.fn()} aoVerHistoricoCpf={vi.fn()} />
        </>,
      );

      expect(screen.getByRole("button", { name: "Linha da tabela" })).toHaveFocus();
    });

    // Sprint 19.5.8 — o painel agora tem 3 elementos focáveis quando há
    // registro carregado (Fechar, "Ver histórico deste CPF", "Copiar SEI",
    // nesta ordem no DOM) — antes da 19.5.8 era só o botão "✕", caso em que
    // o *wrap* trivialmente mantinha o foco no mesmo elemento. Os dois
    // testes abaixo cobrem o *wrap* real entre o primeiro e o último agora
    // que existe mais de um.
    it("Tab a partir do último elemento focável do painel volta para o primeiro (focus trap)", async () => {
      useDetalhamentoDiariaMock.mockReturnValue({
        carregando: false,
        erro: null,
        naoEncontrada: false,
        registro: REGISTRO,
      });
      const usuario = userEvent.setup();
      render(
        <>
          <button type="button">Antes do painel</button>
          <PainelDetalhamentoDiaria sei={REGISTRO.sei} aoFechar={vi.fn()} aoVerHistoricoCpf={vi.fn()} />
          <button type="button">Depois do painel</button>
        </>,
      );

      const botaoFechar = screen.getByRole("button", { name: "Fechar detalhamento" });
      const botaoCopiarSei = screen.getByRole("button", { name: "Copiar SEI" });
      botaoCopiarSei.focus();
      expect(botaoCopiarSei).toHaveFocus();

      await usuario.tab();

      expect(botaoFechar).toHaveFocus();
    });

    // Sprint 18.5.1.1 — correção B1 da auditoria da 18.5.1: reproduz
    // exatamente o bug relatado (Shift+Tab como a primeiríssima tecla,
    // ainda com o foco no título, escapava do painel). Este teste falha
    // contra o código anterior à correção — o foco antigo ia para
    // "Elemento externo", fora do `role="dialog"`.
    it("Shift+Tab logo após abrir (foco ainda no título) vai para o último elemento focável do painel, nunca escapa", async () => {
      useDetalhamentoDiariaMock.mockReturnValue({
        carregando: false,
        erro: null,
        naoEncontrada: false,
        registro: REGISTRO,
      });
      const usuario = userEvent.setup();
      render(
        <>
          <button type="button">Elemento externo</button>
          <PainelDetalhamentoDiaria sei={REGISTRO.sei} aoFechar={vi.fn()} aoVerHistoricoCpf={vi.fn()} />
        </>,
      );

      const titulo = screen.getByRole("heading", { name: REGISTRO.sei });
      const dialogo = screen.getByRole("dialog");
      const botaoCopiarSei = screen.getByRole("button", { name: "Copiar SEI" });

      // Confirma o ponto de partida do bug: foco no título ao abrir.
      expect(titulo).toHaveFocus();

      await usuario.tab({ shift: true });

      // Nunca escapa para fora do painel.
      expect(dialogo).toContainElement(document.activeElement as HTMLElement);
      // Vai especificamente para o último elemento focável do painel — hoje
      // "Copiar SEI" (Sprint 19.5.8 acrescentou 2 botões após "✕").
      expect(botaoCopiarSei).toHaveFocus();
    });
  });

  // --- Sprint 19.8.4 — Avisos e diagnósticos (§ 12.5) ---------------------

  describe("Avisos e diagnósticos", () => {
    it("diagnosticos: [] mostra a mensagem explícita de 'nenhum diagnóstico aplicável'", () => {
      useDetalhamentoDiariaMock.mockReturnValue({
        carregando: false,
        erro: null,
        naoEncontrada: false,
        registro: { ...REGISTRO, diagnosticos: [] },
      });
      render(<PainelDetalhamentoDiaria sei={REGISTRO.sei} aoFechar={vi.fn()} aoVerHistoricoCpf={vi.fn()} />);

      expect(screen.getByRole("heading", { name: "Avisos e diagnósticos" })).toBeInTheDocument();
      expect(screen.getByText("Nenhum diagnóstico aplicável a este registro.")).toBeInTheDocument();
    });

    it("mostra um CartaoDiagnostico por caso aplicável", () => {
      useDetalhamentoDiariaMock.mockReturnValue({
        carregando: false,
        erro: null,
        naoEncontrada: false,
        registro: {
          ...REGISTRO,
          diagnosticos: [
            { campo: "dh", titulo: "Documento Hábil (DH) ainda não emitido", motivo: "motivo 1", acao_recomendada: "ação 1" },
            { campo: "valor_total_diarias", titulo: "Valor das diárias ausente", motivo: "motivo 2", acao_recomendada: "ação 2" },
          ],
        },
      });
      render(<PainelDetalhamentoDiaria sei={REGISTRO.sei} aoFechar={vi.fn()} aoVerHistoricoCpf={vi.fn()} />);

      expect(screen.getByText("Documento Hábil (DH) ainda não emitido")).toBeInTheDocument();
      expect(screen.getByText("Valor das diárias ausente")).toBeInTheDocument();
      expect(screen.getByText(/motivo 1/)).toBeInTheDocument();
      expect(screen.getByText(/motivo 2/)).toBeInTheDocument();
    });

    it("cartões de diagnóstico nunca mostram um selo de classificação (contrato de GET /diarias/{sei} não a carrega)", () => {
      useDetalhamentoDiariaMock.mockReturnValue({
        carregando: false,
        erro: null,
        naoEncontrada: false,
        registro: {
          ...REGISTRO,
          diagnosticos: [
            { campo: "dh", titulo: "Documento Hábil (DH) ainda não emitido", motivo: "motivo", acao_recomendada: "ação" },
          ],
        },
      });
      render(<PainelDetalhamentoDiaria sei={REGISTRO.sei} aoFechar={vi.fn()} aoVerHistoricoCpf={vi.fn()} />);

      expect(screen.queryByText("Esperado")).not.toBeInTheDocument();
      expect(screen.queryByText("Atenção")).not.toBeInTheDocument();
      expect(screen.queryByText("Inconsistência")).not.toBeInTheDocument();
    });

    it("emFoco='diagnosticos': o foco inicial vai para o bloco 'Avisos e diagnósticos', não para o título", () => {
      useDetalhamentoDiariaMock.mockReturnValue({
        carregando: false,
        erro: null,
        naoEncontrada: false,
        registro: REGISTRO,
      });
      render(
        <PainelDetalhamentoDiaria sei={REGISTRO.sei} aoFechar={vi.fn()} aoVerHistoricoCpf={vi.fn()} emFoco="diagnosticos" />,
      );

      expect(screen.getByRole("heading", { name: "Avisos e diagnósticos" })).toHaveFocus();
      expect(screen.getByRole("heading", { name: REGISTRO.sei })).not.toHaveFocus();
    });

    it("DH vazio e PASSAR DIA aplicáveis ao mesmo registro: renderizam como 2 cartões distintos, nunca fundidos num só (auditoria DH × PASSAR DIA, agora na UI)", () => {
      useDetalhamentoDiariaMock.mockReturnValue({
        carregando: false,
        erro: null,
        naoEncontrada: false,
        registro: {
          ...REGISTRO,
          diagnosticos: [
            {
              campo: "dh",
              titulo: "Documento Hábil (DH) ainda não emitido",
              motivo: "O Documento Hábil está vazio...",
              acao_recomendada: "Nenhuma ação imediata...",
            },
            {
              campo: null,
              titulo: "Aguardando liberação",
              motivo: "Condição de tempo prevista em regra, não um dado ausente...",
              acao_recomendada: "Nenhuma ação imediata — aguarde a data de liberação.",
            },
          ],
        },
      });
      render(<PainelDetalhamentoDiaria sei={REGISTRO.sei} aoFechar={vi.fn()} aoVerHistoricoCpf={vi.fn()} />);

      const cartaoDh = screen.getByText("Documento Hábil (DH) ainda não emitido").closest("div")!;
      const cartaoPassarDia = screen.getByText("Aguardando liberação").closest("div")!;
      expect(cartaoDh).not.toBe(cartaoPassarDia);
      expect(cartaoDh).not.toContainElement(screen.getByText("Aguardando liberação"));
      expect(cartaoPassarDia).not.toContainElement(screen.getByText("Documento Hábil (DH) ainda não emitido"));
    });

    it("sem emFoco (padrão): comportamento já homologado preservado — foco continua no título", () => {
      useDetalhamentoDiariaMock.mockReturnValue({
        carregando: false,
        erro: null,
        naoEncontrada: false,
        registro: REGISTRO,
      });
      render(<PainelDetalhamentoDiaria sei={REGISTRO.sei} aoFechar={vi.fn()} aoVerHistoricoCpf={vi.fn()} />);

      expect(screen.getByRole("heading", { name: REGISTRO.sei })).toHaveFocus();
    });
  });
});
