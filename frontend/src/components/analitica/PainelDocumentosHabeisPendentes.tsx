import { useState } from "react";
import { CORES_STATUS } from "../../theme/cores";
import { DESABILITADO, FOCO_ANEL, PRESSIONAR, SUPERFICIE_BASE } from "../../theme/estilos";
import { TIPOGRAFIA } from "../../theme/tipografia";
import type { DocumentoHabilPendenteResposta, DocumentosHabeisPendentesResposta, SituacaoDocumentoHabilPendente } from "../../types/analitica";
import { formatarDataBr, formatarPeriodoBr } from "../../lib/datas";
import Alerta from "../ui/Alerta";
import Badge from "../ui/Badge";
import Botao from "../ui/Botao";

interface Props {
  resultado: DocumentosHabeisPendentesResposta | null;
  carregando: boolean;
  erro: string | null;
  aoTentarNovamente: () => void;
  aoVoltar: () => void;
  /** Sprint 19.8.4 (herdado) — "Ver detalhes" abre o mesmo painel de
   * detalhamento já conhecido (`PainelDetalhamentoDiaria`), reaproveitado,
   * nunca uma tela nova; quem monta os dois (`CentralAnalitica.tsx`) decide
   * como conectar este callback ao `sei` selecionado. */
  aoSelecionarRegistro: (sei: string) => void;
  /** Correção de foco (2026-08-05) — quando a tela é aberta a partir do
   * aviso "data de liberação atingida" da Central Analítica ("filtrar a
   * lista para Revisão manual necessária"), o filtro interno já nasce
   * aplicado; sem isso, nasce em "Todos" (padrão). */
  filtroInicial?: SituacaoDocumentoHabilPendente;
}

type FiltroInterno = "todos" | SituacaoDocumentoHabilPendente;

const ROTULO_POR_SITUACAO: Record<SituacaoDocumentoHabilPendente, string> = {
  aguardando_liberacao: "Aguardando liberação",
  revisao_manual_necessaria: "Revisão manual necessária",
};

// RN-08 — "aguardando liberação" é um estado informativo/esperado (nunca
// âmbar/vermelho); "revisão manual necessária" é atenção em âmbar; vermelho
// fica reservado exclusivamente a falha técnica real (a própria tela de
// erro, abaixo, usa `Alerta variante="erro"`, nunca uma linha da lista).
const VARIANTE_POR_SITUACAO: Record<SituacaoDocumentoHabilPendente, "info" | "aviso"> = {
  aguardando_liberacao: "info",
  revisao_manual_necessaria: "aviso",
};

const OPCOES_FILTRO: { rotulo: string; valor: FiltroInterno }[] = [
  { rotulo: "Todos", valor: "todos" },
  { rotulo: "Aguardando liberação", valor: "aguardando_liberacao" },
  { rotulo: "Revisão manual necessária", valor: "revisao_manual_necessaria" },
];

function textoDias(registro: DocumentoHabilPendenteResposta): string {
  if (registro.situacao === "aguardando_liberacao") {
    return registro.texto_contagem ?? "—";
  }
  const dias = registro.dias_atraso ?? 0;
  return `Atraso de ${dias} dia${dias === 1 ? "" : "s"} desde ${formatarDataBr(registro.data_liberacao_prevista)}`;
}

