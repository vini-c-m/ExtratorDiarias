import { AlertTriangle, CheckCircle2, FolderOpen, History } from "lucide-react";
import { type ChangeEvent, useState } from "react";
import { SUPERFICIE_BASE } from "../../theme/estilos";
import { TIPOGRAFIA } from "../../theme/tipografia";
import { useGerarRelatorioTransparencia } from "../../hooks/useGerarRelatorioTransparencia";
import Alerta from "../ui/Alerta";
import BotaoArquivo from "../ui/BotaoArquivo";
import Botao from "../ui/Botao";
import Cartao from "../ui/Cartao";
import HistoricoDecisoes from "./HistoricoDecisoes";
import type { ParametrosFontesRelatorioTransparencia, ResumoRelatorioTransparencia } from "../../types/relatorioTransparencia";

interface Props {
  resumo: ResumoRelatorioTransparencia;
  /** Micro-sprint 3H — os mesmos 5 parâmetros de fonte da preparação em
   * curso (`useRelatorioTransparencia.parametrosFontesAtuais`), necessários
   * para "Gerar Relatório" reenviar. `null` só é possível em teste
   * isolado — na tela real esta fase só existe depois de "Preparar
   * Relatório" ter sucesso. */
  parametrosFontes: ParametrosFontesRelatorioTransparencia | null;
  /** Infraestrutura interna (nunca exibida) — resolvida via IPC pela
   * página, mesmo padrão de `caminho_decisoes`. */
  caminhoConfiguracaoTemplate: string | null;
  onRevisarCasos: () => void;
  onVoltarParaEntrada: () => void;
}

