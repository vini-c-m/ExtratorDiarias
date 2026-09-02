import { useState } from "react";
import { useFontesRelatorioTransparencia } from "../../hooks/useFontesRelatorioTransparencia";
import { SUPERFICIE_BASE } from "../../theme/estilos";
import { TIPOGRAFIA } from "../../theme/tipografia";
import Alerta from "../ui/Alerta";
import Botao from "../ui/Botao";
import Campo from "../ui/Campo";
import Selecao from "../ui/Selecao";
import SeletorArquivoFonte from "./SeletorArquivoFonte";

const MESES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

// Lista FECHADA de anos (mesmo espírito de `Selecao`: nunca texto livre) —
// só uma conveniência de UI para não digitar o ano; o backend aceita
// qualquer `ano_exercicio` inteiro, isto não é validação de negócio.
function anosDisponiveis(anoAtual: number): number[] {
  return [anoAtual, anoAtual - 1, anoAtual - 2, anoAtual - 3, anoAtual - 4];
}

export interface ParametrosPreparacao {
  ano_exercicio: number;
  mes_referencia: number;
  caminho_base_ordens_bancarias: string;
  caminho_controle_dimcac: string;
  // Sprint 3 (HOMO-RT-06), fechamento — OPCIONAL: só enviado quando o
  // usuário já tem uma Planilha de Passagens persistida/selecionada; sem
  // ela, o comportamento é exatamente o anterior a esta feature (célula
  // vazia). Nunca gateia "Preparar Relatório" — Base OB e Controle DIMCAC
  // continuam os únicos campos obrigatórios (ver `podePreparar` abaixo).
  caminho_planilha_passagens?: string;
}

interface Props {
  erro: string | null;
  preparando: boolean;
  /** `null` enquanto o caminho de decisões (infraestrutura interna, nunca
   * exibido) ainda não foi resolvido via IPC — bloqueia "Preparar
   * Relatório" até existir, mesmo que os demais campos já estejam
   * preenchidos. */
  caminhoDecisoesResolvido: boolean;
  /** Micro-sprint UX operacional (item 3) — infraestrutura interna (mesmo
   * padrão de `caminhoDecisoesResolvido`), resolvida via IPC pela página:
   * ONDE persistir/reler os caminhos de Base OB e Controle DIMCAC já
   * selecionados em sessões anteriores. `null` até resolver. */
  caminhoConfiguracaoFontes: string | null;
  onPreparar: (parametros: ParametrosPreparacao, autor: string) => void;
}

