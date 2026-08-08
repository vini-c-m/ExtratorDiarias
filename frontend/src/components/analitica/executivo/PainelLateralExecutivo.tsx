import { FileBarChart, Filter, Stethoscope, X } from "lucide-react";
import { type KeyboardEvent, useEffect, useRef } from "react";
import Botao from "../../ui/Botao";
import { useDistribuicoes } from "../../../hooks/useDistribuicoes";
import { FOCO_ANEL, PAINEL_MODAL } from "../../../theme/estilos";
import { TIPOGRAFIA } from "../../../theme/tipografia";
import type { ParametrosPesquisaDiariasQuery } from "../../../types/analitica";
import type { PontoSelecionadoExecutivo } from "./tiposSelecao";

interface Props {
  selecao: PontoSelecionadoExecutivo;
  filtrosBase: ParametrosPesquisaDiariasQuery;
  aoFechar: () => void;
  aoAplicarFiltro: (parcial: PontoSelecionadoExecutivo["filtro"]) => void;
  aoVoltarAoOperacional: () => void;
  aoAbrirRelatorio: () => void;
  aoAbrirDiagnostico: () => void;
}

const FORMATADOR_MOEDA = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const FORMATADOR_INTEIRO = new Intl.NumberFormat("pt-BR");
const TOPO_RANKING = 5;

function formatarMoedaOuTraco(valor: number | null): string {
  return valor != null ? FORMATADOR_MOEDA.format(valor) : "—";
}

