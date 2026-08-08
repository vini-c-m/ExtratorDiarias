import { SUPERFICIE_BASE } from "../../theme/estilos";
import { TIPOGRAFIA } from "../../theme/tipografia";
import type { CandidatoDiariaOriginal } from "../../types/conferencia";

interface Props {
  candidatos: CandidatoDiariaOriginal[];
  carregando: boolean;
}

function formatarData(iso: string): string {
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

// RN-15 (Continuidade Processual) — só lista candidatos e as evidências
// documentais que os tornaram candidatos, sempre em texto simples, nunca
// uma nota numérica/probabilidade. O sistema nunca vincula um candidato
// automaticamente: reconhecer um deles como a diária original é sempre
// uma decisão manual do usuário, feita fora desta tela (no próprio
// processo administrativo) — este painel é só informativo.
export default function PainelContinuidadeProcessual({ candidatos, carregando }: Props) {
  if (carregando) {
    return (
      <div className={`${SUPERFICIE_BASE} p-6`}>
        <h3 className={TIPOGRAFIA.subtitulo}>Continuidade Processual</h3>
        <p className={`mt-1.5 ${TIPOGRAFIA.textoAuxiliar}`}>Buscando candidatos...</p>
      </div>
    );
  }

  return (
    <div className={`${SUPERFICIE_BASE} p-6`}>
      <h3 className={TIPOGRAFIA.subtitulo}>Continuidade Processual</h3>
      <p className={`mt-1.5 ${TIPOGRAFIA.textoAuxiliar}`}>
        Diárias já lançadas para este CPF que podem ser a diária original deste complemento — confira
        as evidências e confirme manualmente antes de prosseguir. O sistema nunca vincula sozinho.
      </p>

      {candidatos.length === 0 ? (
        <p className={`mt-4 ${TIPOGRAFIA.texto}`}>Nenhum candidato encontrado.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {candidatos.map((candidato) => (
            <li
              key={`${candidato.registro.sei}-${candidato.registro.linha_planilha}`}
              className="rounded-lg border border-white/10 bg-white/[0.03] p-4"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className={TIPOGRAFIA.textoForte}>
                  {candidato.registro.servidor_nome ?? "Servidor não identificado"}
                </span>
                <span className={TIPOGRAFIA.legenda}>Linha {candidato.registro.linha_planilha}</span>
              </div>
              <div className="mt-1 text-xs text-slate-400">
                SEI {candidato.registro.sei}
                {candidato.registro.dh ? ` · DH ${candidato.registro.dh}` : ""} ·{" "}
                {formatarData(candidato.registro.periodo_inicial)} a{" "}
                {formatarData(candidato.registro.periodo_final)}
              </div>
              <ul className="mt-3 space-y-1.5 text-xs text-slate-300">
                {candidato.evidencias.map((evidencia, indice) => (
                  <li key={indice} className="flex gap-2">
                    <span aria-hidden="true" className="text-slate-500">
                      •
                    </span>
                    <span>{evidencia}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
