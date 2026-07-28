import { useState } from "react";
import ChecklistConferencia from "../components/conferencia/ChecklistConferencia";
import FormularioConferencia from "../components/conferencia/FormularioConferencia";
import FormularioHistorico from "../components/conferencia/FormularioHistorico";
import Alerta from "../components/ui/Alerta";
import { mensagemAmigavel } from "../lib/mensagens";
import { conferir, gerarHistorico } from "../services/api";
import { TIPOGRAFIA } from "../theme/tipografia";
import type { ResultadoConferencia } from "../types/conferencia";

interface Props {
  backendOnline: boolean;
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
// Histórico), que só existe na árvore quando `resultado.veredito ===
// "APTO_PARA_PROCESSAMENTO"` — não é um bloco escondido por CSS, é
// condicionalmente ausente do JSX.
export default function Conferencia({ backendOnline }: Props) {
  const [cpf, setCpf] = useState("");
  const [periodoInicial, setPeriodoInicial] = useState("");
  const [periodoFinal, setPeriodoFinal] = useState("");

  const [carregandoConferencia, setCarregandoConferencia] = useState(false);
  const [resultado, setResultado] = useState<ResultadoConferencia | null>(null);
  const [erroConferencia, setErroConferencia] = useState<string | null>(null);

  const [sei, setSei] = useState("");
  const [origem, setOrigem] = useState("");
  const [destino, setDestino] = useState("");
  const [carregandoHistorico, setCarregandoHistorico] = useState(false);
  const [historico, setHistorico] = useState<string | null>(null);
  const [erroHistorico, setErroHistorico] = useState<string | null>(null);

  function limparDiagnostico() {
    setResultado(null);
    setErroConferencia(null);
    setHistorico(null);
    setErroHistorico(null);
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

  async function realizarConferencia() {
    if (carregandoConferencia || !periodoInicial || !periodoFinal) return;

    setCarregandoConferencia(true);
    setErroConferencia(null);
    setHistorico(null);
    setErroHistorico(null);

    try {
      const resposta = await conferir(cpf, periodoInicial, periodoFinal);
      setResultado(resposta);
    } catch (erro) {
      setResultado(null);
      setErroConferencia(mensagemAmigavel(erro, "Não foi possível concluir a conferência."));
    } finally {
      setCarregandoConferencia(false);
    }
  }

  async function gerarHistoricoClique() {
    if (carregandoHistorico || !resultado) return;

    setCarregandoHistorico(true);
    setErroHistorico(null);

    try {
      const texto = await gerarHistorico(cpf, periodoInicial, periodoFinal, sei, origem, destino);
      setHistorico(texto);
    } catch (erro) {
      setErroHistorico(mensagemAmigavel(erro, "Não foi possível gerar o histórico."));
    } finally {
      setCarregandoHistorico(false);
    }
  }

  const banner = resultado ? VEREDITO_BANNER[resultado.veredito] : null;

  return (
    <div className="mx-auto max-w-2xl animate-entrada-conteudo px-6 py-14 md:px-10">
      <h2 className={TIPOGRAFIA.titulo}>Central de Conferência</h2>
      <p className={`mt-2 ${TIPOGRAFIA.texto}`}>
        Informe os dados da diária. Nada é gravado — a Central só consulta e informa.
      </p>

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

          <ChecklistConferencia resultado={resultado} />

          {resultado.veredito === "APTO_PARA_PROCESSAMENTO" && (
            <FormularioHistorico
              sei={sei}
              origem={origem}
              destino={destino}
              carregando={carregandoHistorico}
              historico={historico}
              erro={erroHistorico}
              onMudarSei={setSei}
              onMudarOrigem={setOrigem}
              onMudarDestino={setDestino}
              onGerar={gerarHistoricoClique}
            />
          )}
        </div>
      )}
    </div>
  );
}
