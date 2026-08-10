import { type ChangeEvent, useEffect, useRef, useState } from "react";
import Botao from "../ui/Botao";
import Campo from "../ui/Campo";
import type { CampoDeFiltro } from "../../hooks/useDiarias";
import type { ParametrosPesquisaDiariasQuery } from "../../types/analitica";

interface Props {
  filtros: ParametrosPesquisaDiariasQuery;
  onMudarFiltro: (parcial: Partial<Record<CampoDeFiltro, string | undefined>>) => void;
  onRemoverFiltro: (campo: CampoDeFiltro) => void;
}

const ATRASO_DEBOUNCE_MS = 400;

type GrupoFiltro = "sei" | "cpf" | "periodo" | null;

function grupoAtivo(filtros: ParametrosPesquisaDiariasQuery): GrupoFiltro {
  if (filtros.sei) return "sei";
  if (filtros.cpf) return "cpf";
  if (filtros.periodo_inicial || filtros.periodo_final) return "periodo";
  return null;
}

/** Mesma técnica de debounce já homologada (`PainelFiltrosAvancados`), com
 * um guard adicional: `bloqueado()` é consultado no momento em que o timer
 * dispara (nunca no momento em que foi digitado) — sem isso, digitar num
 * campo e depois digitar mais rápido em outro (antes do primeiro aplicar)
 * poderia aplicar os DOIS, violando "um grupo por vez" só por uma questão
 * de tempo de debounce, não de intenção do usuário. */
function useCampoTextoComDebounce(
  valorExterno: string | null | undefined,
  aoMudar: (valor: string | undefined) => void,
  bloqueado: () => boolean,
) {
  const [valorLocal, setValorLocal] = useState(valorExterno ?? "");
  const primeiraRenderizacao = useRef(true);

  useEffect(() => {
    setValorLocal(valorExterno ?? "");
  }, [valorExterno]);

  useEffect(() => {
    if (primeiraRenderizacao.current) {
      primeiraRenderizacao.current = false;
      return;
    }
    const temporizador = setTimeout(() => {
      if (bloqueado()) return;
      aoMudar(valorLocal.trim() || undefined);
    }, ATRASO_DEBOUNCE_MS);
    return () => clearTimeout(temporizador);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valorLocal]);

  return [valorLocal, setValorLocal] as const;
}

const ROTULO_GRUPO: Record<Exclude<GrupoFiltro, null>, string> = {
  sei: "SEI",
  cpf: "CPF",
  periodo: "Período",
};

/** MS UX — Simplificação da Central Analítica (2026-08-10): de 16 campos
 * (`FiltroCategoriaFuncional`/`FiltrosRapidos`/`PainelFiltrosAvancados`/
 * `ChipsFiltroAtivo`) para só os 4 realmente usados no dia a dia — SEI,
 * CPF, Período Inicial, Período Final. Nova regra de UX (item 3 do
 * pedido): só UM TIPO DE FILTRO ativo por vez, em 3 grupos — SEI, CPF,
 * PERÍODO (inicial+final contam como um único grupo, podem ser usados
 * juntos entre si). Escolher um grupo desabilita visualmente os outros
 * dois; "Limpar filtro" libera todos de novo. CPF nunca exige máscara —
 * o backend já normaliza dígitos antes de comparar
 * (`repositorio_analitico._cpf_normalizado`, `re.sub(r"\D", "", ...)`),
 * então este campo é texto livre puro, igual sempre foi. */
