import { useState } from "react";
import Cabecalho, { type EstadoApp } from "./components/layout/Cabecalho";
import ModalAlterarPlanilhaOficial from "./components/configuracao/ModalAlterarPlanilhaOficial";
import FundoDecorativo from "./components/layout/FundoDecorativo";
import LimiteDeErro from "./components/layout/LimiteDeErro";
import { useBackendStatus } from "./hooks/useBackendStatus";
import { useConfiguracao } from "./hooks/useConfiguracao";
import BoasVindas from "./pages/BoasVindas";
import Conferencia from "./pages/Conferencia";
import ConfiguracaoInicial from "./pages/ConfiguracaoInicial";
import Hub from "./pages/Hub";
import SelecionarProcessar from "./pages/SelecionarProcessar";

type Pagina = "boasvindas" | "hub" | "processamento" | "conferencia";

export default function App() {
  const status = useBackendStatus();
  // Sprint 15 — gate obrigatório de configuração: enquanto a planilha
  // oficial nunca tiver sido configurada, nenhuma outra tela é liberada —
  // nem mesmo Boas-vindas (§2 do doc arquitetural,
  // docs/configuracao-inicial/README.md).
  const { estado: configuracao, atualizar: atualizarConfiguracao } = useConfiguracao(
    status === "conectado",
  );
  // Sprint 09.2 — o cabeçalho deixou de mostrar o status técnico do backend
  // e passou a mostrar em que etapa do fluxo o app está; quem sabe disso é
  // `SelecionarProcessar` (fila/processamento/preenchimento são todos
  // estado dela), então ela reporta pra cima via `aoMudarEstado` em vez de
  // o Cabeçalho tentar adivinhar.
  const [estadoApp, setEstadoApp] = useState<EstadoApp>("pronto");

  // Sprint 14 — navegação em 4 telas: Boas-vindas → Hub → funcionalidade
  // (Processamento | Conferência), sempre nesta ordem, e sempre reversível
  // a partir de qualquer funcionalidade via "← Hub" no `Cabecalho`. Substitui
  // o par de botões de troca de aba da Sprint 13 — a escolha de
  // funcionalidade agora vive inteiramente no Hub. Continua sem
  // `react-router` (mesma decisão já registrada aqui desde a Sprint 13,
  // agora com 4 telas em vez de 2): app Electron de janela única, sem
  // necessidade de URL/histórico do navegador. `useState` local, sem
  // persistência — a Boas-vindas aparece a cada abertura do app, de
  // propósito (ver `docs/branding/README.md`).
  const [pagina, setPagina] = useState<Pagina>("boasvindas");
  // Sprint 15 — "Configurações" mínima (§11 do doc arquitetural): por
  // enquanto só abre "Alterar Planilha Oficial", acessível de qualquer
  // funcionalidade via o Cabecalho — nenhuma tela dedicada ainda.
  const [modalConfiguracoesAberto, setModalConfiguracoesAberto] = useState(false);

  // Sprint 15 — bloqueia Hub e Boas-vindas por igual enquanto não houver
  // nenhuma planilha oficial configurada (`configuracao` só é `null`
  // brevemente, antes da primeira resposta do backend). `atualizar` é
  // chamado ao clicar "Continuar" em `ConfiguracaoInicial`, o que refaz a
  // leitura e libera o restante do app assim que a configuração existir.
  if (configuracao && !configuracao.configurado) {
    return (
      <div className="fundo-app relative min-h-screen">
        <FundoDecorativo />
        <div className="relative z-10">
          <ConfiguracaoInicial aoConcluir={atualizarConfiguracao} />
        </div>
      </div>
    );
  }

  // A Boas-vindas é a única tela sem o `Cabecalho` de trabalho — é vitrine
  // de entrada, não uma etapa do fluxo de Processamento/Conferência (ver
  // `pages/BoasVindas.tsx`).
  if (pagina === "boasvindas") {
    return (
      <div className="fundo-app relative min-h-screen">
        <FundoDecorativo />
        <div className="relative z-10">
          <BoasVindas aoComecar={() => setPagina("hub")} />
        </div>
      </div>
    );
  }

  return (
    <div className="fundo-app relative min-h-screen">
      <FundoDecorativo />

      <div className="relative z-10">
        <Cabecalho
          status={status}
          estadoApp={estadoApp}
          aoVoltarAoHub={pagina !== "hub" ? () => setPagina("hub") : undefined}
          aoAbrirConfiguracoes={() => setModalConfiguracoesAberto(true)}
        />

        <LimiteDeErro>
          {pagina === "hub" && (
            <Hub
              backendOnline={status === "conectado"}
              aoSelecionarProcessamento={() => setPagina("processamento")}
              aoSelecionarConferencia={() => setPagina("conferencia")}
            />
          )}
          {pagina === "processamento" && (
            <SelecionarProcessar backendOnline={status === "conectado"} aoMudarEstado={setEstadoApp} />
          )}
          {pagina === "conferencia" && <Conferencia backendOnline={status === "conectado"} />}
        </LimiteDeErro>
      </div>

      {modalConfiguracoesAberto && (
        <ModalAlterarPlanilhaOficial
          onFechar={() => setModalConfiguracoesAberto(false)}
          aoConfigurar={atualizarConfiguracao}
        />
      )}
    </div>
  );
}
