import { Download, Printer } from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";
import Alerta from "../ui/Alerta";
import Botao from "../ui/Botao";
import Cartao from "../ui/Cartao";
import CartaoGrafico from "./graficos/CartaoGrafico";
import GraficoBarras from "./graficos/GraficoBarras";
import GraficoDonut, { type SegmentoDonut } from "./graficos/GraficoDonut";
import { COR_MAGNITUDE_CONTAGEM, COR_MAGNITUDE_VALOR, COR_OUTROS, PALETA_CATEGORICA } from "./graficos/cores";
import type { CampoDeFiltro } from "../../hooks/useDiarias";
import { useDistribuicoes, type EstadoUseDistribuicoes } from "../../hooks/useDistribuicoes";
import { useGerarRelatorio } from "../../hooks/useGerarRelatorio";
import { MENSAGENS, mensagemAmigavel } from "../../lib/mensagens";
import { filtrosParaRelatorio } from "../../lib/parametrosRelatorio";
import { SUPERFICIE_BASE } from "../../theme/estilos";
import { TIPOGRAFIA } from "../../theme/tipografia";
import type { DistribuicaoResposta, IndicadoresResposta, ParametrosPesquisaDiariasQuery, PontoDistribuicaoResposta } from "../../types/analitica";

interface Props {
  filtros: ParametrosPesquisaDiariasQuery;
  indicadores: IndicadoresResposta | null;
  indicadoresCarregando: boolean;
  indicadoresErro: string | null;
  aoTentarNovamenteIndicadores: () => void;
  /** Sprint 19.6.5 — clique-refina reaproveita o mesmo `aplicarFiltro` já
   * usado por `PainelFiltrosPrincipal`/`FiltrosRapidos` (`useDiarias`) —
   * nunca um segundo mecanismo de filtro. */
  aoAplicarFiltro: (parcial: Partial<Record<CampoDeFiltro, string | undefined>>) => void;
  aoVoltar: () => void;
}

// Sprint 19.6.5 — rótulos sintéticos de `distribuicoes.py` (buckets de dado
// ausente), reproduzidos aqui letra por letra: um clique nesses pontos não
// tem valor real para filtrar, então nunca viram um botão — a barra/fatia
// continua visível (nunca escondida), só deixa de ser clicável. Mantidos
// como constantes próprias (não importados do backend, que é Python) —
// qualquer divergência de texto entre os dois lados quebraria um teste desta
// suíte, não silenciosamente em produção.
const ROTULO_SERVIDOR_SEM_CADASTRO = "Servidor sem cadastro";
const ROTULO_SEM_DESTINO = "Sem destino informado";
const ROTULO_SEM_ORIGEM = "Sem origem informada";
const ROTULO_SITUACAO_NAO_INFORMADA = "Situação não informada";
const ROTULO_OUTROS = "Outros";

const FORMATADOR_MOEDA = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const FORMATADOR_INTEIRO = new Intl.NumberFormat("pt-BR");
const MESES_ABREV = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** `null`/`undefined` nunca vira "R$ 0,00" — mesmo critério de
 * `ResumoRecorte.formatarMoedaOuNulo`. */
function formatarMoedaOuTraco(valor: number | null): string {
  return valor != null ? FORMATADOR_MOEDA.format(valor) : "—";
}

function formatarInteiro(valor: number): string {
  return FORMATADOR_INTEIRO.format(valor);
}

/** `YYYY-MM` (chave ISO devolvida por `agregar_indicadores`/`periodo`, ver
 * `distribuicoes.py`) → `"jan/2026"`. Nunca via `Date`/`toLocaleString` —
 * mesma disciplina de `lib/datas.ts` de evitar deslocamento de fuso horário
 * em conversões de data; aqui nem há dia, então string pura evita o
 * problema de vez. */
function formatarPeriodo(chavePeriodo: string): string {
  const [ano, mes] = chavePeriodo.split("-");
  const indice = Number(mes) - 1;
  return `${MESES_ABREV[indice] ?? mes}/${ano}`;
}

