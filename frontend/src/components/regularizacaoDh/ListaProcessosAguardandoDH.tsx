import { CORES_STATUS } from "../../theme/cores";
import { SUPERFICIE_BASE } from "../../theme/estilos";
import { TIPOGRAFIA } from "../../theme/tipografia";
import type { ListaProcessosAguardandoDH, ProcessoAguardandoDH, SituacaoDocumentoHabilPendente } from "../../types/regularizacaoDh";
import { formatarDataBr, formatarPeriodoBr } from "../../lib/datas";
import Alerta from "../ui/Alerta";
import Badge from "../ui/Badge";
import Botao from "../ui/Botao";

interface Props {
  resultado: ListaProcessosAguardandoDH | null;
  carregando: boolean;
  erro: string | null;
  aoAtualizar: () => void;
  aoSelecionarProcesso: (sei: string) => void;
}

// Micro-sprint B — mesmo vocabulário/cores já homologados em
// `PainelDocumentosHabeisPendentes.tsx` (Central Analítica): "aguardando
// liberação" é informativo (nunca âmbar/vermelho), "revisão manual
// necessária" é atenção em âmbar. Nenhum critério novo, só reaproveitado.
const ROTULO_POR_SITUACAO: Record<SituacaoDocumentoHabilPendente, string> = {
  aguardando_liberacao: "Aguardando liberação",
  revisao_manual_necessaria: "Revisão manual necessária",
};

const VARIANTE_POR_SITUACAO: Record<SituacaoDocumentoHabilPendente, "info" | "aviso"> = {
  aguardando_liberacao: "info",
  revisao_manual_necessaria: "aviso",
};

function textoDias(processo: ProcessoAguardandoDH): string {
  if (processo.situacao === "aguardando_liberacao") {
    return processo.texto_contagem ?? "—";
  }
  const dias = processo.dias_atraso ?? 0;
  return `Atraso de ${dias} dia${dias === 1 ? "" : "s"} desde ${formatarDataBr(processo.data_liberacao_prevista)}`;
}

function textoTrecho(processo: ProcessoAguardandoDH): string {
  const { origem, destino } = processo.trecho;
  if (origem && destino) return `${origem} - ${destino}`;
  return destino ?? origem ?? "—";
}

export default function ListaProcessosAguardandoDH({
  resultado,
  carregando,
  erro,
  aoAtualizar,
  aoSelecionarProcesso,
}: Props) {
  const botaoAtualizar = (
    <Botao variante="secundaria" onClick={aoAtualizar} carregando={carregando}>
      Atualizar
    </Botao>
  );

  if (erro !== null) {
    return (
      <div className={`p-5 ${SUPERFICIE_BASE}`}>
        <div className="flex items-center justify-between gap-4">
          <Alerta variante="erro">{erro}</Alerta>
          {botaoAtualizar}
        </div>
      </div>
    );
  }

  if (carregando && resultado === null) {
    return (
      <div role="status" className={`flex items-center justify-center p-16 ${SUPERFICIE_BASE}`}>
        <p className={TIPOGRAFIA.textoAuxiliar}>Carregando processos aguardando DH...</p>
      </div>
    );
  }

  const total = resultado?.total ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className={TIPOGRAFIA.textoAuxiliar}>
          {total} processo{total === 1 ? "" : "s"} aguardando DH
        </p>
        {botaoAtualizar}
      </div>

      {total === 0 ? (
        <div className={`p-8 text-center ${SUPERFICIE_BASE}`}>
          <p className={TIPOGRAFIA.texto}>Nenhum processo aguardando DH no momento.</p>
        </div>
      ) : (
        <div className={`overflow-x-auto ${SUPERFICIE_BASE}`}>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className={TIPOGRAFIA.legenda}>
                <th className="px-5 py-3.5 font-medium">SEI</th>
                <th className="px-5 py-3.5 font-medium">Servidor/Membro</th>
                <th className="px-5 py-3.5 font-medium">CPF</th>
                <th className="px-5 py-3.5 font-medium">Período</th>
                <th className="px-5 py-3.5 font-medium">Trecho</th>
                <th className="px-5 py-3.5 font-medium">Dias</th>
                <th className="px-5 py-3.5 font-medium">Situação</th>
                <th className="px-5 py-3.5" aria-hidden="true" />
              </tr>
            </thead>
            <tbody>
              {resultado?.processos.map((processo) => (
                <tr
                  key={processo.sei}
                  tabIndex={0}
                  aria-label={`Ver detalhes do processo ${processo.sei}`}
                  onClick={() => aoSelecionarProcesso(processo.sei)}
                  onKeyDown={(evento) => {
                    if (evento.key !== "Enter" && evento.key !== " ") return;
                    evento.preventDefault();
                    aoSelecionarProcesso(processo.sei);
                  }}
                  className="cursor-pointer border-t border-white/5 text-slate-300 transition-colors even:bg-white/[0.02] hover:bg-white/[0.05]"
                >
                  <td className="px-5 py-3.5">{processo.sei}</td>
                  <td className="px-5 py-3.5">
                    {processo.servidor_nome ?? "—"}
                    {processo.categoria_funcional !== "NAO_IDENTIFICADO" && (
                      <span className={`ml-1.5 ${TIPOGRAFIA.legenda}`}>
                        ({processo.categoria_funcional === "MEMBRO" ? "Membro" : "Servidor"})
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3.5">{processo.cpf_mascarado ?? "—"}</td>
                  <td className="px-5 py-3.5">{formatarPeriodoBr(processo.periodo.inicial, processo.periodo.final)}</td>
                  <td className="px-5 py-3.5">{textoTrecho(processo)}</td>
                  <td className="px-5 py-3.5">{textoDias(processo)}</td>
                  <td className="px-5 py-3.5">
                    <span
                      aria-hidden="true"
                      className={`mr-1.5 inline-block h-2.5 w-2.5 rounded-full ${CORES_STATUS[VARIANTE_POR_SITUACAO[processo.situacao]].ponto}`}
                    />
                    <Badge variante={VARIANTE_POR_SITUACAO[processo.situacao]}>
                      {ROTULO_POR_SITUACAO[processo.situacao]}
                    </Badge>
                  </td>
                  <td className="px-5 py-3.5 text-cyan-400">▸ Ver detalhes</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
