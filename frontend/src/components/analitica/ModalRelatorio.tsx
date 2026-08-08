import { FolderOpen, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useGerarRelatorio } from "../../hooks/useGerarRelatorio";
import { formatarDataBr, formatarPeriodoBr } from "../../lib/datas";
import { MENSAGENS, mensagemAmigavel } from "../../lib/mensagens";
import { filtrosParaRelatorio } from "../../lib/parametrosRelatorio";
import { FOCO_ANEL, PAINEL_MODAL } from "../../theme/estilos";
import { TIPOGRAFIA } from "../../theme/tipografia";
import type {
  FormatoRelatorio,
  ParametrosPesquisaDiariasQuery,
  ParametrosRelatorioQuery,
  TipoRelatorio,
} from "../../types/analitica";
import Alerta from "../ui/Alerta";
import Botao from "../ui/Botao";

interface Props {
  aberto: boolean;
  /** Filtros do recorte atual — nunca reconfigurados nesta janela
   * ("o recorte nunca precisa ser reconfigurado aqui", `v2-demonstracao-
   * visual.md` § 7), só tipo/formato/conteúdo. */
  filtros: ParametrosPesquisaDiariasQuery;
  totalRegistros: number;
  aoFechar: () => void;
}

interface OpcaoTipo {
  valor: TipoRelatorio;
  rotulo: string;
  descricao: string;
}

// `v2-arquitetura-funcional.md` § 7.1 — só os 6 tipos com regra de negócio
// homologada e endpoint funcional hoje. Decisão de produto 2026-08-06
// (ver `v2-arquitetura-funcional.md` § 7.1, bloco "Decisão de produto —
// controles retirados da interface"): "Inconsistências"/"Qualidade dos
// dados" foram retirados da lista — dependem do catálogo de diagnósticos
// (`diagnostico.py`) para compor uma seção própria no relatório, que
// `analitica_service._construir_secoes`/`compor_relatorio` ainda não
// implementam (o backend continua recusando os dois tipos com `422`,
// `TipoRelatorioIndisponivel`). Voltam a aparecer aqui quando essa
// composição existir — nunca antes, mesmo desabilitados.
const OPCOES_TIPO: OpcaoTipo[] = [
  { valor: "executivo", rotulo: "Executivo", descricao: "resumo de 1 página" },
  { valor: "detalhado", rotulo: "Detalhado", descricao: "todos os indicadores, gráficos e a tabela" },
  { valor: "financeiro", rotulo: "Financeiro", descricao: "foco em valores, sem dados cadastrais" },
  { valor: "por_servidor", rotulo: "Por servidor", descricao: "agrupado por servidor" },
  { valor: "por_municipio", rotulo: "Por município", descricao: "agrupado por município" },
  { valor: "por_situacao", rotulo: "Por situação", descricao: "agrupado por situação do servidor" },
];

const OPCOES_FORMATO: { valor: FormatoRelatorio; rotulo: string }[] = [
  { valor: "pdf", rotulo: "PDF" },
  { valor: "excel", rotulo: "Excel (.xlsx)" },
  { valor: "csv", rotulo: "CSV" },
];

const ROTULO_TIPO: Record<TipoRelatorio, string> = Object.fromEntries(
  OPCOES_TIPO.map((opcao) => [opcao.valor, opcao.rotulo]),
) as Record<TipoRelatorio, string>;

const ROTULO_FORMATO: Record<FormatoRelatorio, string> = Object.fromEntries(
  OPCOES_FORMATO.map((opcao) => [opcao.valor, opcao.rotulo]),
) as Record<FormatoRelatorio, string>;

/** `YYYY-MM-DDTHH:MM:SS` → `"dd/mm/aaaa HH:MM"` — mesma extração de
 * hora/minuto já usada em `IndicadorSincronizacao.tsx::formatarHorario`,
 * combinada com `formatarDataBr` (data). Entrada malformada nunca lança —
 * devolve o valor original, mesmo critério de `formatarDataBr`. */
