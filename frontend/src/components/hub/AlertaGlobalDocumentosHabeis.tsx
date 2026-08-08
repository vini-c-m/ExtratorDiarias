import { useEffect, useRef } from "react";
import Alerta from "../ui/Alerta";
import Botao from "../ui/Botao";
import { useSincronizacao } from "../../hooks/useSincronizacao";
import { useDocumentosHabeisPendentes } from "../../hooks/useDocumentosHabeisPendentes";
import { TIPOGRAFIA } from "../../theme/tipografia";

interface Props {
  backendOnline: boolean;
  aoAbrirPendencias: () => void;
}

/** Alerta global de Documentos Hábeis Pendentes (entrada antecipada da tela
 * inicial) — reaproveita INTEGRALMENTE `useSincronizacao` (mesmo mecanismo
 * do botão "Sincronizar Agora" da Central Analítica, RN-A de concorrência
 * incluída, aplicada pelo backend em `POST /sincronizacao`) e
 * `useDocumentosHabeisPendentes` (mesma regra homologada de "Documentos
 * Hábeis Pendentes", sem filtro — recorte completo). Instância própria dos
 * dois hooks: a Central Analítica mantém a sua, sem nenhum estado
 * compartilhado — as duas sempre leem a mesma fonte no backend, então nunca
 * divergem em quantidade/regra; a proteção contra sincronização concorrente
 * já é feita pelo backend (409), reaproveitada automaticamente por
 * `useSincronizacao` nas duas instâncias. */
export default function AlertaGlobalDocumentosHabeis({ backendOnline, aoAbrirPendencias }: Props) {
  const { carregando, erro, dado, sincronizando, ultimaExecucao, sincronizarAgora } =
    useSincronizacao(backendOnline);

  // Só uma tentativa automática por montagem deste componente (ao abrir o
  // app, ou ao voltar para a tela inicial) — nunca um scheduler/polling.
  const tentouAutoSyncRef = useRef(false);

  useEffect(() => {
    if (!backendOnline || carregando || erro || sincronizando) return;
    if (dado?.status === "atualizado") return;
    if (tentouAutoSyncRef.current) return;
    tentouAutoSyncRef.current = true;
    sincronizarAgora();
  }, [backendOnline, carregando, erro, sincronizando, dado, sincronizarAgora]);

  if (!backendOnline || carregando) return null;

  const baseConfiavel = dado?.status === "atualizado";
  const falhaSincronizacao =
    !baseConfiavel &&
    !sincronizando &&
    (erro || ultimaExecucao?.tipo === "falha" || ultimaExecucao?.tipo === "planilha_indisponivel");

  if (sincronizando && !baseConfiavel) {
    return (
      <p role="status" className={`text-center ${TIPOGRAFIA.textoAuxiliar}`}>
        🔄 Atualizando dados da Planilha Oficial...
      </p>
    );
  }

  if (falhaSincronizacao) {
    return (
      <Alerta variante="aviso">
        <span className="block font-semibold">BASE LOCAL PRECISA SER ATUALIZADA</span>
        <span className="mt-1 block">
          Não foi possível atualizar os dados automaticamente. Sincronize para verificar Documentos
          Hábeis pendentes.
        </span>
        <Botao variante="secundaria" onClick={sincronizarAgora} disabled={sincronizando}>
          Sincronizar Agora
        </Botao>
      </Alerta>
    );
  }

  if (!baseConfiavel) return null;

  // `key` pelo carimbo de sincronização — remonta (e refaz a busca) sempre
  // que uma sincronização (automática aqui ou manual na Central Analítica,
  // ao retornar a esta tela) mudar o dado, nunca um contador congelado.
  return <ConteudoDocumentosHabeisPendentes key={dado?.sincronizado_em ?? "sem-sincronizacao"} aoAbrirPendencias={aoAbrirPendencias} />;
}

function ConteudoDocumentosHabeisPendentes({ aoAbrirPendencias }: { aoAbrirPendencias: () => void }) {
  const { carregando, erro, documentosHabeisPendentes } = useDocumentosHabeisPendentes({});

  if (carregando || erro || !documentosHabeisPendentes) return null;

  const { resumo, registros } = documentosHabeisPendentes;

  if (resumo.revisao_manual_necessaria > 0) {
    const texto =
      resumo.revisao_manual_necessaria === 1
        ? "1 processo atingiu a data de liberação e continua sem Documento Hábil."
        : `${resumo.revisao_manual_necessaria} processos atingiram a data de liberação e continuam sem Documento Hábil.`;

    return (
      <Alerta variante="aviso">
        <span className="block font-semibold">⚠ DOCUMENTOS HÁBEIS PENDENTES</span>
        <span className="mt-1 block">{texto}</span>
        <Botao variante="secundaria" onClick={aoAbrirPendencias}>
          Ver Pendências
        </Botao>
      </Alerta>
    );
  }

  if (resumo.aguardando_liberacao > 0) {
    const proximaLiberacao = registros.find((r) => r.situacao === "aguardando_liberacao")?.texto_contagem;
    const texto =
      resumo.aguardando_liberacao === 1
        ? "1 Documento Hábil aguardando data de liberação."
        : `${resumo.aguardando_liberacao} Documentos Hábeis aguardando data de liberação.`;

    return (
      <p className={`text-center ${TIPOGRAFIA.textoAuxiliar}`}>
        {texto}
        {proximaLiberacao ? ` ${proximaLiberacao}` : ""}
      </p>
    );
  }

  return (
    <p className={`text-center ${TIPOGRAFIA.textoAuxiliar}`}>
      ✓ Nenhum Documento Hábil exige atenção hoje.
    </p>
  );
}
