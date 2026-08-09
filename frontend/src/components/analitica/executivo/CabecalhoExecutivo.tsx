import { ArrowLeftRight, Download, Presentation } from "lucide-react";
import ChipsFiltroAtivo from "../ChipsFiltroAtivo";
import FiltroCategoriaFuncional from "../FiltroCategoriaFuncional";
import IndicadorSincronizacao from "../IndicadorSincronizacao";
import PainelComparacao from "./PainelComparacao";
import type { EstadoUseComparacaoExecutiva } from "./useComparacaoExecutiva";
import Alerta from "../../ui/Alerta";
import Botao from "../../ui/Botao";
import type { EstadoGeracaoRelatorio } from "../../../hooks/useGerarRelatorio";
import { formatarDataBr, formatarPeriodoBr } from "../../../lib/datas";
import type { CampoDeFiltro } from "../../../hooks/useDiarias";
import { MENSAGENS } from "../../../lib/mensagens";
import { TIPOGRAFIA } from "../../../theme/tipografia";
import type { CategoriaFuncionalFiltro, ParametrosPesquisaDiariasQuery } from "../../../types/analitica";

interface EstadoExportacaoExecutiva {
  estado: EstadoGeracaoRelatorio;
  aoExportar: () => void;
  aoAbrirLocal: () => void;
  aoTentarNovamente: () => void;
  erroAoAbrirLocal: string | null;
}

interface Props {
  backendOnline: boolean;
  filtros: ParametrosPesquisaDiariasQuery;
  onMudarFiltro: (parcial: Partial<Record<CampoDeFiltro, string | undefined>>) => void;
  onRemoverFiltro: (campo: CampoDeFiltro) => void;
  onLimparTudo: () => void;
  aoVoltar: () => void;
  comparacao: EstadoUseComparacaoExecutiva;
  aoEntrarApresentacao: () => void;
  exportacao: EstadoExportacaoExecutiva;
}

/** Sprint 21.2 — período do recorte em texto simples, nunca editável aqui
 * (editar período continua exclusivo do Modo Operacional, `PainelFiltrosAvancados`
 * — o cabeçalho executivo só resume o recorte já aplicado, mesmo princípio
 * de "um único Recorte Analítico" que rege todo o Modo Executivo). */
function resumoPeriodo(filtros: ParametrosPesquisaDiariasQuery): string {
  const { periodo_inicial, periodo_final } = filtros;
  if (periodo_inicial && periodo_final) {
    return formatarPeriodoBr(periodo_inicial, periodo_final);
  }
  if (periodo_inicial) return `A partir de ${formatarDataBr(periodo_inicial)}`;
  if (periodo_final) return `Até ${formatarDataBr(periodo_final)}`;
  return "Todos os períodos";
}

/** Cabeçalho do Modo Executivo (`docs/central-analitica/modo-executivo-
 * arquitetura-funcional.md § 6`, componente 2) — reaproveita integralmente
 * `useDiarias.filtros`/`aplicarFiltro`/`removerFiltro`/`limparFiltros` (via
 * as props recebidas de `ModoExecutivo`, que por sua vez as recebe de
 * `CentralAnalitica.tsx`, mesma instância de sempre — nunca um segundo
 * estado de filtro), `FiltroCategoriaFuncional` (Sprint 20, sem nenhuma
 * segunda implementação do toggle) e `IndicadorSincronizacao` (mesmo
 * carimbo de sincronização do Modo Operacional, decisão 2 da arquitetura
 * funcional). "Exportar" chega numa micro-sprint futura (21.9) — este
 * cabeçalho só traz o que já está funcional nesta entrega.
 *
 * Sprint 21.6 — "Comparar" (`PainelComparacao`) fica ao lado do toggle de
 * categoria; quando uma comparação está ativa, uma barra resume A × B com
 * "Trocar A/B"/"Encerrar comparação" — nunca substitui o cabeçalho normal,
 * só se soma a ele.
 *
 * Sprint 21.8 — "Modo apresentação" (`aoEntrarApresentacao`, dono do
 * estado é `useModoApresentacao` em `ModoExecutivo.tsx`) fica ao lado de
 * "Voltar ao Modo Operacional" — mesma prioridade visual, os 2 botões de
 * saída/transição de tela deste cabeçalho.
 *
 * Sprint 21.9 — "Exportar" (`exportacao`, dono do estado é
 * `useGerarRelatorio` em `ModoExecutivo.tsx`, mesmo hook do
 * `DashboardRecorte`) fica junto dos outros botões de ação; o aviso de
 * sucesso/erro reaproveita o mesmo padrão visual do Dashboard operacional
 * (`Alerta` + "Abrir Local"/"Tentar novamente"), sem nenhum componente
 * novo. */