export default function PainelFiltrosPrincipal({ filtros, onMudarFiltro, onRemoverFiltro }: Props) {
  const grupo = grupoAtivo(filtros);
  const grupoRef = useRef(grupo);
  grupoRef.current = grupo;

  const [sei, setSei] = useCampoTextoComDebounce(
    filtros.sei,
    (valor) => onMudarFiltro({ sei: valor }),
    () => grupoRef.current !== null && grupoRef.current !== "sei",
  );
  const [cpf, setCpf] = useCampoTextoComDebounce(
    filtros.cpf,
    (valor) => onMudarFiltro({ cpf: valor }),
    () => grupoRef.current !== null && grupoRef.current !== "cpf",
  );

  const [periodoInicial, setPeriodoInicial] = useState(filtros.periodo_inicial ?? "");
  const [periodoFinal, setPeriodoFinal] = useState(filtros.periodo_final ?? "");
  useEffect(() => setPeriodoInicial(filtros.periodo_inicial ?? ""), [filtros.periodo_inicial]);
  useEffect(() => setPeriodoFinal(filtros.periodo_final ?? ""), [filtros.periodo_final]);
  const periodoInvalido = !!periodoInicial && !!periodoFinal && periodoFinal < periodoInicial;

  // Campo de texto (sem debounce) some do DOM assim que outro grupo vira
  // ativo — evita ficar com um valor digitado "preso" visualmente num
  // campo desabilitado (nenhum dado é perdido: nunca chegou a ser
  // aplicado, `onMudarFiltro` só é chamado pela função abaixo).
  useEffect(() => {
    if (grupo !== null && grupo !== "sei") setSei("");
  }, [grupo, setSei]);
  useEffect(() => {
    if (grupo !== null && grupo !== "cpf") {
      setCpf("");
    }
  }, [grupo, setCpf]);
  useEffect(() => {
    if (grupo !== null && grupo !== "periodo") {
      setPeriodoInicial("");
      setPeriodoFinal("");
    }
  }, [grupo]);

  function aplicarPeriodoSeValido(inicial: string, final: string) {
    if (grupoRef.current !== null && grupoRef.current !== "periodo") return;
    const invalido = !!inicial && !!final && final < inicial;
    if (!invalido) {
      onMudarFiltro({ periodo_inicial: inicial || undefined, periodo_final: final || undefined });
    }
  }

  function mudarPeriodoInicial(valor: string) {
    setPeriodoInicial(valor);
    aplicarPeriodoSeValido(valor, periodoFinal);
  }

  function mudarPeriodoFinal(valor: string) {
    setPeriodoFinal(valor);
    aplicarPeriodoSeValido(periodoInicial, valor);
  }

  function limparGrupoAtivo() {
    if (grupo === "sei") onRemoverFiltro("sei");
    else if (grupo === "cpf") onRemoverFiltro("cpf");
    else if (grupo === "periodo") {
      onRemoverFiltro("periodo_inicial");
      onRemoverFiltro("periodo_final");
    }
  }

  const seiBloqueado = grupo !== null && grupo !== "sei";
  const cpfBloqueado = grupo !== null && grupo !== "cpf";
  const periodoBloqueado = grupo !== null && grupo !== "periodo";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-40">
          <Campo
            rotulo="SEI"
            value={sei}
            disabled={seiBloqueado}
            onChange={(evento: ChangeEvent<HTMLInputElement>) => setSei(evento.target.value)}
          />
        </div>
        <div className="w-44">
          <Campo
            rotulo="CPF"
            value={cpf}
            disabled={cpfBloqueado}
            placeholder="Só números ou com pontuação"
            onChange={(evento: ChangeEvent<HTMLInputElement>) => setCpf(evento.target.value)}
          />
        </div>
        <div className="w-40">
          <Campo
            rotulo="Período inicial"
            type="date"
            value={periodoInicial}
            disabled={periodoBloqueado}
            onChange={(evento: ChangeEvent<HTMLInputElement>) => mudarPeriodoInicial(evento.target.value)}
          />
        </div>
        <div className="w-40">
          <Campo
            rotulo="Período final"
            type="date"
            value={periodoFinal}
            disabled={periodoBloqueado}
            onChange={(evento: ChangeEvent<HTMLInputElement>) => mudarPeriodoFinal(evento.target.value)}
          />
        </div>

        {grupo && (
          <Botao variante="link" onClick={limparGrupoAtivo}>
            Limpar filtro de {ROTULO_GRUPO[grupo]} ×
          </Botao>
        )}
      </div>

      {periodoInvalido && (
        <p className="text-sm text-red-400">Período final não pode ser anterior ao período inicial.</p>
      )}
    </div>
  );
}
