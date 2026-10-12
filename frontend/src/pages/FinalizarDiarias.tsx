import { CheckCircle2, ClipboardCheck, RotateCcw } from "lucide-react";
import { Fragment, useState } from "react";
import AvisoConfiguracaoPendente from "../components/configuracao/AvisoConfiguracaoPendente";
import Alerta from "../components/ui/Alerta";
import Badge from "../components/ui/Badge";
import Botao from "../components/ui/Botao";
import BotaoArquivo from "../components/ui/BotaoArquivo";
import DialogoConfirmacao from "../components/ui/DialogoConfirmacao";
import FilaArquivos from "../components/upload/FilaArquivos";
import ZonaArrastar from "../components/upload/ZonaArrastar";
import { filtrarSomentePdf } from "../lib/arquivos";
import { adicionarArquivos, limparFila, removerArquivo, type ItemFila } from "../lib/fila";
import { MENSAGENS, mensagemAmigavel } from "../lib/mensagens";
import { analisarFinalizacao, confirmarFinalizacao } from "../services/api";
import { SUPERFICIE_BASE } from "../theme/estilos";
import { TIPOGRAFIA } from "../theme/tipografia";
import type {
  ItemAnaliseFinalizacao,
  ItemResultadoConfirmacao,
  RespostaConfirmacaoFinalizacao,
  StatusFinalizacao,
} from "../types/finalizacao";
import type { VarianteStatus } from "../theme/cores";
import type { ChangeEvent } from "react";
import type { EstadoConfiguracao } from "../types/configuracao";
import type { OrganizacaoItem, StatusOrganizacao } from "../types/processamento";

interface Props {
  backendOnline: boolean;
  /** Organização Automática de PDFs — mesma fonte compartilhada de
   * `App.tsx` (Hub/Conferência/SelecionarProcessar). Opcional para não
   * quebrar testes existentes que montam este componente isoladamente;
   * `null`/ausente nunca bloqueia nada. */
  configuracaoAtiva?: EstadoConfiguracao | null;
  aoAbrirConfiguracoes?: () => void;
}

// Organização Automática de PDFs — mesmo critério de `os.path.basename`
// usado pelo backend, replicado aqui só para montar o mapa nome-base ->
// caminho absoluto (nunca enviado como parte da regra de negócio em si).
function nomeDoArquivoNaFila(caminho: string): string {
  return caminho.split(/[\\/]/).pop() ?? caminho;
}

// Regra de negócio definitiva (Sprint pré-build, 2026-08-11) — só SEI não
// localizado/não extraído e estado parcial (valor fora do padrão em X/Y)
// bloqueiam. RN-08: vermelho fica reservado a isso e à falha técnica real
// de leitura do PDF; "já confirmado" é informativo (nunca erro).
const _ROTULO_STATUS: Record<StatusFinalizacao, string> = {
  pronto: "Pronto para confirmação",
  ja_finalizado: "Já confirmada na Planilha Oficial",
  sei_nao_extraido: "SEI não identificado no processo",
  sei_nao_encontrado: "SEI não localizado na Planilha Oficial",
  estado_parcial: "Estado parcial — revisão manual",
  erro_leitura: "Erro ao ler o PDF",
};

const _VARIANTE_STATUS: Record<StatusFinalizacao, VarianteStatus> = {
  pronto: "sucesso",
  ja_finalizado: "info",
  sei_nao_extraido: "erro",
  sei_nao_encontrado: "erro",
  estado_parcial: "erro",
  erro_leitura: "erro",
};

// Organização Automática de PDFs — texto exibido na coluna "Organização"
// do relatório de execução; espelha `StatusOrganizacao`
// (`types/processamento.ts`). `null`/ausente (IGNORADO, ou caminho
// absoluto não disponível) mostra só "—", nunca um erro.
const _ROTULO_STATUS_ORGANIZACAO: Record<StatusOrganizacao, string> = {
  movido: "Movido para Processados",
  excluido: "Excluído da pasta de origem",
  ja_existia_removido_da_origem: "Já existia no destino — origem removida",
  ja_existia_origem_mantida: "Já existia no destino — origem mantida",
  pasta_nao_configurada: "Pasta operacional não configurada",
  arquivo_fora_da_pasta: "Arquivo fora da pasta configurada",
  arquivo_nao_encontrado: "Arquivo não encontrado na origem",
  falha_permissao: "Falha de permissão ao organizar",
  falha_filesystem: "Falha ao organizar o arquivo",
};

