import {
  Download,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  ListChecks,
  Play,
  RotateCcw,
  Save,
  Upload,
} from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import Alerta from "../components/ui/Alerta";
import Badge from "../components/ui/Badge";
import Botao from "../components/ui/Botao";
import BotaoArquivo from "../components/ui/BotaoArquivo";
import DialogoConfirmacao from "../components/ui/DialogoConfirmacao";
import BarraProgresso from "../components/progress/BarraProgresso";
import ResumoResultado from "../components/results/ResumoResultado";
import TabelaPreVisualizacao from "../components/results/TabelaPreVisualizacao";
import TabelaResultado from "../components/results/TabelaResultado";
import FilaArquivos from "../components/upload/FilaArquivos";
import ZonaArrastar from "../components/upload/ZonaArrastar";
import { filtrarSomentePdf } from "../lib/arquivos";
import { adicionarArquivos, limparFila, removerArquivo, type ItemFila } from "../lib/fila";
import { MENSAGENS, mensagemAmigavel } from "../lib/mensagens";
import { formatarDuracao } from "../lib/progresso";
import {
  preencherPlanilha,
  processarLoteComProgresso,
  ProcessamentoCanceladoError,
  type ProgressoProcessamento,
} from "../services/api";
import type { EstadoApp } from "../components/layout/Cabecalho";
import { SUPERFICIE_BASE } from "../theme/estilos";
import { TIPOGRAFIA } from "../theme/tipografia";
import type { LoteProcessamento, ResultadoPreenchimento } from "../types/processamento";

interface Props {
  backendOnline: boolean;
  /** Sprint 09.2 — reporta para o `Cabecalho` (via `App`) em que etapa do
   * fluxo esta tela está, para o indicador de status deixar de falar de
   * "backend" e passar a falar a língua do usuário (pronto/processando/
   * preenchendo/concluído). Opcional só para não obrigar quem testa este
   * componente isoladamente a passar um callback que não usa. */
  aoMudarEstado?: (estado: EstadoApp) => void;
}

