import { AlertTriangle, CheckCircle2, FolderOpen } from "lucide-react";
import { forwardRef, useImperativeHandle, useRef, type ChangeEvent } from "react";
import { TIPOGRAFIA } from "../../theme/tipografia";
import BotaoArquivo from "../ui/BotaoArquivo";

/** Sprint D.1 (P2, cobertura parcial E-Fisco) — API imperativa exposta via
 * `ref` para um pai abrir o diálogo nativo desta seleção sem duplicar
 * mecanismo (ver `BotaoArquivo.tsx`). */
export interface SeletorArquivoFonteHandle {
  abrirSeletor: () => void;
}

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
  /** Micro-sprint UX operacional (item 3) — `true` quando um caminho já foi
   * selecionado e persistido em uma sessão anterior, mas o arquivo não
   * existe mais no local indicado (movido/renomeado/excluído). Estado
   * distinto de "nunca selecionado": nunca falha silenciosamente nem
   * reaproveita um caminho morto — avisa e pede uma nova seleção. */
  indisponivel?: boolean;
  /** Sprint 1 (plano "Valor da Passagem no XLSX Oficial") — a Planilha de
   * Passagens é `.ods` (formato real recebido pelo setor), diferente de
   * Base OB/Controle DIMCAC (`.xlsx`) — por isso o filtro do seletor de
   * arquivo do sistema operacional passa a ser parametrizável por fonte,
   * em vez de fixo. */
  accept?: string;
}

// Reaproveita o mecanismo de seleção já existente no app (`BotaoArquivo` +
// `window.api.getPathForFile`, mesmo par usado pela fila de PDFs de
// Processamento) — nenhum diálogo nativo novo, nenhuma alteração em
// Electron. `accept` filtra o seletor do sistema operacional para o
// formato esperado de cada fonte (mesmo critério de
// `configuracao:selecionar-planilha`).
export default forwardRef<SeletorArquivoFonteHandle, Props>(function SeletorArquivoFonte(
  { rotulo, caminhoSelecionado, onSelecionar, desabilitado = false, indisponivel = false, accept = ".xlsx" }: Props,
  ref,
) {
  const inputRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => ({
    abrirSeletor: () => inputRef.current?.click(),
  }));

  function aoEscolherArquivo(evento: ChangeEvent<HTMLInputElement>) {
    const arquivo = evento.target.files?.[0];
    if (!arquivo) return;
    onSelecionar(window.api.getPathForFile(arquivo));
    // Permite selecionar o mesmo arquivo de novo (ex.: depois de substituir
    // o conteúdo na mesma pasta) — sem isso, o navegador não dispara
    // `onChange` para um caminho já escolhido antes.
    evento.target.value = "";
  }

  // Micro-sprint UX operacional (item 3) — já existiu uma seleção
  // persistida (esteja disponível agora ou não): o botão convida a
  // TROCAR, não a escolher pela primeira vez.
  const jaHouveSelecao = caminhoSelecionado !== null || indisponivel;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.02] px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <span
          className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[10px] ${
            indisponivel
              ? "bg-amber-500/10 text-amber-400"
              : caminhoSelecionado
                ? "bg-emerald-500/10 text-emerald-400"
                : "bg-white/5 text-slate-500"
          }`}
        >
          {indisponivel ? (
            <AlertTriangle aria-hidden="true" className="h-[17px] w-[17px]" />
          ) : (
            <CheckCircle2 aria-hidden="true" className="h-[17px] w-[17px]" />
          )}
        </span>
        <div className="min-w-0">
          <p className={TIPOGRAFIA.textoForte}>{rotulo}</p>
          <p className={`truncate ${TIPOGRAFIA.textoAuxiliar} ${indisponivel ? "text-amber-400" : ""}`}>
            {indisponivel
              ? "O arquivo salvo anteriormente não foi encontrado — selecione-o novamente."
              : caminhoSelecionado
                ? nomeDoArquivo(caminhoSelecionado)
                : "Nenhum arquivo selecionado"}
          </p>
        </div>
      </div>
      <BotaoArquivo
        ref={inputRef}
        accept={accept}
        desabilitado={desabilitado}
        titulo={`Selecionar ${rotulo}`}
        onChange={aoEscolherArquivo}
      >
        <FolderOpen aria-hidden="true" className="h-4 w-4" />
        {jaHouveSelecao ? "Alterar" : "Selecionar arquivo"}
      </BotaoArquivo>
    </div>
  );
});
