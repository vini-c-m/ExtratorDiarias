import { CheckCircle2, Clock, CopyX, FileText, FolderOpen, XCircle } from "lucide-react";
import { formatarDuracao } from "../../lib/progresso";
import Cartao from "../ui/Cartao";

interface Props {
  totalAnalisados: number;
  diariasInseridas: number;
  duplicadas: number;
  erros: number;
  tempoTotalMs: number | null;
  pastaResultados: string;
}

export default function ResumoResultado({
  totalAnalisados,
  diariasInseridas,
  duplicadas,
  erros,
  tempoTotalMs,
  pastaResultados,
}: Props) {
  return (
    <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-6">
      <Cartao rotulo="PDFs analisados" valor={totalAnalisados} icone={FileText} />
      <Cartao rotulo="Diárias inseridas" valor={diariasInseridas} cor="sucesso" icone={CheckCircle2} />
      <Cartao rotulo="Duplicadas" valor={duplicadas} cor="atencao" icone={CopyX} />
      <Cartao
        rotulo="Erros encontrados"
        valor={erros}
        cor={erros > 0 ? "erro" : "padrao"}
        icone={erros > 0 ? XCircle : FileText}
      />
      <Cartao
        rotulo="Tempo total"
        valor={tempoTotalMs !== null ? formatarDuracao(tempoTotalMs) : "—"}
        icone={Clock}
      />
      <Cartao
        rotulo="Pasta de resultados"
        valor={pastaResultados}
        tamanho="compacto"
        icone={FolderOpen}
      />
    </div>
  );
}
