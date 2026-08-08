import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { type ComponentProps, type KeyboardEvent, useEffect, useRef } from "react";
import GradeGraficosExecutivos from "./GradeGraficosExecutivos";
import GradeKpisExecutivos from "./GradeKpisExecutivos";
import PainelInsights from "./PainelInsights";
import { FOCO_ANEL } from "../../../theme/estilos";
import { TIPOGRAFIA } from "../../../theme/tipografia";

interface Props {
  secaoAtual: number;
  totalSecoes: number;
  aoProximaSecao: () => void;
  aoSecaoAnterior: () => void;
  aoIrParaSecao: (indice: number) => void;
  aoSair: () => void;
  propsKpis: ComponentProps<typeof GradeKpisExecutivos>;
  propsGraficos: ComponentProps<typeof GradeGraficosExecutivos>;
  propsInsights: ComponentProps<typeof PainelInsights>;
}

const SECOES = ["Indicadores", "Gráficos", "Insights"] as const;

// Mesmo seletor/trap simples de `PainelLateralExecutivo` — duplicado aqui
// de propósito (mecânica de foco, não regra de negócio), mesmo critério
// já usado para `SecaoGrafico` no Dashboard operacional. `:not([disabled])`
// (achado real da auditoria em Chromium de verdade, Sprint 21.10 — nenhum
// teste em jsdom pega isto, porque jsdom não simula a navegação nativa por
// Tab): sem isto, "Próxima seção"/"Seção anterior" — desabilitados nas
// bordas (última/primeira seção) — ainda entravam na lista de focáveis
// como se fossem alcançáveis; quando um deles calhava de ser o
// `ultimo`/`primeiro` calculado, o Tab nativo do navegador simplesmente
// pulava o botão desabilitado (comportamento nativo, não interceptável
// por `preventDefault` num elemento que nunca chega a ganhar foco) e
// escapava direto para a tela por trás da apresentação.
const SELETOR_FOCAVEL = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Modo apresentação (Sprint 21.8) — tela cheia, sem filtros/menus/
 * cabeçalho executivo (só o conteúdo), navegação por seção. Cada "slide"
 * é a mesma grade já usada na tela normal do Modo Executivo
 * (`GradeKpisExecutivos`/`GradeGraficosExecutivos`/`PainelInsights`,
 * exatamente os mesmos componentes — nunca uma versão paralela/
 * simplificada) — nenhum cálculo novo, só reapresentação em tela cheia.
 * As ações interativas (clique-abre-painel, aplicar filtro, zoom,
 * insights) ficam desligadas aqui (`propsGraficos`/`propsInsights`
 * chegam com callbacks vazios de `ModoExecutivo.tsx`) — apresentação é
 * modo de exibição, "sem filtros e menus" (pedido original), nunca uma
 * segunda superfície de edição do recorte.
 *
 * Sprint 21.10 (auditoria de acessibilidade dedicada) — achado real: o
 * resto de `CentralAnalitica.tsx` continua montado por trás deste overlay
 * (só coberto visualmente por `fixed inset-0 z-50`), então sem foco/trap
 * próprios, Tab a partir de `<body>` (para onde o navegador manda o foco
 * quando o botão "Modo apresentação" que abriu isto é desmontado) alcançava
 * os campos de filtro da tela normal, ocultos atrás da apresentação em
 * tela cheia. Corrigido com o mesmo padrão já homologado em
 * `PainelLateralExecutivo`/`PainelDetalhamentoDiaria`: guarda quem tinha
 * foco antes, foca o próprio contêiner ao montar (não há um único título
 * aqui — a apresentação inteira é a "porta de entrada", por isso o alvo é
 * o contêiner, com `role="region"`, não um heading) e devolve o foco a
 * quem chamou ao desmontar; Tab nunca sai do contêiner enquanto ativo. */
