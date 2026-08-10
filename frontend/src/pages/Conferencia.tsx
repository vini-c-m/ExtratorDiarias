import { useState } from "react";
import ChecklistConferencia from "../components/conferencia/ChecklistConferencia";
import FormularioConferencia from "../components/conferencia/FormularioConferencia";
import FormularioHistorico from "../components/conferencia/FormularioHistorico";
import ModalCadastrarServidor from "../components/conferencia/ModalCadastrarServidor";
import PainelContinuidadeProcessual from "../components/conferencia/PainelContinuidadeProcessual";
import Alerta from "../components/ui/Alerta";
import Botao from "../components/ui/Botao";
import { SUPERFICIE_BASE } from "../theme/estilos";
import { mensagemAmigavel } from "../lib/mensagens";
import {
  buscarCandidatosComplemento,
  conferir,
  gerarHistorico,
  gerarHistoricoComplemento,
} from "../services/api";
import { TIPOGRAFIA } from "../theme/tipografia";
import type { CandidatoDiariaOriginal, ResultadoConferencia } from "../types/conferencia";
import type { EstadoConfiguracao } from "../types/configuracao";

interface Props {
  backendOnline: boolean;
  /** Cadastro de Servidor/Membro (item 12 do pedido aprovado): só libera a
   * ação de cadastro quando a Planilha Oficial está configurada, acessível
   * e sem revalidação pendente — mesmo critério já usado por
   * `SelecionarProcessar.podePreencherPlanilha`, para nunca deixar o
   * usuário abrir um cadastro que o backend já sabe que vai recusar. */
  configuracaoAtiva?: EstadoConfiguracao | null;
}

function podeCadastrarServidor(estado: EstadoConfiguracao | null | undefined): boolean {
  if (!estado || !estado.configurado || !estado.planilha_acessivel) return false;
  return !estado.requer_revalidacao;
}

const VEREDITO_BANNER: Record<
  ResultadoConferencia["veredito"],
  { icone: string; titulo: string; classes: string; tituloClasse: string; subtituloClasse: string }
> = {
  APTO_PARA_PROCESSAMENTO: {
    icone: "🟢",
    titulo: "APTO PARA PROCESSAMENTO",
    classes: "border-emerald-500/30 bg-emerald-500/10 shadow-glow-green",
    tituloClasse: "text-emerald-400",
    subtituloClasse: "text-emerald-300/80",
  },
  REVISAR: {
    icone: "🟠",
    titulo: "REVISAR",
    classes: "border-amber-500/30 bg-amber-500/10 shadow-glow-amber",
    tituloClasse: "text-amber-400",
    subtituloClasse: "text-amber-300/80",
  },
};

