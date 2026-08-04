// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CentralAnalitica from "./CentralAnalitica";
import type {
  DiagnosticoResposta,
  DiariaCompletaResposta,
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
  };
});

import {
  detalharDiaria,
  gerarRelatorio,
  obterDiagnostico,
  obterDistribuicao,
  obterIndicadores,
  obterOpcoesFiltro,
  pesquisarDiarias,
} from "../services/api";

const pesquisarDiariasMock = vi.mocked(pesquisarDiarias);
const obterOpcoesFiltroMock = vi.mocked(obterOpcoesFiltro);
const detalharDiariaMock = vi.mocked(detalharDiaria);
const obterIndicadoresMock = vi.mocked(obterIndicadores);
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

// Usado só pelo teste de "▸ Ver" (correção 19.8.5): precisa de um `sei`
// que bata com `RESULTADO_COM_ITENS`/`DETALHE_COMPLETO`, para que
// `aoSelecionarRegistro` abra o mesmo registro já detalhado por
// `detalharDiariaMock`.
const DIAGNOSTICO_COM_REGISTRO: DiagnosticoResposta = {
  resumo: { esperado: 0, atencao: 1, inconsistencia: 0 },
  registros: [
    { sei: RESULTADO_COM_ITENS.itens[0].sei, classificacao: "atencao", casos: [] },
  ],
};

beforeEach(() => {
  pesquisarDiariasMock.mockResolvedValue(RESULTADO_VAZIO);
  obterOpcoesFiltroMock.mockResolvedValue(OPCOES_VAZIAS);
  detalharDiariaMock.mockResolvedValue(DETALHE_COMPLETO);
  obterIndicadoresMock.mockResolvedValue(INDICADORES_VAZIOS);
  obterDistribuicaoMock.mockImplementation(async (parametros) => ({ dimensao: parametros.dimensao, pontos: [] }));
  obterDiagnosticoMock.mockResolvedValue(DIAGNOSTICO_VAZIO);
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
    expect(screen.getByRole("button", { name: "Análise Rápida" })).toBeDisabled();
  });

  it("recorte com resultado: as 3 ações ficam habilitadas", async () => {
    pesquisarDiariasMock.mockResolvedValue(RESULTADO_COM_ITENS);
    render(<CentralAnalitica backendOnline />);

    await waitFor(() => expect(screen.getByRole("button", { name: "Gerar Dashboard" })).toBeEnabled());
    expect(screen.getByRole("button", { name: "Gerar Relatório" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Análise Rápida" })).toBeEnabled();
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

  // Sprint 19.8.5 — mesmo padrão acima, para `PainelDiagnostico`.
  it("clicar em 'Análise Rápida' mostra o PainelDiagnostico real no lugar da tabela", async () => {
    const usuario = userEvent.setup();
    pesquisarDiariasMock.mockResolvedValue(RESULTADO_COM_ITENS);
    render(<CentralAnalitica backendOnline />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Análise Rápida" })).toBeEnabled());

    await usuario.click(screen.getByRole("button", { name: "Análise Rápida" }));

    await waitFor(() => expect(obterDiagnosticoMock).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByText("Nenhum registro neste recorte para diagnosticar.")).toBeInTheDocument(),
    );
    expect(screen.queryByText("Ainda não disponível")).not.toBeInTheDocument();

    await usuario.click(screen.getByRole("button", { name: "← Voltar aos resultados" }));
    expect(screen.queryByText("Nenhum registro neste recorte para diagnosticar.")).not.toBeInTheDocument();
  });

  // Sprint 19.8.5 — "▸ Ver" do Diagnóstico abre o mesmo painel de
  // detalhamento do § 5 (nunca uma tela nova), com o foco inicial no
  // bloco "Avisos e diagnósticos" em vez do título (`emFoco="diagnosticos"`,
  // já implementado em `PainelDetalhamentoDiaria` na 19.8.4, mas nunca
  // alcançável na página real antes desta correção).
  it("'▸ Ver' no Diagnóstico abre o painel de detalhamento com o foco no bloco de avisos", async () => {
    const usuario = userEvent.setup();
    pesquisarDiariasMock.mockResolvedValue(RESULTADO_COM_ITENS);
    obterDiagnosticoMock.mockResolvedValue(DIAGNOSTICO_COM_REGISTRO);
    render(<CentralAnalitica backendOnline />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Análise Rápida" })).toBeEnabled());
    await usuario.click(screen.getByRole("button", { name: "Análise Rápida" }));
    const linha = await screen.findByRole("row", {
      name: `Ver diagnóstico da diária ${RESULTADO_COM_ITENS.itens[0].sei}`,
    });

    await usuario.click(linha);

    await screen.findByRole("heading", { name: RESULTADO_COM_ITENS.itens[0].sei });
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Avisos e diagnósticos" })).toHaveFocus(),
    );
    expect(screen.getByRole("heading", { name: RESULTADO_COM_ITENS.itens[0].sei })).not.toHaveFocus();
  });

  // Sprint 19.8.5 — "Ver histórico deste CPF" continua levando de volta
  // aos resultados (comportamento já homologado na 19.5.8.1) mesmo quando
  // o painel foi aberto a partir do Diagnóstico, não da tabela.
  it("'Ver histórico deste CPF' a partir do Diagnóstico volta para os resultados", async () => {
    const usuario = userEvent.setup();
    pesquisarDiariasMock.mockResolvedValue(RESULTADO_COM_ITENS);
    obterDiagnosticoMock.mockResolvedValue(DIAGNOSTICO_COM_REGISTRO);
    render(<CentralAnalitica backendOnline />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Análise Rápida" })).toBeEnabled());
    await usuario.click(screen.getByRole("button", { name: "Análise Rápida" }));
    const linha = await screen.findByRole("row", {
      name: `Ver diagnóstico da diária ${RESULTADO_COM_ITENS.itens[0].sei}`,
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
      await usuario.click(screen.getByRole("button", { name: "Últimos 7 dias" }));

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
