import { FOCO_ANEL, SCROLL_FINO, SUPERFICIE_BASE } from "../../theme/estilos";
import { TIPOGRAFIA } from "../../theme/tipografia";
import Badge from "../ui/Badge";
import type { OcorrenciaRelatorioTransparencia } from "../../types/relatorioTransparencia";

type ChaveCampo = keyof Omit<OcorrenciaRelatorioTransparencia, "ob">;

function formatarTexto(valor: unknown): string {
  return typeof valor === "string" && valor !== "" ? valor : "—";
}

function formatarData(valor: unknown): string {
  if (typeof valor !== "string" || valor === "") return "—";
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return valor;
  return data.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

function formatarValor(valor: unknown): string {
  if (typeof valor !== "number") return "—";
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Vocabulário FIXO dos 11 campos que a API expõe por ocorrência
// (`OcorrenciaResposta`/`campos_iguais`/`campos_diferentes` já usam
// exatamente estes nomes) — nenhum campo é inventado ou omitido aqui.
// MOTIVO permanece na visão principal (item 7 da micro-sprint: "não
// removê-lo — pode ser essencial para distinguir situações
// administrativas").
const CAMPOS: { chave: ChaveCampo; rotulo: string; formatar: (valor: unknown) => string }[] = [
  { chave: "dh", rotulo: "Documento Hábil (DH)", formatar: formatarTexto },
  { chave: "beneficiario", rotulo: "Beneficiário", formatar: formatarTexto },
  { chave: "sei", rotulo: "SEI", formatar: formatarTexto },
  { chave: "data_ob", rotulo: "Data da OB", formatar: formatarData },
  { chave: "periodo_inicial", rotulo: "Período Inicial", formatar: formatarData },
  { chave: "periodo_final", rotulo: "Período Final", formatar: formatarData },
  { chave: "trecho", rotulo: "Trecho", formatar: formatarTexto },
  { chave: "valor", rotulo: "Valor", formatar: formatarValor },
  { chave: "motivo", rotulo: "Motivo", formatar: formatarTexto },
  { chave: "restituicao", rotulo: "Restituição", formatar: formatarValor },
];

interface Props {
  ocorrencias: OcorrenciaRelatorioTransparencia[];
  /** Vindos do backend (`RevisaoRelatorioTransparencia`) — NUNCA
   * recalculados aqui. `TabelaComparativaOcorrencias` só lê estas duas
   * listas para decidir o destaque visual de cada linha (item 8/24 da
   * micro-sprint: "campos_diferentes.includes('valor') → destacar célula"
   * é apresentação, não regra de negócio). */
  camposIguais: string[];
  camposDiferentes: string[];
  selecionadas: Set<string>;
  onAlternarSelecao: (ob: string) => void;
  desabilitado?: boolean;
}

// Micro-sprint 3E.1 — Tela 3/4/variação N ocorrências, tabela transposta
// aprovada na investigação UX 3E: LINHAS = campos administrativos, COLUNAS =
// ocorrências/pagamentos — suporta 2, 3, 4 ou N ocorrências sem mudar de
// estrutura (nunca "Pagamento A versus Pagamento B" fixo). Cabeçalho fica
// `sticky` (permanece visível ao rolar verticalmente) e o wrapper tem
// scroll horizontal próprio para N colunas grandes (item 13: nunca obrigar
// o servidor a navegar repetidamente pela tabela inteira para localizar o
// checkbox/valor de uma ocorrência).
export default function TabelaComparativaOcorrencias({
  ocorrencias,
  camposIguais,
  camposDiferentes,
  selecionadas,
  onAlternarSelecao,
  desabilitado = false,
}: Props) {
  return (
    <div>
      {camposIguais.length > 0 && (
        <div className="mb-3.5 flex flex-wrap items-center gap-2">
          <span className={TIPOGRAFIA.legenda}>
            {ocorrencias.length === 2 ? "Iguais nas duas ocorrências:" : "Iguais em todas as ocorrências:"}
          </span>
          {camposIguais.map((campo) => (
            <Badge key={campo} variante="neutro">
              {CAMPOS.find((c) => c.chave === campo)?.rotulo ?? campo}
            </Badge>
          ))}
        </div>
      )}

      <div className={`${SUPERFICIE_BASE} overflow-hidden`}>
        <div className={`max-h-[28rem] overflow-auto ${SCROLL_FINO}`}>
          <table className="w-full min-w-[40rem] border-collapse">
            <thead>
              <tr>
                <th className="sticky top-0 z-10 w-44 border-b border-white/10 bg-[#0b1120] px-5 py-4 text-left" />
                {ocorrencias.map((ocorrencia) => {
                  const marcado = selecionadas.has(ocorrencia.ob);
                  return (
                    <th
                      key={ocorrencia.ob}
                      className="sticky top-0 z-10 border-b border-l border-white/10 bg-[#0b1120] px-5 py-4 text-left align-top"
                    >
                      <label className={`flex cursor-pointer items-start gap-2.5 ${desabilitado ? "opacity-50" : ""}`}>
                        <input
                          type="checkbox"
                          className={`mt-0.5 h-5 w-5 rounded-md border-white/20 bg-white/[0.03] text-cyan-400 accent-cyan-400 ${FOCO_ANEL}`}
                          checked={marcado}
                          disabled={desabilitado}
                          onChange={() => onAlternarSelecao(ocorrencia.ob)}
                        />
                        <span>
                          <span className="block text-[13px] font-bold text-slate-50">{ocorrencia.ob}</span>
                          <span className="mt-0.5 block text-xs font-semibold text-emerald-300">
                            {formatarValor(ocorrencia.valor)}
                          </span>
                        </span>
                      </label>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {CAMPOS.map(({ chave, rotulo, formatar }) => {
                const diferente = camposDiferentes.includes(chave);
                return (
                  <tr key={chave} className={diferente ? "bg-amber-500/[0.045]" : undefined}>
                    <td
                      className={`border-b border-white/10 px-5 py-3.5 ${
                        diferente ? "border-l-[3px] border-l-amber-400" : ""
                      }`}
                    >
                      <div className={`text-[13px] font-semibold ${diferente ? "text-slate-200" : "text-slate-500"}`}>
                        {rotulo}
                      </div>
                      {diferente && <Badge variante="aviso">diferente</Badge>}
                    </td>
                    {ocorrencias.map((ocorrencia) => {
                      const valorBruto = ocorrencia[chave];
                      const ausente = valorBruto === null || valorBruto === "";
                      return (
                        <td
                          key={ocorrencia.ob}
                          className={`border-b border-l border-white/10 px-5 py-3.5 text-[13px] ${
                            ausente
                              ? "italic text-slate-600"
                              : diferente
                                ? "font-semibold text-slate-100"
                                : "text-slate-400"
                          }`}
                        >
                          {ausente ? "— ausente" : formatar(valorBruto)}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
