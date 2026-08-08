import { DESABILITADO, FOCO_ANEL, PRESSIONAR } from "../../theme/estilos";
import type { CampoDeFiltro } from "../../hooks/useDiarias";
import type { CategoriaFuncionalFiltro } from "../../types/analitica";

interface Props {
  valor: CategoriaFuncionalFiltro | undefined;
  onMudarFiltro: (parcial: Partial<Record<CampoDeFiltro, string | undefined>>) => void;
}

interface Opcao {
  rotulo: string;
  valor: CategoriaFuncionalFiltro | undefined;
}

// Sprint 20 (2026-08-05) — "Todos" é a ausência do filtro (`undefined`),
// mesma convenção de todo o resto do Recorte Analítico (backend/README:
// filtro opcional ausente = sem restrição). Só 2 valores selecionáveis
// além de "Todos" — `NAO_IDENTIFICADO` nunca aparece aqui (não é uma
// categoria que o usuário escolhe ver, é a falta de dado, decisão do
// catálogo em `app/domain/analitica/categoria_funcional.py`).
const OPCOES: Opcao[] = [
  { rotulo: "Todos", valor: undefined },
  { rotulo: "Membros", valor: "MEMBRO" },
  { rotulo: "Servidores", valor: "SERVIDOR" },
];

/** Filtro primário "Todos | Membros | Servidores" (`v2-arquitetura-
 * funcional.md`, Sprint 20) — separado de `PainelFiltrosAvancados`
 * (filtros secundários) por ser, junto de `FiltrosRapidos`, o primeiro
 * controle que o usuário vê: reaproveita o mesmo `onMudarFiltro` já
 * usado por todo o resto do Recorte Analítico (`useDiarias.aplicarFiltro`),
 * nenhum estado paralelo. */
export default function FiltroCategoriaFuncional({ valor, onMudarFiltro }: Props) {
  return (
    <div
      role="radiogroup"
      aria-label="Filtrar por categoria funcional"
      className="inline-flex gap-1 rounded-lg border border-white/15 bg-white/5 p-1"
    >
      {OPCOES.map((opcao) => {
        const selecionado = opcao.valor === valor;
        return (
          <button
            key={opcao.rotulo}
            type="button"
            role="radio"
            aria-checked={selecionado}
            onClick={() => onMudarFiltro({ categoria_funcional: opcao.valor })}
            className={`rounded-md px-4 py-2 text-sm font-semibold transition ${PRESSIONAR} ${DESABILITADO} ${FOCO_ANEL} ${
              selecionado
                ? "bg-[image:var(--gradient-marca)] text-white"
                : "text-slate-300 hover:bg-white/10"
            }`}
          >
            {opcao.rotulo}
          </button>
        );
      })}
    </div>
  );
}
