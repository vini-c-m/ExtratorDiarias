import { useEffect, useState } from "react";
import { checarSaudeBackend } from "../services/api";

export type StatusBackend = "verificando" | "conectado" | "offline";

export function useBackendStatus(intervaloMs = 2000): StatusBackend {
  const [status, setStatus] = useState<StatusBackend>("verificando");

  useEffect(() => {
    let cancelado = false;

    async function verificar() {
      const online = await checarSaudeBackend();
      if (!cancelado) setStatus(online ? "conectado" : "offline");
    }

    verificar();
    const intervalo = setInterval(verificar, intervaloMs);
    return () => {
      cancelado = true;
      clearInterval(intervalo);
    };
  }, [intervaloMs]);

  return status;
}
