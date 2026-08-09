// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CentralAnalitica from "./CentralAnalitica";
import type {
  DiagnosticoResposta,
  DiariaCompletaResposta,
  DocumentosHabeisPendentesResposta,
  IndicadoresResposta,
  OpcoesFiltroResposta,
  ResultadoPesquisaResposta,
} from "../types/analitica";

// Sprint 18.4.3 — `IndicadorSincronizacao` já tem sua própria suíte
// (`components/analitica/IndicadorSincronizacao.test.tsx`); aqui ele é
// isolado (mesmo padrão de `App.test.tsx` mockando páginas inteiras) para
// os testes desta página continuarem focados só no shell, sem depender de
// `services/api`.
vi.mock("../components/analitica/IndicadorSincronizacao", () => ({
  default: () => <div>Indicador de sincronização</div>,
}));

vi.mock("../services/api", async (importarOriginal) => {
  const real = await importarOriginal<typeof import("../services/api")>();
  return {
    ...real,
    pesquisarDiarias: vi.fn(),
    obterOpcoesFiltro: vi.fn(),
    detalharDiaria: vi.fn(),
    obterIndicadores: vi.fn(),
    obterDistribuicao: vi.fn(),
    gerarRelatorio: vi.fn(),
    obterDiagnostico: vi.fn(),
    obterDocumentosHabeisPendentes: vi.fn(),
  };
});

import {
  detalharDiaria,
  gerarRelatorio,
  obterDiagnostico,
  obterDistribuicao,
  obterDocumentosHabeisPendentes,
  obterIndicadores,
  obterOpcoesFiltro,
  pesquisarDiarias,
} from "../services/api";

const pesquisarDiariasMock = vi.mocked(pesquisarDiarias);
const obterOpcoesFiltroMock = vi.mocked(obterOpcoesFiltro);
const detalharDiariaMock = vi.mocked(detalharDiaria);
const obterIndicadoresMock = vi.mocked(obterIndicadores);
const obterDocumentosHabeisPendentesMock = vi.mocked(obterDocumentosHabeisPendentes);
// Sprint 19.6.4 — `DashboardRecorte` busca as 6 dimensões via
// `useDistribuicoes`; um recorte "vazio" genérico é suficiente para os
// testes desta página (que não são sobre o conteúdo do Dashboard em si —
// esse é o papel de `DashboardRecorte.test.tsx`), evita cada teste que
// navega até o Dashboard precisar mockar 6 respostas à parte.
const obterDistribuicaoMock = vi.mocked(obterDistribuicao);
// Sprint 19.8.5 — mesmo critério: `ModalRelatorio`/`PainelDiagnostico` já
// têm suas próprias suítes (`ModalRelatorio.test.tsx`/
// `PainelDiagnostico.test.tsx`); aqui só a fiação (o clique abre o
// componente real, com o filtro certo) é o que importa, nunca o conteúdo
// interno deles.
const gerarRelatorioMock = vi.mocked(gerarRelatorio);
const obterDiagnosticoMock = vi.mocked(obterDiagnostico);

const RESULTADO_VAZIO: ResultadoPesquisaResposta = {
  itens: [],
  paginacao: { pagina_atual: 1, tamanho_pagina: 25, total_itens: 0, total_paginas: 0 },
  sincronizacao: { sincronizado_em: "2026-08-01T10:00:00", total_avisos: 0 },
};

const RESULTADO_COM_ITENS: ResultadoPesquisaResposta = {
  itens: [
    {
      sei: "19.20.0001.0000001/2026-01",
      periodo: { inicial: "2026-01-08", final: "2026-01-10" },
      destino: "Araripina",
      servidor: { nome: "Maria Souza", matricula: "1001" },
      motivo: "Reunião",
      valor_total_diarias: 200,
    },
  ],
  paginacao: { pagina_atual: 1, tamanho_pagina: 25, total_itens: 1, total_paginas: 1 },
  sincronizacao: { sincronizado_em: "2026-08-01T10:00:00", total_avisos: 0 },
};

const OPCOES_VAZIAS: OpcoesFiltroResposta = { motivos: [], situacoes: [], municipios: [] };

// Sprint 19.6.2 — `GET /indicadores` (19.6.1), independente da tabela.
const INDICADORES_VAZIOS: IndicadoresResposta = {
  total_diarias: 0,
  total_servidores: 0,
  valor_total: null,
  valor_medio: null,
  sincronizacao: { sincronizado_em: "2026-08-01T10:00:00", total_avisos: 0 },
};

const INDICADORES_COM_VALOR: IndicadoresResposta = {
  total_diarias: 1,
  total_servidores: 1,
  valor_total: 200,
  valor_medio: 200,
  sincronizacao: { sincronizado_em: "2026-08-01T10:00:00", total_avisos: 0 },
};

// Sprint 19.5.8.1 — usado pelo teste de integração de "Ver histórico deste
// CPF"/"Copiar SEI" (correção da lacuna N2 da Auditoria Técnica, 19.5.8
// REPROVADA): precisa de um `sei` que bata com `RESULTADO_COM_ITENS` e um
// `cpf` completo (nunca exibido cru na tela — só mascarado).
const DETALHE_COMPLETO: DiariaCompletaResposta = {
  sei: "19.20.0001.0000001/2026-01",
  periodo: { inicial: "2026-01-08", final: "2026-01-10" },
  destino: "Araripina",
  servidor: { nome: "Maria Souza", cargo: "Analista", previdencia: "RPPS", matricula: "1001", situacao: "Em exercício" },
  motivo: "Reunião",
  valor_total_diarias: 200,
  doc_origem: "processo.pdf",
  cpf: "12345678911",
  trecho: { origem: "Recife", destino: "Araripina" },
  transporte: "Rodoviário",
  referencia_administrativa: { linha_planilha: 10 },
  sincronizacao: { sincronizado_em: "2026-08-01T10:00:00", total_avisos: 0 },
  diagnosticos: [],
};

// Sprint 19.8.5 — recorte "vazio" genérico, mesmo critério de
// `INDICADORES_VAZIOS`/`OPCOES_VAZIAS` acima: os testes desta página não
// são sobre o conteúdo do Diagnóstico em si (isso é
// `PainelDiagnostico.test.tsx`), só sobre a fiação (clique abre o
// componente real, com os filtros certos).
const DIAGNOSTICO_VAZIO: DiagnosticoResposta = {
  resumo: { esperado: 0, atencao: 0, inconsistencia: 0 },
  registros: [],
};

