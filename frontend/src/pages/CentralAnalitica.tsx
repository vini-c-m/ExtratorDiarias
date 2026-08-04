import { useState } from "react";
import BarraPesquisaGlobal from "../components/analitica/BarraPesquisaGlobal";
import DashboardRecorte from "../components/analitica/DashboardRecorte";
import IndicadorSincronizacao from "../components/analitica/IndicadorSincronizacao";
import ModalRelatorio from "../components/analitica/ModalRelatorio";
import PainelAcoesRecorte from "../components/analitica/PainelAcoesRecorte";
import PainelDetalhamentoDiaria from "../components/analitica/PainelDetalhamentoDiaria";
import PainelDiagnostico from "../components/analitica/PainelDiagnostico";
import PainelFiltrosPrincipal from "../components/analitica/PainelFiltrosPrincipal";
import ResumoRecorte from "../components/analitica/ResumoRecorte";
import TabelaDiarias from "../components/analitica/TabelaDiarias";
import Alerta from "../components/ui/Alerta";
import { useDiarias } from "../hooks/useDiarias";
import { useIndicadores } from "../hooks/useIndicadores";
import { useOpcoesFiltro } from "../hooks/useOpcoesFiltro";
import { MENSAGENS } from "../lib/mensagens";
import { TIPOGRAFIA } from "../theme/tipografia";

interface Props {
  backendOnline: boolean;
}

type Visualizacao = "resultados" | "dashboard" | "relatorio" | "diagnostico";

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
export default function CentralAnalitica({ backendOnline }: Props) {
  const [termoBusca, setTermoBusca] = useState("");
  const [visualizacao, setVisualizacao] = useState<Visualizacao>("resultados");
  const [seiSelecionado, setSeiSelecionado] = useState<string | null>(null);
  // Sprint 19.8.5 — `PainelDetalhamentoDiaria` é compartilhado entre a
  // tabela de resultados e o Diagnóstico (mesmo painel, § 5/§ 8); esta
  // origem decide só se o foco inicial vai para o título (linha da
  // tabela, comportamento já homologado) ou para o bloco "Avisos e
  // diagnósticos" (`▸ Ver` do Diagnóstico, `emFoco="diagnosticos"`).
  const [origemDetalhamento, setOrigemDetalhamento] = useState<"tabela" | "diagnostico">("tabela");

  const diarias = useDiarias(termoBusca);
  const opcoesFiltro = useOpcoesFiltro(backendOnline);
  // Sprint 19.6.2 — reaproveita os mesmos `diarias.filtros` já geridos por
  // `useDiarias` (nunca um segundo estado de filtro); busca independente
  // da tabela, com seus próprios carregando/erro internos.
  const indicadores = useIndicadores(diarias.filtros);

  function pesquisarGlobalmente(termo: string) {
    setTermoBusca(termo);
    setVisualizacao("resultados");
  }

  function selecionarLinhaTabela(sei: string) {
    setOrigemDetalhamento("tabela");
    setSeiSelecionado(sei);
  }

  function selecionarRegistroDiagnostico(sei: string) {
    setOrigemDetalhamento("diagnostico");
    setSeiSelecionado(sei);
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

  return (
    <div className="mx-auto max-w-6xl animate-entrada-conteudo px-6 py-12 md:px-10">
      <h2 className={TIPOGRAFIA.titulo}>Central Analítica</h2>

      {!backendOnline && (
        <div className="mt-4">
          <Alerta variante="aviso">{MENSAGENS.aguardandoAplicativo}</Alerta>
        </div>
      )}

      <div className="mt-6">
        <IndicadorSincronizacao backendOnline={backendOnline} />
      </div>

      <div className="mt-6">
        <BarraPesquisaGlobal onPesquisar={pesquisarGlobalmente} desabilitado={!backendOnline} />
      </div>

      <div className="mt-6">
        <PainelFiltrosPrincipal
          filtros={diarias.filtros}
          opcoes={opcoesFiltro.opcoes}
          erroOpcoes={opcoesFiltro.erro}
          onTentarNovamenteOpcoes={opcoesFiltro.tentarNovamente}
          onMudarFiltro={diarias.aplicarFiltro}
          onRemoverFiltro={diarias.removerFiltro}
          onLimparTudo={diarias.limparFiltros}
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
          aoGerarDashboard={() => setVisualizacao("dashboard")}
          aoGerarRelatorio={() => setVisualizacao("relatorio")}
          aoExecutarDiagnostico={() => setVisualizacao("diagnostico")}
        />
      </div>

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
            aoVoltar={() => setVisualizacao("resultados")}
          />
        </div>
      )}

      {visualizacao === "relatorio" && (
        <ModalRelatorio
          aberto
          filtros={diarias.filtros}
          totalRegistros={diarias.resultado?.paginacao.total_itens ?? 0}
          aoFechar={() => setVisualizacao("resultados")}
        />
      )}

      {visualizacao === "diagnostico" && (
        <div className="mt-6">
          <PainelDiagnostico
            filtros={diarias.filtros}
            aoVoltar={() => setVisualizacao("resultados")}
            aoSelecionarRegistro={selecionarRegistroDiagnostico}
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
        emFoco={origemDetalhamento === "diagnostico" ? "diagnosticos" : undefined}
      />
    </div>
  );
}
