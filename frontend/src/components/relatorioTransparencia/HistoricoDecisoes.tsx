import { useState } from "react";
import { PAINEL_MODAL, SCROLL_FINO, SUPERFICIE_BASE } from "../../theme/estilos";
import { TIPOGRAFIA } from "../../theme/tipografia";
import Badge from "../ui/Badge";
import Botao from "../ui/Botao";
import type { RevisaoRelatorioTransparencia } from "../../types/relatorioTransparencia";

const ROTULO_ESTADO: Record<RevisaoRelatorioTransparencia["estado"], string> = {
  pendente: "Pendente",
  decidida: "Decidida",
  adiada: "Adiada",
  desatualizada: "Desatualizada",
  requer_nova_decisao: "Requer nova decisão",
};

function varianteEstado(estado: RevisaoRelatorioTransparencia["estado"]) {
  if (estado === "decidida") return "sucesso" as const;
  if (estado === "adiada") return "neutro" as const;
  if (estado === "pendente") return "aviso" as const;
  return "critico" as const; // desatualizada | requer_nova_decisao
}

function formatarDataHora(iso: string | null): string {
  if (!iso) return "—";
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return iso;
  return data.toLocaleString("pt-BR");
}

// HOMO-RT-03/04 — a identidade de uma ocorrência de um grupo com
// repetição física é "{ob}#v2:{hash de conteúdo}" (ver
// `identidades_ocorrencias` no backend) — nunca pensada para exibição.
// Trunca só o sufixo do hash para leitura humana (mesma convenção do git
// para abreviar commits); a OB continua completa e nunca é alterada. Só
// afeta o detalhe técnico secundário abaixo — a comparação/seleção real
// sempre usa a identidade completa, nunca esta versão truncada.
function formatarIdentidadePublicavel(identidade: string): string {
  const [ob, hash] = identidade.split("#", 2);
  if (!hash) return identidade; // sem repetição física: identidade == ob, exibe como está
  return `${ob}#${hash.slice(0, 8)}…`;
}

// Micro-correção "Histórico com seleção mista" — achado do Codex: a versão
// anterior desta função tinha um `return` antecipado assim que encontrava
// QUALQUER identidade publicada com multiplicidade > 1 — descrevia só essa
// classe idêntica e OMITIA qualquer outra identidade também publicada no
// mesmo grupo (ex.: `[A,A,B]` selecionando A E B publicava as duas
// corretamente no backend/XLSX, mas o resumo dizia só "Publicou 1 de 2
// ocorrências idênticas", escondendo que B também foi publicada — parte
// material da decisão nunca pode ficar de fora do resumo).
//
// Corrigido classificando CADA identidade selecionada individualmente
// (nunca a lista inteira de uma vez) e compondo uma frase por classe/
// ocorrência — nunca um único `return` que descarta as demais.
function resumoDecisao(revisao: RevisaoRelatorioTransparencia): string {
  if (revisao.estado === "pendente") return "—";
  if (revisao.estado === "adiada") return "Adiada";
  if (revisao.estado === "requer_nova_decisao") return "Requer nova decisão";
  if (revisao.estado === "desatualizada") return "Desatualizada";

  // "decidida": distingue as formas de PUBLICAR — nenhuma, ou uma
  // composição de TODAS as identidades selecionadas, cada uma classificada
  // por sua própria multiplicidade nas ocorrências do grupo (nunca da
  // lista de publicáveis isolada).
  const publicaveis = revisao.obs_publicaveis ?? [];
  if (publicaveis.length === 0) return "Não publicou nenhuma";

  const multiplicidadePorIdentidade = new Map<string, number>();
  for (const ocorrencia of revisao.ocorrencias) {
    multiplicidadePorIdentidade.set(
      ocorrencia.identidade,
      (multiplicidadePorIdentidade.get(ocorrencia.identidade) ?? 0) + 1,
    );
  }

  // `obs_publicaveis` já é um conjunto de identidades distintas (o backend
  // nunca grava a mesma identidade duas vezes) — `Set` aqui é só defesa
  // extra, nunca elimina uma classe/ocorrência selecionada de verdade.
  const identidadesSelecionadas = Array.from(new Set(publicaveis));
  const classesIdenticasSelecionadas = identidadesSelecionadas.filter(
    (identidade) => (multiplicidadePorIdentidade.get(identidade) ?? 1) > 1,
  );
  const especificasSelecionadas = identidadesSelecionadas.filter(
    (identidade) => (multiplicidadePorIdentidade.get(identidade) ?? 1) <= 1,
  );

  const partes: string[] = [];
  for (const identidade of classesIdenticasSelecionadas) {
    partes.push(`1 de ${multiplicidadePorIdentidade.get(identidade)} ocorrências idênticas`);
  }
  if (especificasSelecionadas.length === 1) {
    partes.push("1 ocorrência específica");
  } else if (especificasSelecionadas.length > 1) {
    partes.push(`${especificasSelecionadas.length} ocorrências específicas`);
  }

  return `Publicou ${partes.join(" + ")}`;
}

