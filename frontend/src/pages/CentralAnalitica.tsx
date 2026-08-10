import { useRef, useEffect, useState } from "react";
import DashboardRecorte from "../components/analitica/DashboardRecorte";
import ModoExecutivo from "../components/analitica/executivo/ModoExecutivo";
import IndicadorSincronizacao from "../components/analitica/IndicadorSincronizacao";
import ModalRelatorio from "../components/analitica/ModalRelatorio";
import NotificacaoDocumentosHabeisPendentes from "../components/analitica/NotificacaoDocumentosHabeisPendentes";
import PainelAcoesRecorte from "../components/analitica/PainelAcoesRecorte";
import PainelDetalhamentoDiaria from "../components/analitica/PainelDetalhamentoDiaria";
import PainelDiagnostico from "../components/analitica/PainelDiagnostico";
import PainelDocumentosHabeisPendentes from "../components/analitica/PainelDocumentosHabeisPendentes";
import PainelFiltrosPrincipal from "../components/analitica/PainelFiltrosPrincipal";
import ResumoRecorte from "../components/analitica/ResumoRecorte";
import TabelaDiarias from "../components/analitica/TabelaDiarias";
import Alerta from "../components/ui/Alerta";
import Botao from "../components/ui/Botao";
import { CAMPOS_DE_FILTRO, useDiarias, type CampoDeFiltro } from "../hooks/useDiarias";
import { useDocumentosHabeisPendentes } from "../hooks/useDocumentosHabeisPendentes";
import { useIndicadores } from "../hooks/useIndicadores";
import { MENSAGENS } from "../lib/mensagens";
import { TIPOGRAFIA } from "../theme/tipografia";
import type { ParametrosPesquisaDiariasQuery, SituacaoDocumentoHabilPendente } from "../types/analitica";

interface Props {
  backendOnline: boolean;
  // Alerta global de Documentos Hábeis Pendentes (tela inicial) — abre já
  // na visualização de pendências, em vez do padrão "resultados". Só lido
  // na montagem (este componente remonta a cada entrada em "analitica").
  abrirEmDocumentosHabeisPendentes?: boolean;
  /** MS1 (Recuperação Visual, 2026-08-09) — sinal PURAMENTE visual de
   * "Dark Mode Executivo ativo" para o shell global (`App.tsx`), que não
   * tem acesso a `visualizacao` (estado interno deste componente). Nenhuma
   * navegação/lógica nova: só propaga `visualizacao === "executivo"` para
   * fora, para que `App.tsx` possa aplicar o mesmo tema ao cabeçalho
   * global e ao fundo da janela, não só à Central. Opcional — nenhum
   * outro consumidor/teste deste componente precisa passar isto. */
  aoMudarTemaExecutivo?: (ativo: boolean) => void;
}

// Sprint 21.2 (Modo Executivo) — `"executivo"` é uma 5ª visualização, no
// mesmo padrão aditivo já usado por `"dashboard"`/`"relatorio"`/
// `"diagnostico"` (Sprint 19.5.5/19.8.5): nenhum estado novo, só mais um
// branch de renderização dentro do mesmo componente raiz. O Dashboard
// operacional (`"dashboard"`) permanece inalterado, byte a byte.
//
// Correção de foco (2026-08-05, pedido explícito do usuário) —
// `"documentos_habeis_pendentes"` é uma 6ª visualização, mesmo padrão
// aditivo: o botão de `PainelAcoesRecorte` (antes "Análise Rápida
// (Diagnóstico)") passa a abrir esta tela nova, nunca mais
// `"diagnostico"`. `"diagnostico"` continua existindo sem nenhuma
// mudança — só deixa de ser alcançável por aquele botão; segue alcançável
// pelo Modo Executivo ("Abrir diagnóstico" dos insights), que continua
// consumindo o Diagnóstico geral internamente.
type Visualizacao =
  | "resultados"
  | "dashboard"
  | "relatorio"
  | "diagnostico"
  | "executivo"
  | "documentos_habeis_pendentes";

