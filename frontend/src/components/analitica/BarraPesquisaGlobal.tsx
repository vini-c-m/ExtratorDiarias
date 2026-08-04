import { Search } from "lucide-react";
import { type FormEvent, useState } from "react";
import { FOCO_ANEL, SUPERFICIE_BASE } from "../../theme/estilos";

interface Props {
  onPesquisar: (termo: string) => void;
  desabilitado?: boolean;
}

// Campo único de busca global, fixo no topo da Central Analítica. Ao
// submeter, popula o filtro `q` de `useDiarias` e volta para a
// visualização de resultados — decisão de `CentralAnalitica.tsx`
// (`onPesquisar`); este componente só sabe do próprio texto digitado. `q`
// viaja como está para `GET /diarias?q=...` — nenhuma decisão de
// CPF/SEI/nome é tomada aqui, o backend já decide pelo formato.
export default function BarraPesquisaGlobal({ onPesquisar, desabilitado = false }: Props) {
  const [termo, setTermo] = useState("");

  function aoSubmeter(evento: FormEvent) {
    evento.preventDefault();
    const termoLimpo = termo.trim();
    if (!termoLimpo) return;
    onPesquisar(termoLimpo);
  }

  return (
    <form onSubmit={aoSubmeter} role="search" className={`flex items-center gap-3 px-4 py-3 ${SUPERFICIE_BASE}`}>
      <Search aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-500" />
      <input
        type="search"
        value={termo}
        disabled={desabilitado}
        onChange={(evento) => setTermo(evento.target.value)}
        placeholder="Pesquisar por SEI, CPF, servidor ou município..."
        aria-label="Pesquisar por SEI, CPF, servidor ou município"
        className={`w-full bg-transparent text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none disabled:cursor-not-allowed disabled:opacity-40 ${FOCO_ANEL}`}
      />
    </form>
  );
}