function obsDoGrupo(revisao: RevisaoRelatorioTransparencia): string[] {
  return Array.from(new Set(revisao.ocorrencias.map((oc) => oc.ob))).sort();
}

// Micro-sprint UX operacional — antes esta função decidia sozinha, com um
// único critério (multiplicidade > 1), a frase inteira do resumo. Extraída
// aqui só para ser reaproveitada tanto pela linha resumida da tabela quanto
// pelo painel de detalhe (`DetalheDecisao`), sem duplicar a regra.
function haClasseIdentica(revisao: RevisaoRelatorioTransparencia): boolean {
  const multiplicidadePorIdentidade = new Map<string, number>();
  for (const ocorrencia of revisao.ocorrencias) {
    multiplicidadePorIdentidade.set(
      ocorrencia.identidade,
      (multiplicidadePorIdentidade.get(ocorrencia.identidade) ?? 0) + 1,
    );
  }
  return Array.from(multiplicidadePorIdentidade.values()).some((quantidade) => quantidade > 1);
}

interface PropsDetalhe {
  revisao: RevisaoRelatorioTransparencia;
  onFechar: () => void;
}

// Micro-sprint UX operacional — homologação manual apontou que o histórico
// misturava resumo e detalhe na mesma linha de tabela (Decisão + lista
// técnica de identidades sempre visíveis), dificultando encontrar rápido
// "essa competência já foi decidida?" em meio a texto técnico. Este painel
// concentra tudo que uma decisão concluída registrou; a linha da tabela
// agora só resume o essencial (Regra/OB(s)/Estado/Responsável/Data) e
// aponta para cá via "Ver decisão".
function DetalheDecisao({ revisao, onFechar }: PropsDetalhe) {
  const obs = obsDoGrupo(revisao);
  const publicaveis = revisao.obs_publicaveis ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="detalhe-decisao-titulo"
        className={`w-full max-w-lg p-8 ${PAINEL_MODAL}`}
      >
        <div className="flex items-center justify-between gap-4">
          <h2 id="detalhe-decisao-titulo" className={TIPOGRAFIA.titulo}>
            Detalhe da decisão
          </h2>
          <Badge variante={varianteEstado(revisao.estado)}>{ROTULO_ESTADO[revisao.estado]}</Badge>
        </div>

        {/* Sprint D.1 (QA manual — "decisão anterior reaplicada invisível")
         * — quando `autor`/"Data/hora" abaixo vêm de uma decisão de uma
         * competência/execução DIFERENTE da atual (reaproveitada porque a
         * evidência continua válida, G06), isto precisa ficar explícito
         * ANTES dos próprios campos — nunca apresentado como se a decisão
         * tivesse acabado de acontecer agora. */}
        {revisao.reaplicada_de_execucao_anterior && (
          <div className="mt-4">
            <Badge variante="info">Decisão anterior reaplicada</Badge>
            <p className={`mt-1.5 ${TIPOGRAFIA.legenda}`}>
              Responsável e data/hora abaixo são da decisão ORIGINAL — reaproveitada aqui porque a evidência não
              mudou, sem exigir nova decisão.
            </p>
          </div>
        )}

        <dl className="mt-5 space-y-3.5">
          <div>
            <dt className={TIPOGRAFIA.legenda}>Regra</dt>
            <dd className={`mt-0.5 ${TIPOGRAFIA.texto}`}>{revisao.regra}</dd>
          </div>
          <div>
            <dt className={TIPOGRAFIA.legenda}>OB(s)</dt>
            <dd className={`mt-0.5 ${TIPOGRAFIA.texto}`}>{obs.join(", ")}</dd>
          </div>
          <div>
            <dt className={TIPOGRAFIA.legenda}>{revisao.reaplicada_de_execucao_anterior ? "Responsável original" : "Responsável"}</dt>
            <dd className={`mt-0.5 ${TIPOGRAFIA.texto}`}>{revisao.autor ?? "—"}</dd>
          </div>
          <div>
            <dt className={TIPOGRAFIA.legenda}>{revisao.reaplicada_de_execucao_anterior ? "Data/hora original" : "Data/hora"}</dt>
            <dd className={`mt-0.5 ${TIPOGRAFIA.texto}`}>{formatarDataHora(revisao.decidido_em)}</dd>
          </div>
          <div>
            <dt className={TIPOGRAFIA.legenda}>O que foi publicado</dt>
            <dd className={`mt-0.5 ${TIPOGRAFIA.texto}`}>{resumoDecisao(revisao)}</dd>
            {publicaveis.length > 0 && (
              <dd className={`mt-1 ${TIPOGRAFIA.legenda}`}>
                {publicaveis.map(formatarIdentidadePublicavel).join(", ")}
              </dd>
            )}
            {haClasseIdentica(revisao) && (
              <dd className={`mt-1 ${TIPOGRAFIA.legenda}`}>
                Este grupo tem ocorrências fisicamente repetidas e idênticas entre si (RN04) — a decisão
                publica no máximo uma representante de cada classe idêntica.
              </dd>
            )}
          </div>
          <div>
            <dt className={TIPOGRAFIA.legenda}>Observação</dt>
            <dd className={`mt-0.5 whitespace-pre-line ${TIPOGRAFIA.texto}`}>{revisao.observacao ?? "—"}</dd>
          </div>
        </dl>

        <div className="mt-7 flex justify-end">
          <Botao variante="secundaria" onClick={onFechar} autoFocus>
            Fechar
          </Botao>
        </div>
      </div>
    </div>
  );
}

