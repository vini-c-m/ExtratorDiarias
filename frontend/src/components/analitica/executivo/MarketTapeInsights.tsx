import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

interface Props<T> {
  itens: T[];
  chave: (item: T) => string;
  /** `ativo` — este item está com o "spotlight": ou é a vez dele na
   * sequência automática, ou o usuário está com o mouse/foco sobre ele.
   * Mesmo sinal visual para os dois casos ("este é o insight em destaque
   * agora"), nunca uma segunda semântica. */
  renderizar: (item: T, ativo: boolean) => ReactNode;
}

// MS — Insights vivos por destaque sequencial (2026-08-10): substitui o
// ticker/scroll contínuo (`translate3d`, cópia duplicada, `ResizeObserver`/
// `IntersectionObserver` para medir e detectar a zona de foco — pedido
// explícito do usuário para simplificar). Os insights ficam FIXOS na
// lateral; um por vez "acende" — como se o usuário tivesse passado o mouse
// sobre ele —, sempre de cima para baixo, em loop. Meio da faixa 2,5–3,5s
// pedida.
const INTERVALO_MS = 3000;

/** Lista fixa de insights com destaque sequencial (substitui o antigo
 * "Market Tape" de rolagem contínua). Nenhum item muda de posição — só a
 * classe de destaque troca, item a item, a cada `INTERVALO_MS`, sempre de
 * cima para baixo e em loop. Pausa com o mouse ou o foco em qualquer ponto
 * da lista (`onPointerEnter`/`onFocusCapture`): enquanto pausado, o item
 * sob o cursor/foco (não o da sequência) fica em destaque; ao sair, a
 * sequência retoma exatamente de onde tinha parado (o índice automático
 * nunca é resetado durante a pausa) — nunca um salto de volta ao primeiro
 * item.
 *
 * AJUSTE FINAL (2026-08-10) — `prefers-reduced-motion` NUNCA MAIS desliga
 * esta sequência (achado do diagnóstico anterior: numa máquina com
 * "Efeitos de animação" desligado no Windows, o Chromium do Electron
 * reporta essa preferência como ativa o tempo todo — desligar a sequência
 * inteira nesse caso deixava o rail completamente estático, sem exigir
 * nenhuma mudança de configuração do usuário para ver alguma forma de
 * destaque, o que não é aceitável para a entrega). "Reduzir movimento" quer
 * dizer reduzir MOVIMENTO, não eliminar a "vida" do rail: o índice ativo
 * continua avançando e o `ativo` continua sendo passado a `renderizar`
 * normalmente, em qualquer configuração do SO — só a PELE (CSS, em
 * `modoExecutivo.css`) troca de um destaque com leve `translateX`+glow
 * para um destaque só de luminância/background/contraste de texto, sem
 * nenhum deslocamento espacial, sob `@media (prefers-reduced-motion:
 * reduce)`. Este componente não precisa mais saber da preferência do SO —
 * não há nenhuma ramificação de JS por ela. */
export default function MarketTapeInsights<T>({ itens, chave, renderizar }: Props<T>) {
  const [indiceAtivo, setIndiceAtivo] = useState(0);
  const [pausado, setPausado] = useState(false);
  const [indiceInteragido, setIndiceInteragido] = useState<number | null>(null);
  const listaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (itens.length <= 1 || pausado) return;
    const temporizador = window.setInterval(() => {
      setIndiceAtivo((atual) => (atual + 1) % itens.length);
    }, INTERVALO_MS);
    return () => window.clearInterval(temporizador);
  }, [itens.length, pausado]);

  // Guarda simples: se o recorte muda e a lista encolhe, evita um índice
  // fora da faixa (nunca aponta a um item que deixou de existir).
  useEffect(() => {
    if (indiceAtivo >= itens.length) setIndiceAtivo(0);
  }, [itens.length, indiceAtivo]);

  if (itens.length === 0) return null;

  const indiceEmDestaque = indiceInteragido ?? indiceAtivo;

  return (
    <div
      ref={listaRef}
      className="market-tape-lista"
      data-testid="market-tape-lista"
      role="list"
      onPointerEnter={() => setPausado(true)}
      onPointerLeave={() => {
        setPausado(false);
        setIndiceInteragido(null);
      }}
      onFocusCapture={() => setPausado(true)}
      onBlurCapture={(evento) => {
        if (!evento.currentTarget.contains(evento.relatedTarget)) {
          setPausado(false);
          setIndiceInteragido(null);
        }
      }}
    >
      {itens.map((item, indice) => (
        <div key={chave(item)} className="market-tape-item" role="listitem" onMouseEnter={() => setIndiceInteragido(indice)} onFocus={() => setIndiceInteragido(indice)}>
          {renderizar(item, indice === indiceEmDestaque)}
        </div>
      ))}
    </div>
  );
}