// Correção de foco (2026-08-05) — recorte "vazio" genérico para
// `GET /documentos-habeis-pendentes`, mesmo critério de `DIAGNOSTICO_VAZIO`
// acima: os testes desta página não são sobre o conteúdo da tela em si
// (isso é `PainelDocumentosHabeisPendentes.test.tsx`), só sobre a fiação.
const DOCUMENTOS_HABEIS_PENDENTES_VAZIO: DocumentosHabeisPendentesResposta = {
  resumo: { aguardando_liberacao: 0, revisao_manual_necessaria: 0 },
  registros: [],
};

// Usado pelos testes de navegação/badge/aviso: precisa de um `sei` que
// bata com `RESULTADO_COM_ITENS`/`DETALHE_COMPLETO`.
const DOCUMENTOS_HABEIS_PENDENTES_COM_REGISTRO: DocumentosHabeisPendentesResposta = {
  resumo: { aguardando_liberacao: 0, revisao_manual_necessaria: 1 },
  registros: [
    {
      sei: RESULTADO_COM_ITENS.itens[0].sei,
      servidor_nome: "Maria Souza",
      cpf_mascarado: "***.***.***-11",
      periodo: { inicial: "2026-01-08", final: "2026-01-10" },
      destino: "Araripina",
      data_liberacao_prevista: "2025-12-24",
      situacao: "revisao_manual_necessaria",
      dias_restantes: null,
      dias_atraso: 45,
      texto_contagem: null,
      mensagem: "Documento Hábil pendente. A data de liberação já foi atingida. Recomenda-se análise manual.",
    },
  ],
};

