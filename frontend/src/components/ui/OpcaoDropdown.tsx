import { Check } from "lucide-react";
import type { MouseEvent } from "react";

interface Props {
  rotulo: string;
  /** Destacado por teclado (seta) ou hover do mouse — não é necessariamente
   * o valor atual do campo. */
  ativo: boolean;
  /** É de fato o valor atual do campo — mostra o ícone de confirmação
   * ("item selecionado evidente"), independente de estar ou não destacado
   * no momento. Nunca usado na variante `novoValor` (um valor novo nunca é
   * "o selecionado" antes de o usuário confirmar). */
  selecionado?: boolean;
  variante?: "normal" | "novoValor";
  onEscolher: () => void;
  /** Sincroniza o destaque com o mouse (`ativo` passa a seguir o item sob o
   * cursor) — sem isso, mover o mouse sobre a lista dava feedback visual
   * (`hover:`) sem mexer no índice usado por teclado/Enter, uma
   * inconsistência entre os dois modos de navegação. */
  onRealcar?: () => void;
}

/** Item de lista compartilhado por `ComboboxPesquisavel` e `Selecao` — único
 * lugar que define a aparência de uma opção de dropdown no app (fundo no
 * hover/destaque, ícone de seleção, estilo diferenciado para "usar novo
 * valor"), para os dois nunca divergirem visualmente.
 *
 * `onMouseDown` + `preventDefault` (não `onClick`): o clique na opção não
 * pode perder o foco do campo antes de a seleção ser registrada — problema
 * clássico de combobox, onde o `blur` fecharia o dropdown antes do `click`
 * disparar. */
export default function OpcaoDropdown({
  rotulo,
  ativo,
  selecionado,
  variante = "normal",
  onEscolher,
  onRealcar,
}: Props) {
  const ehNovoValor = variante === "novoValor";

  return (
    <li
      role="option"
      aria-selected={ativo}
      onMouseEnter={onRealcar}
      onMouseDown={(evento: MouseEvent) => {
        evento.preventDefault();
        onEscolher();
      }}
      title={rotulo}
      className={`flex cursor-pointer items-start gap-2 px-3.5 py-2 text-sm transition hover:bg-white/10 ${
        ativo ? "bg-white/10" : ""
      } ${ehNovoValor ? (ativo ? "text-cyan-300 italic" : "text-cyan-400/80 italic") : ativo ? "text-slate-100" : "text-slate-300"}`}
    >
      {!ehNovoValor && (
        <Check
          aria-hidden="true"
          className={`mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-400 ${selecionado ? "opacity-100" : "opacity-0"}`}
        />
      )}
      {/* Texto completo sempre — nunca `truncate`/ellipsis: um cargo grande
          quebra em várias linhas (`whitespace-normal break-words`, o
          padrão do navegador para texto normal) em vez de ser cortado. A
          altura do item acompanha o texto naturalmente (nenhuma altura
          fixa é imposta). `title` acima é só um fallback nativo do
          navegador (tooltip ao pairar o mouse) — a solução principal é a
          quebra de linha, que já mostra o texto inteiro sem precisar de
          hover nenhum. */}
      <span className="break-words">{rotulo}</span>
    </li>
  );
}
