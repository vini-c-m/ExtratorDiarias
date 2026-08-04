import Alerta from "../ui/Alerta";
import Botao from "../ui/Botao";
import { SUPERFICIE_BASE } from "../../theme/estilos";
import { TIPOGRAFIA } from "../../theme/tipografia";
import type { IndicadoresResposta, ResultadoPesquisaResposta } from "../../types/analitica";

interface Props {
  carregando: boolean;
  resultado: ResultadoPesquisaResposta | null;
  /** Sprint 19.6.2 — `GET /indicadores`, busca independente da tabela
   * (`useIndicadores`, mesmos filtros de `useDiarias`). Sprint 19.6.2.1 —
   * `null` agora significa exclusivamente "ainda não há indicador válido
   * para o recorte atual" (carregando ou falhou) — o hook já garante que
   * nunca é o valor de um recorte anterior (`useIndicadores.ts`). */
  indicadores: IndicadoresResposta | null;
  /** Sprint 19.6.2.1 — correção do achado da Auditoria Técnica da 19.6.2:
   * exposto separadamente do carregamento da tabela (`carregando` acima),
   * porque as duas buscas são independentes — enquanto os indicadores do
   * recorte atual ainda carregam, a contagem (tabela) já pode estar
   * pronta e visível. */
  indicadoresCarregando: boolean;
  indicadoresErro: string | null;
  aoTentarNovamenteIndicadores: () => void;
}

const FORMATADOR_MOEDA = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** `null`/`undefined` nunca vira "R$ 0,00" (não há valor a mostrar); zero
 * real aparece como "R$ 0,00" normalmente — mesma distinção já exigida em
 * `valor_total`/`valor_medio` (`!= null`, não `!valor`, que trataria `0`
 * como falso). */
function formatarMoedaOuNulo(valor: number | null): string | null {
  return valor != null ? FORMATADOR_MOEDA.format(valor) : null;
}

// Sprint 19.5.5 — primeira versão do "Resumo do recorte"
// (`v2-arquitetura-funcional.md` § 2/§ 4): por ora só a contagem total, o
// único dado já disponível sem endpoint novo (`useDiarias`/`GET /diarias`).
// Sprint 19.6.2 — valor total/médio reais (`GET /indicadores`, 19.6.1)
// substituem o texto fixo em "só a contagem" desta Sprint anterior.
// Sprint 19.6.2.1 — correção da Auditoria Técnica da 19.6.2: acrescenta
// "total de servidores" (já disponível, sem custo — `v2-wireframes.md`
// § 2 já previa esse dado no "resumo básico"; só "total de municípios"
// continua ausente, pendente da pergunta 2 do DIMCAC, § 14) e passa a
// distinguir explicitamente carregando/erro dos indicadores (antes,
// `indicadores === null` era ambíguo entre "carregando", "falhou" e
// "pertence a outro recorte" — agora o hook garante que só significa
// "ainda não há indicador válido para o recorte atual", e este
// componente comunica qual desses três motivos é, em vez de
// simplesmente omitir o valor em silêncio). "Período coberto" e outras
// dimensões dominantes (§ 4.3) continuam fora do escopo, sem endpoint
// próprio ainda. Nulo enquanto carregando/sem resultado ainda —
// `TabelaDiarias` já cobre os estados de carregamento/erro/vazio da
// lista em si; este componente só aparece quando há de fato um recorte
// para resumir.
export default function ResumoRecorte({
  carregando,
  resultado,
  indicadores,
  indicadoresCarregando,
  indicadoresErro,
  aoTentarNovamenteIndicadores,
}: Props) {
  if (carregando || resultado === null) return null;

  const total = resultado.paginacao.total_itens;
  const valorTotal = formatarMoedaOuNulo(indicadores?.valor_total ?? null);
  const valorMedio = formatarMoedaOuNulo(indicadores?.valor_medio ?? null);

  return (
    <div className={`${SUPERFICIE_BASE} px-5 py-4`}>
      <p role="status" className={TIPOGRAFIA.textoForte}>
        {total.toLocaleString("pt-BR")} registro{total === 1 ? "" : "s"} no recorte atual
        {indicadores !== null &&
          ` · ${indicadores.total_servidores.toLocaleString("pt-BR")} servidor${
            indicadores.total_servidores === 1 ? "" : "es"
          }`}
        {valorTotal !== null && ` · ${valorTotal} no total`}
        {valorMedio !== null && ` · ${valorMedio} em média`}
      </p>

      {/* Sprint 19.6.2.1 — estados explícitos dos indicadores (nunca um
          valor antigo visível durante a troca de recorte, nunca uma
          falha silenciosa). */}
      {indicadoresCarregando && (
        <p className={`mt-1 ${TIPOGRAFIA.textoAuxiliar}`}>Calculando indicadores deste recorte...</p>
      )}
      {indicadoresErro !== null && (
        <div className="mt-2 flex items-center justify-between gap-4">
          <Alerta variante="erro">{indicadoresErro}</Alerta>
          <Botao variante="secundaria" onClick={aoTentarNovamenteIndicadores}>
            Tentar novamente
          </Botao>
        </div>
      )}
    </div>
  );
}