beforeEach(() => {
  pesquisarDiariasMock.mockResolvedValue(RESULTADO_VAZIO);
  obterOpcoesFiltroMock.mockResolvedValue(OPCOES_VAZIAS);
  detalharDiariaMock.mockResolvedValue(DETALHE_COMPLETO);
  obterIndicadoresMock.mockResolvedValue(INDICADORES_VAZIOS);
  obterDistribuicaoMock.mockImplementation(async (parametros) => ({ dimensao: parametros.dimensao, pontos: [] }));
  obterDiagnosticoMock.mockResolvedValue(DIAGNOSTICO_VAZIO);
  obterDocumentosHabeisPendentesMock.mockResolvedValue(DOCUMENTOS_HABEIS_PENDENTES_VAZIO);
  gerarRelatorioMock.mockResolvedValue({
    caminho_arquivo_temporario: "/tmp/relatorio.pdf",
    nome_sugerido: "relatorio.pdf",
    sincronizado_em: "2026-08-01T10:00:00",
  });
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe("CentralAnalitica", () => {
  it("abre direto no fluxo único, sem abas: filtros e tabela já visíveis", async () => {
    render(<CentralAnalitica backendOnline />);

    expect(screen.getByRole("heading", { name: "Central Analítica" })).toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    await waitFor(() => expect(pesquisarDiariasMock).toHaveBeenCalled());
    expect(obterOpcoesFiltroMock).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /Filtros/ })).toBeInTheDocument();
  });

  // Sprint 19.5.6.1 — fecha o achado da auditoria da 19.5.6: `FiltrosRapidos`
  // agora é alcançável e utilizável na tela real (não só isolado em sua
  // própria suíte), e um clique nele reage pelo mesmo fluxo homologado de
  // `useDiarias` (nova chamada a `pesquisarDiarias`, sem hook/estado novo).
  it("clicar num atalho rápido na tela real atualiza o período e refaz a busca via useDiarias", async () => {
    const usuario = userEvent.setup();
    render(<CentralAnalitica backendOnline />);
    await waitFor(() => expect(pesquisarDiariasMock).toHaveBeenCalledTimes(1));

    await usuario.click(screen.getByRole("button", { name: "Mês atual" }));

    await waitFor(() => expect(pesquisarDiariasMock).toHaveBeenCalledTimes(2));
    const [ultimaChamada] = pesquisarDiariasMock.mock.calls.at(-1)!;
    expect(ultimaChamada.periodo_inicial).toEqual(expect.any(String));
    expect(ultimaChamada.periodo_final).toEqual(expect.any(String));
    expect(ultimaChamada.pagina).toBe(1);
  });

  it("resumo do recorte mostra a contagem total quando há resultado", async () => {
    pesquisarDiariasMock.mockResolvedValue(RESULTADO_COM_ITENS);
    render(<CentralAnalitica backendOnline />);

    // `INDICADORES_VAZIOS` (padrão do `beforeEach`) já traz `total_servidores:
    // 0` — aparece junto da contagem assim que os indicadores do recorte
    // resolvem, mesmo sem valor_total/valor_medio (ambos `null`).
    await waitFor(() =>
      expect(screen.getByText("1 registro no recorte atual · 0 servidores")).toBeInTheDocument(),
    );
  });

  // Sprint 19.6.2 — `GET /indicadores` (19.6.1): `ResumoRecorte` passa a
  // mostrar valor total/médio reais, reaproveitando os mesmos
  // `diarias.filtros` já usados por `useDiarias` (nunca um segundo estado
  // de filtro — `obterIndicadoresMock` é chamado com os mesmos 15 campos
  // de filtro, nunca paginação/ordenação).
  it("resumo do recorte mostra valor total/médio reais quando os indicadores carregam", async () => {
    pesquisarDiariasMock.mockResolvedValue(RESULTADO_COM_ITENS);
    obterIndicadoresMock.mockResolvedValue(INDICADORES_COM_VALOR);
    render(<CentralAnalitica backendOnline />);

    await waitFor(() =>
      expect(
        screen.getByText(
          "1 registro no recorte atual · 1 servidor · R$ 200,00 no total · R$ 200,00 em média",
        ),
      ).toBeInTheDocument(),
    );

    const parametros = obterIndicadoresMock.mock.calls.at(-1)![0];
    expect(parametros).not.toHaveProperty("pagina");
    expect(parametros).not.toHaveProperty("ordenar_por");
  });

  it("recorte vazio: as 3 ações ficam desabilitadas", async () => {
    render(<CentralAnalitica backendOnline />);

    await waitFor(() => expect(pesquisarDiariasMock).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: "Gerar Dashboard" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Gerar Relatório" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Documentos Hábeis Pendentes/ })).toBeDisabled();
  });

  it("recorte com resultado: as 3 ações ficam habilitadas", async () => {
    pesquisarDiariasMock.mockResolvedValue(RESULTADO_COM_ITENS);
    render(<CentralAnalitica backendOnline />);

    await waitFor(() => expect(screen.getByRole("button", { name: "Gerar Dashboard" })).toBeEnabled());
    expect(screen.getByRole("button", { name: "Gerar Relatório" })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Documentos Hábeis Pendentes/ })).toBeEnabled();
  });

  // Sprint 19.6.4 — Dashboard ganha conteúdo real (`DashboardRecorte`);
  // deixa de usar o aviso genérico "Ainda não disponível" (esse continua
  // valendo só para Relatório/Diagnóstico, ainda não implementados).
  it("clicar em 'Gerar Dashboard' mostra o Dashboard real no lugar da tabela", async () => {
    const usuario = userEvent.setup();
    pesquisarDiariasMock.mockResolvedValue(RESULTADO_COM_ITENS);
    obterIndicadoresMock.mockResolvedValue(INDICADORES_COM_VALOR);
    render(<CentralAnalitica backendOnline />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Gerar Dashboard" })).toBeEnabled());

    await usuario.click(screen.getByRole("button", { name: "Gerar Dashboard" }));

    await waitFor(() => expect(screen.getByText("Total de diárias")).toBeInTheDocument());
    expect(screen.queryByText("Ainda não disponível")).not.toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Paginação de resultados")).not.toBeInTheDocument();
  });

  // Sprint 19.8.5 — correção de escopo (mesmo padrão da 19.5.6.1,
  // `v2-plano-tecnico.md` § 18, entrada "19.8.5"): `ModalRelatorio` ganha
  // conteúdo real aqui — substitui o antigo aviso genérico "Ainda não
  // disponível" (removido junto com `TEXTO_EM_CONSTRUCAO`).
  it("clicar em 'Gerar Relatório' abre o ModalRelatorio real com os filtros do recorte atual", async () => {
    const usuario = userEvent.setup();
    pesquisarDiariasMock.mockResolvedValue(RESULTADO_COM_ITENS);
    render(<CentralAnalitica backendOnline />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Gerar Relatório" })).toBeEnabled());

    await usuario.click(screen.getByRole("button", { name: "Gerar Relatório" }));

    expect(screen.getByRole("dialog", { name: "Gerar relatório" })).toBeInTheDocument();
    expect(screen.queryByText("Ainda não disponível")).not.toBeInTheDocument();
    expect(screen.getByText("Recorte atual: 1 registro")).toBeInTheDocument();

    await usuario.click(screen.getByRole("button", { name: "Pré-visualizar" }));

    await waitFor(() => expect(gerarRelatorioMock).toHaveBeenCalledTimes(1));
    const [parametros] = gerarRelatorioMock.mock.calls[0];
    expect(parametros.modo).toBe("previsualizacao");
    expect(parametros.tipo).toBe("executivo");
  });

  // Correção de foco (2026-08-05) — substitui a antiga "Análise Rápida
  // (Diagnóstico)": o botão abre `PainelDocumentosHabeisPendentes`, nunca
  // mais `PainelDiagnostico`.
  it("clicar em 'Documentos Hábeis Pendentes' mostra o PainelDocumentosHabeisPendentes real no lugar da tabela", async () => {
    const usuario = userEvent.setup();
    pesquisarDiariasMock.mockResolvedValue(RESULTADO_COM_ITENS);
    render(<CentralAnalitica backendOnline />);
    await waitFor(() => expect(screen.getByRole("button", { name: /Documentos Hábeis Pendentes/ })).toBeEnabled());

    await usuario.click(screen.getByRole("button", { name: /Documentos Hábeis Pendentes/ }));

    await waitFor(() => expect(obterDocumentosHabeisPendentesMock).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(
        screen.getByText("Nenhum processo deste recorte está com o Documento Hábil pendente."),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByText("Ainda não disponível")).not.toBeInTheDocument();
    expect(obterDiagnosticoMock).not.toHaveBeenCalled();

    await usuario.click(screen.getByRole("button", { name: "← Voltar aos resultados" }));
    expect(
      screen.queryByText("Nenhum processo deste recorte está com o Documento Hábil pendente."),
    ).not.toBeInTheDocument();
  });

  // Correção de foco — "Ver detalhes" de Documentos Hábeis Pendentes abre o
  // mesmo painel de detalhamento do § 5 (nunca uma tela nova), com o foco
  // inicial no bloco "Avisos e diagnósticos" em vez do título — mesmo alvo
  // de foco já usado pelo Diagnóstico geral (é literalmente o mesmo caso de
  // `dh`, nunca um terceiro bloco de foco novo).
  it("'Ver detalhes' em Documentos Hábeis Pendentes abre o painel de detalhamento com o foco no bloco de avisos", async () => {
    const usuario = userEvent.setup();
    pesquisarDiariasMock.mockResolvedValue(RESULTADO_COM_ITENS);
    obterDocumentosHabeisPendentesMock.mockResolvedValue(DOCUMENTOS_HABEIS_PENDENTES_COM_REGISTRO);
    render(<CentralAnalitica backendOnline />);
    const botaoAbrir = await screen.findByRole("button", { name: "Documentos Hábeis Pendentes (1)" });
    await waitFor(() => expect(botaoAbrir).toBeEnabled());
    await usuario.click(botaoAbrir);
    const linha = await screen.findByRole("row", {
      name: `Ver detalhes do processo ${RESULTADO_COM_ITENS.itens[0].sei}`,
    });

    await usuario.click(linha);

    await screen.findByRole("heading", { name: RESULTADO_COM_ITENS.itens[0].sei });
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Avisos e diagnósticos" })).toHaveFocus(),
    );
    expect(screen.getByRole("heading", { name: RESULTADO_COM_ITENS.itens[0].sei })).not.toHaveFocus();
  });

  // "Ver histórico deste CPF" continua levando de volta aos resultados
  // (comportamento já homologado) mesmo quando o painel foi aberto a
  // partir de Documentos Hábeis Pendentes, não da tabela.
  it("'Ver histórico deste CPF' a partir de Documentos Hábeis Pendentes volta para os resultados", async () => {
    const usuario = userEvent.setup();
    pesquisarDiariasMock.mockResolvedValue(RESULTADO_COM_ITENS);
    obterDocumentosHabeisPendentesMock.mockResolvedValue(DOCUMENTOS_HABEIS_PENDENTES_COM_REGISTRO);
    render(<CentralAnalitica backendOnline />);
    const botaoAbrir = await screen.findByRole("button", { name: "Documentos Hábeis Pendentes (1)" });
    await waitFor(() => expect(botaoAbrir).toBeEnabled());
    await usuario.click(botaoAbrir);
    const linha = await screen.findByRole("row", {
      name: `Ver detalhes do processo ${RESULTADO_COM_ITENS.itens[0].sei}`,
    });
    await usuario.click(linha);
    await screen.findByRole("heading", { name: RESULTADO_COM_ITENS.itens[0].sei });

    await usuario.click(screen.getByRole("button", { name: "Ver histórico deste CPF" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.queryByText("Analisando o recorte...")).not.toBeInTheDocument();
    await waitFor(() => expect(pesquisarDiariasMock).toHaveBeenCalledTimes(2));
    const [ultimaChamada] = pesquisarDiariasMock.mock.calls.at(-1)!;
    expect(ultimaChamada.cpf).toBe(DETALHE_COMPLETO.cpf);
  });

  it("'← Voltar aos resultados' devolve a tabela", async () => {
    const usuario = userEvent.setup();
    pesquisarDiariasMock.mockResolvedValue(RESULTADO_COM_ITENS);
    obterIndicadoresMock.mockResolvedValue(INDICADORES_COM_VALOR);
    render(<CentralAnalitica backendOnline />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Gerar Dashboard" })).toBeEnabled());
    await usuario.click(screen.getByRole("button", { name: "Gerar Dashboard" }));
    await waitFor(() => expect(screen.getByText("Total de diárias")).toBeInTheDocument());

    await usuario.click(screen.getByRole("button", { name: "← Voltar aos resultados" }));

    expect(screen.queryByText("Total de diárias")).not.toBeInTheDocument();
  });

  // Sprint 21.2 (Modo Executivo) — mesmo critério de habilitação/fiação já
  // testado para "Gerar Dashboard" acima: o botão "Modo Executivo" segue a
  // mesma regra de `recorteValido` e abre o componente real no lugar da
  // tabela, preservando o recorte ao voltar (decisão 2 da arquitetura
  // funcional — nenhum estado de filtro paralelo).
  describe("Modo Executivo (Sprint 21.2)", () => {
    it("recorte vazio: o botão 'Modo Executivo' fica desabilitado", async () => {
      render(<CentralAnalitica backendOnline />);

      await waitFor(() => expect(pesquisarDiariasMock).toHaveBeenCalled());
      expect(screen.getByRole("button", { name: "Dark Mode Executivo" })).toBeDisabled();
    });

    it("recorte com resultado: o botão 'Modo Executivo' fica habilitado", async () => {
      pesquisarDiariasMock.mockResolvedValue(RESULTADO_COM_ITENS);
      render(<CentralAnalitica backendOnline />);

      await waitFor(() => expect(screen.getByRole("button", { name: "Dark Mode Executivo" })).toBeEnabled());
    });

    it("clicar em 'Modo Executivo' mostra o Modo Executivo real no lugar da tabela, preservando o filtro aplicado", async () => {
      const usuario = userEvent.setup();
      pesquisarDiariasMock.mockResolvedValue(RESULTADO_COM_ITENS);
      obterIndicadoresMock.mockResolvedValue(INDICADORES_COM_VALOR);
      render(<CentralAnalitica backendOnline />);
      await waitFor(() => expect(screen.getByRole("button", { name: "Dark Mode Executivo" })).toBeEnabled());

      await usuario.click(screen.getByRole("button", { name: "Dark Mode Executivo" }));

      expect(await screen.findByRole("heading", { name: "Modo Executivo" })).toBeInTheDocument();
      expect(screen.queryByRole("table")).not.toBeInTheDocument();
      // Nenhuma nova busca de `/diarias` — o mesmo recorte de `useDiarias`
      // é reaproveitado, nunca refeito ao trocar de modo.
      expect(pesquisarDiariasMock).toHaveBeenCalledTimes(1);
    });

    it("'← Voltar ao Modo Operacional' devolve a tabela com o mesmo recorte", async () => {
      const usuario = userEvent.setup();
      pesquisarDiariasMock.mockResolvedValue(RESULTADO_COM_ITENS);
      obterIndicadoresMock.mockResolvedValue(INDICADORES_COM_VALOR);
      render(<CentralAnalitica backendOnline />);
      await waitFor(() => expect(screen.getByRole("button", { name: "Dark Mode Executivo" })).toBeEnabled());
      await usuario.click(screen.getByRole("button", { name: "Dark Mode Executivo" }));
      await screen.findByRole("heading", { name: "Modo Executivo" });

      await usuario.click(screen.getByRole("button", { name: "← Voltar ao Modo Operacional" }));

      expect(screen.queryByRole("heading", { name: "Modo Executivo" })).not.toBeInTheDocument();
      expect(screen.getByRole("table")).toBeInTheDocument();
      expect(pesquisarDiariasMock).toHaveBeenCalledTimes(1);
    });

    // Sprint 21.4 — painel lateral contextual: "Abrir relatório"/"Abrir
    // diagnóstico" navegam para os componentes reais já homologados
    // (`ModalRelatorio`/`PainelDiagnostico`), nunca uma versão paralela
    // dentro do Modo Executivo.
    it("painel lateral → 'Abrir relatório' aplica o filtro do ponto e abre o ModalRelatorio real", async () => {
      const usuario = userEvent.setup();
      pesquisarDiariasMock.mockResolvedValue(RESULTADO_COM_ITENS);
      obterIndicadoresMock.mockResolvedValue(INDICADORES_COM_VALOR);
      obterDistribuicaoMock.mockImplementation(async (parametros) =>
        parametros.dimensao === "municipio"
          ? { dimensao: "municipio", pontos: [{ rotulo: "Araripina", contagem: 1, valor: 200 }] }
          : { dimensao: parametros.dimensao, pontos: [] },
      );
      render(<CentralAnalitica backendOnline />);
      await waitFor(() => expect(screen.getByRole("button", { name: "Dark Mode Executivo" })).toBeEnabled());
      await usuario.click(screen.getByRole("button", { name: "Dark Mode Executivo" }));
      await waitFor(() => expect(screen.getByText("Municípios")).toBeInTheDocument());

      await usuario.click(screen.getByRole("button", { name: /Filtrar por Araripina/ }));
      await usuario.click(screen.getByRole("button", { name: "Abrir relatório" }));

      expect(screen.getByRole("dialog", { name: "Gerar relatório" })).toBeInTheDocument();
      await waitFor(() => expect(pesquisarDiariasMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ municipio: "Araripina" }),
      ));
    });

    // Correção de foco (2026-08-05) — o Diagnóstico geral (catálogo de
    // anomalias) deixa de ser alcançável pelo botão de `PainelAcoesRecorte`
    // (que agora abre Documentos Hábeis Pendentes), mas continua existindo
    // e continua alcançável pelo Modo Executivo, via o painel lateral
    // contextual (clique num ponto de gráfico).
    //
    // BI 4.0 (2026-08-08) — a lateral de Insights do Modo Executivo passou
    // a ser exclusivamente financeira/gerencial (pedido explícito do
    // usuário): o caminho "insight de diagnóstico → Abrir diagnóstico" foi
    // removido (o insight de duplicidade nunca mais aparece na lateral
    // executiva), e a célula "Atenção (diagnóstico)" da faixa de KPI
    // também saiu do Modo Executivo (mesma Sprint) — o dado continua
    // acessível em Diagnóstico geral. Este teste passa a validar as duas
    // pontas: (1) diagnóstico não aparece mais na lateral/faixa de KPI,
    // mesmo com um caso no recorte; (2) "Abrir diagnóstico" continua
    // alcançável de ponta a ponta pelo painel lateral contextual (clique
    // num ponto de gráfico, Sprint 21.4 — nunca removido).
    it("diagnóstico não aparece mais na lateral de Insights, mas 'Abrir diagnóstico' via painel lateral contextual continua funcionando de ponta a ponta", async () => {
      const usuario = userEvent.setup();
      pesquisarDiariasMock.mockResolvedValue(RESULTADO_COM_ITENS);
      obterIndicadoresMock.mockResolvedValue(INDICADORES_COM_VALOR);
      obterDiagnosticoMock.mockResolvedValue({
        resumo: { esperado: 0, atencao: 1, inconsistencia: 0 },
        registros: [
          {
            sei: RESULTADO_COM_ITENS.itens[0].sei,
            classificacao: "atencao",
            casos: [{ campo: null, titulo: "Possível duplicidade", motivo: "m", acao_recomendada: "a" }],
          },
        ],
      });
      obterDistribuicaoMock.mockImplementation(async (parametros) =>
        parametros.dimensao === "municipio"
          ? { dimensao: "municipio", pontos: [{ rotulo: "Araripina", contagem: 1, valor: 200 }] }
          : { dimensao: parametros.dimensao, pontos: [] },
      );
      render(<CentralAnalitica backendOnline />);
      await waitFor(() => expect(screen.getByRole("button", { name: "Dark Mode Executivo" })).toBeEnabled());
      await usuario.click(screen.getByRole("button", { name: "Dark Mode Executivo" }));
      await waitFor(() => expect(screen.getByText("Municípios")).toBeInTheDocument());
      expect(screen.queryByText(/possível duplicidade/i)).not.toBeInTheDocument();
      expect(screen.queryByText("Atenção (diagnóstico)")).not.toBeInTheDocument();

      await usuario.click(screen.getByRole("button", { name: /Filtrar por Araripina/ }));
      await usuario.click(screen.getByRole("button", { name: "Abrir diagnóstico" }));

      // Drill-down por gráfico (nunca por insight) — sem `filtroCaso`, o
      // Diagnóstico mostra o recorte inteiro, não "N de M" (esse formato é
      // só do caminho por insight de caso específico, removido da lateral).
      await waitFor(() => expect(screen.getByText("Diagnóstico · 1 registro")).toBeInTheDocument());

      await usuario.click(screen.getByRole("button", { name: "← Voltar aos resultados" }));
      await waitFor(() => expect(screen.getByText("Municípios")).toBeInTheDocument());
    });
  });

  // Correção de foco (2026-08-05) — aviso dentro da Central Analítica
  // quando algum processo do recorte atual atingiu a data de liberação do
  // DH e continua sem DH (§ 5 do pedido).
  describe("Aviso de liberação atingida (correção de foco 2026-08-05)", () => {
    it("sem processos em revisão manual, nenhum aviso aparece", async () => {
      render(<CentralAnalitica backendOnline />);

      await waitFor(() => expect(obterDocumentosHabeisPendentesMock).toHaveBeenCalled());
      expect(
        screen.queryByText(/cuja data de liberação do Documento Hábil foi atingida/),
      ).not.toBeInTheDocument();
    });

    it("com 1 processo em revisão manual, mostra o aviso com a contagem no singular ('Existe ... processo ... permanece')", async () => {
      obterDocumentosHabeisPendentesMock.mockResolvedValue(DOCUMENTOS_HABEIS_PENDENTES_COM_REGISTRO);
      render(<CentralAnalitica backendOnline />);

      expect(
        await screen.findByText(
          "Existe 1 processo cuja data de liberação do Documento Hábil foi atingida e que ainda permanece sem DH.",
        ),
      ).toBeInTheDocument();
    });

    it("com vários processos em revisão manual, mostra o aviso no plural ('Existem ... processos ... permanecem')", async () => {
      obterDocumentosHabeisPendentesMock.mockResolvedValue({
        ...DOCUMENTOS_HABEIS_PENDENTES_COM_REGISTRO,
        resumo: { aguardando_liberacao: 0, revisao_manual_necessaria: 3 },
      });
      render(<CentralAnalitica backendOnline />);

      expect(
        await screen.findByText(
          "Existem 3 processos cuja data de liberação do Documento Hábil foi atingida e que ainda permanecem sem DH.",
        ),
      ).toBeInTheDocument();
    });

    it("'Abrir Documentos Hábeis Pendentes' no aviso abre a tela sem filtro aplicado", async () => {
      const usuario = userEvent.setup();
      pesquisarDiariasMock.mockResolvedValue(RESULTADO_COM_ITENS);
      obterDocumentosHabeisPendentesMock.mockResolvedValue(DOCUMENTOS_HABEIS_PENDENTES_COM_REGISTRO);
      render(<CentralAnalitica backendOnline />);
      await screen.findByText(/cuja data de liberação do Documento Hábil foi atingida/);

      await usuario.click(screen.getByRole("button", { name: "Abrir Documentos Hábeis Pendentes" }));

      const grupo = await screen.findByRole("radiogroup", { name: "Filtrar Documentos Hábeis Pendentes" });
      expect(within(grupo).getByRole("radio", { name: /^Todos/ })).toHaveAttribute("aria-checked", "true");
    });

    it("'Ver revisão manual' no aviso abre a tela já filtrada para 'Revisão manual necessária'", async () => {
      const usuario = userEvent.setup();
      pesquisarDiariasMock.mockResolvedValue(RESULTADO_COM_ITENS);
      obterDocumentosHabeisPendentesMock.mockResolvedValue(DOCUMENTOS_HABEIS_PENDENTES_COM_REGISTRO);
      render(<CentralAnalitica backendOnline />);
      await screen.findByText(/cuja data de liberação do Documento Hábil foi atingida/);

      await usuario.click(screen.getByRole("button", { name: "Ver revisão manual" }));

      expect(await screen.findByRole("radio", { name: /Revisão manual necessária/ })).toHaveAttribute(
        "aria-checked",
        "true",
      );
    });

    it("'Dispensar' esconde o aviso nesta sessão, sem marcar nada como resolvido nem gravar na planilha", async () => {
      const usuario = userEvent.setup();
      obterDocumentosHabeisPendentesMock.mockResolvedValue(DOCUMENTOS_HABEIS_PENDENTES_COM_REGISTRO);
      render(<CentralAnalitica backendOnline />);
      await screen.findByText(/cuja data de liberação do Documento Hábil foi atingida/);

      await usuario.click(screen.getByRole("button", { name: "Dispensar" }));

      expect(
        screen.queryByText(/cuja data de liberação do Documento Hábil foi atingida/),
      ).not.toBeInTheDocument();
      // O badge do botão continua mostrando a contagem real — dispensar o
      // aviso nunca altera a fonte da verdade (`dh` vazio + regra de data).
      expect(screen.getByRole("button", { name: /Documentos Hábeis Pendentes \(1\)/ })).toBeInTheDocument();
    });
  });

  it("usar a barra de pesquisa global aplica o termo buscado e mostra os resultados", async () => {
    const usuario = userEvent.setup();
    render(<CentralAnalitica backendOnline />);

    await usuario.type(
      screen.getByRole("searchbox", { name: /Pesquisar por SEI, CPF, servidor ou município/ }),
      "araripina{Enter}",
    );

    await waitFor(() =>
      expect(pesquisarDiariasMock).toHaveBeenCalledWith(expect.objectContaining({ q: "araripina" })),
    );
  });

  it("pesquisar globalmente enquanto vê o Dashboard volta para os resultados", async () => {
    const usuario = userEvent.setup();
    pesquisarDiariasMock.mockResolvedValue(RESULTADO_COM_ITENS);
    obterIndicadoresMock.mockResolvedValue(INDICADORES_COM_VALOR);
    render(<CentralAnalitica backendOnline />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Gerar Dashboard" })).toBeEnabled());
    await usuario.click(screen.getByRole("button", { name: "Gerar Dashboard" }));
    await waitFor(() => expect(screen.getByText("Total de diárias")).toBeInTheDocument());

    await usuario.type(
      screen.getByRole("searchbox", { name: /Pesquisar por SEI, CPF, servidor ou município/ }),
      "araripina{Enter}",
    );

    expect(screen.queryByText("Total de diárias")).not.toBeInTheDocument();
  });

  it("backend offline: mostra o aviso de aplicativo iniciando e desabilita a busca global", () => {
    render(<CentralAnalitica backendOnline={false} />);

    expect(screen.getByText("Aguardando o aplicativo terminar de iniciar...")).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: /Pesquisar por SEI/ })).toBeDisabled();
  });

  it("backend online: não mostra o aviso", () => {
    render(<CentralAnalitica backendOnline />);

    expect(screen.queryByText("Aguardando o aplicativo terminar de iniciar...")).not.toBeInTheDocument();
  });

  // Sprint 19.5.8.1 — correção da lacuna N2 da Auditoria Técnica (19.5.8
  // REPROVADA): "Ver histórico deste CPF"/"Copiar SEI" não tinham nenhum
  // teste no nível da página real, só isolados em
  // `PainelDetalhamentoDiaria.test.tsx` (que mocka os callbacks). Aqui a
  // fiação real de `CentralAnalitica.tsx` (`aoVerHistoricoCpf={(cpf) =>
  // diarias.aplicarFiltro({ cpf })}`) é exercida de ponta a ponta.
  describe("painel de detalhamento na página real (correção 19.5.8.1)", () => {
    async function abrirPainelDoPrimeiroRegistro(usuario: ReturnType<typeof userEvent.setup>) {
      pesquisarDiariasMock.mockResolvedValue(RESULTADO_COM_ITENS);
      render(<CentralAnalitica backendOnline />);
      await waitFor(() => expect(pesquisarDiariasMock).toHaveBeenCalledTimes(1));

      await usuario.click(
        screen.getByRole("row", { name: `Ver detalhamento da diária ${RESULTADO_COM_ITENS.itens[0].sei}` }),
      );
      await screen.findByRole("heading", { name: RESULTADO_COM_ITENS.itens[0].sei });
    }

    it("'Ver histórico deste CPF' é alcançável na página real, aplica o CPF completo ao useDiarias, refaz a pesquisa na página 1, fecha o painel e mostra o chip mascarado", async () => {
      const usuario = userEvent.setup();
      await abrirPainelDoPrimeiroRegistro(usuario);

      await usuario.click(screen.getByRole("button", { name: "Ver histórico deste CPF" }));

      // Painel fechado.
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

      // Nova pesquisa disparada com o CPF completo (necessário para o
      // backend filtrar corretamente) e página 1.
      await waitFor(() => expect(pesquisarDiariasMock).toHaveBeenCalledTimes(2));
      const [ultimaChamada] = pesquisarDiariasMock.mock.calls.at(-1)!;
      expect(ultimaChamada.cpf).toBe(DETALHE_COMPLETO.cpf);
      expect(ultimaChamada.pagina).toBe(1);

      // O chip visível mostra só o CPF mascarado — o completo nunca aparece
      // na interface, mesmo estando no parâmetro enviado ao backend acima.
      expect(screen.getByText("CPF: ***.***.***-11")).toBeInTheDocument();
      expect(screen.queryByText(DETALHE_COMPLETO.cpf)).not.toBeInTheDocument();
    });

    it("'Copiar SEI' usa a API real exposta em window.api (contextBridge) quando a página está montada", async () => {
      window.api = { copiarTexto: vi.fn().mockResolvedValue(undefined) } as unknown as Window["api"];
      const usuario = userEvent.setup();
      await abrirPainelDoPrimeiroRegistro(usuario);

      await usuario.click(screen.getByRole("button", { name: "Copiar SEI" }));

      expect(window.api.copiarTexto).toHaveBeenCalledWith(RESULTADO_COM_ITENS.itens[0].sei);
      expect(await screen.findByText("✓ SEI copiado")).toBeInTheDocument();
    });
  });

  // Sprint 19.6.2.1 — correção do achado central da Auditoria Técnica da
  // 19.6.2: `useDiarias` e `useIndicadores` são buscas independentes; sem
  // essa correção, era possível o `ResumoRecorte` mostrar a contagem de um
  // recorte novo junto do valor_total/valor_medio de um recorte anterior
  // (ou vice-versa), porque nada garantia que as duas respostas
  // pertenciam ao mesmo recorte. Esta matriz reproduz, no nível da página
  // real (não só no hook isolado), todas as ordens de chegada possíveis.
  describe("matriz de dessincronia entre tabela e indicadores (correção 19.6.2.1)", () => {
    function criarPromessaControlavel<T>() {
      let resolver!: (valor: T) => void;
      let rejeitador!: (erro: unknown) => void;
      const promessa = new Promise<T>((resolve, reject) => {
        resolver = resolve;
        rejeitador = reject;
      });
      return { promessa, resolver, rejeitador };
    }

    const RESULTADO_A: ResultadoPesquisaResposta = RESULTADO_COM_ITENS;
    const INDICADORES_A: IndicadoresResposta = INDICADORES_COM_VALOR;

    const RESULTADO_B: ResultadoPesquisaResposta = {
      ...RESULTADO_COM_ITENS,
      paginacao: { ...RESULTADO_COM_ITENS.paginacao, total_itens: 5 },
    };
    const INDICADORES_B: IndicadoresResposta = {
      total_diarias: 5,
      total_servidores: 3,
      valor_total: 999,
      valor_medio: 333,
      sincronizacao: { sincronizado_em: "2026-08-01T10:00:00", total_avisos: 0 },
    };

    async function montarComRecorteA(usuario: ReturnType<typeof userEvent.setup>) {
      pesquisarDiariasMock.mockResolvedValueOnce(RESULTADO_A);
      obterIndicadoresMock.mockResolvedValueOnce(INDICADORES_A);
      render(<CentralAnalitica backendOnline />);

      await waitFor(() =>
        expect(
          screen.getByText("1 registro no recorte atual · 1 servidor · R$ 200,00 no total · R$ 200,00 em média"),
        ).toBeInTheDocument(),
      );
      return usuario;
    }

    it("/diarias(B) resolve antes de /indicadores(B): a contagem de B aparece sem nenhum indicador de A junto", async () => {
      const usuario = userEvent.setup();
      await montarComRecorteA(usuario);

      const diariasB = criarPromessaControlavel<ResultadoPesquisaResposta>();
      const indicadoresB = criarPromessaControlavel<IndicadoresResposta>();
      pesquisarDiariasMock.mockReturnValueOnce(diariasB.promessa);
      obterIndicadoresMock.mockReturnValueOnce(indicadoresB.promessa);

      await usuario.click(screen.getByRole("button", { name: "Mês atual" }));

      // Só /diarias(B) resolveu até aqui — nenhum indicador de A pode
      // aparecer junto da nova contagem, nem o resumo antigo continuar
      // visível.
      await act(async () => {
        diariasB.resolver(RESULTADO_B);
        await diariasB.promessa;
      });

      // Texto exato (sem nenhum valor concatenado) prova que nenhum
      // indicador de A (nem um resumo parcial ainda incompleto de B) foi
      // exibido junto da nova contagem.
      await waitFor(() => expect(screen.getByText("5 registros no recorte atual")).toBeInTheDocument());
      expect(screen.getByText("Calculando indicadores deste recorte...")).toBeInTheDocument();

      // Agora /indicadores(B) resolve — o resumo completo de B aparece.
      await act(async () => {
        indicadoresB.resolver(INDICADORES_B);
        await indicadoresB.promessa;
      });

      await waitFor(() =>
        expect(
          screen.getByText(
            "5 registros no recorte atual · 3 servidores · R$ 999,00 no total · R$ 333,00 em média",
          ),
        ).toBeInTheDocument(),
      );
    });

    it("/indicadores(B) resolve antes de /diarias(B): nada aparece enquanto a tabela ainda carrega; quando /diarias(B) resolve, o resumo completo já vem pronto", async () => {
      const usuario = userEvent.setup();
      await montarComRecorteA(usuario);

      const diariasB = criarPromessaControlavel<ResultadoPesquisaResposta>();
      const indicadoresB = criarPromessaControlavel<IndicadoresResposta>();
      pesquisarDiariasMock.mockReturnValueOnce(diariasB.promessa);
      obterIndicadoresMock.mockReturnValueOnce(indicadoresB.promessa);

      await usuario.click(screen.getByRole("button", { name: "Mês atual" }));

      await act(async () => {
        indicadoresB.resolver(INDICADORES_B);
        await indicadoresB.promessa;
      });

      // `diarias.carregando` ainda é `true` — `ResumoRecorte` não renderiza
      // nada, nem o resumo antigo de A nem um resumo parcial de B.
      expect(screen.queryByText(/registro.* no recorte atual/)).not.toBeInTheDocument();

      await act(async () => {
        diariasB.resolver(RESULTADO_B);
        await diariasB.promessa;
      });

      await waitFor(() =>
        expect(
          screen.getByText(
            "5 registros no recorte atual · 3 servidores · R$ 999,00 no total · R$ 333,00 em média",
          ),
        ).toBeInTheDocument(),
      );
    });

    it("/diarias(B) falha, /indicadores(B) sucesso: nenhum resumo aparece e as ações ficam desabilitadas", async () => {
      const usuario = userEvent.setup();
      await montarComRecorteA(usuario);

      pesquisarDiariasMock.mockRejectedValueOnce(new Error("Não foi possível acessar os registros."));
      obterIndicadoresMock.mockResolvedValueOnce(INDICADORES_B);

      await usuario.click(screen.getByRole("button", { name: "Mês atual" }));

      await waitFor(() => expect(screen.getByRole("button", { name: "Gerar Dashboard" })).toBeDisabled());
      expect(screen.queryByText(/registro.* no recorte atual/)).not.toBeInTheDocument();
    });

    it("/indicadores(B) falha, /diarias(B) sucesso: o resumo mostra a contagem de B com o alerta de erro e 'Tentar novamente', sem nenhum valor de A", async () => {
      const usuario = userEvent.setup();
      await montarComRecorteA(usuario);

      pesquisarDiariasMock.mockResolvedValueOnce(RESULTADO_B);
      obterIndicadoresMock.mockRejectedValueOnce(new Error("Não foi possível carregar os indicadores."));

      await usuario.click(screen.getByRole("button", { name: "Mês atual" }));

      // Texto exato (sem nenhum valor concatenado) prova que nenhum
      // indicador de A foi exibido junto da nova contagem de B.
      await waitFor(() => expect(screen.getByText("5 registros no recorte atual")).toBeInTheDocument());
      expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível carregar os indicadores.");
      expect(screen.getByRole("button", { name: "Gerar Dashboard" })).toBeDisabled();

      // "Tentar novamente" reaproveita o filtro (B) vigente.
      obterIndicadoresMock.mockResolvedValueOnce(INDICADORES_B);
      await usuario.click(screen.getByRole("button", { name: "Tentar novamente" }));

      await waitFor(() =>
        expect(
          screen.getByText(
            "5 registros no recorte atual · 3 servidores · R$ 999,00 no total · R$ 333,00 em média",
          ),
        ).toBeInTheDocument(),
      );
      expect(screen.getByRole("button", { name: "Gerar Dashboard" })).toBeEnabled();
    });

    it("/diarias(B) e /indicadores(B) falham: nenhum resumo aparece e as ações ficam desabilitadas", async () => {
      const usuario = userEvent.setup();
      await montarComRecorteA(usuario);

      pesquisarDiariasMock.mockRejectedValueOnce(new Error("Não foi possível acessar os registros."));
      obterIndicadoresMock.mockRejectedValueOnce(new Error("Não foi possível carregar os indicadores."));

      await usuario.click(screen.getByRole("button", { name: "Mês atual" }));

      await waitFor(() => expect(screen.getByRole("button", { name: "Gerar Dashboard" })).toBeDisabled());
      expect(screen.queryByText(/registro.* no recorte atual/)).not.toBeInTheDocument();
    });

    it("usuário troca de B para C antes de qualquer um dos dois resolver: o resultado final é sempre C, nunca A nem B", async () => {
      const usuario = userEvent.setup();
      await montarComRecorteA(usuario);

      const diariasB = criarPromessaControlavel<ResultadoPesquisaResposta>();
      const indicadoresB = criarPromessaControlavel<IndicadoresResposta>();
      pesquisarDiariasMock.mockReturnValueOnce(diariasB.promessa);
      obterIndicadoresMock.mockReturnValueOnce(indicadoresB.promessa);
      await usuario.click(screen.getByRole("button", { name: "Mês atual" }));

      const RESULTADO_C: ResultadoPesquisaResposta = {
        ...RESULTADO_COM_ITENS,
        paginacao: { ...RESULTADO_COM_ITENS.paginacao, total_itens: 9 },
      };
      const INDICADORES_C: IndicadoresResposta = {
        total_diarias: 9,
        total_servidores: 7,
        valor_total: 111,
        valor_medio: 11,
        sincronizacao: { sincronizado_em: "2026-08-01T10:00:00", total_avisos: 0 },
      };
      const diariasC = criarPromessaControlavel<ResultadoPesquisaResposta>();
      const indicadoresC = criarPromessaControlavel<IndicadoresResposta>();
      pesquisarDiariasMock.mockReturnValueOnce(diariasC.promessa);
      obterIndicadoresMock.mockReturnValueOnce(indicadoresC.promessa);
      await usuario.click(screen.getByRole("button", { name: "Mês anterior" }));

      // B (obsoleto) resolve primeiro; C (vigente) resolve depois — o
      // resultado final deve ser sempre C.
      await act(async () => {
        diariasB.resolver(RESULTADO_B);
        indicadoresB.resolver(INDICADORES_B);
        await Promise.allSettled([diariasB.promessa, indicadoresB.promessa]);
      });
      await act(async () => {
        diariasC.resolver(RESULTADO_C);
        indicadoresC.resolver(INDICADORES_C);
        await Promise.allSettled([diariasC.promessa, indicadoresC.promessa]);
      });

      await waitFor(() =>
        expect(
          screen.getByText(
            "9 registros no recorte atual · 7 servidores · R$ 111,00 no total · R$ 11,00 em média",
          ),
        ).toBeInTheDocument(),
      );
      expect(screen.queryByText(/5 registros|R\$ 999,00|R\$ 333,00/)).not.toBeInTheDocument();
    });

    it("trocar de página não refaz a busca de indicadores, só a de diárias", async () => {
      const usuario = userEvent.setup();
      pesquisarDiariasMock.mockResolvedValue({
        ...RESULTADO_COM_ITENS,
        paginacao: { ...RESULTADO_COM_ITENS.paginacao, total_paginas: 2 },
      });
      obterIndicadoresMock.mockResolvedValue(INDICADORES_COM_VALOR);
      render(<CentralAnalitica backendOnline />);
      await waitFor(() => expect(obterIndicadoresMock).toHaveBeenCalledTimes(1));

      await usuario.click(screen.getByRole("button", { name: "Próxima página" }));

      await waitFor(() => expect(pesquisarDiariasMock).toHaveBeenCalledTimes(2));
      expect(obterIndicadoresMock).toHaveBeenCalledTimes(1);
    });

    it("trocar a ordenação não refaz a busca de indicadores, só a de diárias", async () => {
      const usuario = userEvent.setup();
      pesquisarDiariasMock.mockResolvedValue(RESULTADO_COM_ITENS);
      obterIndicadoresMock.mockResolvedValue(INDICADORES_COM_VALOR);
      render(<CentralAnalitica backendOnline />);
      await waitFor(() => expect(obterIndicadoresMock).toHaveBeenCalledTimes(1));

      await usuario.click(screen.getByRole("button", { name: "Valor" }));

      await waitFor(() => expect(pesquisarDiariasMock).toHaveBeenCalledTimes(2));
      expect(obterIndicadoresMock).toHaveBeenCalledTimes(1);
    });

    it("limpar filtros refaz a busca de diárias e de indicadores", async () => {
      const usuario = userEvent.setup();
      await montarComRecorteA(usuario);

      pesquisarDiariasMock.mockResolvedValueOnce(RESULTADO_VAZIO);
      obterIndicadoresMock.mockResolvedValueOnce({
        ...INDICADORES_VAZIOS,
      });
      await usuario.type(
        screen.getByRole("searchbox", { name: /Pesquisar por SEI, CPF, servidor ou município/ }),
        "araripina{Enter}",
      );
      await waitFor(() => expect(screen.getByRole("button", { name: "Limpar filtros" })).toBeInTheDocument());

      pesquisarDiariasMock.mockResolvedValueOnce(RESULTADO_B);
      obterIndicadoresMock.mockResolvedValueOnce(INDICADORES_B);
      await usuario.click(screen.getByRole("button", { name: "Limpar filtros" }));

      await waitFor(() =>
        expect(
          screen.getByText(
            "5 registros no recorte atual · 3 servidores · R$ 999,00 no total · R$ 333,00 em média",
          ),
        ).toBeInTheDocument(),
      );
    });
  });
});