function formatarDataHora(isoSemFuso: string): string {
  const data = new Date(isoSemFuso);
  if (Number.isNaN(data.getTime())) return isoSemFuso;
  const hora = String(data.getHours()).padStart(2, "0");
  const minuto = String(data.getMinutes()).padStart(2, "0");
  return `${formatarDataBr(isoSemFuso)} ${hora}:${minuto}`;
}

/** Sprint 19.7.3 (fase "configurando") + 19.7.4 (demais fases: pré-
 * visualização, progresso, sucesso, erro — § 11.2). Estados visuais das
 * fases além de "configurando" seguem `v2-demonstracao-visual.md` § 7
 * (pré-visualização) + § 9/§ 10 (progresso/erro, referenciados pelo
 * próprio § 7 como os padrões genéricos já homologados de "Fluxo
 * esperado do usuário": "acompanha progresso (§ 9)... sucesso... ou erro
 * (§ 10)") — nunca a referência a "§ 6" (Dashboard) que consta, por
 * engano de digitação, na entrada 19.7.4 de `v2-plano-tecnico.md` § 18
 * (Dashboard não tem nenhuma relação com o fluxo de relatório; a seção
 * correta e efetivamente usada aqui é a § 7, que já tem os mockups de
 * "janela de configuração" e "pré-visualização e confirmação"). */
