import { MENSAGENS } from "../../lib/mensagens";
import Alerta from "../ui/Alerta";
import Botao from "../ui/Botao";

interface Props {
  /** Rótulos das pastas operacionais faltando (ex.: "PDFs a Processar") —
   * vazio significa "nada pendente", e o componente não renderiza nada. */
  pastasFaltando: string[];
  aoConfigurar: () => void;
  /** "bloqueio" — mensagem de bloqueio de uma funcionalidade específica,
   * com a lista de pastas faltando (Processamento/Complemento/Finalização).
   * "banner" — aviso persistente e genérico do Hub, sem listar rótulos. */
  variante?: "bloqueio" | "banner";
}

// Organização Automática de PDFs — bloqueio de UX reutilizado em três
// lugares (SelecionarProcessar, FinalizarDiarias, Hub): nunca bloqueia o
// app inteiro, só a funcionalidade/aviso correspondente.
export default function AvisoConfiguracaoPendente({
  pastasFaltando,
  aoConfigurar,
  variante = "bloqueio",
}: Props) {
  if (pastasFaltando.length === 0) return null;

  if (variante === "banner") {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
        <span>Configuração de pastas incompleta. Algumas funções estão indisponíveis.</span>
        <Botao variante="secundaria" onClick={aoConfigurar}>
          Configurar agora
        </Botao>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Alerta variante="aviso">
        <div className="space-y-1">
          <p>{MENSAGENS.avisoPastasIncompletas}</p>
          <ul className="list-disc space-y-0.5 pl-5">
            {pastasFaltando.map((pasta) => (
              <li key={pasta}>{pasta}</li>
            ))}
          </ul>
        </div>
      </Alerta>
      <Botao variante="primaria" onClick={aoConfigurar}>
        Configurar agora
      </Botao>
    </div>
  );
}
