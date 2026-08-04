import Botao from "../ui/Botao";
import { TIPOGRAFIA } from "../../theme/tipografia";

interface Props {
  habilitado: boolean;
  aoGerarDashboard: () => void;
  aoGerarRelatorio: () => void;
  aoExecutarDiagnostico: () => void;
}

// Sprint 19.5.5 — os 3 botões de ação sobre o recorte
// (`v2-arquitetura-funcional.md` § 5): habilitados só com um recorte
// válido (backend online, sem erro, resultado carregado, ao menos 1
// registro) — a condição em si é decidida por `CentralAnalitica.tsx`, que
// já tem todas as peças (`useDiarias`, `backendOnline`), nunca recalculada
// aqui. Desde a Sprint 19.8.5, os 3 destinos têm conteúdo real
// (Dashboard/Relatório/Diagnóstico) — os botões trocam a área de conteúdo
// do componente pai, decidida inteiramente por quem monta este painel.
export default function PainelAcoesRecorte({
  habilitado,
  aoGerarDashboard,
  aoGerarRelatorio,
  aoExecutarDiagnostico,
}: Props) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-3">
        <Botao variante="primaria" disabled={!habilitado} onClick={aoGerarDashboard}>
          Gerar Dashboard
        </Botao>
        <Botao variante="secundaria" disabled={!habilitado} onClick={aoGerarRelatorio}>
          Gerar Relatório
        </Botao>
        <Botao variante="secundaria" disabled={!habilitado} onClick={aoExecutarDiagnostico}>
          Análise Rápida
        </Botao>
      </div>
      {!habilitado && <p className={TIPOGRAFIA.textoAuxiliar}>Ajuste os filtros para habilitar estas ações.</p>}
    </div>
  );
}
