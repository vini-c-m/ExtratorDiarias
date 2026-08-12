import { Copy, FileText } from "lucide-react";
import { useState, type ChangeEvent } from "react";
import Alerta from "../ui/Alerta";
import Botao from "../ui/Botao";
import Campo from "../ui/Campo";
import Selecao from "../ui/Selecao";
import { FOCO_ANEL, SUPERFICIE_BASE } from "../../theme/estilos";
import { TIPOGRAFIA } from "../../theme/tipografia";
import { formatarValorDiariaCopiavel } from "../../lib/formatarValorDiaria";
import type { ResultadoValorDiaria } from "../../types/conferencia";

interface Props {
  sei: string;
  destino: string;
  carregando: boolean;
  historico: string | null;
  erro: string | null;
  onMudarSei: (valor: string) => void;
  onMudarDestino: (valor: string) => void;
  onGerar: () => void;
  // RN-14 — modo Complemento reaproveita este componente com títulos
  // próprios ("GERAR HISTÓRICO DE COMPLEMENTO"), sem duplicar o formulário.
  titulo?: string;
  tituloResultado?: string;
  // P1 (Sprint pré-build, 2026-08-11) — "parcial isolada" só faz sentido no
  // modo Complemento; o formulário Padrão (RN-04, sempre 1 parcial) nunca
  // recebe essas duas props, então o checkbox nunca aparece lá.
  parcialIsolada?: boolean;
  onMudarParcialIsolada?: (valor: boolean) => void;
  // Micro-sprint A ("Valor Automático da Diária") — todas opcionais: quando
  // omitidas (nenhum chamador atual as omite de propósito), o bloco VALOR
  // simplesmente não é renderizado, preservando 100% o comportamento
  // anterior a esta Micro-sprint. Uma falha aqui NUNCA esconde o Histórico
  // acima — os dois blocos são sempre independentes.
  valor?: ResultadoValorDiaria | null;
  carregandoValor?: boolean;
  erroValor?: string | null;
  ufSelecionada?: string;
  onMudarUfSelecionada?: (uf: string) => void;
  onConfirmarUf?: () => void;
}

