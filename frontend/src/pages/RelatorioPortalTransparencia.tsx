import { Landmark } from "lucide-react";
import { useEffect, useState } from "react";
import PainelEntrada, { type ParametrosPreparacao } from "../components/relatorioTransparencia/PainelEntrada";
import PainelResumo from "../components/relatorioTransparencia/PainelResumo";
import PainelRevisaoCaso from "../components/relatorioTransparencia/PainelRevisaoCaso";
import Alerta from "../components/ui/Alerta";
import { useRelatorioTransparencia } from "../hooks/useRelatorioTransparencia";
import { TIPOGRAFIA } from "../theme/tipografia";

interface Props {
  backendOnline: boolean;
}

// Micro-sprint 3E.1 — módulo próprio no Hub (nunca dentro de Central de
// Conferência/Analítica/Regularização), mesma hierarquia de qualquer outra
// funcionalidade (`título + descrição` no topo, "← Voltar" é chrome do
// `Cabecalho` global — esta página não sabe que ele existe, mesmo critério
// de `CentralRegularizacaoDH.tsx`).
//
// Orquestração pura: esta página só decide QUAL painel mostrar a partir da
// fase do hook (`useRelatorioTransparencia`, que é quem chama a API) e
// resolve o `caminho_decisoes` via IPC (infraestrutura interna, nunca
// exibida — item 4 da micro-sprint). Nenhuma regra de negócio, nenhuma
// interpretação de campo administrativo.
export default function RelatorioPortalTransparencia({ backendOnline }: Props) {
  const {
    estado,
    preparando,
    enviandoDecisao,
    parametrosFontesAtuais,
    coberturaInsuficiente,
    preparar,
    repetirComCoberturaParcial,
    iniciarRevisao,
    confirmarDecisao,
    adiarCaso,
    voltarParaEntrada,
  } = useRelatorioTransparencia();

  // "Responsável pela revisão" — a API exige `autor` (não vazio) em toda
  // decisão; coletado uma única vez na Tela 1 e reaproveitado em todas as
  // decisões desta sessão (nunca persistido — `useState`, some ao fechar o
  // app, mesmo critério de privacidade do restante do módulo).
  const [autor, setAutor] = useState("");

  // `caminho_decisoes` nunca é escolhido pelo usuário (item 4): resolvido
  // uma vez, via IPC, para dentro da pasta de dados já usada pelo resto do
  // app (`electron/ipc/relatorioTransparencia.ts`). `null` até resolver —
  // `PainelEntrada` mantém "Preparar Relatório" desabilitado até aqui.
  const [caminhoDecisoes, setCaminhoDecisoes] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    if (typeof window.api?.obterCaminhoDecisoesRelatorioTransparencia !== "function") return;
    window.api.obterCaminhoDecisoesRelatorioTransparencia().then((caminho) => {
      if (!cancelado) setCaminhoDecisoes(caminho);
    });
    return () => {
      cancelado = true;
    };
  }, []);

  // Micro-sprint 3H — mesmo critério de `caminhoDecisoes` acima: caminho da
  // configuração do Template Oficial (infraestrutura interna, nunca
  // exibida), resolvido uma vez via IPC e repassado para `PainelResumo`
  // (única tela que precisa disso, para a ação "Gerar Relatório").
  const [caminhoConfiguracaoTemplate, setCaminhoConfiguracaoTemplate] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    if (typeof window.api?.obterCaminhoConfiguracaoTemplateRelatorioTransparencia !== "function") return;
    window.api.obterCaminhoConfiguracaoTemplateRelatorioTransparencia().then((caminho) => {
      if (!cancelado) setCaminhoConfiguracaoTemplate(caminho);
    });
    return () => {
      cancelado = true;
    };
  }, []);

  // Micro-sprint UX operacional (item 3) — mesmo critério de
  // `caminhoConfiguracaoTemplate` acima: caminho da configuração persistida
  // de Base OB/Controle DIMCAC (infraestrutura interna, nunca exibida),
  // repassado para `PainelEntrada` (única tela que seleciona essas fontes).
  const [caminhoConfiguracaoFontes, setCaminhoConfiguracaoFontes] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    if (typeof window.api?.obterCaminhoConfiguracaoFontesRelatorioTransparencia !== "function") return;
    window.api.obterCaminhoConfiguracaoFontesRelatorioTransparencia().then((caminho) => {
      if (!cancelado) setCaminhoConfiguracaoFontes(caminho);
    });
    return () => {
      cancelado = true;
    };
  }, []);

  function aoPreparar(parametros: ParametrosPreparacao, autorInformado: string) {
    setAutor(autorInformado);
    if (!caminhoDecisoes) return;
    preparar({ ...parametros, caminho_decisoes: caminhoDecisoes });
  }

  // O caso mostrado é sempre o PRIMEIRO ainda não decidido na lista
  // devolvida pelo backend nesta resposta — a ordem de `revisoes` não é
  // garantida estável entre chamadas (documentado no contrato 3D), então
  // nunca guardamos um índice próprio: a cada resumo novo, lemos de novo
  // qual é o primeiro pendente.
  const casoAtual =
    estado.fase === "revisao" ? (estado.resumo.revisoes.find((r) => r.estado !== "decidida") ?? null) : null;
  const totalCasos = estado.fase === "revisao" ? estado.resumo.total_revisoes : 0;
  const casosRestantes =
    estado.fase === "revisao" ? estado.resumo.revisoes.filter((r) => r.estado !== "decidida").length : 0;

  return (
    <div className="mx-auto max-w-4xl animate-entrada-conteudo px-6 py-14 md:px-10">
      <div className="mb-8 flex items-start gap-3.5">
        <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-300">
          <Landmark aria-hidden="true" className="h-[22px] w-[22px]" />
        </span>
        <div>
          <h2 className={TIPOGRAFIA.titulo}>Relatório do Portal da Transparência</h2>
          <p className={`mt-1.5 max-w-xl ${TIPOGRAFIA.texto}`}>
            Concilia a Base E-Fisco com o Controle DIMCAC e resolve casos atípicos antes da geração
            do relatório.
          </p>
        </div>
      </div>

      {!backendOnline && (
        <div className="mb-6">
          <Alerta variante="aviso">Aguardando o aplicativo terminar de iniciar...</Alerta>
        </div>
      )}

      {estado.fase === "entrada" && (
        <PainelEntrada
          erro={estado.erro}
          preparando={preparando}
          caminhoDecisoesResolvido={caminhoDecisoes !== null}
          caminhoConfiguracaoFontes={caminhoConfiguracaoFontes}
          coberturaInsuficiente={coberturaInsuficiente}
          onPreparar={aoPreparar}
          onPrepararComCoberturaParcial={repetirComCoberturaParcial}
        />
      )}

      {estado.fase === "resumo" && (
        <PainelResumo
          resumo={estado.resumo}
          parametrosFontes={parametrosFontesAtuais}
          caminhoConfiguracaoTemplate={caminhoConfiguracaoTemplate}
          onRevisarCasos={iniciarRevisao}
          onVoltarParaEntrada={voltarParaEntrada}
        />
      )}

      {estado.fase === "revisao" && casoAtual && (
        <PainelRevisaoCaso
          key={casoAtual.identidade_grupo}
          revisao={casoAtual}
          indiceAtual={totalCasos - casosRestantes + 1}
          totalCasos={totalCasos}
          enviando={enviandoDecisao}
          erro={estado.erro}
          onConfirmarDecisao={(obsSelecionadas, justificativa) =>
            confirmarDecisao(casoAtual.identidade_grupo, obsSelecionadas, autor, justificativa)
          }
          onAdiar={() => adiarCaso(casoAtual.identidade_grupo, autor)}
        />
      )}
    </div>
  );
}
