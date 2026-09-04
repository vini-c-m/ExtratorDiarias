import { forwardRef, type ChangeEvent, type ReactNode } from "react";
import { EFEITO_RIPPLE } from "../../theme/estilos";

interface Props {
  children: ReactNode;
  accept: string;
  multiplo?: boolean;
  desabilitado?: boolean;
  titulo?: string;
  onChange: (evento: ChangeEvent<HTMLInputElement>) => void;
}

// Sprint 05.2 — antes desta Sprint este padrão ("rótulo que parece botão"
// escondendo um <input type=file>) existia duplicado duas vezes dentro de
// SelecionarProcessar.tsx (seleção de PDFs e de planilha), cada cópia com
// sua própria classe hardcoded — e sem foco de teclado, já que o input usava
// `hidden` (display:none remove o elemento da árvore de acessibilidade, Tab
// pulava direto por cima dele). Vira um componente único aqui: o input passa
// a ser `sr-only` (visualmente escondido, mas alcançável via Tab) e o anel
// de foco aparece no rótulo via `has-[:focus-visible]`.
// Sprint D.1 (P2, cobertura parcial E-Fisco) — `ref` encaminhada até o
// `<input type=file>` real: permite a um pai (ex.: o aviso de "Atualizar
// Base E-Fisco" em `PainelEntrada.tsx`) abrir o mesmo diálogo nativo desta
// seleção programaticamente (`ref.current.click()`), sem duplicar nenhum
// mecanismo de seleção — chamado de dentro do `onClick` de um botão real
// (mesmo "gesto do usuário"), nunca de forma assíncrona/fora de um handler
// de clique (o navegador/Electron bloqueia diálogos de arquivo sem gesto).
export default forwardRef<HTMLInputElement, Props>(function BotaoArquivo(
  { children, accept, multiplo = false, desabilitado = false, titulo, onChange },
  ref,
) {
  return (
    <label
      title={titulo}
      className={`inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-7 py-4 text-sm font-semibold text-slate-200 transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-500 has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-[#060818] ${EFEITO_RIPPLE} ${
        desabilitado
          ? "pointer-events-none opacity-40"
          : "cursor-pointer hover:-translate-y-0.5 hover:border-white/25 hover:bg-white/10 hover:shadow-floating active:scale-[0.98]"
      }`}
    >
      {children}
      <input
        ref={ref}
        type="file"
        accept={accept}
        multiple={multiplo}
        disabled={desabilitado}
        className="sr-only"
        onChange={onChange}
      />
    </label>
  );
});
