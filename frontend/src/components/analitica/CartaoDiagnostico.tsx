import { CORES_STATUS } from "../../theme/cores";
import { SUPERFICIE_BASE } from "../../theme/estilos";
import { TIPOGRAFIA } from "../../theme/tipografia";
import type { CasoDiagnosticoResposta, ClassificacaoDiagnostico } from "../../types/analitica";

interface Props {
  caso: CasoDiagnosticoResposta;
  /** Sprint 19.8.4 — opcional: `GET /diagnostico` conhece a classificação
   * agregada por registro (`RegistroDiagnosticadoResposta.classificacao`),
   * mas `GET /diarias/{sei}` (`DiariaCompletaResposta.diagnosticos`) só
   * expõe os casos crus, sem esse campo (contrato já homologado, § 12.5
   * — nunca inventado aqui, nunca recalculado no cliente a partir do
   * texto do caso, que duplicaria a lógica de classificação já resolvida
   * no backend, `app/domain/analitica/diagnostico.py`). Quando ausente,
   * o cartão mostra o mesmo conteúdo sem o selo de severidade — nunca
   * uma cor adivinhada. */
  classificacao?: ClassificacaoDiagnostico;
}

// RN-08 — "Inconsistência" nunca é vermelha (`erro`); usa a variante
// própria `critico` (laranja), distinta de `aviso` (âmbar) e `erro`
// (vermelho, reservado a falha técnica real). Mesmo mapeamento de cores
// que `PainelDiagnostico.tsx` usa para o resumo/tabela — um único lugar
// de tradução classificação → variante visual, nunca duas definições
// divergentes.
export const VARIANTE_POR_CLASSIFICACAO: Record<ClassificacaoDiagnostico, "sucesso" | "aviso" | "critico"> = {
  esperado: "sucesso",
  atencao: "aviso",
  inconsistencia: "critico",
};

export const ROTULO_POR_CLASSIFICACAO: Record<ClassificacaoDiagnostico, string> = {
  esperado: "Esperado",
  atencao: "Atenção",
  inconsistencia: "Inconsistência",
};

/** Sprint 19.8.4 (`v2-demonstracao-visual.md` § 8, "Mockup — lista +
 * cartão individual") — reaproveitado tanto em `PainelDiagnostico.tsx`
 * quanto em `PainelDetalhamentoDiaria.tsx` (§ 12.4/12.5, mesma estrutura
 * de dado nas duas telas, regra de não duplicar componente). Um cartão
 * por caso — um registro com múltiplos casos aplicáveis renderiza um
 * `CartaoDiagnostico` por caso, nunca um só cartão tentando resumir
 * vários motivos de uma vez. */
export default function CartaoDiagnostico({ caso, classificacao }: Props) {
  return (
    <div className={`p-5 ${SUPERFICIE_BASE}`}>
      <div className="flex flex-wrap items-center gap-2">
        {classificacao && (
          <>
            <span
              aria-hidden="true"
              className={`h-2.5 w-2.5 shrink-0 rounded-full ${CORES_STATUS[VARIANTE_POR_CLASSIFICACAO[classificacao]].ponto}`}
            />
            <span className={`${TIPOGRAFIA.textoForte} ${CORES_STATUS[VARIANTE_POR_CLASSIFICACAO[classificacao]].texto}`}>
              {ROTULO_POR_CLASSIFICACAO[classificacao]}
            </span>
            <span aria-hidden="true" className={TIPOGRAFIA.textoAuxiliar}>
              —
            </span>
          </>
        )}
        <h4 className={TIPOGRAFIA.subtitulo}>{caso.titulo}</h4>
      </div>

      {caso.campo && (
        <p className={`mt-3 ${TIPOGRAFIA.texto}`}>
          <span className={TIPOGRAFIA.textoForte}>Campo problemático:</span> {caso.campo}
        </p>
      )}
      <p className={`mt-2 ${TIPOGRAFIA.texto}`}>
        <span className={TIPOGRAFIA.textoForte}>Motivo provável:</span> {caso.motivo}
      </p>
      <p className={`mt-2 ${TIPOGRAFIA.texto}`}>
        <span className={TIPOGRAFIA.textoForte}>Ação recomendada:</span> {caso.acao_recomendada}
      </p>
    </div>
  );
}
