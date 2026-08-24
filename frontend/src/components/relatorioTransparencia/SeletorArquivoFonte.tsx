import { CheckCircle2, FolderOpen } from "lucide-react";
import type { ChangeEvent } from "react";
import { TIPOGRAFIA } from "../../theme/tipografia";
import BotaoArquivo from "../ui/BotaoArquivo";

// Micro-sprint 3E.1 — mostra só o NOME do arquivo, nunca o caminho absoluto
// (item 3 da investigação UX 3E: "NÃO mostrar caminho absoluto
// desnecessariamente"). O caminho completo continua existindo (é o que a
// API precisa), só não aparece na tela.
function nomeDoArquivo(caminho: string): string {
  return caminho.split(/[\\/]/).pop() ?? caminho;
}

interface Props {
  rotulo: string;
  caminhoSelecionado: string | null;
  onSelecionar: (caminho: string) => void;
  desabilitado?: boolean;
}

// Reaproveita o mecanismo de seleção já existente no app (`BotaoArquivo` +
// `window.api.getPathForFile`, mesmo par usado pela fila de PDFs de
// Processamento) — nenhum diálogo nativo novo, nenhuma alteração em
// Electron. `accept=".xlsx"` filtra o seletor do sistema operacional para
// planilhas Excel, mesmo critério de `configuracao:selecionar-planilha`.
export default function SeletorArquivoFonte({
  rotulo,
  caminhoSelecionado,
  onSelecionar,
  desabilitado = false,
}: Props) {
  function aoEscolherArquivo(evento: ChangeEvent<HTMLInputElement>) {
    const arquivo = evento.target.files?.[0];
    if (!arquivo) return;
    onSelecionar(window.api.getPathForFile(arquivo));
    // Permite selecionar o mesmo arquivo de novo (ex.: depois de substituir
    // o conteúdo na mesma pasta) — sem isso, o navegador não dispara
    // `onChange` para um caminho já escolhido antes.
    evento.target.value = "";
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.02] px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <span
          className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[10px] ${
            caminhoSelecionado ? "bg-emerald-500/10 text-emerald-400" : "bg-white/5 text-slate-500"
          }`}
        >
          <CheckCircle2 aria-hidden="true" className="h-[17px] w-[17px]" />
        </span>
        <div className="min-w-0">
          <p className={TIPOGRAFIA.textoForte}>{rotulo}</p>
          <p className={`truncate ${TIPOGRAFIA.textoAuxiliar}`}>
            {caminhoSelecionado ? nomeDoArquivo(caminhoSelecionado) : "Nenhum arquivo selecionado"}
          </p>
        </div>
      </div>
      <BotaoArquivo accept=".xlsx" desabilitado={desabilitado} titulo={`Selecionar ${rotulo}`} onChange={aoEscolherArquivo}>
        <FolderOpen aria-hidden="true" className="h-4 w-4" />
        Selecionar arquivo
      </BotaoArquivo>
    </div>
  );
}