interface PropsTabela {
  revisoes: RevisaoRelatorioTransparencia[];
  onVerDecisao: (revisao: RevisaoRelatorioTransparencia) => void;
}

// Micro-sprint UX operacional — mesma tabela é reaproveitada para os dois
// blocos (concluídas e pendências): só a lista de `revisoes` recebida
// muda, o formato de linha é o mesmo (resumo + "Ver decisão" quando existe
// uma decisão anterior a mostrar, mesmo que hoje esteja desatualizada).
function TabelaRevisoes({ revisoes, onVerDecisao }: PropsTabela) {
  return (
    <div className={`${SUPERFICIE_BASE} overflow-hidden`}>
      <div className={`max-h-[28rem] overflow-auto ${SCROLL_FINO}`}>
        <table className="w-full min-w-[44rem] border-collapse">
          <thead>
            <tr>
              {["Regra", "OB(s)", "Estado", "Responsável", "Decidido em", ""].map((rotulo, indice) => (
                <th
                  key={rotulo || `acoes-${indice}`}
                  className="sticky top-0 z-10 border-b border-white/10 bg-[#0b1120] px-4 py-3 text-left text-[13px] font-semibold text-slate-400"
                >
                  {rotulo}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {revisoes.map((revisao) => (
              <tr key={revisao.identidade_grupo}>
                <td className="border-b border-white/10 px-4 py-3 text-[13px] text-slate-300">
                  {revisao.regra}
                </td>
                <td className="border-b border-white/10 px-4 py-3 text-[13px] text-slate-300">
                  {obsDoGrupo(revisao).join(", ")}
                </td>
                <td className="border-b border-white/10 px-4 py-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variante={varianteEstado(revisao.estado)}>{ROTULO_ESTADO[revisao.estado]}</Badge>
                    {/* Sprint D.1 (QA manual) — nunca deixar uma decisão
                     * reaproveitada de outra competência passar por "decidida
                     * agora mesmo" na leitura rápida da tabela. */}
                    {revisao.reaplicada_de_execucao_anterior && <Badge variante="info">Reaplicada</Badge>}
                  </div>
                </td>
                <td className="border-b border-white/10 px-4 py-3 text-[13px] text-slate-300">
                  {revisao.autor ?? "—"}
                </td>
                <td className="border-b border-white/10 px-4 py-3 text-[13px] text-slate-400">
                  {formatarDataHora(revisao.decidido_em)}
                </td>
                <td className="border-b border-white/10 px-4 py-3 text-right">
                  {/* Só existe algo para ver quando já houve uma decisão registrada
                   * (mesmo que hoje ela conte como pendência por estar desatualizada
                   * ou exigir nova decisão) — "pendente" nunca teve decisão alguma. */}
                  {revisao.autor && (
                    <Botao variante="link" onClick={() => onVerDecisao(revisao)}>
                      Ver decisão
                    </Botao>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface Props {
  revisoes: RevisaoRelatorioTransparencia[];
}

// Micro-sprint UX operacional — homologação manual apontou que o histórico
// misturava, na mesma tabela e com o mesmo peso visual, decisões já
// concluídas (DECIDIDA/ADIADA) com casos que ainda exigem ação humana
// (PENDENTE/DESATUALIZADA/REQUER_NOVA_DECISAO) — como se fossem entradas
// de histórico equivalentes. Redesenhado em dois blocos, priorizando as
// decisões concluídas (primeiro bloco, sempre visível mesmo vazio) e
// isolando as pendências claramente à parte (segundo bloco, só aparece
// quando existe alguma) — nenhuma pendência polui o histórico como se
// já estivesse resolvida.
//
// Nenhuma decisão/estado novo foi criado; `resumo.revisoes` continua sendo
// a mesma lista já recebida do backend (GET/POST existentes) — só a forma
// de agrupar/exibir mudou.
export default function HistoricoDecisoes({ revisoes }: Props) {
  const [detalhe, setDetalhe] = useState<RevisaoRelatorioTransparencia | null>(null);

  if (revisoes.length === 0) {
    return <p className={TIPOGRAFIA.textoAuxiliar}>Nenhuma revisão para esta competência.</p>;
  }

  const concluidas = revisoes.filter((revisao) => revisao.estado === "decidida" || revisao.estado === "adiada");
  const pendencias = revisoes.filter(
    (revisao) => revisao.estado !== "decidida" && revisao.estado !== "adiada",
  );

  return (
    <div className="space-y-7">
      <div>
        <h3 className={`mb-3 ${TIPOGRAFIA.subtitulo}`}>Histórico de decisões</h3>
        {concluidas.length === 0 ? (
          <p className={TIPOGRAFIA.textoAuxiliar}>Nenhuma decisão concluída ainda nesta competência.</p>
        ) : (
          <TabelaRevisoes revisoes={concluidas} onVerDecisao={setDetalhe} />
        )}
      </div>

      {pendencias.length > 0 && (
        <div>
          <h3 className={`mb-3 ${TIPOGRAFIA.subtitulo}`}>Pendências que exigem nova decisão</h3>
          <TabelaRevisoes revisoes={pendencias} onVerDecisao={setDetalhe} />
        </div>
      )}

      {detalhe && <DetalheDecisao revisao={detalhe} onFechar={() => setDetalhe(null)} />}
    </div>
  );
}
