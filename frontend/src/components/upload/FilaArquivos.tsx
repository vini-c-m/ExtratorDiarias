import { FileText, X } from "lucide-react";
import type { ItemFila } from "../../lib/fila";
import { MENSAGENS } from "../../lib/mensagens";
import { FOCO_ANEL, SCROLL_FINO } from "../../theme/estilos";
import Botao from "../ui/Botao";

interface Props {
  itens: ItemFila[];
  onRemover: (chave: string) => void;
  onLimpar: () => void;
  desabilitado?: boolean;
}

function textoContagem(quantidade: number): string {
  if (quantidade === 0) return MENSAGENS.nenhumPdfSelecionado;
  if (quantidade === 1) return "1 PDF selecionado";
  return `${quantidade} PDFs selecionados`;
}

export default function FilaArquivos({ itens, onRemover, onLimpar, desabilitado = false }: Props) {
  if (itens.length === 0) {
    return <p className="text-sm text-slate-500">{textoContagem(0)}</p>;
  }

  // Sprint 09 — sem `SUPERFICIE_BASE` própria: este componente agora vive
  // sempre dentro do card da `ZonaArrastar` (o "card de PDFs" da nova
  // identidade), então usa só uma superfície mais discreta (`shadow-sm`, o
  // degrau mais baixo da escala — Sprint 09.1), evitando um vidro dentro de
  // outro vidro.
  return (
    <div className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.02] shadow-sm">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
        <span className="text-sm font-medium text-slate-200">{textoContagem(itens.length)}</span>
        <Botao variante="link" onClick={onLimpar} disabled={desabilitado}>
          Limpar tudo
        </Botao>
      </div>

      <ul className={`max-h-48 divide-y divide-white/5 overflow-y-auto ${SCROLL_FINO}`}>
        {itens.map((item) => (
          <li key={item.chave} className="flex items-center justify-between gap-3 px-3 py-2">
            <span className="flex min-w-0 items-center gap-2 truncate text-sm text-slate-300">
              <FileText aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-500" />
              <span className="truncate" title={item.arquivo.name}>
                {item.arquivo.name}
              </span>
            </span>
            <button
              type="button"
              onClick={() => onRemover(item.chave)}
              disabled={desabilitado}
              aria-label={`Remover ${item.arquivo.name}`}
              className={`shrink-0 rounded p-1 text-slate-500 transition hover:bg-red-500/10 hover:text-red-400 disabled:cursor-not-allowed disabled:pointer-events-none disabled:opacity-40 ${FOCO_ANEL}`}
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
