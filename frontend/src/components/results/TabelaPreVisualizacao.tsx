import type { Processo } from "../../types/processamento";
import Badge from "../ui/Badge";
import { DESTAQUE_INSERCAO_MANUAL } from "../../theme/cores";
import { ALTURA_LISTA_ROLAVEL, SCROLL_FINO, SUPERFICIE_BASE } from "../../theme/estilos";

interface Props {
  processos: Processo[];
}

// Sprint 06 — mesma filosofia visual da fila de seleção (`FilaArquivos`):
// altura fixa e scroll próprio, para que o resto da tela permaneça visível
// mesmo com centenas de PDFs processados. `overflow-hidden` no cartão
// externo recorta a barra de scroll dentro do raio arredondado; o
// cabeçalho da tabela é `sticky` para continuar legível durante a rolagem.
export default function TabelaPreVisualizacao({ processos }: Props) {
  return (
    <div className={`overflow-hidden ${SUPERFICIE_BASE}`}>
      <div className={`overflow-auto ${ALTURA_LISTA_ROLAVEL} ${SCROLL_FINO}`}>
        <table className="w-full border-collapse text-left text-sm">
          <thead className="sticky top-0 z-10 border-b border-white/10 bg-[#0b1120]/95 text-xs font-semibold uppercase tracking-wider text-slate-300 backdrop-blur-sm">
            <tr>
              <th className="px-5 py-3.5">Arquivo</th>
              <th className="px-5 py-3.5">SEI</th>
              <th className="px-5 py-3.5">CPF</th>
              <th className="px-5 py-3.5">Período</th>
              <th className="px-5 py-3.5">Trecho</th>
              <th className="px-5 py-3.5">Status</th>
            </tr>
          </thead>
          <tbody>
            {processos.map((processo) => (
              <tr
                key={processo.id}
                className="border-t border-white/5 text-slate-300 transition-colors even:bg-white/[0.02] hover:bg-white/[0.05]"
              >
                <td className="max-w-xs truncate px-5 py-3.5" title={processo.arquivo_origem}>
                  {processo.arquivo_origem}
                </td>
                {processo.status === "sucesso" && processo.diaria ? (
                  <>
                    <td className="px-5 py-3.5">{processo.diaria.sei}</td>
                    <td className="px-5 py-3.5">{processo.diaria.cpf}</td>
                    <td className="px-5 py-3.5">
                      {processo.diaria.periodo_inicial} - {processo.diaria.periodo_final}
                    </td>
                    <td className="px-5 py-3.5">
                      {processo.diaria.cidade_origem} - {processo.diaria.cidade_destino}
                    </td>
                    <td className="px-5 py-3.5">
                      <Badge variante="sucesso">sucesso</Badge>
                    </td>
                  </>
                ) : (
                  <td className="px-5 py-3.5" colSpan={5}>
                    <span className={DESTAQUE_INSERCAO_MANUAL}>Necessita inserção manual</span>
                    <p className="mt-0.5 text-red-400">
                      {processo.erro?.motivos.join("; ") ?? "Não foi possível processar este documento."}
                    </p>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
