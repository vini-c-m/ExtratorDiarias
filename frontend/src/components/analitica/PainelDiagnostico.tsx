import { useState } from "react";
import { CORES_STATUS } from "../../theme/cores";
import { SUPERFICIE_BASE } from "../../theme/estilos";
import { TIPOGRAFIA } from "../../theme/tipografia";
import type { CasoDiagnosticoResposta, ClassificacaoDiagnostico, ParametrosPesquisaDiariasQuery, ResumoDiagnosticoResposta } from "../../types/analitica";
import { useDiagnostico } from "../../hooks/useDiagnostico";
import { formatarPeriodoBr } from "../../lib/datas";
import { ROTULO_POR_CLASSIFICACAO, VARIANTE_POR_CLASSIFICACAO } from "./CartaoDiagnostico";
import Alerta from "../ui/Alerta";
import Badge from "../ui/Badge";
import Botao from "../ui/Botao";

interface Props {
  filtros: ParametrosPesquisaDiariasQuery;
  aoVoltar: () => void;
  /** Sprint 19.8.4 — "▸ Ver" abre o mesmo painel de detalhamento já
   * conhecido (`PainelDetalhamentoDiaria`, § 5) — reaproveitado, nunca
   * uma tela nova; quem monta os dois (`CentralAnalitica.tsx`) decide
   * como conectar este callback ao `sei` selecionado. */
  aoSelecionarRegistro: (sei: string) => void;
  /** Correção de regressão (2026-08-07) — quando a tela é aberta a partir
   * de um insight específico do Modo Executivo (ex.: "8 casos de possível
   * duplicidade"), a tabela nasce já filtrada só para esse caso — nunca
   * mais a lista inteira do recorte. Mesmo padrão já homologado em
   * `PainelDocumentosHabeisPendentes.filtroInicial`: filtro aplicado só na
   * APRESENTAÇÃO, sobre os mesmos `registros` já buscados por
   * `useDiagnostico` — nenhuma nova classificação, nenhuma chamada extra.
   * `titulo` casa contra `registro.casos[].titulo` (mesmos títulos de
   * `app/domain/analitica/diagnostico.py`, reaproveitados por
   * `insightsExecutivos.ts`). */
  filtroInicial?: { titulo: string; rotulo: string } | null;
}

const ORDEM_CLASSIFICACAO: ClassificacaoDiagnostico[] = ["esperado", "atencao", "inconsistencia"];

function camposProblematicos(casos: CasoDiagnosticoResposta[]): string {
  const campos = casos.map((caso) => caso.campo).filter((campo): campo is string => campo !== null);
  return campos.length > 0 ? Array.from(new Set(campos)).join(", ") : "—";
}

function percentual(contagem: number, total: number): number {
  return total > 0 ? Math.round((contagem / total) * 100) : 0;
}

function textoResumo(resumo: ResumoDiagnosticoResposta): string {
  const merecemAtencao = resumo.atencao + resumo.inconsistencia;
  if (merecemAtencao === 0) return "Nenhum registro deste recorte merece atenção ou conferência manual.";
  return `${merecemAtencao} registro${merecemAtencao === 1 ? "" : "s"} merece${merecemAtencao === 1 ? "" : "m"} atenção ou conferência manual.`;
}

/** Sprint 19.8.4 (`v2-demonstracao-visual.md` § 8) — Análise Rápida /
 * Diagnóstico: resumo por classificação (barra proporcional + contagens)
 * e a lista de registros do recorte, cada um com a classificação e os
 * campos problemáticos. RN-08: "Inconsistência" nunca é vermelha — usa a
 * variante `critico` (laranja), distinta de `erro` (vermelho, reservado
 * a falha técnica real, `v2-demonstracao-visual.md` § 8, "Decisões de
 * UX"). */