// Sprint 13 — implementação do fluxo aprovado na Sprint 12: Etapa 1
// (formulário mínimo → diagnóstico com veredito único) e Etapa 2 (Gerar
// Histórico). A Etapa 2 é condicionalmente ausente do JSX (não um bloco
// escondido por CSS) quando o veredito é REVISAR — exceto no caso de
// pendência exclusiva da janela do Documento Hábil (bloco de refinamento
// de 2026-08-06): aí a Central oferece "Voltar" ou "Prosseguir mesmo
// assim", puramente de UX — nenhuma regra de negócio muda e o backend de
// geração do histórico já não depende do veredito.
export default function Conferencia({ backendOnline, configuracaoAtiva }: Props) {
  const [cpf, setCpf] = useState("");
  const [modalCadastroAberto, setModalCadastroAberto] = useState(false);
  const [periodoInicial, setPeriodoInicial] = useState("");
  const [periodoFinal, setPeriodoFinal] = useState("");

  // RN-14 — Modo Complemento de Diárias: escolha explícita do usuário
  // (botão), mesmo padrão aditivo do "Modo Executivo" da Central Analítica.
  const [modoComplemento, setModoComplemento] = useState(false);

  const [carregandoConferencia, setCarregandoConferencia] = useState(false);
  const [resultado, setResultado] = useState<ResultadoConferencia | null>(null);
  const [erroConferencia, setErroConferencia] = useState<string | null>(null);
  const [prosseguirMesmoAssim, setProsseguirMesmoAssim] = useState(false);

  const [sei, setSei] = useState("");
  const [destino, setDestino] = useState("");
  const [carregandoHistorico, setCarregandoHistorico] = useState(false);
  const [historico, setHistorico] = useState<string | null>(null);
  const [erroHistorico, setErroHistorico] = useState<string | null>(null);

  const [candidatos, setCandidatos] = useState<CandidatoDiariaOriginal[]>([]);
  const [carregandoCandidatos, setCarregandoCandidatos] = useState(false);

  function limparDiagnostico() {
    setResultado(null);
    setErroConferencia(null);
    setHistorico(null);
    setErroHistorico(null);
    setProsseguirMesmoAssim(false);
    setCandidatos([]);
  }

  function alternarModoComplemento() {
    setModoComplemento((atual) => !atual);
    limparDiagnostico();
  }

  function mudarCpf(valor: string) {
    setCpf(valor);
    limparDiagnostico();
  }
  function mudarPeriodoInicial(valor: string) {
    setPeriodoInicial(valor);
    limparDiagnostico();
  }
  function mudarPeriodoFinal(valor: string) {
    setPeriodoFinal(valor);
    limparDiagnostico();
  }

  // Extraído de `realizarConferencia` (item 6 do pedido "Ajuste Funcional +
  // UX" — CPF agora editável no modal de cadastro): a reconsulta pós-
  // cadastro precisa usar o CPF FINAL salvo (que pode ser diferente do CPF
  // originalmente pesquisado), nunca o `cpf` do estado. `realizarConferencia`
  // continua sem parâmetro nenhum — é passada direto como `onClick`/
  // `onSubmit` para botões (`Botao`/`<button>` repassa o `MouseEvent` real
  // como primeiro argumento), então NUNCA pode aceitar um parâmetro
  // posicional que um clique acidentalmente preencheria com o evento.
  async function consultarCpf(cpfAlvo: string) {
    if (carregandoConferencia || !periodoInicial || !periodoFinal) return;

    setCarregandoConferencia(true);
    setErroConferencia(null);
    setHistorico(null);
    setErroHistorico(null);
    setProsseguirMesmoAssim(false);
    setCandidatos([]);

    try {
      const resposta = await conferir(
        cpfAlvo,
        periodoInicial,
        periodoFinal,
        modoComplemento ? "COMPLEMENTO" : "PADRAO",
      );
      setResultado(resposta);

      if (modoComplemento) {
        setCarregandoCandidatos(true);
        try {
          const encontrados = await buscarCandidatosComplemento(cpfAlvo, periodoInicial, periodoFinal);
          setCandidatos(encontrados);
        } catch {
          // Continuidade Processual é só informativa — uma falha aqui não
          // impede o restante da conferência de ser exibido.
          setCandidatos([]);
        } finally {
          setCarregandoCandidatos(false);
        }
      }
    } catch (erro) {
      setResultado(null);
      setErroConferencia(mensagemAmigavel(erro, "Não foi possível concluir a conferência."));
    } finally {
      setCarregandoConferencia(false);
    }
  }

  function realizarConferencia() {
    consultarCpf(cpf);
  }

  async function gerarHistoricoClique() {
    if (carregandoHistorico || !resultado) return;

    setCarregandoHistorico(true);
    setErroHistorico(null);

    try {
      const texto = modoComplemento
        ? await gerarHistoricoComplemento(cpf, periodoInicial, periodoFinal, sei, destino)
        : await gerarHistorico(cpf, periodoInicial, periodoFinal, sei, destino);
      setHistorico(texto);
    } catch (erro) {
      setErroHistorico(mensagemAmigavel(erro, "Não foi possível gerar o histórico."));
    } finally {
      setCarregandoHistorico(false);
    }
  }

  const banner = resultado ? VEREDITO_BANNER[resultado.veredito] : null;

  // A única pendência que não impede o servidor de continuar, conscientemente,
  // é a janela do Documento Hábil ainda não ter sido liberada (cadastro
  // localizado e sem duplicidade) — cadastro ausente ou duplicidade
  // encontrada continuam bloqueando a Etapa 2, sem opção de prosseguir.
  const cadastroOk = !!resultado?.checklist.find((item) => item.item === "cadastro_localizado")?.ok;
  const duplicidadeOk = !!resultado?.checklist.find((item) => item.item === "duplicidade")?.ok;
  const janelaOk = !!resultado?.checklist.find((item) => item.item === "janela_processamento")?.ok;
  const apenasJanelaPendente =
    resultado?.veredito === "REVISAR" && cadastroOk && duplicidadeOk && !janelaOk;
  const mostrarEtapaHistorico =
    resultado?.veredito === "APTO_PARA_PROCESSAMENTO" || (apenasJanelaPendente && prosseguirMesmoAssim);

  // Cadastro de Servidor/Membro — CPF ainda não localizado + Planilha
  // Oficial disponível para escrita agora.
  const podeAbrirCadastro = !!resultado && !cadastroOk && podeCadastrarServidor(configuracaoAtiva);

  // RN-11: nunca aceitar o resultado do cadastro como dado pronto para a
  // tela — reconsulta pela MESMA chamada já usada na Etapa 1, para o
  // veredito/checklist exibido continuar vindo sempre do backend.
  //
  // `cpfFinal` (item 6 do pedido "Ajuste Funcional + UX"): como o CPF
  // passou a ser editável no modal, o valor efetivamente salvo pode ser
  // diferente do `cpf` originalmente pesquisado (ex.: usuário corrigiu um
  // CPF digitado errado antes de salvar) — atualiza o campo de busca da
  // tela E reconsulta por ESTE CPF, nunca pelo antigo.
  function aoCpfCadastradoResolvido(cpfFinal: string) {
    setModalCadastroAberto(false);
    setCpf(cpfFinal);
    consultarCpf(cpfFinal);
  }

  return (
    <div className="mx-auto max-w-2xl animate-entrada-conteudo px-6 py-14 md:px-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className={TIPOGRAFIA.titulo}>Central de Conferência</h2>
          <p className={`mt-2 ${TIPOGRAFIA.texto}`}>
            Informe os dados da diária. Nada é gravado — a Central só consulta e informa.
          </p>
        </div>
        {/* RN-14 — mesmo padrão aditivo do "Modo Executivo" da Central
            Analítica: um botão que troca o modo do fluxo já existente,
            nunca uma tela separada. */}
        <Botao
          variante={modoComplemento ? "primaria" : "secundaria"}
          disabled={carregandoConferencia}
          onClick={alternarModoComplemento}
        >
          {modoComplemento ? "Modo Complemento de Diárias (ativo)" : "Modo Complemento de Diárias"}
        </Botao>
      </div>

      {modoComplemento && (
        <div className="mt-4">
          <Alerta variante="aviso">
            Modo Complemento de Diárias: duplicidade deixa de bloquear o resultado, mas continua
            sendo exibida — confirme manualmente qual é a diária original antes de gerar o histórico.
          </Alerta>
        </div>
      )}

      <div className="mt-8">
        <FormularioConferencia
          cpf={cpf}
          periodoInicial={periodoInicial}
          periodoFinal={periodoFinal}
          desabilitado={carregandoConferencia || !backendOnline}
          carregando={carregandoConferencia}
          onMudarCpf={mudarCpf}
          onMudarPeriodoInicial={mudarPeriodoInicial}
          onMudarPeriodoFinal={mudarPeriodoFinal}
          onSubmit={realizarConferencia}
        />
      </div>

      {!backendOnline && (
        <div className="mt-4">
          <Alerta variante="aviso">Aguardando o aplicativo terminar de iniciar...</Alerta>
        </div>
      )}

      {erroConferencia && (
        <div className="mt-6">
          <Alerta variante="erro">{erroConferencia}</Alerta>
        </div>
      )}

      {resultado && banner && (
        <div className="mt-8 animate-entrada-conteudo space-y-4">
          <div className={`flex items-center gap-4 rounded-card border p-5 ${banner.classes}`}>
            <span aria-hidden="true" className="text-3xl leading-none">
              {banner.icone}
            </span>
            <div>
              <h3 className={`text-base font-extrabold tracking-wide ${banner.tituloClasse}`}>
                {banner.titulo}
              </h3>
              <p className={`mt-0.5 text-xs ${banner.subtituloClasse}`}>{resultado.providencia}</p>
            </div>
          </div>

          <ChecklistConferencia
            resultado={resultado}
            aoClicarCadastrar={podeAbrirCadastro ? () => setModalCadastroAberto(true) : undefined}
          />

          {apenasJanelaPendente && !prosseguirMesmoAssim && (
            <div className={`${SUPERFICIE_BASE} p-6`}>
              <h3 className={TIPOGRAFIA.subtitulo}>O Documento Hábil ainda não foi liberado</h3>
              <p className={`mt-1.5 ${TIPOGRAFIA.textoAuxiliar}`}>
                Você pode voltar e aguardar a data prevista, ou prosseguir mesmo assim, conscientemente,
                para a geração do Histórico do e-Fisco.
              </p>
              <div className="mt-4 flex gap-3">
                <Botao variante="secundaria" onClick={limparDiagnostico}>
                  Voltar
                </Botao>
                <Botao variante="primaria" onClick={() => setProsseguirMesmoAssim(true)}>
                  Prosseguir mesmo assim
                </Botao>
              </div>
            </div>
          )}

          {modoComplemento && (
            <PainelContinuidadeProcessual candidatos={candidatos} carregando={carregandoCandidatos} />
          )}

          {mostrarEtapaHistorico && (
            <FormularioHistorico
              sei={sei}
              destino={destino}
              carregando={carregandoHistorico}
              historico={historico}
              erro={erroHistorico}
              onMudarSei={setSei}
              onMudarDestino={setDestino}
              onGerar={gerarHistoricoClique}
              titulo={modoComplemento ? "Gerar Histórico de Complemento" : undefined}
              tituloResultado={modoComplemento ? "Histórico de Complemento para o e-Fisco" : undefined}
            />
          )}
        </div>
      )}

      {modalCadastroAberto && (
        <ModalCadastrarServidor
          cpf={cpf}
          onFechar={() => setModalCadastroAberto(false)}
          onCpfResolvido={aoCpfCadastradoResolvido}
        />
      )}
    </div>
  );
}
