import { useCallback, useRef, useState } from "react";
import { mensagemAmigavel } from "../lib/mensagens";
import {
  prepararRelatorioTransparencia,
  registrarDecisaoRevisaoRelatorioTransparencia,
} from "../services/api";
import type {
  ParametrosFontesRelatorioTransparencia,
  ResumoRelatorioTransparencia,
} from "../types/relatorioTransparencia";

/** Micro-sprint 3E.1 — máquina de estados do módulo "Relatório do Portal da
 * Transparência", mesmo padrão de `useGerarRelatorio.ts` (união
 * discriminada, nenhuma aresta inventada além das desenhadas abaixo):
 *
 * ```
 * Entrada --> Entrada: "Preparar Relatório" falhou (erro)
 * Entrada --> Resumo: POST /preparar bem-sucedido
 * Resumo --> Revisao: "Revisar N Casos" (só quando há pendências)
 * Revisao --> Revisao: decisão confirmada, ainda restam casos pendentes
 * Revisao --> Resumo: decisão confirmada, nenhum caso pendente restante
 * Revisao --> Revisao: decisão falhou (erro, resumo INALTERADO)
 * Resumo --> Entrada: "Selecionar outra competência ou fontes"
 * ```
 *
 * A AUTORIDADE sobre quais casos ainda precisam de revisão, se o relatório
 * pode ser gerado, e o resultado de cada decisão é SEMPRE o `resumo`
 * devolvido pelo backend — este hook nunca recalcula nada disso, só guarda
 * o último `resumo` recebido e decide para qual fase ir a partir dele
 * (`estado === "decidida"` ou não, `pode_gerar_relatorio`). Nenhuma regra
 * RN01-RN07 é reproduzida aqui. */
export type FaseRelatorioTransparencia =
  | { fase: "entrada"; erro: string | null }
  | { fase: "resumo"; resumo: ResumoRelatorioTransparencia }
  | { fase: "revisao"; resumo: ResumoRelatorioTransparencia; erro: string | null };

const ESTADO_INICIAL: FaseRelatorioTransparencia = { fase: "entrada", erro: null };

/** Único critério de "ainda precisa de decisão humana" — os 3 estados que
 * `pode_gerar_relatorio` (calculado pelo backend) trata como bloqueio.
 * Repetido aqui só para navegação de tela (qual caso mostrar a seguir),
 * nunca para decidir se o relatório PODE ser gerado — isso continua sendo
 * `resumo.pode_gerar_relatorio`, lido diretamente do backend. */
function casosQuePrecisamDeRevisao(resumo: ResumoRelatorioTransparencia) {
  return resumo.revisoes.filter((revisao) => revisao.estado !== "decidida");
}

export interface EstadoUseRelatorioTransparencia {
  estado: FaseRelatorioTransparencia;
  preparando: boolean;
  enviandoDecisao: boolean;
  /** Micro-sprint 3H — os 5 parâmetros de fonte da preparação em curso,
   * para a geração final do XLSX reenviar sem duplicar estado próprio na
   * página (mesma fonte que `parametrosFontesRef` já guarda internamente).
   * `null` antes de qualquer "Preparar Relatório" bem-sucedido, ou depois
   * de "Selecionar outra competência ou fontes". */
  parametrosFontesAtuais: ParametrosFontesRelatorioTransparencia | null;
  preparar: (parametros: ParametrosFontesRelatorioTransparencia) => Promise<void>;
  iniciarRevisao: () => void;
  confirmarDecisao: (
    identidadeGrupo: string,
    obsSelecionadas: string[],
    autor: string,
    observacao?: string,
  ) => Promise<void>;
  adiarCaso: (identidadeGrupo: string, autor: string) => Promise<void>;
  voltarParaEntrada: () => void;
}

