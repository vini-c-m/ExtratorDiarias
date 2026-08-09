import { Maximize2, MoreHorizontal } from "lucide-react";
import { useId, useState } from "react";
import type { ReactNode } from "react";
import Botao from "../../ui/Botao";
import ModalExpandirGrafico from "./ModalExpandirGrafico";
import { FOCO_ANEL } from "../../../theme/estilos";
import { TIPOGRAFIA } from "../../../theme/tipografia";

// Redesign BI 3.0 (2026-08-07) — mesma composição de `SUPERFICIE_BASE`
// (`theme/estilos.ts`), só com a borda variável por `variante`: o hero
// mantém a borda padrão do Design System, os demais ganham uma borda mais
// discreta ("menos moldura pesada", pedido explícito). Não dá para só
// concatenar uma 2ª classe `border-white/*` depois de `SUPERFICIE_BASE`
// no JSX — Tailwind gera as duas com a mesma especificidade, e quem vence
// depende da ordem de geração da folha de estilo, não da ordem no
// className. Compor localmente evita essa ambiguidade.
const SUPERFICIE_GRAFICO: Record<"padrao" | "hero", string> = {
  padrao: "rounded-card border border-white/5 bg-white/[0.04] backdrop-blur-sm shadow-card",
  hero: "rounded-card border border-white/10 bg-white/[0.04] backdrop-blur-sm shadow-card",
};

// BI 4.0 — "menos card, mais canvas": variante sem borda/sombra própria,
// só um leve realce de fundo, para gráficos secundários que vivem dentro
// de uma seção que já tem seu próprio fundo (`GradeGraficosExecutivos`,
// blocos "Distribuições"/"Análise Territorial"). Só usada quando `enfase`
// é passado explicitamente — default `"normal"` preserva 100% do visual
// já homologado em todo o resto do app (Dashboard operacional incluído).
const SUPERFICIE_GRAFICO_SUTIL = "rounded-card border border-transparent bg-white/[0.02]";

export interface LinhaTabelaGrafico {
  rotulo: string;
  valor: string;
}

export interface ItemLegendaGrafico {
  rotulo: string;
  cor: string;
  /** Sprint 19.6.5 — `false` para o bucket agregado "Outros" (donuts) ou
   * qualquer categoria sintética sem valor real filtrável. `undefined`/
   * ausente equivale a `true`. Sem efeito quando `aoClicarLegenda` não é
   * passado. */
  filtravel?: boolean;
}

interface Props {
  titulo: string;
  /** Variante somente visual para consumidores que possuem um canvas
   * próprio. O default mantém Dashboard operacional e demais telas
   * exatamente como antes. */
  contextoVisual?: "padrao" | "executivo";
  /** Equivalente textual obrigatório (`v2-demonstracao-visual.md` § 6 —
   * "gráfico nunca é a única forma de acessar o dado") — sempre calculado
   * pelo chamador a partir dos mesmos pontos desenhados no gráfico, nunca um
   * resumo aproximado. */
  linhasTabela: LinhaTabelaGrafico[];
  rotuloColunaValor: string;
  /** Legenda de identidade — obrigatória sempre que o gráfico tiver 2+
   * séries (categorias com cor própria); ausente para gráfico de série
   * única, onde o título já diz o que está plotado. */
  legenda?: ItemLegendaGrafico[];
  /** Recorte sem nenhum dado para esta dimensão — nunca um gráfico vazio
   * silencioso. */
  vazio?: boolean;
  /** Sprint 19.6.5 — quando o gráfico tem clique-refina (`GraficoBarras`/
   * `GraficoDonut` recebendo `aoClicar*`), o visual deixa de ser
   * `aria-hidden`: as marcas viram controles reais (`<button>`), que já são
   * seu próprio equivalente acessível — esconder o contêiner as tornaria
   * inatingíveis por teclado/leitor de tela. Só leitura (19.6.4, padrão)
   * continua `aria-hidden`, decoração redundante da tabela. */
  interativo?: boolean;
  /** Ativa cada item de legenda `filtravel` como um controle real (mesmo
   * papel do clique numa fatia do donut, só que pela legenda — caminho
   * acessível por teclado para a mesma ação, já que a geometria SVG em si
   * não vira foco). */
  aoClicarLegenda?: (indice: number) => void;
  /** Refinamento visual 2.0 (2026-08-07) — `"hero"` só para o gráfico
   * protagonista da tela ("Evolução de gastos" no Modo Executivo): título
   * maior (`TIPOGRAFIA.titulo`) e mais respiro (`p-7`). Default `"padrao"`
   * preserva 100% do visual já homologado em todo o resto do app. */
  variante?: "padrao" | "hero";
  /** Redesign BI 3.0 (2026-08-07) — linha de contexto discreta sob o
   * título (ex.: período coberto pelo gráfico) — sempre calculada por
   * quem chama a partir de dados já recebidos (nenhum cálculo/fetch
   * novo), igual a `delta` em `Cartao`. */
  subtitulo?: string;
  /** Redesign BI 3.0 (2026-08-07) — esconde os controles ⛶/⋯ do
   * cabeçalho; só usado pelo Modo Apresentação ("menos controles
   * administrativos", leitura à distância). O gráfico em si continua
   * idêntico — só o cabeçalho perde as 2 ações de edição/navegação. */
  somenteLeitura?: boolean;
  /** BI 4.0 — `"sutil"` troca a superfície própria (borda/fundo) por
   * `SUPERFICIE_GRAFICO_SUTIL` (sem borda, fundo quase imperceptível) —
   * "canvas contínuo" em vez de card isolado. Default `"normal"` preserva
   * 100% do visual atual. Não afeta `variante`/`somenteLeitura`, nem o
   * modal expandido (`ModalExpandirGrafico` tem sua própria superfície). */
  enfase?: "normal" | "sutil";
  /** BI 4.0 — quando `true`, a legenda (`legenda`/`aoClicarLegenda`) só
   * aparece dentro do modal expandido, nunca abaixo do gráfico na visão
   * compacta — usado por composições que já desenham sua própria legenda
   * ao lado do gráfico (donut + lista, `GradeGraficosExecutivos`), para
   * nunca duplicar a mesma legenda 2x. Default `false` preserva o
   * comportamento atual (legenda sempre visível, compacto e modal). */
  legendaSoNoModal?: boolean;
  /** Correção UX — modo de análise em tela cheia (2026-08-07) — vira
   * render-prop: quem monta o gráfico (`GradeGraficosExecutivos.tsx`)
   * decide como reagir a `expandido`, mas só em dimensão/apresentação
   * (altura de barra, tamanho de donut, densidade de rótulo) — o dado, o
   * filtro e a query continuam exatamente os mesmos nos dois modos, é o
   * MESMO fetch/estado, só desenhado maior. `CartaoGrafico` nunca lê nem
   * decide o que `expandido` significa visualmente — só repassa o
   * booleano adiante. */
  children: (expandido: boolean) => ReactNode;
}

