import { Copy, FileText } from "lucide-react";
import { useState, type ChangeEvent } from "react";
import Alerta from "../ui/Alerta";
import Botao from "../ui/Botao";
import Campo from "../ui/Campo";
import { SUPERFICIE_BASE } from "../../theme/estilos";
import { TIPOGRAFIA } from "../../theme/tipografia";

interface Props {
  sei: string;
  destino: string;
  carregando: boolean;
  historico: string | null;
  erro: string | null;
  onMudarSei: (valor: string) => void;
  onMudarDestino: (valor: string) => void;
  onGerar: () => void;
  // RN-14 — modo Complemento reaproveita este componente com títulos
  // próprios ("GERAR HISTÓRICO DE COMPLEMENTO"), sem duplicar o formulário.
  titulo?: string;
  tituloResultado?: string;
}

// Sprint 13 — Etapa 2, só renderizada pela página quando o veredito é
// APTO_PARA_PROCESSAMENTO (nunca antes disso). RN-12: o campo SEI trafega
// como texto livre, sem nenhuma máscara ou normalização nesta tela.
// Correção de 2026-08-05: Origem deixou de ser pedida — o histórico do
// e-Fisco usa apenas o destino.
export default function FormularioHistorico({
  sei,
  destino,
  carregando,
  historico,
  erro,
  onMudarSei,
  onMudarDestino,
  onGerar,
  titulo = "Gerar Histórico para o e-Fisco",
  tituloResultado = "Histórico para o e-Fisco",
}: Props) {
  const [copiado, setCopiado] = useState(false);

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
        <h3 className={TIPOGRAFIA.subtitulo}>{tituloResultado}</h3>
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
      <h3 className={TIPOGRAFIA.subtitulo}>{titulo}</h3>
      <p className={`mt-1.5 ${TIPOGRAFIA.textoAuxiliar}`}>Só o que ainda não existe na planilha oficial.</p>

      <div className="mt-4 space-y-4">
        <Campo
          rotulo="Número do SEI"
          placeholder="00.00.0000.0000000/2026-00"
          value={sei}
          onChange={(evento: ChangeEvent<HTMLInputElement>) => onMudarSei(evento.target.value)}
        />
        <Campo
          rotulo="Destino"
          value={destino}
          onChange={(evento: ChangeEvent<HTMLInputElement>) => onMudarDestino(evento.target.value)}
        />
        <Botao
          variante="primaria"
          onClick={onGerar}
          disabled={!sei.trim() || !destino.trim()}
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
