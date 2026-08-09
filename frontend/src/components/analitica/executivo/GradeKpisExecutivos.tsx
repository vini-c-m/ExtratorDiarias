import Alerta from "../../ui/Alerta";
import Botao from "../../ui/Botao";
import Cartao from "../../ui/Cartao";
import type { EstadoUseComparacaoExecutiva } from "./useComparacaoExecutiva";
import { useValorAnimado } from "./useValorAnimado";
import type { EstadoUseDistribuicoes } from "../../../hooks/useDistribuicoes";
import { formatarVariacaoPercentual } from "../../../lib/variacao";
import { SUPERFICIE_BASE } from "../../../theme/estilos";
import { TIPOGRAFIA } from "../../../theme/tipografia";
import type { IndicadoresResposta } from "../../../types/analitica";

interface Props {
  indicadores: IndicadoresResposta | null;
  indicadoresCarregando: boolean;
  indicadoresErro: string | null;
  aoTentarNovamenteIndicadores: () => void;
  distribuicaoCategoriaFuncional: EstadoUseDistribuicoes;
  comparacao: EstadoUseComparacaoExecutiva;
  /** Refinamento visual do Modo Executivo (2026-08-07) — mesmos indicadores
   * completos do período anterior já buscados por `useInsightsExecutivos`
   * para o insight de variação; usados aqui só para o texto de delta dos 4
   * KPIs centrais, nenhuma chamada de rede nova. `null` nas mesmas
   * condições em que o insight de variação também fica ausente (sem
   * período definido no recorte, ou a busca ainda não terminou/falhou). */
  indicadoresPeriodoAnterior: IndicadoresResposta | null;
}

const FORMATADOR_MOEDA = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const FORMATADOR_INTEIRO = new Intl.NumberFormat("pt-BR");
const FORMATADOR_PERCENTUAL = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

function formatarMoedaOuTraco(valor: number | null): string {
  return valor != null ? FORMATADOR_MOEDA.format(valor) : "—";
}

function formatarInteiro(valor: number): string {
  return FORMATADOR_INTEIRO.format(valor);
}

/** Cartão que depende de um estado assíncrono próprio (carregando/erro/
 * pronto), diferente dos 4 KPIs "clássicos" acima (que dependem só de
 * `indicadores`, já resolvido por quem chama este componente) — mesmo
 * critério de estados explícitos por cartão já usado em `DashboardRecorte.
 * SecaoGrafico`, nunca um valor de um recorte anterior. */
function CartaoAssincrono({
  rotulo,
  carregando,
  erro,
  tentarNovamente,
  valor,
  titulo,
}: {
  rotulo: string;
  carregando: boolean;
  erro: string | null;
  tentarNovamente: () => void;
  valor: string | null;
  titulo?: string;
}) {
  if (erro !== null) {
    return (
      <div className="p-5">
        <div className={`mb-2 ${TIPOGRAFIA.legenda}`}>{rotulo}</div>
        <Alerta variante="erro">{erro}</Alerta>
        <div className="mt-2">
          <Botao variante="secundaria" onClick={tentarNovamente}>
            Tentar novamente
          </Botao>
        </div>
      </div>
    );
  }

  if (carregando || valor === null) {
    return (
      <div role="status" className="flex flex-col justify-center p-5">
        <div className={`mb-2 ${TIPOGRAFIA.legenda}`}>{rotulo}</div>
        <p className={TIPOGRAFIA.textoAuxiliar}>Calculando...</p>
      </div>
    );
  }

  // Tooltip discreto com o detalhe completo (ex.: "MEMBRO 22,0% ·
  // SERVIDOR 78,0%") — o cartão em si mostra só o resumo compacto.
  return (
    <div title={titulo}>
      <Cartao rotulo={rotulo} valor={valor} tamanho="compacto" moldura={false} />
    </div>
  );
}