export default function PainelDiagnostico({ filtros, aoVoltar, aoSelecionarRegistro, filtroInicial }: Props) {
  const { carregando, erro, diagnostico, tentarNovamente } = useDiagnostico(filtros);
  const [filtroCaso, setFiltroCaso] = useState(filtroInicial ?? null);

  const botaoVoltar = (
    <Botao variante="secundaria" onClick={aoVoltar}>
      ← Voltar aos resultados
    </Botao>
  );

  const resumoPeriodo =
    filtros.periodo_inicial && filtros.periodo_final
      ? formatarPeriodoBr(filtros.periodo_inicial, filtros.periodo_final)
      : null;

  if (erro !== null) {
    return (
      <div className="space-y-6">
        {botaoVoltar}
        <div className={`p-5 ${SUPERFICIE_BASE}`}>
          <div className="flex items-center justify-between gap-4">
            <Alerta variante="erro">{erro}</Alerta>
            <Botao variante="secundaria" onClick={tentarNovamente}>
              Tentar novamente
            </Botao>
          </div>
        </div>
      </div>
    );
  }

  if (carregando || diagnostico === null) {
    return (
      <div className="space-y-6">
        {botaoVoltar}
        <div role="status" className={`flex items-center justify-center p-16 ${SUPERFICIE_BASE}`}>
          <p className={TIPOGRAFIA.textoAuxiliar}>Analisando o recorte...</p>
        </div>
      </div>
    );
  }

  const { resumo, registros } = diagnostico;
  const total = resumo.esperado + resumo.atencao + resumo.inconsistencia;
  const percentuais = {
    esperado: percentual(resumo.esperado, total),
    atencao: percentual(resumo.atencao, total),
    inconsistencia: percentual(resumo.inconsistencia, total),
  };
  const registrosExibidos = filtroCaso
    ? registros.filter((registro) => registro.casos.some((caso) => caso.titulo === filtroCaso.titulo))
    : registros;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {botaoVoltar}
        <p className={TIPOGRAFIA.textoAuxiliar}>
          Diagnóstico · {filtroCaso ? `${registrosExibidos.length} de ${total}` : total} registro
          {(filtroCaso ? registrosExibidos.length : total) === 1 ? "" : "s"}
          {resumoPeriodo ? ` · ${resumoPeriodo}` : ""}
        </p>
      </div>

      {filtroCaso && (
        <div className={`flex flex-wrap items-center justify-between gap-3 p-3 ${SUPERFICIE_BASE}`}>
          <span className={TIPOGRAFIA.texto}>
            Filtrado por: <strong className={TIPOGRAFIA.textoForte}>{filtroCaso.rotulo}</strong> (
            {registrosExibidos.length} de {total})
          </span>
          <Botao variante="secundaria" onClick={() => setFiltroCaso(null)}>
            Ver todos
          </Botao>
        </div>
      )}

      {total === 0 ? (
        <div className={`p-8 text-center ${SUPERFICIE_BASE}`}>
          <p className={TIPOGRAFIA.texto}>Nenhum registro neste recorte para diagnosticar.</p>
        </div>
      ) : (
        <div className={`p-5 ${SUPERFICIE_BASE}`}>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            {ORDEM_CLASSIFICACAO.map((classificacao) => (
              <div key={classificacao} className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className={`h-2.5 w-2.5 rounded-full ${CORES_STATUS[VARIANTE_POR_CLASSIFICACAO[classificacao]].ponto}`}
                />
                <span className={TIPOGRAFIA.texto}>
                  {ROTULO_POR_CLASSIFICACAO[classificacao]} {resumo[classificacao]} ({percentuais[classificacao]}%)
                </span>
              </div>
            ))}
          </div>

          {/* Barra proporcional — decorativa (`aria-hidden`); o texto
              equivalente já está nas contagens acima, nunca só cor/tamanho
              do segmento (`v2-demonstracao-visual.md` § 8, "Decisões de
              acessibilidade"). */}
          <div aria-hidden="true" className="mt-3 flex h-2 overflow-hidden rounded-full bg-white/5">
            {ORDEM_CLASSIFICACAO.filter((c) => resumo[c] > 0).map((classificacao) => (
              <div
                key={classificacao}
                style={{ width: `${percentuais[classificacao]}%` }}
                className={CORES_STATUS[VARIANTE_POR_CLASSIFICACAO[classificacao]].ponto}
              />
            ))}
          </div>

          <p className={`mt-4 border-t border-white/10 pt-4 ${TIPOGRAFIA.texto}`}>{textoResumo(resumo)}</p>
        </div>
      )}

      {total > 0 && registrosExibidos.length === 0 && (
        <div className={`p-8 text-center ${SUPERFICIE_BASE}`}>
          <p className={TIPOGRAFIA.texto}>Nenhum registro deste recorte se encaixa neste filtro.</p>
        </div>
      )}

      {registrosExibidos.length > 0 && (
        <div className={`overflow-x-auto ${SUPERFICIE_BASE}`}>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className={TIPOGRAFIA.legenda}>
                <th className="px-5 py-3.5 font-medium">SEI</th>
                <th className="px-5 py-3.5 font-medium">Classificação</th>
                <th className="px-5 py-3.5 font-medium">Campo problemático</th>
                <th className="px-5 py-3.5" aria-hidden="true" />
              </tr>
            </thead>
            <tbody>
              {registrosExibidos.map((registro) => (
                <tr
                  key={registro.sei}
                  tabIndex={0}
                  aria-label={`Ver diagnóstico da diária ${registro.sei}`}
                  onClick={() => aoSelecionarRegistro(registro.sei)}
                  onKeyDown={(evento) => {
                    if (evento.key !== "Enter" && evento.key !== " ") return;
                    evento.preventDefault();
                    aoSelecionarRegistro(registro.sei);
                  }}
                  className="cursor-pointer border-t border-white/5 text-slate-300 transition-colors even:bg-white/[0.02] hover:bg-white/[0.05]"
                >
                  <td className="px-5 py-3.5">{registro.sei}</td>
                  <td className="px-5 py-3.5">
                    <Badge variante={VARIANTE_POR_CLASSIFICACAO[registro.classificacao]}>
                      {ROTULO_POR_CLASSIFICACAO[registro.classificacao]}
                    </Badge>
                  </td>
                  <td className="px-5 py-3.5">{camposProblematicos(registro.casos)}</td>
                  <td className="px-5 py-3.5 text-cyan-400">▸ Ver</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
