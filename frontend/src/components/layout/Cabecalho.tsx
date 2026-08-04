import { ArrowLeft, Settings } from "lucide-react";
import type { StatusBackend } from "../../hooks/useBackendStatus";
import { CORES_STATUS, type VarianteStatus } from "../../theme/cores";
import { GLOW_LOGO_NEON, GLOW_PERIGO } from "../../theme/estilos";
import { TIPOGRAFIA } from "../../theme/tipografia";
import Logo from "./Logo";

/** Sprint 09.2 — em que etapa do fluxo o app está, independente do backend
 * já estar de pé ou não. Deliberadamente só estas 4 (as únicas pedidas):
 * o pequeno intervalo entre "processamento concluído" e "planilha
 * selecionada" (revisão da pré-visualização) ainda lê como `pronto`, não
 * ganhou um 5º estado. Quem calcula isso a partir do estado real da tela é
 * `SelecionarProcessar` (`aoMudarEstado`) — este componente só sabe
 * exibir. */
export type EstadoApp = "pronto" | "processando" | "preenchendo" | "concluido";

interface Props {
  status: StatusBackend;
  estadoApp: EstadoApp;
  /** Sprint 14 — presente só nas telas de funcionalidade (Processamento,
   * Central de Conferência), nunca no Hub: é o caminho de volta na
   * hierarquia Boas-vindas → Hub → Funcionalidade (item "Navegação" da
   * Sprint). `SelecionarProcessar`/`Conferencia` continuam sem saber que
   * isso existe — o retorno é chrome do `Cabecalho`, não de cada página. */
  aoVoltarAoHub?: () => void;
  /** Sprint 15 — abre "Alterar Planilha Oficial" (§8/§11 do doc
   * arquitetural: "página" mínima de Configurações, sem tela dedicada
   * ainda). Sempre presente, em qualquer funcionalidade — o Cabecalho só
   * reporta o clique pra cima, quem decide o que fazer é `App.tsx`, mesmo
   * padrão já usado por `aoVoltarAoHub`. */
  aoAbrirConfiguracoes: () => void;
}

interface Descritor {
  rotulo: string;
  subtitulo: string;
  variante: VarianteStatus;
}

// Sprint 09.2 — o indicador deixa de expor "backend" (jargão técnico que o
// usuário final não precisa conhecer) e passa a contar em que etapa do
// fluxo o app está, em linguagem de produto. Só usado quando o backend
// ainda não está pronto — nesses dois casos `estadoApp` não importa (não há
// "processando"/"preenchendo" possível sem backend).
const DESCRITOR_BACKEND: Record<Exclude<StatusBackend, "conectado">, Descritor> = {
  verificando: { rotulo: "Iniciando sistema", subtitulo: "Só um instante...", variante: "aviso" },
  offline: { rotulo: "Sistema indisponível", subtitulo: "Tentando reconectar...", variante: "erro" },
};

// Com o backend pronto, o indicador passa a contar a etapa do fluxo —
// exatamente os 4 estados pedidos pela Sprint.
const DESCRITOR_ESTADO: Record<EstadoApp, Descritor> = {
  pronto: { rotulo: "Pronto para processar", subtitulo: "Aguardando arquivos PDF", variante: "sucesso" },
  processando: {
    rotulo: "Processando",
    subtitulo: "Extraindo informações dos processos...",
    variante: "info",
  },
  preenchendo: { rotulo: "Preenchendo planilha", subtitulo: "Registrando diárias...", variante: "info" },
  concluido: {
    rotulo: "Processamento concluído",
    subtitulo: "Pronto para um novo lote.",
    variante: "sucesso",
  },
};

// Sprint 09.2 — glow "extremamente discreto" pedido para este indicador:
// nenhum valor novo, reaproveita os mesmos tokens de 6 cores do Design
// System (`sucesso`→verde, `info`→ciano, `aviso`→âmbar — os 3 que já
// existem como token `shadow-glow-*`) mais a constante `GLOW_PERIGO`
// (mesma fórmula, sem token próprio) para `erro`, a mesma usada no botão de
// perigo/diálogo/painel de erro — nunca um brilho "inventado" só para este
// componente.
const GLOW_POR_VARIANTE: Record<Exclude<VarianteStatus, "erro" | "neutro" | "critico">, string> = {
  sucesso: "shadow-glow-green",
  info: "shadow-glow-cyan",
  aviso: "shadow-glow-amber",
};

