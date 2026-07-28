import { Search } from "lucide-react";
import type { ChangeEvent } from "react";
import Alerta from "../ui/Alerta";
import Botao from "../ui/Botao";
import Campo from "../ui/Campo";
import { SUPERFICIE_BASE } from "../../theme/estilos";

interface Props {
  cpf: string;
  periodoInicial: string;
  periodoFinal: string;
  desabilitado: boolean;
  carregando: boolean;
  onMudarCpf: (valor: string) => void;
  onMudarPeriodoInicial: (valor: string) => void;
  onMudarPeriodoFinal: (valor: string) => void;
  onSubmit: () => void;
}

// Sprint 13 — Etapa 1 do fluxo aprovado na Sprint 12: só os 3 campos
// indispensáveis para o diagnóstico (RN-02 — CPF + período inicial + final
// é a própria chave de duplicidade). Nenhum campo do e-Fisco aparece aqui.
export default function FormularioConferencia({
  cpf,
  periodoInicial,
  periodoFinal,
  desabilitado,
  carregando,
  onMudarCpf,
  onMudarPeriodoInicial,
  onMudarPeriodoFinal,
  onSubmit,
}: Props) {
  // Sprint 13.1 — mesma regra já validada pelo backend
  // (`RequisicaoConferencia._periodo_valido`, HTTP 422 caso viole). Barrada
  // aqui também para o servidor nunca precisar de uma viagem de rede só
  // para descobrir que inverteu as duas datas.
  const periodoInvalido = !!periodoInicial && !!periodoFinal && periodoFinal < periodoInicial;
  const podeConferir =
    cpf.trim().length > 0 && !!periodoInicial && !!periodoFinal && !periodoInvalido && !desabilitado;

  return (
    <div className={`${SUPERFICIE_BASE} p-6`}>
      <div className="space-y-4">
        <Campo
          rotulo="CPF do servidor"
          placeholder="000.000.000-00"
          value={cpf}
          disabled={desabilitado}
          onChange={(evento: ChangeEvent<HTMLInputElement>) => onMudarCpf(evento.target.value)}
        />
        <div className="grid grid-cols-2 gap-3">
          <Campo
            rotulo="Período inicial"
            type="date"
            value={periodoInicial}
            disabled={desabilitado}
            onChange={(evento: ChangeEvent<HTMLInputElement>) => onMudarPeriodoInicial(evento.target.value)}
          />
          <Campo
            rotulo="Período final"
            type="date"
            value={periodoFinal}
            disabled={desabilitado}
            onChange={(evento: ChangeEvent<HTMLInputElement>) => onMudarPeriodoFinal(evento.target.value)}
          />
        </div>
        {periodoInvalido && (
          <Alerta variante="erro">Período final não pode ser anterior ao período inicial.</Alerta>
        )}
        <Botao variante="primaria" onClick={onSubmit} disabled={!podeConferir} carregando={carregando}>
          {!carregando && <Search aria-hidden="true" className="h-4 w-4" />}
          {carregando ? "Conferindo..." : "Realizar Conferência"}
        </Botao>
      </div>
    </div>
  );
}