// Micro-sprint 3H — bloco de geração final do XLSX, mostrado só quando
// `resumo.pode_gerar_relatorio` é `true`. O Template Oficial é
// infraestrutura fixa do módulo (configurada uma vez, item 11 da
// especificação) — este bloco só lê `statusTemplate` do hook, nunca decide
// sozinho se pode gerar (isso continua sendo só `resumo.pode_gerar_relatorio`,
// já resolvido acima na árvore de decisão do componente).
function BlocoGeracao({
  parametrosFontes,
  caminhoConfiguracaoTemplate,
}: {
  parametrosFontes: ParametrosFontesRelatorioTransparencia | null;
  caminhoConfiguracaoTemplate: string | null;
}) {
  const {
    statusTemplate,
    carregarStatusTemplate,
    configurandoTemplate,
    configurarTemplate,
    estadoGeracao,
    gerando,
    gerar,
    erroAcaoPosGeracao,
    abrirRelatorio,
    abrirPasta,
    abrirArquivoNaoPublicadas,
  } = useGerarRelatorioTransparencia(caminhoConfiguracaoTemplate);

  function aoSelecionarTemplate(evento: ChangeEvent<HTMLInputElement>) {
    const arquivo = evento.target.files?.[0];
    if (!arquivo) return;
    configurarTemplate(window.api.getPathForFile(arquivo));
    evento.target.value = "";
  }

  if (estadoGeracao.fase === "sucesso") {
    return (
      <div className="w-full">
        <div className="flex flex-wrap items-center justify-between gap-5">
          <div>
            <p className={TIPOGRAFIA.subtitulo}>Relatório gerado com sucesso.</p>
            <p className={`mt-1 truncate ${TIPOGRAFIA.textoAuxiliar}`}>
              {estadoGeracao.caminhoArquivo.split(/[\\/]/).pop()}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Botao variante="secundaria" onClick={abrirRelatorio}>
              Abrir relatório
            </Botao>
            <Botao variante="secundaria" onClick={abrirPasta}>
              <FolderOpen aria-hidden="true" className="h-4 w-4" />
              Abrir pasta
            </Botao>
          </div>
        </div>

        {/* Sprint 5 — resumo do XLSX operacional, gerado na mesma execução
            a partir do MESMO ResultadoRevisado do oficial. Três estados
            possíveis, nunca confundidos entre si: havia diárias e o arquivo
            foi gerado; não havia nenhuma; havia, mas a escrita falhou depois
            do oficial já salvo (nunca tratado como sucesso silencioso). */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-neutral-200 pt-4 dark:border-neutral-800">
          {estadoGeracao.naoPublicadasGerado && estadoGeracao.caminhoArquivoNaoPublicadas ? (
            <>
              <p className={TIPOGRAFIA.textoAuxiliar}>
                Diárias para investigação: <strong>{estadoGeracao.totalNaoPublicadas}</strong>
              </p>
              <Botao variante="secundaria" onClick={abrirArquivoNaoPublicadas}>
                Abrir planilha de não publicadas
              </Botao>
            </>
          ) : estadoGeracao.erroNaoPublicadas ? (
            <Alerta variante="aviso">
              O relatório do Portal da Transparência foi salvo normalmente, mas não foi possível gerar a planilha de
              diárias não publicadas ({estadoGeracao.totalNaoPublicadas} pendente
              {estadoGeracao.totalNaoPublicadas === 1 ? "" : "s"} de investigação). Tente gerar o relatório
              novamente.
            </Alerta>
          ) : (
            <p className={TIPOGRAFIA.textoAuxiliar}>Não há diárias não publicadas para investigação.</p>
          )}
        </div>

        {erroAcaoPosGeracao && (
          <div className="mt-4">
            <Alerta variante="erro">{erroAcaoPosGeracao}</Alerta>
          </div>
        )}
      </div>
    );
  }

  if (statusTemplate.fase === "carregando") {
    return <p className={TIPOGRAFIA.textoAuxiliar}>Verificando o modelo do relatório...</p>;
  }

  if (statusTemplate.fase === "erro") {
    return (
      <div className="w-full">
        <Alerta variante="erro">{statusTemplate.mensagem}</Alerta>
        <div className="mt-3">
          <Botao variante="secundaria" onClick={carregarStatusTemplate}>
            Tentar novamente
          </Botao>
        </div>
      </div>
    );
  }

  if (statusTemplate.fase === "nao-configurado" || statusTemplate.fase === "indisponivel") {
    return (
      <div className="w-full">
        <p className={TIPOGRAFIA.subtitulo}>Geração do relatório final</p>
        <p className={`mt-1 mb-4 ${TIPOGRAFIA.textoAuxiliar}`}>
          {statusTemplate.fase === "indisponivel"
            ? "O template oficial configurado não foi encontrado. Selecione-o novamente para gerar o relatório."
            : "Selecione o template oficial do relatório antes de gerar (feito apenas uma vez)."}
        </p>
        <BotaoArquivo
          accept=".xlsx"
          desabilitado={configurandoTemplate}
          titulo="Selecionar Template Oficial"
          onChange={aoSelecionarTemplate}
        >
          <FolderOpen aria-hidden="true" className="h-4 w-4" />
          {configurandoTemplate ? "Salvando..." : "Selecionar Template Oficial"}
        </BotaoArquivo>
      </div>
    );
  }

  // statusTemplate.fase === "pronto"
  return (
    <div className="w-full">
      <div className="flex flex-wrap items-center justify-between gap-5">
        <div>
          <p className={TIPOGRAFIA.subtitulo}>Geração do relatório final</p>
          <p className={`mt-1 ${TIPOGRAFIA.textoAuxiliar}`}>Modelo oficial: {statusTemplate.nomeArquivo}</p>
        </div>
        <Botao
          variante="primaria"
          tamanho="grande"
          disabled={gerando || !parametrosFontes}
          carregando={gerando}
          onClick={() => parametrosFontes && gerar(parametrosFontes)}
        >
          {gerando ? "Gerando relatório..." : "Gerar Relatório"}
        </Botao>
      </div>
      {estadoGeracao.fase === "erro" && (
        <div className="mt-4">
          <Alerta variante="erro">{estadoGeracao.mensagem}</Alerta>
        </div>
      )}
    </div>
  );
}

// Micro-sprint 3E.1 — uma só tela para Tela 2 ("resultado da preparação")
// e Tela 5 ("revisões concluídas") do mockup aprovado: as duas são o MESMO
// resumo, só em dois pontos diferentes do fluxo — `resumo.pode_gerar_relatorio`
// (calculado pelo backend, RN "G05") decide qual das duas variantes mostrar,
// nunca um cálculo próprio do frontend. Reuso, não duplicação (SEARCH →
// REUSE → EXTEND).
export default function PainelResumo({
  resumo,
  parametrosFontes,
  caminhoConfiguracaoTemplate,
  onRevisarCasos,
  onVoltarParaEntrada,
}: Props) {
  // Único critério para saber quantos casos ainda precisam de decisão —
  // mesmo filtro usado pelo hook para decidir a navegação, repetido aqui só
  // para o texto da tela ("N Casos"). O resultado (`pode_gerar_relatorio`)
  // continua vindo do backend, nunca recalculado.
  const casosPendentes = resumo.revisoes.filter((revisao) => revisao.estado !== "decidida").length;
  // Micro-sprint corretiva HOMO-RT-02 — histórico de decisões: reaproveita
  // `resumo.revisoes` (já veio do backend com autor/decidido_em/observacao
  // por grupo), sem chamada nova. Fechado por padrão — só ocupa espaço na
  // tela quando alguém pede para ver.
  const [mostrarHistorico, setMostrarHistorico] = useState(false);

  if (resumo.pode_gerar_relatorio) {
    return (
      <div>
        <div className={`${SUPERFICIE_BASE} mb-7 p-12 text-center`}>
          <span className="inline-flex h-16 w-16 items-center justify-center rounded-[20px] bg-emerald-500/10 text-emerald-400">
            <CheckCircle2 aria-hidden="true" className="h-8 w-8" />
          </span>
          <h2 className={`mt-5 text-2xl font-bold ${TIPOGRAFIA.titulo}`}>Todas as revisões foram concluídas.</h2>
          <p className={`mt-2 ${TIPOGRAFIA.texto}`}>Relatório pronto para geração.</p>
        </div>

        <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Cartao rotulo="Pagamentos prontos" valor={resumo.total_candidatos_normais} tamanho="compacto" />
          <Cartao rotulo="Casos revisados" valor={resumo.total_revisoes} cor="info" tamanho="compacto" />
          <Cartao rotulo="Decisões registradas" valor={resumo.total_decididas} cor="info" tamanho="compacto" />
          <Cartao
            rotulo="Não serão publicados"
            valor={resumo.total_ocorrencias_nao_publicaveis}
            tamanho="compacto"
          />
        </div>

        <div className={`${SUPERFICIE_BASE} p-7`}>
          <BlocoGeracao parametrosFontes={parametrosFontes} caminhoConfiguracaoTemplate={caminhoConfiguracaoTemplate} />
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-4">
          <Botao variante="link" onClick={onVoltarParaEntrada}>
            Selecionar outra competência ou fontes
          </Botao>
          <Botao variante="link" onClick={() => setMostrarHistorico((atual) => !atual)}>
            {mostrarHistorico ? "Ocultar histórico de decisões" : "Ver histórico de decisões"}
          </Botao>
        </div>

        {mostrarHistorico && (
          <div className="mt-5">
            <HistoricoDecisoes revisoes={resumo.revisoes} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-7">
        <Alerta variante="aviso">Existem casos que precisam ser analisados antes da geração.</Alerta>
      </div>

      {/* Hierarquia visual: a pendência (2ª cartão) é a informação
       * operacional principal — cor de atenção (âmbar) e posição central,
       * enquanto "pagamentos prontos" (neutro/sucesso) e "reaproveitadas"
       * (informativo) ficam discretas ao redor (correção aprovada na
       * investigação UX 3E, item 5). */}
      <div className="mb-8 grid grid-cols-1 gap-5 sm:grid-cols-3">
        <Cartao rotulo="Pagamentos prontos" valor={resumo.total_candidatos_normais} icone={CheckCircle2} />
        <Cartao
          rotulo="Casos precisam de revisão"
          valor={casosPendentes}
          cor="atencao"
          icone={AlertTriangle}
        />
        <Cartao
          rotulo="Decisões anteriores reaproveitadas"
          valor={resumo.total_decididas}
          cor="info"
          icone={History}
        />
      </div>

      <div className="flex flex-wrap items-center gap-5">
        <Botao variante="primaria" tamanho="grande" onClick={onRevisarCasos}>
          Revisar {casosPendentes} {casosPendentes === 1 ? "Caso" : "Casos"}
        </Botao>
        <Botao variante="link" onClick={onVoltarParaEntrada}>
          Selecionar outra competência ou fontes
        </Botao>
        <Botao variante="link" onClick={() => setMostrarHistorico((atual) => !atual)}>
          {mostrarHistorico ? "Ocultar histórico de decisões" : "Ver histórico de decisões"}
        </Botao>
      </div>

      {mostrarHistorico && (
        <div className="mt-5">
          <HistoricoDecisoes revisoes={resumo.revisoes} />
        </div>
      )}
    </div>
  );
}
