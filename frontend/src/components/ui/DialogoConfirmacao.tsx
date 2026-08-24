import { TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { GLOW_PERIGO, PAINEL_MODAL } from "../../theme/estilos";
import { TIPOGRAFIA } from "../../theme/tipografia";
import Botao from "./Botao";

interface Props {
  titulo: string;
  mensagem: ReactNode;
  rotuloConfirmar: string;
  rotuloCancelar: string;
  onConfirmar: () => void;
  onCancelar: () => void;
  /** Micro-sprint 3E.2 — opcional, default `false`: desabilita o botão de
   * confirmar (ex.: justificativa obrigatória ainda vazia, Relatório do
   * Portal da Transparência). Nenhum outro uso deste componente precisa
   * passar esta prop — comportamento existente inalterado. */
  confirmarDesabilitado?: boolean;
}

// Sprint 05.3 — primeiro diálogo de confirmação do app; sem componente de
// modal pré-existente para reaproveitar. Fica em `ui/` como os demais
// componentes genéricos (Botao, Alerta) para reuso futuro além do fluxo de
// cancelamento de processamento.
// Sprint 05.2 — painel/sombra/raio e a pequena animação de entrada agora
// vêm do Design System (`PAINEL_MODAL`), a mesma superfície usada por
// qualquer outro modal/dropdown futuro do app.
export default function DialogoConfirmacao({
  titulo,
  mensagem,
  rotuloConfirmar,
  rotuloCancelar,
  onConfirmar,
  onCancelar,
  confirmarDesabilitado = false,
}: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="dialogo-confirmacao-titulo"
        className={`w-full max-w-md p-8 ${PAINEL_MODAL}`}
      >
        <div className="flex items-center gap-3.5">
          <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-red-500/10 text-red-400 ${GLOW_PERIGO}`}>
            <TriangleAlert aria-hidden="true" className="h-6 w-6" />
          </span>
          <h2 id="dialogo-confirmacao-titulo" className={TIPOGRAFIA.titulo}>
            {titulo}
          </h2>
        </div>
        <div className={`mt-4 whitespace-pre-line ${TIPOGRAFIA.texto}`}>{mensagem}</div>

        <div className="mt-7 flex justify-end gap-3">
          <Botao variante="secundaria" onClick={onCancelar} autoFocus>
            {rotuloCancelar}
          </Botao>
          <Botao variante="perigo" onClick={onConfirmar} disabled={confirmarDesabilitado}>
            {rotuloConfirmar}
          </Botao>
        </div>
      </div>
    </div>
  );
}