// `:not([disabled])` — mesma correção de `ModoApresentacao.tsx` (Sprint
// 21.10, achado real em Chromium: um botão desabilitado casa com o
// seletor CSS mas o navegador nunca o foca via Tab de verdade, então
// usá-lo como `primeiro`/`ultimo` do trap deixa o Tab nativo escapar do
// contêiner sem que o `preventDefault` do trap chegue a rodar). Nenhum
// botão deste painel é desabilitado hoje, mas o mesmo padrão é reaplicado
// aqui por consistência — a mesma função duplicada nunca deve divergir.
const SELETOR_FOCAVEL = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function Ranking({ titulo, pontos }: { titulo: string; pontos: { rotulo: string; contagem: number }[] }) {
  if (pontos.length === 0) {
    return (
      <div>
        <h3 className={TIPOGRAFIA.subtitulo}>{titulo}</h3>
        <p className={`mt-2 ${TIPOGRAFIA.textoAuxiliar}`}>Sem dados para este recorte.</p>
      </div>
    );
  }
  return (
    <div>
      <h3 className={TIPOGRAFIA.subtitulo}>{titulo}</h3>
      <ul className="mt-2 space-y-1.5">
        {pontos.slice(0, TOPO_RANKING).map((ponto) => (
          <li key={ponto.rotulo} className="flex items-center justify-between gap-3">
            <span className={`truncate ${TIPOGRAFIA.texto}`} title={ponto.rotulo}>
              {ponto.rotulo}
            </span>
            <span className={`shrink-0 ${TIPOGRAFIA.textoForte}`}>{FORMATADOR_INTEIRO.format(ponto.contagem)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Painel lateral contextual (`docs/central-analitica/modo-executivo-
 * arquitetura-funcional.md § 6`, componente 6; Sprint 21.4) — mesmo padrão
 * de painel deslizante já homologado em `PainelDetalhamentoDiaria.tsx`
 * (`role="dialog"`, Esc, clique no backdrop, foco no título ao abrir, foco
 * de volta a quem abriu ao fechar, focus trap simples de Tab), adaptado
 * para layout lateral do lado esquerdo aqui já é o padrão herdado.
 *
 * "Resumo" (quantidade/valor) nunca dispara chamada nova — são os mesmos
 * `contagem`/`valor` do próprio ponto já desenhado no gráfico
 * (`PontoSelecionadoExecutivo`). "Principais motivos"/"Principais pessoas"
 * são, cada um, uma distribuição já existente (`motivo`/`servidor`)
 * filtrada pelo ponto clicado, composta sobre o mesmo `filtrosBase` do
 * Recorte Analítico vigente — nunca um novo tipo de dado, só mais uma
 * chamada a `GET /distribuicoes` com filtro adicional. A seção cujo nome
 * coincide com a dimensão clicada (ex.: clicou em "Motivos" → não mostra
 * "Principais motivos" de novo, seria um único bucket a 100%) fica de
 * fora — comparação sempre calculada, nunca exibida quando redundante. */
export default function PainelLateralExecutivo({
  selecao,
  filtrosBase,
  aoFechar,
  aoAplicarFiltro,
  aoVoltarAoOperacional,
  aoAbrirRelatorio,
  aoAbrirDiagnostico,
}: Props) {
  const filtrosCompostos: ParametrosPesquisaDiariasQuery = { ...filtrosBase, ...selecao.filtro };
  // Regra dos Hooks: sempre chamados, nunca condicionados a `selecao.
  // dimensao` (que é fixa durante a vida deste componente, mas o lint não
  // sabe disso) — a seção correspondente só deixa de ser RENDERIZADA
  // quando redundante (ver `Ranking`s abaixo), a busca em si sempre roda.
  const distribuicaoMotivo = useDistribuicoes(filtrosCompostos, "motivo");
  const distribuicaoServidor = useDistribuicoes(filtrosCompostos, "servidor");

  const referenciaTitulo = useRef<HTMLHeadingElement>(null);
  const referenciaPainel = useRef<HTMLDivElement>(null);
  const referenciaElementoAnterior = useRef<HTMLElement | null>(null);

  useEffect(() => {
    referenciaElementoAnterior.current = document.activeElement as HTMLElement | null;
    referenciaTitulo.current?.focus();
    return () => {
      referenciaElementoAnterior.current?.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selecao.dimensao, selecao.rotulo]);

  useEffect(() => {
    function aoTeclar(evento: globalThis.KeyboardEvent) {
      if (evento.key === "Escape") aoFechar();
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [aoFechar]);

  function aoTeclarNoPainel(evento: KeyboardEvent<HTMLDivElement>) {
    if (evento.key !== "Tab") return;
    const focaveis = referenciaPainel.current?.querySelectorAll<HTMLElement>(SELETOR_FOCAVEL);
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

  function aplicarFiltro() {
    aoAplicarFiltro(selecao.filtro);
    aoFechar();
    aoVoltarAoOperacional();
  }

  function abrirRelatorio() {
    aoAplicarFiltro(selecao.filtro);
    aoFechar();
    aoAbrirRelatorio();
  }

  function abrirDiagnostico() {
    aoAplicarFiltro(selecao.filtro);
    aoFechar();
    aoAbrirDiagnostico();
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/60" onClick={aoFechar}>
      <div
        ref={referenciaPainel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="painel-lateral-executivo-titulo"
        onClick={(evento) => evento.stopPropagation()}
        onKeyDown={aoTeclarNoPainel}
        className={`h-full w-full max-w-md overflow-y-auto p-6 ${PAINEL_MODAL}`}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className={TIPOGRAFIA.legenda}>Detalhamento do recorte</div>
            <h2
              ref={referenciaTitulo}
              tabIndex={-1}
              id="painel-lateral-executivo-titulo"
              className={`mt-1 outline-none ${TIPOGRAFIA.titulo}`}
            >
              {selecao.rotulo}
            </h2>
          </div>
          <button
            type="button"
            aria-label="Fechar painel"
            onClick={aoFechar}
            className={`shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-slate-200 ${FOCO_ANEL}`}
          >
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 border-t border-white/10 pt-5">
          <div>
            <div className={TIPOGRAFIA.legenda}>Diárias</div>
            <div className={`mt-1 ${TIPOGRAFIA.textoForte}`}>{FORMATADOR_INTEIRO.format(selecao.contagem)}</div>
          </div>
          <div>
            <div className={TIPOGRAFIA.legenda}>Valor</div>
            <div className={`mt-1 ${TIPOGRAFIA.textoForte}`}>{formatarMoedaOuTraco(selecao.valor)}</div>
          </div>
        </div>

        <div className="mt-6 space-y-5 border-t border-white/10 pt-5">
          {selecao.dimensao !== "motivo" && (
            <Ranking
              titulo="Principais motivos"
              pontos={distribuicaoMotivo.distribuicao?.pontos ?? []}
            />
          )}
          {selecao.dimensao !== "servidor" && (
            <Ranking
              titulo="Principais pessoas"
              pontos={distribuicaoServidor.distribuicao?.pontos ?? []}
            />
          )}
        </div>

        <div className="mt-6 flex flex-col gap-2 border-t border-white/10 pt-5">
          <Botao variante="primaria" onClick={aplicarFiltro}>
            <Filter aria-hidden="true" className="h-4 w-4" />
            Aplicar filtro
          </Botao>
          <Botao variante="secundaria" onClick={abrirRelatorio}>
            <FileBarChart aria-hidden="true" className="h-4 w-4" />
            Abrir relatório
          </Botao>
          <Botao variante="secundaria" onClick={abrirDiagnostico}>
            <Stethoscope aria-hidden="true" className="h-4 w-4" />
            Abrir diagnóstico
          </Botao>
        </div>
      </div>
    </div>
  );
}
