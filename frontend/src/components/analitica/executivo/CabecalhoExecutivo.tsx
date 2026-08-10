import { ArrowLeftRight, Download, Presentation } from "lucide-react";
import PainelComparacao from "./PainelComparacao";
import type { EstadoUseComparacaoExecutiva } from "./useComparacaoExecutiva";
import Alerta from "../../ui/Alerta";
import Botao from "../../ui/Botao";
import type { EstadoGeracaoRelatorio } from "../../../hooks/useGerarRelatorio";
import { formatarDataBr, formatarPeriodoBr } from "../../../lib/datas";
import { MENSAGENS } from "../../../lib/mensagens";
import { TIPOGRAFIA } from "../../../theme/tipografia";
import type { ParametrosPesquisaDiariasQuery } from "../../../types/analitica";

interface EstadoExportacaoExecutiva {
  estado: EstadoGeracaoRelatorio;
  aoExportar: () => void;
  aoAbrirLocal: () => void;
  aoTentarNovamente: () => void;
  erroAoAbrirLocal: string | null;
}

interface Props {
  filtros: ParametrosPesquisaDiariasQuery;
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
 * arquitetura-funcional.md § 6`, componente 2) — reaproveita
 * `useDiarias.filtros` (via as props recebidas de `ModoExecutivo`, que por
 * sua vez as recebe de `CentralAnalitica.tsx`, mesma instância de sempre)
 * só para o resumo textual de período; nunca editável aqui.
 *
 * MS UX — Simplificação da Central Analítica (2026-08-10, itens 6/8/10 do
 * pedido): `IndicadorSincronizacao` (sincronização manual),
 * `FiltroCategoriaFuncional` (um dos filtros removidos da interface) e
 * `ChipsFiltroAtivo` saíram daqui — Dark Mode Executivo é "só leitura/
 * análise/apresentação", sem ações administrativas. O botão "Voltar ao
 * Modo Operacional" também saiu: Dark Mode Executivo virou um TOGGLE único
 * (`CentralAnalitica.tsx`), nunca mais um par de botões separados —
 * sair/entrar é o mesmo clique.
 *
 * Sprint 21.6 — "Comparar" (`PainelComparacao`); quando uma comparação
 * está ativa, uma barra resume A × B com "Trocar A/B"/"Encerrar
 * comparação" — nunca substitui o cabeçalho normal, só se soma a ele.
 *
 * Sprint 21.9 — "Exportar" (`exportacao`, dono do estado é
 * `useGerarRelatorio` em `ModoExecutivo.tsx`, mesmo hook do
 * `DashboardRecorte`) fica junto de "Modo apresentação"; o aviso de
 * sucesso/erro reaproveita o mesmo padrão visual do Dashboard operacional
 * (`Alerta` + "Abrir Local"/"Tentar novamente"), sem nenhum componente
 * novo. */
export default function CabecalhoExecutivo({ filtros, comparacao, aoEntrarApresentacao, exportacao }: Props) {
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
        </div>
      </div>

      {avisoExportacao}

      <div className="controles-executivos space-y-3 pt-4">
        {!comparacao.ativa && <PainelComparacao onIniciar={comparacao.iniciar} />}

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
      </div>
    </div>
  );
}
