import { ChevronDown } from "lucide-react";
import { type ChangeEvent, type KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import { CAMPO_COM_DROPDOWN, FOCO_ANEL, PAINEL_DROPDOWN, PAINEL_DROPDOWN_EXPANDIDO } from "../../theme/estilos";
import { TIPOGRAFIA } from "../../theme/tipografia";
import OpcaoDropdown from "./OpcaoDropdown";

interface Props {
  rotulo: string;
  valor: string;
  /** Opções já existentes na aba `Dados` (RN-01) — sugestões via busca,
   * nunca uma lista fechada: digitar um valor que não existe ainda
   * continua sendo uma entrada válida (o formulário grava normalmente). */
  opcoes: string[];
  onMudar: (valor: string) => void;
  disabled?: boolean;
  id?: string;
  /** "expandida" (Cargo): opções com texto longo (cargos completos) numa
   * coluna estreita (dividindo linha com Matrícula) — o dropdown aberto
   * cresce mais largo que o campo fechado (ancorado pela direita,
   * `PAINEL_DROPDOWN_EXPANDIDO`), nunca corta com ellipsis. "padrao"
   * (Órgão de origem, campo de linha inteira): dropdown do tamanho do
   * campo já é largo o bastante. */
  larguraDropdown?: "padrao" | "expandida";
}

/** Combobox pesquisável (Cargo / Órgão de origem do modal de Cadastro de
 * Servidor/Membro): filtra as opções reais conforme digitação, permite
 * selecionar uma existente ou confirmar um valor novo — nunca um `<select>`
 * fechado, já que cargo/órgão não são um enum conhecido de antemão. Mesma
 * linguagem visual de `Selecao` (o seletor fechado de Previdência/Regime/
 * Situação): os dois compartilham `CAMPO_COM_DROPDOWN`/`PAINEL_DROPDOWN`
 * (`theme/estilos.ts`) e o item de lista `OpcaoDropdown`, para nenhuma
 * parte do modal parecer um controle nativo do SO.
 *
 * Teclado: seta para baixo/cima navega a lista (abre o dropdown se estiver
 * fechado), Enter confirma o item destacado (ou simplesmente fecha,
 * mantendo o texto digitado, quando nada está destacado — digitar e
 * apertar Enter direto também deve funcionar), Escape fecha sem alterar o
 * valor. Clique fora fecha (via `mousedown` no documento). */
export default function ComboboxPesquisavel({
  rotulo,
  valor,
  opcoes,
  onMudar,
  disabled,
  id,
  larguraDropdown = "padrao",
}: Props) {
  const idGerado = useId();
  const campoId = id ?? idGerado;
  const listboxId = `${campoId}-listbox`;

  const [aberto, setAberto] = useState(false);
  const [indiceAtivo, setIndiceAtivo] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);

  const opcoesFiltradas = useMemo(() => {
    const termo = valor.trim().toLowerCase();
    if (!termo) return opcoes;
    return opcoes.filter((opcao) => opcao.toLowerCase().includes(termo));
  }, [opcoes, valor]);

  const valorExisteExatamente = opcoes.some((opcao) => opcao.toLowerCase() === valor.trim().toLowerCase());
  const mostrarUsarNovoValor = valor.trim().length > 0 && !valorExisteExatamente;
  const totalItens = opcoesFiltradas.length + (mostrarUsarNovoValor ? 1 : 0);

  // Fecha ao clicar fora — mesmo padrão de qualquer combobox acessível.
  useEffect(() => {
    if (!aberto) return;
    function aoClicarFora(evento: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(evento.target as Node)) {
        setAberto(false);
      }
    }
    document.addEventListener("mousedown", aoClicarFora);
    return () => document.removeEventListener("mousedown", aoClicarFora);
  }, [aberto]);

  function selecionar(opcaoEscolhida: string) {
    onMudar(opcaoEscolhida);
    setAberto(false);
    setIndiceAtivo(-1);
  }

  function aoDigitar(evento: ChangeEvent<HTMLInputElement>) {
    onMudar(evento.target.value);
    setAberto(true);
    setIndiceAtivo(-1);
  }

  function aoTeclar(evento: KeyboardEvent<HTMLInputElement>) {
    if (evento.key === "ArrowDown") {
      evento.preventDefault();
      if (!aberto) {
        setAberto(true);
        return;
      }
      if (totalItens > 0) setIndiceAtivo((atual) => (atual + 1) % totalItens);
    } else if (evento.key === "ArrowUp") {
      evento.preventDefault();
      if (!aberto) {
        setAberto(true);
        return;
      }
      if (totalItens > 0) setIndiceAtivo((atual) => (atual - 1 + totalItens) % totalItens);
    } else if (evento.key === "Enter") {
      if (aberto && indiceAtivo >= 0) {
        evento.preventDefault();
        if (indiceAtivo < opcoesFiltradas.length) {
          selecionar(opcoesFiltradas[indiceAtivo]);
        } else {
          setAberto(false);
          setIndiceAtivo(-1);
        }
      } else {
        setAberto(false);
      }
    } else if (evento.key === "Escape") {
      if (aberto) {
        evento.preventDefault();
        setAberto(false);
        setIndiceAtivo(-1);
      }
    }
  }

  const mostrarDropdown = aberto && !disabled && totalItens > 0;

  return (
    <div ref={containerRef} className="relative">
      <label htmlFor={campoId} className={`mb-1.5 block ${TIPOGRAFIA.legenda}`}>
        {rotulo}
      </label>
      <div className="relative">
        <input
          id={campoId}
          role="combobox"
          aria-expanded={mostrarDropdown}
          aria-controls={listboxId}
          aria-autocomplete="list"
          autoComplete="off"
          title={valor}
          value={valor}
          disabled={disabled}
          onChange={aoDigitar}
          onFocus={() => setAberto(true)}
          onKeyDown={aoTeclar}
          className={`${CAMPO_COM_DROPDOWN} text-slate-200 placeholder:text-slate-600 ${FOCO_ANEL}`}
        />
        <ChevronDown
          aria-hidden="true"
          className={`pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500 transition-transform ${
            mostrarDropdown ? "rotate-180" : ""
          }`}
        />
      </div>
      {mostrarDropdown && (
        <ul
          id={listboxId}
          role="listbox"
          className={larguraDropdown === "expandida" ? PAINEL_DROPDOWN_EXPANDIDO : PAINEL_DROPDOWN}
        >
          {opcoesFiltradas.map((opcao, indice) => (
            <OpcaoDropdown
              key={opcao}
              rotulo={opcao}
              ativo={indice === indiceAtivo}
              selecionado={opcao.toLowerCase() === valor.trim().toLowerCase()}
              onEscolher={() => selecionar(opcao)}
              onRealcar={() => setIndiceAtivo(indice)}
            />
          ))}
          {mostrarUsarNovoValor && (
            <OpcaoDropdown
              rotulo={`Usar novo valor: "${valor.trim()}"`}
              ativo={indiceAtivo === opcoesFiltradas.length}
              variante="novoValor"
              onEscolher={() => {
                setAberto(false);
                setIndiceAtivo(-1);
              }}
              onRealcar={() => setIndiceAtivo(opcoesFiltradas.length)}
            />
          )}
        </ul>
      )}
    </div>
  );
}
