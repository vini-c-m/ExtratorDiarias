// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CentralRegularizacaoDH from "./CentralRegularizacaoDH";
import { ErroAnaliticaIndisponivel } from "../services/api";
import type { DetalheProcessoAguardandoDH, ListaProcessosAguardandoDH } from "../types/regularizacaoDh";

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

vi.mock("../services/api", async (importarOriginal) => {
  const real = await importarOriginal<typeof import("../services/api")>();
  return {
    ...real,
    listarProcessosAguardandoDH: vi.fn(),
    detalharProcessoAguardandoDH: vi.fn(),
    registrarDH: vi.fn(),
  };
});

import { detalharProcessoAguardandoDH, listarProcessosAguardandoDH, registrarDH } from "../services/api";

const listarMock = vi.mocked(listarProcessosAguardandoDH);
const detalharMock = vi.mocked(detalharProcessoAguardandoDH);
const registrarDHMock = vi.mocked(registrarDH);

const PROCESSO_1: ListaProcessosAguardandoDH["processos"][number] = {
  sei: "19.20.0009.0000001/2026-01",
  servidor_nome: "Maria Souza",
  cpf_mascarado: "***.***.***-11",
  categoria_funcional: "SERVIDOR",
  periodo: { inicial: "2026-08-10", final: "2026-08-12" },
  trecho: { origem: "RECIFE", destino: "GARANHUNS" },
  situacao: "aguardando_liberacao",
  mensagem: "Documento Hábil ainda não disponível. Aguardar a data de liberação.",
  data_liberacao_prevista: "2026-08-20",
  dias_restantes: 5,
  dias_atraso: null,
  texto_contagem: "Liberação prevista para 20/08/2026 — faltam 5 dias.",
};

const PROCESSO_2: ListaProcessosAguardandoDH["processos"][number] = {
  sei: "19.20.0009.0000002/2026-02",
  servidor_nome: "Herbet Gonçalves Santos",
  cpf_mascarado: "***.***.***-22",
  categoria_funcional: "MEMBRO",
  periodo: { inicial: "2026-07-01", final: "2026-07-03" },
  trecho: { origem: "RECIFE", destino: "FORTALEZA" },
  situacao: "revisao_manual_necessaria",
  mensagem: "Documento Hábil pendente. A data de liberação já foi atingida. Recomenda-se análise manual.",
  data_liberacao_prevista: "2026-06-16",
  dias_restantes: null,
  dias_atraso: 30,
  texto_contagem: null,
};

// Micro-sprint C — Histórico/Valor sempre presentes no contrato (nunca
// `undefined`); "gerado"/"disponivel" é o caso feliz padrão usado pela
// maioria dos testes já existentes desta Micro-sprint B, que não testam
// Histórico/Valor em si.
const DETALHE_PROCESSO_1: DetalheProcessoAguardandoDH = {
  sei: PROCESSO_1.sei,
  servidor_nome: PROCESSO_1.servidor_nome,
  cpf_mascarado: PROCESSO_1.cpf_mascarado,
  categoria_funcional: PROCESSO_1.categoria_funcional,
  periodo: PROCESSO_1.periodo,
  trecho: PROCESSO_1.trecho,
  ainda_aguardando_dh: true,
  situacao: PROCESSO_1.situacao,
  mensagem: PROCESSO_1.mensagem,
  data_liberacao_prevista: PROCESSO_1.data_liberacao_prevista,
  dias_restantes: PROCESSO_1.dias_restantes,
  dias_atraso: PROCESSO_1.dias_atraso,
  texto_contagem: PROCESSO_1.texto_contagem,
  historico: {
    situacao: "gerado",
    texto: "19.20.0009.0000001/2026-01 MARIA SOUZA 02 (DUAS) DIÁRIAS INTEGRAIS E UMA PARCIAL, DEST. GARANHUNS, NO PERÍODO DE 10/08/2026 A 12/08/2026.",
    motivo: null,
  },
  valor: { situacao: "disponivel", valor: "1386.81", motivo: null },
};

