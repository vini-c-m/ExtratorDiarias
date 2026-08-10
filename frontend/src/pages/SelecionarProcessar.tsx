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
import ModalAlterarPlanilhaOficial from "../components/configuracao/ModalAlterarPlanilhaOficial";
import ResumoConfiguracao from "../components/configuracao/ResumoConfiguracao";
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
  buscarConfiguracao,
  preencherPlanilha,
  processarLoteComProgresso,
  ProcessamentoCanceladoError,
  type ProgressoProcessamento,
} from "../services/api";
import type { EstadoApp } from "../components/layout/Cabecalho";
import { SUPERFICIE_BASE } from "../theme/estilos";
import { TIPOGRAFIA } from "../theme/tipografia";
import type { EstadoConfiguracao } from "../types/configuracao";
import type { LoteProcessamento, ResultadoPreenchimento } from "../types/processamento";

// Sprint 15 — Configuração Inicial da Planilha Oficial (§7.1): "Preencher
// Planilha" só fica disponível com uma planilha oficial configurada,
// acessível agora e sem divergência estrutural pendente de revalidação —
// mesma checagem que o backend já faz de forma autoritativa antes de
// gravar; aqui é só para não deixar o usuário clicar num caminho que o
// backend já sabe que vai recusar.
function podePreencherPlanilha(estado: EstadoConfiguracao | null): boolean {
  if (!estado || !estado.configurado || !estado.planilha_acessivel) return false;
  return !estado.requer_revalidacao;
}

// Sprint 15 — normaliza `EstadoConfiguracao` para as props de
// `ResumoConfiguracao`: quando inacessível, o contrato do backend (§4) não
// devolve nome/local/data, então nem tenta.
function propsResumoConfiguracao(estado: EstadoConfiguracao) {
  if (estado.configurado && estado.planilha_acessivel) {
    return {
      caminhoPlanilhaOficial: estado.caminho_planilha_oficial,
      configuradoEm: estado.configurado_em,
      planilhaAcessivel: true as const,
      requerRevalidacao: estado.requer_revalidacao,
    };
  }
  return { planilhaAcessivel: false as const };
}

interface Props {
  backendOnline: boolean;
  /** Sprint 09.2 — reporta para o `Cabecalho` (via `App`) em que etapa do
   * fluxo esta tela está, para o indicador de status deixar de falar de
   * "backend" e passar a falar a língua do usuário (pronto/processando/
   * preenchendo/concluído). Opcional só para não obrigar quem testa este
   * componente isoladamente a passar um callback que não usa. */
  aoMudarEstado?: (estado: EstadoApp) => void;
  /** Sprint (Loading/Bloqueio de Ações/Navegação Segura, itens 5-7) —
   * reporta pra cima (a cada mudança de `processando`, e `null` ao
   * desmontar) uma função "tente sair com segurança": `App.tsx` chama essa
   * função quando o usuário aciona Voltar/Configurações, em vez de navegar
   * direto. Sem processamento ativo, ela só chama `aoConcluir` na hora.
   * Com processamento ativo, mostra a MESMA confirmação/interrupção já
   * usada pelo botão "Interromper Processamento" (nunca uma segunda
   * implementação) e só chama `aoConcluir` depois que a interrupção
   * realmente terminar — nunca antes (item 6: "não navegar antes da
   * interrupção terminar"). Se o usuário cancelar, `aoConcluir` nunca é
   * chamado — nem depois, quando o processamento terminar sozinho. */
  aoMudarSolicitarSaidaSegura?: (funcao: ((aoConcluir: () => void) => void) | null) => void;
}

