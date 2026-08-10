import { AlertTriangle } from "lucide-react";
import type { ResumoDocumentosHabeisPendentesResposta } from "../../types/analitica";

interface Props {
  resumo: ResumoDocumentosHabeisPendentesResposta | null;
  aoAbrir: () => void;
}

/** MS UX — Simplificação da Central Analítica (2026-08-10, item 5 do
 * pedido): a notificação de Documentos Hábeis Pendentes deixa de ser um
 * cartão separado (`PainelAcoesRecorte`) + um banner próprio
 * (`CentralAnalitica`) e passa a ocupar, sozinha, o espaço onde antes
 * ficava a barra de pesquisa rápida (removida, item 4) — mesma contagem
 * (`aguardando_liberacao + revisao_manual_necessaria`), mesmo clique
 * (abre a tela de Documentos Hábeis Pendentes, sem filtro pré-aplicado),
 * agora como notificação em destaque única. `null`/total 0 não renderiza
 * nada — nunca um espaço vazio reservado. */
export default function NotificacaoDocumentosHabeisPendentes({ resumo, aoAbrir }: Props) {
  if (!resumo) return null;
  const total = resumo.aguardando_liberacao + resumo.revisao_manual_necessaria;
  if (total === 0) return null;

  return (
    <button
      type="button"
      onClick={aoAbrir}
      className="flex w-full items-center justify-between gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-left text-sm text-amber-200 transition hover:border-amber-500/45 hover:bg-amber-500/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
    >
      <span className="flex items-center gap-2.5 font-semibold">
        <AlertTriangle aria-hidden="true" className="h-4 w-4 shrink-0" />
        {total} {total === 1 ? "Documento Hábil Pendente" : "Documentos Hábeis Pendentes"}
      </span>
      <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-amber-300">Abrir</span>
    </button>
  );
}
