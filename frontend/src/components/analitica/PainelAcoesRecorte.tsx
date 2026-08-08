import { CORES_STATUS } from "../../theme/cores";
import { TIPOGRAFIA } from "../../theme/tipografia";
import type { ResumoDocumentosHabeisPendentesResposta } from "../../types/analitica";
import Botao from "../ui/Botao";

interface Props {
  habilitado: boolean;
  aoGerarDashboard: () => void;
  aoGerarRelatorio: () => void;
  /** Correção de foco (pedido explícito do usuário, 2026-08-05) — substitui
   * `aoExecutarDiagnostico`: o botão deixa de abrir o Diagnóstico geral
   * (catálogo de anomalias) e passa a abrir a tela exclusiva de Documentos
   * Hábeis Pendentes (`dh` vazio). O Diagnóstico geral continua existindo
   * — só não é mais alcançável a partir deste painel (segue disponível
   * pelo Modo Executivo, "Abrir diagnóstico"). */
  aoAbrirDocumentosHabeisPendentes: () => void;
  /** `null` enquanto carrega ou quando o recorte é inválido — o badge
   * de contagem só aparece com um resumo pronto, nunca um número
   * inventado/zerado por padrão. Já reflete o Recorte Analítico atual
   * (mesmos filtros de `useDiarias`, nunca uma contagem à parte). */
  resumoDocumentosHabeis: ResumoDocumentosHabeisPendentesResposta | null;
}

// Sprint 19.5.5 — os botões de ação sobre o recorte
// (`v2-arquitetura-funcional.md` § 5): habilitados só com um recorte
// válido (backend online, sem erro, resultado carregado, ao menos 1
// registro) — a condição em si é decidida por `CentralAnalitica.tsx`, que
// já tem todas as peças (`useDiarias`, `backendOnline`), nunca recalculada
// aqui. Desde a Sprint 19.8.5, os destinos têm conteúdo real (Dashboard/
// Relatório/...) — os botões trocam a área de conteúdo do componente pai,
// decidida inteiramente por quem monta este painel.
//
// Correção de foco (2026-08-05, pedido explícito do usuário) — "Análise
// Rápida (Diagnóstico)" (Sprint 20) é substituído por "Documentos Hábeis
// Pendentes": ampliado demais, virou diagnóstico geral de qualidade de
// dados quando o objetivo real do servidor é só acompanhar Documentos
// Hábeis pendentes. O novo botão ganha destaque visual próprio (cartão com
// borda e badges de contagem) — área prioritária de trabalho, não mais uma
// ação secundária igual às outras duas; reaproveita só tokens já existentes
// do Design System (`CORES_STATUS.info`/`aviso`, nunca uma cor nova) —
// RN-08: "aguardando liberação" é informativo (cyan), "revisão manual
// necessária" é atenção em âmbar, nunca vermelho para achado de negócio.
export default function PainelAcoesRecorte({
  habilitado,
  aoGerarDashboard,
  aoGerarRelatorio,
  aoAbrirDocumentosHabeisPendentes,
  resumoDocumentosHabeis,
}: Props) {
  const totalPendentes = resumoDocumentosHabeis
    ? resumoDocumentosHabeis.aguardando_liberacao + resumoDocumentosHabeis.revisao_manual_necessaria
    : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-card border border-cyan-500/25 bg-cyan-500/[0.04] p-5">
        <div>
          <p className={TIPOGRAFIA.subtitulo}>Documentos Hábeis Pendentes</p>
          <p className={`mt-1 ${TIPOGRAFIA.textoAuxiliar}`}>Acompanhe os processos deste recorte sem Documento Hábil.</p>
          {resumoDocumentosHabeis && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 ${TIPOGRAFIA.status} ${CORES_STATUS.info.badge}`}>
                Aguardando liberação: {resumoDocumentosHabeis.aguardando_liberacao}
              </span>
              <span className={`rounded-full px-2 py-0.5 ${TIPOGRAFIA.status} ${CORES_STATUS.aviso.badge}`}>
                Revisão manual necessária: {resumoDocumentosHabeis.revisao_manual_necessaria}
              </span>
            </div>
          )}
        </div>
        <Botao
          variante="secundaria"
          disabled={!habilitado}
          onClick={aoAbrirDocumentosHabeisPendentes}
          title="Processos com Documento Hábil pendente: aguardando liberação ou precisando de revisão manual"
        >
          Documentos Hábeis Pendentes{totalPendentes !== null ? ` (${totalPendentes})` : ""}
        </Botao>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-3">
          <Botao variante="primaria" disabled={!habilitado} onClick={aoGerarDashboard}>
            Gerar Dashboard
          </Botao>
          <Botao variante="secundaria" disabled={!habilitado} onClick={aoGerarRelatorio}>
            Gerar Relatório
          </Botao>
        </div>
        {!habilitado && <p className={TIPOGRAFIA.textoAuxiliar}>Ajuste os filtros para habilitar estas ações.</p>}
      </div>
    </div>
  );
}
