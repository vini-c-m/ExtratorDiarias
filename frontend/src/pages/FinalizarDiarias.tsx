import { CheckCircle2, ClipboardCheck, RotateCcw } from "lucide-react";
import { Fragment, useState } from "react";
import Alerta from "../components/ui/Alerta";
import Badge from "../components/ui/Badge";
import Botao from "../components/ui/Botao";
import BotaoArquivo from "../components/ui/BotaoArquivo";
import FilaArquivos from "../components/upload/FilaArquivos";
import ZonaArrastar from "../components/upload/ZonaArrastar";
import { filtrarSomentePdf } from "../lib/arquivos";
import { adicionarArquivos, limparFila, removerArquivo, type ItemFila } from "../lib/fila";
import { mensagemAmigavel } from "../lib/mensagens";
import { analisarFinalizacao, confirmarFinalizacao } from "../services/api";
import { SUPERFICIE_BASE } from "../theme/estilos";
import { TIPOGRAFIA } from "../theme/tipografia";
import type {
  ItemAnaliseFinalizacao,
  ItemParaConfirmar,
  RespostaConfirmacaoFinalizacao,
  StatusFinalizacao,
} from "../types/finalizacao";
import type { VarianteStatus } from "../theme/cores";
import type { ChangeEvent } from "react";

interface Props {
  backendOnline: boolean;
}

// RN-08 (`theme/cores.ts`) — vermelho fica reservado a falha técnica real
// (aqui só `erro_leitura`, PDF ilegível). Toda condição de negócio que
// impede a finalização (sem comprovante, sem confirmação, estado parcial
// etc.) usa "aviso", nunca "erro" — mesma convenção já usada na Central de
// Conferência para o veredito "não apto".
const _ROTULO_STATUS: Record<StatusFinalizacao, string> = {
  pronto: "Pronto para finalizar",
  ja_finalizado: "Já finalizado anteriormente",
  sem_comprovante: "Sem comprovante/anexo",
  sem_confirmacao: "Sem Confirmação de Diárias",
  sei_nao_extraido: "SEI não identificado no processo",
  sei_nao_encontrado: "SEI não localizado na Planilha Oficial",
  estado_parcial: "Estado parcial — revisão manual",
  erro_leitura: "Erro ao ler o PDF",
};

const _VARIANTE_STATUS: Record<StatusFinalizacao, VarianteStatus> = {
  pronto: "sucesso",
  ja_finalizado: "info",
  sem_comprovante: "aviso",
  sem_confirmacao: "aviso",
  sei_nao_extraido: "aviso",
  sei_nao_encontrado: "aviso",
  estado_parcial: "aviso",
  erro_leitura: "erro",
};

