import { useState } from "react";
import type { KeyboardEvent, MouseEvent as ReactMouseEvent } from "react";
import GraficoBarras from "../graficos/GraficoBarras";
import TooltipGrafico from "../graficos/TooltipGrafico";
import Botao from "../../ui/Botao";
import { FOCO_ANEL } from "../../../theme/estilos";
import { TIPOGRAFIA } from "../../../theme/tipografia";

export interface PontoEvolucao {
  /** `YYYY-MM`, a mesma chave bruta de `distribuicoes.py` — nunca o rótulo
   * já formatado ("jun/2026"), para o intervalo aplicado como filtro usar
   * a mesma conversão de mês (`intervaloDoMes`) já usada no clique simples
   * (Sprint 21.3/21.4), sem uma segunda forma de calcular o mês. */
  chave: string;
  rotulo: string;
  valor: number;
}

interface Props {
  pontos: PontoEvolucao[];
  cor: string;
  formatarValor: (valor: number) => string;
  /** Sprint 21.7 (Zoom temporal) — só os 2 limites já resolvidos
   * (`chaveInicio`/`chaveFim`, sempre em ordem cronológica, mesmo se o
   * arraste for da direita para a esquerda); a conversão para
   * `periodo_inicial`/`periodo_final` (limites do mês) é responsabilidade
   * de quem chama, reaproveitando `intervaloDoMes` já existente — nunca
   * duplicada aqui. */
  aoAplicarIntervalo: (chaveInicio: string, chaveFim: string) => void;
  /** Repassado a `GraficoBarras` — ver ali (refinamento visual do Modo
   * Executivo, 2026-08-07; "expandido" — correção UX, 2026-08-07). Não
   * afeta os offsets `top-[18px]`/`bottom-[18px]` da camada de zoom
   * abaixo, calibrados às linhas fixas de valor/rótulo, não à altura da
   * barra — continuam corretos nos três tamanhos. */
  alturaBarra?: "padrao" | "grande" | "expandido";
}

/** Zoom temporal por seleção (`docs/central-analitica/modo-executivo-
 * wireframes.md § 4`; Sprint 21.7) — envolve `GraficoBarras` (Dashboard
 * operacional, intocado) com uma camada de zonas invisíveis por cima,
 * uma por barra, sem passar `aoClicarPonto` a ele (as barras do gráfico
 * em si ficam `<div>`s inertes; toda a interação vive nesta camada
 * própria do Executivo). Mouse: `pointerdown` marca o início do arraste,
 * `pointerenter` (com o botão pressionado) estende a seleção em tempo
 * real, `pointerup` finaliza — um clique simples (sem mover o ponteiro)
 * vira uma seleção de 1 único mês, mesmo resultado de "clicar" no sentido
 * antigo. Teclado: cada zona é um `<button>` real, alcançável por Tab;
 * Enter/Espaço marca o primeiro extremo, Enter/Espaço numa segunda zona
 * marca o segundo — nenhuma reimplementação de seta/Home/End, só a ordem
 * nativa de tabulação, sempre operável sem mouse. */
