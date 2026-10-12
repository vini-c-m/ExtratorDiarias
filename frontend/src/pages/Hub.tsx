import { BarChart3, ClipboardCheck, FileSpreadsheet, Landmark, ListChecks } from "lucide-react";
import AlertaGlobalDocumentosHabeis from "../components/hub/AlertaGlobalDocumentosHabeis";
import CardFuncionalidade from "../components/hub/CardFuncionalidade";
import AvisoConfiguracaoPendente from "../components/configuracao/AvisoConfiguracaoPendente";
import Alerta from "../components/ui/Alerta";
import { MENSAGENS } from "../lib/mensagens";
import { TIPOGRAFIA } from "../theme/tipografia";
import type { EstadoConfiguracao } from "../types/configuracao";

interface Props {
  backendOnline: boolean;
  aoSelecionarProcessamento: () => void;
  aoSelecionarConferencia: () => void;
  aoSelecionarAnalitica: () => void;
  // Alerta global de Documentos Hábeis Pendentes — mesmo destino de
  // `aoSelecionarAnalitica`, mas já abrindo direto na lista de pendências.
  aoAbrirDocumentosHabeisPendentes: () => void;
  // Micro-sprint B — quarta central, entrada própria como as demais.
  aoSelecionarRegularizacaoDH: () => void;
  // Micro-sprint 3E.1 — quinto card, mesmo padrão das demais. Opcional só
  // para não quebrar testes existentes que montam este componente sem esta
  // prop (mesmo critério já usado por `configuracaoAtiva`/`aoAbrirConfiguracoes`
  // abaixo).
  aoSelecionarRelatorioTransparencia?: () => void;
  // Organização Automática de PDFs — aviso persistente quando alguma
  // funcionalidade está bloqueada por falta de pasta operacional
  // configurada. Nunca bloqueia o Hub em si, só avisa. Opcionais para não
  // quebrar testes existentes que montam este componente sem essas props;
  // `null`/ausente nunca mostra o aviso.
  configuracaoAtiva?: EstadoConfiguracao | null;
  aoAbrirConfiguracoes?: () => void;
}

// Rótulos únicos de todas as pastas faltando em qualquer funcionalidade —
// o banner do Hub é genérico (não lista rótulos), mas só aparece quando há
// pelo menos uma pendência real em alguma das três.
function pastasFaltandoNoHub(configuracao: EstadoConfiguracao | null): string[] {
  if (!configuracao || !configuracao.configurado) return [];
  const { prontidao_pastas: prontidao } = configuracao;
  const faltando = new Set<string>();
  for (const chave of ["processamento_padrao", "complemento", "finalizacao"] as const) {
    for (const rotulo of prontidao[chave].pastas_faltando) faltando.add(rotulo);
  }
  return [...faltando];
}

