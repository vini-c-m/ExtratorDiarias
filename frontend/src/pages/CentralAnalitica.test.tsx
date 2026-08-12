// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  // MS UX — Simplificação da Central Analítica (2026-08-10): de 16 filtros
  // colapsados atrás de "Filtros" para só 4 campos SEMPRE visíveis
  // (SEI/CPF/Período Inicial/Período Final, item 1) — nenhum toggle
  // "Filtros" a mais para expandir.
  it("abre direto no fluxo único, sem abas: filtros e tabela já visíveis", async () => {
    render(<CentralAnalitica backendOnline />);

    expect(screen.getByRole("heading", { name: "Central Analítica" })).toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    await waitFor(() => expect(pesquisarDiariasMock).toHaveBeenCalled());
    expect(screen.getByLabelText("SEI")).toBeInTheDocument();
    expect(screen.getByLabelText("CPF")).toBeInTheDocument();
    expect(screen.getByLabelText("Período inicial")).toBeInTheDocument();
    expect(screen.getByLabelText("Período final")).toBeInTheDocument();
  });

  // H) item 13 do pedido — a barra de pesquisa rápida não existe mais.
  it("H) não existe mais nenhuma barra de pesquisa rápida", async () => {
    render(<CentralAnalitica backendOnline />);

    await waitFor(() => expect(pesquisarDiariasMock).toHaveBeenCalled());
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
  });

  it("digitar no campo SEI refaz a busca via useDiarias", async () => {
    render(<CentralAnalitica backendOnline />);
    await waitFor(() => expect(pesquisarDiariasMock).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText("SEI"), { target: { value: "19.20.0001" } });

    await waitFor(() => expect(pesquisarDiariasMock).toHaveBeenCalledTimes(2));
    const [ultimaChamada] = pesquisarDiariasMock.mock.calls.at(-1)!;
    expect(ultimaChamada.sei).toBe("19.20.0001");
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
  // `diarias.filtros` já usados por `useDiarias`.
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

  it("recorte vazio: as 2 ações de geração ficam desabilitadas", async () => {
    render(<CentralAnalitica backendOnline />);

    await waitFor(() => expect(pesquisarDiariasMock).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: "Gerar Dashboard" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Gerar Relatório" })).toBeDisabled();
  });

  it("recorte com resultado: as 2 ações de geração ficam habilitadas", async () => {
    pesquisarDiariasMock.mockResolvedValue(RESULTADO_COM_ITENS);
    render(<CentralAnalitica backendOnline />);

    await waitFor(() => expect(screen.getByRole("button", { name: "Gerar Dashboard" })).toBeEnabled());
    expect(screen.getByRole("button", { name: "Gerar Relatório" })).toBeEnabled();
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

  // MS UX (item 5) — I) a notificação de Documentos Hábeis Pendentes
  // substitui o antigo botão com badge de `PainelAcoesRecorte` + o antigo
  // banner dedicado — agora é uma notificação única em destaque, no lugar
  // onde antes ficava a barra de pesquisa rápida.
  describe("I) Notificação de Documentos Hábeis Pendentes", () => {
    it("sem nenhuma pendência, a notificação não aparece", async () => {
      render(<CentralAnalitica backendOnline />);

      await waitFor(() => expect(obterDocumentosHabeisPendentesMock).toHaveBeenCalled());
      expect(screen.queryByText(/Documentos? Háb(el|eis) Pendente/)).not.toBeInTheDocument();
    });

    it("com pendências, mostra a contagem total (aguardando + revisão manual) em destaque", async () => {
      obterDocumentosHabeisPendentesMock.mockResolvedValue({
        resumo: { aguardando_liberacao: 2, revisao_manual_necessaria: 1 },
        registros: DOCUMENTOS_HABEIS_PENDENTES_COM_REGISTRO.registros,
      });
      render(<CentralAnalitica backendOnline />);

      expect(await screen.findByRole("button", { name: /3 Documentos Hábeis Pendentes/ })).toBeInTheDocument();
    });

    it("clicar na notificação mostra o PainelDocumentosHabeisPendentes real no lugar da tabela", async () => {
      const usuario = userEvent.setup();
      pesquisarDiariasMock.mockResolvedValue(RESULTADO_COM_ITENS);
      obterDocumentosHabeisPendentesMock.mockResolvedValue(DOCUMENTOS_HABEIS_PENDENTES_COM_REGISTRO);
      render(<CentralAnalitica backendOnline />);
      const botaoAbrir = await screen.findByRole("button", { name: /1 Documento Hábil Pendente/ });

      await usuario.click(botaoAbrir);

      // `PainelDocumentosHabeisPendentes` recebe o resultado já carregado
      // pela mesma instância de `useDocumentosHabeisPendentes` (prop, não
      // uma busca independente) — nenhuma chamada nova.
      const linha = await screen.findByRole("row", {
        name: `Ver detalhes do processo ${RESULTADO_COM_ITENS.itens[0].sei}`,
      });
      expect(linha).toBeInTheDocument();
      expect(screen.queryByText("Ainda não disponível")).not.toBeInTheDocument();
      expect(obterDiagnosticoMock).not.toHaveBeenCalled();

      await usuario.click(screen.getByRole("button", { name: "← Voltar aos resultados" }));
      expect(
        screen.queryByRole("row", { name: `Ver detalhes do processo ${RESULTADO_COM_ITENS.itens[0].sei}` }),
      ).not.toBeInTheDocument();
    });

    // Micro-sprint B ("Central de Regularização de DH") — item 4 do
    // pedido: o clique apenas navega, nunca recria a consulta (nenhuma
    // chamada nova a `obterDocumentosHabeisPendentes` é esperada aqui).
    it("Micro-sprint B — sem a prop de navegação, nenhum link para a Central de Regularização de DH aparece", async () => {
      const usuario = userEvent.setup();
      obterDocumentosHabeisPendentesMock.mockResolvedValue(DOCUMENTOS_HABEIS_PENDENTES_COM_REGISTRO);
      render(<CentralAnalitica backendOnline />);
      await usuario.click(await screen.findByRole("button", { name: /1 Documento Hábil Pendente/ }));

      expect(
        screen.queryByRole("button", { name: /Ir para a Central de Regularização de DH/ }),
      ).not.toBeInTheDocument();
    });

    it("Micro-sprint B — com a prop de navegação, o botão aparece e só navega (não recria a consulta)", async () => {
      const usuario = userEvent.setup();
      obterDocumentosHabeisPendentesMock.mockResolvedValue(DOCUMENTOS_HABEIS_PENDENTES_COM_REGISTRO);
      const aoIrParaCentralRegularizacaoDH = vi.fn();
      render(
        <CentralAnalitica backendOnline aoIrParaCentralRegularizacaoDH={aoIrParaCentralRegularizacaoDH} />,
      );
      await usuario.click(await screen.findByRole("button", { name: /1 Documento Hábil Pendente/ }));
      const chamadasAntes = obterDocumentosHabeisPendentesMock.mock.calls.length;

      await usuario.click(
        screen.getByRole("button", { name: /Ir para a Central de Regularização de DH/ }),
      );

      expect(aoIrParaCentralRegularizacaoDH).toHaveBeenCalledTimes(1);
      expect(obterDocumentosHabeisPendentesMock.mock.calls.length).toBe(chamadasAntes);
    });
  });

  // Correção de foco — "Ver detalhes" de Documentos Hábeis Pendentes abre o
  // mesmo painel de detalhamento do § 5 (nunca uma tela nova), com o foco
  // inicial no bloco "Avisos e diagnósticos" em vez do título.
  it("'Ver detalhes' em Documentos Hábeis Pendentes abre o painel de detalhamento com o foco no bloco de avisos", async () => {
    const usuario = userEvent.setup();
    pesquisarDiariasMock.mockResolvedValue(RESULTADO_COM_ITENS);
    obterDocumentosHabeisPendentesMock.mockResolvedValue(DOCUMENTOS_HABEIS_PENDENTES_COM_REGISTRO);
    render(<CentralAnalitica backendOnline />);
    const botaoAbrir = await screen.findByRole("button", { name: /1 Documento Hábil Pendente/ });
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
    const botaoAbrir = await screen.findByRole("button", { name: /1 Documento Hábil Pendente/ });
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

  // MS UX — Simplificação da Central Analítica (2026-08-10, item 8): Dark
  // Mode Executivo virou um TOGGLE único — "L) Dark Mode é toggle único" e
  // "M) 'Voltar ao modo operacional' não existe mais" (item 13).
  describe("Dark Mode Executivo (toggle único, MS UX 2026-08-10)", () => {
    it("recorte vazio: o toggle 'Dark Mode Executivo' fica desabilitado", async () => {
      render(<CentralAnalitica backendOnline />);

      await waitFor(() => expect(pesquisarDiariasMock).toHaveBeenCalled());
      expect(screen.getByRole("button", { name: "Dark Mode Executivo" })).toBeDisabled();
    });

    it("recorte com resultado: o toggle 'Dark Mode Executivo' fica habilitado", async () => {
      pesquisarDiariasMock.mockResolvedValue(RESULTADO_COM_ITENS);
      render(<CentralAnalitica backendOnline />);

      await waitFor(() => expect(screen.getByRole("button", { name: "Dark Mode Executivo" })).toBeEnabled());
    });

    it("L) clicar liga o Dark Mode Executivo (toggle aceso, aria-pressed=true) e mostra o conteúdo real", async () => {
      const usuario = userEvent.setup();
      pesquisarDiariasMock.mockResolvedValue(RESULTADO_COM_ITENS);
      obterIndicadoresMock.mockResolvedValue(INDICADORES_COM_VALOR);
      render(<CentralAnalitica backendOnline />);
      await waitFor(() => expect(screen.getByRole("button", { name: "Dark Mode Executivo" })).toBeEnabled());

      const toggle = screen.getByRole("button", { name: "Dark Mode Executivo" });
      expect(toggle).toHaveAttribute("aria-pressed", "false");
      await usuario.click(toggle);

      expect(await screen.findByRole("heading", { name: "Modo Executivo" })).toBeInTheDocument();
      expect(screen.queryByRole("table")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Dark Mode Executivo" })).toHaveAttribute("aria-pressed", "true");
      // Nenhuma nova busca de `/diarias` — o mesmo recorte de `useDiarias`
      // é reaproveitado, nunca refeito ao trocar de modo.
      expect(pesquisarDiariasMock).toHaveBeenCalledTimes(1);
    });

    it("L/M) clicar de novo no MESMO botão desliga o Dark Mode — não existe mais um botão separado 'Voltar ao Modo Operacional'", async () => {
      const usuario = userEvent.setup();
      pesquisarDiariasMock.mockResolvedValue(RESULTADO_COM_ITENS);
      obterIndicadoresMock.mockResolvedValue(INDICADORES_COM_VALOR);
      render(<CentralAnalitica backendOnline />);
      await waitFor(() => expect(screen.getByRole("button", { name: "Dark Mode Executivo" })).toBeEnabled());
      const toggle = screen.getByRole("button", { name: "Dark Mode Executivo" });
      await usuario.click(toggle);
      await screen.findByRole("heading", { name: "Modo Executivo" });

      expect(screen.queryByRole("button", { name: /Voltar ao Modo Operacional/ })).not.toBeInTheDocument();
      // Só existe UM botão "Dark Mode Executivo" na árvore inteira.
      expect(screen.getAllByRole("button", { name: "Dark Mode Executivo" })).toHaveLength(1);

      await usuario.click(screen.getByRole("button", { name: "Dark Mode Executivo" }));

      expect(screen.queryByRole("heading", { name: "Modo Executivo" })).not.toBeInTheDocument();
      expect(screen.getByRole("table")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Dark Mode Executivo" })).toHaveAttribute("aria-pressed", "false");
      expect(pesquisarDiariasMock).toHaveBeenCalledTimes(1);
    });

    // J) item 13 — Dark Mode ativo esconde DH/Gerar Dashboard/Gerar
    // Relatório/sincronização manual (o mock de `IndicadorSincronizacao`
    // renderiza sempre "Indicador de sincronização" — some daqui também).
    it("J) Dark Mode ativo esconde a notificação de DH, os botões de geração e o indicador de sincronização", async () => {
      const usuario = userEvent.setup();
      pesquisarDiariasMock.mockResolvedValue(RESULTADO_COM_ITENS);
      obterIndicadoresMock.mockResolvedValue(INDICADORES_COM_VALOR);
      obterDocumentosHabeisPendentesMock.mockResolvedValue(DOCUMENTOS_HABEIS_PENDENTES_COM_REGISTRO);
      render(<CentralAnalitica backendOnline />);
      await screen.findByRole("button", { name: /1 Documento Hábil Pendente/ });
      expect(screen.getByText("Indicador de sincronização")).toBeInTheDocument();

      await usuario.click(screen.getByRole("button", { name: "Dark Mode Executivo" }));
      await screen.findByRole("heading", { name: "Modo Executivo" });

      expect(screen.queryByText(/Documento Hábil Pendente/)).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Gerar Dashboard" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Gerar Relatório" })).not.toBeInTheDocument();
      expect(screen.queryByText("Indicador de sincronização")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("SEI")).not.toBeInTheDocument();
    });

    // K) item 13 — desligar o Dark Mode restaura tudo (nenhuma lógica foi
    // removida, só a visibilidade).
    it("K) desligar o Dark Mode restaura a notificação de DH, os botões de geração e o indicador de sincronização", async () => {
      const usuario = userEvent.setup();
      pesquisarDiariasMock.mockResolvedValue(RESULTADO_COM_ITENS);
      obterIndicadoresMock.mockResolvedValue(INDICADORES_COM_VALOR);
      obterDocumentosHabeisPendentesMock.mockResolvedValue(DOCUMENTOS_HABEIS_PENDENTES_COM_REGISTRO);
      render(<CentralAnalitica backendOnline />);
      await screen.findByRole("button", { name: /1 Documento Hábil Pendente/ });
      const toggle = screen.getByRole("button", { name: "Dark Mode Executivo" });
      await usuario.click(toggle);
      await screen.findByRole("heading", { name: "Modo Executivo" });

      await usuario.click(screen.getByRole("button", { name: "Dark Mode Executivo" }));

      expect(await screen.findByRole("button", { name: /1 Documento Hábil Pendente/ })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Gerar Dashboard" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Gerar Relatório" })).toBeInTheDocument();
      expect(screen.getByText("Indicador de sincronização")).toBeInTheDocument();
      expect(screen.getByLabelText("SEI")).toBeInTheDocument();
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

  // MS — Insights vivos por destaque sequencial + isolamento de filtros
  // (2026-08-10, itens 8-14): Modo Operacional e Dark Mode Executivo têm
  // contextos de filtro isolados — nada aplicado só dentro do Executivo
  // (zoom de período, "Comparar", drill-down por gráfico ainda não
  // explicitamente "aplicado") pode permanecer ativo ao desligar o toggle.
  describe("Isolamento de filtros entre Modo Operacional e Dark Mode Executivo", () => {
    async function ligarDarkMode(usuario: ReturnType<typeof userEvent.setup>) {
      pesquisarDiariasMock.mockResolvedValue(RESULTADO_COM_ITENS);
      obterIndicadoresMock.mockResolvedValue(INDICADORES_COM_VALOR);
      render(<CentralAnalitica backendOnline />);
      await waitFor(() => expect(screen.getByRole("button", { name: "Dark Mode Executivo" })).toBeEnabled());
      await usuario.click(screen.getByRole("button", { name: "Dark Mode Executivo" }));
      await screen.findByRole("heading", { name: "Modo Executivo" });
    }

    // A) Comparação ("Comparar: Membros × Servidores") escreve
    // `categoria_funcional` direto em `diarias.filtros` (mesma instância
    // compartilhada, decisão de arquitetura) enquanto permanece no
    // Executivo — ao sair pelo toggle, não pode sobrar no Operacional.
    it("A) 'Comparar: Membros × Servidores' aplica categoria_funcional no Dark Mode → sair → não permanece no Operacional", async () => {
      const usuario = userEvent.setup();
      await ligarDarkMode(usuario);

      await usuario.click(screen.getByRole("button", { name: "Comparar" }));
      await usuario.click(screen.getByRole("menuitem", { name: "Membros × Servidores" }));
      await waitFor(() => expect(pesquisarDiariasMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ categoria_funcional: "MEMBRO" }),
      ));

      await usuario.click(screen.getByRole("button", { name: "Dark Mode Executivo" }));

      await waitFor(() => expect(pesquisarDiariasMock).toHaveBeenLastCalledWith(
        expect.not.objectContaining({ categoria_funcional: expect.anything() }),
      ));
    });

    // B) Zoom temporal nos gráficos de evolução ("filtro por gráfico") —
    // mesmo padrão: escreve período direto em `diarias.filtros` dentro do
    // Executivo; sair pelo toggle restaura o período operacional anterior
    // (aqui, nenhum — "Todos os períodos").
    it("B) zoom de período num gráfico aplica filtro no Dark Mode → sair → período não permanece", async () => {
      const usuario = userEvent.setup();
      obterDistribuicaoMock.mockImplementation(async (parametros) =>
        parametros.dimensao === "periodo"
          ? { dimensao: "periodo", pontos: [{ rotulo: "2026-05", contagem: 8, valor: 3200 }] }
          : { dimensao: parametros.dimensao, pontos: [] },
      );
      await ligarDarkMode(usuario);
      await waitFor(() => expect(screen.getByText("Evolução da quantidade")).toBeInTheDocument());

      const zonaMaio = screen.getByRole("button", { name: "mai/2026: 8 — selecionar para o intervalo de zoom" });
      fireEvent.pointerDown(zonaMaio);
      fireEvent.pointerUp(zonaMaio);
      await usuario.click(screen.getByRole("button", { name: "Aplicar como filtro" }));
      await waitFor(() => expect(pesquisarDiariasMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ periodo_inicial: "2026-05-01", periodo_final: "2026-05-31" }),
      ));

      await usuario.click(screen.getByRole("button", { name: "Dark Mode Executivo" }));

      await waitFor(() => expect(pesquisarDiariasMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ periodo_inicial: undefined, periodo_final: undefined }),
      ));
      expect(screen.getByLabelText("Período inicial")).toHaveValue("");
    });

    // C) Drill-down territorial: só ABRIR o painel lateral contextual
    // (clicar num ponto do gráfico de Municípios) nunca aplica filtro —
    // fechar sem clicar "Aplicar filtro" e sair do Dark Mode nunca deixa
    // nada preso (reforça o isolamento por um ângulo diferente de A/B: a
    // simples navegação/exploração dentro do Executivo é sempre inócua).
    it("C) abrir e fechar o drill-down territorial sem 'Aplicar filtro' não deixa nenhum filtro preso", async () => {
      const usuario = userEvent.setup();
      obterDistribuicaoMock.mockImplementation(async (parametros) =>
        parametros.dimensao === "municipio"
          ? { dimensao: "municipio", pontos: [{ rotulo: "Araripina", contagem: 1, valor: 200 }] }
          : { dimensao: parametros.dimensao, pontos: [] },
      );
      await ligarDarkMode(usuario);
      await waitFor(() => expect(screen.getByText("Municípios")).toBeInTheDocument());

      await usuario.click(screen.getByRole("button", { name: /Filtrar por Araripina/ }));
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      await usuario.click(screen.getByRole("button", { name: "Fechar painel" }));

      await usuario.click(screen.getByRole("button", { name: "Dark Mode Executivo" }));

      await waitFor(() => expect(pesquisarDiariasMock).toHaveBeenLastCalledWith(
        expect.not.objectContaining({ municipio: expect.anything() }),
      ));
    });

    // D) Reentrar no Dark Mode depois de A) começa com o Executivo
    // limpo — nenhuma comparação/estado residual sobrevive.
    it("D) reentrar no Dark Mode depois de uma comparação começa limpo (sem 'Comparando:')", async () => {
      const usuario = userEvent.setup();
      await ligarDarkMode(usuario);
      await usuario.click(screen.getByRole("button", { name: "Comparar" }));
      await usuario.click(screen.getByRole("menuitem", { name: "Membros × Servidores" }));
      await waitFor(() => expect(screen.getByText(/Comparando:/)).toBeInTheDocument());

      await usuario.click(screen.getByRole("button", { name: "Dark Mode Executivo" })); // sai
      await usuario.click(screen.getByRole("button", { name: "Dark Mode Executivo" })); // entra de novo
      await screen.findByRole("heading", { name: "Modo Executivo" });

      expect(screen.queryByText(/Comparando:/)).not.toBeInTheDocument();
    });

    // E) Um filtro operacional já existente (SEI) deve chegar ao Executivo
    // normalmente — "isolamento" não significa zerar o recorte ao entrar,
    // só impedir que o que é exclusivo do Executivo vaze de volta.
    it("E) filtro operacional (SEI) já aplicado chega ao Dark Mode normalmente, sem ser descartado", async () => {
      const usuario = userEvent.setup();
      pesquisarDiariasMock.mockResolvedValue(RESULTADO_COM_ITENS);
      obterIndicadoresMock.mockResolvedValue(INDICADORES_COM_VALOR);
      render(<CentralAnalitica backendOnline />);
      await waitFor(() => expect(pesquisarDiariasMock).toHaveBeenCalledTimes(1));
      fireEvent.change(screen.getByLabelText("SEI"), { target: { value: "19.20.0001" } });
      await waitFor(() => expect(pesquisarDiariasMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ sei: "19.20.0001" }),
      ));

      await waitFor(() => expect(screen.getByRole("button", { name: "Dark Mode Executivo" })).toBeEnabled());
      await usuario.click(screen.getByRole("button", { name: "Dark Mode Executivo" }));
      await screen.findByRole("heading", { name: "Modo Executivo" });

      expect(obterIndicadoresMock).toHaveBeenLastCalledWith(expect.objectContaining({ sei: "19.20.0001" }));
    });

    // F) Depois de sair do Dark Mode, os controles operacionais continuam
    // normalmente utilizáveis (não ficam presos/desabilitados).
    it("F) sair do Dark Mode deixa os controles operacionais utilizáveis", async () => {
      const usuario = userEvent.setup();
      await ligarDarkMode(usuario);

      await usuario.click(screen.getByRole("button", { name: "Dark Mode Executivo" }));
      await waitFor(() => expect(screen.getByRole("table")).toBeInTheDocument());

      fireEvent.change(screen.getByLabelText("SEI"), { target: { value: "19.20.0002" } });
      await waitFor(() => expect(pesquisarDiariasMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ sei: "19.20.0002" }),
      ));
    });

    // G) Combinando duas mutações executivo-only (comparação +
    // zoom de período) numa mesma sessão do Dark Mode: sair restaura as
    // DUAS de uma vez — nenhuma fica "órfã".
    it("G) nenhum filtro aplicado só dentro do Dark Mode fica preso, mesmo combinando comparação e zoom", async () => {
      const usuario = userEvent.setup();
      obterDistribuicaoMock.mockImplementation(async (parametros) =>
        parametros.dimensao === "periodo"
          ? { dimensao: "periodo", pontos: [{ rotulo: "2026-05", contagem: 8, valor: 3200 }] }
          : { dimensao: parametros.dimensao, pontos: [] },
      );
      await ligarDarkMode(usuario);

      await usuario.click(screen.getByRole("button", { name: "Comparar" }));
      await usuario.click(screen.getByRole("menuitem", { name: "Membros × Servidores" }));
      await waitFor(() => expect(pesquisarDiariasMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ categoria_funcional: "MEMBRO" }),
      ));
      await waitFor(() => expect(screen.getByText("Evolução da quantidade")).toBeInTheDocument());
      const zonaMaio = screen.getByRole("button", { name: "mai/2026: 8 — selecionar para o intervalo de zoom" });
      fireEvent.pointerDown(zonaMaio);
      fireEvent.pointerUp(zonaMaio);
      await usuario.click(screen.getByRole("button", { name: "Aplicar como filtro" }));
      await waitFor(() => expect(pesquisarDiariasMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ periodo_inicial: "2026-05-01" }),
      ));

      await usuario.click(screen.getByRole("button", { name: "Dark Mode Executivo" }));

      await waitFor(() => expect(pesquisarDiariasMock).toHaveBeenLastCalledWith(
        expect.not.objectContaining({ categoria_funcional: expect.anything() }),
      ));
      const [ultimaChamada] = pesquisarDiariasMock.mock.calls.at(-1)!;
      expect(ultimaChamada.periodo_inicial).toBeUndefined();
      expect(ultimaChamada.categoria_funcional).toBeUndefined();
    });
  });

  it("backend offline: mostra o aviso de aplicativo iniciando", () => {
    render(<CentralAnalitica backendOnline={false} />);

    expect(screen.getByText("Aguardando o aplicativo terminar de iniciar...")).toBeInTheDocument();
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

    it("'Ver histórico deste CPF' é alcançável na página real, aplica o CPF completo ao useDiarias, refaz a pesquisa na página 1 e fecha o painel", async () => {
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

      // MS UX (2026-08-10) — `ChipsFiltroAtivo` saiu da área de filtros
      // (item 1); o campo CPF (controlado, sem máscara própria) passa a
      // refletir o valor aplicado diretamente.
      expect(screen.getByLabelText("CPF")).toHaveValue(DETALHE_COMPLETO.cpf);
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
  // real (não só no hook isolado), todas as ordens de chegada possíveis —
  // MS UX (2026-08-10): o gatilho de mudança de recorte deixou de ser
  // `FiltrosRapidos` ("Mês atual"/"Mês anterior", removido) e passou a ser
  // o campo Período Inicial (mesmo `useDiarias.aplicarFiltro` por baixo).
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

    function mudarParaRecorteB() {
      fireEvent.change(screen.getByLabelText("Período inicial"), { target: { value: "2026-02-01" } });
    }

    function mudarParaRecorteC() {
      fireEvent.change(screen.getByLabelText("Período final"), { target: { value: "2026-03-01" } });
    }

    it("/diarias(B) resolve antes de /indicadores(B): a contagem de B aparece sem nenhum indicador de A junto", async () => {
      const usuario = userEvent.setup();
      await montarComRecorteA(usuario);

      const diariasB = criarPromessaControlavel<ResultadoPesquisaResposta>();
      const indicadoresB = criarPromessaControlavel<IndicadoresResposta>();
      pesquisarDiariasMock.mockReturnValueOnce(diariasB.promessa);
      obterIndicadoresMock.mockReturnValueOnce(indicadoresB.promessa);

      mudarParaRecorteB();

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

      mudarParaRecorteB();

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

      mudarParaRecorteB();

      await waitFor(() => expect(screen.getByRole("button", { name: "Gerar Dashboard" })).toBeDisabled());
      expect(screen.queryByText(/registro.* no recorte atual/)).not.toBeInTheDocument();
    });

    it("/indicadores(B) falha, /diarias(B) sucesso: o resumo mostra a contagem de B com o alerta de erro e 'Tentar novamente', sem nenhum valor de A", async () => {
      const usuario = userEvent.setup();
      await montarComRecorteA(usuario);

      pesquisarDiariasMock.mockResolvedValueOnce(RESULTADO_B);
      obterIndicadoresMock.mockRejectedValueOnce(new Error("Não foi possível carregar os indicadores."));

      mudarParaRecorteB();

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

      mudarParaRecorteB();

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
      mudarParaRecorteB();

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
      mudarParaRecorteC();

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

    // F) item 13 — "Limpar filtro" (por grupo, já que "Limpar filtros"
    // global saiu com `ChipsFiltroAtivo`) refaz a busca de diárias e de
    // indicadores.
    it("F) Limpar filtro de Período refaz a busca de diárias e de indicadores", async () => {
      const usuario = userEvent.setup();
      await montarComRecorteA(usuario);

      pesquisarDiariasMock.mockResolvedValueOnce(RESULTADO_VAZIO);
      obterIndicadoresMock.mockResolvedValueOnce({ ...INDICADORES_VAZIOS });
      mudarParaRecorteB();
      await waitFor(() => expect(screen.getByRole("button", { name: /Limpar filtro de Período/ })).toBeInTheDocument());

      pesquisarDiariasMock.mockResolvedValueOnce(RESULTADO_B);
      obterIndicadoresMock.mockResolvedValueOnce(INDICADORES_B);
      await usuario.click(screen.getByRole("button", { name: /Limpar filtro de Período/ }));

      await waitFor(() => expect(pesquisarDiariasMock).toHaveBeenCalledTimes(3));
      expect(obterIndicadoresMock).toHaveBeenCalledTimes(3);
    });
  });
});