export default function SelecionarProcessar({ backendOnline, aoMudarEstado }: Props) {
  const [fila, setFila] = useState<ItemFila[]>([]);
  const [avisoFila, setAvisoFila] = useState<string | null>(null);

  const [processando, setProcessando] = useState(false);
  const processandoRef = useRef(false); // trava síncrona contra clique duplo/reentrância
  const [progresso, setProgresso] = useState<ProgressoProcessamento | null>(null);
  const [tempoDecorridoMs, setTempoDecorridoMs] = useState(0);
  const [resultado, setResultado] = useState<LoteProcessamento | null>(null);
  const [erroGeral, setErroGeral] = useState<string | null>(null);

  // Sprint 05.3 — cancelamento seguro do processamento em andamento.
  // `abortControllerRef` aborta a requisição em voo; nada além do laço de
  // `processarLoteComProgresso` grava qualquer coisa em disco durante o
  // processamento (planilha/relatório só existem depois de "Preencher
  // planilha", uma etapa manual e separada), então interromper aqui nunca
  // deixa arquivo parcial.
  const abortControllerRef = useRef<AbortController | null>(null);
  const [confirmandoInterrupcao, setConfirmandoInterrupcao] = useState(false);
  const [mensagemCancelamento, setMensagemCancelamento] = useState<string | null>(null);

  const [planilhaCaminho, setPlanilhaCaminho] = useState<string | null>(null);
  const [preenchendo, setPreenchendo] = useState(false);
  const [resultadoPreenchimento, setResultadoPreenchimento] =
    useState<ResultadoPreenchimento | null>(null);
  const [erroPreenchimento, setErroPreenchimento] = useState<string | null>(null);
  const [erroAcao, setErroAcao] = useState<string | null>(null);
  const [mensagemSucessoAcao, setMensagemSucessoAcao] = useState<string | null>(null);
  const [relatorioSalvo, setRelatorioSalvo] = useState<{ caminho: string; pasta: string } | null>(
    null,
  );

  const [inicioProcessamento, setInicioProcessamento] = useState<number | null>(null);
  const [duracaoMs, setDuracaoMs] = useState<number | null>(null);

  // Segurança operacional (item 4 da Sprint): enquanto qualquer operação
  // estiver em andamento, todos os controles de entrada ficam desabilitados
  // — nunca dois processamentos/preenchimentos simultâneos.
  const algumaOperacaoEmAndamento = processando || preenchendo;

  // Cronômetro em tempo real durante o processamento — tempo decorrido e
  // estimativa de tempo restante são recalculados a cada tique.
  useEffect(() => {
    if (!processando || inicioProcessamento === null) return;
    const intervalo = setInterval(() => {
      setTempoDecorridoMs(Date.now() - inicioProcessamento);
    }, 250);
    return () => clearInterval(intervalo);
  }, [processando, inicioProcessamento]);

  // Sprint 09.2 — deriva o estado exibido no indicador do Cabecalho a partir
  // do mesmo estado que já controla a tela; nenhuma lógica nova, só
  // reporta pra cima. O intervalo entre "processamento concluído" e
  // "planilha selecionada" (revisando a pré-visualização) continua contando
  // como `pronto` — a Sprint pediu exatamente 4 estados, não um 5º para
  // essa janela intermediária.
  useEffect(() => {
    const estado: EstadoApp = processando
      ? "processando"
      : preenchendo
        ? "preenchendo"
        : resultado && resultadoPreenchimento
          ? "concluido"
          : "pronto";
    aoMudarEstado?.(estado);
  }, [processando, preenchendo, resultado, resultadoPreenchimento, aoMudarEstado]);

  function adicionarNaFila(novosArquivos: File[]) {
    const { validos, invalidos } = filtrarSomentePdf(novosArquivos);
    const resultadoAdicao = adicionarArquivos(fila, validos, (arquivo) =>
      window.api.getPathForFile(arquivo),
    );

    setFila(resultadoAdicao.fila);
    setResultado(null);
    setErroGeral(null);
    setResultadoPreenchimento(null);
    setErroPreenchimento(null);
    setMensagemCancelamento(null);

    if (invalidos.length > 0) {
      setAvisoFila(
        invalidos.length === 1
          ? `"${invalidos[0].name}" não é um PDF e foi ignorado.`
          : `${invalidos.length} arquivos não são PDF e foram ignorados.`,
      );
    } else if (resultadoAdicao.duplicados > 0) {
      setAvisoFila(
        resultadoAdicao.duplicados === 1
          ? "1 PDF já estava na fila e foi ignorado."
          : `${resultadoAdicao.duplicados} PDFs já estavam na fila e foram ignorados.`,
      );
    } else {
      setAvisoFila(null);
    }
  }

  function selecionarArquivos(evento: ChangeEvent<HTMLInputElement>) {
    adicionarNaFila(Array.from(evento.target.files ?? []));
    evento.target.value = ""; // permite selecionar de novo um arquivo já removido da fila
  }

  function removerDaFila(chave: string) {
    setFila((atual) => removerArquivo(atual, chave));
  }

  function limparTudo() {
    setFila(limparFila());
    setAvisoFila(null);
  }

  function selecionarPlanilha(evento: ChangeEvent<HTMLInputElement>) {
    const arquivo = evento.target.files?.[0];
    setPlanilhaCaminho(arquivo ? window.api.getPathForFile(arquivo) : null);
    setResultadoPreenchimento(null);
    setErroPreenchimento(null);
  }

  async function processar() {
    if (processandoRef.current) return;
    if (fila.length === 0 || !backendOnline) return;
    processandoRef.current = true;

    const caminhos = fila.map((item) => item.chave);
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setProcessando(true);
    setErroGeral(null);
    setMensagemCancelamento(null);
    setProgresso({ concluidos: 0, total: caminhos.length, arquivoAtual: "" });
    const inicio = Date.now();
    setInicioProcessamento(inicio);
    setTempoDecorridoMs(0);
    setDuracaoMs(null);

    try {
      const lote = await processarLoteComProgresso(caminhos, setProgresso, controller.signal);
      setResultado(lote);
      setDuracaoMs(Date.now() - inicio);
    } catch (erro) {
      if (erro instanceof ProcessamentoCanceladoError) {
        // Descarta tudo do processamento em andamento — resultados parciais,
        // progresso, estatísticas — como se nunca tivesse sido iniciado.
        // A fila de PDFs selecionados é a única coisa preservada.
        setResultado(null);
        setProgresso(null);
        setDuracaoMs(null);
        setInicioProcessamento(null);
        setTempoDecorridoMs(0);
        setMensagemCancelamento(MENSAGENS.processamentoCancelado);
      } else {
        setErroGeral(
          mensagemAmigavel(erro, "Não foi possível processar o lote. Verifique se o aplicativo está aberto."),
        );
      }
    } finally {
      setProcessando(false);
      processandoRef.current = false;
      abortControllerRef.current = null;
    }
  }

  function solicitarInterrupcao() {
    if (!processando) return;
    setConfirmandoInterrupcao(true);
  }

  function continuarProcessando() {
    setConfirmandoInterrupcao(false);
  }

  function confirmarInterrupcao() {
    setConfirmandoInterrupcao(false);
    abortControllerRef.current?.abort();
  }

  async function preencherPlanilhaClique() {
    if (preenchendo) return;
    if (!resultado || !planilhaCaminho) return;
    if (resultado.sucesso === 0) return;

    setPreenchendo(true);
    setErroPreenchimento(null);
    try {
      const resultadoGravacao = await preencherPlanilha(planilhaCaminho, resultado.processos, duracaoMs);
      setResultadoPreenchimento(resultadoGravacao);
    } catch (erro) {
      setErroPreenchimento(mensagemAmigavel(erro, "Não foi possível preencher a planilha."));
    } finally {
      setPreenchendo(false);
    }
  }

  async function abrirPlanilhaClique() {
    if (!planilhaCaminho) return;
    try {
      await window.api.abrirArquivo(planilhaCaminho);
    } catch (erro) {
      setErroAcao(mensagemAmigavel(erro, "Não foi possível abrir a planilha."));
    }
  }

  async function salvarComoClique() {
    if (!planilhaCaminho) return;
    try {
      await window.api.salvarComo(planilhaCaminho);
    } catch (erro) {
      setErroAcao(mensagemAmigavel(erro, "Não foi possível salvar a cópia."));
    }
  }

  async function abrirRelatorioClique() {
    if (!resultadoPreenchimento) return;
    try {
      await window.api.abrirArquivo(resultadoPreenchimento.caminho_relatorio);
    } catch (erro) {
      setErroAcao(mensagemAmigavel(erro, "Não foi possível abrir o relatório."));
    }
  }

  async function salvarRelatorioClique() {
    if (!resultadoPreenchimento) return;
    setErroAcao(null);
    setMensagemSucessoAcao(null);
    setRelatorioSalvo(null);
    try {
      const salvo = await window.api.salvarRelatorio(
        resultadoPreenchimento.caminho_relatorio,
        resultadoPreenchimento.pasta_resultados,
      );
      if (salvo) {
        setRelatorioSalvo({ caminho: salvo.caminhoArquivo, pasta: salvo.pastaArquivo });
        setMensagemSucessoAcao(MENSAGENS.relatorioSalvoComSucesso);
      }
    } catch (erro) {
      setErroAcao(
        mensagemAmigavel(
          erro,
          "Não foi possível salvar o relatório. Verifique as permissões da pasta escolhida e tente novamente.",
        ),
      );
    }
  }

  async function abrirLocalClique() {
    if (!relatorioSalvo) return;
    try {
      await window.api.abrirArquivo(relatorioSalvo.pasta);
    } catch (erro) {
      setErroAcao(mensagemAmigavel(erro, "Não foi possível abrir a pasta do relatório salvo."));
    }
  }

  async function abrirPastaResultadosClique() {
    if (!resultadoPreenchimento) return;
    try {
      await window.api.abrirArquivo(resultadoPreenchimento.pasta_resultados);
    } catch (erro) {
      setErroAcao(mensagemAmigavel(erro, "Não foi possível abrir a pasta de resultados."));
    }
  }

  function novoProcessamento() {
    setFila(limparFila());
    setAvisoFila(null);
    setResultado(null);
    setErroGeral(null);
    setPlanilhaCaminho(null);
    setResultadoPreenchimento(null);
    setErroPreenchimento(null);
    setErroAcao(null);
    setMensagemSucessoAcao(null);
    setRelatorioSalvo(null);
    setInicioProcessamento(null);
    setDuracaoMs(null);
    setProgresso(null);
    setTempoDecorridoMs(0);
    setMensagemCancelamento(null);
  }

  // --- Tela final: processamento + preenchimento concluídos -----------------

  if (resultado && resultadoPreenchimento) {
    const duplicadas =
      resultadoPreenchimento.itens.filter((item) => item.categoria === "duplicado_no_lote").length +
      resultadoPreenchimento.itens.filter((item) => item.categoria === "duplicado_na_planilha").length;

    return (
      <div className="mx-auto max-w-5xl animate-entrada-conteudo px-6 py-14 md:px-10">
        <h2 className={TIPOGRAFIA.titulo}>Processamento concluído</h2>
        <p className={`mt-2 ${TIPOGRAFIA.texto}`}>{MENSAGENS.processamentoConcluido}</p>

        {/* Sprint 07.2 — o resumo deixou de ser `sticky`: ele acompanha o
            fluxo normal da página e sai da área visível ao rolar, como
            qualquer outro bloco da tela (o painel fixo escondia informação
            da tabela abaixo em lotes grandes). */}
        <div className="mt-8">
          <ResumoResultado
            totalAnalisados={resultado.total}
            diariasInseridas={resultadoPreenchimento.total_gravado}
            duplicadas={duplicadas}
            erros={resultado.erro}
            tempoTotalMs={duracaoMs}
            pastaResultados={resultadoPreenchimento.pasta_resultados}
          />
        </div>

        <div className="mt-8 flex flex-wrap gap-4">
          <Botao variante="primaria" onClick={abrirPlanilhaClique}>
            <FileSpreadsheet aria-hidden="true" className="h-4 w-4" />
            Abrir Planilha
          </Botao>
          <Botao variante="secundaria" onClick={salvarComoClique}>
            <Save aria-hidden="true" className="h-4 w-4" />
            Salvar Como...
          </Botao>
          <Botao variante="secundaria" onClick={abrirRelatorioClique}>
            <FileText aria-hidden="true" className="h-4 w-4" />
            Abrir Relatório
          </Botao>
          <Botao variante="secundaria" onClick={salvarRelatorioClique}>
            <Download aria-hidden="true" className="h-4 w-4" />
            Salvar Relatório
          </Botao>
          <Botao variante="secundaria" onClick={abrirPastaResultadosClique}>
            <FolderOpen aria-hidden="true" className="h-4 w-4" />
            Abrir Pasta dos Resultados
          </Botao>
        </div>

        {mensagemSucessoAcao && (
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <Alerta variante="sucesso">{mensagemSucessoAcao}</Alerta>
            {relatorioSalvo && (
              <Botao variante="secundaria" onClick={abrirLocalClique}>
                <FolderOpen aria-hidden="true" className="h-4 w-4" />
                Abrir Local
              </Botao>
            )}
          </div>
        )}

        {erroAcao && (
          <div className="mt-4">
            <Alerta variante="erro">{erroAcao}</Alerta>
          </div>
        )}

        <div className="mt-10">
          <TabelaResultado lote={resultado} preenchimento={resultadoPreenchimento} />
        </div>

        {/* Sprint 06 — ação principal da tela, destacada em relação a todos
            os outros botões acima: `variante="primaria"` (mesma cor
            institucional, não mais um link discreto) + `tamanho="grande"`
            (único botão "grande" do app — ver `Botao.tsx`), para deixar
            claro que é o próximo passo natural depois de conferir o
            resultado. */}
        <div className="mt-10 flex justify-center">
          <Botao variante="primaria" tamanho="grande" onClick={novoProcessamento}>
            <RotateCcw aria-hidden="true" className="h-5 w-5" />
            Novo Processo
          </Botao>
        </div>
      </div>
    );
  }

  // --- Tela de seleção / progresso / pré-visualização ------------------------

  return (
    <div className="mx-auto max-w-4xl animate-entrada-conteudo px-6 py-14 md:px-10">
      <h2 className={TIPOGRAFIA.titulo}>Selecionar e Processar</h2>
      <p className={`mt-2 ${TIPOGRAFIA.texto}`}>
        Arraste os PDFs de processos de diárias do SEI para esta janela, ou use o botão abaixo.
        Nada é gravado na planilha ainda nesta etapa.
      </p>

      <div className="mt-8">
        <ZonaArrastar onArquivosSoltos={adicionarNaFila} desabilitado={algumaOperacaoEmAndamento}>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <BotaoArquivo
                accept=".pdf"
                multiplo
                desabilitado={algumaOperacaoEmAndamento}
                titulo={algumaOperacaoEmAndamento ? MENSAGENS.processandoAguarde : undefined}
                onChange={selecionarArquivos}
              >
                <Upload aria-hidden="true" className="h-4 w-4" />
                Selecionar PDFs
              </BotaoArquivo>
              <span className="text-xs text-slate-500">ou arraste os arquivos aqui</span>
            </div>

            <FilaArquivos
              itens={fila}
              onRemover={removerDaFila}
              onLimpar={limparTudo}
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

      <div className="mt-6">
        {processando ? (
          <Botao variante="perigo" onClick={solicitarInterrupcao} disabled={confirmandoInterrupcao}>
            {MENSAGENS.interromperProcessamento}
          </Botao>
        ) : (
          <Botao variante="primaria" onClick={processar} disabled={fila.length === 0 || !backendOnline}>
            <Play aria-hidden="true" className="h-4 w-4" />
            Processar
          </Botao>
        )}
      </div>

      {!backendOnline && (
        <div className="mt-4">
          <Alerta variante="aviso">{MENSAGENS.aguardandoAplicativo}</Alerta>
        </div>
      )}

      {processando && progresso && (
        <div className="mt-6">
          <BarraProgresso
            concluidos={progresso.concluidos}
            total={progresso.total}
            arquivoAtual={progresso.arquivoAtual}
            tempoDecorridoMs={tempoDecorridoMs}
          />
        </div>
      )}

      {erroGeral && (
        <div className="mt-6">
          <Alerta variante="erro">{erroGeral}</Alerta>
        </div>
      )}

      {mensagemCancelamento && (
        <div className="mt-6">
          <Alerta variante="info">{mensagemCancelamento}</Alerta>
        </div>
      )}

      {confirmandoInterrupcao && (
        <DialogoConfirmacao
          titulo={MENSAGENS.tituloConfirmarInterrupcao}
          mensagem={MENSAGENS.mensagemConfirmarInterrupcao}
          rotuloConfirmar={MENSAGENS.interromper}
          rotuloCancelar={MENSAGENS.continuarProcessando}
          onConfirmar={confirmarInterrupcao}
          onCancelar={continuarProcessando}
        />
      )}

      {resultado && (
        <div className="mt-10 animate-entrada-conteudo">
          <div className="flex items-center gap-4 text-sm text-slate-400">
            <span>Total: {resultado.total}</span>
            <Badge variante="sucesso">Sucesso: {resultado.sucesso}</Badge>
            <Badge variante="erro">Erro: {resultado.erro}</Badge>
          </div>

          <div className="mt-4">
            <TabelaPreVisualizacao processos={resultado.processos} />
          </div>

          {resultado.sucesso > 0 && (
            <div className={`mt-8 ${SUPERFICIE_BASE} p-7`}>
              <h3 className={TIPOGRAFIA.subtitulo}>Preencher planilha</h3>
              <p className={`mt-1.5 ${TIPOGRAFIA.textoAuxiliar}`}>
                Selecione a cópia de teste da planilha oficial. Apenas as colunas já homologadas
                serão preenchidas, a partir da primeira linha livre. Diárias cujo número SEI já
                exista na planilha (ou se repita neste mesmo lote) são ignoradas como duplicadas.
              </p>

              <div className="mt-4 flex items-center gap-3">
                <BotaoArquivo
                  accept=".xlsx"
                  desabilitado={algumaOperacaoEmAndamento}
                  onChange={selecionarPlanilha}
                >
                  <FileSpreadsheet aria-hidden="true" className="h-4 w-4" />
                  Selecionar planilha (.xlsx)
                </BotaoArquivo>
                <span className="truncate text-sm text-slate-500">
                  {planilhaCaminho ?? MENSAGENS.nenhumaPlanilhaSelecionada}
                </span>
              </div>

              <div className="mt-5">
                <Botao
                  variante="primaria"
                  onClick={preencherPlanilhaClique}
                  disabled={!planilhaCaminho}
                  carregando={preenchendo}
                >
                  {!preenchendo && <ListChecks aria-hidden="true" className="h-4 w-4" />}
                  {preenchendo ? "Preenchendo..." : "Preencher planilha"}
                </Botao>
              </div>

              {erroPreenchimento && (
                <div className="mt-4">
                  <Alerta variante="erro">{erroPreenchimento}</Alerta>
                </div>
              )}

              {duracaoMs !== null && (
                <p className="mt-3 text-xs text-slate-500">
                  Processamento concluído em {formatarDuracao(duracaoMs)}.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