function formatarData(iso: string | null): string {
  if (!iso) return "—";
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

export default function FinalizarDiarias({ backendOnline }: Props) {
  const [fila, setFila] = useState<ItemFila[]>([]);
  const [analisando, setAnalisando] = useState(false);
  const [itens, setItens] = useState<ItemAnaliseFinalizacao[] | null>(null);
  const [erroAnalise, setErroAnalise] = useState<string | null>(null);

  const [confirmando, setConfirmando] = useState(false);
  const [resultadoConfirmacao, setResultadoConfirmacao] =
    useState<RespostaConfirmacaoFinalizacao | null>(null);
  const [erroConfirmacao, setErroConfirmacao] = useState<string | null>(null);

  const algumaOperacaoEmAndamento = analisando || confirmando;

  function adicionarNaFila(novosArquivos: File[]) {
    const { validos } = filtrarSomentePdf(novosArquivos);
    const resultadoAdicao = adicionarArquivos(fila, validos, (arquivo) =>
      window.api.getPathForFile(arquivo),
    );
    setFila(resultadoAdicao.fila);
    setItens(null);
    setErroAnalise(null);
    setResultadoConfirmacao(null);
  }

  function selecionarArquivos(evento: ChangeEvent<HTMLInputElement>) {
    adicionarNaFila(Array.from(evento.target.files ?? []));
    evento.target.value = "";
  }

  function removerDaFila(chave: string) {
    setFila((atual) => removerArquivo(atual, chave));
  }

  function novaAnalise() {
    setFila(limparFila());
    setItens(null);
    setErroAnalise(null);
    setResultadoConfirmacao(null);
    setErroConfirmacao(null);
  }

  async function analisar() {
    if (fila.length === 0 || !backendOnline) return;
    setAnalisando(true);
    setErroAnalise(null);
    try {
      const resposta = await analisarFinalizacao(fila.map((item) => item.chave));
      setItens(resposta.itens);
    } catch (erro) {
      setErroAnalise(mensagemAmigavel(erro, "Não foi possível analisar os processos selecionados."));
    } finally {
      setAnalisando(false);
    }
  }

  // A regra é do PROCESSO (SEI), não da linha isolada (ajuste de
  // 2026-08-07): todo processo "pronto" entra no lote a finalizar — o
  // backend grava SIM/SIM em TODAS as linhas vinculadas àquele SEI de uma
  // vez, de forma atômica. Nenhuma escolha manual de linha.
  function itensParaFinalizar(): ItemParaConfirmar[] {
    if (!itens) return [];
    return itens
      .filter((item) => item.status === "pronto" && item.sei)
      .map((item) => ({ arquivo_origem: item.arquivo_origem, sei: item.sei as string }));
  }

  async function finalizar() {
    const alvo = itensParaFinalizar();
    if (alvo.length === 0) return;
    setConfirmando(true);
    setErroConfirmacao(null);
    try {
      const resposta = await confirmarFinalizacao(alvo);
      setResultadoConfirmacao(resposta);
    } catch (erro) {
      setErroConfirmacao(mensagemAmigavel(erro, "Não foi possível finalizar os processos selecionados."));
    } finally {
      setConfirmando(false);
    }
  }

  // --- Tela final: relatório de execução -------------------------------------

  if (resultadoConfirmacao) {
    return (
      <div className="mx-auto max-w-4xl animate-entrada-conteudo px-6 py-14 md:px-10">
        <h2 className={TIPOGRAFIA.titulo}>Finalização concluída</h2>
        <p className={`mt-2 ${TIPOGRAFIA.texto}`}>
          {resultadoConfirmacao.total_finalizado} finalizado(s), {resultadoConfirmacao.total_ignorado}{" "}
          ignorado(s).
        </p>

        <div className={`mt-8 overflow-hidden ${SUPERFICIE_BASE}`}>
          <table className="w-full text-left text-sm">
            <thead className="border-b border-white/10 text-slate-400">
              <tr>
                <th className="px-4 py-2.5 font-medium">Arquivo</th>
                <th className="px-4 py-2.5 font-medium">SEI</th>
                <th className="px-4 py-2.5 font-medium">Linhas atualizadas</th>
                <th className="px-4 py-2.5 font-medium">Linhas mantidas</th>
                <th className="px-4 py-2.5 font-medium">Resultado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {resultadoConfirmacao.itens.map((item) => (
                <tr key={`${item.arquivo_origem}-${item.sei}`}>
                  <td className="px-4 py-2.5 text-slate-300">{item.arquivo_origem}</td>
                  <td className="px-4 py-2.5 text-slate-300">{item.sei}</td>
                  <td className="px-4 py-2.5 text-slate-300">
                    {item.linhas_atualizadas.length > 0 ? item.linhas_atualizadas.join(", ") : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-slate-500">
                    {item.linhas_mantidas.length > 0 ? item.linhas_mantidas.join(", ") : "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge variante={item.categoria === "finalizado" ? "sucesso" : "aviso"}>
                      {item.categoria === "finalizado" ? "Finalizado" : item.motivo}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-10 flex justify-center">
          <Botao variante="primaria" tamanho="grande" onClick={novaAnalise}>
            <RotateCcw aria-hidden="true" className="h-5 w-5" />
            Nova Análise
          </Botao>
        </div>
      </div>
    );
  }

  const alvoFinalizacao = itensParaFinalizar();

  return (
    <div className="mx-auto max-w-4xl animate-entrada-conteudo px-6 py-14 md:px-10">
      <h2 className={TIPOGRAFIA.titulo}>Finalizar Diárias</h2>
      <p className={`mt-2 ${TIPOGRAFIA.texto}`}>
        Confirmar comprovantes e confirmação de diárias na Planilha Oficial.
      </p>

      <div className="mt-8">
        <ZonaArrastar onArquivosSoltos={adicionarNaFila} desabilitado={algumaOperacaoEmAndamento}>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <BotaoArquivo
                accept=".pdf"
                multiplo
                desabilitado={algumaOperacaoEmAndamento}
                onChange={selecionarArquivos}
              >
                Selecionar PDFs
              </BotaoArquivo>
              <span className="text-xs text-slate-500">ou arraste os arquivos aqui</span>
            </div>
            <FilaArquivos
              itens={fila}
              onRemover={removerDaFila}
              onLimpar={() => setFila(limparFila())}
              desabilitado={algumaOperacaoEmAndamento}
            />
          </div>
        </ZonaArrastar>
      </div>

      {!backendOnline && (
        <div className="mt-4">
          <Alerta variante="aviso">Aguardando o aplicativo terminar de iniciar...</Alerta>
        </div>
      )}

      <div className="mt-6">
        <Botao
          variante="primaria"
          onClick={analisar}
          disabled={fila.length === 0 || !backendOnline || algumaOperacaoEmAndamento}
          carregando={analisando}
        >
          {!analisando && <ClipboardCheck aria-hidden="true" className="h-4 w-4" />}
          {analisando ? "Analisando..." : "Analisar"}
        </Botao>
      </div>

      {erroAnalise && (
        <div className="mt-6">
          <Alerta variante="erro">{erroAnalise}</Alerta>
        </div>
      )}

      {itens && (
        <div className="mt-10 animate-entrada-conteudo">
          <h3 className={TIPOGRAFIA.subtitulo}>
            {itens.length} processo(s) analisado(s) — {alvoFinalizacao.length} pronto(s) para finalizar
          </h3>

          <div className={`mt-4 overflow-hidden ${SUPERFICIE_BASE}`}>
            <table className="w-full text-left text-sm">
              <thead className="border-b border-white/10 text-slate-400">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Arquivo</th>
                  <th className="px-4 py-2.5 font-medium">SEI</th>
                  <th className="px-4 py-2.5 font-medium">Confirmação</th>
                  <th className="px-4 py-2.5 font-medium">Comprovante</th>
                  <th className="px-4 py-2.5 font-medium">OB</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {itens.map((item) => (
                  <Fragment key={item.arquivo_origem}>
                    <tr>
                      <td className="px-4 py-2.5 text-slate-300">{item.arquivo_origem}</td>
                      <td className="px-4 py-2.5 text-slate-300">{item.sei ?? "—"}</td>
                      <td className="px-4 py-2.5 text-slate-300">
                        {item.avaliacao ? (item.avaliacao.confirmacao_valida ? "Sim" : "Não") : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-slate-300">
                        {item.avaliacao ? (item.avaliacao.comprovante_encontrado ? "Sim" : "Não") : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-slate-500">
                        {item.avaliacao ? (item.avaliacao.ordem_bancaria_encontrada ? "Sim" : "Não") : "—"}
                        <span className="ml-1 text-[10px] uppercase tracking-wide">(informativo)</span>
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge variante={_VARIANTE_STATUS[item.status]}>{_ROTULO_STATUS[item.status]}</Badge>
                      </td>
                    </tr>
                    {item.candidatos.length > 1 && (
                      <tr>
                        <td colSpan={6} className="bg-white/[0.02] px-4 py-3">
                          <p className={TIPOGRAFIA.textoAuxiliar}>
                            {item.candidatos.length} registros vinculados a este SEI serão finalizados
                            juntos (ex.: diária original + Complemento de Diárias):
                          </p>
                          <ul className="mt-2 flex flex-col gap-1 text-sm text-slate-300">
                            {item.candidatos.map((candidato) => (
                              <li key={candidato.linha}>
                                Linha {candidato.linha} — DH {candidato.dh ?? "—"} — CPF{" "}
                                {candidato.cpf ?? "—"} — {formatarData(candidato.periodo_inicial)} a{" "}
                                {formatarData(candidato.periodo_final)}
                                {candidato.aviso && ` — ${candidato.aviso}`}
                                {candidato.estado === "ja_finalizada" && (
                                  <span className="ml-1 text-xs text-cyan-400">(já finalizada)</span>
                                )}
                              </li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          {erroConfirmacao && (
            <div className="mt-4">
              <Alerta variante="erro">{erroConfirmacao}</Alerta>
            </div>
          )}

          <div className="mt-6">
            <Botao
              variante="primaria"
              tamanho="grande"
              onClick={finalizar}
              disabled={alvoFinalizacao.length === 0 || algumaOperacaoEmAndamento}
              carregando={confirmando}
            >
              {!confirmando && <CheckCircle2 aria-hidden="true" className="h-5 w-5" />}
              {confirmando ? "Finalizando..." : `Finalizar ${alvoFinalizacao.length} processo(s)`}
            </Botao>
          </div>
        </div>
      )}
    </div>
  );
}
