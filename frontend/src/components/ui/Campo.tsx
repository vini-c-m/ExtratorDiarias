import type { InputHTMLAttributes } from "react";
import { FOCO_ANEL } from "../../theme/estilos";
import { TIPOGRAFIA } from "../../theme/tipografia";

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  rotulo: string;
}

// Sprint 13 — primeiro campo de texto/data livre do app (até aqui só havia
// inputs de arquivo, `BotaoArquivo.tsx`); mesma superfície "vidro" discreta
// dos demais controles, raio de 14px (`rounded-lg`, igual botões/badges) e
// o mesmo anel de foco do resto do Design System — nenhum token novo.
export default function Campo({ rotulo, id, ...resto }: Props) {
  const campoId = id ?? `campo-${rotulo.toLowerCase().replace(/\s+/g, "-")}`;

  return (
    <div>
      <label htmlFor={campoId} className={`mb-1.5 block ${TIPOGRAFIA.legenda}`}>
        {rotulo}
      </label>
      <input
        id={campoId}
        {...resto}
        className={`w-full rounded-lg border border-white/[0.12] bg-white/[0.03] px-3.5 py-2.5 text-sm text-slate-200 transition placeholder:text-slate-600 disabled:cursor-not-allowed disabled:opacity-40 ${FOCO_ANEL}`}
      />
    </div>
  );
}
