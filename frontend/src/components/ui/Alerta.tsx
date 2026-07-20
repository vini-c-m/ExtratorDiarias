import { AlertCircle, AlertTriangle, CheckCircle2, Info } from "lucide-react";
import type { ReactNode } from "react";
import { CORES_STATUS, type VarianteStatus } from "../../theme/cores";

type Variante = Extract<VarianteStatus, "erro" | "aviso" | "info" | "sucesso">;

interface Props {
  variante?: Variante;
  children: ReactNode;
}

// Sprint UI 1.1 — ícone discreto por variante (Lucide), padronizado para
// todas as caixas de mensagem do app, mais uma pequena animação de
// surgimento (a mesma usada em cartões de resultado/relatório).
const ICONE: Record<Variante, typeof Info> = {
  sucesso: CheckCircle2,
  aviso: AlertTriangle,
  erro: AlertCircle,
  info: Info,
};

export default function Alerta({ variante = "info", children }: Props) {
  const Icone = ICONE[variante];

  return (
    <div
      role={variante === "erro" ? "alert" : "status"}
      className={`flex animate-entrada-conteudo items-start gap-2.5 rounded-lg border px-4 py-3 text-sm ${CORES_STATUS[variante].alerta}`}
    >
      <Icone aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
      <span>{children}</span>
    </div>
  );
}
