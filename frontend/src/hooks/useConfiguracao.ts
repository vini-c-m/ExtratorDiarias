import { useCallback, useEffect, useState } from "react";
import { buscarConfiguracao } from "../services/api";
import type { EstadoConfiguracao } from "../types/configuracao";

// Sprint 15 — Configuração Inicial da Planilha Oficial. Mesmo espírito de
// `useBackendStatus`: busca o estado uma vez que o backend fica saudável,
// e expõe `atualizar` para quem acabou de configurar/alterar a planilha
// forçar uma nova leitura (em vez de esperar um polling).
export function useConfiguracao(backendOnline: boolean) {
  const [estado, setEstado] = useState<EstadoConfiguracao | null>(null);

  const atualizar = useCallback(async () => {
    try {
      setEstado(await buscarConfiguracao());
    } catch {
      // Backend momentaneamente indisponível — mantém o último estado
      // conhecido; `useBackendStatus` já cobre o indicador de conexão.
    }
  }, []);

  useEffect(() => {
    if (!backendOnline) return;
    atualizar();
  }, [backendOnline, atualizar]);

  return { estado, atualizar };
}
