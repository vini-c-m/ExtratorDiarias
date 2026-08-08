import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Inbox, Search } from "lucide-react";
import type { KeyboardEvent } from "react";
import ConfiguracaoColunas from "./ConfiguracaoColunas";
import Alerta from "../ui/Alerta";
import Badge from "../ui/Badge";
import Botao from "../ui/Botao";
import { formatarPeriodoBr } from "../../lib/datas";
import { algumFiltroAplicado } from "../../hooks/useDiarias";
import { COLUNAS_OPCIONAIS_DISPONIVEIS, useColunasTabela, type ColunaOpcional } from "../../hooks/useColunasTabela";
import { CORES_STATUS } from "../../theme/cores";
import { ALTURA_LISTA_ROLAVEL, FOCO_ANEL, SCROLL_FINO, SUPERFICIE_BASE } from "../../theme/estilos";
import { TIPOGRAFIA } from "../../theme/tipografia";
import type {
  CampoOrdenacao,
  DiariaResumoResposta,
  ParametrosPesquisaDiariasQuery,
  ResultadoPesquisaResposta,
} from "../../types/analitica";

interface Props {
  carregando: boolean;
  erro: string | null;
  resultado: ResultadoPesquisaResposta | null;
  filtros: ParametrosPesquisaDiariasQuery;
  onTentarNovamente: () => void;
  onOrdenarPor: (campo: CampoOrdenacao) => void;
  onIrParaPagina: (pagina: number) => void;
  onSelecionarLinha: (sei: string) => void;
}

const COLUNAS: { campo: CampoOrdenacao; rotulo: string }[] = [
  { campo: "sei", rotulo: "SEI" },
  { campo: "servidor", rotulo: "Servidor" },
  { campo: "periodo", rotulo: "Período" },
  { campo: "destino", rotulo: "Destino" },
  { campo: "valor", rotulo: "Valor" },
];

const FORMATADOR_MOEDA = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function formatarValor(valor: number): string {
  return FORMATADOR_MOEDA.format(valor);
}

const ROTULO_ORDENACAO: Record<CampoOrdenacao, string> = {
  sei: "SEI",
  periodo: "período",
  servidor: "servidor",
  destino: "destino",
  valor: "valor",
};

const ROTULO_COLUNA_OPCIONAL: Record<ColunaOpcional, string> = {
  motivo: "Motivo",
  matricula: "Matrícula",
  origem: "Origem",
  trecho: "Trecho completo",
  situacao: "Situação do servidor",
  cpf: "CPF (mascarado)",
  doc_origem: "Documento de origem",
  transporte: "Transporte",
  categoria_funcional: "Categoria (Membro/Servidor)",
};

/** Sprint 20 (2026-08-05) — nunca vermelho ("erro"/"critico"): a
 * classificação em si não é um veredito de conformidade (mesma regra já
 * aplicada ao veredito da Central de Conferência), só uma categoria.
 * "aviso" (âmbar) para `NAO_IDENTIFICADO` segue o mesmo padrão de
 * `CelulaVazia` — dado ausente, não uma falha. */
const VARIANTE_CATEGORIA_FUNCIONAL: Record<string, "info" | "neutro" | "aviso"> = {
  MEMBRO: "info",
  SERVIDOR: "neutro",
  NAO_IDENTIFICADO: "aviso",
};

const ROTULO_CATEGORIA_FUNCIONAL: Record<string, string> = {
  MEMBRO: "Membro",
  SERVIDOR: "Servidor",
  NAO_IDENTIFICADO: "Não identificado",
};

/** Sprint 19.5.7 — vazio nunca é apresentado silenciosamente: mesmo
 * travessão de sempre, mas destacado em âmbar (`CORES_STATUS.aviso`,
 * já existente — nenhuma cor nova). Nunca vermelho (RN-08 herdada — vermelho
 * é reservado a falha técnica, não a um dado de negócio ausente). */
function CelulaVazia() {
  return <span className={CORES_STATUS.aviso.texto}>—</span>;
}

/** Sprint 19.5.7 — texto truncado com tooltip acessível
 * (`v2-wireframes.md` § 3.2): `title` cobre o hover do mouse; `aria-describedby`
 * associa um texto irmão `sr-only` (mesmo padrão já usado em
 * `FiltrosRapidos.tsx`) com o motivo completo, lido por leitor de tela em
 * modo de navegação por conteúdo — sem exigir um segundo ponto de tabulação
 * dentro de uma linha que já é focável e ativável (Enter/Espaço já abre o
 * detalhamento com o texto completo, sem truncamento). */
