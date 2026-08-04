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

// "Registros incompletos"/"Possível inconsistência" — dependem de decisão
// ainda pendente do DIMCAC (perguntas 5/6, `v2-arquitetura-funcional.md`
// § 14) e do filtro sintético bloqueado na Sprint 19.5.4. Aparecem sempre
// desabilitados, nunca escondidos (critério de aceite explícito).
const ATALHOS_PENDENTES = ["Registros incompletos", "Possível inconsistência"];
const MOTIVO_PENDENTE =
  "Pendente de definição do DIMCAC — ver v2-arquitetura-funcional.md § 14, perguntas 5 e 6.";

/** Sprint 19.5.6.1 — achado da auditoria da 19.5.6: `title` sozinho não é
 * suficiente (suporte inconsistente entre leitores de tela, inexistente em
 * toque). Cada atalho pendente ganha um texto irmão `sr-only` (mesmo padrão
 * já usado em `TabelaDiarias`/`BotaoArquivo` — nenhuma classe nova),
 * associado ao botão via `aria-describedby`; `title` é mantido como
 * complemento visual para quem usa mouse, nunca como única via de acesso à
 * explicação. */
function idDescricaoPendente(rotulo: string): string {
  return `filtro-rapido-pendente-${rotulo.toLowerCase().replace(/\s+/g, "-")}`;
}

export default function FiltrosRapidos({ onMudarFiltro }: Props) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Filtros rápidos">
      {ATALHOS_DE_PERIODO.map((atalho) => (
        <Botao key={atalho.rotulo} variante="secundaria" onClick={() => onMudarFiltro(atalho.calcular(new Date()))}>
          {atalho.rotulo}
        </Botao>
      ))}
      {ATALHOS_PENDENTES.map((rotulo) => {
        const idDescricao = idDescricaoPendente(rotulo);
        return (
          <span key={rotulo}>
            <Botao variante="secundaria" disabled title={MOTIVO_PENDENTE} aria-describedby={idDescricao}>
              {rotulo}
            </Botao>
            <span id={idDescricao} className="sr-only">
              {MOTIVO_PENDENTE}
            </span>
          </span>
        );
      })}
    </div>
  );
}