/** Delta de KPI (refinamento visual, 2026-08-07; BI 4.0 — fórmula movida
 * para `lib/variacao.ts`, única implementação, também usada por
 * `insightsExecutivos.ts` e pelo cabeçalho editorial do hero em
 * `GradeGraficosExecutivos.tsx`. RN-08: sinal já basta, nunca cor de erro
 * só por ser negativa), composta com o rótulo fixo "vs. período anterior".
 * `null` quando não há como comparar (sem período no recorte, ainda
 * carregando, ou anterior zero/nulo) — o cartão simplesmente não mostra
 * a linha de delta, nunca um "—" ou "N/A". */
function textoDelta(valorAnterior: number | null, valorAtual: number | null): string | null {
  const variacao = formatarVariacaoPercentual(valorAnterior, valorAtual);
  return variacao ? `${variacao} vs. período anterior` : null;
}

/** Cartão de comparação (Sprint 21.6) — mesma superfície visual de
 * `Cartao`, mas com 2 valores e a variação entre eles; nunca recalcula
 * `primeiro`/`segundo` em si (já vêm prontos de `IndicadoresResposta`,
 * backend), só a diferença percentual. `rotuloPrimeiro`/`rotuloSegundo`
 * chegam como `title` de cada linha (ex.: "Mês atual"/"Julho/2026") —
 * `inverter()` troca a ordem de exibição, então "A"/"B" no texto
 * principal é só uma posição visual fixa, nunca o próprio rótulo. */
function CartaoComparacaoKpi({
  rotulo,
  rotuloPrimeiro,
  rotuloSegundo,
  primeiro,
  segundo,
  formatar,
}: {
  rotulo: string;
  rotuloPrimeiro: string;
  rotuloSegundo: string;
  primeiro: number | null;
  segundo: number | null;
  formatar: (valor: number | null) => string;
}) {
  const variacao = formatarVariacaoPercentual(primeiro, segundo);
  return (
    <div className="p-5">
      <div className={TIPOGRAFIA.legenda}>{rotulo}</div>
      <div className={`mt-2 ${TIPOGRAFIA.textoForte}`} title={rotuloPrimeiro}>
        A: {formatar(primeiro)}
      </div>
      <div className={`mt-1 ${TIPOGRAFIA.textoForte}`} title={rotuloSegundo}>
        B: {formatar(segundo)}
        {variacao && <span className={`ml-1.5 ${TIPOGRAFIA.textoAuxiliar}`}>({variacao})</span>}
      </div>
    </div>
  );
}

/** Grade de KPIs do Modo Executivo (`modo-executivo-arquitetura-funcional.md
 * § 6`, componente 3; `modo-executivo-wireframes.md § 2.1`) — os mesmos 4
 * indicadores já homologados de `IndicadoresResposta` (nenhum recálculo:
 * `total_diarias`/`total_servidores`/`valor_total`/`valor_medio` chegam
 * prontos) mais "Membros × Servidores" (proporção sobre a distribuição
 * `categoria_funcional`, Sprint 21.1). 5 KPIs — a célula "Atenção
 * (diagnóstico)" foi removida do Modo Executivo (BI 4.0, pedido explícito
 * do usuário: "Modo Executivo = financeiro + gerencial", nunca
 * diagnóstico operacional; o dado continua em Diagnóstico geral e no
 * drill-down do painel lateral contextual, nada muda lá).
 *
 * BI 4.0 — cada valor passa por `useValorAnimado` (interpolação numérica
 * real via `requestAnimationFrame`, não um fade do conteúdo): quando o
 * filtro muda e o indicador chega diferente, o número CONTA visualmente
 * do valor anterior até o novo, terminando exatamente no valor real. Os
 * hooks ficam no topo do componente (antes dos `return` de carregando/
 * erro) porque Hooks do React não podem ser condicionais. */
