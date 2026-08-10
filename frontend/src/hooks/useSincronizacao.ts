import { useCallback, useEffect, useRef, useState } from "react";
import { mensagemAmigavel } from "../lib/mensagens";
import {
  ErroAnaliticaIndisponivel,
  SincronizacaoEmAndamentoError,
  consultarEstadoSincronizacao,
  dispararSincronizacaoManual,
} from "../services/api";
import type { EstadoSincronizacaoResposta } from "../types/analitica";

/** Resultado da última chamada a `sincronizarAgora` — `null` antes de
 * qualquer tentativa nesta sessão do módulo, ou quando a chamada mais
 * recente foi recusada por já haver outra em andamento (409, RN-A): esse
 * caso deliberadamente não vira uma variante própria aqui (correção
 * 18.4.3.1 — achado da auditoria consolidada das Sprints 18.4.1–18.4.3).
 * `sincronizando` (abaixo) já cobre a exibição "Sincronizando..." durante
 * a chamada; ao resolver, não há "resumo de execução" desta chamada para
 * reportar, então `ultimaExecucao` simplesmente não é alterado — o
 * componente cai no estado normal derivado de `dado` (já reatualizado),
 * nunca um estado travado. */
export type ResultadoUltimaExecucao =
  | { tipo: "sucesso" }
  | { tipo: "falha" }
  | { tipo: "planilha_indisponivel"; mensagem: string }
  | null;

export interface EstadoUseSincronizacao {
  /** `true` só durante a busca inicial (`GET /sincronizacao` ao montar) —
   * nunca durante o `sincronizarAgora`, que tem seu próprio `sincronizando`. */
  carregando: boolean;
  /** `true` quando a Base Local está indisponível (503) — falha técnica,
   * distinta de qualquer estado de negócio de `dado.status`. */
  erro: boolean;
  dado: EstadoSincronizacaoResposta | null;
  sincronizando: boolean;
  ultimaExecucao: ResultadoUltimaExecucao;
  atualizar: () => Promise<void>;
  sincronizarAgora: () => Promise<void>;
}

/** `GET`/`POST /api/v1/analitica/sincronizacao` (Sprint 17.4.6, homologado)
 * — verificação automática de frescor ao entrar no módulo (decisão 1 da
 * arquitetura de backend) + disparo manual. Mesmo padrão de
 * `useConfiguracao`: busca ao montar quando o backend está online, expõe
 * `atualizar` para uma nova leitura sob demanda — sem polling contínuo. */
export function useSincronizacao(backendOnline: boolean): EstadoUseSincronizacao {
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState(false);
  const [dado, setDado] = useState<EstadoSincronizacaoResposta | null>(null);
  const [sincronizando, setSincronizando] = useState(false);
  const [ultimaExecucao, setUltimaExecucao] = useState<ResultadoUltimaExecucao>(null);

  // Busca "silenciosa" (não mexe em `carregando`) — usada depois de
  // `sincronizarAgora`, para o resultado da tentativa (sucesso/falha/em
  // andamento) não ser imediatamente substituído por um flash de
  // "Verificando atualizações..." na tela.
  const buscarEstadoSilenciosamente = useCallback(async () => {
    try {
      const resultado = await consultarEstadoSincronizacao();
      setDado(resultado);
      setErro(false);
    } catch {
      setErro(true);
    }
  }, []);

  const atualizar = useCallback(async () => {
    setCarregando(true);
    await buscarEstadoSilenciosamente();
    setCarregando(false);
  }, [buscarEstadoSilenciosamente]);

  const sincronizarAgora = useCallback(async () => {
    setSincronizando(true);
    setUltimaExecucao(null);

    try {
      const resumo = await dispararSincronizacaoManual();
      setUltimaExecucao(resumo.status === "sucesso" ? { tipo: "sucesso" } : { tipo: "falha" });
    } catch (erroCaptura) {
      if (erroCaptura instanceof SincronizacaoEmAndamentoError) {
        // RN-A — outra sincronização já está em andamento; não é falha e
        // não há resumo de execução próprio a reportar. Deliberadamente
        // não define `ultimaExecucao` (correção 18.4.3.1): a busca
        // silenciosa logo abaixo já reflete o estado real, e nada fica
        // "preso" mostrando esta tentativa específica indefinidamente.
      } else if (erroCaptura instanceof ErroAnaliticaIndisponivel) {
        setUltimaExecucao({ tipo: "falha" });
      } else {
        setUltimaExecucao({
          tipo: "planilha_indisponivel",
          mensagem: mensagemAmigavel(erroCaptura, "Não foi possível sincronizar agora."),
        });
      }
    }

    // Sempre re-busca o estado depois de qualquer desfecho (inclusive
    // "em_andamento" e "planilha_indisponivel") — a sincronização
    // manual pode ter mudado `dado` mesmo quando esta chamada específica
    // não foi quem a completou (RN-A: outra chamada em paralelo).
    await buscarEstadoSilenciosamente();
    setSincronizando(false);
  }, [buscarEstadoSilenciosamente]);

  // MS UX (2026-08-10) — "ao entrar na Central Analítica, tentar
  // sincronizar automaticamente": substitui a antiga verificação de frescor
  // silenciosa (só `GET`, via `atualizar`) por uma chamada real ao MESMO
  // `sincronizarAgora` já homologado do botão manual (nenhum endpoint novo,
  // nenhuma lógica paralela) — dispara sozinha uma única vez, quando o
  // backend fica online. Sucesso automático não deixa rastro
  // (`ultimaExecucao.tipo === "sucesso"`, o indicador correspondente não
  // renderiza botão nenhum); falha automática popula `ultimaExecucao` com o
  // mesmo formato que uma falha manual já usa, então o botão de recuperação
  // aparece exatamente como apareceria se o usuário tivesse clicado e
  // falhado. `atualizar` continua exposto (retry explícito de leitura, ex.:
  // reabrir depois de `erro`), só deixou de ser quem dispara sozinho ao
  // montar.
  const disparouAutomaticoRef = useRef(false);
  useEffect(() => {
    if (!backendOnline || disparouAutomaticoRef.current) return;
    disparouAutomaticoRef.current = true;
    sincronizarAgora();
  }, [backendOnline, sincronizarAgora]);

  return { carregando, erro, dado, sincronizando, ultimaExecucao, atualizar, sincronizarAgora };
}