// Micro-sprint 3E.1 — Tela 1 (entrada do módulo), proposta aprovada na
// investigação UX 3E: competência (mês/ano) + duas fontes administrativas +
// identificação de quem está revisando (`autor`, exigido pela API em toda
// decisão — descoberta durante a implementação, não existia no mockup) +
// ação principal. Estado do formulário é local: só sai daqui quando
// "Preparar Relatório" é clicado (mesmo padrão de `FormularioConfiguracao`,
// que só reporta pra cima via `aoConfigurar` na submissão).
export default function PainelEntrada({
  erro,
  preparando,
  caminhoDecisoesResolvido,
  caminhoConfiguracaoFontes,
  onPreparar,
}: Props) {
  const agora = new Date();
  const [mes, setMes] = useState(MESES[agora.getMonth()]);
  const [ano, setAno] = useState(String(agora.getFullYear()));
  const [autor, setAutor] = useState("");

  // Micro-sprint UX operacional (item 3) — Base OB e Controle DIMCAC não
  // são mais `useState` locais isolados: o hook carrega o que já foi
  // selecionado em sessões anteriores (persistido via `GET/POST /fontes`)
  // e cada seleção nova já sai persistida, pronta para a próxima abertura
  // do módulo.
  const {
    statusBaseOB,
    statusControleDimcac,
    statusPlanilhaPassagens,
    configurarBaseOB,
    configurarControleDimcac,
    configurarPlanilhaPassagens,
  } = useFontesRelatorioTransparencia(caminhoConfiguracaoFontes);

  const caminhoBaseOB = statusBaseOB.fase === "pronto" ? statusBaseOB.caminho : null;
  const caminhoControleDimcac = statusControleDimcac.fase === "pronto" ? statusControleDimcac.caminho : null;
  const caminhoPlanilhaPassagens =
    statusPlanilhaPassagens.fase === "pronto" ? statusPlanilhaPassagens.caminho : null;

  const podePreparar =
    mes.trim() !== "" &&
    ano.trim() !== "" &&
    caminhoBaseOB !== null &&
    caminhoControleDimcac !== null &&
    autor.trim() !== "" &&
    caminhoDecisoesResolvido &&
    !preparando;

  function aoClicarPreparar() {
    if (!podePreparar || caminhoBaseOB === null || caminhoControleDimcac === null) return;
    onPreparar(
      {
        ano_exercicio: Number(ano),
        mes_referencia: MESES.indexOf(mes) + 1,
        caminho_base_ordens_bancarias: caminhoBaseOB,
        caminho_controle_dimcac: caminhoControleDimcac,
        // Sprint 3 (HOMO-RT-06), fechamento — reaproveita o mesmo caminho já
        // persistido pelo seletor abaixo; `undefined` quando ainda não há
        // Planilha de Passagens selecionada (nunca bloqueia a preparação).
        caminho_planilha_passagens: caminhoPlanilhaPassagens ?? undefined,
      },
      // Normalização mínima e só para decisões NOVAS (histórico de decisões
      // já persistidas nunca é reescrito): remove espaços nas pontas e
      // colapsa espaços internos repetidos. Nunca infere identidade nem
      // unifica variações de um mesmo nome entre registros diferentes — só
      // evita que espaçamento acidental crie uma variação nova.
      autor.trim().replace(/\s+/g, " "),
    );
  }

  return (
    <div>
      <div className={`${SUPERFICIE_BASE} mb-5 p-7`}>
        <p className={TIPOGRAFIA.subtitulo}>Competência</p>
        <p className={`mt-1 mb-4 ${TIPOGRAFIA.textoAuxiliar}`}>
          Mês e ano de referência do relatório a ser preparado.
        </p>
        <div className="flex max-w-md gap-4">
          <div className="flex-1">
            <Selecao rotulo="Mês" valor={mes} opcoes={MESES} onMudar={setMes} disabled={preparando} />
          </div>
          <div className="flex-1">
            <Selecao
              rotulo="Ano"
              valor={ano}
              opcoes={anosDisponiveis(agora.getFullYear()).map(String)}
              onMudar={setAno}
              disabled={preparando}
            />
          </div>
        </div>
      </div>

      <div className={`${SUPERFICIE_BASE} mb-5 p-7`}>
        <p className={TIPOGRAFIA.subtitulo}>Fontes de Dados</p>
        <p className={`mt-1 mb-4 ${TIPOGRAFIA.textoAuxiliar}`}>
          Arquivos usados para conciliar os pagamentos desta competência.
        </p>
        <div className="flex flex-col gap-2.5">
          <SeletorArquivoFonte
            rotulo="Base de Ordens Bancárias"
            caminhoSelecionado={caminhoBaseOB}
            onSelecionar={configurarBaseOB}
            desabilitado={preparando}
            indisponivel={statusBaseOB.fase === "indisponivel"}
          />
          <SeletorArquivoFonte
            rotulo="Controle DIMCAC"
            caminhoSelecionado={caminhoControleDimcac}
            onSelecionar={configurarControleDimcac}
            desabilitado={preparando}
            indisponivel={statusControleDimcac.fase === "indisponivel"}
          />
          {/* Sprint 3 (HOMO-RT-06), fechamento — o caminho persistido aqui é
           * efetivamente usado por "Preparar Relatório"/"Gerar Relatório"
           * (ver `caminho_planilha_passagens` em `aoClicarPreparar` abaixo),
           * mas deliberadamente NÃO entra em `podePreparar`: selecionar esta
           * fonte continua opcional — sem ela, Valor da Passagem fica com
           * célula vazia (comportamento idêntico ao anterior a esta
           * feature), nunca bloqueia a preparação/geração do relatório.
           * `.ods` é o formato real recebido pelo setor (leitura nativa, sem
           * exigir conversão manual para `.xlsx`). */}
          <SeletorArquivoFonte
            rotulo="Planilha de Passagens"
            caminhoSelecionado={caminhoPlanilhaPassagens}
            onSelecionar={configurarPlanilhaPassagens}
            desabilitado={preparando}
            indisponivel={statusPlanilhaPassagens.fase === "indisponivel"}
            accept=".ods"
          />
        </div>
      </div>

      <div className={`${SUPERFICIE_BASE} mb-5 p-7`}>
        <Campo
          rotulo="Responsável pela revisão"
          value={autor}
          onChange={(evento) => setAutor(evento.target.value)}
          placeholder="Seu nome ou matrícula"
          disabled={preparando}
        />
      </div>

      {statusBaseOB.fase === "erro" && (
        <div className="mb-5">
          <Alerta variante="erro">{statusBaseOB.mensagem}</Alerta>
        </div>
      )}
      {statusControleDimcac.fase === "erro" && (
        <div className="mb-5">
          <Alerta variante="erro">{statusControleDimcac.mensagem}</Alerta>
        </div>
      )}
      {statusPlanilhaPassagens.fase === "erro" && (
        <div className="mb-5">
          <Alerta variante="erro">{statusPlanilhaPassagens.mensagem}</Alerta>
        </div>
      )}

      {erro && (
        <div className="mb-5">
          <Alerta variante="erro">{erro}</Alerta>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <Botao variante="primaria" tamanho="grande" onClick={aoClicarPreparar} disabled={!podePreparar} carregando={preparando}>
          Preparar Relatório
        </Botao>
        <p className={`max-w-xs ${TIPOGRAFIA.textoAuxiliar}`}>
          A conciliação roda com os arquivos selecionados e pode levar alguns instantes.
        </p>
      </div>
    </div>
  );
}
