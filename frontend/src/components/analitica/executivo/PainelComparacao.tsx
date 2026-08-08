import { ChevronDown, ChevronUp, GitCompare } from "lucide-react";
import { useState } from "react";
import { FOCO_ANEL, SUPERFICIE_BASE } from "../../../theme/estilos";
import type { TipoComparacao } from "./useComparacaoExecutiva";

interface Props {
  onIniciar: (tipo: TipoComparacao) => void;
}

const OPCOES: { tipo: TipoComparacao; rotulo: string }[] = [
  { tipo: "mes_anterior", rotulo: "Mês atual × mês anterior" },
  { tipo: "ano_anterior", rotulo: "Ano atual × ano anterior" },
  { tipo: "membros_servidores", rotulo: "Membros × Servidores" },
];

/** Seletor de "Comparar" (`docs/central-analitica/modo-executivo-
 * arquitetura-funcional.md § 6`, componente 5; Sprint 21.6) — mesmo padrão
 * de popover/expandir já usado em `ConfiguracaoColunas.tsx` (botão +
 * `aria-expanded`/`aria-controls`, sem detecção de clique fora). Cada
 * opção já dispara `iniciar()` do hook (`useComparacaoExecutiva`) direto —
 * nenhum formulário/confirmação extra, mesmo critério de "aplica na hora"
 * já usado pelos filtros rápidos e pela configuração de colunas. */
export default function PainelComparacao({ onIniciar }: Props) {
  const [aberto, setAberto] = useState(false);

  function escolher(tipo: TipoComparacao) {
    onIniciar(tipo);
    setAberto(false);
  }

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setAberto((atual) => !atual)}
        aria-expanded={aberto}
        aria-controls="painel-comparacao-conteudo"
        className={`inline-flex items-center gap-1.5 rounded-lg border border-white/[0.12] bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-white/[0.06] ${FOCO_ANEL}`}
      >
        <GitCompare aria-hidden="true" className="h-3.5 w-3.5" />
        Comparar
        {aberto ? (
          <ChevronUp aria-hidden="true" className="h-3.5 w-3.5" />
        ) : (
          <ChevronDown aria-hidden="true" className="h-3.5 w-3.5" />
        )}
      </button>

      {aberto && (
        <div
          id="painel-comparacao-conteudo"
          role="menu"
          aria-label="Tipos de comparação"
          className={`absolute right-0 top-full z-20 mt-2 w-64 p-2 ${SUPERFICIE_BASE}`}
        >
          {OPCOES.map((opcao) => (
            <button
              key={opcao.tipo}
              type="button"
              role="menuitem"
              onClick={() => escolher(opcao.tipo)}
              className={`block w-full rounded-md px-3 py-2 text-left text-sm text-slate-200 transition hover:bg-white/10 ${FOCO_ANEL}`}
            >
              {opcao.rotulo}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