/** `YYYY-MM` → `{ periodo_inicial, periodo_final }` cobrindo o mês inteiro
 * (1º ao último dia). Mesma técnica de `FiltrosRapidos.tsx` ("Mês
 * anterior"): dia 0 do mês seguinte, no construtor de `Date`, é o último
 * dia do mês corrente — e componentes **locais** (nunca `toISOString`),
 * mesma disciplina de fuso horário documentada lá. */
function intervaloDoMes(chavePeriodo: string): { periodo_inicial: string; periodo_final: string } {
  const [ano, mes] = chavePeriodo.split("-").map(Number);
  const paraIso = (data: Date) =>
    `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}-${String(data.getDate()).padStart(2, "0")}`;
  return {
    periodo_inicial: paraIso(new Date(ano, mes - 1, 1)),
    periodo_final: paraIso(new Date(ano, mes, 0)),
  };
}

/** Buckets sintéticos (dado ausente) nunca viram filtro — mesmo texto,
 * letra por letra, das constantes `ROTULO_*` acima (reproduzidas de
 * `distribuicoes.py`). */
function ehBucketSintetico(rotulo: string): boolean {
  return (
    rotulo === ROTULO_SERVIDOR_SEM_CADASTRO ||
    rotulo === ROTULO_SEM_DESTINO ||
    rotulo === ROTULO_SEM_ORIGEM ||
    rotulo === ROTULO_SITUACAO_NAO_INFORMADA
  );
}

/** `origem_destino` combina os dois lados num rótulo só ("X → Y") — não
 * filtrável quando qualquer um dos dois lados é o bucket sintético de
 * ausência (`_chave_origem_destino` em `distribuicoes.py`). */
function ehParOrigemDestinoSintetico(rotulo: string): boolean {
  const [origem, destino] = rotulo.split(" → ");
  return origem === ROTULO_SEM_ORIGEM || destino === ROTULO_SEM_DESTINO;
}

// Sprint 19.6.4 — "top N" (rankings) e "top 3 + Outros" (donuts) são
// decisões de apresentação desta Sprint, deliberadamente deixadas em aberto
// pelo plano técnico (`distribuicoes.py`: "o corte para 'top N' em si é
// decisão de apresentação do Dashboard, 19.6.4, fora desta Sprint"). A
// tabela (equivalente textual) de cada cartão sempre lista a distribuição
// completa, nunca só o recorte visual.
const TOPO_RANKING = 5;

function agruparTop3ComOutros(pontos: PontoDistribuicaoResposta[]): SegmentoDonut[] {
  const top3 = pontos.slice(0, 3);
  const resto = pontos.slice(3);
  const somaResto = resto.reduce((soma, ponto) => soma + ponto.contagem, 0);
  const segmentos: SegmentoDonut[] = top3.map((ponto, indice) => ({
    rotulo: ponto.rotulo,
    valor: ponto.contagem,
    cor: PALETA_CATEGORICA[indice],
    filtravel: !ehBucketSintetico(ponto.rotulo),
  }));
  // "Outros" funde vários pontos num só segmento — nunca um valor real
  // filtrável isoladamente (mesmo critério do rótulo "Outros" nos gráficos
  // de barra, ver `ROTULO_OUTROS`/`GraficoBarras`).
  if (somaResto > 0) segmentos.push({ rotulo: ROTULO_OUTROS, valor: somaResto, cor: COR_OUTROS, filtravel: false });
  return segmentos;
}

/** Sprint 19.6.4 — um gráfico com carregando/erro/vazio próprios, cada um
 * consumido de sua própria instância de `useDistribuicoes` (uma dimensão por
 * chamada, decisão já registrada em `useDistribuicoes.ts`). Mesmo padrão de
 * estados explícitos já usado em `ResumoRecorte`/`TabelaDiarias`: nunca um
 * valor de outro recorte, nunca uma falha silenciosa. */
