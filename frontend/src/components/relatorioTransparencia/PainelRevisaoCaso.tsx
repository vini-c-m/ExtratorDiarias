import { Clock } from "lucide-react";
import { useState } from "react";
import { TIPOGRAFIA } from "../../theme/tipografia";
import Alerta from "../ui/Alerta";
import Badge from "../ui/Badge";
import Botao from "../ui/Botao";
import DialogoConfirmacao from "../ui/DialogoConfirmacao";
import TabelaComparativaOcorrencias from "./TabelaComparativaOcorrencias";
import type { RevisaoRelatorioTransparencia } from "../../types/relatorioTransparencia";

interface Props {
  revisao: RevisaoRelatorioTransparencia;
  indiceAtual: number;
  totalCasos: number;
  enviando: boolean;
  erro: string | null;
  /** `justificativa` só é enviada (via `observacao`) quando `obsSelecionadas`
   * é vazio — nas demais decisões, `undefined`. */
  onConfirmarDecisao: (obsSelecionadas: string[], justificativa?: string) => void;
  onAdiar: () => void;
}

// Micro-sprint 3E.1 — Tela 3 ("revisão de caso") / Tela 4 ("decisão
// desatualizada"), UMA SÓ implementação: a diferença entre as duas é
// inteiramente visual (banner extra) e vem só de `revisao.estado`, nunca de
// telas/componentes separados (reuso, não duplicação). Também serve a
// variação "N ocorrências" sem nenhuma mudança — a tabela já suporta
// qualquer tamanho de `revisao.ocorrencias`.
//
// Regra de negócio: NENHUMA. Este componente só decide COMO mostrar o que o
// backend já classificou (`revisao.regra`/`explicacao`/`campos_iguais`/
// `campos_diferentes`/`estado`) e coleta a seleção humana — nunca interpreta
// valor, restituição, duplicidade, SEI, CPF, período, trecho ou motivo para
// decidir nada por conta própria.
export default function PainelRevisaoCaso({
  revisao,
  indiceAtual,
  totalCasos,
  enviando,
  erro,
  onConfirmarDecisao,
  onAdiar,
}: Props) {
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [confirmandoSelecaoVazia, setConfirmandoSelecaoVazia] = useState(false);
  const [justificativa, setJustificativa] = useState("");

  const percentual = totalCasos > 0 ? Math.round((indiceAtual / totalCasos) * 100) : 0;
  const desatualizada = revisao.estado === "desatualizada";
  // HOMO-RT-02 — grupo com decisão anterior ao suporte de seleção por
  // ocorrência (repetição física de OB, RN04/I11): a decisão antiga não
  // distinguia qual das ocorrências físicas devia ser publicada, então
  // nunca é reaplicada sozinha — volta a pedir decisão humana explícita.
  const requerNovaDecisao = revisao.estado === "requer_nova_decisao";

  function alternarSelecao(identidade: string) {
    setSelecionadas((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(identidade)) proximo.delete(identidade);
      else proximo.add(identidade);
      return proximo;
    });
  }

  function aoClicarConfirmar() {
    if (enviando) return;
    // Publicar ZERO pagamentos é uma decisão administrativa válida no
    // domínio, mas excepcional — exige confirmação contextual E
    // justificativa (Micro-sprint 3E.2). A GARANTIA real é do backend
    // (`registrar_decisao_revisao`/schema Pydantic, item 10 da 3E.1 +
    // 3E.2) — o bloqueio abaixo é só ergonomia: mesmo que alguém contorne
    // esta tela, o backend recusa a decisão (erro tratado normalmente,
    // exibido no Alerta abaixo dos botões).
    if (selecionadas.size === 0) {
      setConfirmandoSelecaoVazia(true);
      return;
    }
    onConfirmarDecisao(Array.from(selecionadas));
  }

  function confirmarSelecaoVazia() {
    if (enviando || justificativa.trim() === "") return;
    setConfirmandoSelecaoVazia(false);
    onConfirmarDecisao([], justificativa.trim());
  }

  return (
    <div>
      <p className={`${TIPOGRAFIA.legenda} mb-2`}>Relatório do Portal da Transparência · Revisão de casos</p>

      <div className="mb-3.5 flex items-center justify-between gap-6">
        <h2 className="text-[22px] font-bold text-slate-50">
          Caso {indiceAtual} de {totalCasos}
        </h2>
        <div className="max-w-[280px] flex-1">
          <div
            role="progressbar"
            aria-valuenow={percentual}
            aria-valuemin={0}
            aria-valuemax={100}
            className="h-1.5 overflow-hidden rounded-full bg-white/10"
          >
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{ width: `${percentual}%`, backgroundImage: "var(--gradient-marca)" }}
            />
          </div>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        {desatualizada ? (
          <Badge variante="critico">Decisão desatualizada</Badge>
        ) : requerNovaDecisao ? (
          <Badge variante="critico">Decisão anterior ambígua</Badge>
        ) : (
          <Badge variante="aviso">Requer decisão humana</Badge>
        )}
        {/* Item 6 — RN só como informação técnica SECUNDÁRIA, nunca a
         * linguagem principal da tela (essa é `revisao.explicacao`, no
         * Alerta abaixo). */}
        <Badge variante="neutro">{revisao.regra}</Badge>
      </div>

      {desatualizada && (
        <div className="mb-4">
          <Alerta variante="aviso">
            <span className="block font-bold">Os dados deste caso mudaram desde a última análise.</span>
            <span className="mt-1 block">Revise novamente antes de gerar o relatório.</span>
          </Alerta>
        </div>
      )}

      {requerNovaDecisao && (
        <div className="mb-4">
          <Alerta variante="aviso">
            <span className="block font-bold">
              Este caso tem duas ocorrências físicas da mesma OB e uma decisão anterior que não
              distinguia qual delas publicar.
            </span>
            <span className="mt-1 block">
              Selecione novamente, agora ocorrência por ocorrência, quais pagamentos devem constar no
              relatório.
            </span>
          </Alerta>
        </div>
      )}

      <div className="mb-6">
        <Alerta variante="info">{revisao.explicacao}</Alerta>
      </div>

      <TabelaComparativaOcorrencias
        ocorrencias={revisao.ocorrencias}
        camposIguais={revisao.campos_iguais}
        camposDiferentes={revisao.campos_diferentes}
        selecionadas={selecionadas}
        onAlternarSelecao={alternarSelecao}
        desabilitado={enviando}
      />

      <p className="mt-7 mb-3.5 text-base font-semibold text-slate-50">
        Quais pagamentos devem constar no relatório?
      </p>

      {erro && (
        <div className="mb-4">
          <Alerta variante="erro">{erro}</Alerta>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <Botao variante="primaria" tamanho="grande" onClick={aoClicarConfirmar} carregando={enviando}>
          Confirmar Decisão
        </Botao>
        <Botao variante="secundaria" onClick={onAdiar} disabled={enviando}>
          <Clock aria-hidden="true" className="h-4 w-4" />
          Adiar Análise
        </Botao>
      </div>
      <p className={`mt-2.5 max-w-md ${TIPOGRAFIA.textoAuxiliar}`}>
        Adiar mantém este caso pendente — o relatório não poderá ser gerado enquanto ele não for
        resolvido.
      </p>

      {confirmandoSelecaoVazia && (
        <DialogoConfirmacao
          titulo="Nenhum pagamento será incluído"
          mensagem={
            <div>
              <p>Nenhum destes pagamentos será incluído no relatório.</p>
              <label htmlFor="justificativa-selecao-vazia" className={`mt-4 mb-1.5 block ${TIPOGRAFIA.legenda}`}>
                Justificativa (obrigatória)
              </label>
              <textarea
                id="justificativa-selecao-vazia"
                value={justificativa}
                onChange={(evento) => setJustificativa(evento.target.value)}
                disabled={enviando}
                rows={3}
                placeholder="Explique por que nenhum pagamento deste grupo deve constar no relatório."
                className="w-full rounded-lg border border-white/[0.12] bg-white/[0.03] px-3.5 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
              />
            </div>
          }
          rotuloConfirmar="Confirmar decisão"
          rotuloCancelar="Revisar seleção"
          onConfirmar={confirmarSelecaoVazia}
          onCancelar={() => setConfirmandoSelecaoVazia(false)}
          confirmarDesabilitado={enviando || justificativa.trim() === ""}
        />
      )}
    </div>
  );
}