// Sprint 19.5.5 — cutover do shell (`v2-plano-tecnico.md` § 18, único
// micro-sprint não-aditivo daquela Sprint): fim do modelo de 3 abas fixas
// (`SeletorDeAbas`/`AbaBloqueada`, removidos). Fluxo único — filtros →
// resultados → ações (`v2-arquitetura-funcional.md` § 2): `useDiarias`/
// `useOpcoesFiltro`, antes isolados dentro de `AbaPesquisa`, sobem para
// este componente raiz, que agora é ele mesmo o que a Pesquisa já era, sem
// mais nada ao lado para escolher primeiro.
//
// Sprint 19.8.5 (correção de escopo — mesmo padrão da 19.5.6.1 —
// `v2-plano-tecnico.md` § 18, entrada "19.8.5"): os 3 destinos de
// `PainelAcoesRecorte` ganham conteúdo real aqui —
// `DashboardRecorte`/`ModalRelatorio`/`PainelDiagnostico`, já prontos e
// testados isoladamente desde as Sprints 19.6.4/19.7.3–19.7.4/
// 19.8.1–19.8.4, respectivamente, mas nunca conectados a este componente
// (achado da auditoria do bloco 19.8). "Ainda não disponível"/
// `TEXTO_EM_CONSTRUCAO` removidos — não sobra mais nenhum destino sem
// conteúdo.
export default function CentralAnalitica({
  backendOnline,
  abrirEmDocumentosHabeisPendentes,
  aoMudarTemaExecutivo,
}: Props) {
  const [visualizacao, setVisualizacao] = useState<Visualizacao>(
    abrirEmDocumentosHabeisPendentes ? "documentos_habeis_pendentes" : "resultados",
  );
  const [seiSelecionado, setSeiSelecionado] = useState<string | null>(null);
  // Sprint 19.8.5 — `PainelDetalhamentoDiaria` é compartilhado entre a
  // tabela de resultados e o Diagnóstico (mesmo painel, § 5/§ 8); esta
  // origem decide só se o foco inicial vai para o título (linha da
  // tabela, comportamento já homologado) ou para o bloco "Avisos e
  // diagnósticos" (`▸ Ver`/"Ver detalhes", `emFoco="diagnosticos"`).
  // Correção de foco (2026-08-05) — "Documentos Hábeis Pendentes" reaproveita
  // o mesmo bloco de foco do Diagnóstico (é literalmente o mesmo caso de
  // `dh`), nunca um terceiro alvo de foco novo em `PainelDetalhamentoDiaria`.
  const [origemDetalhamento, setOrigemDetalhamento] = useState<
    "tabela" | "diagnostico" | "documentos_habeis_pendentes"
  >("tabela");
  // MS UX (2026-08-10) — o banner específico de "liberação atingida" foi
  // substituído pela notificação única de Documentos Hábeis Pendentes
  // (`NotificacaoDocumentosHabeisPendentes`, item 5 do pedido); filtro
  // inicial é passado para `PainelDocumentosHabeisPendentes` quando o
  // usuário abre a tela a partir de outro ponto (ex.: alerta do Hub) já
  // filtrada para uma situação específica.
  const [filtroInicialDocumentosHabeis, setFiltroInicialDocumentosHabeis] = useState<
    SituacaoDocumentoHabilPendente | undefined
  >(undefined);
  // Correção de regressão (2026-08-07) — de onde o usuário veio antes de
  // abrir Diagnóstico/Relatório/Dashboard/Documentos Hábeis Pendentes.
  // Sem isso, "Voltar"/"Fechar" dessas 4 telas sempre caía em "resultados"
  // mesmo quando o usuário tinha vindo do Modo Executivo — perdendo
  // filtro/período aplicados lá (que na verdade nunca eram perdidos, é
  // `diarias.filtros`, sempre preservado; o que se perdia era só a TELA de
  // retorno). `navegarPara` grava a visualização atual antes de trocar.
  const [origemNavegacao, setOrigemNavegacao] = useState<Visualizacao>("resultados");
  // Insight específico do Modo Executivo (ex.: "8 casos de possível
  // duplicidade") abre o Diagnóstico já filtrado para aquele caso — nunca
  // a lista inteira do recorte (correção de regressão, 2026-08-07).
  const [filtroInicialDiagnostico, setFiltroInicialDiagnostico] = useState<
    { titulo: string; rotulo: string } | null
  >(null);

  function navegarPara(destino: Visualizacao) {
    setOrigemNavegacao(visualizacao);
    setVisualizacao(destino);
  }

  // MS UX — Simplificação da Central Analítica (2026-08-10, item 4): a
  // barra de pesquisa rápida foi removida por completo — `useDiarias`
  // continua aceitando um `q` inicial genericamente, mas nada mais o
  // alimenta nesta tela (filtro `q` propriamente dito segue existindo no
  // backend/tipo, só não é mais alcançável por nenhum controle visível).
  const diarias = useDiarias("");
  // Sprint 19.6.2 — reaproveita os mesmos `diarias.filtros` já geridos por
  // `useDiarias` (nunca um segundo estado de filtro); busca independente
  // da tabela, com seus próprios carregando/erro internos.
  const indicadores = useIndicadores(diarias.filtros);
  // Correção de foco (2026-08-05) — chamado aqui (mesmo nível de
  // `useIndicadores`), nunca dentro de `PainelDocumentosHabeisPendentes`:
  // o resumo alimenta o badge do botão e o aviso de liberação atingida,
  // que precisam estar visíveis mesmo antes do usuário abrir a lista.
  const documentosHabeisPendentes = useDocumentosHabeisPendentes(diarias.filtros);

  function selecionarLinhaTabela(sei: string) {
    setOrigemDetalhamento("tabela");
    setSeiSelecionado(sei);
  }

  function selecionarRegistroDiagnostico(sei: string) {
    setOrigemDetalhamento("diagnostico");
    setSeiSelecionado(sei);
  }

  function selecionarRegistroDocumentosHabeisPendentes(sei: string) {
    setOrigemDetalhamento("documentos_habeis_pendentes");
    setSeiSelecionado(sei);
  }

  function abrirDocumentosHabeisPendentes(filtroInicial?: SituacaoDocumentoHabilPendente) {
    setFiltroInicialDocumentosHabeis(filtroInicial);
    navegarPara("documentos_habeis_pendentes");
  }

  function abrirDiagnostico(filtro?: { titulo: string; rotulo: string }) {
    setFiltroInicialDiagnostico(filtro ?? null);
    navegarPara("diagnostico");
  }

  // Recorte válido (`v2-arquitetura-funcional.md` § 5) — habilita as 3
  // ações só quando há, de fato, algo para gerar dashboard/relatório/
  // diagnóstico a partir dele. Sprint 19.6.2.1 — correção do achado da
  // Auditoria Técnica da 19.6.2 (item 16): os indicadores agora também
  // condicionam a habilitação — antes, os 3 botões podiam ficar
  // habilitados com os indicadores ainda carregando, com erro, ou (antes
  // da correção do hook) pertencendo ao recorte anterior.
  // `indicadores.indicadores !== null` já garante "pertence ao recorte
  // atual", porque `useIndicadores` agora limpa esse valor para `null`
  // assim que o recorte muda (nunca deixa o valor de um recorte anterior
  // passar por "válido").
  const recorteValido =
    backendOnline &&
    !diarias.carregando &&
    diarias.erro === null &&
    diarias.resultado !== null &&
    diarias.resultado.paginacao.total_itens > 0 &&
    !indicadores.carregando &&
    indicadores.erro === null &&
    indicadores.indicadores !== null;

  // MS1 rodada 4 (2026-08-09) — o tema Dark Executive passou a ser
  // aplicado pelo shell global (`App.tsx`), não mais aqui: o cabeçalho do
  // app (`Cabecalho.tsx`, fora deste componente) também precisa entrar no
  // tema, então a classe CSS sobe para o container mais alto que envolve
  // os dois. Este componente só *reporta* a mesma condição que já decidia
  // a classe antes — nenhum estado novo, nenhuma lógica muda; `App.tsx` é
  // quem decide o que fazer visualmente com essa informação. O `return` de
  // limpeza garante que, se este componente sair da árvore inteiramente
  // (ex.: usuário volta ao Hub a partir do Modo Executivo), o tema nunca
  // fica "preso" ativo no shell.
  useEffect(() => {
    aoMudarTemaExecutivo?.(visualizacao === "executivo");
    return () => aoMudarTemaExecutivo?.(false);
  }, [visualizacao, aoMudarTemaExecutivo]);

  // MS — Isolamento de filtros entre Modo Operacional e Dark Mode Executivo
  // (item 8 do pedido): dentro do Executivo, zoom de período nos gráficos
  // de evolução e "Comparar" (`useComparacaoExecutiva`) escrevem direto em
  // `diarias.filtros` — mesma instância compartilhada por decisão de
  // arquitetura (nenhum estado de filtro paralelo). Sem isolamento, esses
  // valores ficavam "presos" ao desligar o toggle, invisíveis na UI
  // simplificada do Operacional (só SEI/CPF/Período). Captura o filtro
  // operacional vigente ao ENTRAR no Dark Mode e o restaura por completo ao
  // SAIR por aqui (o único caminho de "desligar o toggle" — `visualizacao`
  // só entra em "executivo" por este botão). O drill-down explícito do
  // painel lateral executivo ("Aplicar filtro"/"Abrir relatório"/"Abrir
  // diagnóstico", `PainelLateralExecutivo`) usa sua própria navegação
  // (`aoVoltar`/`navegarPara`), nunca este toggle — o filtro que o usuário
  // escolhe explicitamente carregar para fora do Executivo continua
  // preservado, sem ser desfeito por esta restauração.
  const filtrosOperacionaisRef = useRef<ParametrosPesquisaDiariasQuery | null>(null);

  function alternarDarkModeExecutivo() {
    if (visualizacao === "executivo") {
      const snapshot = filtrosOperacionaisRef.current;
      // Só dispara `aplicarFiltro` (e a nova busca que isso implica) quando
      // algo de fato mudou durante o Executivo — nada de refazer a busca à
      // toa em toda saída, mesmo quando nenhuma mutação executivo-only
      // aconteceu (caso comum: usuário só olhou os gráficos e desligou).
      const houveMudanca = snapshot !== null && CAMPOS_DE_FILTRO.some((campo) => diarias.filtros[campo] !== snapshot[campo]);
      if (houveMudanca) {
        diarias.aplicarFiltro(
          Object.fromEntries(CAMPOS_DE_FILTRO.map((campo) => [campo, snapshot![campo]])) as Partial<
            Record<CampoDeFiltro, string | undefined>
          >,
        );
      }
      setVisualizacao("resultados");
    } else {
      filtrosOperacionaisRef.current = diarias.filtros;
      setVisualizacao("executivo");
    }
  }

  return (
    <div className="mx-auto max-w-6xl animate-entrada-conteudo px-6 py-12 md:px-10">
      <h2 className={TIPOGRAFIA.titulo}>Central Analítica</h2>

      {!backendOnline && (
        <div className="mt-4">
          <Alerta variante="aviso">{MENSAGENS.aguardandoAplicativo}</Alerta>
        </div>
      )}

      {/* MS UX — Simplificação da Central Analítica (2026-08-10, item 8):
          Dark Mode Executivo virou um TOGGLE único — "acesa" (`variante=
          "ativa"`) quando `visualizacao === "executivo"`, clicar de novo
          desliga e volta para "resultados". Substitui o par antigo de
          botões ("Dark Mode Executivo" aqui + "Voltar ao Modo Operacional"
          dentro de `CabecalhoExecutivo`). Continua sempre visível — é o
          único jeito de entrar OU sair do Dark Mode. */}
      <div className="mt-6 flex flex-wrap items-start justify-end gap-3">
        <Botao
          variante={visualizacao === "executivo" ? "ativa" : "secundaria"}
          aria-pressed={visualizacao === "executivo"}
          disabled={visualizacao !== "executivo" && !recorteValido}
          onClick={alternarDarkModeExecutivo}
        >
          Dark Mode Executivo
        </Botao>
      </div>

      {/* MS UX (item 10) — Dark Mode Executivo é só leitura/análise/
          apresentação: nenhuma ação administrativa (sincronização manual,
          Documentos Hábeis Pendentes, Gerar Dashboard/Relatório, filtros
          operacionais) aparece acima do canvas enquanto ele está ativo —
          tudo isso reaparece sozinho ao desligar o toggle, nenhuma lógica
          é removida, só a visibilidade. */}
      {visualizacao !== "executivo" && (
        <>
          <div className="mt-6">
            <IndicadorSincronizacao backendOnline={backendOnline} />
          </div>

          {/* Item 5 — a notificação de Documentos Hábeis Pendentes ocupa o
              espaço onde antes ficava a barra de pesquisa rápida
              (removida por completo, item 4). */}
          <div className="mt-6">
            <NotificacaoDocumentosHabeisPendentes
              resumo={documentosHabeisPendentes.documentosHabeisPendentes?.resumo ?? null}
              aoAbrir={() => abrirDocumentosHabeisPendentes()}
            />
          </div>

          <div className="mt-6">
            <PainelFiltrosPrincipal
              filtros={diarias.filtros}
              onMudarFiltro={diarias.aplicarFiltro}
              onRemoverFiltro={diarias.removerFiltro}
            />
          </div>

          <div className="mt-6">
            <ResumoRecorte
              carregando={diarias.carregando}
              resultado={diarias.resultado}
              indicadores={indicadores.indicadores}
              indicadoresCarregando={indicadores.carregando}
              indicadoresErro={indicadores.erro}
              aoTentarNovamenteIndicadores={indicadores.tentarNovamente}
            />
          </div>

          <div className="mt-6">
            <PainelAcoesRecorte
              habilitado={recorteValido}
              aoGerarDashboard={() => navegarPara("dashboard")}
              aoGerarRelatorio={() => navegarPara("relatorio")}
            />
          </div>
        </>
      )}

      {visualizacao === "resultados" && (
        <div className="mt-6 space-y-4">
          <TabelaDiarias
            carregando={diarias.carregando}
            erro={diarias.erro}
            resultado={diarias.resultado}
            filtros={diarias.filtros}
            onTentarNovamente={diarias.tentarNovamente}
            onOrdenarPor={diarias.ordenarPor}
            onIrParaPagina={diarias.irParaPagina}
            onSelecionarLinha={selecionarLinhaTabela}
          />
        </div>
      )}

      {visualizacao === "dashboard" && (
        <div className="mt-6">
          <DashboardRecorte
            filtros={diarias.filtros}
            indicadores={indicadores.indicadores}
            indicadoresCarregando={indicadores.carregando}
            indicadoresErro={indicadores.erro}
            aoTentarNovamenteIndicadores={indicadores.tentarNovamente}
            aoAplicarFiltro={diarias.aplicarFiltro}
            aoVoltar={() => setVisualizacao(origemNavegacao)}
          />
        </div>
      )}

      {visualizacao === "relatorio" && (
        <ModalRelatorio
          aberto
          filtros={diarias.filtros}
          totalRegistros={diarias.resultado?.paginacao.total_itens ?? 0}
          aoFechar={() => setVisualizacao(origemNavegacao)}
        />
      )}

      {visualizacao === "diagnostico" && (
        <div className="mt-6">
          <PainelDiagnostico
            filtros={diarias.filtros}
            aoVoltar={() => {
              setVisualizacao(origemNavegacao);
              setFiltroInicialDiagnostico(null);
            }}
            aoSelecionarRegistro={selecionarRegistroDiagnostico}
            filtroInicial={filtroInicialDiagnostico}
          />
        </div>
      )}

      {visualizacao === "documentos_habeis_pendentes" && (
        <div className="mt-6">
          <PainelDocumentosHabeisPendentes
            resultado={documentosHabeisPendentes.documentosHabeisPendentes}
            carregando={documentosHabeisPendentes.carregando}
            erro={documentosHabeisPendentes.erro}
            aoTentarNovamente={documentosHabeisPendentes.tentarNovamente}
            aoVoltar={() => {
              setVisualizacao(origemNavegacao);
              setFiltroInicialDocumentosHabeis(undefined);
            }}
            aoSelecionarRegistro={selecionarRegistroDocumentosHabeisPendentes}
            filtroInicial={filtroInicialDocumentosHabeis}
          />
        </div>
      )}

      {visualizacao === "executivo" && (
        <div className="mt-6">
          <ModoExecutivo
            filtros={diarias.filtros}
            indicadores={indicadores.indicadores}
            indicadoresCarregando={indicadores.carregando}
            indicadoresErro={indicadores.erro}
            aoTentarNovamenteIndicadores={indicadores.tentarNovamente}
            onMudarFiltro={diarias.aplicarFiltro}
            aoVoltar={() => setVisualizacao("resultados")}
            aoAbrirRelatorio={() => navegarPara("relatorio")}
            aoAbrirDiagnostico={abrirDiagnostico}
          />
        </div>
      )}

      {/* Sprint 19.8.5 — `PainelDetalhamentoDiaria` é compartilhado entre
          a tabela de resultados (§ 5) e o Diagnóstico (§ 8, "▸ Ver"),
          então fica fora dos branches de `visualizacao` acima — controlado
          só por `seiSelecionado`, disponível em qualquer uma das duas
          telas que o abrem. */}
      <PainelDetalhamentoDiaria
        sei={seiSelecionado}
        aoFechar={() => setSeiSelecionado(null)}
        aoVerHistoricoCpf={(cpf) => {
          diarias.aplicarFiltro({ cpf });
          setVisualizacao("resultados");
        }}
        emFoco={
          origemDetalhamento === "diagnostico" || origemDetalhamento === "documentos_habeis_pendentes"
            ? "diagnosticos"
            : undefined
        }
      />
    </div>
  );
}
