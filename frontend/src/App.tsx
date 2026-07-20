import { useState } from "react";
import Cabecalho, { type EstadoApp } from "./components/layout/Cabecalho";
import FundoDecorativo from "./components/layout/FundoDecorativo";
import LimiteDeErro from "./components/layout/LimiteDeErro";
import { useBackendStatus } from "./hooks/useBackendStatus";
import SelecionarProcessar from "./pages/SelecionarProcessar";

export default function App() {
  const status = useBackendStatus();
  // Sprint 09.2 — o cabeçalho deixou de mostrar o status técnico do backend
  // e passou a mostrar em que etapa do fluxo o app está; quem sabe disso é
  // `SelecionarProcessar` (fila/processamento/preenchimento são todos
  // estado dela), então ela reporta pra cima via `aoMudarEstado` em vez do
  // Cabeçalho tentar adivinhar.
  const [estadoApp, setEstadoApp] = useState<EstadoApp>("pronto");

  return (
    <div className="fundo-app relative min-h-screen">
      <FundoDecorativo />

      <div className="relative z-10">
        <Cabecalho status={status} estadoApp={estadoApp} />

        <LimiteDeErro>
          <SelecionarProcessar backendOnline={status === "conectado"} aoMudarEstado={setEstadoApp} />
        </LimiteDeErro>
      </div>
    </div>
  );
}