function CelulaMotivo({ motivo, sei }: { motivo: string; sei: string }) {
  if (!motivo) return <CelulaVazia />;
  const idDescricao = `motivo-completo-${sei}`;
  return (
    <>
      <span className="block max-w-[220px] truncate" title={motivo} aria-describedby={idDescricao}>
        {motivo}
      </span>
      <span id={idDescricao} className="sr-only">
        {motivo}
      </span>
    </>
  );
}

/** Sprint 19.5.7.1 — "Trecho completo" nunca vem pronto da API (nenhum
 * campo `trecho` no contrato, de propósito — ver `types/analitica.ts`).
 * Composto aqui a partir de `origem`+`destino`. Incompleto (só um dos dois
 * presente) conta como vazio — nunca produz "None - destino"/"origem -
 * null"/um separador isolado: um trecho pela metade não é um trecho
 * completo, é a mesma classe de dado ausente que os demais campos vazios. */
function CelulaTrecho({ origem, destino }: { origem: string | null | undefined; destino: string | null }) {
  if (!origem || !destino) return <CelulaVazia />;
  return (
    <>
      {origem} - {destino}
    </>
  );
}

/** Sprint 19.5.7.1 — um só ponto de decisão por coluna opcional, para a
 * lista de `<td>`s abaixo não crescer numa cadeia de ternários. `cpf`
 * sempre lê `item.cpf_mascarado` — nunca um campo de CPF completo, que
 * nem chega a existir em `DiariaResumoResposta` (decisão vinculante,
 * `ui-arquitetura.md` § 0.7). */
function renderizarCelulaOpcional(coluna: ColunaOpcional, item: DiariaResumoResposta) {
  switch (coluna) {
    case "motivo":
      return <CelulaMotivo motivo={item.motivo} sei={item.sei} />;
    case "matricula":
      return item.servidor?.matricula ?? <CelulaVazia />;
    case "origem":
      return item.origem ?? <CelulaVazia />;
    case "trecho":
      return <CelulaTrecho origem={item.origem} destino={item.destino} />;
    case "situacao":
      return item.servidor?.situacao ?? <CelulaVazia />;
    case "cpf":
      return item.cpf_mascarado ?? <CelulaVazia />;
    case "doc_origem":
      return item.doc_origem || <CelulaVazia />;
    case "transporte":
      return item.transporte ?? <CelulaVazia />;
    case "categoria_funcional": {
      const categoria = item.categoria_funcional ?? "NAO_IDENTIFICADO";
      return (
        <Badge variante={VARIANTE_CATEGORIA_FUNCIONAL[categoria]}>
          {ROTULO_CATEGORIA_FUNCIONAL[categoria]}
        </Badge>
      );
    }
  }
}

/** Gera a lista de páginas exibidas no rodapé ("‹ 1 2 3 … 50 ›",
 * `ui-wireframes.md` § 2) — sempre mostra as duas primeiras, as duas
 * últimas e uma janela ao redor da página atual, com "…" nas lacunas. */
function construirPaginas(atual: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, indice) => indice + 1);

  const paginasRelevantes = [...new Set([1, 2, atual - 1, atual, atual + 1, total - 1, total])]
    .filter((pagina) => pagina >= 1 && pagina <= total)
    .sort((a, b) => a - b);

  const paginas: (number | "…")[] = [];
  let anterior = 0;
  for (const pagina of paginasRelevantes) {
    if (pagina - anterior > 1) paginas.push("…");
    paginas.push(pagina);
    anterior = pagina;
  }
  return paginas;
}

