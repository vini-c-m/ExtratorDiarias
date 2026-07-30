import { X } from "lucide-react";
import { useState } from "react";
import { PAINEL_MODAL } from "../../theme/estilos";
import { TIPOGRAFIA } from "../../theme/tipografia";
import type { ConfiguracaoAtiva } from "../../types/configuracao";
import Botao from "../ui/Botao";
import FormularioConfiguracao from "./FormularioConfiguracao";
import ResumoConfiguracao from "./ResumoConfiguracao";

interface Props {
  onFechar: () => void;
  /** Sprint 15 — chamado depois que a nova planilha já foi validada e
   * persistida (§8), para quem abriu o modal atualizar seu próprio estado
   * (ex.: `SelecionarProcessar` refazendo a checagem antes de preencher). */
  aoConfigurar: (configuracao: ConfiguracaoAtiva) => void;
}

// Sprint 15 — "Alterar Planilha Oficial" (§8 do doc arquitetural): mesmo
// `FormularioConfiguracao` da Configuração Inicial, num modal — reutilizável
// a partir de Configurações e de dentro de Processamento (§10), sem
// duplicar nenhuma regra de validação.
export default function ModalAlterarPlanilhaOficial({ onFechar, aoConfigurar }: Props) {
  const [configuracaoRecente, setConfiguracaoRecente] = useState<ConfiguracaoAtiva | null>(null);

  function aoValidarComSucesso(configuracao: ConfiguracaoAtiva) {
    setConfiguracaoRecente(configuracao);
    aoConfigurar(configuracao);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-alterar-planilha-titulo"
        className={`w-full max-w-lg p-8 ${PAINEL_MODAL}`}
      >
        <div className="flex items-center justify-between gap-4">
          <h2 id="modal-alterar-planilha-titulo" className={TIPOGRAFIA.titulo}>
            Alterar Planilha Oficial
          </h2>
          <button
            type="button"
            aria-label="Fechar"
            onClick={onFechar}
            className="rounded-full p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-slate-200"
          >
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>

        <p className={`mt-2 ${TIPOGRAFIA.textoAuxiliar}`}>
          Selecione o arquivo .xlsx que passa a ser a planilha oficial desta instalação.
        </p>

        <div className="mt-6">
          {configuracaoRecente ? (
            <ResumoConfiguracao
              caminhoPlanilhaOficial={configuracaoRecente.caminho_planilha_oficial}
              configuradoEm={configuracaoRecente.configurado_em}
              planilhaAcessivel
            />
          ) : (
            <FormularioConfiguracao aoConfigurar={aoValidarComSucesso} />
          )}
        </div>

        <div className="mt-7 flex justify-end">
          <Botao variante="secundaria" onClick={onFechar}>
            Fechar
          </Botao>
        </div>
      </div>
    </div>
  );
}