export default function GradeKpisExecutivos({
  indicadores,
  indicadoresCarregando,
  indicadoresErro,
  aoTentarNovamenteIndicadores,
  distribuicaoCategoriaFuncional,
  comparacao,
  indicadoresPeriodoAnterior,
}: Props) {
  const pontosCategoria = distribuicaoCategoriaFuncional.distribuicao?.pontos ?? [];
  const totalCategoria = pontosCategoria.reduce((soma, ponto) => soma + ponto.contagem, 0);
  const contagemMembro = pontosCategoria.find((ponto) => ponto.rotulo === "MEMBRO")?.contagem ?? 0;
  const contagemServidor = pontosCategoria.find((ponto) => ponto.rotulo === "SERVIDOR")?.contagem ?? 0;
  const contagemNaoIdentificado = pontosCategoria.find((ponto) => ponto.rotulo === "NAO_IDENTIFICADO")?.contagem ?? 0;

  const diariasAnimado = useValorAnimado(indicadores?.total_diarias ?? null);
  const pessoasAnimado = useValorAnimado(indicadores?.total_servidores ?? null);
  const valorTotalAnimado = useValorAnimado(indicadores?.valor_total ?? null);
  const valorMedioAnimado = useValorAnimado(indicadores?.valor_medio ?? null);
  const percentualMembroAnimado = useValorAnimado(totalCategoria > 0 ? (contagemMembro / totalCategoria) * 100 : null);
  const percentualServidorAnimado = useValorAnimado(totalCategoria > 0 ? (contagemServidor / totalCategoria) * 100 : null);

  if (indicadoresErro !== null) {
    return (
      <div className={`p-5 ${SUPERFICIE_BASE}`}>
        <div className="flex items-center justify-between gap-4">
          <Alerta variante="erro">{indicadoresErro}</Alerta>
          <Botao variante="secundaria" onClick={aoTentarNovamenteIndicadores}>
            Tentar novamente
          </Botao>
        </div>
      </div>
    );
  }

  if (indicadoresCarregando || indicadores === null) {
    return (
      <div role="status" className={`flex items-center justify-center p-16 ${SUPERFICIE_BASE}`}>
        <p className={TIPOGRAFIA.textoAuxiliar}>Calculando indicadores deste recorte...</p>
      </div>
    );
  }

  const percentualMembroServidor =
    totalCategoria > 0 && percentualMembroAnimado !== null && percentualServidorAnimado !== null
      ? `${FORMATADOR_PERCENTUAL.format(percentualMembroAnimado)}% · ${FORMATADOR_PERCENTUAL.format(percentualServidorAnimado)}%`
      : null;
  const tituloMembroServidor =
    totalCategoria > 0
      ? `Membro: ${formatarInteiro(contagemMembro)} · Servidor: ${formatarInteiro(contagemServidor)}` +
        (contagemNaoIdentificado > 0 ? ` · Não identificado: ${formatarInteiro(contagemNaoIdentificado)}` : "")
      : undefined;

  const comparando = comparacao.ativa;
  const primeiro = comparando ? comparacao.indicadoresPrimeiro : null;
  const segundo = comparando ? comparacao.indicadoresSegundo : null;
  const carregandoAlgumLado = comparando && (comparacao.carregandoPrimeiro || comparacao.carregandoSegundo);
  const erroAlgumLado = comparando ? (comparacao.erroPrimeiro ?? comparacao.erroSegundo) : null;

  // Redesign BI 3.0 (2026-08-07) — "faixa executiva": 1 superfície só
  // (`SUPERFICIE_BASE`), divisores sutis (`divide-*`) entre as células em
  // vez de 6 cartões com borda/glow próprios — cada célula continua com
  // seu próprio padding e resposta de hover (`Cartao moldura={false}`),
  // então ainda lê como "cards executivos integrados", nunca uma tabela
  // rígida. O valor principal domina (`text-4xl`/`text-sm` conforme
  // `tamanho`, já herdado de `Cartao`); rótulo/delta continuam pequenos e
  // discretos — nenhuma mudança de hierarquia tipográfica, só de moldura.
  return (
    <div
      className="kpis-executivos grid grid-cols-2 sm:grid-cols-3 min-[960px]:grid-cols-5"
    >
      {erroAlgumLado !== null ? (
        <div className="col-span-2 p-5 sm:col-span-3 min-[960px]:col-span-5">
          <div className="flex items-center justify-between gap-4">
            <Alerta variante="erro">{erroAlgumLado}</Alerta>
            <Botao variante="secundaria" onClick={comparacao.tentarNovamenteB}>
              Tentar novamente
            </Botao>
          </div>
        </div>
      ) : comparando && (carregandoAlgumLado || primeiro === null || segundo === null) ? (
        <div role="status" className="col-span-2 flex items-center justify-center p-10 sm:col-span-3 min-[960px]:col-span-5">
          <p className={TIPOGRAFIA.textoAuxiliar}>Calculando comparação...</p>
        </div>
      ) : comparando && primeiro !== null && segundo !== null ? (
        <>
          <CartaoComparacaoKpi
            rotulo="Diárias"
            rotuloPrimeiro={comparacao.rotuloPrimeiro}
            rotuloSegundo={comparacao.rotuloSegundo}
            primeiro={primeiro.total_diarias}
            segundo={segundo.total_diarias}
            formatar={(valor) => (valor === null ? "—" : formatarInteiro(valor))}
          />
          <CartaoComparacaoKpi
            rotulo="Pessoas"
            rotuloPrimeiro={comparacao.rotuloPrimeiro}
            rotuloSegundo={comparacao.rotuloSegundo}
            primeiro={primeiro.total_servidores}
            segundo={segundo.total_servidores}
            formatar={(valor) => (valor === null ? "—" : formatarInteiro(valor))}
          />
          <CartaoComparacaoKpi
            rotulo="Valor total"
            rotuloPrimeiro={comparacao.rotuloPrimeiro}
            rotuloSegundo={comparacao.rotuloSegundo}
            primeiro={primeiro.valor_total}
            segundo={segundo.valor_total}
            formatar={formatarMoedaOuTraco}
          />
          <CartaoComparacaoKpi
            rotulo="Valor médio"
            rotuloPrimeiro={comparacao.rotuloPrimeiro}
            rotuloSegundo={comparacao.rotuloSegundo}
            primeiro={primeiro.valor_medio}
            segundo={segundo.valor_medio}
            formatar={formatarMoedaOuTraco}
          />
        </>
      ) : (
        <>
          <Cartao
            rotulo="Diárias"
            valor={formatarInteiro(Math.round(diariasAnimado ?? indicadores.total_diarias))}
            delta={textoDelta(indicadoresPeriodoAnterior?.total_diarias ?? null, indicadores.total_diarias)}
            moldura={false}
          />
          <Cartao
            rotulo="Pessoas"
            valor={formatarInteiro(Math.round(pessoasAnimado ?? indicadores.total_servidores))}
            delta={textoDelta(indicadoresPeriodoAnterior?.total_servidores ?? null, indicadores.total_servidores)}
            moldura={false}
          />
          <Cartao
            rotulo="Valor total"
            valor={formatarMoedaOuTraco(valorTotalAnimado)}
            delta={textoDelta(indicadoresPeriodoAnterior?.valor_total ?? null, indicadores.valor_total)}
            cor={indicadores.valor_total == null ? "atencao" : "padrao"}
            tamanho="compacto"
            moldura={false}
          />
          <Cartao
            rotulo="Valor médio"
            valor={formatarMoedaOuTraco(valorMedioAnimado)}
            delta={textoDelta(indicadoresPeriodoAnterior?.valor_medio ?? null, indicadores.valor_medio)}
            cor={indicadores.valor_medio == null ? "atencao" : "padrao"}
            tamanho="compacto"
            moldura={false}
          />
        </>
      )}
      <CartaoAssincrono
        rotulo="Membros · Servidores"
        carregando={distribuicaoCategoriaFuncional.carregando}
        erro={distribuicaoCategoriaFuncional.erro}
        tentarNovamente={distribuicaoCategoriaFuncional.tentarNovamente}
        valor={percentualMembroServidor}
        titulo={tituloMembroServidor}
      />
    </div>
  );
}
