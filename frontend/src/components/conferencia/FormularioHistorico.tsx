import { Copy, FileText } from "lucide-react";
import { useState, type ChangeEvent } from "react";
import Alerta from "../ui/Alerta";
import Botao from "../ui/Botao";
import Campo from "../ui/Campo";
import { SUPERFICIE_BASE } from "../../theme/estilos";
import { TIPOGRAFIA } from "../../theme/tipografia";

interface Props {
  sei: string;
  origem: string;
  destino: string;
  carregando: boolean;
  historico: string | null;
  erro: string | null;
  onMudarSei: (valor: string) => void;
  onMudarOrigem: (valor: string) => void;
  onMudarDestino: (valor: string) => void;
  onGerar: () => void;
}

// Sprint 13 — Etapa 2, só renderizada pela página quando o veredito é
// APTO_PARA_PROCESSAMENTO (nunca antes disso). RN-12: o campo SEI trafega
// como texto livre, sem nenhuma máscara ou normalização nesta tela.
export default function FormularioHistorico({
  sei,
  origem,
  destino,
  carregando,
  historico,
  erro,
  onMudarSei,
  onMudarOrigem,
  onMudarDestino,
  onGerar,
}: Props) {
  const [copiado, setCopiado] = useState(false);

  // Sprint 13.1 — mesma regra já validada pelo backend
  // (`RequisicaoHistorico._validar`, HTTP 422 caso viole, `casefold()` para
  // a comparação). Barrada aqui também para o servidor nunca precisar de
  // uma viagem de rede só para descobrir que repetiu a mesma cidade.
  const origemIgualDestino =
    !!origem.trim() && !!destino.trim() && origem.trim().toLowerCase() === destino.trim().toLowerCase();

  async function copiar() {
    if (!historico) return;
    try {
      await window.api.copiarHistorico(historico);
    } catch {
      // O texto continua visível na tela para seleção manual mesmo se a
      // cópia nativa falhar — nunca bloqueia o servidor.
    }
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2400);
  }

  if (historico) {
    return (
      <div className={`${SUPERFICIE_BASE} p-6`}>
        <h3 className={TIPOGRAFIA.subtitulo}>Histórico para o e-Fisco</h3>
        <p className={`mt-3 rounded-lg border border-white/10 bg-white/[0.03] p-4 leading-relaxed ${TIPOGRAFIA.texto}`}>
          {historico}
        </p>
        <div className="mt-4">
          <Botao variante="primaria" onClick={copiar}>
            <Copy aria-hidden="true" className="h-4 w-4" />
            Copiar Histórico
          </Botao>
        </div>
        {copiado && (
          <p className="mt-3 text-xs font-medium text-emerald-400">
            ✓ Copiado — cole diretamente no e-Fisco
          </p>
        )}
      </div>
    );
  }

  return (
    <div className={`${SUPERFICIE_BASE} p-6`}>
      <h3 className={TIPOGRAFIA.subtitulo}>Gerar Histórico para o e-Fisco</h3>
      <p className={`mt-1.5 ${TIPOGRAFIA.textoAuxiliar}`}>Só o que ainda não existe na planilha oficial.</p>

      <div className="mt-4 space-y-4">
        <Campo
          rotulo="Número do SEI"
          placeholder="00.00.0000.0000000/2026-00"
          value={sei}
          onChange={(evento: ChangeEvent<HTMLInputElement>) => onMudarSei(evento.target.value)}
        />
        <div className="grid grid-cols-2 gap-3">
          <Campo
            rotulo="Origem"
            value={origem}
            onChange={(evento: ChangeEvent<HTMLInputElement>) => onMudarOrigem(evento.target.value)}
          />
          <Campo
            rotulo="Destino"
            value={destino}
            onChange={(evento: ChangeEvent<HTMLInputElement>) => onMudarDestino(evento.target.value)}
          />
        </div>
        {origemIgualDestino && (
          <Alerta variante="erro">Origem e destino não podem ser iguais.</Alerta>
        )}
        <Botao
          variante="primaria"
          onClick={onGerar}
          disabled={!sei.trim() || !origem.trim() || !destino.trim() || origemIgualDestino}
          carregando={carregando}
        >
          {!carregando && <FileText aria-hidden="true" className="h-4 w-4" />}
          {carregando ? "Gerando..." : "Gerar Histórico"}
        </Botao>

        {erro && <Alerta variante="erro">{erro}</Alerta>}
      </div>
    </div>
  );
}
