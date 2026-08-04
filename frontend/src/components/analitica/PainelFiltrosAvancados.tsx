import { ChevronDown, ChevronUp, SlidersHorizontal } from "lucide-react";
import { type ChangeEvent, useEffect, useRef, useState } from "react";
import Alerta from "../ui/Alerta";
import Botao from "../ui/Botao";
import Campo from "../ui/Campo";
import { FOCO_ANEL, SUPERFICIE_BASE } from "../../theme/estilos";
import { TIPOGRAFIA } from "../../theme/tipografia";
import type { OpcoesFiltroResposta, ParametrosPesquisaDiariasQuery } from "../../types/analitica";
import type { CampoDeFiltro } from "../../hooks/useDiarias";

interface Props {
  filtros: ParametrosPesquisaDiariasQuery;
  opcoes: OpcoesFiltroResposta | null;
  /** Sprint 18.5.1 — correção NC2 da auditoria: antes `AbaPesquisa`
   * descartava `erro`/`tentarNovamente` de `useOpcoesFiltro`, então uma
   * falha em `GET /opcoes-filtro` nunca chegava à tela. */
  erroOpcoes: string | null;
  onTentarNovamenteOpcoes: () => void;
  onMudarFiltro: (parcial: Partial<Record<CampoDeFiltro, string | undefined>>) => void;
}

const ATRASO_DEBOUNCE_MS = 400;

/** Campo de texto livre com *debounce* (`ui-plano-tecnico.md` § 6: SEI,
 * CPF, servidor, matrícula — para não disparar uma requisição por tecla).
 * Mantém um valor local para digitação fluida e sincroniza de volta com o
 * valor externo quando ele muda por outra via (ex.: remover o chip). */
function useCampoTextoComDebounce(
  valorExterno: string | null | undefined,
  aoMudar: (valor: string | undefined) => void,
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
      aoMudar(valorLocal.trim() || undefined);
    }, ATRASO_DEBOUNCE_MS);
    return () => clearTimeout(temporizador);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valorLocal]);

  return [valorLocal, setValorLocal] as const;
}

