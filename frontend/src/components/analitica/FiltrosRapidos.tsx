import Botao from "../ui/Botao";
import type { CampoDeFiltro } from "../../hooks/useDiarias";

interface Props {
  onMudarFiltro: (parcial: Partial<Record<CampoDeFiltro, string | undefined>>) => void;
}

/** `YYYY-MM-DD` a partir dos componentes **locais** da data — nunca
 * `toISOString()`, que converte para UTC e pode deslocar o dia perto da
 * meia-noite em fusos negativos (ex.: 23h de 03/08 em BRT já é 04/08 em
 * UTC). Mesma convenção de string já usada em todo o app (`date` do
 * Pydantic, `<input type="date">`, `lib/datas.ts`). */
function paraIso(data: Date): string {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

function somarDias(data: Date, dias: number): Date {
  const copia = new Date(data);
  copia.setDate(copia.getDate() + dias);
  return copia;
}

interface Atalho {
  rotulo: string;
  calcular: (hoje: Date) => { periodo_inicial: string; periodo_final: string };
}

// Definições exatamente como já aprovadas em
// `v2-arquitetura-funcional.md` § 3.2 — nenhuma regra nova inventada aqui.
const ATALHOS_DE_PERIODO: Atalho[] = [
  {
    rotulo: "Hoje",
    calcular: (hoje) => ({ periodo_inicial: paraIso(hoje), periodo_final: paraIso(hoje) }),
  },
  {
    rotulo: "Últimos 7 dias",
    calcular: (hoje) => ({ periodo_inicial: paraIso(somarDias(hoje, -7)), periodo_final: paraIso(hoje) }),
  },
  {
    rotulo: "Últimos 30 dias",
    calcular: (hoje) => ({ periodo_inicial: paraIso(somarDias(hoje, -30)), periodo_final: paraIso(hoje) }),
  },
  {
    rotulo: "Mês atual",
    calcular: (hoje) => ({
      periodo_inicial: paraIso(new Date(hoje.getFullYear(), hoje.getMonth(), 1)),
      periodo_final: paraIso(hoje),
    }),
  },
  {
    rotulo: "Mês anterior",
    calcular: (hoje) => ({
      periodo_inicial: paraIso(new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1)),
      // Dia 0 de um mês, no construtor de `Date`, é o último dia do mês
      // anterior — forma padrão de obter "último dia do mês anterior" sem
      // calcular manualmente quantos dias o mês tem.
      periodo_final: paraIso(new Date(hoje.getFullYear(), hoje.getMonth(), 0)),
    }),
  },
  {
    rotulo: "Ano inteiro",
    calcular: (hoje) => ({
      periodo_inicial: paraIso(new Date(hoje.getFullYear(), 0, 1)),
      periodo_final: paraIso(new Date(hoje.getFullYear(), 11, 31)),
    }),
  },
];

// "Aguardando liberação" (9º atalho listado em `v2-arquitetura-funcional.md`
// § 3.2) foi deliberadamente deixado fora desta lista — não faz parte do
// escopo literal da Sprint 19.5.6 (`v2-plano-tecnico.md` § 18), que define
// exatamente estes 8 atalhos. Não antecipado aqui.

// "Registros incompletos"/"Possível inconsistência" — decisão de produto
// 2026-08-06 (`docs/central-analitica/v2-arquitetura-funcional.md` § 3.2,
// bloco "Decisão de produto — controles retirados da interface"): os dois
// atalhos que existiam aqui, sempre desabilitados,
// dependiam de uma decisão do DIMCAC ainda pendente (perguntas 5/6,
// `v2-arquitetura-funcional.md` § 14) — o responsável pelo produto decidiu
// que um controle permanentemente desabilitado não deve ficar exposto na
// tela de produção, mesmo documentado como planejado; a exposição
// antecipada foi removida até a regra de negócio ser homologada. O
// planejamento original (critério "nunca escondidos") permanece registrado
// só nos documentos históricos, nunca revertido silenciosamente aqui.

export default function FiltrosRapidos({ onMudarFiltro }: Props) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Filtros rápidos">
      {ATALHOS_DE_PERIODO.map((atalho) => (
        <Botao key={atalho.rotulo} variante="secundaria" onClick={() => onMudarFiltro(atalho.calcular(new Date()))}>
          {atalho.rotulo}
        </Botao>
      ))}
    </div>
  );
}
