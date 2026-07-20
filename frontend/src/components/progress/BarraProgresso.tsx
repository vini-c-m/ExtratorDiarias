import { calcularPercentual, estimarTempoRestanteMs, formatarDuracao } from "../../lib/progresso";
import { GLOW_PROCESSAMENTO, SUPERFICIE_BASE } from "../../theme/estilos";

interface Props {
  concluidos: number;
  total: number;
  arquivoAtual: string;
  tempoDecorridoMs: number;
}

// Sprint 09.1 — painel do grupo "Processamento": a superfície "vidro"
// padrão carrega o glow neon roxo (`GLOW_PROCESSAMENTO`, token
// `--shadow-glow-purple`) sempre visível, com uma respiração muito sutil
// (`animate-glow-pulse`) por cima — é essa animação, não um valor de sombra
// maior, que diferencia a intensidade "intermediária, viva" deste painel do
// glow estático de PDFs/Estatísticas (mesmo token, mesma magnitude; ver a
// hierarquia de intensidade em `theme.css`). A barra em si continua o único
// lugar do app onde o gradiente oficial completo (azul → ciano → roxo)
// aparece como preenchimento sólido de um indicador, com um brilho
// translúcido percorrendo o preenchimento em loop
// (`animate-progresso-brilho`) — o glow do próprio painel já basta como luz
// externa, sem duplicar outro valor de sombra na barra. A porcentagem fica
// centralizada em destaque acima da barra, como elemento de maior
// hierarquia do bloco — a contagem de arquivos e os tempos ficam discretos,
// abaixo.
export default function BarraProgresso({
  concluidos,
  total,
  arquivoAtual,
  tempoDecorridoMs,
}: Props) {
  const percentual = calcularPercentual(concluidos, total);
  const restanteMs = estimarTempoRestanteMs(tempoDecorridoMs, concluidos, total);

  return (
    <div
      className={`${SUPERFICIE_BASE} ${GLOW_PROCESSAMENTO} animate-entrada-conteudo animate-glow-pulse p-7`}
    >
      <div className="text-center">
        <span className="text-4xl font-bold tabular-nums tracking-tight text-slate-50">
          {percentual}%
        </span>
      </div>

      <div
        role="progressbar"
        aria-valuenow={percentual}
        aria-valuemin={0}
        aria-valuemax={100}
        className="mt-4 h-3 w-full overflow-hidden rounded-full bg-white/10 shadow-[inset_0_1px_2px_0_rgb(0_0_0_/_0.3)]"
      >
        <div
          className="relative h-full overflow-hidden rounded-full transition-all duration-300 ease-out"
          style={{ width: `${percentual}%`, backgroundImage: "var(--gradient-marca)" }}
        >
          <span
            aria-hidden="true"
            className="absolute inset-y-0 left-0 w-1/4 animate-progresso-brilho bg-gradient-to-r from-transparent via-white/40 to-transparent"
          />
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between text-sm">
        <span className="font-medium text-slate-300">
          {concluidos} de {total} PDFs
        </span>
      </div>

      {arquivoAtual && (
        <p className="mt-1 truncate text-xs text-slate-500" title={arquivoAtual}>
          Processando: {arquivoAtual}
        </p>
      )}

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
        <span>Tempo decorrido: {formatarDuracao(tempoDecorridoMs)}</span>
        {restanteMs !== null && (
          <span>Tempo restante estimado: {formatarDuracao(restanteMs)}</span>
        )}
      </div>
    </div>
  );
}