function textoOrganizacao(organizacao: OrganizacaoItem | null | undefined): string {
  if (!organizacao) return "—";
  return _ROTULO_STATUS_ORGANIZACAO[organizacao.status];
}

const _MENSAGEM_ALERTAS_INFORMATIVOS =
  "Os alertas abaixo são informativos. A decisão de finalizar os processos pertence ao servidor responsável.";

function formatarData(iso: string | null): string {
  if (!iso) return "—";
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

// Sprint pré-build, 2026-08-11 — classificação final de UM item para o
// relatório de execução: rastreabilidade completa do lote, nenhum processo
// desaparece. `confirmado` é a entrada correspondente em `resultadoConfirmacao.
// itens`, quando este arquivo chegou a ser enviado a `/confirmar` —
// `undefined` quando nunca foi enviado (já estava confirmado, ou bloqueado
// na análise).
type ClassificacaoFinal = "confirmado_agora" | "ja_estava" | "nao_finalizado";

function classificarResultadoFinal(
  item: ItemAnaliseFinalizacao,
  confirmado: ItemResultadoConfirmacao | undefined,
): ClassificacaoFinal {
  if (confirmado) {
    if (confirmado.categoria === "finalizado") return "confirmado_agora";
    if (confirmado.categoria === "ja_confirmado") return "ja_estava";
    return "nao_finalizado";
  }
  if (item.status === "ja_finalizado") return "ja_estava";
  return "nao_finalizado";
}

const _ROTULO_CLASSIFICACAO: Record<ClassificacaoFinal, string> = {
  confirmado_agora: "Confirmado nesta operação",
  ja_estava: "Já estava confirmado",
  nao_finalizado: "Não finalizado",
};

const _VARIANTE_CLASSIFICACAO: Record<ClassificacaoFinal, VarianteStatus> = {
  confirmado_agora: "sucesso",
  ja_estava: "info",
  nao_finalizado: "erro",
};

export default function FinalizarDiarias({
  backendOnline,
  configuracaoAtiva = null,
  aoAbrirConfiguracoes,
}: Props) {
  const [fila, setFila] = useState<ItemFila[]>([]);
  const [avisoFila, setAvisoFila] = useState<string | null>(null);
  const [analisando, setAnalisando] = useState(false);
  const [itens, setItens] = useState<ItemAnaliseFinalizacao[] | null>(null);
  const [erroAnalise, setErroAnalise] = useState<string | null>(null);
  // Organização Automática de PDFs — mapa nome-base -> caminho absoluto,
  // capturado no início de `analisar()` (a fila continua editável depois
  // da análise; usar `fila` diretamente na confirmação arriscaria mapear o
  // caminho errado se algum item fosse removido nesse meio-tempo).
  const [caminhosAbsolutos, setCaminhosAbsolutos] = useState<Record<string, string>>({});

  const [confirmando, setConfirmando] = useState(false);
  const [resultadoConfirmacao, setResultadoConfirmacao] =
    useState<RespostaConfirmacaoFinalizacao | null>(null);
  const [erroConfirmacao, setErroConfirmacao] = useState<string | null>(null);

  // Item 6 do pedido — toda finalização passa por confirmação explícita
  // antes da escrita, mesmo sem nenhum alerta.
  const [dialogoConfirmacaoAberto, setDialogoConfirmacaoAberto] = useState(false);

  const algumaOperacaoEmAndamento = analisando || confirmando;

  // Organização Automática de PDFs — pasta configurada para esta função.
  // `null` quando ainda não configurada/carregada — nesse caso a guarda
  // abaixo simplesmente não filtra nada.
  const prontidaoFinalizacao = configuracaoAtiva?.configurado
    ? configuracaoAtiva.prontidao_pastas.finalizacao
    : null;
  const finalizacaoBloqueada = prontidaoFinalizacao !== null && !prontidaoFinalizacao.liberado;
  const pastaGuarda =
    configuracaoAtiva?.configurado ? configuracaoAtiva.caminho_pdfs_diarias_a_confirmar : null;

  async function adicionarNaFila(novosArquivos: File[]) {
    const { validos } = filtrarSomentePdf(novosArquivos);

    // Guarda de pasta (decisão confirmada): seleção de PDF continua via
    // <input type="file"> + webUtils.getPathForFile — só valida
    // pertencimento à pasta configurada antes do processamento.
    // `caminhoDentroDaPasta` é assíncrona (round-trip por IPC até o
    // processo main — o preload roda sandboxado neste app e não tem
    // acesso direto ao módulo `path` do Node).
    let aceitos = validos;
    let rejeitadosPelaPasta = 0;
    if (pastaGuarda && window.api.caminhoDentroDaPasta) {
      const verificacoes = await Promise.all(
        validos.map(async (arquivo) => {
          const caminho = window.api.getPathForFile(arquivo);
          return { arquivo, dentro: await window.api.caminhoDentroDaPasta!(caminho, pastaGuarda) };
        }),
      );
      aceitos = verificacoes.filter((v) => v.dentro).map((v) => v.arquivo);
      rejeitadosPelaPasta = verificacoes.length - aceitos.length;
    }

    const resultadoAdicao = adicionarArquivos(fila, aceitos, (arquivo) =>
      window.api.getPathForFile(arquivo),
    );
    setFila(resultadoAdicao.fila);
    setAvisoFila(rejeitadosPelaPasta > 0 ? MENSAGENS.pdfForaDaPastaConfigurada : null);
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
    setAvisoFila(null);
    setItens(null);
    setErroAnalise(null);
    setResultadoConfirmacao(null);
    setErroConfirmacao(null);
    setDialogoConfirmacaoAberto(false);
    setCaminhosAbsolutos({});
  }

  async function analisar() {
    if (fila.length === 0 || !backendOnline) return;
    setAnalisando(true);
    setErroAnalise(null);
    const caminhos = fila.map((item) => item.chave);
    // Organização Automática de PDFs — capturado agora, no momento em que
    // a ordem de `fila` ainda corresponde garantidamente à de `resposta.
    // itens` (ver comentário na declaração do estado, acima).
    setCaminhosAbsolutos(
      Object.fromEntries(caminhos.map((caminho) => [nomeDoArquivoNaFila(caminho), caminho])),
    );
    try {
      const resposta = await analisarFinalizacao(caminhos);
      setItens(resposta.itens);
    } catch (erro) {
      setErroAnalise(mensagemAmigavel(erro, "Não foi possível analisar os processos selecionados."));
    } finally {
      setAnalisando(false);
    }
  }

  // A regra é do PROCESSO (SEI), não da linha isolada (ajuste de
  // 2026-08-07): todo processo "pronto" entra no lote a finalizar — o
  // backend grava em TODAS as linhas vinculadas àquele SEI de uma vez, de
  // forma atômica. Regra definitiva (2026-08-11): alertas documentais nunca
  // impedem — só a localização do SEI decide se o processo entra aqui.
  function itensRestantes(): ItemAnaliseFinalizacao[] {
    if (!itens) return [];
    return itens.filter((item) => item.status === "pronto" && item.sei);
  }

  function pedirConfirmacao() {
    if (itensRestantes().length === 0) return;
    setDialogoConfirmacaoAberto(true);
  }

  async function confirmarFinalizacaoDoLote() {
    setDialogoConfirmacaoAberto(false);
    const alvo = itensRestantes().map((item) => ({
      arquivo_origem: item.arquivo_origem,
      sei: item.sei as string,
      // Organização Automática de PDFs — ausente (`undefined`) quando o
      // nome-base não bate com nenhuma chave do mapa (nunca deveria
      // acontecer em uso normal); o backend trata como "não informado",
      // nunca bloqueia a confirmação em si.
      ...(caminhosAbsolutos[item.arquivo_origem]
        ? { caminho_absoluto: caminhosAbsolutos[item.arquivo_origem] }
        : {}),
    }));
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

  if (resultadoConfirmacao && itens) {
    const mapaConfirmacao = new Map(resultadoConfirmacao.itens.map((item) => [item.arquivo_origem, item]));
    const linhas = itens.map((item) => {
      const confirmado = mapaConfirmacao.get(item.arquivo_origem);
      const classificacao = classificarResultadoFinal(item, confirmado);
      return { item, confirmado, classificacao };
    });

    const contagem = linhas.reduce(
      (acc, { classificacao }) => {
        acc[classificacao] += 1;
        return acc;
      },
      { confirmado_agora: 0, ja_estava: 0, nao_finalizado: 0 } as Record<ClassificacaoFinal, number>,
    );

    const confirmadosComAlerta = linhas.filter(
      ({ classificacao, item }) => classificacao === "confirmado_agora" && (item.avaliacao?.alertas.length ?? 0) > 0,
    ).length;

    // Item 8 — aviso verde só quando alguma escrita NOVA aconteceu nesta
    // operação (nunca quando tudo já estava SIM/SIM).
    const houveNovaEscrita = resultadoConfirmacao.total_finalizado > 0;

    return (
      <div className="mx-auto max-w-4xl animate-entrada-conteudo px-6 py-14 md:px-10">
        <h2 className={TIPOGRAFIA.titulo}>Finalização concluída</h2>
        <p className={`mt-2 ${TIPOGRAFIA.texto}`}>{itens.length} processo(s) analisado(s)</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Badge variante="sucesso">✓ {contagem.confirmado_agora} confirmado(s) nesta operação</Badge>
          <Badge variante="info">✓ {contagem.ja_estava} já estava(m) confirmado(s)</Badge>
          {contagem.nao_finalizado > 0 && (
            <Badge variante="erro">✕ {contagem.nao_finalizado} não finalizado(s)</Badge>
          )}
        </div>
        {confirmadosComAlerta > 0 && (
          <p className={`mt-3 ${TIPOGRAFIA.textoAuxiliar}`}>
            {confirmadosComAlerta} dos processos confirmados apresentaram alertas durante a análise
            documental.
          </p>
        )}

        {houveNovaEscrita && (
          <div className="mt-6">
            <Alerta variante="sucesso">
              Não esqueça de incluir os processos finalizados neste lote no bloco interno &ldquo;DIÁRIAS
              CONFIRMADAS 2026&rdquo; no SEI.
            </Alerta>
          </div>
        )}

        <div className={`mt-8 overflow-hidden ${SUPERFICIE_BASE}`}>
          <table className="w-full text-left text-sm">
            <thead className="border-b border-white/10 text-slate-400">
              <tr>
                <th className="px-4 py-2.5 font-medium">Arquivo</th>
                <th className="px-4 py-2.5 font-medium">SEI</th>
                <th className="px-4 py-2.5 font-medium">Linhas atualizadas</th>
                <th className="px-4 py-2.5 font-medium">Linhas mantidas</th>
                <th className="px-4 py-2.5 font-medium">Resultado</th>
                <th className="px-4 py-2.5 font-medium">Motivo</th>
                <th className="px-4 py-2.5 font-medium">Organização</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {linhas.map(({ item, confirmado, classificacao }) => (
                <tr key={item.arquivo_origem}>
                  <td className="px-4 py-2.5 text-slate-300">{item.arquivo_origem}</td>
                  <td className="px-4 py-2.5 text-slate-300">{item.sei ?? confirmado?.sei ?? "—"}</td>
                  <td className="px-4 py-2.5 text-slate-300">
                    {confirmado && confirmado.linhas_atualizadas.length > 0
                      ? confirmado.linhas_atualizadas.join(", ")
                      : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-slate-500">
                    {confirmado && confirmado.linhas_mantidas.length > 0
                      ? confirmado.linhas_mantidas.join(", ")
                      : "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge variante={_VARIANTE_CLASSIFICACAO[classificacao]}>
                      {_ROTULO_CLASSIFICACAO[classificacao]}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 text-slate-400">
                    {confirmado?.motivo ?? item.motivo ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 text-slate-400">
                    {textoOrganizacao(confirmado?.organizacao)}
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

  // --- Tela de análise ---------------------------------------------------

  const todosOsItens = itens ?? [];
  const jaConfirmados = todosOsItens.filter((item) => item.status === "ja_finalizado");
  const restantes = itensRestantes();
  const restantesSemAlerta = restantes.filter((item) => (item.avaliacao?.alertas.length ?? 0) === 0);
  const restantesComAlerta = restantes.filter((item) => (item.avaliacao?.alertas.length ?? 0) > 0);
  const naoLocalizados = todosOsItens.filter(
    (item) => item.status !== "pronto" && item.status !== "ja_finalizado",
  );

  return (
    <div className="mx-auto max-w-4xl animate-entrada-conteudo px-6 py-14 md:px-10">
      <h2 className={TIPOGRAFIA.titulo}>Finalizar Diárias</h2>
      <p className={`mt-2 ${TIPOGRAFIA.texto}`}>
        Confirmar comprovantes e confirmação de diárias na Planilha Oficial.
      </p>

      {finalizacaoBloqueada ? (
        <div className="mt-8">
          <AvisoConfiguracaoPendente
            pastasFaltando={prontidaoFinalizacao?.pastas_faltando ?? []}
            aoConfigurar={() => aoAbrirConfiguracoes?.()}
          />
        </div>
      ) : (
        <>
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

          {avisoFila && (
            <div className="mt-4">
              <Alerta variante="aviso">{avisoFila}</Alerta>
            </div>
          )}

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
        </>
      )}

      {erroAnalise && (
        <div className="mt-6">
          <Alerta variante="erro">{erroAnalise}</Alerta>
        </div>
      )}

      {itens && (
        <div className="mt-10 animate-entrada-conteudo">
          <h3 className={TIPOGRAFIA.subtitulo}>{itens.length} processo(s) analisado(s)</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge variante="info">✓ {jaConfirmados.length} já confirmado(s) na Planilha Oficial</Badge>
            <Badge variante="sucesso">✓ {restantesSemAlerta.length} pronto(s) para confirmação</Badge>
            {restantesComAlerta.length > 0 && (
              <Badge variante="aviso">⚠ {restantesComAlerta.length} localizado(s) com alertas</Badge>
            )}
            <Badge variante="erro">✕ {naoLocalizados.length} não localizado(s)</Badge>
          </div>

          {jaConfirmados.length > 0 && (
            <div className="mt-4">
              <Alerta variante="info">
                {jaConfirmados.length} processo(s) deste lote já estão confirmados na Planilha Oficial.
                Você pode prosseguir com a finalização dos processos restantes.
              </Alerta>
            </div>
          )}

          {restantesComAlerta.length > 0 && (
            <div className="mt-4">
              <Alerta variante="aviso">{_MENSAGEM_ALERTAS_INFORMATIVOS}</Alerta>
            </div>
          )}

          <div className={`mt-4 overflow-hidden ${SUPERFICIE_BASE}`}>
            <table className="w-full text-left text-sm">
              <thead className="border-b border-white/10 text-slate-400">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Arquivo</th>
                  <th className="px-4 py-2.5 font-medium">SEI</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Alertas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {itens.map((item) => (
                  <Fragment key={item.arquivo_origem}>
                    <tr>
                      <td className="px-4 py-2.5 text-slate-300">{item.arquivo_origem}</td>
                      <td className="px-4 py-2.5 text-slate-300">{item.sei ?? "—"}</td>
                      <td className="px-4 py-2.5">
                        <Badge variante={_VARIANTE_STATUS[item.status]}>{_ROTULO_STATUS[item.status]}</Badge>
                      </td>
                      <td className="px-4 py-2.5 text-slate-400">
                        {item.avaliacao && item.avaliacao.alertas.length > 0 ? (
                          <ul className="flex flex-col gap-0.5">
                            {item.avaliacao.alertas.map((alerta) => (
                              <li key={alerta}>⚠ {alerta}</li>
                            ))}
                          </ul>
                        ) : (
                          item.motivo ?? "—"
                        )}
                      </td>
                    </tr>
                    {item.candidatos.length > 1 && (
                      <tr>
                        <td colSpan={4} className="bg-white/[0.02] px-4 py-3">
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
              onClick={pedirConfirmacao}
              disabled={restantes.length === 0 || algumaOperacaoEmAndamento}
              carregando={confirmando}
            >
              {!confirmando && <CheckCircle2 aria-hidden="true" className="h-5 w-5" />}
              {confirmando ? "Finalizando..." : `Finalizar ${restantes.length} processo(s) restante(s)`}
            </Botao>
          </div>
        </div>
      )}

      {dialogoConfirmacaoAberto && (
        <DialogoConfirmacao
          titulo="Confirmar finalização"
          mensagem={`Você está prestes a finalizar ${restantes.length} processo(s) localizado(s) na Planilha Oficial.\n\nOs alertas apresentados são informativos e não impedem a finalização.\n\nDeseja continuar?`}
          rotuloConfirmar="Confirmar finalização"
          rotuloCancelar="Cancelar"
          onConfirmar={confirmarFinalizacaoDoLote}
          onCancelar={() => setDialogoConfirmacaoAberto(false)}
        />
      )}
    </div>
  );
}