export default function ModalRelatorio({ aberto, filtros, totalRegistros, aoFechar }: Props) {
  const { estado, preVisualizar, voltar, gerar, tentarNovamente, cancelar } = useGerarRelatorio();

  const [tipo, setTipo] = useState<TipoRelatorio>("executivo");
  const [formato, setFormato] = useState<FormatoRelatorio>("pdf");
  const [incluirIndicadores, setIncluirIndicadores] = useState(true);
  const [incluirGraficos, setIncluirGraficos] = useState(true);
  const [incluirTabela, setIncluirTabela] = useState(true);
  const [erroAoAbrir, setErroAoAbrir] = useState<string | null>(null);

  // Auditoria 19.9 (acessibilidade — navegação por teclado em modais):
  // "Esc" fecha o modal, mesmo efeito do botão "Fechar" (X) — que já é
  // clicável em qualquer fase, inclusive "gerando". Sem escutar quando o
  // modal está fechado (`aberto=false`), para não interferir com o resto
  // da tela.
  useEffect(() => {
    if (!aberto) return;
    function aoTeclar(evento: KeyboardEvent) {
      if (evento.key === "Escape") aoFechar();
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [aberto, aoFechar]);

  if (!aberto) return null;

  function aoMudarFormato(novoFormato: FormatoRelatorio) {
    setFormato(novoFormato);
    // "Gráficos disponíveis apenas para PDF" é a regra real do backend
    // (`schemas.analitica.ParametrosRelatorioQuery._graficos_apenas_em_pdf`,
    // Sprint 19.7.2, `422` se violada) — nunca deixado marcado numa
    // combinação que o backend recusaria.
    if (novoFormato !== "pdf") setIncluirGraficos(false);
  }

  function montarParametros(modo: ParametrosRelatorioQuery["modo"]): ParametrosRelatorioQuery {
    return {
      filtros: filtrosParaRelatorio(filtros),
      tipo,
      formato,
      incluir_indicadores: incluirIndicadores,
      incluir_graficos: incluirGraficos,
      incluir_tabela: incluirTabela,
      // Sempre `false` — sem UI para ligar/desligar (`diagnostico.py` ainda
      // não compõe uma seção "Inconsistências" em nenhum tipo de relatório,
      // `analitica_service._construir_secoes`); nenhum efeito no artefato
      // hoje, mesmo que fosse `true`.
      incluir_inconsistencias: false,
      modo,
    };
  }

  async function abrirCaminho(caminho: string, mensagemFalha: string) {
    setErroAoAbrir(null);
    try {
      if (typeof window.api?.abrirArquivo !== "function") {
        throw new Error(mensagemFalha);
      }
      await window.api.abrirArquivo(caminho);
    } catch (erroCaptura) {
      setErroAoAbrir(mensagemAmigavel(erroCaptura, mensagemFalha));
    }
  }

  const resumoPeriodo =
    filtros.periodo_inicial && filtros.periodo_final
      ? formatarPeriodoBr(filtros.periodo_inicial, filtros.periodo_final)
      : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-relatorio-titulo"
        className={`w-full max-w-2xl p-8 ${PAINEL_MODAL}`}
      >
        <div className="flex items-center justify-between gap-4">
          <h2 id="modal-relatorio-titulo" className={TIPOGRAFIA.titulo}>
            Gerar relatório
          </h2>
          <button
            type="button"
            aria-label="Fechar"
            onClick={aoFechar}
            autoFocus
            className="rounded-full p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-slate-200"
          >
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>

        <p className={`mt-1 ${TIPOGRAFIA.textoAuxiliar}`}>
          Recorte atual: {totalRegistros} registro{totalRegistros === 1 ? "" : "s"}
          {resumoPeriodo ? ` · ${resumoPeriodo}` : ""}
        </p>

        {estado.fase === "configurando" && (
          <div className="mt-6 space-y-6">
            {estado.erro && <Alerta variante="erro">{estado.erro}</Alerta>}

            <fieldset>
              <legend id="modal-relatorio-tipo-legenda" className={TIPOGRAFIA.subtitulo}>
                Tipo de relatório
              </legend>
              <div role="radiogroup" aria-labelledby="modal-relatorio-tipo-legenda" className="mt-2 space-y-2">
                {OPCOES_TIPO.map((opcao) => (
                  <label key={opcao.valor} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="modal-relatorio-tipo"
                      value={opcao.valor}
                      checked={tipo === opcao.valor}
                      onChange={() => setTipo(opcao.valor)}
                      className={FOCO_ANEL}
                    />
                    <span className={TIPOGRAFIA.texto}>
                      {opcao.rotulo}
                      {opcao.descricao && <span className={TIPOGRAFIA.textoAuxiliar}> — {opcao.descricao}</span>}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend id="modal-relatorio-formato-legenda" className={TIPOGRAFIA.subtitulo}>
                Formato
              </legend>
              <div role="radiogroup" aria-labelledby="modal-relatorio-formato-legenda" className="mt-2 flex gap-5">
                {OPCOES_FORMATO.map((opcao) => (
                  <label key={opcao.valor} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="modal-relatorio-formato"
                      value={opcao.valor}
                      checked={formato === opcao.valor}
                      onChange={() => aoMudarFormato(opcao.valor)}
                      className={FOCO_ANEL}
                    />
                    <span className={TIPOGRAFIA.texto}>{opcao.rotulo}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend className={TIPOGRAFIA.subtitulo}>Conteúdo a incluir</legend>
              <div className="mt-2 flex flex-wrap gap-5">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={incluirIndicadores}
                    onChange={(evento) => setIncluirIndicadores(evento.target.checked)}
                    className={FOCO_ANEL}
                  />
                  <span className={TIPOGRAFIA.texto}>Indicadores</span>
                </label>
                <label className={`flex items-center gap-2 ${formato === "pdf" ? "" : "opacity-60"}`}>
                  <input
                    type="checkbox"
                    checked={incluirGraficos}
                    disabled={formato !== "pdf"}
                    onChange={(evento) => setIncluirGraficos(evento.target.checked)}
                    aria-describedby="modal-relatorio-graficos-nota"
                    className={FOCO_ANEL}
                  />
                  <span className={TIPOGRAFIA.texto}>Gráficos*</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={incluirTabela}
                    onChange={(evento) => setIncluirTabela(evento.target.checked)}
                    className={FOCO_ANEL}
                  />
                  <span className={TIPOGRAFIA.texto}>Tabela completa</span>
                </label>
              </div>
              <p id="modal-relatorio-graficos-nota" className={`mt-1.5 ${TIPOGRAFIA.textoAuxiliar}`}>
                *Gráficos disponíveis apenas para PDF
              </p>
            </fieldset>

            <div className="flex justify-end gap-3">
              <Botao variante="secundaria" onClick={aoFechar}>
                Cancelar
              </Botao>
              <Botao variante="secundaria" onClick={() => preVisualizar(montarParametros("previsualizacao"))}>
                Pré-visualizar
              </Botao>
            </div>
          </div>
        )}

        {estado.fase === "pre-visualizando" && (
          <div className="mt-6 space-y-4">
            <h3 className={TIPOGRAFIA.subtitulo}>
              Pré-visualização — Relatório {ROTULO_TIPO[tipo]} ({ROTULO_FORMATO[formato]})
            </h3>
            {/* Sprint 19.7.4 — `POST /relatorios` (§ 12.6, já homologado
                nas Sprints 19.7.1/19.7.2) devolve só `caminho_arquivo_
                temporario`/`nome_sugerido`/`sincronizado_em`, nunca os
                indicadores/gráficos em si — o mockup ASCII de
                `v2-demonstracao-visual.md` § 7 ilustra uma "grade de KPIs
                em miniatura" que exigiria estender esse contrato já
                homologado (fora do escopo desta micro-sprint, que só
                estende `ModalRelatorio.tsx`). Em vez de simular uma
                miniatura com dado que não existe aqui, "Abrir para
                conferir" mostra o artefato real já gerado — equivalente
                funcional mais honesto do mesmo objetivo (deixar o
                usuário ver antes de confirmar), usando só o mecanismo já
                existente `window.api.abrirArquivo`. */}
            <div className={`rounded-lg border border-white/10 bg-white/[0.02] p-4 ${TIPOGRAFIA.texto}`}>
              <p>{estado.previa.nomeSugerido}</p>
              <p className={`mt-1 ${TIPOGRAFIA.textoAuxiliar}`}>
                Sincronizado às {formatarDataHora(estado.previa.sincronizadoEm)}
              </p>
            </div>

            {erroAoAbrir && <Alerta variante="erro">{erroAoAbrir}</Alerta>}

            <Botao
              variante="secundaria"
              onClick={() =>
                abrirCaminho(estado.previa.caminhoArquivoTemporario, "Não foi possível abrir o arquivo para conferir.")
              }
            >
              <FolderOpen aria-hidden="true" className="h-4 w-4" />
              Abrir para conferir
            </Botao>

            <div className="flex justify-end gap-3">
              <Botao variante="secundaria" onClick={voltar}>
                ← Voltar
              </Botao>
              <Botao variante="primaria" onClick={() => gerar(montarParametros("final"))}>
                Gerar relatório
              </Botao>
            </div>
          </div>
        )}

        {estado.fase === "gerando" && (
          // Sem barra determinística (%) — `POST /relatorios` é uma única
          // chamada síncrona, sem etapas intermediárias reportáveis; regra
          // já registrada em `v2-demonstracao-visual.md` § 9 ("indeterminada
          // 'Calculando...' quando não há como medir"), mesmo padrão de
          // `DashboardRecorte`/"Calculando indicadores deste recorte...".
          <div role="status" className={`mt-6 ${TIPOGRAFIA.textoAuxiliar}`}>
            Gerando relatório...
          </div>
        )}

        {estado.fase === "sucesso" && (
          <div className="mt-6 space-y-4">
            <Alerta variante="sucesso">{MENSAGENS.relatorioSalvoComSucesso}</Alerta>
            {erroAoAbrir && <Alerta variante="erro">{erroAoAbrir}</Alerta>}
            <div className="flex flex-wrap items-center gap-3">
              <Botao
                variante="secundaria"
                onClick={() => abrirCaminho(estado.resultado.pastaArquivo, "Não foi possível abrir a pasta do relatório salvo.")}
              >
                <FolderOpen aria-hidden="true" className="h-4 w-4" />
                Abrir Local
              </Botao>
              <Botao variante="primaria" onClick={aoFechar}>
                Concluir
              </Botao>
            </div>
          </div>
        )}

        {estado.fase === "erro" && (
          <div className="mt-6 space-y-4">
            <Alerta variante="erro">{estado.mensagem}</Alerta>
            <div className="flex justify-end gap-3">
              <Botao variante="secundaria" onClick={cancelar}>
                Cancelar
              </Botao>
              <Botao variante="primaria" onClick={tentarNovamente}>
                Tentar novamente
              </Botao>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
