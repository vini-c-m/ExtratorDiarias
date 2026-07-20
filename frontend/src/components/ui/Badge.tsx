import type { ReactNode } from "react";
import { CORES_STATUS, DESTAQUE_INSERCAO_MANUAL, type VarianteStatus } from "../../theme/cores";
import { TIPOGRAFIA } from "../../theme/tipografia";

interface Props {
  variante: VarianteStatus;
  children: ReactNode;
  /** Destaque máximo (vermelho, negrito, caixa alta) — reservado ao estado
   * "necessita inserção manual", conforme Sprint 05.2. Nunca combinar com
   * variante diferente de "erro". */
  destaque?: boolean;
}

// Sprint 05.2 — pílula de status única para o app inteiro. Antes desta
// Sprint, `TabelaResultado` e `TabelaPreVisualizacao` cada uma tinha seu
// próprio badge "no olho" (uma via mapa, outra com classe fixa inline) — a
// partir de agora as duas (e o indicador de conexão do cabeçalho) usam este
// componente, sempre lendo a cor de `theme/cores.ts`.
export default function Badge({ variante, children, destaque = false }: Props) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 ${TIPOGRAFIA.status} ${
        CORES_STATUS[variante].badge
      } ${destaque ? DESTAQUE_INSERCAO_MANUAL : ""}`}
    >
      {children}
    </span>
  );
}
