import { AlertTriangle, CheckCircle2, History } from "lucide-react";
import { SUPERFICIE_BASE } from "../../theme/estilos";
import { TIPOGRAFIA } from "../../theme/tipografia";
import Alerta from "../ui/Alerta";
import Badge from "../ui/Badge";
import Botao from "../ui/Botao";
import Cartao from "../ui/Cartao";
import type { ResumoRelatorioTransparencia } from "../../types/relatorioTransparencia";

interface Props {
  resumo: ResumoRelatorioTransparencia;
  onRevisarCasos: () => void;
  onVoltarParaEntrada: () => void;
}

// Micro-sprint 3E.1 — uma só tela para Tela 2 ("resultado da preparação")
// e Tela 5 ("revisões concluídas") do mockup aprovado: as duas são o MESMO
// resumo, só em dois pontos diferentes do fluxo — `resumo.pode_gerar_relatorio`
// (calculado pelo backend, RN "G05") decide qual das duas variantes mostrar,
// nunca um cálculo próprio do frontend. Reuso, não duplicação (SEARCH →
// REUSE → EXTEND).
export default function PainelResumo({ resumo, onRevisarCasos, onVoltarParaEntrada }: Props) {
  // Único critério para saber quantos casos ainda precisam de decisão —
  // mesmo filtro usado pelo hook para decidir a navegação, repetido aqui só
  // para o texto da tela ("N Casos"). O resultado (`pode_gerar_relatorio`)
  // continua vindo do backend, nunca recalculado.
  const casosPendentes = resumo.revisoes.filter((revisao) => revisao.estado !== "decidida").length;

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

        <div className={`${SUPERFICIE_BASE} flex flex-wrap items-center justify-between gap-5 p-7`}>
          <div>
            <p className={TIPOGRAFIA.subtitulo}>Geração do relatório final</p>
            <p className={`mt-1 ${TIPOGRAFIA.textoAuxiliar}`}>Disponível em uma próxima etapa deste projeto.</p>
          </div>
          <div className="flex items-center gap-3">
            <Badge variante="neutro">Em breve</Badge>
            <Botao variante="primaria" tamanho="grande" disabled>
              Gerar Relatório
            </Botao>
          </div>
        </div>

        <div className="mt-5">
          <Botao variante="link" onClick={onVoltarParaEntrada}>
            Selecionar outra competência ou fontes
          </Botao>
        </div>
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
      </div>
    </div>
  );
}