beforeEach(() => {
  listarMock.mockResolvedValue({ total: 2, processos: [PROCESSO_1, PROCESSO_2] });
  detalharMock.mockResolvedValue(DETALHE_PROCESSO_1);
  window.api = {
    getPathForFile: (arquivo: File) => arquivo.name,
    abrirArquivo: vi.fn(),
    salvarComo: vi.fn(),
    salvarRelatorio: vi.fn(),
    copiarHistorico: vi.fn(),
    selecionarPlanilhaOficial: vi.fn(),
    copiarTexto: vi.fn(),
  };
});

describe("CentralRegularizacaoDH", () => {
  it("renderiza o título e a lista de processos aguardando DH", async () => {
    render(<CentralRegularizacaoDH backendOnline />);

    expect(screen.getByText("Central de Regularização de DH")).toBeInTheDocument();
    expect(await screen.findByText("19.20.0009.0000001/2026-01")).toBeInTheDocument();
    expect(screen.getByText("19.20.0009.0000002/2026-02")).toBeInTheDocument();
  });

  it("mostra o contador de processos", async () => {
    render(<CentralRegularizacaoDH backendOnline />);

    expect(await screen.findByText("2 processos aguardando DH")).toBeInTheDocument();
  });

  it("mostra o estado de carregamento antes da resposta chegar", () => {
    listarMock.mockImplementation(() => new Promise(() => {})); // nunca resolve
    render(<CentralRegularizacaoDH backendOnline />);

    expect(screen.getByText("Carregando processos aguardando DH...")).toBeInTheDocument();
  });

  it("lista vazia mostra mensagem informativa, nunca um erro", async () => {
    listarMock.mockResolvedValue({ total: 0, processos: [] });
    render(<CentralRegularizacaoDH backendOnline />);

    expect(await screen.findByText("Nenhum processo aguardando DH no momento.")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("falha ao carregar mostra alerta de erro com opção de tentar novamente", async () => {
    listarMock.mockRejectedValue(new ErroAnaliticaIndisponivel());
    render(<CentralRegularizacaoDH backendOnline />);

    expect(
      await screen.findByText(/Não foi possível acessar os registros da Central Analítica/),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Atualizar" })).toBeInTheDocument();
  });

  it("botão 'Atualizar' reconsulta a mesma fonte, sem sincronizar nem gravar nada", async () => {
    const usuario = userEvent.setup();
    render(<CentralRegularizacaoDH backendOnline />);
    await screen.findByText("19.20.0009.0000001/2026-01");
    expect(listarMock).toHaveBeenCalledTimes(1);

    await usuario.click(screen.getByRole("button", { name: "Atualizar" }));

    expect(listarMock).toHaveBeenCalledTimes(2);
  });

  it("selecionar um processo abre o detalhe correto", async () => {
    const usuario = userEvent.setup();
    render(<CentralRegularizacaoDH backendOnline />);
    await screen.findByText("19.20.0009.0000001/2026-01");

    await usuario.click(screen.getByText("19.20.0009.0000001/2026-01"));

    expect(detalharMock).toHaveBeenCalledWith("19.20.0009.0000001/2026-01");
    expect(await screen.findByText("← Voltar à lista")).toBeInTheDocument();
  });

  it("detalhe mostra SEI, Servidor, CPF, Período, Trecho e Status", async () => {
    const usuario = userEvent.setup();
    render(<CentralRegularizacaoDH backendOnline />);
    await usuario.click(await screen.findByText("19.20.0009.0000001/2026-01"));

    await screen.findByText("← Voltar à lista");
    expect(screen.getByText("Maria Souza")).toBeInTheDocument();
    expect(screen.getByText("***.***.***-11")).toBeInTheDocument();
    expect(screen.getByText("RECIFE - GARANHUNS")).toBeInTheDocument();
    expect(screen.getByText("Aguardando DH")).toBeInTheDocument();
  });

  it("'Voltar à lista' retorna à listagem", async () => {
    const usuario = userEvent.setup();
    render(<CentralRegularizacaoDH backendOnline />);
    await usuario.click(await screen.findByText("19.20.0009.0000001/2026-01"));
    await screen.findByText("← Voltar à lista");

    await usuario.click(screen.getByText("← Voltar à lista"));

    expect(screen.getByText("2 processos aguardando DH")).toBeInTheDocument();
  });

  // Micro-sprint D ("Escrita Exclusiva do DH") substitui a antiga proibição
  // P0 da Micro-sprint B (que só valia enquanto a escrita não existia) pela
  // confirmação de que o campo/botão agora aparecem corretamente — a
  // capacidade de escrita em si é coberta em detalhe no describe abaixo.
  it("mostra o campo 'Número do DH' e o botão 'Registrar DH' quando o processo ainda está aguardando DH", async () => {
    const usuario = userEvent.setup();
    render(<CentralRegularizacaoDH backendOnline />);
    await usuario.click(await screen.findByText("19.20.0009.0000001/2026-01"));
    await screen.findByText("← Voltar à lista");

    expect(screen.getByLabelText("Número do DH")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Registrar DH" })).toBeInTheDocument();
  });
});

async function abrirDetalhe(usuario: ReturnType<typeof userEvent.setup>) {
  render(<CentralRegularizacaoDH backendOnline />);
  await usuario.click(await screen.findByText("19.20.0009.0000001/2026-01"));
  await screen.findByText("← Voltar à lista");
}

describe("CentralRegularizacaoDH — Histórico e-Fisco + Valor (Micro-sprint C)", () => {
  it("Histórico aparece e o botão copia exatamente o texto homologado", async () => {
    const usuario = userEvent.setup();
    await abrirDetalhe(usuario);

    expect(screen.getByText(DETALHE_PROCESSO_1.historico.texto!)).toBeInTheDocument();

    await usuario.click(screen.getByRole("button", { name: /Copiar Histórico/ }));
    expect(window.api.copiarHistorico).toHaveBeenCalledWith(DETALHE_PROCESSO_1.historico.texto);
  });

  it("Valor aparece sem 'R$', com vírgula decimal, e o botão copia só o número", async () => {
    const usuario = userEvent.setup();
    await abrirDetalhe(usuario);

    expect(screen.getByText("1386,81")).toBeInTheDocument();
    expect(screen.queryByText(/R\$/)).not.toBeInTheDocument();

    await usuario.click(screen.getByRole("button", { name: /Copiar Valor/ }));
    expect(window.api.copiarTexto).toHaveBeenCalledWith("1386,81");
  });

  it("Cenário A — Histórico OK + Valor OK: os dois aparecem juntos", async () => {
    const usuario = userEvent.setup();
    await abrirDetalhe(usuario);

    expect(screen.getByText("Histórico e-Fisco")).toBeInTheDocument();
    expect(screen.getByText(DETALHE_PROCESSO_1.historico.texto!)).toBeInTheDocument();
    expect(screen.getByText("Valor")).toBeInTheDocument();
    expect(screen.getByText("1386,81")).toBeInTheDocument();
  });

  it("Cenário B — Histórico OK + Valor indisponível: mostra Histórico normalmente e aviso no Valor", async () => {
    detalharMock.mockResolvedValue({
      ...DETALHE_PROCESSO_1,
      valor: { situacao: "indisponivel", valor: null, motivo: "Valor da diária não disponível no registro." },
    });
    const usuario = userEvent.setup();
    await abrirDetalhe(usuario);

    expect(screen.getByText(DETALHE_PROCESSO_1.historico.texto!)).toBeInTheDocument();
    expect(screen.getByText("Valor da diária não disponível no registro.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Copiar Valor/ })).not.toBeInTheDocument();
  });

  it("Cenário C — Histórico indisponível + Valor OK: mostra aviso no Histórico e Valor normalmente", async () => {
    detalharMock.mockResolvedValue({
      ...DETALHE_PROCESSO_1,
      historico: {
        situacao: "indisponivel",
        texto: null,
        motivo: "Destino não disponível no registro (trecho histórico não separável em origem/destino).",
      },
    });
    const usuario = userEvent.setup();
    await abrirDetalhe(usuario);

    expect(
      screen.getByText(/Não foi possível gerar automaticamente o Histórico e-Fisco/),
    ).toBeInTheDocument();
    expect(screen.getByText("1386,81")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Copiar Histórico/ })).not.toBeInTheDocument();
  });

  it("Cenário D — ambos indisponíveis: processo continua visível, com as duas explicações", async () => {
    detalharMock.mockResolvedValue({
      ...DETALHE_PROCESSO_1,
      historico: { situacao: "indisponivel", texto: null, motivo: "Destino não disponível no registro." },
      valor: { situacao: "indisponivel", valor: null, motivo: "Valor da diária não disponível no registro." },
    });
    const usuario = userEvent.setup();
    await abrirDetalhe(usuario);

    expect(screen.getByText("19.20.0009.0000001/2026-01")).toBeInTheDocument(); // SEI do card continua
    expect(
      screen.getByText(/Não foi possível gerar automaticamente o Histórico e-Fisco/),
    ).toBeInTheDocument();
    expect(screen.getByText("Valor da diária não disponível no registro.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Copiar Histórico/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Copiar Valor/ })).not.toBeInTheDocument();
  });

  it("Membro: Histórico e Valor aparecem exatamente como para Servidor (mesma composição)", async () => {
    detalharMock.mockResolvedValue({
      ...DETALHE_PROCESSO_1,
      categoria_funcional: "MEMBRO",
      servidor_nome: "Herbet Gonçalves Santos",
      historico: { situacao: "gerado", texto: "TEXTO NORMAL DO HISTORICO DE MEMBRO", motivo: null },
      valor: { situacao: "disponivel", valor: "1560.66", motivo: null },
    });
    const usuario = userEvent.setup();
    await abrirDetalhe(usuario);

    expect(screen.getByText("TEXTO NORMAL DO HISTORICO DE MEMBRO")).toBeInTheDocument();
    expect(screen.getByText("1560,66")).toBeInTheDocument();
  });

  it("processo com falha de Histórico e Valor ainda assim nunca perde os campos de identificação do processo", async () => {
    detalharMock.mockResolvedValue({
      ...DETALHE_PROCESSO_1,
      historico: { situacao: "indisponivel", texto: null, motivo: "Falha." },
      valor: { situacao: "indisponivel", valor: null, motivo: "Falha." },
    });
    const usuario = userEvent.setup();
    await abrirDetalhe(usuario);

    expect(screen.getByText("Maria Souza")).toBeInTheDocument();
    expect(screen.getByText("RECIFE - GARANHUNS")).toBeInTheDocument();
    expect(screen.getByText("Aguardando DH")).toBeInTheDocument();
  });

  it("campo/botão de escrita de DH (Micro-sprint D) coexistem normalmente com Histórico e Valor", async () => {
    const usuario = userEvent.setup();
    await abrirDetalhe(usuario);

    expect(screen.getByText(DETALHE_PROCESSO_1.historico.texto!)).toBeInTheDocument();
    expect(screen.getByText("1386,81")).toBeInTheDocument();
    expect(screen.getByLabelText("Número do DH")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Registrar DH" })).toBeInTheDocument();
  });
});

describe("CentralRegularizacaoDH — Registrar DH (Micro-sprint D)", () => {
  it("botão desabilitado até digitar um DH; digitar habilita", async () => {
    const usuario = userEvent.setup();
    await abrirDetalhe(usuario);

    expect(screen.getByRole("button", { name: "Registrar DH" })).toBeDisabled();

    await usuario.type(screen.getByLabelText("Número do DH"), "2026DH000123");
    expect(screen.getByRole("button", { name: "Registrar DH" })).toBeEnabled();
  });

  it("gravação concluída: mostra confirmação, atualiza o detalhe e a lista (mesma fonte homologada)", async () => {
    registrarDHMock.mockResolvedValue({
      situacao: "concluido",
      sei: PROCESSO_1.sei,
      dh: "2026DH000123",
      mensagem: "Documento Hábil registrado com sucesso.",
    });
    detalharMock
      .mockResolvedValueOnce(DETALHE_PROCESSO_1)
      .mockResolvedValueOnce({ ...DETALHE_PROCESSO_1, ainda_aguardando_dh: false, situacao: null });
    listarMock
      .mockResolvedValueOnce({ total: 2, processos: [PROCESSO_1, PROCESSO_2] })
      .mockResolvedValueOnce({ total: 1, processos: [PROCESSO_2] });

    const usuario = userEvent.setup();
    await abrirDetalhe(usuario);
    await usuario.type(screen.getByLabelText("Número do DH"), "2026DH000123");
    await usuario.click(screen.getByRole("button", { name: "Registrar DH" }));

    expect(await screen.findByText("Documento Hábil registrado com sucesso.")).toBeInTheDocument();
    expect(registrarDHMock).toHaveBeenCalledWith(PROCESSO_1.sei, "2026DH000123");
    // Reconsulta o mesmo detalhe (nunca assume localmente) e atualiza a lista.
    expect(detalharMock).toHaveBeenCalledTimes(2);

    // Volta à lista e confirma que já reflete a atualização em segundo plano.
    await usuario.click(screen.getByText("← Voltar à lista"));
    expect(await screen.findByText("1 processo aguardando DH")).toBeInTheDocument();
  });

  it("salvo_sync_pendente: mostra aviso (DH já gravado, base pode estar desatualizada)", async () => {
    registrarDHMock.mockResolvedValue({
      situacao: "salvo_sync_pendente",
      sei: PROCESSO_1.sei,
      dh: "2026DH000123",
      mensagem: "O Documento Hábil foi gravado na Planilha Oficial, mas a Base Local não pôde ser atualizada agora.",
    });

    const usuario = userEvent.setup();
    await abrirDetalhe(usuario);
    await usuario.type(screen.getByLabelText("Número do DH"), "2026DH000123");
    await usuario.click(screen.getByRole("button", { name: "Registrar DH" }));

    expect(
      await screen.findByText(/mas a Base Local não pôde ser atualizada agora/),
    ).toBeInTheDocument();
  });

  it("nao_salvo (ex.: DH conflitante): mostra erro e mantém o formulário editável para nova tentativa", async () => {
    registrarDHMock.mockResolvedValue({
      situacao: "nao_salvo",
      sei: PROCESSO_1.sei,
      dh: "2026DH000999",
      mensagem: 'Este processo já possui um Documento Hábil diferente registrado ("2026DH000111").',
    });

    const usuario = userEvent.setup();
    await abrirDetalhe(usuario);
    await usuario.type(screen.getByLabelText("Número do DH"), "2026DH000999");
    await usuario.click(screen.getByRole("button", { name: "Registrar DH" }));

    expect(await screen.findByText(/já possui um Documento Hábil diferente/)).toBeInTheDocument();
    // Continua editável — nunca "trava" o formulário num estado de falha.
    expect(screen.getByLabelText("Número do DH")).toBeEnabled();
    expect(screen.getByRole("button", { name: "Registrar DH" })).toBeInTheDocument();
    // Nenhuma reconsulta de lista/detalhe acontece quando não foi salvo.
    expect(detalharMock).toHaveBeenCalledTimes(1);
  });

  it("falha técnica (503) mostra mensagem amigável, nunca quebra a tela", async () => {
    registrarDHMock.mockRejectedValue(new ErroAnaliticaIndisponivel());

    const usuario = userEvent.setup();
    await abrirDetalhe(usuario);
    await usuario.type(screen.getByLabelText("Número do DH"), "2026DH000123");
    await usuario.click(screen.getByRole("button", { name: "Registrar DH" }));

    expect(
      await screen.findByText(/Não foi possível acessar os registros da Central Analítica/),
    ).toBeInTheDocument();
  });

  it("depois de gravar, o campo de registro desaparece e Histórico/Valor continuam intactos", async () => {
    registrarDHMock.mockResolvedValue({
      situacao: "concluido",
      sei: PROCESSO_1.sei,
      dh: "2026DH000123",
      mensagem: "Documento Hábil registrado com sucesso.",
    });
    detalharMock
      .mockResolvedValueOnce(DETALHE_PROCESSO_1)
      .mockResolvedValueOnce({ ...DETALHE_PROCESSO_1, ainda_aguardando_dh: false, situacao: null });

    const usuario = userEvent.setup();
    await abrirDetalhe(usuario);
    await usuario.type(screen.getByLabelText("Número do DH"), "2026DH000123");
    await usuario.click(screen.getByRole("button", { name: "Registrar DH" }));

    await screen.findByText("Documento Hábil registrado com sucesso.");

    expect(screen.queryByLabelText("Número do DH")).not.toBeInTheDocument();
    // Preservação do Histórico e Valor da própria Central (item do pedido).
    expect(screen.getByText(DETALHE_PROCESSO_1.historico.texto!)).toBeInTheDocument();
    expect(screen.getByText("1386,81")).toBeInTheDocument();
  });
});
