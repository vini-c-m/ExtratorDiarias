import { ChevronDown } from "lucide-react";
import { type KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CAMPO_COM_DROPDOWN, FOCO_ANEL, PAINEL_DROPDOWN } from "../../theme/estilos";
import { TIPOGRAFIA } from "../../theme/tipografia";
import OpcaoDropdown from "./OpcaoDropdown";

interface Props {
  rotulo: string;
  valor: string;
  /** Lista FECHADA de opções reais já levantadas na aba `Dados` (RN-01) —
   * ao contrário de `ComboboxPesquisavel`, nunca aceita um valor fora
   * desta lista: não existe campo de texto algum, só um botão que abre um
   * dropdown de opções — estruturalmente impossível digitar um valor
   * novo. */
  opcoes: string[];
  onMudar: (valor: string) => void;
  disabled?: boolean;
  id?: string;
  rotuloOpcaoVazia?: string;
}

/** Seletor fechado (Previdência / Regime de previdência / Situação do modal
 * de Cadastro de Servidor/Membro): só permite escolher entre as opções
 * reais recebidas — nunca cria/aceita um valor novo (diferente de
 * `ComboboxPesquisavel`, usado em Cargo/Órgão de origem).
 *
 * Deliberadamente NÃO usa `<select>` nativo: o popup de um `<select>` é
 * desenhado pelo sistema operacional/navegador, fora do controle do CSS do
 * app — no Windows isso rendia um popup claro, quebrando o Dark UI. Em vez
 * disso é um `<button>` que abre um dropdown customizado (`<ul
 * role="listbox">`), mesma linguagem visual de `ComboboxPesquisavel`
 * (compartilham `CAMPO_COM_DROPDOWN`/`PAINEL_DROPDOWN` e o item de lista
 * `OpcaoDropdown`).
 *
 * Teclado: seta para baixo/cima abre o dropdown (se fechado) ou navega
 * entre as opções, Enter confirma a opção destacada (ou só abre, se
 * fechado), Escape fecha sem alterar o valor. Clique fora fecha.
 *
 * HOMO-RT-02/UX — investigação visual confirmou (reprodução real via
 * Chromium/Playwright, `elementFromPoint` no meio do painel aberto) que o
 * painel de opções ficava coberto pelo PRÓXIMO cartão da tela, mesmo tendo
 * `z-index` maior: `SUPERFICIE_BASE` (todo cartão do app) usa
 * `backdrop-blur-sm`, e `backdrop-filter` cria um novo *stacking context*
 * por CSS spec — isso torna o cartão inteiro (com tudo dentro, inclusive
 * este painel `position: absolute; z-index: 10`) uma unidade atômica na
 * pilha de empilhamento do cartão PAI; o `z-index` do painel só vale
 * DENTRO do próprio cartão, nunca escapa dele. O cartão seguinte, pintado
 * depois no DOM, cobre o cartão anterior inteiro (painel aberto incluído).
 * Corrigido renderizando o painel num portal para `document.body`
 * (`position: fixed`, coordenadas calculadas a partir do próprio campo) —
 * sai fisicamente da árvore do cartão, não fica mais sujeito ao
 * *stacking context* dele. Reposicionamento não é recalculado a cada
 * re-render enquanto aberto (só ao abrir/redimensionar/rolar, quando então
 * fecha) — suficiente para o bug comprovado; uma mudança de layout de um
 * elemento não relacionado enquanto o dropdown está aberto é um caso
 * residual não coberto (ver relatório da micro-sprint). */
