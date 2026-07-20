import { useRef, useState, type DragEvent, type ReactNode } from "react";
import { GLOW_PDFS, SUPERFICIE_BASE } from "../../theme/estilos";

interface Props {
  onArquivosSoltos: (arquivos: File[]) => void;
  desabilitado?: boolean;
  children: ReactNode;
}

/** Envolve a área de seleção (botão "Selecionar PDFs" + fila) para também
 * aceitar arrastar-e-soltar — as duas formas alimentam o mesmo callback, e
 * a deduplicação/filtro de PDF acontece no mesmo lugar de sempre (`fila.ts`
 * / `arquivos.ts`, chamados pelo componente pai), não duas vezes. Usa um
 * contador de entradas/saídas (em vez de só dragenter/dragleave) porque
 * esses eventos disparam de novo a cada elemento filho sobrevoado, o que
 * causaria o overlay de feedback piscando durante o arrasto. */
export default function ZonaArrastar({ onArquivosSoltos, desabilitado = false, children }: Props) {
  const [arrastando, setArrastando] = useState(false);
  const contador = useRef(0);

  function aoEntrar(evento: DragEvent<HTMLDivElement>) {
    evento.preventDefault();
    if (desabilitado) return;
    contador.current += 1;
    setArrastando(true);
  }

  function aoSair(evento: DragEvent<HTMLDivElement>) {
    evento.preventDefault();
    contador.current = Math.max(0, contador.current - 1);
    if (contador.current === 0) setArrastando(false);
  }

  function aoPassarPorCima(evento: DragEvent<HTMLDivElement>) {
    // O drop só é aceito pelo navegador se dragover tiver preventDefault.
    evento.preventDefault();
  }

  function aoSoltar(evento: DragEvent<HTMLDivElement>) {
    evento.preventDefault();
    contador.current = 0;
    setArrastando(false);
    if (desabilitado) return;

    const arquivos = Array.from(evento.dataTransfer.files);
    if (arquivos.length > 0) onArquivosSoltos(arquivos);
  }

  return (
    <div
      onDragEnter={aoEntrar}
      onDragOver={aoPassarPorCima}
      onDragLeave={aoSair}
      onDrop={aoSoltar}
      className={`relative transition ${SUPERFICIE_BASE} ${GLOW_PDFS} p-7`}
    >
      {children}

      {arrastando && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-card border-2 border-dashed border-cyan-400/60 bg-cyan-500/10 backdrop-blur-sm">
          <p
            className="rounded-lg px-4 py-2 text-sm font-medium text-white shadow-floating"
            style={{ backgroundImage: "var(--gradient-marca)" }}
          >
            Solte os PDFs aqui
          </p>
        </div>
      )}
    </div>
  );
}