function CampoSelecao({
  rotulo,
  valor,
  opcoes,
  onMudar,
}: {
  rotulo: string;
  valor: string;
  opcoes: string[];
  onMudar: (valor: string) => void;
}) {
  const id = `filtro-${rotulo.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <div>
      <label htmlFor={id} className={`mb-1.5 block ${TIPOGRAFIA.legenda}`}>
        {rotulo}
      </label>
      <select
        id={id}
        value={valor}
        onChange={(evento) => onMudar(evento.target.value)}
        className={`w-full rounded-lg border border-white/[0.12] bg-white/[0.03] px-3.5 py-2.5 text-sm text-slate-200 transition disabled:cursor-not-allowed disabled:opacity-40 ${FOCO_ANEL}`}
      >
        <option value="">Todos</option>
        {opcoes.map((opcao) => (
          <option key={opcao} value={opcao}>
            {opcao}
          </option>
        ))}
      </select>
    </div>
  );
}

// Sprint 18.5 — colapsado por padrão (herdado da UX). Cada mudança de campo
// atualiza `useDiarias` e dispara nova busca imediatamente (sem botão
// "Aplicar"), com debounce nos 4 campos de texto livre. Município/motivo/
// situação são `<select>` alimentados por `useOpcoesFiltro` — nunca texto
// livre, já que são listas fechadas de valores possíveis
// (`ui-plano-tecnico.md` § 6; resolve uma inconsistência do próprio
// documento, que também listava "município" entre os campos com debounce
// — um `<select>` não dispara por tecla, então debounce não se aplica a
// ele de qualquer forma).
export default function PainelFiltrosAvancados({
  filtros,
  opcoes,
  erroOpcoes,
  onTentarNovamenteOpcoes,
  onMudarFiltro,
}: Props) {
  const [aberto, setAberto] = useState(false);

  const [sei, setSei] = useCampoTextoComDebounce(filtros.sei, (valor) => onMudarFiltro({ sei: valor }));
  const [cpf, setCpf] = useCampoTextoComDebounce(filtros.cpf, (valor) => onMudarFiltro({ cpf: valor }));
  const [servidorNome, setServidorNome] = useCampoTextoComDebounce(filtros.servidor_nome, (valor) =>
    onMudarFiltro({ servidor_nome: valor }),
  );
  const [servidorMatricula, setServidorMatricula] = useCampoTextoComDebounce(
    filtros.servidor_matricula,
    (valor) => onMudarFiltro({ servidor_matricula: valor }),
  );
  // Sprint 19.5.3 — isolados de `municipio` (que casa origem OU destino);
  // mesmo padrão de debounce dos demais campos de texto livre acima.
  const [origem, setOrigem] = useCampoTextoComDebounce(filtros.origem, (valor) =>
    onMudarFiltro({ origem: valor }),
  );
  const [destino, setDestino] = useCampoTextoComDebounce(filtros.destino, (valor) =>
    onMudarFiltro({ destino: valor }),
  );
  const [trecho, setTrecho] = useCampoTextoComDebounce(filtros.trecho, (valor) =>
    onMudarFiltro({ trecho: valor }),
  );

  // Sprint 13.1 já validou esse mesmo critério client-side em
  // `FormularioConferencia` — reaproveitado aqui para nunca enviar ao
  // backend uma combinação que ele já sabe recusar (422,
  // `ParametrosPesquisaDiariasQuery._periodo_valido`).
  //
  // Sprint 18.5.1 — correção B4 da auditoria: os dois campos de período são
  // aplicados **sempre juntos** (`aplicarPeriodoSeValido`), nunca um de
  // cada vez. Antes, aplicar só o campo que acabou de mudar podia deixar o
  // outro "preso" num valor nunca propagado a `useDiarias` (rejeitado
  // enquanto o par era inválido) — corrigir o campo que causou o problema
  // fazia o alerta sumir sem o par completo ter sido de fato aplicado,
  // divergindo do que a tela mostrava. Agora: enquanto o par for inválido,
  // nenhum dos dois é aplicado (mesmo comportamento de antes); assim que
  // volta a ser válido, os dois valores atuais são aplicados juntos — os
  // campos visíveis e o filtro realmente usado na busca nunca divergem
  // fora da janela transitória em que o alerta está visível.
  const [periodoInicial, setPeriodoInicial] = useState(filtros.periodo_inicial ?? "");
  const [periodoFinal, setPeriodoFinal] = useState(filtros.periodo_final ?? "");
  useEffect(() => setPeriodoInicial(filtros.periodo_inicial ?? ""), [filtros.periodo_inicial]);
  useEffect(() => setPeriodoFinal(filtros.periodo_final ?? ""), [filtros.periodo_final]);
  const periodoInvalido = !!periodoInicial && !!periodoFinal && periodoFinal < periodoInicial;

  function aplicarPeriodoSeValido(inicial: string, final: string) {
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

  // Sprint 19.5.3 — mesmo padrão de "aplicar par só quando válido" já
  // usado para período (`aplicarPeriodoSeValido`), aplicado aqui a
  // valor mínimo/máximo pela mesma razão: sem isso, digitar um mínimo
  // maior que o máximo já aplicado (ou vice-versa) enviaria uma
  // combinação que o backend rejeita (422,
  // `ParametrosPesquisaDiariasQuery._valor_valido`) sem dar ao usuário
  // um retorno inline — mesma classe de problema já corrigida para
  // período na Sprint 18.5.1 (correção B4).
  const [valorMinimo, setValorMinimo] = useState(filtros.valor_minimo ?? "");
  const [valorMaximo, setValorMaximo] = useState(filtros.valor_maximo ?? "");
  useEffect(() => setValorMinimo(filtros.valor_minimo ?? ""), [filtros.valor_minimo]);
  useEffect(() => setValorMaximo(filtros.valor_maximo ?? ""), [filtros.valor_maximo]);
  const valorInvalido = !!valorMinimo && !!valorMaximo && Number(valorMaximo) < Number(valorMinimo);

  function aplicarValorSeValido(minimo: string, maximo: string) {
    const invalido = !!minimo && !!maximo && Number(maximo) < Number(minimo);
    if (!invalido) {
      onMudarFiltro({ valor_minimo: minimo || undefined, valor_maximo: maximo || undefined });
    }
  }

  function mudarValorMinimo(valor: string) {
    setValorMinimo(valor);
    aplicarValorSeValido(valor, valorMaximo);
  }

  function mudarValorMaximo(valor: string) {
    setValorMaximo(valor);
    aplicarValorSeValido(valorMinimo, valor);
  }

  return (
    <div className={SUPERFICIE_BASE}>
      <button
        type="button"
        onClick={() => setAberto((atual) => !atual)}
        aria-expanded={aberto}
        aria-controls="painel-filtros-avancados-conteudo"
        className={`flex w-full items-center gap-2 px-4 py-3 text-sm font-semibold text-slate-200 ${FOCO_ANEL}`}
      >
        <SlidersHorizontal aria-hidden="true" className="h-4 w-4" />
        Filtros
        {aberto ? (
          <ChevronUp aria-hidden="true" className="h-4 w-4" />
        ) : (
          <ChevronDown aria-hidden="true" className="h-4 w-4" />
        )}
      </button>

      {aberto && (
        <div
          id="painel-filtros-avancados-conteudo"
          className="grid grid-cols-1 gap-4 border-t border-white/10 p-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {erroOpcoes && (
            <div className="sm:col-span-2 lg:col-span-3">
              <div className="flex items-center justify-between gap-4">
                <Alerta variante="erro">{erroOpcoes}</Alerta>
                <Botao variante="secundaria" onClick={onTentarNovamenteOpcoes}>
                  Tentar novamente
                </Botao>
              </div>
            </div>
          )}

          {/* Campos de texto livre nunca dependem de `opcoes` — continuam
              usáveis mesmo quando `GET /opcoes-filtro` falhou. */}
          <Campo
            rotulo="SEI"
            value={sei}
            onChange={(evento: ChangeEvent<HTMLInputElement>) => setSei(evento.target.value)}
          />
          <Campo
            rotulo="CPF"
            value={cpf}
            onChange={(evento: ChangeEvent<HTMLInputElement>) => setCpf(evento.target.value)}
          />
          <Campo
            rotulo="Nome do servidor"
            value={servidorNome}
            onChange={(evento: ChangeEvent<HTMLInputElement>) => setServidorNome(evento.target.value)}
          />
          <Campo
            rotulo="Matrícula"
            value={servidorMatricula}
            onChange={(evento: ChangeEvent<HTMLInputElement>) => setServidorMatricula(evento.target.value)}
          />
          <Campo
            rotulo="Origem"
            value={origem}
            onChange={(evento: ChangeEvent<HTMLInputElement>) => setOrigem(evento.target.value)}
          />
          <Campo
            rotulo="Destino"
            value={destino}
            onChange={(evento: ChangeEvent<HTMLInputElement>) => setDestino(evento.target.value)}
          />
          <Campo
            rotulo="Trecho"
            value={trecho}
            onChange={(evento: ChangeEvent<HTMLInputElement>) => setTrecho(evento.target.value)}
          />
          <CampoSelecao
            rotulo="Município"
            valor={filtros.municipio ?? ""}
            opcoes={opcoes?.municipios ?? []}
            onMudar={(valor) => onMudarFiltro({ municipio: valor || undefined })}
          />
          <CampoSelecao
            rotulo="Motivo"
            valor={filtros.motivo ?? ""}
            opcoes={opcoes?.motivos ?? []}
            onMudar={(valor) => onMudarFiltro({ motivo: valor || undefined })}
          />
          <CampoSelecao
            rotulo="Situação"
            valor={filtros.situacao ?? ""}
            opcoes={opcoes?.situacoes ?? []}
            onMudar={(valor) => onMudarFiltro({ situacao: valor || undefined })}
          />
          <Campo
            rotulo="Valor mínimo"
            type="number"
            value={valorMinimo}
            onChange={(evento: ChangeEvent<HTMLInputElement>) => mudarValorMinimo(evento.target.value)}
          />
          <Campo
            rotulo="Valor máximo"
            type="number"
            value={valorMaximo}
            onChange={(evento: ChangeEvent<HTMLInputElement>) => mudarValorMaximo(evento.target.value)}
          />

          {valorInvalido && (
            <div className="sm:col-span-2 lg:col-span-3">
              <Alerta variante="erro">Valor máximo não pode ser menor que o valor mínimo.</Alerta>
            </div>
          )}

          <Campo
            rotulo="Período inicial"
            type="date"
            value={periodoInicial}
            onChange={(evento: ChangeEvent<HTMLInputElement>) => mudarPeriodoInicial(evento.target.value)}
          />
          <Campo
            rotulo="Período final"
            type="date"
            value={periodoFinal}
            onChange={(evento: ChangeEvent<HTMLInputElement>) => mudarPeriodoFinal(evento.target.value)}
          />

          {periodoInvalido && (
            <div className="sm:col-span-2 lg:col-span-3">
              <Alerta variante="erro">Período final não pode ser anterior ao período inicial.</Alerta>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