// Sprint 18.5.1 — correção NC3 da auditoria: o esqueleto continua
// `aria-hidden` (é decoração pura), mas ganha um texto irmão `sr-only` com
// `role="status"` — mesmo recurso já usado em `BotaoArquivo.tsx` — para o
// carregamento não ser completamente silencioso para leitor de tela.
function Esqueleto() {
  return (
    <div>
      <p role="status" className="sr-only">
        Carregando resultados...
      </p>
      <div className={`overflow-hidden ${SUPERFICIE_BASE}`} aria-hidden="true">
        <div className="animate-pulse divide-y divide-white/5">
          {Array.from({ length: 6 }, (_, indice) => (
            <div key={indice} className="grid grid-cols-5 gap-4 px-5 py-4">
              {COLUNAS.map((coluna) => (
                <div key={coluna.campo} className="h-4 rounded bg-white/10" />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Sprint 18.5 — dono de todos os estados visuais da área de resultados
// (carregando/erro/vazio/sem-resultados/populada, `ui-arquitetura.md` § 8 /
// `ui-wireframes.md` § 5): mantém `AbaPesquisa` simples (sempre renderiza
// `<TabelaDiarias .../>`, nunca decide qual estado mostrar por fora).
// Paginação sempre no servidor — nunca recebe mais linhas que uma página.
export default function TabelaDiarias({
  carregando,
  erro,
  resultado,
  filtros,
  onTentarNovamente,
  onOrdenarPor,
  onIrParaPagina,
  onSelecionarLinha,
}: Props) {
  // Chamado incondicionalmente, antes de qualquer retorno antecipado
  // abaixo (Regra dos Hooks) — preferência de colunas é local a esta
  // tabela, não depende de `carregando`/`erro`/`resultado`.
  const { colunasAtivas, alternarColuna } = useColunasTabela();

  if (carregando) return <Esqueleto />;

  if (erro !== null) {
    return (
      <div className="flex items-center justify-between gap-4">
        <Alerta variante="erro">{erro}</Alerta>
        <Botao variante="secundaria" onClick={onTentarNovamente}>
          Tentar novamente
        </Botao>
      </div>
    );
  }

  if (resultado === null) return null;

  if (resultado.itens.length === 0) {
    const filtroAtivo = algumFiltroAplicado(filtros);
    return (
      <div role="status" className={`flex flex-col items-center gap-3 px-6 py-16 text-center ${SUPERFICIE_BASE}`}>
        {filtroAtivo ? (
          <>
            <Search aria-hidden="true" className="h-8 w-8 text-slate-400" />
            <p className={TIPOGRAFIA.textoForte}>
              {filtros.q ? `Nada encontrado para "${filtros.q}".` : "Nada encontrado para os filtros aplicados."}
            </p>
            <p className={TIPOGRAFIA.texto}>Confira a grafia ou tente outro termo de busca.</p>
          </>
        ) : (
          <>
            <Inbox aria-hidden="true" className="h-8 w-8 text-slate-400" />
            <p className={TIPOGRAFIA.textoForte}>Ainda não há dados para pesquisar.</p>
            <p className={TIPOGRAFIA.texto}>
              Assim que o primeiro processamento for concluído, os registros aparecem aqui.
            </p>
          </>
        )}
      </div>
    );
  }

  const { itens, paginacao } = resultado;
  const paginas = construirPaginas(paginacao.pagina_atual, paginacao.total_paginas);
  const colunasOpcionaisAtivas = COLUNAS_OPCIONAIS_DISPONIVEIS.filter((coluna) => colunasAtivas.has(coluna));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className={TIPOGRAFIA.textoAuxiliar}>
          {paginacao.total_itens.toLocaleString("pt-BR")} resultado{paginacao.total_itens === 1 ? "" : "s"} ·
          ordenados por {ROTULO_ORDENACAO[filtros.ordenar_por ?? "periodo"]} (
          {filtros.ordem === "asc" ? "mais antigo primeiro" : "mais recente primeiro"})
        </p>
        <ConfiguracaoColunas colunasAtivas={colunasAtivas} onAlternarColuna={alternarColuna} />
      </div>

      <div className={`overflow-hidden ${SUPERFICIE_BASE}`}>
        <div className={`overflow-auto ${ALTURA_LISTA_ROLAVEL} ${SCROLL_FINO}`}>
          <table className="w-full border-collapse text-left text-sm">
            <thead className="sticky top-0 z-10 border-b border-white/10 bg-[#0b1120]/95 text-xs font-semibold uppercase tracking-wider text-slate-300 backdrop-blur-sm">
              <tr>
                {COLUNAS.map((coluna) => {
                  const ativa = filtros.ordenar_por === coluna.campo;
                  const IconeOrdenacao = ativa && filtros.ordem === "asc" ? ArrowUp : ArrowDown;
                  return (
                    <th
                      key={coluna.campo}
                      aria-sort={ativa ? (filtros.ordem === "asc" ? "ascending" : "descending") : "none"}
                      className="px-5 py-3.5"
                    >
                      <button
                        type="button"
                        onClick={() => onOrdenarPor(coluna.campo)}
                        className="inline-flex items-center gap-1 hover:text-slate-100"
                      >
                        {coluna.rotulo}
                        {ativa && <IconeOrdenacao aria-hidden="true" className="h-3.5 w-3.5" />}
                      </button>
                    </th>
                  );
                })}
                {/* Colunas opcionais nunca têm `aria-sort`/botão de ordenação
                    — `CampoOrdenacao` (backend) não as inclui. */}
                {colunasOpcionaisAtivas.map((coluna) => (
                  <th key={coluna} className="px-5 py-3.5">
                    {ROTULO_COLUNA_OPCIONAL[coluna]}
                  </th>
                ))}
                <th className="px-5 py-3.5" aria-hidden="true" />
              </tr>
            </thead>
            <tbody>
              {itens.map((item: DiariaResumoResposta) => (
                <tr
                  key={item.sei}
                  tabIndex={0}
                  aria-label={`Ver detalhamento da diária ${item.sei}`}
                  onClick={() => onSelecionarLinha(item.sei)}
                  onKeyDown={(evento: KeyboardEvent<HTMLTableRowElement>) => {
                    if (evento.key !== "Enter" && evento.key !== " ") return;
                    evento.preventDefault();
                    onSelecionarLinha(item.sei);
                  }}
                  className={`cursor-pointer border-t border-white/5 text-slate-300 transition-colors even:bg-white/[0.02] hover:bg-white/[0.05] ${FOCO_ANEL}`}
                >
                  <td className="px-5 py-3.5">{item.sei}</td>
                  <td className="px-5 py-3.5">{item.servidor?.nome ?? <CelulaVazia />}</td>
                  <td className="px-5 py-3.5">{formatarPeriodoBr(item.periodo.inicial, item.periodo.final)}</td>
                  <td className="px-5 py-3.5">{item.destino ?? <CelulaVazia />}</td>
                  <td className="px-5 py-3.5">
                    {item.valor_total_diarias === null ? (
                      <CelulaVazia />
                    ) : (
                      formatarValor(item.valor_total_diarias)
                    )}
                  </td>
                  {colunasOpcionaisAtivas.map((coluna) => (
                    <td key={coluna} className="px-5 py-3.5">
                      {renderizarCelulaOpcional(coluna, item)}
                    </td>
                  ))}
                  <td className="px-5 py-3.5 text-slate-500">
                    <ChevronRight aria-hidden="true" className="h-4 w-4" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {paginacao.total_paginas > 1 && (
        <nav aria-label="Paginação de resultados" className="flex items-center justify-center gap-1">
          <button
            type="button"
            aria-label="Página anterior"
            disabled={paginacao.pagina_atual <= 1}
            onClick={() => onIrParaPagina(paginacao.pagina_atual - 1)}
            className="rounded-lg p-1.5 text-slate-300 hover:bg-white/5 disabled:pointer-events-none disabled:opacity-30"
          >
            <ChevronLeft aria-hidden="true" className="h-4 w-4" />
          </button>

          {paginas.map((pagina, indice) =>
            pagina === "…" ? (
              <span key={`reticencias-${indice}`} className="px-2 text-slate-500">
                …
              </span>
            ) : (
              <button
                key={pagina}
                type="button"
                aria-current={pagina === paginacao.pagina_atual ? "page" : undefined}
                onClick={() => onIrParaPagina(pagina)}
                className={`h-8 min-w-8 rounded-lg px-2 text-sm ${
                  pagina === paginacao.pagina_atual
                    ? "bg-cyan-500/15 font-semibold text-cyan-400"
                    : "text-slate-300 hover:bg-white/5"
                }`}
              >
                {pagina}
              </button>
            ),
          )}

          <button
            type="button"
            aria-label="Próxima página"
            disabled={paginacao.pagina_atual >= paginacao.total_paginas}
            onClick={() => onIrParaPagina(paginacao.pagina_atual + 1)}
            className="rounded-lg p-1.5 text-slate-300 hover:bg-white/5 disabled:pointer-events-none disabled:opacity-30"
          >
            <ChevronRight aria-hidden="true" className="h-4 w-4" />
          </button>
        </nav>
      )}
    </div>
  );
}
