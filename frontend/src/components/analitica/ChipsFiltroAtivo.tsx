import { X } from "lucide-react";
import Badge from "../ui/Badge";
import Botao from "../ui/Botao";
import { formatarDataBr } from "../../lib/datas";
import { mascararCpf } from "../../lib/mascararCpf";
import type { ParametrosPesquisaDiariasQuery } from "../../types/analitica";
import { CAMPOS_DE_FILTRO, type CampoDeFiltro } from "../../hooks/useDiarias";

interface Props {
  filtros: ParametrosPesquisaDiariasQuery;
  onRemover: (campo: CampoDeFiltro) => void;
  /** Sprint 18.5.1 — correção NC1 da auditoria: botão único "Limpar
   * filtros", exigido por `ux-wireframes.md` Anexo B ("sempre ao lado dos
   * chips quando há pelo menos um filtro ativo") e herdado por
   * `ui-arquitetura.md` § 5, que nunca tinha sido implementado. */
  onLimparTudo: () => void;
}

const ROTULO_CAMPO: Record<CampoDeFiltro, string> = {
  q: "Busca",
  sei: "SEI",
  cpf: "CPF",
  servidor_nome: "Servidor",
  servidor_matricula: "Matrícula",
  municipio: "Município",
  motivo: "Motivo",
  situacao: "Situação",
  periodo_inicial: "A partir de",
  periodo_final: "Até",
  origem: "Origem",
  destino: "Destino",
  trecho: "Trecho",
  valor_minimo: "Valor mínimo",
  valor_maximo: "Valor máximo",
};

// Sprint 19.5.8.1 — correção do Bug 1 da Auditoria Técnica (19.5.8
// REPROVADA): o filtro `cpf` sempre guarda o CPF completo (necessário para
// a pesquisa real no backend, via "Ver histórico deste CPF" ou digitação
// manual) — só a *apresentação* do chip é mascarada aqui, reaproveitando
// `mascararCpf` já existente (mesma função/formato do Detalhamento), nunca
// uma segunda lógica de máscara. `filtros`/`onRemover` continuam operando
// sobre o valor real, sem nenhuma mudança.
function formatarValor(campo: CampoDeFiltro, valor: string): string {
  if (campo === "periodo_inicial" || campo === "periodo_final") return formatarDataBr(valor);
  if (campo === "cpf") return mascararCpf(valor);
  return valor;
}

// Sprint 18.5 — um `Badge` removível por filtro ativo (Anexo B da UX,
// herdado). Itera sobre os mesmos campos que decidem "vazio" vs. "sem
// resultados" em `useDiarias` (`CAMPOS_DE_FILTRO`) — nunca uma lista
// duplicada à mão, que divergiria se um filtro novo for adicionado depois.
export default function ChipsFiltroAtivo({ filtros, onRemover, onLimparTudo }: Props) {
  const filtrosAtivos = CAMPOS_DE_FILTRO.filter((campo) => {
    const valor = filtros[campo];
    return valor !== undefined && valor !== null && valor !== "";
  });

  if (filtrosAtivos.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="Filtros ativos">
      {filtrosAtivos.map((campo) => (
        <Badge key={campo} variante="neutro">
          <span className="inline-flex items-center gap-1.5">
            {ROTULO_CAMPO[campo]}: {formatarValor(campo, String(filtros[campo]))}
            <button
              type="button"
              aria-label={`Remover filtro ${ROTULO_CAMPO[campo]}`}
              onClick={() => onRemover(campo)}
              className="-mr-0.5 rounded-full p-0.5 hover:bg-white/10"
            >
              <X aria-hidden="true" className="h-3 w-3" />
            </button>
          </span>
        </Badge>
      ))}
      <Botao variante="link" onClick={onLimparTudo}>
        Limpar filtros
      </Botao>
    </div>
  );
}