export default function PainelDocumentosHabeisPendentes({
  resultado,
  carregando,
  erro,
  aoTentarNovamente,
  aoVoltar,
  aoSelecionarRegistro,
  filtroInicial,
}: Props) {
  const [filtro, setFiltro] = useState<FiltroInterno>(filtroInicial ?? "todos");

  const botaoVoltar = (
    <Botao variante="secundaria" onClick={aoVoltar}>
      ← Voltar aos resultados
    </Botao>
  );

  if (erro !== null) {
    return (
      <div className="space-y-6">
        {botaoVoltar}
        <div className={`p-5 ${SUPERFICIE_BASE}`}>
          <div className="flex items-center justify-between gap-4">
            <Alerta variante="erro">{erro}</Alerta>
            <Botao variante="secundaria" onClick={aoTentarNovamente}>
              Tentar novamente
            </Botao>
          </div>
        </div>
      </div>
    );
  }

  if (carregando || resultado === null) {
    return (
      <div className="space-y-6">
        {botaoVoltar}
        <div role="status" className={`flex items-center justify-center p-16 ${SUPERFICIE_BASE}`}>
          <p className={TIPOGRAFIA.textoAuxiliar}>Carregando Documentos Hábeis Pendentes...</p>
        </div>
      </div>
    );
  }

  const { resumo, registros } = resultado;
  const total = resumo.aguardando_liberacao + resumo.revisao_manual_necessaria;
  const registrosFiltrados = registros.filter((registro) => filtro === "todos" || registro.situacao === filtro);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {botaoVoltar}
        <p className={TIPOGRAFIA.textoAuxiliar}>
          Documentos Hábeis Pendentes · {total} processo{total === 1 ? "" : "s"}
        </p>
      </div>

      {total === 0 ? (
        <div className={`p-8 text-center ${SUPERFICIE_BASE}`}>
          <p className={TIPOGRAFIA.texto}>Nenhum processo deste recorte está com o Documento Hábil pendente.</p>
        </div>
      ) : (
        <>
          <div
            role="radiogroup"
            aria-label="Filtrar Documentos Hábeis Pendentes"
            className="inline-flex flex-wrap gap-1 rounded-lg border border-white/15 bg-white/5 p-1"
          >
            {OPCOES_FILTRO.map((opcao) => {
              const selecionado = opcao.valor === filtro;
              return (
                <button
                  key={opcao.valor}
                  type="button"
                  role="radio"
                  aria-checked={selecionado}
                  onClick={() => setFiltro(opcao.valor)}
                  className={`rounded-md px-4 py-2 text-sm font-semibold transition ${PRESSIONAR} ${DESABILITADO} ${FOCO_ANEL} ${
                    selecionado ? "bg-[image:var(--gradient-marca)] text-white" : "text-slate-300 hover:bg-white/10"
                  }`}
                >
                  {opcao.rotulo}
                  {opcao.valor !== "todos" && ` (${resumo[opcao.valor]})`}
                </button>
              );
            })}
          </div>

          {registrosFiltrados.length === 0 ? (
            <div className={`p-8 text-center ${SUPERFICIE_BASE}`}>
              <p className={TIPOGRAFIA.texto}>Nenhum processo nesta situação.</p>
            </div>
          ) : (
            <div className={`overflow-x-auto ${SUPERFICIE_BASE}`}>
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className={TIPOGRAFIA.legenda}>
                    <th className="px-5 py-3.5 font-medium">SEI</th>
                    <th className="px-5 py-3.5 font-medium">Servidor</th>
                    <th className="px-5 py-3.5 font-medium">CPF</th>
                    <th className="px-5 py-3.5 font-medium">Período</th>
                    <th className="px-5 py-3.5 font-medium">Destino</th>
                    <th className="px-5 py-3.5 font-medium">Data prevista de liberação</th>
                    <th className="px-5 py-3.5 font-medium">Dias</th>
                    <th className="px-5 py-3.5 font-medium">Situação</th>
                    <th className="px-5 py-3.5" aria-hidden="true" />
                  </tr>
                </thead>
                <tbody>
                  {registrosFiltrados.map((registro) => (
                    <tr
                      key={registro.sei}
                      tabIndex={0}
                      aria-label={`Ver detalhes do processo ${registro.sei}`}
                      onClick={() => aoSelecionarRegistro(registro.sei)}
                      onKeyDown={(evento) => {
                        if (evento.key !== "Enter" && evento.key !== " ") return;
                        evento.preventDefault();
                        aoSelecionarRegistro(registro.sei);
                      }}
                      className="cursor-pointer border-t border-white/5 text-slate-300 transition-colors even:bg-white/[0.02] hover:bg-white/[0.05]"
                    >
                      <td className="px-5 py-3.5">{registro.sei}</td>
                      <td className="px-5 py-3.5">{registro.servidor_nome ?? "—"}</td>
                      <td className="px-5 py-3.5">{registro.cpf_mascarado ?? "—"}</td>
                      <td className="px-5 py-3.5">{formatarPeriodoBr(registro.periodo.inicial, registro.periodo.final)}</td>
                      <td className="px-5 py-3.5">{registro.destino ?? "—"}</td>
                      <td className="px-5 py-3.5">{formatarDataBr(registro.data_liberacao_prevista)}</td>
                      <td className="px-5 py-3.5">{textoDias(registro)}</td>
                      <td className="px-5 py-3.5">
                        <span
                          aria-hidden="true"
                          className={`mr-1.5 inline-block h-2.5 w-2.5 rounded-full ${CORES_STATUS[VARIANTE_POR_SITUACAO[registro.situacao]].ponto}`}
                        />
                        <Badge variante={VARIANTE_POR_SITUACAO[registro.situacao]}>
                          {ROTULO_POR_SITUACAO[registro.situacao]}
                        </Badge>
                      </td>
                      <td className="px-5 py-3.5 text-cyan-400">▸ Ver detalhes</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
