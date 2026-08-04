import { useId, useState } from "react";
import type { ReactNode } from "react";
import Botao from "../../ui/Botao";
import { FOCO_ANEL, SUPERFICIE_BASE } from "../../../theme/estilos";
import { TIPOGRAFIA } from "../../../theme/tipografia";

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
  children: ReactNode;
}

/** Sprint 19.6.4 — cartão comum a todo gráfico do Dashboard: título +
 * alternância obrigatória gráfico/tabela + legenda opcional. Sprint 19.6.5 —
 * ganha `interativo`/`aoClicarLegenda` para o clique-refina, sem quebrar o
 * comportamento anterior (ambos opcionais, `interativo` default `false`). */
export default function CartaoGrafico({
  titulo,
  linhasTabela,
  rotuloColunaValor,
  legenda,
  vazio = false,
  interativo = false,
  aoClicarLegenda,
  children,
}: Props) {
  const [modo, setModo] = useState<"grafico" | "tabela">("grafico");
  const idTitulo = useId();

  return (
    <div className={`${SUPERFICIE_BASE} p-5`}>
      <div className="flex items-center justify-between gap-3">
        <h4 id={idTitulo} className={TIPOGRAFIA.subtitulo}>
          {titulo}
        </h4>
        {!vazio && (
          <Botao variante="secundaria" onClick={() => setModo((atual) => (atual === "grafico" ? "tabela" : "grafico"))}>
            {modo === "grafico" ? "Ver como tabela" : "Ver gráfico"}
          </Botao>
        )}
      </div>

      {!vazio && legenda && legenda.length > 1 && (
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
          {legenda.map((item, indice) => {
            const clicavel = aoClicarLegenda !== undefined && item.filtravel !== false;
            const swatch = (
              <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.cor }} />
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
      )}

      {vazio ? (
        <p className={`mt-4 ${TIPOGRAFIA.textoAuxiliar}`}>Sem dados para este recorte.</p>
      ) : modo === "grafico" ? (
        <div {...(interativo ? {} : { "aria-hidden": "true" })} className="mt-4">
          {children}
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
      )}
    </div>
  );
}
