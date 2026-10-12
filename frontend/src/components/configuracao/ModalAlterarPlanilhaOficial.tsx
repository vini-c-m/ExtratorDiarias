import { X } from "lucide-react";
import { useState } from "react";
import { PAINEL_MODAL } from "../../theme/estilos";
import { TIPOGRAFIA } from "../../theme/tipografia";
import type { ConfiguracaoAtiva, EstadoConfiguracao } from "../../types/configuracao";
import Botao from "../ui/Botao";
import FormularioConfiguracao from "./FormularioConfiguracao";
import ResumoConfiguracao from "./ResumoConfiguracao";
import SecaoPastasOperacionais from "./SecaoPastasOperacionais";

interface Props {
  onFechar: () => void;
  /** Sprint 15 — chamado depois que a nova planilha já foi validada e
   * persistida (§8), para quem abriu o modal atualizar seu próprio estado
   * (ex.: `SelecionarProcessar` refazendo a checagem antes de preencher). */
  aoConfigurar: (configuracao: ConfiguracaoAtiva) => void;
  /** Organização Automática de PDFs — estado de configuração já conhecido
   * por quem abriu o modal, só para exibir/editar as Pastas Operacionais
   * (§ "Estender a configuração atual"). Omitido/`null`/ainda não
   * configurado: a seção de pastas simplesmente não aparece (planilha
   * oficial é pré-requisito, mesma regra do backend). */
  configuracaoAtual?: EstadoConfiguracao | null;
  /** Chamado depois que uma pasta operacional é salva com sucesso, para o
   * pai re-buscar o estado completo — mesmo padrão de `aoConfigurar`, mas
   * como o resultado pode ser `ConfiguracaoInacessivel` (pastas não
   * dependem da planilha estar acessível), fica separado em vez de tentar
   * encaixar no contrato mais estrito de `aoConfigurar`. */
  aoAtualizarPastas?: () => void;
}

// Sprint 15 — "Alterar Planilha Oficial" (§8 do doc arquitetural): mesmo
// `FormularioConfiguracao` da Configuração Inicial, num modal — reutilizável
// a partir de Configurações e de dentro de Processamento (§10), sem
// duplicar nenhuma regra de validação.
//
// Organização Automática de PDFs — seção aditiva `SecaoPastasOperacionais`,
// mostrada quando já existe uma planilha oficial configurada (recém-trocada
// nesta sessão do modal, ou já configurada antes) — nunca uma rota/página
// nova.
export default function ModalAlterarPlanilhaOficial({
  onFechar,
  aoConfigurar,
  configuracaoAtual,
  aoAtualizarPastas,
}: Props) {
  const [configuracaoRecente, setConfiguracaoRecente] = useState<ConfiguracaoAtiva | null>(null);

  function aoValidarComSucesso(configuracao: ConfiguracaoAtiva) {
    setConfiguracaoRecente(configuracao);
    aoConfigurar(configuracao);
  }

  const configuracaoParaPastas =
    configuracaoRecente ?? (configuracaoAtual?.configurado ? configuracaoAtual : null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-alterar-planilha-titulo"
        className={`flex max-h-[85vh] w-full max-w-lg flex-col p-8 ${PAINEL_MODAL}`}
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

        {/* Corpo rolável: header e rodapé (botão Fechar) ficam sempre
            visíveis mesmo quando a Seção de Pastas Operacionais adiciona
            conteúdo suficiente para exceder a altura do modal. */}
        <div className="mt-2 flex-1 overflow-y-auto">
          <p className={TIPOGRAFIA.textoAuxiliar}>
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

          {configuracaoParaPastas && (
            <div className="mt-6 border-t border-white/10 pt-6">
              <SecaoPastasOperacionais
                configuracao={configuracaoParaPastas}
                aoAtualizar={aoAtualizarPastas ?? (() => {})}
              />
            </div>
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
