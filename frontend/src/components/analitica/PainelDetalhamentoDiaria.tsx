import { Copy, History, X } from "lucide-react";
import { type KeyboardEvent, type ReactNode, useEffect, useRef, useState } from "react";
import Alerta from "../ui/Alerta";
import Botao from "../ui/Botao";
import CartaoDiagnostico from "./CartaoDiagnostico";
import { useDetalhamentoDiaria } from "../../hooks/useDetalhamentoDiaria";
import { formatarDataBr } from "../../lib/datas";
import { mascararCpf } from "../../lib/mascararCpf";
import { FOCO_ANEL, PAINEL_MODAL } from "../../theme/estilos";
import { TIPOGRAFIA } from "../../theme/tipografia";

interface Props {
  sei: string | null;
  aoFechar: () => void;
  /** Sprint 19.5.8 — aplica o filtro `cpf` desta linha (reaproveita
   * `useDiarias.aplicarFiltro`, já existente no componente pai) e volta
   * para a tabela já filtrada (`v2-plano-tecnico.md` § 18, 19.5.8). */
  aoVerHistoricoCpf: (cpf: string) => void;
  /** Sprint 19.8.4 — quando aberto a partir de `PainelDiagnostico`
   * ("▸ Ver"), o foco inicial vai para o bloco "Avisos e diagnósticos"
   * em vez do título (`v2-plano-tecnico.md` § 18, "mesmo painel de
   * detalhamento do § 5, com o bloco de avisos em foco") — omitido
   * (`undefined`), o comportamento já homologado (foco no título)
   * continua exatamente o mesmo. */
  emFoco?: "diagnosticos";
}

const FORMATADOR_MOEDA = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** Seletor dos elementos que um `Tab` pode alcançar dentro do painel — usado
 * só pelo *focus trap* (`aoTeclarNoPainel`) abaixo. */
const SELETOR_FOCAVEL = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

function CampoDetalhe({ rotulo, valor }: { rotulo: string; valor: ReactNode }) {
  return (
    <div>
      <div className={TIPOGRAFIA.legenda}>{rotulo}</div>
      <div className={`mt-1 ${TIPOGRAFIA.textoForte}`}>{valor}</div>
    </div>
  );
}

