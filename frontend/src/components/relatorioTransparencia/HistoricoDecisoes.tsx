import { SCROLL_FINO, SUPERFICIE_BASE } from "../../theme/estilos";
import { TIPOGRAFIA } from "../../theme/tipografia";
import Badge from "../ui/Badge";
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

interface Props {
  revisoes: RevisaoRelatorioTransparencia[];
}

// Micro-sprint corretiva HOMO-RT-02 — histórico de decisões. Não é um
// sistema de auditoria/autenticação novo: só uma leitura tabular do MESMO
// `resumo.revisoes` que a tela de revisão já recebe do backend
// (`GET/POST` já existentes), sem endpoint novo. Responsável/data/decisão
// são exibidos exatamente como persistidos por `DecisaoHumana` — nunca
// reinterpretados, normalizados ou combinados entre registros para inferir
// identidade (nenhuma autenticação existe no app, local/desktop).
//
// Sem coluna de "competência": uma decisão não é gravada por competência —
// o intervalo de reconciliação é sempre acumulado desde janeiro (mesma
// competência acumulada usada na conciliação), então a mesma decisão pode
// valer para vários meses de referência. Inventar essa coluna exigiria um
// campo que não existe em `DecisaoHumana` só por conveniência de exibição.
export default function HistoricoDecisoes({ revisoes }: Props) {
  if (revisoes.length === 0) {
    return <p className={TIPOGRAFIA.textoAuxiliar}>Nenhuma revisão para esta competência.</p>;
  }

  return (
    <div className={`${SUPERFICIE_BASE} overflow-hidden`}>
      <div className={`max-h-[28rem] overflow-auto ${SCROLL_FINO}`}>
        <table className="w-full min-w-[52rem] border-collapse">
          <thead>
            <tr>
              {["Regra", "OB(s)", "Estado", "Responsável", "Decidido em", "Decisão", "Observação"].map(
                (rotulo) => (
                  <th
                    key={rotulo}
                    className="sticky top-0 z-10 border-b border-white/10 bg-[#0b1120] px-4 py-3 text-left text-[13px] font-semibold text-slate-400"
                  >
                    {rotulo}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {revisoes.map((revisao) => {
              const obsDoGrupo = Array.from(new Set(revisao.ocorrencias.map((oc) => oc.ob))).sort();
              return (
                <tr key={revisao.identidade_grupo}>
                  <td className="border-b border-white/10 px-4 py-3 text-[13px] text-slate-300">
                    {revisao.regra}
                  </td>
                  <td className="border-b border-white/10 px-4 py-3 text-[13px] text-slate-300">
                    {obsDoGrupo.join(", ")}
                  </td>
                  <td className="border-b border-white/10 px-4 py-3">
                    <Badge variante={varianteEstado(revisao.estado)}>{ROTULO_ESTADO[revisao.estado]}</Badge>
                  </td>
                  <td className="border-b border-white/10 px-4 py-3 text-[13px] text-slate-300">
                    {revisao.autor ?? "—"}
                  </td>
                  <td className="border-b border-white/10 px-4 py-3 text-[13px] text-slate-400">
                    {formatarDataHora(revisao.decidido_em)}
                  </td>
                  <td className="border-b border-white/10 px-4 py-3 text-[13px] text-slate-300">
                    <div>{resumoDecisao(revisao)}</div>
                    {revisao.obs_publicaveis && revisao.obs_publicaveis.length > 0 && (
                      <div className={`mt-0.5 ${TIPOGRAFIA.legenda}`}>
                        {revisao.obs_publicaveis.map(formatarIdentidadePublicavel).join(", ")}
                      </div>
                    )}
                  </td>
                  <td className="border-b border-white/10 px-4 py-3 text-[13px] text-slate-400">
                    {revisao.observacao ?? "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