export default function Selecao({
  rotulo,
  valor,
  opcoes,
  onMudar,
  disabled,
  id,
  rotuloOpcaoVazia = "Selecione",
}: Props) {
  const idGerado = useId();
  const campoId = id ?? idGerado;
  const listboxId = `${campoId}-listbox`;
  const containerRef = useRef<HTMLDivElement>(null);
  const campoRef = useRef<HTMLDivElement>(null);
  const listboxRef = useRef<HTMLUListElement>(null);

  const [aberto, setAberto] = useState(false);
  const [indiceAtivo, setIndiceAtivo] = useState(-1);
  const [posicao, setPosicao] = useState<{ top: number; left: number; width: number } | null>(null);

  // Item em branco sempre presente (equivalente ao "Todos"/"Selecione" do
  // antigo `<option value="">`) — permite limpar a seleção de um campo
  // opcional sem sair do padrão fechado (nunca texto livre).
  const itens = useMemo(
    () => [{ chave: "", rotulo: rotuloOpcaoVazia }, ...opcoes.map((opcao) => ({ chave: opcao, rotulo: opcao }))],
    [opcoes, rotuloOpcaoVazia],
  );
  const indiceValorAtual = itens.findIndex((item) => item.chave === valor);

  useEffect(() => {
    if (!aberto) return;
    function aoClicarFora(evento: MouseEvent) {
      const alvo = evento.target as Node;
      // `listboxRef` porque o painel agora vive num portal em
      // `document.body` — fora de `containerRef` — então um clique numa
      // opção conta como "fora" do container e fecharia o dropdown antes
      // de `OpcaoDropdown.onMouseDown` selecionar a opção, sem este check.
      if (containerRef.current?.contains(alvo)) return;
      if (listboxRef.current?.contains(alvo)) return;
      setAberto(false);
    }
    document.addEventListener("mousedown", aoClicarFora);
    return () => document.removeEventListener("mousedown", aoClicarFora);
  }, [aberto]);

  // Painel no portal não reflui com o resto da página: rolar ou
  // redimensionar deixaria as coordenadas calculadas na abertura
  // desatualizadas (não há como "seguir" o campo sem recalcular a cada
  // frame) — mais simples e previsível fechar, igual a um clique fora.
  useEffect(() => {
    if (!aberto) return;
    function fechar() {
      setAberto(false);
      setIndiceAtivo(-1);
    }
    window.addEventListener("resize", fechar);
    window.addEventListener("scroll", fechar, true);
    return () => {
      window.removeEventListener("resize", fechar);
      window.removeEventListener("scroll", fechar, true);
    };
  }, [aberto]);

  function selecionar(chaveEscolhida: string) {
    onMudar(chaveEscolhida);
    setAberto(false);
    setIndiceAtivo(-1);
  }

  function abrir() {
    if (disabled) return;
    const retangulo = campoRef.current?.getBoundingClientRect();
    if (retangulo) {
      setPosicao({ top: retangulo.bottom + 4, left: retangulo.left, width: retangulo.width });
    }
    setIndiceAtivo(indiceValorAtual >= 0 ? indiceValorAtual : 0);
    setAberto(true);
  }

  function aoTeclar(evento: KeyboardEvent<HTMLButtonElement>) {
    if (evento.key === "ArrowDown") {
      evento.preventDefault();
      if (!aberto) {
        abrir();
        return;
      }
      setIndiceAtivo((atual) => (atual + 1) % itens.length);
    } else if (evento.key === "ArrowUp") {
      evento.preventDefault();
      if (!aberto) {
        abrir();
        return;
      }
      setIndiceAtivo((atual) => (atual - 1 + itens.length) % itens.length);
    } else if (evento.key === "Enter" || evento.key === " ") {
      evento.preventDefault();
      if (aberto) {
        if (indiceAtivo >= 0) selecionar(itens[indiceAtivo].chave);
        else setAberto(false);
      } else {
        abrir();
      }
    } else if (evento.key === "Escape") {
      if (aberto) {
        evento.preventDefault();
        setAberto(false);
        setIndiceAtivo(-1);
      }
    }
  }

  const rotuloExibido = valor.trim().length > 0 ? valor : rotuloOpcaoVazia;

  return (
    <div ref={containerRef} className="relative">
      <label htmlFor={campoId} className={`mb-1.5 block ${TIPOGRAFIA.legenda}`}>
        {rotulo}
      </label>
      <div ref={campoRef} className="relative">
        <button
          id={campoId}
          type="button"
          role="combobox"
          aria-haspopup="listbox"
          aria-expanded={aberto}
          aria-controls={listboxId}
          disabled={disabled}
          onClick={() => (aberto ? setAberto(false) : abrir())}
          onKeyDown={aoTeclar}
          className={`${CAMPO_COM_DROPDOWN} ${valor.trim() ? "text-slate-200" : "text-slate-600"} ${FOCO_ANEL}`}
        >
          <span className="block truncate">{rotuloExibido}</span>
        </button>
        <ChevronDown
          aria-hidden="true"
          className={`pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500 transition-transform ${
            aberto ? "rotate-180" : ""
          }`}
        />
      </div>
      {aberto &&
        !disabled &&
        posicao &&
        createPortal(
          <ul
            ref={listboxRef}
            id={listboxId}
            role="listbox"
            className={PAINEL_DROPDOWN}
            style={{ position: "fixed", top: posicao.top, left: posicao.left, width: posicao.width, margin: 0 }}
          >
            {itens.map((item, indice) => (
              <OpcaoDropdown
                key={item.chave || "__vazio__"}
                rotulo={item.rotulo}
                ativo={indice === indiceAtivo}
                selecionado={item.chave === valor}
                onEscolher={() => selecionar(item.chave)}
                onRealcar={() => setIndiceAtivo(indice)}
              />
            ))}
          </ul>,
          document.body,
        )}
    </div>
  );
}