export default function CabecalhoExecutivo({
  backendOnline,
  filtros,
  onMudarFiltro,
  onRemoverFiltro,
  onLimparTudo,
  aoVoltar,
  comparacao,
  aoEntrarApresentacao,
  exportacao,
}: Props) {
  const avisoExportacao =
    exportacao.estado.fase === "sucesso" ? (
      <div className="flex flex-wrap items-center gap-3">
        <Alerta variante="sucesso">{MENSAGENS.relatorioSalvoComSucesso}</Alerta>
        <Botao variante="secundaria" onClick={exportacao.aoAbrirLocal}>
          Abrir Local
        </Botao>
        {exportacao.erroAoAbrirLocal && <Alerta variante="erro">{exportacao.erroAoAbrirLocal}</Alerta>}
      </div>
    ) : exportacao.estado.fase === "erro" ? (
      <div className="flex items-center justify-between gap-4">
        <Alerta variante="erro">{exportacao.estado.mensagem}</Alerta>
        <Botao variante="secundaria" onClick={exportacao.aoTentarNovamente}>
          Tentar novamente
        </Botao>
      </div>
    ) : null;

  return (
    <div className="cabecalho-executivo space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className={TIPOGRAFIA.titulo}>Modo Executivo</h2>
          <p className={TIPOGRAFIA.textoAuxiliar}>{resumoPeriodo(filtros)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Botao
            variante="secundaria"
            onClick={exportacao.aoExportar}
            carregando={exportacao.estado.fase === "gerando"}
          >
            <Download aria-hidden="true" className="h-4 w-4" />
            Exportar
          </Botao>
          <Botao variante="secundaria" onClick={aoEntrarApresentacao}>
            <Presentation aria-hidden="true" className="h-4 w-4" />
            Modo apresentação
          </Botao>
          <Botao variante="secundaria" onClick={aoVoltar}>
            ← Voltar ao Modo Operacional
          </Botao>
        </div>
      </div>

      {avisoExportacao}

      {/* BI 4.0 — "menos formulário administrativo": os controles de
          período/comparação/sincronização (secundários à leitura
          executiva) ganham um divisor sutil e espaçamento mais compacto
          que os separa visualmente do título/ações acima, em vez de
          empilhar com o mesmo peso — nenhum componente/callback muda,
          só a moldura ao redor deles. */}
      <div className="controles-executivos space-y-3 pt-4">
        <IndicadorSincronizacao backendOnline={backendOnline} />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <FiltroCategoriaFuncional
            valor={filtros.categoria_funcional as CategoriaFuncionalFiltro | undefined}
            onMudarFiltro={onMudarFiltro}
          />
          {!comparacao.ativa && <PainelComparacao onIniciar={comparacao.iniciar} />}
        </div>

        {comparacao.ativa && (
          <div className={`flex flex-wrap items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2.5 ${TIPOGRAFIA.texto}`}>
            <span>
              Comparando: <strong className={TIPOGRAFIA.textoForte}>{comparacao.rotuloPrimeiro}</strong>{" "}
              <span className={TIPOGRAFIA.textoAuxiliar}>vs.</span>{" "}
              <strong className={TIPOGRAFIA.textoForte}>{comparacao.rotuloSegundo}</strong>
            </span>
            <Botao variante="secundaria" onClick={comparacao.inverter}>
              <ArrowLeftRight aria-hidden="true" className="h-3.5 w-3.5" />
              Trocar A/B
            </Botao>
            <Botao variante="secundaria" onClick={comparacao.encerrar}>
              Encerrar comparação
            </Botao>
          </div>
        )}

        <ChipsFiltroAtivo filtros={filtros} onRemover={onRemoverFiltro} onLimparTudo={onLimparTudo} />
      </div>
    </div>
  );
}