function glowDaVariante(variante: VarianteStatus): string {
  // Sprint 19.8.4 — `critico` (Diagnóstico) nunca aparece neste indicador
  // de status de Processamento; tratado como `erro` só para nunca deixar
  // `GLOW_POR_VARIANTE` sem uma entrada — mesmo fallback visual do glow
  // de perigo, caso este componente algum dia precise renderizar essa
  // variante (hoje não precisa).
  return variante === "erro" || variante === "critico"
    ? GLOW_PERIGO
    : GLOW_POR_VARIANTE[variante as "sucesso" | "info" | "aviso"];
}

// Sprint 07 — cabeçalho da nova identidade visual: nenhuma referência
// institucional (MPPE/Coordenadoria/CMFC), só o nome do produto e a
// tagline. Logo + bloco de texto formam um único grupo flex centralizado —
// não é o texto centralizado na página com o logo solto ao lado, é o
// CONJUNTO que fica centralizado, com o texto alinhado à esquerda dentro do
// conjunto e `items-center` garantindo o alinhamento vertical entre logo e
// título.
//
// Sprint 09.1 — monograma maior (80px, era 64px), com glow atrás. Divisor
// inferior mais espesso/luminoso. Estrutura e conteúdo (monograma + título
// + tagline, nenhuma referência institucional) não mudam.
//
// Sprint 14 — o halo largo e difuso da Sprint 09.1 (`opacity-10` sobre um
// círculo grande) lia como névoa ao redor de um ícone nítido, não como
// "painel aceso" — trocado por `GLOW_LOGO_NEON` (`theme/estilos.ts`): um
// aro de 1px justo à silhueta do logo, seguido das mesmas duas camadas
// oficiais de glow (ciano + roxo), sem inventar um valor de sombra novo —
// só uma composição diferente dos mesmos tokens. Mesmo tratamento na tela
// de Boas-vindas (`pages/BoasVindas.tsx`), única outra tela com o logo em
// destaque.
export default function Cabecalho({ status, estadoApp, aoVoltarAoHub, aoAbrirConfiguracoes }: Props) {
  const descritor = status === "conectado" ? DESCRITOR_ESTADO[estadoApp] : DESCRITOR_BACKEND[status];
  const glow = glowDaVariante(descritor.variante);

  return (
    <header className="relative animate-entrada-conteudo px-6 pt-9 pb-7">
      <div className="absolute left-6 top-7 flex items-center gap-2">
        {aoVoltarAoHub && (
          <button
            type="button"
            onClick={aoVoltarAoHub}
            className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-2 text-xs font-semibold text-slate-300 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-slate-100"
          >
            <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" />
            Hub
          </button>
        )}
        <button
          type="button"
          onClick={aoAbrirConfiguracoes}
          aria-label="Configurações"
          title="Configurações"
          className="flex items-center justify-center rounded-full border border-white/10 bg-white/[0.04] p-2.5 text-slate-300 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-slate-100"
        >
          <Settings aria-hidden="true" className="h-3.5 w-3.5" />
        </button>
      </div>

      <div
        className={`absolute right-6 top-7 max-w-[230px] rounded-2xl border px-4 py-2.5 backdrop-blur-sm transition-shadow ${CORES_STATUS[descritor.variante].alerta} ${glow}`}
      >
        <div className="flex items-center gap-2">
          <span
            className={`h-1.5 w-1.5 shrink-0 rounded-full ${CORES_STATUS[descritor.variante].ponto}`}
          />
          <span className="text-xs font-semibold">{descritor.rotulo}</span>
        </div>
        <p className="mt-0.5 pl-3.5 text-[11px] leading-snug text-slate-400">{descritor.subtitulo}</p>
      </div>

      <div className="flex items-center justify-center gap-5">
        <span className="relative shrink-0">
          <span aria-hidden="true" className={`absolute -inset-1.5 -z-10 rounded-2xl ${GLOW_LOGO_NEON}`} />
          <Logo variante="cor" className="h-20 w-20" />
        </span>
        <div className="text-left leading-tight">
          <h1 className={TIPOGRAFIA.tituloApp}>Extrator de Diárias</h1>
          <p className={`mt-1.5 ${TIPOGRAFIA.subtituloApp}`}>Automação Inteligente de Processos</p>
        </div>
      </div>

      <div
        aria-hidden="true"
        className="mx-auto mt-7 h-px w-[60%] shadow-[0_0_10px_1px_rgb(37_99_235_/_0.4)]"
        style={{
          backgroundImage:
            "linear-gradient(to right, transparent 0%, #2563EB 18%, #06B6D4 50%, #8B5CF6 82%, transparent 100%)",
        }}
      />
    </header>
  );
}
