import { Copy } from "lucide-react";
import { useState, type ChangeEvent } from "react";
import { CORES_STATUS } from "../../theme/cores";
import { SUPERFICIE_BASE } from "../../theme/estilos";
import { TIPOGRAFIA } from "../../theme/tipografia";
import type { DetalheProcessoAguardandoDH as DetalheProcesso, ResultadoRegistroDH } from "../../types/regularizacaoDh";
import { formatarDataBr, formatarPeriodoBr } from "../../lib/datas";
import { formatarValorDiariaCopiavel } from "../../lib/formatarValorDiaria";
import Alerta from "../ui/Alerta";
import Badge from "../ui/Badge";
import Botao from "../ui/Botao";
import Campo from "../ui/Campo";

interface Props {
  sei: string;
  detalhe: DetalheProcesso | null;
  carregando: boolean;
  erro: string | null;
  aoVoltar: () => void;
  aoTentarNovamente: () => void;
  // Micro-sprint D ("Escrita Exclusiva do DH") — única capacidade de
  // escrita desta Central; todas as props abaixo são opcionais para não
  // quebrar nenhum consumidor anterior a esta Sprint (nenhum atual as
  // omite de propósito — se omitidas, o bloco de registro simplesmente
  // não aparece).
  dhDigitado?: string;
  onMudarDh?: (valor: string) => void;
  onRegistrarDh?: () => void;
  registrando?: boolean;
  resultadoRegistro?: ResultadoRegistroDH | null;
  erroRegistro?: string | null;
}

interface LinhaProps {
  rotulo: string;
  valor: string;
}

function Linha({ rotulo, valor }: LinhaProps) {
  return (
    <div>
      <p className={TIPOGRAFIA.legenda}>{rotulo}</p>
      <p className={`mt-1 ${TIPOGRAFIA.texto}`}>{valor}</p>
    </div>
  );
}

function textoTrecho(detalhe: DetalheProcesso): string {
  const { origem, destino } = detalhe.trecho;
  if (origem && destino) return `${origem} - ${destino}`;
  return destino ?? origem ?? "—";
}