/** Sprint 19.6.4 — cartão comum a todo gráfico do Dashboard: título +
 * alternância obrigatória gráfico/tabela + legenda opcional. Sprint 19.6.5 —
 * ganha `interativo`/`aoClicarLegenda` para o clique-refina, sem quebrar o
 * comportamento anterior (ambos opcionais, `interativo` default `false`). */
export default function CartaoGrafico({
  titulo,
  contextoVisual = "padrao",
  linhasTabela,
  rotuloColunaValor,
  legenda,
  vazio = false,
  interativo = false,
  aoClicarLegenda,
  variante = "padrao",
  subtitulo,
  somenteLeitura = false,
  enfase = "normal",
  legendaSoNoModal = false,
  children,
}: Props) {
  const [modo, setModo] = useState<"grafico" | "tabela">("grafico");
  const [expandido, setExpandido] = useState(false);
  const [menuAberto, setMenuAberto] = useState(false);
  const idTitulo = useId();

  function Corpo({ expandido: expandidoConteudo }: { expandido: boolean }) {
    return modo === "grafico" ? (
      <div
        {...(interativo ? {} : { "aria-hidden": "true" })}
        className={expandidoConteudo ? "mt-4 flex min-h-0 flex-1 flex-col" : "mt-4"}
      >
        {children(expandidoConteudo)}
      </div>
    ) : (
      <table aria-labelledby={idTitulo} className="mt-4 w-full text-left text-sm">
        <thead>
          <tr className={TIPOGRAFIA.legenda}>
            <th className="pb-2 font-medium">Categoria</th>
            <th className="pb-2 font-medium">{rotuloColunaValor}</th>
          </tr>
        </thead>
        <tbody>
          {linhasTabela.map((linha) => (
            <tr key={linha.rotulo} className="border-t border-white/5">
              <td className={`py-1.5 pr-3 ${TIPOGRAFIA.texto}`}>{linha.rotulo}</td>
              <td className={`py-1.5 ${TIPOGRAFIA.textoForte}`}>{linha.valor}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  // Extraído (correção UX, 2026-08-07) para ser reaproveitado dentro do
  // modal expandido também — a legenda já é uma ação existente (filtra por
  // categoria), então "entrar em modo de análise" não pode escondê-la; só
  // reaproveita, nenhuma ação nova.
  function Legenda() {
    if (vazio || !legenda || legenda.length <= 1) return null;
    return (
      <ul className="flex flex-wrap gap-x-3 gap-y-1">
        {legenda.map((item, indice) => {
          const clicavel = aoClicarLegenda !== undefined && item.filtravel !== false;
          const swatch = (
            <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: item.cor }} />
          );
          return (
            <li key={item.rotulo}>
              {clicavel ? (
                <button
                  type="button"
                  onClick={() => aoClicarLegenda(indice)}
                  className={`flex items-center gap-1.5 rounded ${TIPOGRAFIA.textoAuxiliar} ${FOCO_ANEL} hover:text-slate-300`}
                  aria-label={`Filtrar por ${item.rotulo}`}
                >
                  {swatch}
                  {item.rotulo}
                </button>
              ) : (
                <span className={`flex items-center gap-1.5 ${TIPOGRAFIA.textoAuxiliar}`}>
                  {swatch}
                  {item.rotulo}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    // `overflow-hidden` (correção de regressão, 2026-08-07) — cada
    // CartaoGrafico vira um viewport isolado: nenhum filho (tooltip, glow,
    // o que for, hoje ou no futuro) pode mais vazar visualmente para o
    // card vizinho na grade. O modal "Expandir" usa `position: fixed`
    // (`ModalExpandirGrafico`), que escapa de qualquer `overflow` de
    // ancestral por definição do CSS — não é afetado por este corte.
    <div
      className={`${enfase === "sutil" ? SUPERFICIE_GRAFICO_SUTIL : SUPERFICIE_GRAFICO[variante]} overflow-hidden ${variante === "hero" ? "p-7" : "p-5"}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 id={idTitulo} className={variante === "hero" ? TIPOGRAFIA.titulo : TIPOGRAFIA.subtitulo}>
            {titulo}
          </h4>
          {subtitulo && <p className={`mt-0.5 ${TIPOGRAFIA.textoAuxiliar}`}>{subtitulo}</p>}
        </div>
        {!vazio && !somenteLeitura && (
          <div className="relative flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => setExpandido(true)}
              aria-label={`Expandir ${titulo}`}
              className={`rounded p-1 text-slate-400 hover:bg-white/10 hover:text-slate-200 ${FOCO_ANEL}`}
            >
              <Maximize2 aria-hidden="true" className="h-4 w-4" />
            </button>
            {/* Refinamento visual 2.0 (2026-08-07) — "Ver como tabela" some
                do cabeçalho e vira o único item de um menu "⋯", reduzindo o
                cabeçalho a 2 controles (⛶/⋯) em vez de disputar espaço/peso
                com o título; a funcionalidade em si é idêntica (mesmo
                `modo`, mesmo toggle). */}
            <button
              type="button"
              onClick={() => setMenuAberto((atual) => !atual)}
              aria-label="Mais opções"
              aria-haspopup="true"
              aria-expanded={menuAberto}
              className={`rounded p-1 text-slate-400 hover:bg-white/10 hover:text-slate-200 ${FOCO_ANEL}`}
            >
              <MoreHorizontal aria-hidden="true" className="h-4 w-4" />
            </button>
            {menuAberto && (
              <>
                <button
                  type="button"
                  aria-label="Fechar menu"
                  tabIndex={-1}
                  onClick={() => setMenuAberto(false)}
                  className="fixed inset-0 z-10 cursor-default"
                />
                <div className="absolute right-0 top-full z-20 mt-1 min-w-[9rem] rounded-lg border border-white/10 bg-[#0b1120] py-1 shadow-dialog">
                  <button
                    type="button"
                    onClick={() => {
                      setModo((atual) => (atual === "grafico" ? "tabela" : "grafico"));
                      setMenuAberto(false);
                    }}
                    className="block w-full px-3 py-1.5 text-left text-sm font-medium text-cyan-400 hover:bg-white/5 hover:text-cyan-300"
                  >
                    {modo === "grafico" ? "Ver como tabela" : "Ver gráfico"}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {!vazio && !legendaSoNoModal && legenda && legenda.length > 1 && <div className="mt-3"><Legenda /></div>}

      {vazio ? <p className={`mt-4 ${TIPOGRAFIA.textoAuxiliar}`}>Sem dados para este recorte.</p> : <Corpo expandido={false} />}

      {expandido && (
        <ModalExpandirGrafico titulo={titulo} onFechar={() => setExpandido(false)} contextoVisual={contextoVisual}>
          {/* Correção UX (2026-08-07) — o corpo do modal é `flex flex-col`
              de altura total: a linha de ações (legenda + "Ver como
              tabela") fica compacta no topo, e `Corpo` (o gráfico de
              verdade, maior neste modo) ocupa o resto — "controles
              inferiores totalmente visíveis" deixa de depender de rolar
              até achá-los. */}
          <div className="flex h-full flex-col">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <Legenda />
              <Botao
                variante="link"
                onClick={() => setModo((atual) => (atual === "grafico" ? "tabela" : "grafico"))}
              >
                {modo === "grafico" ? "Ver como tabela" : "Ver gráfico"}
              </Botao>
            </div>
            <Corpo expandido />
          </div>
        </ModalExpandirGrafico>
      )}
    </div>
  );
}
