/** Mensagens amigáveis para o usuário final — trocam jargão técnico
 * (exceptions do JS, erros de rede, códigos de erro do sistema de
 * arquivos) por frases compreensíveis. Mensagens que já vêm curadas do
 * backend (ex.: "Não foi possível gravar a planilha — feche o arquivo no
 * Excel e tente novamente", devolvida pela API de preenchimento) já são
 * amigáveis por natureza e passam direto, sem reescrita. */

export const MENSAGENS = {
  nenhumPdfSelecionado: "Nenhum PDF selecionado.",
  processandoAguarde: "Processando... aguarde a conclusão antes de iniciar outra ação.",
  processamentoConcluido: "Processamento concluído com sucesso.",
  aguardandoAplicativo: "Aguardando o aplicativo terminar de iniciar...",
  arquivoInvalido: "Arquivo PDF inválido.",
  falhaProcessarDocumento: "Não foi possível processar este documento.",
  interromperProcessamento: "⏹ Interromper Processamento",
  tituloConfirmarInterrupcao: "Interromper processamento?",
  mensagemConfirmarInterrupcao:
    "Todo o processamento realizado até este momento será descartado.\n\n" +
    "Nenhum dado será gravado na planilha.\n\n" +
    "Nenhum relatório será gerado.\n\n" +
    "Os PDFs permanecerão selecionados para que você possa iniciar novamente quando desejar.",
  continuarProcessando: "Continuar Processando",
  interromper: "Interromper",
  processamentoCancelado: "Processamento cancelado pelo usuário. Nenhuma informação foi salva.",
  relatorioSalvoComSucesso: "✔ Relatório salvo com sucesso.",
  // Sprint (Loading/Bloqueio de Ações/Navegação Segura, itens 8-9) —
  // confirmação ao fechar o aplicativo (X da janela, Alt+F4, `app.quit()`
  // — interceptados no processo main, `electron/main.ts`). Mensagem mais
  // clara quando há operação crítica em andamento (mesmo critério de
  // "processando", `EstadoApp`), avisando que sair agora a interrompe.
  tituloConfirmarFechamento: "Sair do aplicativo?",
  mensagemConfirmarFechamento: "Tem certeza que deseja sair do aplicativo?",
  tituloConfirmarFechamentoComOperacao: "Operação em andamento",
  mensagemConfirmarFechamentoComOperacao:
    "Existe uma operação em andamento. Sair agora irá interrompê-la. Deseja realmente sair?",
  sair: "Sair",
  // Cadastro de Servidor/Membro pela Central de Conferência — mensagens
  // fixas do modal (`ModalCadastrarServidor.tsx`). As mensagens dos
  // estados `duplicado`/`salvo_sync_pendente` vêm curadas do backend
  // (`resposta.mensagem`, já amigáveis) e passam direto, sem constante
  // própria aqui — só o estado `concluido` (que o backend não descreve em
  // texto) e os rótulos de botão precisam de uma mensagem fixa no
  // frontend.
  cadastrarServidorTitulo: "Cadastrar servidor/membro",
  cadastroServidorSalvo: "Cadastro salvo na Planilha Oficial.",
  // Nunca afirmar que o Drive sincronizou de fato — não existe nenhuma
  // integração com o Google Drive neste projeto; isto é só um lembrete
  // textual, a confirmação é sempre manual do usuário.
  cadastroServidorAvisoDrive:
    "Antes de continuar, verifique se o Google Drive concluiu a sincronização da versão atualizada.",
  cadastroServidorContinuar: "Já sincronizei / Continuar",
  cadastroServidorTentarSincronizarNovamente: "Tentar sincronizar novamente",
  // Organização Automática de PDFs — guarda de pasta (SelecionarProcessar/
  // FinalizarDiarias): PDF selecionado fora da pasta operacional
  // configurada para aquela função nunca é adicionado à fila.
  pdfForaDaPastaConfigurada: "Selecione os PDFs na pasta configurada para esta função.",
  avisoPastasIncompletas: "Antes de utilizar esta função, configure as pastas necessárias.",
} as const;

interface PadraoMensagem {
  teste: RegExp;
  mensagem: string;
}

// Assinaturas técnicas conhecidas (erros de rede do fetch, códigos de erro
// do sistema de arquivos do Node/Electron, respostas HTTP sem detalhe de
// negócio) — só estas são reescritas; qualquer outra mensagem de erro é
// exibida como veio, por já ser presumivelmente uma mensagem de negócio
// curada pelo backend.
const PADROES_TECNICOS: PadraoMensagem[] = [
  {
    teste: /failed to fetch|networkerror|econnrefused|fetch failed/i,
    mensagem: "Não foi possível conectar ao aplicativo. Verifique se ele está aberto e tente novamente.",
  },
  {
    teste: /ebusy|eperm|permission denied/i,
    mensagem:
      "Não foi possível concluir a operação porque o arquivo está aberto em outro programa (ex.: Excel). Feche-o e tente novamente.",
  },
  {
    teste: /enoent|no such file/i,
    mensagem: "O arquivo não foi encontrado. Ele pode ter sido movido ou excluído.",
  },
  {
    teste: /backend respondeu 5\d\d/i,
    mensagem: "Ocorreu um erro inesperado. Tente novamente em instantes.",
  },
  {
    teste: /backend respondeu \d+/i,
    mensagem: "Não foi possível concluir a operação. Tente novamente.",
  },
];

export function mensagemAmigavel(
  erro: unknown,
  reserva: string = "Não foi possível concluir a operação. Tente novamente.",
): string {
  const bruta = erro instanceof Error ? erro.message : erro ? String(erro) : "";
  const padrao = PADROES_TECNICOS.find((p) => p.teste.test(bruta));
  if (padrao) return padrao.mensagem;
  return bruta || reserva;
}
