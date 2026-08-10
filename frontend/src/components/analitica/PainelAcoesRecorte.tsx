import { TIPOGRAFIA } from "../../theme/tipografia";
import Botao from "../ui/Botao";

interface Props {
  habilitado: boolean;
  aoGerarDashboard: () => void;
  aoGerarRelatorio: () => void;
}

// Sprint 19.5.5 — os botões de ação sobre o recorte
// (`v2-arquitetura-funcional.md` § 5): habilitados só com um recorte
// válido (backend online, sem erro, resultado carregado, ao menos 1
// registro) — a condição em si é decidida por `CentralAnalitica.tsx`, que
// já tem todas as peças (`useDiarias`, `backendOnline`), nunca recalculada
// aqui.
//
// MS UX — Simplificação da Central Analítica (2026-08-10, item 5): o
// cartão de Documentos Hábeis Pendentes saiu daqui — virou a notificação
// única em destaque (`NotificacaoDocumentosHabeisPendentes`), no lugar da
// antiga barra de pesquisa rápida. Este painel volta a ser só as 2 ações
// de geração (Dashboard/Relatório), como era antes da Sprint 19.5.5 dar
// destaque especial aos Documentos Hábeis.
export default function PainelAcoesRecorte({ habilitado, aoGerarDashboard, aoGerarRelatorio }: Props) {
  return (
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
  );
}
