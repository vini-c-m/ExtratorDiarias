import { FileSpreadsheet, ListChecks } from "lucide-react";
import CardFuncionalidade from "../components/hub/CardFuncionalidade";
import Alerta from "../components/ui/Alerta";
import { MENSAGENS } from "../lib/mensagens";
import { TIPOGRAFIA } from "../theme/tipografia";

interface Props {
  backendOnline: boolean;
  aoSelecionarProcessamento: () => void;
  aoSelecionarConferencia: () => void;
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
export default function Hub({ backendOnline, aoSelecionarProcessamento, aoSelecionarConferencia }: Props) {
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
  ];

  return (
    <div className="mx-auto max-w-4xl animate-entrada-conteudo px-6 py-12 md:px-10">
      <p className={`text-center ${TIPOGRAFIA.textoAuxiliar}`}>O que você precisa fazer agora?</p>

      {!backendOnline && (
        <div className="mx-auto mt-4 max-w-md">
          <Alerta variante="aviso">{MENSAGENS.aguardandoAplicativo}</Alerta>
        </div>
      )}

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