function SecaoGrafico({
  estado,
  renderizar,
}: {
  estado: EstadoUseDistribuicoes;
  renderizar: (distribuicao: DistribuicaoResposta) => ReactNode;
}) {
  if (estado.carregando) {
    return (
      <div role="status" className={`flex items-center justify-center p-10 ${SUPERFICIE_BASE}`}>
        <p className={TIPOGRAFIA.textoAuxiliar}>Carregando...</p>
      </div>
    );
  }

  if (estado.erro !== null) {
    return (
      <div className={`p-5 ${SUPERFICIE_BASE}`}>
        <div className="flex items-center justify-between gap-4">
          <Alerta variante="erro">{estado.erro}</Alerta>
          <Botao variante="secundaria" onClick={estado.tentarNovamente}>
            Tentar novamente
          </Botao>
        </div>
      </div>
    );
  }

  if (estado.distribuicao === null) return null;

  return <>{renderizar(estado.distribuicao)}</>;
}

/** Sprint 19.6.4 — Dashboard do recorte (`v2-arquitetura-funcional.md` § 6):
 * 4 cartões de indicador e 7 gráficos, todos com regra de negócio real e
 * dado ao vivo. Decisão de produto 2026-08-06 (ver `v2-arquitetura-
 * funcional.md` § 6.1/6.2, bloco "Decisão de produto — controles retirados
 * da interface"): os 4 KPIs e o 8º gráfico que dependiam de decisão ainda
 * pendente do DIMCAC (`CartaoKpiPendente`, sempre "Pendente", nunca um
 * número real) foram retirados — nenhum estado "em construção" permanece
 * exposto ao usuário; a última coluna do grid de gráficos é preenchida
 * (`md:col-span-2` no último `SecaoGrafico`) para o layout nunca sobrar
 * espaço vazio com um número ímpar de gráficos. Sprint 19.6.5 — cada
 * ponto/fatia/legenda filtrável
 * filtrável (`filtravel !== false`) refina o recorte via `aoAplicarFiltro`
 * e volta aos resultados (`aoVoltar`), § 6.3. Sprint 19.6.6 — exportação
 * (§ 6.3: "Gera um PDF/imagem do dashboard atual... ver § 7 para o
 * mecanismo de exportação compartilhado com Relatórios"): reaproveita
 * integralmente `POST /relatorios` (`useGerarRelatorio`, mesmo hook do
 * `ModalRelatorio`) com `tipo="detalhado"` (único tipo que já compõe
 * indicadores + as 6 distribuições — o mesmo conjunto que este
 * componente desenha) e `incluir_tabela=false` (o Dashboard não mostra a
 * tabela bruta do recorte, só os cartões/gráficos) — nenhum endpoint
 * novo, nenhuma composição client-side paralela. "Imagem" do § 6.3 é o
 * mesmo artefato PDF (não um formato à parte: `POST /relatorios`, § 7.2,
 * só declara PDF/Excel/CSV — nenhum dos dois documentos homologados
 * define uma exportação de imagem literal); "Impressão" é `window.print()`
 * direto (mesmo mecanismo nativo já usado pelo relatório HTML de
 * Processamento, `app/planilha/relatorio.py::_acoes_relatorio`), sem IPC
 * nenhum — a página já renderizada é o próprio artefato impresso. */