// Sprint 13 — Etapa 2, só renderizada pela página quando o veredito é
// APTO_PARA_PROCESSAMENTO (nunca antes disso). RN-12: o campo SEI trafega
// como texto livre, sem nenhuma máscara ou normalização nesta tela.
// Correção de 2026-08-05: Origem deixou de ser pedida — o histórico do
// e-Fisco usa apenas o destino.
export default function FormularioHistorico({
  sei,
  destino,
  carregando,
  historico,
  erro,
  onMudarSei,
  onMudarDestino,
  onGerar,
  titulo = "Gerar Histórico para o e-Fisco",
  tituloResultado = "Histórico para o e-Fisco",
  parcialIsolada,
  onMudarParcialIsolada,
  valor,
  carregandoValor,
  erroValor,
  ufSelecionada,
  onMudarUfSelecionada,
  onConfirmarUf,
}: Props) {
  const [copiado, setCopiado] = useState(false);
  const [valorCopiado, setValorCopiado] = useState(false);

  async function copiar() {
    if (!historico) return;
    try {
      await window.api.copiarHistorico(historico);
    } catch {
      // O texto continua visível na tela para seleção manual mesmo se a
      // cópia nativa falhar — nunca bloqueia o servidor.
    }
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2400);
  }

  async function copiarValor() {
    if (!valor?.valor_total) return;
    const texto = formatarValorDiariaCopiavel(valor.valor_total);
    try {
      await window.api.copiarTexto?.(texto);
    } catch {
      // Mesma tolerância de `copiar()` acima — o valor continua visível na
      // tela para seleção manual mesmo se a cópia nativa falhar.
    }
    setValorCopiado(true);
    setTimeout(() => setValorCopiado(false), 2400);
  }

  if (historico) {
    return (
      <div className="space-y-4">
        <div className={`${SUPERFICIE_BASE} p-6`}>
          <h3 className={TIPOGRAFIA.subtitulo}>{tituloResultado}</h3>
          <p className={`mt-3 rounded-lg border border-white/10 bg-white/[0.03] p-4 leading-relaxed ${TIPOGRAFIA.texto}`}>
            {historico}
          </p>
          <div className="mt-4">
            <Botao variante="primaria" onClick={copiar}>
              <Copy aria-hidden="true" className="h-4 w-4" />
              Copiar Histórico
            </Botao>
          </div>
          {copiado && (
            <p className="mt-3 text-xs font-medium text-emerald-400">
              ✓ Copiado — cole diretamente no e-Fisco
            </p>
          )}
        </div>

        {/* Micro-sprint A — bloco VALOR, sempre independente do Histórico
            acima: uma falha/pendência aqui nunca some com o Histórico já
            gerado. Só renderiza quando o chamador passou as props de valor
            (nenhum chamador atual antes desta Micro-sprint as omite de
            propósito — se omitidas, este bloco inteiro não aparece). */}
        {valor !== undefined && (
          <div className={`${SUPERFICIE_BASE} p-6`}>
            <h3 className={TIPOGRAFIA.subtitulo}>Valor</h3>

            {carregandoValor && (
              <p className={`mt-3 ${TIPOGRAFIA.textoAuxiliar}`}>Calculando valor...</p>
            )}

            {!carregandoValor && erroValor && (
              <div className="mt-3">
                <Alerta variante="erro">{erroValor}</Alerta>
              </div>
            )}

            {!carregandoValor && !erroValor && valor?.situacao === "indisponivel_para_categoria" && (
              <div className="mt-3">
                <Alerta variante="info">{valor.motivo}</Alerta>
              </div>
            )}

            {!carregandoValor &&
              !erroValor &&
              (valor?.situacao === "uf_nao_resolvida" || valor?.situacao === "uf_fora_da_tabela") && (
                <div className="mt-3 space-y-3">
                  <Alerta variante="aviso">
                    Não foi possível determinar com segurança a UF de destino para calcular o
                    valor. {valor.motivo}
                  </Alerta>
                  {onMudarUfSelecionada && onConfirmarUf && (
                    <>
                      <Selecao
                        rotulo="Confirme a UF de destino"
                        valor={ufSelecionada ?? ""}
                        opcoes={valor.ufs_disponiveis ?? []}
                        onMudar={onMudarUfSelecionada}
                        rotuloOpcaoVazia="Selecione a UF"
                      />
                      <Botao
                        variante="secundaria"
                        onClick={onConfirmarUf}
                        disabled={!ufSelecionada}
                        carregando={carregandoValor}
                      >
                        Confirmar
                      </Botao>
                    </>
                  )}
                </div>
              )}

            {!carregandoValor && !erroValor && valor?.situacao === "calculado" && valor.valor_total && (
              <>
                <p className={`mt-3 rounded-lg border border-white/10 bg-white/[0.03] p-4 ${TIPOGRAFIA.texto}`}>
                  {formatarValorDiariaCopiavel(valor.valor_total)}
                </p>
                <div className="mt-4">
                  <Botao variante="primaria" onClick={copiarValor}>
                    <Copy aria-hidden="true" className="h-4 w-4" />
                    Copiar Valor
                  </Botao>
                </div>
                {valorCopiado && (
                  <p className="mt-3 text-xs font-medium text-emerald-400">
                    ✓ Copiado — cole diretamente no e-Fisco
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`${SUPERFICIE_BASE} p-6`}>
      <h3 className={TIPOGRAFIA.subtitulo}>{titulo}</h3>
      <p className={`mt-1.5 ${TIPOGRAFIA.textoAuxiliar}`}>Só o que ainda não existe na planilha oficial.</p>

      <div className="mt-4 space-y-4">
        <Campo
          rotulo="Número do SEI"
          placeholder="00.00.0000.0000000/2026-00"
          value={sei}
          onChange={(evento: ChangeEvent<HTMLInputElement>) => onMudarSei(evento.target.value)}
        />
        <Campo
          rotulo="Destino"
          value={destino}
          onChange={(evento: ChangeEvent<HTMLInputElement>) => onMudarDestino(evento.target.value)}
        />
        {onMudarParcialIsolada && (
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={parcialIsolada ?? false}
              onChange={(evento) => onMudarParcialIsolada(evento.target.checked)}
              className={FOCO_ANEL}
            />
            <span className={TIPOGRAFIA.texto}>
              Esta simulação representa uma parcial isolada (sem diária integral)
            </span>
          </label>
        )}
        <Botao
          variante="primaria"
          onClick={onGerar}
          disabled={!sei.trim() || !destino.trim()}
          carregando={carregando}
        >
          {!carregando && <FileText aria-hidden="true" className="h-4 w-4" />}
          {carregando ? "Gerando..." : "Gerar Histórico"}
        </Botao>

        {erro && <Alerta variante="erro">{erro}</Alerta>}
      </div>
    </div>
  );
}
