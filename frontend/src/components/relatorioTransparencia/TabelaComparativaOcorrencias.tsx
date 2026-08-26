import { FOCO_ANEL, SCROLL_FINO, SUPERFICIE_BASE } from "../../theme/estilos";
import { TIPOGRAFIA } from "../../theme/tipografia";
import Badge from "../ui/Badge";
import type { OcorrenciaRelatorioTransparencia } from "../../types/relatorioTransparencia";

type ChaveCampo = keyof Omit<OcorrenciaRelatorioTransparencia, "ob" | "identidade">;

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
  /** HOMO-RT-02 — chaveada por `ocorrencia.identidade`, NUNCA por
   * `ocorrencia.ob`: um grupo RN04 por repetição física (I11) pode ter
   * duas ocorrências com a MESMA OB, e `ob` sozinha não as distingue —
   * usar `ob` aqui reacoplaria os dois checkboxes (HOMO-RT-02). */
  selecionadas: Set<string>;
  onAlternarSelecao: (identidade: string) => void;
  desabilitado?: boolean;
}

interface GrupoOcorrencia {
  identidade: string;
  ocorrencias: OcorrenciaRelatorioTransparencia[];
}

// Micro-sprint "Duplicatas idênticas" — duas ou mais ocorrências FÍSICAS
// materialmente idênticas (mesma OB, mesmo conteúdo) recebem a MESMA
// `identidade` (o backend já as trata como uma única classe, sem base
// lógica para distingui-las — `identidades_ocorrencias`, HOMO-RT-04).
// Antes desta correção, cada uma virava sua PRÓPRIA coluna com seu
// PRÓPRIO checkbox — como os dois checkboxes liam/escreviam a MESMA
// `identidade`, marcar um marcava visualmente "os dois" ao mesmo tempo,
// dando a falsa impressão de dois controles independentes que na verdade
// eram sempre a mesma seleção por baixo. Agrupar por `identidade` ANTES de
// renderizar elimina a ambiguidade: existe UMA coluna, UM checkbox, por
// classe — nunca "vários checkboxes falsamente independentes".
function agruparPorIdentidade(ocorrencias: OcorrenciaRelatorioTransparencia[]): GrupoOcorrencia[] {
  const grupos: GrupoOcorrencia[] = [];
  const indicePorIdentidade = new Map<string, number>();
  for (const ocorrencia of ocorrencias) {
    const indiceExistente = indicePorIdentidade.get(ocorrencia.identidade);
    if (indiceExistente === undefined) {
      indicePorIdentidade.set(ocorrencia.identidade, grupos.length);
      grupos.push({ identidade: ocorrencia.identidade, ocorrencias: [ocorrencia] });
    } else {
      grupos[indiceExistente].ocorrencias.push(ocorrencia);
    }
  }
  return grupos;
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
  const grupos = agruparPorIdentidade(ocorrencias);
  return (
    <div>
      {camposIguais.length > 0 && (
        <div className="mb-3.5 flex flex-wrap items-center gap-2">
          <span className={TIPOGRAFIA.legenda}>
            {grupos.length === 2 ? "Iguais nas duas ocorrências:" : "Iguais em todas as ocorrências:"}
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
                {grupos.map((grupo) => {
                  const representante = grupo.ocorrencias[0];
                  const marcado = selecionadas.has(grupo.identidade);
                  const classeIdentica = grupo.ocorrencias.length > 1;
                  return (
                    <th
                      key={grupo.identidade}
                      className="sticky top-0 z-10 border-b border-l border-white/10 bg-[#0b1120] px-5 py-4 text-left align-top"
                    >
                      <label className={`flex cursor-pointer items-start gap-2.5 ${desabilitado ? "opacity-50" : ""}`}>
                        <input
                          type="checkbox"
                          className={`mt-0.5 h-5 w-5 rounded-md border-white/20 bg-white/[0.03] text-cyan-400 accent-cyan-400 ${FOCO_ANEL}`}
                          checked={marcado}
                          disabled={desabilitado}
                          onChange={() => onAlternarSelecao(grupo.identidade)}
                        />
                        <span>
                          <span className="block text-[13px] font-bold text-slate-50">{representante.ob}</span>
                          <span className="mt-0.5 block text-xs font-semibold text-emerald-300">
                            {formatarValor(representante.valor)}
                          </span>
                          {classeIdentica && (
                            <span className="mt-1.5 block">
                              <Badge variante="aviso">
                                {grupo.ocorrencias.length} ocorrências físicas idênticas
                              </Badge>
                              <span className={`mt-1 block ${TIPOGRAFIA.legenda}`}>
                                Selecionar publica só 1 destas ocorrências
                              </span>
                            </span>
                          )}
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
                    {grupos.map((grupo) => {
                      const representante = grupo.ocorrencias[0];
                      const valorBruto = representante[chave];
                      const ausente = valorBruto === null || valorBruto === "";
                      return (
                        <td
                          key={grupo.identidade}
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