export default function ModoApresentacao({
  secaoAtual,
  totalSecoes,
  aoProximaSecao,
  aoSecaoAnterior,
  aoIrParaSecao,
  aoSair,
  propsKpis,
  propsGraficos,
  propsInsights,
}: Props) {
  const referenciaContainer = useRef<HTMLDivElement>(null);
  const referenciaElementoAnterior = useRef<HTMLElement | null>(null);

  useEffect(() => {
    referenciaElementoAnterior.current = document.activeElement as HTMLElement | null;
    referenciaContainer.current?.focus();
    return () => {
      referenciaElementoAnterior.current?.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function aoTeclarNoContainer(evento: KeyboardEvent<HTMLDivElement>) {
    if (evento.key !== "Tab") return;
    const focaveis = referenciaContainer.current?.querySelectorAll<HTMLElement>(SELETOR_FOCAVEL);
    if (!focaveis || focaveis.length === 0) return;

    const primeiro = focaveis[0];
    const ultimo = focaveis[focaveis.length - 1];
    const focoDentroDoTrap = Array.from(focaveis).includes(document.activeElement as HTMLElement);

    if (evento.shiftKey) {
      if (!focoDentroDoTrap || document.activeElement === primeiro) {
        evento.preventDefault();
        ultimo.focus();
      }
    } else if (!focoDentroDoTrap || document.activeElement === ultimo) {
      evento.preventDefault();
      primeiro.focus();
    }
  }

  return (
    <div
      ref={referenciaContainer}
      tabIndex={-1}
      role="region"
      aria-label="Modo apresentação executiva"
      onKeyDown={aoTeclarNoContainer}
      className="fixed inset-0 z-50 overflow-y-auto bg-[#060818] p-8 outline-none"
    >
      <div className="mx-auto flex min-h-full max-w-6xl flex-col">
        <div className="flex items-center justify-between">
          <div role="tablist" aria-label="Seções da apresentação" className="flex items-center gap-2">
            {SECOES.map((nome, indice) => (
              <button
                key={nome}
                type="button"
                role="tab"
                aria-selected={indice === secaoAtual}
                aria-label={`Ir para a seção ${indice + 1} de ${totalSecoes}: ${nome}`}
                onClick={() => aoIrParaSecao(indice)}
                className={`h-2.5 w-2.5 rounded-full transition ${FOCO_ANEL} ${
                  indice === secaoAtual ? "bg-[image:var(--gradient-marca)]" : "bg-white/20 hover:bg-white/35"
                }`}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={aoSair}
            aria-label="Sair do modo apresentação"
            className={`inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-sm text-slate-300 hover:bg-white/10 ${FOCO_ANEL}`}
          >
            <X aria-hidden="true" className="h-4 w-4" />
            Sair
          </button>
        </div>

        <div role="tabpanel" aria-label={SECOES[secaoAtual]} className="mt-8 flex-1">
          {/* Seção "Insights" nunca duplica o título — `PainelInsights` já
              tem o seu próprio (§ 5.2). Só "Indicadores"/"Gráficos" (sem
              título interno próprio) ganham este título de seção. */}
          {secaoAtual !== 2 && <h2 className={`mb-6 ${TIPOGRAFIA.titulo}`}>{SECOES[secaoAtual]}</h2>}
          {secaoAtual === 0 && <GradeKpisExecutivos {...propsKpis} />}
          {secaoAtual === 1 && <GradeGraficosExecutivos {...propsGraficos} />}
          {secaoAtual === 2 &&
            (propsInsights.insights.length === 0 && !propsInsights.carregando && propsInsights.erro === null ? (
              <>
                <h2 className={`mb-6 ${TIPOGRAFIA.titulo}`}>Insights</h2>
                <p className={TIPOGRAFIA.textoAuxiliar}>Nenhum insight para este recorte.</p>
              </>
            ) : (
              <PainelInsights {...propsInsights} />
            ))}
        </div>

        <div className="mt-8 flex items-center justify-center gap-4">
          <button
            type="button"
            onClick={aoSecaoAnterior}
            disabled={secaoAtual === 0}
            aria-label="Seção anterior"
            className={`rounded-lg border border-white/15 bg-white/5 p-2 text-slate-300 hover:bg-white/10 disabled:pointer-events-none disabled:opacity-30 ${FOCO_ANEL}`}
          >
            <ChevronLeft aria-hidden="true" className="h-5 w-5" />
          </button>
          <span className={TIPOGRAFIA.textoAuxiliar}>
            {secaoAtual + 1} de {totalSecoes}
          </span>
          <button
            type="button"
            onClick={aoProximaSecao}
            disabled={secaoAtual === totalSecoes - 1}
            aria-label="Próxima seção"
            className={`rounded-lg border border-white/15 bg-white/5 p-2 text-slate-300 hover:bg-white/10 disabled:pointer-events-none disabled:opacity-30 ${FOCO_ANEL}`}
          >
            <ChevronRight aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
