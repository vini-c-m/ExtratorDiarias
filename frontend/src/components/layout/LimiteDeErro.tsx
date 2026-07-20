import { RotateCcw } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { GLOW_PERIGO } from "../../theme/estilos";
import { TIPOGRAFIA } from "../../theme/tipografia";
import Botao from "../ui/Botao";

interface Props {
  children: ReactNode;
}

interface State {
  erro: Error | null;
}

/** Rede de segurança para exceções inesperadas durante a renderização — sem
 * isso, um erro de interface (bug de UI, não de negócio) deixaria a janela
 * do Electron em branco, sem nenhuma explicação para quem está usando o
 * aplicativo. Erros de negócio (PDF corrompido, backend fora do ar) já são
 * tratados nas próprias telas via try/catch e nunca chegam aqui — este é
 * só o último recurso, para bugs de renderização não previstos. */
export default class LimiteDeErro extends Component<Props, State> {
  state: State = { erro: null };

  static getDerivedStateFromError(erro: Error): State {
    return { erro };
  }

  componentDidCatch(erro: Error, info: ErrorInfo): void {
    console.error("[LimiteDeErro] erro inesperado na interface:", erro, info.componentStack);
  }

  render() {
    if (this.state.erro) {
      return (
        <div className="flex min-h-screen items-center justify-center px-6">
          <div className={`max-w-md rounded-card border border-red-500/30 bg-white/5 p-8 text-center backdrop-blur-sm ${GLOW_PERIGO}`}>
            <h1 className={TIPOGRAFIA.titulo}>Ocorreu um erro inesperado na interface</h1>
            <p className={`mt-3 ${TIPOGRAFIA.texto}`}>
              Nenhum dado processado foi perdido. Tente novamente — se o problema persistir, feche
              e reabra o aplicativo.
            </p>
            <div className="mt-6">
              <Botao variante="primaria" onClick={() => this.setState({ erro: null })}>
                <RotateCcw aria-hidden="true" className="h-4 w-4" />
                Tentar novamente
              </Botao>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