export default function GraficoEvolucaoComZoom({
  pontos,
  cor,
  formatarValor,
  aoAplicarIntervalo,
  alturaBarra = "padrao",
}: Props) {
  const [inicio, setInicio] = useState<number | null>(null);
  const [fim, setFim] = useState<number | null>(null);
  const [arrastandoComMouse, setArrastandoComMouse] = useState(false);
  const [primeiroExtremoTeclado, setPrimeiroExtremoTeclado] = useState<number | null>(null);
  // Tooltip rico (refinamento visual, 2026-08-07) — substitui o `title`
  // nativo. Hover/foco na própria zona de zoom (as barras abaixo nunca
  // recebem o ponteiro — a zona já cobre a mesma área, ver docstring da
  // camada de zoom acima) — nenhum dado novo, só apresentação.
  const [indiceEmHover, setIndiceEmHover] = useState<number | null>(null);

  const temSelecao = inicio !== null && fim !== null;
  const indiceMenor = temSelecao ? Math.min(inicio as number, fim as number) : null;
  const indiceMaior = temSelecao ? Math.max(inicio as number, fim as number) : null;

  function iniciarArrasteMouse(indice: number) {
    setArrastandoComMouse(true);
    setInicio(indice);
    setFim(indice);
  }

  function estenderArrasteMouse(indice: number) {
    if (!arrastandoComMouse) return;
    setFim(indice);
  }

  function finalizarArrasteMouse() {
    setArrastandoComMouse(false);
  }

  function aoTeclarZona(indice: number, evento: KeyboardEvent<HTMLButtonElement>) {
    if (evento.key !== "Enter" && evento.key !== " ") return;
    evento.preventDefault();
    if (primeiroExtremoTeclado === null) {
      setPrimeiroExtremoTeclado(indice);
      setInicio(indice);
      setFim(indice);
    } else {
      setFim(indice);
      setPrimeiroExtremoTeclado(null);
    }
  }

  function limparSelecao() {
    setInicio(null);
    setFim(null);
    setPrimeiroExtremoTeclado(null);
  }

  function aplicar() {
    if (indiceMenor === null || indiceMaior === null) return;
    aoAplicarIntervalo(pontos[indiceMenor].chave, pontos[indiceMaior].chave);
    limparSelecao();
  }

  // Clique direito/arrastar não deveria abrir o menu de contexto do
  // navegador dentro da área de seleção — mesmo critério de qualquer
  // superfície de arraste customizada.
  function aoClicarComBotaoDireito(evento: ReactMouseEvent) {
    evento.preventDefault();
  }

  return (
    <div>
      <div className="relative" onContextMenu={aoClicarComBotaoDireito}>
        <GraficoBarras
          orientacao="vertical"
          cor={cor}
          formatarValor={formatarValor}
          pontos={pontos}
          alturaBarra={alturaBarra}
        />
        <div
          className="absolute inset-x-0 bottom-[18px] top-[18px] flex items-stretch gap-1.5"
          onPointerUp={finalizarArrasteMouse}
          onPointerLeave={finalizarArrasteMouse}
        >
          {pontos.map((ponto, indice) => {
            const selecionado =
              indiceMenor !== null && indiceMaior !== null && indice >= indiceMenor && indice <= indiceMaior;
            return (
              <button
                key={ponto.chave}
                type="button"
                aria-pressed={selecionado}
                aria-label={`${ponto.rotulo}: ${formatarValor(ponto.valor)} — selecionar para o intervalo de zoom`}
                onPointerDown={() => iniciarArrasteMouse(indice)}
                onPointerEnter={() => {
                  estenderArrasteMouse(indice);
                  setIndiceEmHover(indice);
                }}
                onPointerLeave={() => setIndiceEmHover((atual) => (atual === indice ? null : atual))}
                onFocus={() => setIndiceEmHover(indice)}
                onBlur={() => setIndiceEmHover((atual) => (atual === indice ? null : atual))}
                onKeyDown={(evento) => aoTeclarZona(indice, evento)}
                className={`relative min-w-0 flex-1 rounded ${FOCO_ANEL} ${selecionado ? "bg-white/15" : "hover:bg-white/5"}`}
              >
                <TooltipGrafico
                  visivel={indiceEmHover === indice}
                  alinhamento={
                    indice < pontos.length * 0.2 ? "esquerda" : indice > pontos.length * 0.8 ? "direita" : "centro"
                  }
                >
                  <div className="font-semibold text-slate-100">{ponto.rotulo}</div>
                  <div className="text-slate-300">{formatarValor(ponto.valor)}</div>
                </TooltipGrafico>
              </button>
            );
          })}
        </div>
      </div>

      {temSelecao && indiceMenor !== null && indiceMaior !== null && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
          <span className={TIPOGRAFIA.textoAuxiliar}>
            Selecionado: {pontos[indiceMenor].rotulo}
            {indiceMaior !== indiceMenor ? ` a ${pontos[indiceMaior].rotulo}` : ""}
          </span>
          <Botao variante="primaria" onClick={aplicar}>
            Aplicar como filtro
          </Botao>
          <Botao variante="secundaria" onClick={limparSelecao}>
            Reset
          </Botao>
        </div>
      )}
    </div>
  );
}
