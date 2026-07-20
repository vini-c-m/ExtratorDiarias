import type { ItemResultado, LoteProcessamento, ResultadoPreenchimento } from "../../types/processamento";
import Badge from "../ui/Badge";
import { ALTURA_LISTA_ROLAVEL, SCROLL_FINO, SUPERFICIE_BASE } from "../../theme/estilos";
import type { VarianteStatus } from "../../theme/cores";

interface LinhaTabela {
  id: string;
  arquivo: string;
  sei: string;
  status: "Inserido" | "Duplicado no lote" | "Já existe na planilha" | "Erro";
  motivo: string;
  linha: string;
}

// Sprint 05.2 — os dois status de duplicidade compartilham a mesma cor
// semântica "aviso" (amarelo), já que ambos significam a mesma coisa para
// quem está lendo a tabela: essa diária não foi inserida por já existir em
// algum lugar (no lote atual ou na planilha).
const VARIANTE_STATUS: Record<LinhaTabela["status"], VarianteStatus> = {
  Inserido: "sucesso",
  "Duplicado no lote": "aviso",
  "Já existe na planilha": "aviso",
  Erro: "erro",
};

// O rótulo exibido para "Erro" é mais descritivo que a palavra sozinha —
// deixa explícito, no próprio badge, que aquele PDF precisa ser inserido à
// mão na planilha. `Badge` aplica o destaque vermelho/negrito/caixa-alta.
const ROTULO_STATUS: Record<LinhaTabela["status"], string> = {
  Inserido: "Inserido",
  "Duplicado no lote": "Duplicado no lote",
  "Já existe na planilha": "Já existe na planilha",
  Erro: "Necessita inserção manual",
};

function construirLinhasTabela(
  lote: LoteProcessamento,
  preenchimento: ResultadoPreenchimento,
): LinhaTabela[] {
  let indiceItem = 0;

  return lote.processos.map((processo) => {
    if (processo.status === "erro") {
      return {
        id: processo.id,
        arquivo: processo.arquivo_origem,
        sei: "—",
        status: "Erro",
        motivo: processo.erro?.motivos.join("; ") ?? "—",
        linha: "—",
      };
    }

    const item: ItemResultado | undefined = preenchimento.itens[indiceItem];
    indiceItem += 1;

    if (!item) {
      return {
        id: processo.id,
        arquivo: processo.arquivo_origem,
        sei: processo.diaria?.sei ?? "—",
        status: "Erro",
        motivo: "Não retornado pelo preenchimento",
        linha: "—",
      };
    }

    if (item.categoria === "inserido") {
      return {
        id: processo.id,
        arquivo: item.arquivo_origem,
        sei: item.sei,
        status: "Inserido",
        motivo: "—",
        linha: String(item.linha),
      };
    }

    if (item.categoria === "duplicado_no_lote") {
      return {
        id: processo.id,
        arquivo: item.arquivo_origem,
        sei: item.sei,
        status: "Duplicado no lote",
        motivo: "SEI repetido neste envio",
        linha: "—",
      };
    }

    return {
      id: processo.id,
      arquivo: item.arquivo_origem,
      sei: item.sei,
      status: "Já existe na planilha",
      motivo: `SEI já cadastrado na linha ${item.linha}`,
      linha: String(item.linha),
    };
  });
}

interface Props {
  lote: LoteProcessamento;
  preenchimento: ResultadoPreenchimento;
}

// Sprint 06 — mesma filosofia visual da fila de seleção e da pré-
// visualização: altura fixa e scroll próprio, para que os botões de ação
// (acima desta tabela, na tela de resultado) fiquem sempre próximos do
// usuário, mesmo com centenas de diárias preenchidas.
export default function TabelaResultado({ lote, preenchimento }: Props) {
  const linhas = construirLinhasTabela(lote, preenchimento);

  return (
    <div className={`overflow-hidden ${SUPERFICIE_BASE}`}>
      <div className={`overflow-auto ${ALTURA_LISTA_ROLAVEL} ${SCROLL_FINO}`}>
        <table className="w-full border-collapse text-left text-sm">
          <thead className="sticky top-0 z-10 border-b border-white/10 bg-[#0b1120]/95 text-xs font-semibold uppercase tracking-wider text-slate-300 backdrop-blur-sm">
            <tr>
              <th className="px-5 py-3.5">Arquivo</th>
              <th className="px-5 py-3.5">SEI</th>
              <th className="px-5 py-3.5">Status</th>
              <th className="px-5 py-3.5">Motivo</th>
              <th className="px-5 py-3.5">Linha</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((linha) => (
              <tr
                key={linha.id}
                className="border-t border-white/5 text-slate-300 transition-colors even:bg-white/[0.02] hover:bg-white/[0.05]"
              >
                <td className="max-w-xs truncate px-5 py-3.5" title={linha.arquivo}>
                  {linha.arquivo}
                </td>
                <td className="px-5 py-3.5">{linha.sei}</td>
                <td className="px-5 py-3.5">
                  <Badge variante={VARIANTE_STATUS[linha.status]} destaque={linha.status === "Erro"}>
                    {ROTULO_STATUS[linha.status]}
                  </Badge>
                </td>
                <td className="px-5 py-3.5 text-slate-400">{linha.motivo}</td>
                <td className="px-5 py-3.5">{linha.linha}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
