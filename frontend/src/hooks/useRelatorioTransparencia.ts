import { useCallback, useRef, useState } from "react";
import { mensagemAmigavel } from "../lib/mensagens";
import {
  CoberturaEfiscoInsuficienteError,
  prepararRelatorioTransparencia,
  registrarDecisaoRevisaoRelatorioTransparencia,
} from "../services/api";
import type {
  ParametrosFontesRelatorioTransparencia,
  ResumoRelatorioTransparencia,
} from "../types/relatorioTransparencia";

/** Sprint D.1 (P2, cobertura parcial E-Fisco) — estado dedicado (fora da
 * união discriminada de `FaseRelatorioTransparencia`): "preparar" falhou
 * por um motivo ESTRUTURADO e acionável (não um erro genérico), então a
 * Tela 1 continua na fase "entrada" mas com informação suficiente para
 * oferecer as duas ações (atualizar a fonte / prosseguir explicitamente
 * sob cobertura parcial) sem reparsear texto de erro. */
export interface CoberturaInsuficienteInfo {
  mensagem: string;
  coberturaPagaAte: string | null;
}

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
  /** Sprint D.1 (P2) — preenchido quando o último "Preparar Relatório"
   * falhou especificamente por cobertura insuficiente da Base E-Fisco;
   * `null` em qualquer outro caso (sucesso, ou outro tipo de erro — esses
   * continuam em `estado.erro`, mensagem genérica). Nunca os dois ao mesmo
   * tempo (`preparar` limpa um antes de tentar setar o outro). */
  coberturaInsuficiente: CoberturaInsuficienteInfo | null;
  preparar: (parametros: ParametrosFontesRelatorioTransparencia) => Promise<void>;
  /** Sprint D.1 (P2) — reenvia exatamente os últimos parâmetros tentados
   * (que falharam por cobertura insuficiente), com `aceitar_cobertura_
   * parcial: true` — nunca pede ao usuário para preencher o formulário de
   * novo. Não faz nada se não houver uma tentativa anterior de cobertura
   * insuficiente em aberto. */
  repetirComCoberturaParcial: () => Promise<void>;
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

  // Sprint D.1 (P2) — os ÚLTIMOS parâmetros TENTADOS (sucesso ou falha),
  // distinto de `parametrosFontesRef` (que só guarda os de uma preparação
  // BEM-SUCEDIDA): "Gerar com cobertura parcial" precisa reenviar
  // exatamente o que acabou de falhar, com um único campo a mais.
  const ultimosParametrosTentadosRef = useRef<ParametrosFontesRelatorioTransparencia | null>(null);
  const [coberturaInsuficiente, setCoberturaInsuficiente] = useState<CoberturaInsuficienteInfo | null>(null);

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
    ultimosParametrosTentadosRef.current = parametros;
    setCoberturaInsuficiente(null);
    try {
      const resumo = await prepararRelatorioTransparencia(parametros);
      parametrosFontesRef.current = parametros;
      setParametrosFontesAtuais(parametros);
      setEstado({ fase: "resumo", resumo });
    } catch (erroCaptura) {
      // Sprint D.1 (P2) — cobertura insuficiente é um resultado ACIONÁVEL
      // (duas ações claras), nunca um erro genérico de "entrada.erro": a
      // tela precisa saber a data-limite comprovada para oferecer "Gerar
      // com cobertura parcial" sem reparsear a mensagem.
      if (erroCaptura instanceof CoberturaEfiscoInsuficienteError) {
        setCoberturaInsuficiente({
          mensagem: erroCaptura.message,
          coberturaPagaAte: erroCaptura.coberturaPagaAte,
        });
        setEstado({ fase: "entrada", erro: null });
        return;
      }
      setEstado({
        fase: "entrada",
        erro: mensagemAmigavel(erroCaptura, "Não foi possível preparar o relatório."),
      });
    } finally {
      preparandoRef.current = false;
      setPreparando(false);
    }
  }, []);

  const repetirComCoberturaParcial = useCallback(async () => {
    if (!ultimosParametrosTentadosRef.current) return;
    await preparar({ ...ultimosParametrosTentadosRef.current, aceitar_cobertura_parcial: true });
  }, [preparar]);

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
    ultimosParametrosTentadosRef.current = null;
    setParametrosFontesAtuais(null);
    setCoberturaInsuficiente(null);
    setEstado({ fase: "entrada", erro: null });
  }, []);

  return {
    estado,
    preparando,
    enviandoDecisao,
    parametrosFontesAtuais,
    coberturaInsuficiente,
    preparar,
    repetirComCoberturaParcial,
    iniciarRevisao,
    confirmarDecisao,
    adiarCaso,
    voltarParaEntrada,
  };
}