// Sprint 18.5 — painel lateral sobre a lista (`ui-wireframes.md` § 3):
// nunca troca de tela, fecha com ✕ ou clique no backdrop. Fechar não mexe
// em `useDiarias` — a tabela ao fundo mantém filtros/página/rolagem
// intocados (hooks independentes, `ui-plano-tecnico.md` § 6). Único ponto
// da UI que pode exibir CPF, sempre mascarado (`mascararCpf`, § 0.7 de
// `ui-arquitetura.md`) — sem nenhum mecanismo de revelar. O botão
// "Exportar este registro" do wireframe original não é implementado nesta
// Sprint: exportação está fora do escopo da 18.5 (`ui-arquitetura.md`
// § 12, linha 18.5 — "cobre as jornadas J1/J2/J4 (parcial, sem
// exportação)").
export default function PainelDetalhamentoDiaria({ sei, aoFechar, aoVerHistoricoCpf, emFoco }: Props) {
  const { carregando, erro, naoEncontrada, registro } = useDetalhamentoDiaria(sei);
  const [estadoCopia, setEstadoCopia] = useState<"ocioso" | "sucesso" | "falha">("ocioso");
  const timeoutCopiaRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Sprint 19.5.8.2 — correção da condição de corrida encontrada na
  // Auditoria Técnica da 19.5.8.1: um número de geração, incrementado a
  // cada nova chamada de `copiarSei` (e a cada troca de `sei`). Cada
  // chamada guarda o número vigente no momento em que começou
  // (`tokenDestaChamada`, capturado no fecho); ao terminar (sucesso, falha,
  // ou o timeout de auto-ocultar), ela só aplica seu resultado se esse
  // número ainda for o mais recente — senão, uma chamada mais nova já
  // assumiu o controle, e o resultado da mais antiga é descartado por
  // inteiro (nunca aplicado, nunca agenda seu próprio timeout). Mesma
  // máquina de estados de antes; nenhuma arquitetura nova.
  const tokenCopiaRef = useRef(0);

  // Sprint 18.5.1 — correção NC4 da auditoria: move o foco para o título do
  // painel ao abrir e devolve o foco a quem o disparou (a linha da tabela,
  // já focável desde a correção B2) ao fechar. `sei` é a única dependência:
  // o efeito roda de novo (fecha→abre) mesmo que os hooks continuem
  // "montados" por trás do `if` abaixo, porque hooks não podem ser
  // condicionais.
  const referenciaTitulo = useRef<HTMLHeadingElement>(null);
  const referenciaPainel = useRef<HTMLDivElement>(null);
  const referenciaElementoAnterior = useRef<HTMLElement | null>(null);
  // Sprint 19.8.4 — "bloco de avisos em foco" (ver `emFoco` acima).
  const referenciaDiagnosticos = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (sei === null) return;
    referenciaElementoAnterior.current = document.activeElement as HTMLElement | null;
    // `emFoco === "diagnosticos"` pula o foco no título aqui — o efeito
    // abaixo assume o foco assim que `registro` (e, com ele, o bloco de
    // diagnósticos) estiver de fato renderizado.
    if (emFoco !== "diagnosticos") {
      referenciaTitulo.current?.focus();
    }
    return () => {
      referenciaElementoAnterior.current?.focus();
    };
  }, [sei, emFoco]);

  // Sprint 19.8.4 — `registro` chega de forma assíncrona (`useDetalhamentoDiaria`);
  // o bloco "Avisos e diagnósticos" só existe no DOM depois que ele
  // resolve, então o foco correspondente precisa do próprio efeito,
  // separado do de cima (que roda assim que `sei` muda, antes do dado
  // chegar).
  useEffect(() => {
    if (emFoco === "diagnosticos" && registro !== null) {
      referenciaDiagnosticos.current?.focus();
    }
  }, [emFoco, registro]);

  // Sprint 19.5.8.1 — correção do Bug 2 da Auditoria Técnica (19.5.8
  // REPROVADA): o feedback de "Copiar SEI" é específico de um registro; o
  // painel não desmonta ao trocar de `sei` (`CentralAnalitica.tsx` o
  // mantém montado enquanto `visualizacao === "resultados"`), então sem
  // este reset o feedback e o timeout de um registro vazavam para o
  // próximo. Roda em toda troca de `sei` (inclusive fechar, `sei` -> null)
  // e no unmount real — `useEffect` de cleanup cobre os dois casos.
  useEffect(() => {
    setEstadoCopia("ocioso");
    return () => {
      // Invalida qualquer chamada de `copiarSei` ainda em andamento para
      // este `sei` (mesmo uma ainda sem timeout, porque nem chegou a
      // resolver) — ela nunca vai aplicar seu resultado depois que `sei`
      // já mudou.
      tokenCopiaRef.current += 1;
      if (timeoutCopiaRef.current !== null) {
        clearTimeout(timeoutCopiaRef.current);
        timeoutCopiaRef.current = null;
      }
    };
  }, [sei]);

  // Auditoria 19.9 (acessibilidade — navegação por teclado em painéis
  // modais, mesmo achado já corrigido em `ModalRelatorio.tsx`): "Esc"
  // fecha o painel, mesmo efeito do ✕ e do clique no backdrop (já
  // existentes, ver docstring do componente acima) — só quando `sei` não é
  // `null`, para nunca escutar com o painel fechado.
  useEffect(() => {
    if (sei === null) return;
    function aoTeclar(evento: globalThis.KeyboardEvent) {
      if (evento.key === "Escape") aoFechar();
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [sei, aoFechar]);

  if (sei === null) return null;
  const seiAtual = sei;

  // Focus trap simples, sem dependência nova: intercepta só `Tab`/`Shift+Tab`
  // no primeiro/último elemento focável do painel e o mantém dentro dele.
  // Avaliado como seguro por ser read-only sobre o DOM já renderizado (sem
  // observers, sem manipular o restante da página).
  //
  // Sprint 18.5.1.1 — correção B1 da auditoria da 18.5.1: o foco inicial
  // fica no título (`referenciaTitulo`, `tabIndex={-1}`), que é
  // deliberadamente excluído de `focaveis` (`SELETOR_FOCAVEL` ignora
  // `tabindex="-1"` — o título não deve ser um destino de Tab). Isso fazia
  // a checagem antiga (`activeElement === primeiro`) nunca casar quando o
  // usuário pressionava `Shift+Tab` como a primeiríssima tecla: o foco
  // ainda estava no título, não em `primeiro`, então nada era interceptado
  // e o navegador seguia a ordem natural para fora do painel. A correção
  // trata "foco atual não é nenhum dos elementos de `focaveis`" (ou seja,
  // está no título) como equivalente a "está na borda" na direção
  // correspondente — `Shift+Tab` vai para o último, `Tab` vai para o
  // primeiro — sem alterar em nada o comportamento já correto de ciclar
  // entre `primeiro`/`ultimo` quando o foco já está em um deles.
  function aoTeclarNoPainel(evento: KeyboardEvent<HTMLDivElement>) {
    if (evento.key !== "Tab") return;
    const focaveis = referenciaPainel.current?.querySelectorAll<HTMLElement>(SELETOR_FOCAVEL);
    if (!focaveis || focaveis.length === 0) return;

    const primeiro = focaveis[0];
    const ultimo = focaveis[focaveis.length - 1];
    const focoDentroDoTrap = Array.from(focaveis).includes(document.activeElement as HTMLElement);

    if (evento.shiftKey) {
      if (!focoDentroDoTrap || document.activeElement === primeiro) {
        evento.preventDefault();
        ultimo.focus();
      }
    } else if (!focoDentroDoTrap || document.activeElement === ultimo) {
      evento.preventDefault();
      primeiro.focus();
    }
  }

  // Sprint 19.5.8.1 — correção do Bug 3 da Auditoria Técnica (19.5.8
  // REPROVADA): ao contrário de `FormularioHistorico.tsx` (Sprint 13, que
  // nunca bloqueia o usuário mas também nunca soube dizer se a cópia
  // realmente aconteceu), aqui "sucesso" só é mostrado quando a cópia de
  // fato aconteceu. `window.api?.copiarTexto` (não só `?.()` na chamada)
  // cobre tanto `copiarTexto` ausente quanto `window.api` inteiramente
  // ausente — os dois casos viram "falha", nunca uma exceção não tratada
  // (a app nunca trava) e nunca um "sucesso" mentiroso. Falha nunca é
  // silenciosa: mostra uma mensagem curta, sem jargão técnico, e o botão
  // continua disponível para tentar de novo.
  // Sprint 19.5.8.2 — correção da condição de corrida (Auditoria Técnica da
  // 19.5.8.1): duas chamadas de `copiarSei` podem ficar em andamento ao
  // mesmo tempo (clique duplo, ou um clique antes do IPC anterior
  // responder); a que resolve por último não necessariamente é a mais
  // recente. `tokenDestaChamada` fixa, no instante em que ESTA chamada
  // começou, qual era a geração vigente; ao terminar, só aplica seu
  // resultado (e só agenda seu próprio timeout de auto-ocultar) se nenhuma
  // chamada mais nova assumiu o controle nesse meio-tempo — garantindo que
  // a tentativa mais recente nunca seja sobrescrita nem limpa por uma mais
  // antiga, em qualquer ordem de resolução.
  async function copiarSei() {
    tokenCopiaRef.current += 1;
    const tokenDestaChamada = tokenCopiaRef.current;
    if (timeoutCopiaRef.current !== null) clearTimeout(timeoutCopiaRef.current);

    let resultado: "sucesso" | "falha";
    try {
      if (!window.api?.copiarTexto) throw new Error("Mecanismo de cópia indisponível");
      await window.api.copiarTexto(seiAtual);
      resultado = "sucesso";
    } catch {
      resultado = "falha";
    }

    // Uma chamada mais nova já assumiu o controle enquanto esta esperava —
    // descarta o resultado por inteiro, sem tocar no estado nem agendar
    // timeout (nenhum timeout órfão fica pendente).
    if (tokenCopiaRef.current !== tokenDestaChamada) return;

    setEstadoCopia(resultado);
    timeoutCopiaRef.current = setTimeout(() => {
      if (tokenCopiaRef.current === tokenDestaChamada) setEstadoCopia("ocioso");
    }, 2400);
  }

  function verHistoricoCpf() {
    if (!registro) return;
    aoVerHistoricoCpf(registro.cpf);
    aoFechar();
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/60" onClick={aoFechar}>
      <div
        ref={referenciaPainel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="painel-detalhamento-titulo"
        onClick={(evento) => evento.stopPropagation()}
        onKeyDown={aoTeclarNoPainel}
        className={`h-full w-full max-w-md overflow-y-auto p-6 ${PAINEL_MODAL}`}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className={TIPOGRAFIA.legenda}>Processo SEI</div>
            <h2
              ref={referenciaTitulo}
              tabIndex={-1}
              id="painel-detalhamento-titulo"
              className={`mt-1 outline-none ${TIPOGRAFIA.titulo}`}
            >
              {sei}
            </h2>
          </div>
          <button
            type="button"
            aria-label="Fechar detalhamento"
            onClick={aoFechar}
            className={`shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-slate-200 ${FOCO_ANEL}`}
          >
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-6 space-y-5 border-t border-white/10 pt-5">
          {carregando && <p className={TIPOGRAFIA.texto}>Carregando detalhamento...</p>}

          {/* Sprint 18.5.1 — correção B1 da auditoria (RN-08): "não
              encontrada" é resultado de negócio (404), nunca falha técnica —
              `Alerta variante="info"`, nunca "erro". */}
          {naoEncontrada && (
            <Alerta variante="info">
              Diária não encontrada. Ela pode ter sido removida ou o SEI pode estar desatualizado.
            </Alerta>
          )}

          {erro !== null && <Alerta variante="erro">{erro}</Alerta>}

          {registro && (
            <>
              <CampoDetalhe rotulo="Servidor" valor={registro.servidor?.nome ?? "—"} />
              <CampoDetalhe
                rotulo="Cargo · Previdência"
                valor={
                  registro.servidor
                    ? `${registro.servidor.cargo} · ${registro.servidor.previdencia}`
                    : "—"
                }
              />
              <CampoDetalhe rotulo="CPF" valor={mascararCpf(registro.cpf)} />
              <CampoDetalhe
                rotulo="Período"
                valor={`${formatarDataBr(registro.periodo.inicial)} – ${formatarDataBr(registro.periodo.final)}`}
              />
              <CampoDetalhe
                rotulo="Trecho"
                valor={`${registro.trecho.origem ?? "—"} → ${registro.trecho.destino ?? "—"}`}
              />
              <CampoDetalhe
                rotulo="Motivo · Transporte · Valor"
                valor={`${registro.motivo} · ${registro.transporte ?? "—"} · ${
                  registro.valor_total_diarias === null
                    ? "—"
                    : FORMATADOR_MOEDA.format(registro.valor_total_diarias)
                }`}
              />

              {/* Sprint 19.8.4 (`v2-plano-tecnico.md` § 18, § 12.5) — um
                  `CartaoDiagnostico` por caso aplicável; nunca `classificacao`
                  (contrato de `GET /diarias/{sei}` não a carrega, ver
                  `CartaoDiagnostico.tsx`). Vazio é um estado explícito
                  ("nenhum diagnóstico aplicável"), nunca uma seção ausente
                  em silêncio. */}
              <div className="border-t border-white/10 pt-5">
                <h3
                  ref={referenciaDiagnosticos}
                  tabIndex={-1}
                  className={`outline-none ${TIPOGRAFIA.subtitulo}`}
                >
                  Avisos e diagnósticos
                </h3>
                {registro.diagnosticos.length === 0 ? (
                  <p className={`mt-3 ${TIPOGRAFIA.textoAuxiliar}`}>Nenhum diagnóstico aplicável a este registro.</p>
                ) : (
                  <div className="mt-3 space-y-3">
                    {registro.diagnosticos.map((caso, indice) => (
                      <CartaoDiagnostico key={`${caso.titulo}-${indice}`} caso={caso} />
                    ))}
                  </div>
                )}
              </div>

              {/* Sprint 19.5.8 — ações do painel de detalhes
                  (`v2-arquitetura-funcional.md` § 4.2, `v2-plano-tecnico.md`
                  § 18, 19.5.8): ambas reaproveitam mecanismo já existente
                  (filtro `cpf` de `useDiarias`; cópia nativa do Electron,
                  ver `PainelDetalhamentoDiaria.tsx` topo do arquivo) — sem
                  endpoint novo, sem segundo mecanismo de cópia. */}
              <div className="flex flex-col gap-2 border-t border-white/10 pt-5">
                <Botao variante="secundaria" onClick={verHistoricoCpf}>
                  <History aria-hidden="true" className="h-4 w-4" />
                  Ver histórico deste CPF
                </Botao>
                <Botao variante="secundaria" onClick={copiarSei}>
                  <Copy aria-hidden="true" className="h-4 w-4" />
                  Copiar SEI
                </Botao>
                {estadoCopia === "sucesso" && (
                  <p role="status" className="text-xs font-medium text-emerald-400">
                    ✓ SEI copiado
                  </p>
                )}
                {estadoCopia === "falha" && (
                  <Alerta variante="erro">Não foi possível copiar o SEI. Tente novamente.</Alerta>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
