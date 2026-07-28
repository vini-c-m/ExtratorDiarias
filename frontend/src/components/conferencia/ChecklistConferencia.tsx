import { CORES_STATUS } from "../../theme/cores";
import { SUPERFICIE_BASE } from "../../theme/estilos";
import { TIPOGRAFIA } from "../../theme/tipografia";
import type { ResultadoConferencia } from "../../types/conferencia";

interface Props {
  resultado: ResultadoConferencia;
}

interface Linha {
  rotulo: string;
  valor: string;
  ok: boolean;
}

function formatarData(iso: string): string {
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

// Sprint 13 — as 7 linhas do checklist aprovado na Sprint 12 (Cadastro,
// Nome, Função, Providência, Duplicidade, Janela operacional, Resultado).
// Só 5 delas vêm de `resultado.checklist` (itens realmente "checáveis" no
// backend); "Providência" e "Resultado" são montadas aqui a partir de
// `resultado.providencia`/`resultado.veredito` — o contrato de API não
// força esses dois em itens de array artificiais sem `ok` real.
export default function ChecklistConferencia({ resultado }: Props) {
  const cadastro = resultado.checklist.find((item) => item.item === "cadastro_localizado");
  const nome = resultado.checklist.find((item) => item.item === "nome");
  const cargo = resultado.checklist.find((item) => item.item === "cargo");
  const duplicidadeItem = resultado.checklist.find((item) => item.item === "duplicidade");
  const janelaItem = resultado.checklist.find((item) => item.item === "janela_processamento");
  const apto = resultado.veredito === "APTO_PARA_PROCESSAMENTO";

  const linhas: Linha[] = [
    {
      rotulo: "Cadastro",
      valor: cadastro?.ok ? "Cadastro localizado" : "Servidor ainda não cadastrado",
      ok: !!cadastro?.ok,
    },
    { rotulo: "Nome", valor: nome?.valor ?? "não disponível", ok: !!nome?.ok },
    { rotulo: "Função", valor: cargo?.valor ?? "não disponível", ok: !!cargo?.ok },
    { rotulo: "Providência", valor: resultado.providencia, ok: apto },
    {
      rotulo: "Duplicidade",
      valor: duplicidadeItem?.ok
        ? "Nenhuma duplicidade encontrada"
        : "Já existe um registro para este CPF neste período",
      ok: !!duplicidadeItem?.ok,
    },
    {
      rotulo: "Janela operacional",
      valor: janelaItem?.ok
        ? `Liberada desde ${formatarData(resultado.janela_processamento.data_liberacao)}`
        : `Ainda não liberada — libera em ${formatarData(resultado.janela_processamento.data_liberacao)}`,
      ok: !!janelaItem?.ok,
    },
    {
      rotulo: "Resultado",
      valor: apto ? "Apto para processamento" : "Revisar",
      ok: apto,
    },
  ];

  return (
    <div className={`${SUPERFICIE_BASE} p-6`}>
      {linhas.map((linha) => (
        <div key={linha.rotulo} className="flex gap-3 border-b border-white/[0.06] py-3 last:border-0">
          <span
            aria-hidden="true"
            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
              linha.ok ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400"
            }`}
          >
            {linha.ok ? "✓" : "!"}
          </span>
          <div className="min-w-0 flex-1">
            <div className={TIPOGRAFIA.legenda}>{linha.rotulo}</div>
            <div className={`mt-0.5 ${TIPOGRAFIA.textoForte}`}>{linha.valor}</div>
          </div>
        </div>
      ))}

      {resultado.duplicidade && (
        <div
          className={`mt-3 grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border p-3.5 text-xs ${CORES_STATUS.aviso.alerta}`}
        >
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide opacity-70">SEI</div>
            <div>{resultado.duplicidade.sei}</div>
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide opacity-70">Trecho</div>
            <div>{resultado.duplicidade.trecho}</div>
          </div>
          <div className="col-span-2">
            <div className="text-[10px] font-semibold uppercase tracking-wide opacity-70">Período</div>
            <div>
              {formatarData(resultado.duplicidade.periodo_inicial)} a{" "}
              {formatarData(resultado.duplicidade.periodo_final)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