export default function SelecionarProcessar({ backendOnline, aoMudarEstado, aoMudarSolicitarSaidaSegura }: Props) {
  const [fila, setFila] = useState<ItemFila[]>([]);
  const [avisoFila, setAvisoFila] = useState<string | null>(null);

  // RN-14 — Modo Complemento de Diárias: fluxo separado, mesmo parser/
  // arquitetura já homologados, só ajustando as regras específicas
  // (coluna AVISO, coluna O, SEI não bloqueante). Escolha explícita do
  // usuário, feita antes de processar.
  const [modoComplemento, setModoComplemento] = useState(false);

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
  // Sprint (Loading/Bloqueio de Ações/Navegação Segura, itens 5-7) —
  // guarda a ação pendente ("ir para o Hub"/"abrir Configurações") quando
  // `solicitarSaidaSegura` precisa mostrar a confirmação antes de concluir.
  // `null` = nenhuma saída pendente (inclusive o caso comum de
  // "Interromper Processamento" clicado direto, sem nenhuma navegação
  // associada).
  const aoConcluirSaidaRef = useRef<(() => void) | null>(null);

  // Sprint 15 — substitui a antiga seleção manual de planilha por
  // execução: a planilha oficial é única e já configurada (§7.1 do doc
  // arquitetural), então esta tela só precisa saber se ela está acessível
  // e sem revalidação pendente antes de liberar "Preencher Planilha".
  const [configuracao, setConfiguracao] = useState<EstadoConfiguracao | null>(null);
  const [modalAlterarAberto, setModalAlterarAberto] = useState(false);
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

  // Sprint 15 — assim que há algo para preencher, verifica a planilha
  // oficial configurada (§7.1) — no momento em que a ação é de fato
  // relevante, não na abertura da tela (nada aqui depende de configuração
  // enquanto o usuário só está selecionando/processando PDFs, §7).
  useEffect(() => {
    if (!resultado || resultado.sucesso === 0) return;
    let cancelado = false;
    buscarConfiguracao()
      .then((estado) => {
        if (!cancelado) setConfiguracao(estado);
      })
      .catch(() => {
        if (!cancelado) setConfiguracao(null);
      });
    return () => {
      cancelado = true;
    };
  }, [resultado]);

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
      const lote = await processarLoteComProgresso(
        caminhos,
        setProgresso,
        controller.signal,
        modoComplemento ? "COMPLEMENTO" : "PADRAO",
      );
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
    // Descarta qualquer saída pendente (Voltar/Configurações) — cancelar a
    // interrupção não pode navegar mais tarde, quando o processamento
    // terminar sozinho (item 6: "permanece na tela; processamento continua").
    aoConcluirSaidaRef.current = null;
  }

  function confirmarInterrupcao() {
    setConfirmandoInterrupcao(false);
    abortControllerRef.current?.abort();
  }

  // Sprint (Loading/Bloqueio de Ações/Navegação Segura, itens 5-7) — ponto
  // único que `App.tsx` chama para Voltar/Configurações. Sem processamento
  // ativo, conclui na hora (comportamento normal, item 6). Com
  // processamento ativo, reaproveita a MESMA confirmação/estado de
  // `solicitarInterrupcao` acima — só registra o que fazer depois.
  function solicitarSaidaSegura(aoConcluir: () => void) {
    if (!processando) {
      aoConcluir();
      return;
    }
    aoConcluirSaidaRef.current = aoConcluir;
    setConfirmandoInterrupcao(true);
  }

  // Reporta a função pra cima a cada mudança de `processando` (fecha sobre
  // o valor certo em cada versão) — e `null` ao desmontar, para `App.tsx`
  // nunca guardar uma referência de um componente que já saiu da árvore.
  useEffect(() => {
    aoMudarSolicitarSaidaSegura?.(solicitarSaidaSegura);
    return () => aoMudarSolicitarSaidaSegura?.(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processando, aoMudarSolicitarSaidaSegura]);

  // A interrupção em si (`confirmarInterrupcao`) só aciona o abort — a
  // conclusão da saída pendente (navegar/abrir Configurações) só dispara
  // DEPOIS que `processando` realmente vira `false` (o mesmo `finally` de
  // `processar()` abaixo), nunca antes (item 6: "não navegar antes da
  // interrupção terminar").
  useEffect(() => {
    if (processando) return;
    if (!aoConcluirSaidaRef.current) return;
    const concluir = aoConcluirSaidaRef.current;
    aoConcluirSaidaRef.current = null;
    concluir();
  }, [processando]);

  async function preencherPlanilhaClique() {
    if (preenchendo) return;
    if (!resultado || !podePreencherPlanilha(configuracao)) return;
    if (resultado.sucesso === 0) return;

    setPreenchendo(true);
    setErroPreenchimento(null);
    try {
      const resultadoGravacao = await preencherPlanilha(
        resultado.processos,
        duracaoMs,
        modoComplemento ? "COMPLEMENTO" : "PADRAO",
      );
      setResultadoPreenchimento(resultadoGravacao);
    } catch (erro) {
      setErroPreenchimento(mensagemAmigavel(erro, "Não foi possível preencher a planilha."));
    } finally {
      setPreenchendo(false);
    }
  }

  // Sprint 15 — "Abrir Planilha"/"Salvar Como..." (tela final, já
  // preenchida) usam o mesmo caminho oficial já configurado — não existe
  // mais uma seleção manual própria desta tela para servir de origem.
  function caminhoPlanilhaConfigurada(): string | null {
    if (!configuracao || !configuracao.configurado || !configuracao.planilha_acessivel) return null;
    return configuracao.caminho_planilha_oficial;
  }

  async function abrirPlanilhaClique() {
    const caminho = caminhoPlanilhaConfigurada();
    if (!caminho) return;
    try {
      await window.api.abrirArquivo(caminho);
    } catch (erro) {
      setErroAcao(mensagemAmigavel(erro, "Não foi possível abrir a planilha."));
    }
  }

  async function salvarComoClique() {
    const caminho = caminhoPlanilhaConfigurada();
    if (!caminho) return;
    try {
      await window.api.salvarComo(caminho);
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
    setConfiguracao(null);
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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className={TIPOGRAFIA.titulo}>Selecionar e Processar</h2>
          <p className={`mt-2 ${TIPOGRAFIA.texto}`}>
            Arraste os PDFs de processos de diárias do SEI para esta janela, ou use o botão abaixo.
            Nada é gravado na planilha ainda nesta etapa.
          </p>
        </div>
        {/* RN-14 — fluxo separado, não substitui o Processamento normal:
            mesmo padrão aditivo do "Modo Executivo" da Central Analítica e
            do "Modo Complemento de Diárias" da Central de Conferência. */}
        <Botao
          variante={modoComplemento ? "primaria" : "secundaria"}
          disabled={algumaOperacaoEmAndamento || resultado !== null}
          onClick={() => setModoComplemento((atual) => !atual)}
        >
          {modoComplemento ? "Modo Complemento de Diárias (ativo)" : "Modo Complemento de Diárias"}
        </Botao>
      </div>

      {modoComplemento && (
        <div className="mt-4">
          <Alerta variante="aviso">
            Modo Complemento de Diárias: a coluna AVISO recebe "COMPLEMENTO DE DIÁRIAS", a
            quantidade de diária parcial complementar é resolvida a partir dos documentos do
            processo (padrão institucional: 0, só sobe com evidência explícita), e um SEI já
            existente não impede mais a gravação da nova linha.
          </Alerta>
        </div>
      )}

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
                Apenas as colunas já homologadas serão preenchidas na planilha oficial configurada,
                a partir da primeira linha livre. Diárias cujo número SEI já exista na planilha (ou
                se repita neste mesmo lote) são ignoradas como duplicadas.
              </p>

              {configuracao && (
                <div className="mt-4">
                  <ResumoConfiguracao
                    {...propsResumoConfiguracao(configuracao)}
                    aoAlterarPlanilha={() => setModalAlterarAberto(true)}
                  />
                </div>
              )}

              <div className="mt-5">
                <Botao
                  variante="primaria"
                  onClick={preencherPlanilhaClique}
                  disabled={!podePreencherPlanilha(configuracao)}
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

      {modalAlterarAberto && (
        <ModalAlterarPlanilhaOficial
          onFechar={() => setModalAlterarAberto(false)}
          aoConfigurar={(novaConfiguracao) => {
            setConfiguracao(novaConfiguracao);
            setModalAlterarAberto(false);
          }}
        />
      )}
    </div>
  );
}