// Micro-sprint B — objetivo daquela Sprint (item 7 do pedido): provar que a
// diária EXISTENTE carrega corretamente. Nenhum campo editável de DH, nenhum
// botão de gravação — a Micro-sprint D cuida disso.
//
// Micro-sprint C — Histórico e-Fisco + Valor acrescentados como dois blocos
// adicionais abaixo do card acima, sem reescrever nada dele (contrato já
// preparado desde a Micro-sprint B). Mesmo mecanismo de cópia da Micro-sprint
// A (`window.api.copiarTexto`) e mesmo formatador (`formatarValorDiariaCopiavel`)
// — nenhum segundo formatador/acesso a clipboard.
export default function DetalheProcessoAguardandoDH({
  sei,
  detalhe,
  carregando,
  erro,
  aoVoltar,
  aoTentarNovamente,
  dhDigitado,
  onMudarDh,
  onRegistrarDh,
  registrando,
  resultadoRegistro,
  erroRegistro,
}: Props) {
  const [historicoCopiado, setHistoricoCopiado] = useState(false);
  const [valorCopiado, setValorCopiado] = useState(false);

  async function copiarHistorico() {
    const texto = detalhe?.historico.texto;
    if (!texto) return;
    try {
      await window.api.copiarHistorico(texto);
    } catch {
      // O texto continua visível na tela para seleção manual mesmo se a
      // cópia nativa falhar — nunca bloqueia o servidor.
    }
    setHistoricoCopiado(true);
    setTimeout(() => setHistoricoCopiado(false), 2400);
  }

  async function copiarValor() {
    const valorTexto = detalhe?.valor.valor;
    if (!valorTexto) return;
    try {
      await window.api.copiarTexto?.(formatarValorDiariaCopiavel(valorTexto));
    } catch {
      // Mesma tolerância de `copiarHistorico` acima.
    }
    setValorCopiado(true);
    setTimeout(() => setValorCopiado(false), 2400);
  }

  const botaoVoltar = (
    <Botao variante="secundaria" onClick={aoVoltar}>
      ← Voltar à lista
    </Botao>
  );

  if (erro !== null) {
    return (
      <div className="space-y-6">
        {botaoVoltar}
        <div className={`p-5 ${SUPERFICIE_BASE}`}>
          <div className="flex items-center justify-between gap-4">
            <Alerta variante="erro">{erro}</Alerta>
            <Botao variante="secundaria" onClick={aoTentarNovamente}>
              Tentar novamente
            </Botao>
          </div>
        </div>
      </div>
    );
  }

  if (carregando || detalhe === null) {
    return (
      <div className="space-y-6">
        {botaoVoltar}
        <div role="status" className={`flex items-center justify-center p-16 ${SUPERFICIE_BASE}`}>
          <p className={TIPOGRAFIA.textoAuxiliar}>Carregando processo {sei}...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {botaoVoltar}

      <div className={`p-6 ${SUPERFICIE_BASE}`}>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Linha rotulo="SEI" valor={detalhe.sei} />
          <Linha
            rotulo={detalhe.categoria_funcional === "MEMBRO" ? "Membro" : "Servidor"}
            valor={detalhe.servidor_nome ?? "—"}
          />
          <Linha rotulo="CPF" valor={detalhe.cpf_mascarado ?? "—"} />
          <Linha rotulo="Período" valor={formatarPeriodoBr(detalhe.periodo.inicial, detalhe.periodo.final)} />
          <Linha rotulo="Trecho" valor={textoTrecho(detalhe)} />
          <div>
            <p className={TIPOGRAFIA.legenda}>Status</p>
            <p className="mt-1">
              {detalhe.ainda_aguardando_dh ? (
                <>
                  <span
                    aria-hidden="true"
                    className={`mr-1.5 inline-block h-2.5 w-2.5 rounded-full ${
                      CORES_STATUS[detalhe.situacao === "revisao_manual_necessaria" ? "aviso" : "info"].ponto
                    }`}
                  />
                  <Badge variante={detalhe.situacao === "revisao_manual_necessaria" ? "aviso" : "info"}>
                    Aguardando DH
                  </Badge>
                </>
              ) : (
                <Badge variante="sucesso">Já possui DH</Badge>
              )}
            </p>
          </div>
        </div>

        <p className={`mt-5 border-t border-white/10 pt-4 ${TIPOGRAFIA.textoAuxiliar}`}>{detalhe.mensagem}</p>

        {detalhe.ainda_aguardando_dh && detalhe.data_liberacao_prevista && (
          <p className={`mt-1.5 ${TIPOGRAFIA.textoAuxiliar}`}>
            Data de liberação prevista: {formatarDataBr(detalhe.data_liberacao_prevista)}
          </p>
        )}
      </div>

      {/* Micro-sprint C — Histórico e-Fisco. Independente do bloco Valor
          abaixo (item 13 do pedido): uma falha aqui nunca esconde o Valor
          nem o card de detalhe acima. */}
      <div className={`p-6 ${SUPERFICIE_BASE}`}>
        <h3 className={TIPOGRAFIA.subtitulo}>Histórico e-Fisco</h3>
        {detalhe.historico.situacao === "gerado" && detalhe.historico.texto ? (
          <>
            <p className={`mt-3 rounded-lg border border-white/10 bg-white/[0.03] p-4 leading-relaxed ${TIPOGRAFIA.texto}`}>
              {detalhe.historico.texto}
            </p>
            <div className="mt-4">
              <Botao variante="primaria" onClick={copiarHistorico}>
                <Copy aria-hidden="true" className="h-4 w-4" />
                Copiar Histórico
              </Botao>
            </div>
            {historicoCopiado && (
              <p className="mt-3 text-xs font-medium text-emerald-400">
                ✓ Copiado — cole diretamente no e-Fisco
              </p>
            )}
          </>
        ) : (
          <div className="mt-3">
            <Alerta variante="aviso">
              Não foi possível gerar automaticamente o Histórico e-Fisco para este processo.
              {detalhe.historico.motivo ? ` ${detalhe.historico.motivo}` : ""}
            </Alerta>
          </div>
        )}
      </div>

      {/* Micro-sprint C — Valor. Leitura do valor já registrado na diária
          existente — nunca recalculado (item 7/8 do pedido). */}
      <div className={`p-6 ${SUPERFICIE_BASE}`}>
        <h3 className={TIPOGRAFIA.subtitulo}>Valor</h3>
        {detalhe.valor.situacao === "disponivel" && detalhe.valor.valor ? (
          <>
            <p className={`mt-3 rounded-lg border border-white/10 bg-white/[0.03] p-4 ${TIPOGRAFIA.texto}`}>
              {formatarValorDiariaCopiavel(detalhe.valor.valor)}
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
        ) : (
          <div className="mt-3">
            <Alerta variante="aviso">{detalhe.valor.motivo ?? "Valor da diária não disponível no registro."}</Alerta>
          </div>
        )}
      </div>

      {/* Micro-sprint D — única capacidade de escrita desta Central. Só
          aparece quando o chamador passou as props de registro E (o
          processo ainda está aguardando DH OU já existe um resultado de
          registro para mostrar — mantém a confirmação visível mesmo
          depois de `detalhe` ser reconsultado e `ainda_aguardando_dh`
          virar `false`). Depois de "concluido"/"salvo_sync_pendente", o
          formulário dá lugar a uma confirmação — nunca permite reenviar
          sem necessidade. */}
      {onRegistrarDh && (detalhe.ainda_aguardando_dh || resultadoRegistro) && (
        <div className={`p-6 ${SUPERFICIE_BASE}`}>
          <h3 className={TIPOGRAFIA.subtitulo}>Registrar DH</h3>

          {resultadoRegistro?.situacao === "concluido" ? (
            <div className="mt-3">
              <Alerta variante="sucesso">{resultadoRegistro.mensagem}</Alerta>
            </div>
          ) : resultadoRegistro?.situacao === "salvo_sync_pendente" ? (
            <div className="mt-3">
              <Alerta variante="aviso">{resultadoRegistro.mensagem}</Alerta>
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              <Campo
                rotulo="Número do DH"
                placeholder="2026DH000123"
                value={dhDigitado ?? ""}
                onChange={(evento: ChangeEvent<HTMLInputElement>) => onMudarDh?.(evento.target.value)}
              />
              <Botao
                variante="primaria"
                onClick={onRegistrarDh}
                disabled={!dhDigitado?.trim()}
                carregando={registrando}
              >
                {registrando ? "Registrando..." : "Registrar DH"}
              </Botao>

              {resultadoRegistro?.situacao === "nao_salvo" && (
                <Alerta variante="erro">{resultadoRegistro.mensagem}</Alerta>
              )}
              {erroRegistro && <Alerta variante="erro">{erroRegistro}</Alerta>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