export function useRelatorioTransparencia(): EstadoUseRelatorioTransparencia {
  const [estado, setEstado] = useState<FaseRelatorioTransparencia>(ESTADO_INICIAL);

  // Sem sessão no backend (item 9 da especificação 3D): os 5 parâmetros de
  // fonte precisam ser reenviados em toda decisão, nunca só na preparação.
  // `useRef`: nunca deve causar re-render por si só, é só "lembrar o que o
  // usuário escolheu na Tela 1" para reusar depois.
  const parametrosFontesRef = useRef<ParametrosFontesRelatorioTransparencia | null>(null);
  const [parametrosFontesAtuais, setParametrosFontesAtuais] =
    useState<ParametrosFontesRelatorioTransparencia | null>(null);

  // Trava síncrona contra reentrância (mesmo padrão de `processandoRef`/
  // `carregandoPreVisualizacaoRef` já homologado no app) — necessária
  // porque a fase não muda enquanto a chamada está em voo, então só o
  // `useState` não bloqueia um segundo clique antes do primeiro re-render.
  const preparandoRef = useRef(false);
  const [preparando, setPreparando] = useState(false);
  const enviandoDecisaoRef = useRef(false);
  const [enviandoDecisao, setEnviandoDecisao] = useState(false);

  const preparar = useCallback(async (parametros: ParametrosFontesRelatorioTransparencia) => {
    if (preparandoRef.current) return;
    preparandoRef.current = true;
    setPreparando(true);
    try {
      const resumo = await prepararRelatorioTransparencia(parametros);
      parametrosFontesRef.current = parametros;
      setParametrosFontesAtuais(parametros);
      setEstado({ fase: "resumo", resumo });
    } catch (erroCaptura) {
      setEstado({
        fase: "entrada",
        erro: mensagemAmigavel(erroCaptura, "Não foi possível preparar o relatório."),
      });
    } finally {
      preparandoRef.current = false;
      setPreparando(false);
    }
  }, []);

  const iniciarRevisao = useCallback(() => {
    setEstado((atual) => (atual.fase === "resumo" ? { fase: "revisao", resumo: atual.resumo, erro: null } : atual));
  }, []);

  const registrarDecisao = useCallback(
    async (
      identidadeGrupo: string,
      acao: "publicar" | "adiar",
      obsSelecionadas: string[],
      autor: string,
      observacao?: string,
    ) => {
      if (enviandoDecisaoRef.current) return;
      if (!parametrosFontesRef.current) return;
      enviandoDecisaoRef.current = true;
      setEnviandoDecisao(true);
      try {
        const resumoAtualizado = await registrarDecisaoRevisaoRelatorioTransparencia(
          identidadeGrupo,
          parametrosFontesRef.current,
          { acao, obs_selecionadas: obsSelecionadas, autor, observacao },
        );
        const aindaHaPendencias = casosQuePrecisamDeRevisao(resumoAtualizado).length > 0;
        setEstado(
          aindaHaPendencias
            ? { fase: "revisao", resumo: resumoAtualizado, erro: null }
            : { fase: "resumo", resumo: resumoAtualizado },
        );
      } catch (erroCaptura) {
        setEstado((atual) =>
          atual.fase === "revisao"
            ? { ...atual, erro: mensagemAmigavel(erroCaptura, "Não foi possível registrar a decisão.") }
            : atual,
        );
      } finally {
        enviandoDecisaoRef.current = false;
        setEnviandoDecisao(false);
      }
    },
    [],
  );

  const confirmarDecisao = useCallback(
    (identidadeGrupo: string, obsSelecionadas: string[], autor: string, observacao?: string) =>
      registrarDecisao(identidadeGrupo, "publicar", obsSelecionadas, autor, observacao),
    [registrarDecisao],
  );

  const adiarCaso = useCallback(
    (identidadeGrupo: string, autor: string) => registrarDecisao(identidadeGrupo, "adiar", [], autor),
    [registrarDecisao],
  );

  const voltarParaEntrada = useCallback(() => {
    parametrosFontesRef.current = null;
    setParametrosFontesAtuais(null);
    setEstado({ fase: "entrada", erro: null });
  }, []);

  return {
    estado,
    preparando,
    enviandoDecisao,
    parametrosFontesAtuais,
    preparar,
    iniciarRevisao,
    confirmarDecisao,
    adiarCaso,
    voltarParaEntrada,
  };
}