export default function DashboardRecorte({
  filtros,
  indicadores,
  indicadoresCarregando,
  indicadoresErro,
  aoTentarNovamenteIndicadores,
  aoAplicarFiltro,
  aoVoltar,
}: Props) {
  // Chamadas incondicionais, antes de qualquer retorno antecipado abaixo
  // (Regra dos Hooks) — os 6 gráficos dependem só de `filtros`, nunca do
  // estado dos indicadores.
  const distribuicaoPeriodo = useDistribuicoes(filtros, "periodo");
  const distribuicaoServidor = useDistribuicoes(filtros, "servidor");
  const distribuicaoMunicipio = useDistribuicoes(filtros, "municipio");
  const distribuicaoMotivo = useDistribuicoes(filtros, "motivo");
  const distribuicaoSituacao = useDistribuicoes(filtros, "situacao");
  const distribuicaoOrigemDestino = useDistribuicoes(filtros, "origem_destino");
  const { estado: estadoExportacao, gerar: gerarExportacao, tentarNovamente: tentarNovamenteExportacao } = useGerarRelatorio();
  const [erroAoAbrirLocal, setErroAoAbrirLocal] = useState<string | null>(null);

  // Sprint 19.6.5 — `v2-arquitetura-funcional.md` § 6.3: clique numa
  // fatia/barra aplica o valor como filtro adicional (nunca substitui os
  // existentes — `aplicarFiltro` de `useDiarias` já faz merge, não
  // replace) e volta para a área de resultados. Desfazer é o mecanismo já
  // existente de `ChipsFiltroAtivo` — nenhuma UI nova aqui.
  function refinar(parcial: Partial<Record<CampoDeFiltro, string | undefined>>) {
    aoAplicarFiltro(parcial);
    aoVoltar();
  }

  // Sprint 19.6.6 — `tipo="detalhado"` é o único tipo (19.7.1) que já
  // compõe indicadores + as 6 distribuições (o mesmo conjunto que este
  // componente desenha); `incluir_tabela=false` omite a tabela bruta do
  // recorte, que o Dashboard nunca mostra. `incluir_graficos=true` só é
  // válido com `formato="pdf"` (regra do backend, 19.7.2) — mesmo motivo
  // de exportar sempre em PDF aqui. `incluir_inconsistencias=false`:
  // mesmo critério já homologado em `ModalRelatorio.tsx` (sem efeito
  // enquanto `diagnostico.py`, Sprint 19.8, não existir).
  function aoClicarExportarPdf() {
    gerarExportacao({
      filtros: filtrosParaRelatorio(filtros),
      tipo: "detalhado",
      formato: "pdf",
      incluir_indicadores: true,
      incluir_graficos: true,
      incluir_tabela: false,
      incluir_inconsistencias: false,
      modo: "final",
    });
  }

  // "Impressão" (§ 6.3) — `window.print()` direto sobre a própria página
  // já renderizada, mesmo mecanismo nativo já usado pelo relatório HTML
  // de Processamento (`app/planilha/relatorio.py::_acoes_relatorio`);
  // nenhum IPC, nenhuma chamada ao backend.
  function aoClicarImprimir() {
    window.print();
  }

  async function aoClicarAbrirLocal() {
    if (estadoExportacao.fase !== "sucesso") return;
    setErroAoAbrirLocal(null);
    try {
      if (typeof window.api?.abrirArquivo !== "function") {
        throw new Error("Não foi possível abrir a pasta do relatório salvo.");
      }
      await window.api.abrirArquivo(estadoExportacao.resultado.pastaArquivo);
    } catch (erroCaptura) {
      // Mesmo critério de `ModalRelatorio`: "Abrir Local" é uma
      // conveniência opcional após o sucesso já confirmado — uma falha
      // aqui vira um alerta próprio, sem desfazer o sucesso da
      // exportação em si (`estadoExportacao` permanece "sucesso").
      setErroAoAbrirLocal(mensagemAmigavel(erroCaptura, "Não foi possível abrir a pasta do relatório salvo."));
    }
  }

  const botaoVoltar = (
    <Botao variante="secundaria" onClick={aoVoltar}>
      ← Voltar aos resultados
    </Botao>
  );

  const botoesExportar = (
    <>
      <Botao
        variante="secundaria"
        onClick={aoClicarExportarPdf}
        carregando={estadoExportacao.fase === "gerando"}
      >
        <Download aria-hidden="true" className="h-4 w-4" />
        Exportar PDF
      </Botao>
      <Botao variante="secundaria" onClick={aoClicarImprimir}>
        <Printer aria-hidden="true" className="h-4 w-4" />
        Imprimir
      </Botao>
    </>
  );

  const avisoExportacao =
    estadoExportacao.fase === "sucesso" ? (
      <div className="flex flex-wrap items-center gap-3">
        <Alerta variante="sucesso">{MENSAGENS.relatorioSalvoComSucesso}</Alerta>
        <Botao variante="secundaria" onClick={aoClicarAbrirLocal}>
          Abrir Local
        </Botao>
        {erroAoAbrirLocal && <Alerta variante="erro">{erroAoAbrirLocal}</Alerta>}
      </div>
    ) : estadoExportacao.fase === "erro" ? (
      <div className="flex items-center justify-between gap-4">
        <Alerta variante="erro">{estadoExportacao.mensagem}</Alerta>
        <Botao variante="secundaria" onClick={tentarNovamenteExportacao}>
          Tentar novamente
        </Botao>
      </div>
    ) : null;

  // Os filtros continuam visíveis acima deste componente
  // (`PainelFiltrosPrincipal`, sempre renderizado por `CentralAnalitica`) —
  // podem mudar enquanto o Dashboard já está aberto. `indicadores` reflete
  // esse mesmo recorte ao vivo (mesma instância de `useIndicadores` do
  // componente pai), então precisa dos mesmos estados explícitos de
  // carregando/erro que `ResumoRecorte` já trata — nunca um valor do
  // recorte anterior.
  // `indicadoresErro` checado ANTES do fallback de carregando/nulo abaixo:
  // no estado de erro, `useIndicadores` também zera `indicadores` para
  // `null` (mesma limpeza síncrona de `useIndicadores.ts`) — sem esta ordem,
  // uma falha real nunca apareceria, sempre caindo no aviso genérico de
  // "calculando".
  if (indicadoresErro !== null) {
    return (
      <div className="space-y-6">
        {botaoVoltar}
        <div className={`p-5 ${SUPERFICIE_BASE}`}>
          <div className="flex items-center justify-between gap-4">
            <Alerta variante="erro">{indicadoresErro}</Alerta>
            <Botao variante="secundaria" onClick={aoTentarNovamenteIndicadores}>
              Tentar novamente
            </Botao>
          </div>
        </div>
      </div>
    );
  }

  if (indicadoresCarregando || indicadores === null) {
    return (
      <div className="space-y-6">
        {botaoVoltar}
        <div role="status" className={`flex items-center justify-center p-16 ${SUPERFICIE_BASE}`}>
          <p className={TIPOGRAFIA.textoAuxiliar}>Calculando indicadores deste recorte...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        {botaoVoltar}
        {botoesExportar}
      </div>

      {avisoExportacao}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Cartao rotulo="Total de diárias" valor={formatarInteiro(indicadores.total_diarias)} />
        <Cartao rotulo="Total de servidores" valor={formatarInteiro(indicadores.total_servidores)} />
        <Cartao
          rotulo="Valor total"
          valor={formatarMoedaOuTraco(indicadores.valor_total)}
          cor={indicadores.valor_total == null ? "atencao" : "padrao"}
          tamanho="compacto"
        />
        <Cartao
          rotulo="Valor médio"
          valor={formatarMoedaOuTraco(indicadores.valor_medio)}
          cor={indicadores.valor_medio == null ? "atencao" : "padrao"}
          tamanho="compacto"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <SecaoGrafico
          estado={distribuicaoPeriodo}
          renderizar={(distribuicao) => (
            <CartaoGrafico
              titulo="Evolução por período"
              rotuloColunaValor="Diárias"
              vazio={distribuicao.pontos.length === 0}
              interativo
              linhasTabela={distribuicao.pontos.map((ponto) => ({
                rotulo: formatarPeriodo(ponto.rotulo),
                valor: formatarInteiro(ponto.contagem),
              }))}
            >
              {(expandido) => (
                <GraficoBarras
                  orientacao="vertical"
                  cor={COR_MAGNITUDE_CONTAGEM}
                  formatarValor={formatarInteiro}
                  alturaBarra={expandido ? "expandido" : "padrao"}
                  pontos={distribuicao.pontos.map((ponto) => ({ rotulo: formatarPeriodo(ponto.rotulo), valor: ponto.contagem }))}
                  aoClicarPonto={(indice) => refinar(intervaloDoMes(distribuicao.pontos[indice].rotulo))}
                />
              )}
            </CartaoGrafico>
          )}
        />

        <SecaoGrafico
          estado={distribuicaoPeriodo}
          renderizar={(distribuicao) => {
            const comValor = distribuicao.pontos.filter((ponto) => ponto.valor !== null);
            return (
              <CartaoGrafico
                titulo="Valores por período"
                rotuloColunaValor="Valor"
                vazio={comValor.length === 0}
                interativo
                linhasTabela={distribuicao.pontos.map((ponto) => ({
                  rotulo: formatarPeriodo(ponto.rotulo),
                  valor: formatarMoedaOuTraco(ponto.valor),
                }))}
              >
                {(expandido) => (
                  <GraficoBarras
                    orientacao="vertical"
                    cor={COR_MAGNITUDE_VALOR}
                    formatarValor={(valor) => FORMATADOR_MOEDA.format(valor)}
                    alturaBarra={expandido ? "expandido" : "padrao"}
                    pontos={comValor.map((ponto) => ({ rotulo: formatarPeriodo(ponto.rotulo), valor: ponto.valor as number }))}
                    aoClicarPonto={(indice) => refinar(intervaloDoMes(comValor[indice].rotulo))}
                  />
                )}
              </CartaoGrafico>
            );
          }}
        />

        <SecaoGrafico
          estado={distribuicaoServidor}
          renderizar={(distribuicao) => {
            const topServidores = distribuicao.pontos.slice(0, TOPO_RANKING);
            return (
              <CartaoGrafico
                titulo="Ranking de servidores"
                rotuloColunaValor="Diárias"
                vazio={distribuicao.pontos.length === 0}
                interativo
                linhasTabela={distribuicao.pontos.map((ponto) => ({ rotulo: ponto.rotulo, valor: formatarInteiro(ponto.contagem) }))}
              >
                {(expandido) => (
                  <GraficoBarras
                    orientacao="horizontal"
                    cor={COR_MAGNITUDE_CONTAGEM}
                    formatarValor={formatarInteiro}
                    alturaBarra={expandido ? "expandido" : "padrao"}
                    pontos={topServidores.map((ponto) => ({
                      rotulo: ponto.rotulo,
                      valor: ponto.contagem,
                      filtravel: !ehBucketSintetico(ponto.rotulo),
                    }))}
                    aoClicarPonto={(indice) => refinar({ servidor_nome: topServidores[indice].rotulo })}
                  />
                )}
              </CartaoGrafico>
            );
          }}
        />

        <SecaoGrafico
          estado={distribuicaoMunicipio}
          renderizar={(distribuicao) => {
            const topMunicipios = distribuicao.pontos.slice(0, TOPO_RANKING);
            return (
              <CartaoGrafico
                titulo="Ranking de municípios"
                rotuloColunaValor="Diárias"
                vazio={distribuicao.pontos.length === 0}
                interativo
                linhasTabela={distribuicao.pontos.map((ponto) => ({ rotulo: ponto.rotulo, valor: formatarInteiro(ponto.contagem) }))}
              >
                {(expandido) => (
                  <GraficoBarras
                    orientacao="horizontal"
                    cor={COR_MAGNITUDE_CONTAGEM}
                    formatarValor={formatarInteiro}
                    alturaBarra={expandido ? "expandido" : "padrao"}
                    pontos={topMunicipios.map((ponto) => ({
                      rotulo: ponto.rotulo,
                      valor: ponto.contagem,
                      filtravel: !ehBucketSintetico(ponto.rotulo),
                    }))}
                    aoClicarPonto={(indice) => refinar({ municipio: topMunicipios[indice].rotulo })}
                  />
                )}
              </CartaoGrafico>
            );
          }}
        />

        <SecaoGrafico
          estado={distribuicaoMotivo}
          renderizar={(distribuicao) => {
            const segmentos = agruparTop3ComOutros(distribuicao.pontos);
            const aoClicar = (indice: number) => refinar({ motivo: segmentos[indice].rotulo });
            return (
              <CartaoGrafico
                titulo="Distribuição por motivo"
                rotuloColunaValor="Diárias"
                vazio={distribuicao.pontos.length === 0}
                interativo
                legenda={segmentos.map((segmento) => ({ rotulo: segmento.rotulo, cor: segmento.cor, filtravel: segmento.filtravel }))}
                aoClicarLegenda={aoClicar}
                linhasTabela={distribuicao.pontos.map((ponto) => ({ rotulo: ponto.rotulo, valor: formatarInteiro(ponto.contagem) }))}
              >
                {(expandido) => (
                  <GraficoDonut
                    segmentos={segmentos}
                    formatarValor={formatarInteiro}
                    aoClicarSegmento={aoClicar}
                    tamanho={expandido ? "expandido" : "padrao"}
                  />
                )}
              </CartaoGrafico>
            );
          }}
        />

        <SecaoGrafico
          estado={distribuicaoSituacao}
          renderizar={(distribuicao) => {
            const segmentos = agruparTop3ComOutros(distribuicao.pontos);
            const aoClicar = (indice: number) => refinar({ situacao: segmentos[indice].rotulo });
            return (
              <CartaoGrafico
                titulo="Distribuição por situação do servidor"
                rotuloColunaValor="Diárias"
                vazio={distribuicao.pontos.length === 0}
                interativo
                legenda={segmentos.map((segmento) => ({ rotulo: segmento.rotulo, cor: segmento.cor, filtravel: segmento.filtravel }))}
                aoClicarLegenda={aoClicar}
                linhasTabela={distribuicao.pontos.map((ponto) => ({ rotulo: ponto.rotulo, valor: formatarInteiro(ponto.contagem) }))}
              >
                {(expandido) => (
                  <GraficoDonut
                    segmentos={segmentos}
                    formatarValor={formatarInteiro}
                    aoClicarSegmento={aoClicar}
                    tamanho={expandido ? "expandido" : "padrao"}
                  />
                )}
              </CartaoGrafico>
            );
          }}
        />

        {/* Último gráfico real, número ímpar (7) numa grade de 2 colunas —
            ocupa a linha inteira (`md:col-span-2`) para nunca sobrar meia
            linha vazia ao lado, agora que o 8º slot (pendente do DIMCAC)
            foi retirado da interface. */}
        <div className="md:col-span-2">
          <SecaoGrafico
            estado={distribuicaoOrigemDestino}
            renderizar={(distribuicao) => {
              const topPares = distribuicao.pontos.slice(0, TOPO_RANKING);
              return (
                <CartaoGrafico
                  titulo="Origem × Destino (principais pares)"
                  rotuloColunaValor="Diárias"
                  vazio={distribuicao.pontos.length === 0}
                  interativo
                  linhasTabela={distribuicao.pontos.map((ponto) => ({ rotulo: ponto.rotulo, valor: formatarInteiro(ponto.contagem) }))}
                >
                  {(expandido) => (
                    <GraficoBarras
                      orientacao="horizontal"
                      cor={COR_MAGNITUDE_CONTAGEM}
                      formatarValor={formatarInteiro}
                      alturaBarra={expandido ? "expandido" : "padrao"}
                      pontos={topPares.map((ponto) => ({
                        rotulo: ponto.rotulo,
                        valor: ponto.contagem,
                        filtravel: !ehParOrigemDestinoSintetico(ponto.rotulo),
                      }))}
                      aoClicarPonto={(indice) => {
                        const [origem, destino] = topPares[indice].rotulo.split(" → ");
                        refinar({ origem, destino });
                      }}
                    />
                  )}
                </CartaoGrafico>
              );
            }}
          />
        </div>
      </div>
    </div>
  );
}