// Sprint 14 — Hub de funcionalidades: segunda tela do fluxo (Boas-vindas →
// Hub → funcionalidade), pedida para nunca mais o app abrir direto num
// formulário técnico. Uma entrada por funcionalidade, em array — um 3º
// módulo futuro é uma linha a mais aqui, nunca uma navegação redesenhada
// (item "escalável" do briefing).
//
// Sprint 14 (sugestão premium 01, aprovada) — o aviso de "sistema ainda
// iniciando" deixa de aparecer só depois que o servidor já escolheu uma
// funcionalidade (fundo de `SelecionarProcessar`/`Conferencia`, cada uma
// com o próprio aviso) e passa a aparecer já aqui, no Hub — mesmo texto
// (`MENSAGENS.aguardandoAplicativo`) e mesmo componente (`Alerta`), só mais
// cedo no fluxo. Os cards continuam sempre clicáveis mesmo com o backend
// offline (mesma decisão já tomada para o botão "Começar" da Boas-vindas):
// quem trava ou não uma ação por causa do backend continua sendo cada
// funcionalidade, não a navegação.
export default function Hub({
  backendOnline,
  aoSelecionarProcessamento,
  aoSelecionarConferencia,
  aoSelecionarAnalitica,
  aoAbrirDocumentosHabeisPendentes,
  aoSelecionarRegularizacaoDH,
  aoSelecionarRelatorioTransparencia,
  configuracaoAtiva = null,
  aoAbrirConfiguracoes,
}: Props) {
  const funcionalidades = [
    {
      titulo: "Processamento da Planilha",
      descricao: "Processe PDFs e alimente automaticamente a planilha oficial.",
      icone: FileSpreadsheet,
      cor: "roxo" as const,
      aoClicar: aoSelecionarProcessamento,
    },
    {
      titulo: "Central Inteligente de Conferência",
      descricao:
        "Consulte rapidamente servidores, duplicidades e informações operacionais antes do processamento.",
      icone: ListChecks,
      cor: "ciano" as const,
      aoClicar: aoSelecionarConferencia,
    },
    {
      // Sprint 18.4.2 — terceiro card do Hub, cor "azul" (extensão de
      // `CardFuncionalidade`). Descrição original restrita a pesquisa/
      // filtro, porque Dashboard/Relatórios/Diagnóstico ainda estavam
      // bloqueados (`ui-arquitetura.md` § 0.6). Auditoria de regressão
      // global (Sprint 19.x): a V2 (19.1-19.10, homologada) tornou esses
      // três reais — texto desatualizado corrigido aqui, achado puramente
      // de conteúdo, nenhum comportamento/rota alterado.
      titulo: "Central Analítica",
      descricao: "Pesquise, filtre e analise diárias com dashboards, relatórios e diagnóstico automático.",
      icone: BarChart3,
      cor: "azul" as const,
      aoClicar: aoSelecionarAnalitica,
    },
    {
      // Micro-sprint B — quarta central: localiza, lista e apresenta o
      // detalhe de diárias já cadastradas aguardando Documento Hábil
      // (somente leitura nesta Sprint).
      titulo: "Central de Regularização de DH",
      descricao: "Consulte os processos já cadastrados que estão aguardando Documento Hábil.",
      icone: ClipboardCheck,
      cor: "verde" as const,
      aoClicar: aoSelecionarRegularizacaoDH,
    },
    {
      // Micro-sprint 3E.1 — quinto card do Hub: prepara e revisa o
      // Relatório do Portal da Transparência antes da futura geração do
      // XLSX final (ainda não implementada). Módulo próprio, nunca dentro
      // de outra Central (investigação UX 3E, item 1/5). Cor índigo
      // (`shadow-glow-indigo`, token novo em `theme.css`) — nunca âmbar,
      // que já é a cor semântica de aviso/revisão em todo o app.
      titulo: "Relatório do Portal da Transparência",
      descricao:
        "Concilia a Base E-Fisco com o Controle DIMCAC e resolve pendências antes da geração do relatório.",
      icone: Landmark,
      cor: "indigo" as const,
      aoClicar: () => aoSelecionarRelatorioTransparencia?.(),
    },
  ];

  return (
    <div className="mx-auto max-w-4xl animate-entrada-conteudo px-6 py-12 md:px-10">
      <p className={`text-center ${TIPOGRAFIA.textoAuxiliar}`}>O que você precisa fazer agora?</p>

      {!backendOnline && (
        <div className="mx-auto mt-4 max-w-md">
          <Alerta variante="aviso">{MENSAGENS.aguardandoAplicativo}</Alerta>
        </div>
      )}

      <div className="mx-auto mt-4 max-w-md">
        <AlertaGlobalDocumentosHabeis
          backendOnline={backendOnline}
          aoAbrirPendencias={aoAbrirDocumentosHabeisPendentes}
        />
      </div>

      <div className="mx-auto mt-4 max-w-md">
        <AvisoConfiguracaoPendente
          pastasFaltando={pastasFaltandoNoHub(configuracaoAtiva)}
          aoConfigurar={() => aoAbrirConfiguracoes?.()}
          variante="banner"
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2">
        {funcionalidades.map((funcionalidade, indice) => (
          <div
            key={funcionalidade.titulo}
            className="animate-entrada-conteudo [animation-fill-mode:backwards]"
            style={{ animationDelay: `${indice * 70}ms` }}
          >
            <CardFuncionalidade
              titulo={funcionalidade.titulo}
              descricao={funcionalidade.descricao}
              icone={funcionalidade.icone}
              cor={funcionalidade.cor}
              onClick={funcionalidade.aoClicar}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
