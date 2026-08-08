import { ChevronDown, ChevronUp, Settings } from "lucide-react";
import { useState } from "react";
import { COLUNAS_OPCIONAIS_DISPONIVEIS, type ColunaOpcional } from "../../hooks/useColunasTabela";
import { FOCO_ANEL, SUPERFICIE_BASE } from "../../theme/estilos";
import { TIPOGRAFIA } from "../../theme/tipografia";

interface Props {
  colunasAtivas: Set<ColunaOpcional>;
  onAlternarColuna: (coluna: ColunaOpcional) => void;
}

const ROTULO_COLUNA_OPCIONAL: Record<ColunaOpcional, string> = {
  motivo: "Motivo",
  matricula: "Matrícula",
  origem: "Origem",
  trecho: "Trecho completo",
  situacao: "Situação do servidor",
  cpf: "CPF (mascarado)",
  doc_origem: "Documento de origem",
  transporte: "Transporte",
  categoria_funcional: "Categoria (Membro/Servidor)",
};

// Sprint 19.5.7 — popover de configuração de colunas
// (`v2-wireframes.md` § 3.4). Mesmo padrão de expandir/colapsar já usado em
// `PainelFiltrosAvancados` (`aria-expanded`/`aria-controls`, sem detecção de
// clique fora — nenhum componente deste projeto usa esse padrão ainda, não
// introduzido aqui). Cada checkbox aplica na hora, sem botão "Aplicar": não
// há chamada de rede envolvida (`v2-plano-tecnico.md` § 18, critério de
// aceite), e as demais seleções instantâneas do painel de filtros
// (Município/Motivo/Situação) já seguem esse mesmo critério.
export default function ConfiguracaoColunas({ colunasAtivas, onAlternarColuna }: Props) {
  const [aberto, setAberto] = useState(false);

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setAberto((atual) => !atual)}
        aria-expanded={aberto}
        aria-controls="configuracao-colunas-conteudo"
        className={`inline-flex items-center gap-1.5 rounded-lg border border-white/[0.12] bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-white/[0.06] ${FOCO_ANEL}`}
      >
        <Settings aria-hidden="true" className="h-3.5 w-3.5" />
        Colunas
        {aberto ? (
          <ChevronUp aria-hidden="true" className="h-3.5 w-3.5" />
        ) : (
          <ChevronDown aria-hidden="true" className="h-3.5 w-3.5" />
        )}
      </button>

      {aberto && (
        <div
          id="configuracao-colunas-conteudo"
          className={`absolute right-0 top-full z-20 mt-2 w-64 p-4 ${SUPERFICIE_BASE}`}
        >
          <p className={`mb-1.5 ${TIPOGRAFIA.legenda}`}>Sempre visíveis</p>
          <p className={`mb-4 ${TIPOGRAFIA.textoAuxiliar}`}>SEI, Servidor, Período, Destino, Valor</p>

          <p className={`mb-1.5 ${TIPOGRAFIA.legenda}`}>Opcionais</p>
          <div className="space-y-2">
            {COLUNAS_OPCIONAIS_DISPONIVEIS.map((coluna) => {
              const id = `coluna-opcional-${coluna}`;
              return (
                <label key={coluna} htmlFor={id} className="flex items-center gap-2 text-sm text-slate-200">
                  <input
                    id={id}
                    type="checkbox"
                    checked={colunasAtivas.has(coluna)}
                    onChange={() => onAlternarColuna(coluna)}
                    className={`h-4 w-4 rounded border-white/20 bg-white/5 ${FOCO_ANEL}`}
                  />
                  {ROTULO_COLUNA_OPCIONAL[coluna]}
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
