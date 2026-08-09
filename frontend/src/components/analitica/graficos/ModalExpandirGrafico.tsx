import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";
import { FOCO_ANEL, PAINEL_MODAL } from "../../../theme/estilos";
import { TIPOGRAFIA } from "../../../theme/tipografia";

interface Props {
  titulo: string;
  onFechar: () => void;
  children: ReactNode;
  contextoVisual?: "padrao" | "executivo";
}

/** "Expandir gráfico" (refinamento visual do Modo Executivo, 2026-08-07;
 * revisado para "modo de análise" em 2026-08-07 — correção UX) — `children`
 * é o MESMO conteúdo já montado por `CartaoGrafico` (gráfico ou tabela,
 * conforme o modo local de quem chama), nunca uma segunda instância de
 * dado/gráfico. Mesmo padrão de diálogo já homologado em
 * `PainelLateralExecutivo`/`PainelDetalhamentoDiaria` (`role="dialog"`, Esc
 * fecha, clique no backdrop fecha, foco no título ao abrir, foco de volta a
 * quem abriu ao fechar) — sem o Tab-trap completo desses dois (economia: o
 * diálogo só tem poucos controles interativos próprios, risco de fuga de
 * foco é baixo).
 *
 * Correção UX (2026-08-07) — o modal deixou de ser "o mesmo card, um pouco
 * maior" (antes: `max-w-4xl`/`max-h-[85vh]` com um único scroll envolvendo
 * título+conteúdo, o que cortava/escondia controles abaixo do gráfico) e
 * virou um "modo de análise" de verdade: painel quase-tela-cheia
 * (`w-[94vw] h-[90vh]`, dentro da faixa 92–96vw/88–94vh pedida), com
 * cabeçalho FIXO (título+fechar, nunca rola) e um corpo `flex-1
 * overflow-y-auto` — o scroll interno vira só um fallback (conteúdo
 * excepcionalmente alto), nunca o caminho normal para achar um botão. O
 * gráfico em si (`GraficoBarras`/`GraficoEvolucaoComZoom`/`GraficoDonut`,
 * via a prop `expandido` que `CartaoGrafico` repassa ao `children`) ganha
 * dimensões maiores nesse modo — não é só a moldura que cresce.
 *
 * Portal para `document.body` (correção UX, 2026-08-07) — causa real
 * encontrada do "expandiu mas continua cortado": o cartão de origem
 * (`CartaoGrafico`) tem `backdrop-blur-sm` (`backdrop-filter`) na sua
 * própria div raiz — em Chromium/Electron, um ancestral com `filter` OU
 * `backdrop-filter` vira o *containing block* de qualquer descendente
 * `position: fixed`, então o modal (renderizado como filho direto daquele
 * cartão) ficava contido na caixa do cartão de origem em vez do viewport
 * real, por mais que a classe dissesse `fixed inset-0`. `createPortal`
 * para `document.body` tira o modal desse DOM, resolvendo na raiz — não é
 * só um `z-index`/`overflow` mal ajustado. */
export default function ModalExpandirGrafico({ titulo, onFechar, children, contextoVisual = "padrao" }: Props) {
  const referenciaTitulo = useRef<HTMLHeadingElement>(null);
  const referenciaElementoAnterior = useRef<HTMLElement | null>(null);

  useEffect(() => {
    referenciaElementoAnterior.current = document.activeElement as HTMLElement | null;
    referenciaTitulo.current?.focus();
    return () => {
      referenciaElementoAnterior.current?.focus();
    };
  }, []);

  useEffect(() => {
    function aoTeclar(evento: KeyboardEvent) {
      if (evento.key === "Escape") onFechar();
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [onFechar]);

  return createPortal(
    <div className={`fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4 ${contextoVisual === "executivo" ? "backdrop-grafico-executivo" : ""}`} onClick={onFechar}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-expandir-grafico-titulo"
        onClick={(evento) => evento.stopPropagation()}
        className={`flex h-[90vh] w-[94vw] flex-col overflow-hidden ${PAINEL_MODAL} ${contextoVisual === "executivo" ? "modal-grafico-executivo" : ""}`}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-white/10 p-6">
          <h2
            ref={referenciaTitulo}
            tabIndex={-1}
            id="modal-expandir-grafico-titulo"
            className={`outline-none ${TIPOGRAFIA.titulo}`}
          >
            {titulo}
          </h2>
          <button
            type="button"
            aria-label="Fechar"
            onClick={onFechar}
            className={`shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-slate-200 ${FOCO_ANEL}`}
          >
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>
        {/* `min-h-0` é o que permite este `flex-1` de fato encolher/rolar em
            vez de estourar a altura do pai (mesma pegadinha de flexbox já
            documentada em `GraficoBarras`, aqui no eixo vertical) — o
            fallback de scroll só entra em ação se o conteúdo realmente não
            couber nos ~90vh menos o cabeçalho. */}
        <div className="min-h-0 flex-1 overflow-y-auto p-6">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
